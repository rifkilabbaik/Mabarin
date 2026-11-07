import { CONFIG } from '../config.js';
import { randomLook, sanitizeLook } from '../character/looks.js';
import { BALLS, RUN, BOARD, newBall, stepBall, advance, solveShot, kickVelocity, copyBall, pushBall } from './physics.js';
import { PK_SPOT, CARRY, CLAIM_R, attackDir, shotVelocity, passVelocity, pickPassTarget, pkOutcome, pkVelocity, pkDiveZ } from './football.js';

export { PK_SPOT };

const INVITE_MS = 30000;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const BOT_NAMES = ['Bot Rambutan', 'Bot Salak', 'Bot Durian', 'Bot Sawo'];
const BOT_COLORS = ['#ffa94d', '#b197fc', '#38d9a9', '#f783ac'];

export const FIELDS = CONFIG.sports.fields;
export const TEAM_SIDE = [-1, 1]; // tim 0 di sisi -x, tim 1 di sisi +x
export const TEAM_COLORS = ['#339af0', '#ff6b6b'];
export const TEAM_NAMES = ['Biru', 'Merah'];

export const SPORT_DEFS = {
  bola: {
    name: 'Sepak Bola', icon: 'ball', art: 'linear-gradient(135deg, #51cf66, #2b8a3e)',
    modes: [
      { id: '1v1', name: '1 lawan 1', size: 2 },
      { id: '2v2', name: '2 lawan 2', size: 4 },
      { id: 'pinalti', name: 'Adu penalti', size: 2 },
    ],
  },
  tenis: {
    name: 'Tenis', icon: 'tennis', art: 'linear-gradient(135deg, #4c6ef5, #37b24d)',
    modes: [
      { id: '1v1', name: '1 lawan 1', size: 2 },
      { id: '2v2', name: '2 lawan 2 (ganda)', size: 4 },
    ],
  },
  badminton: {
    name: 'Bulu Tangkis', icon: 'shuttle', art: 'linear-gradient(135deg, #20c997, #1971c2)',
    modes: [
      { id: '1v1', name: '1 lawan 1', size: 2 },
      { id: '2v2', name: '2 lawan 2 (ganda)', size: 4 },
    ],
  },
};

export const MATCH_MS = 180000; // sepak bola: 3 menit
export const GOALS_TO_WIN = 5;

// Lebar lapangan dalam (tunggal / ganda)
export function halfWidth(m) {
  const f = FIELDS[m.sport];
  if (m.sport === 'tenis') return m.mode === '2v2' ? f.W / 2 : f.W / 2 - 1.2;
  if (m.sport === 'badminton') return m.mode === '2v2' ? f.W / 2 : f.W / 2 - 0.5;
  return f.W / 2;
}

export function slotInTeam(m, idx) {
  const t = m.players[idx]?.team;
  let k = 0;
  for (let i = 0; i < idx; i++) if (m.players[i].team === t) k++;
  return k;
}

export function teamSize(m, team) {
  return m.players.filter((p) => p.team === team).length;
}

/** Posisi awal tiap pemain (koordinat lokal lapangan) — dihitung sama di semua klien. */
export function spawnFor(m, idx) {
  const p = m.players[idx];
  if (!p) return { x: 0, z: 0, rot: 0 };
  const t = p.team, s = TEAM_SIDE[t];
  const rot = -s * Math.PI / 2; // menghadap ke tengah
  const k = slotInTeam(m, idx);
  const n = teamSize(m, t);
  const f = FIELDS[m.sport];
  if (m.sport === 'bola') {
    if (m.mode === 'pinalti') {
      if (m.pk?.shooter === idx) return { x: PK_SPOT - 0.75, z: 0, rot: Math.PI / 2 };
      return { x: f.L / 2 - 0.45, z: 0, rot: -Math.PI / 2 };
    }
    // tim yang kick-off: pemain pertama berdiri di samping bola di titik tengah
    if (t === (m.kick ?? 0) && k === 0) return { x: s * 0.75, z: 0, rot };
    if (n > 1) return { x: s * (k === 0 ? 5 : 9), z: k === 0 ? 3.5 : -2.5, rot };
    return { x: s * 5, z: 0, rot };
  }
  const r = m.rally || { server: 0, pts: 0 };
  const zs = (r.pts % 2 === 0 ? 1 : -1) * -s; // sisi servis bergantian kanan/kiri
  const tenis = m.sport === 'tenis';
  const serverTeam = m.players[r.server]?.team ?? 0;
  if (idx === r.server) return { x: s * (tenis ? 10.6 : 2.6), z: zs * (tenis ? 1.6 : 0.9), rot };
  if (t === serverTeam) return { x: s * (tenis ? 4.2 : 4.8), z: -zs * (tenis ? 2.2 : 0.9), rot };
  if (k === 0) return { x: s * (tenis ? 9.6 : 3.0), z: -zs * (tenis ? 1.6 : 0.9), rot };
  return { x: s * (tenis ? 4.2 : 4.8), z: zs * (tenis ? 2.2 : 0.9), rot };
}

/** Titik sasaran pukulan raket dari arah bidikan (yaw kamera) & tenaga (0..1). */
export function racketTarget(m, team, ox, oz, yaw, c, serve) {
  const opp = -TEAM_SIDE[team];
  const tenis = m.sport === 'tenis';
  const depth = serve ? 1.5 + c * 6 : tenis ? 2 + c * 9.5 : 0.6 + c * 7.2;
  let dx = Math.sin(yaw), dz = Math.cos(yaw);
  // paksa ke arah lawan (maks. ±65° dari lurus)
  let a = Math.atan2(dz, Math.abs(dx)); // membidik ke belakang = dianggap lurus ke depan
  a = Math.max(-1.13, Math.min(1.13, a));
  dx = opp * Math.cos(a);
  dz = Math.sin(a);
  const tx = opp * depth;
  const t = Math.max(0.5, (tx - ox) / dx);
  return { tx, tz: oz + dz * t };
}

/** Rentang tenaga yang masih masuk (untuk penanda di meteran). */
export function chargeWindow(m, serve) {
  if (m.sport === 'bola') return [0, 0.9]; // lebih dari ini bola melambung
  if (m.sport === 'tenis') return serve ? [0, 0.75] : [0, 0.84];
  if (m.sport === 'badminton') return serve ? [0.09, 0.83] : [0, 0.82];
  return null;
}

export function shotAngles(sport, serve, high) {
  if (sport === 'tenis') return serve ? [-0.1, -0.05, 0, 0.05, 0.1, 0.16, 0.24] : [0.03, 0.08, 0.14, 0.21, 0.29, 0.38, 0.5];
  if (high) return [-0.45, -0.3, -0.15, 0, 0.2, 0.45, 0.7, 0.95];
  return serve ? [0.35, 0.6, 0.85, 1.05] : [0.25, 0.45, 0.65, 0.85, 1.05, 1.2];
}

export const REACH = { bola: 1.05, tenis: 1.55, badminton: 1.5 };

/**
 * Tuan rumah pertandingan olahraga (perangkat pembuat pertandingan).
 * Fisika bola, aturan, skor, bot. State pertandingan disiarkan lewat player state 'sp',
 * bola lewat 'sb' (unreliable, 20x/detik), bot lewat 'sbt'.
 */
export class SportHost {
  constructor({ sport, mode, me, publish, publishBall, publishBots, getPos }) {
    const def = SPORT_DEFS[sport];
    this.def = def;
    this.size = def.modes.find((x) => x.id === mode)?.size || 2;
    this.f = FIELDS[sport];
    this.P = BALLS[sport];
    this.publish = publish;
    this.publishBall = publishBall;
    this.publishBots = publishBots;
    this.getPos = getPos; // id -> {x,y,z,vx,vz} lokal lapangan (pemain manusia)
    this.ball = newBall();
    this.ball.y = this.P.r;
    this.held = -1;
    this.heldSince = 0;
    this.hitN = 0;
    this.live = false;
    this.timers = [];
    this.bots = new Map();
    this.lastTouch = new Map();
    this.noClaim = new Map();
    this.ballTimer = 0;
    this.botTimer = 0;
    this.sendBallNow = true;
    this.state = {
      id: `${me.id}-${Date.now().toString(36)}`,
      sport,
      mode,
      host: me.id,
      phase: 'lobby',
      v: 0,
      players: [{ id: me.id, name: me.name, color: me.color, look: me.look, team: 0 }],
      invited: [],
      score: [0, 0],
      left: 0,
      reset: 0,
      rally: null,
      pk: null,
      ev: { n: 0, k: 'open' },
    };
    this.onBallEvent = (k, v) => this.ballEvent(k, v);
    this.push();
  }

  push(ev) {
    const s = this.state;
    if (ev) s.ev = { ...ev, n: s.ev.n + 1 };
    s.v++;
    this.publish(s);
  }

  index(pid) {
    return this.state.players.findIndex((p) => p.id === pid);
  }

  later(ms, fn) {
    this.timers.push({ at: Date.now() + ms, fn });
  }

  // ---------- Lobi ----------
  freeTeam() {
    const half = this.size / 2;
    const a = teamSize(this.state, 0), b = teamSize(this.state, 1);
    if (a <= b && a < half) return 0;
    if (b < half) return 1;
    return a < half ? 0 : -1;
  }

  invite(ids) {
    const s = this.state;
    const until = Date.now() + INVITE_MS;
    for (const id of ids) {
      if (s.players.some((p) => p.id === id)) continue;
      s.invited = s.invited.filter((x) => x.id !== id);
      s.invited.push({ id, until });
    }
    this.push();
  }

  addBot() {
    const s = this.state;
    const team = this.freeTeam();
    if (s.phase !== 'lobby' || team < 0) return false;
    const used = new Set(s.players.map((p) => p.name));
    let i = BOT_NAMES.findIndex((n) => !used.has(n));
    if (i < 0) i = 0;
    s.players.push({ id: `bot:${Math.random().toString(36).slice(2, 8)}`, name: BOT_NAMES[i], color: BOT_COLORS[i], look: randomLook(), bot: true, team });
    this.push({ k: 'join', p: s.players[s.players.length - 1].id });
    return true;
  }

  switchTeam(pid) {
    const s = this.state;
    const p = s.players.find((x) => x.id === pid);
    if (!p || s.phase === 'play') return;
    const other = 1 - p.team;
    if (teamSize(s, other) >= this.size / 2) return;
    p.team = other;
    this.push();
  }

  handle(a, from) {
    if (!a || typeof a.a !== 'string') return;
    const s = this.state;
    switch (a.a) {
      case 'join': {
        if (s.phase !== 'lobby' || s.players.some((p) => p.id === from) || !s.invited.some((x) => x.id === from)) return;
        const team = this.freeTeam();
        if (team < 0) return;
        s.invited = s.invited.filter((x) => x.id !== from);
        s.players.push({
          id: from,
          name: String(a.n || 'Pemain').slice(0, 16),
          color: COLOR_RE.test(a.c) ? a.c : '#4dabf7',
          look: sanitizeLook(a.look),
          team,
        });
        this.push({ k: 'join', p: from });
        return;
      }
      case 'decline':
        if (!s.invited.some((x) => x.id === from)) return;
        s.invited = s.invited.filter((x) => x.id !== from);
        this.push({ k: 'decline', p: from });
        return;
      case 'leave':
        this.removePlayer(from);
        return;
      case 'team':
        this.switchTeam(from);
        return;
      case 'own':
      case 'steal': {
        const idx = this.index(from);
        if (idx < 0 || !Array.isArray(a.p)) return;
        const p = { x: +a.p[0], z: +a.p[1] };
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
        if (a.a === 'own') this.claim(idx, p);
        else this.steal(idx, a.k === 'slide' ? 'slide' : 'tackle', p);
        return;
      }
      case 'keep': {
        const pk = s.pk;
        if (s.phase !== 'play' || !pk || pk.stage !== 'aim' || this.index(from) !== pk.keeper) return;
        this.keepDir = Math.sign(+a.d || 0);
        return;
      }
      case 'pk': {
        const pk = s.pk;
        if (s.phase !== 'play' || !pk || pk.stage !== 'aim' || this.index(from) !== pk.shooter) return;
        this.shootPk(Math.sign(+a.d || 0), Math.max(0, Math.min(1, +a.c || 0)));
        return;
      }
      case 'hit': {
        const idx = this.index(from);
        if (idx < 0 || !Array.isArray(a.p) || !Array.isArray(a.v)) return;
        const p = { x: +a.p[0], y: +a.p[1], z: +a.p[2] };
        const v = { vx: +a.v[0], vy: +a.v[1], vz: +a.v[2] };
        if (![p.x, p.y, p.z, v.vx, v.vy, v.vz].every(Number.isFinite)) return;
        this.hit(idx, String(a.k || 'kick'), p, v);
        return;
      }
    }
  }

  start() {
    const s = this.state;
    if (s.phase === 'play' || s.players.length < 2 || teamSize(s, 0) < 1 || teamSize(s, 1) < 1) return;
    s.invited = [];
    s.phase = 'play';
    s.score = [0, 0];
    s.winner = null;
    this.timers = [];
    this.held = -1;
    if (s.sport === 'bola') {
      if (s.mode === 'pinalti') {
        s.pk = { kicks: [[], []], team: 0, shooter: -1, keeper: -1, stage: 'aim', shot: null, dive: null };
        this.setupKick();
      } else {
        this.clockEnd = Date.now() + MATCH_MS;
        s.left = MATCH_MS / 1000;
        s.kick = 0;
        this.kickoff();
      }
    } else {
      this.serveTeam = 0;
      this.serverOrder = [0, 0];
      s.rally = { server: this.teamPlayer(0, 0), faults: 0, pts: 0, stage: 'serve' };
      this.setupPoint();
    }
    this.push({ k: 'start' });
  }

  end(team, extra = {}) {
    const s = this.state;
    this.gkHold = null;
    s.phase = 'end';
    s.winner = team;
    this.live = false;
    this.held = -1;
    this.timers = [];
    this.push({ k: 'end', team, ...extra });
  }

  removePlayer(pid) {
    const s = this.state;
    const idx = this.index(pid);
    if (idx < 0) return;
    const team = s.players[idx].team;
    s.players.splice(idx, 1);
    this.bots.delete(pid);
    if (s.phase === 'play') {
      const humans = s.players.filter((p) => !p.bot).length;
      if (!teamSize(s, team) || humans < 1) {
        this.end(1 - team, { left: pid });
        return;
      }
      // perbaiki indeks yang bergeser
      const fix = (i) => (i === idx ? -1 : i > idx ? i - 1 : i);
      if (s.pk) {
        s.pk.shooter = fix(s.pk.shooter);
        s.pk.keeper = fix(s.pk.keeper);
      }
      if (s.rally) {
        const wasServer = s.rally.server === idx;
        s.rally.server = fix(s.rally.server);
        this.held = fix(this.held);
        if (wasServer) this.later(300, () => this.setupPoint());
      }
    }
    this.push({ k: 'leave', p: pid });
  }

  // ---------- Sepak bola ----------
  kickoff() {
    const b = this.ball;
    Object.assign(b, newBall());
    b.y = this.P.r;
    this.held = -1;
    this.gkHold = null;
    this.noClaim = new Map();
    this.initKeepers();
    this.hitN++;
    this.sendBallNow = true;
    this.live = true;
    this.state.reset++;
    this.resetBots();
    this.push({ k: 'reset' });
  }

  // ---------- Adu penalti ----------
  setupKick() {
    const s = this.state, pk = s.pk;
    pk.shooter = this.teamPlayer(pk.team, pk.kicks[pk.team].length);
    pk.keeper = this.teamPlayer(1 - pk.team, pk.kicks[1 - pk.team].length);
    pk.stage = 'aim';
    pk.shot = null;
    pk.dive = null;
    // kiper bot menebak acak; kiper manusia diam di tengah sampai memilih
    this.keepDir = s.players[pk.keeper]?.bot ? [-1, 0, 1][Math.floor(Math.random() * 3)] : 0;
    this.botShootAt = Date.now() + 1500 + Math.random() * 1800;
    this.pkPlan = null;
    const b = this.ball;
    Object.assign(b, newBall());
    b.x = PK_SPOT;
    b.y = this.P.r;
    this.hitN++;
    this.sendBallNow = true;
    this.kickDeadline = Date.now() + 10000;
    this.live = true;
    s.reset++;
    this.resetBots();
    this.push({ k: 'reset' });
  }

  pkResult(goal, why) {
    const s = this.state, pk = s.pk;
    if (pk.stage === 'result') return;
    pk.stage = 'result';
    this.live = false;
    pk.kicks[pk.team].push(goal ? 1 : 0);
    s.score = pk.kicks.map((k) => k.reduce((a, b) => a + b, 0));
    this.push({ k: goal ? 'goal' : 'miss', team: pk.team, why });
    this.later(2200, () => {
      const w = this.pkWinner();
      if (w !== null) return this.end(w);
      pk.team = 1 - pk.team;
      this.setupKick();
    });
  }

  /** Penendang memilih arah & tenaga; hasil ditentukan dari tebakan kiper. */
  shootPk(d, c) {
    const s = this.state, pk = s.pk, b = this.ball;
    const outcome = pkOutcome(d, c, this.keepDir);
    const v = pkVelocity(d, c, outcome);
    Object.assign(b, newBall());
    b.x = PK_SPOT;
    b.y = this.P.r;
    b.vx = v.vx;
    b.vy = v.vy;
    b.vz = v.vz;
    this.hitN++;
    this.sendBallNow = true;
    this.pkPlan = { outcome, d };
    this.flightUntil = Date.now() + 2200;
    pk.stage = 'flight';
    pk.shot = { d, c: Math.round(c * 100) / 100 };
    pk.dive = this.keepDir;
    const shooter = s.players[pk.shooter];
    if (shooter?.bot) this.botAct(this.bots.get(shooter.id), 'kick');
    this.push({ k: 'pk', d, dive: this.keepDir });
  }

  pkWinner() {
    const [a, b] = this.state.pk.kicks;
    const ga = a.reduce((x, y) => x + y, 0), gb = b.reduce((x, y) => x + y, 0);
    if (a.length <= 5 && b.length <= 5) {
      if (ga + (5 - a.length) < gb) return 1;
      if (gb + (5 - b.length) < ga) return 0;
      return null;
    }
    if (a.length === b.length) {
      if (ga !== gb) return ga > gb ? 0 : 1;
      if (a.length >= 10) return -1; // seri setelah 10 tendangan
    }
    return null;
  }

  // ---------- Tenis & bulu tangkis ----------
  teamPlayer(team, n) {
    const list = this.state.players.map((p, i) => ({ p, i })).filter((x) => x.p.team === team);
    if (!list.length) return -1;
    return list[((n % list.length) + list.length) % list.length].i;
  }

  setupPoint() {
    const s = this.state, r = s.rally;
    if (s.phase !== 'play') return;
    r.server = this.teamPlayer(this.serveTeam, this.serverOrder[this.serveTeam]);
    r.stage = 'serve';
    r.last = -1;
    this.held = r.server;
    this.heldSince = Date.now();
    this.serveDeadline = Date.now() + 9000;
    this.lastTeam = -1;
    this.bounces = 0;
    this.serveFlight = false;
    this.lastHitAt = Date.now();
    const b = this.ball;
    Object.assign(b, newBall());
    this.hitN++;
    this.sendBallNow = true;
    this.live = true;
    s.reset++;
    this.resetBots();
    this.push({ k: 'reset' });
  }

  inBounds(x, z) {
    return Math.abs(x) <= this.f.L / 2 + 0.05 && Math.abs(z) <= halfWidth(this.state) + 0.05;
  }

  fault() {
    const s = this.state, r = s.rally;
    this.live = false;
    if (s.sport === 'tenis' && r.faults < 1) {
      r.faults++;
      this.push({ k: 'fault' });
      this.later(1300, () => this.setupPoint());
      return;
    }
    this.point(1 - this.serveTeam, 'fault');
  }

  point(team, why) {
    const s = this.state, r = s.rally;
    if (!this.live && why !== 'fault') return;
    this.live = false;
    r.stage = 'dead';
    r.faults = 0;
    r.pts++;
    s.score[team]++;
    this.push({ k: 'point', team, why });
    const [a, b] = s.score;
    const hi = Math.max(a, b), diff = Math.abs(a - b);
    const done = s.sport === 'tenis' ? hi >= 7 && diff >= 2 : (hi >= 11 && diff >= 2) || hi >= 15;
    if (done) {
      this.later(1500, () => this.end(a > b ? 0 : 1));
      return;
    }
    const prev = this.serveTeam;
    this.serveTeam = s.sport === 'tenis' ? Math.floor((r.pts + 1) / 2) % 2 : team;
    if (this.serveTeam !== prev) this.serverOrder[this.serveTeam]++;
    this.later(1700, () => this.setupPoint());
  }

  contact(x, z) {
    const s = this.state;
    if (!this.live || s.rally?.stage !== 'play' || this.lastTeam < 0) return;
    const side = x < 0 ? -1 : 1;
    const hitter = this.lastTeam;
    const hSide = TEAM_SIDE[hitter];
    if (s.sport === 'tenis') {
      if (this.serveFlight) {
        this.serveFlight = false;
        const ok = side === -hSide && Math.abs(x) <= 6.05 && Math.abs(z) <= halfWidth(s) + 0.05;
        if (!ok) return this.fault();
        this.bounces = 1;
        return;
      }
      if (this.bounces === 0) {
        if (side === hSide) return this.point(1 - hitter, 'net');
        if (!this.inBounds(x, z)) return this.point(1 - hitter, 'out');
        this.bounces = 1;
        return;
      }
      return this.point(hitter, 'win');
    }
    // bulu tangkis: kok jatuh = poin selesai
    if (this.serveFlight) {
      const ok = side === -hSide && Math.abs(x) >= 1.95 && this.inBounds(x, z);
      return ok ? this.point(hitter, 'in') : this.fault();
    }
    if (side === -hSide && this.inBounds(x, z)) return this.point(hitter, 'in');
    return this.point(1 - hitter, side === hSide ? 'net' : 'out');
  }

  // ---------- Kejadian bola ----------
  ballEvent(k) {
    const s = this.state, b = this.ball;
    if (!this.live || s.phase !== 'play') return;
    if (s.sport === 'bola') {
      if (s.mode === 'pinalti') {
        if (s.pk.stage === 'flight' && k === 'goal' && this.pkPlan?.outcome === 'goal') this.pkResult(true, 'goal');
        return;
      }
      if (k === 'goal') {
        const team = b.scored > 0 ? 0 : 1;
        s.score[team]++;
        s.kick = 1 - team; // tim yang kebobolan melakukan kick-off
        this.held = -1;
        this.live = false;
        this.push({ k: 'goal', team });
        if (s.score[team] >= GOALS_TO_WIN) this.later(2200, () => this.end(team));
        else this.later(2600, () => this.kickoff());
      } else if (k === 'out') {
        this.live = false;
        this.held = -1;
        this.push({ k: 'out' });
        this.later(1200, () => {
          const f = this.f;
          b.x = Math.max(-f.L / 2 + 1, Math.min(f.L / 2 - 1, b.x));
          b.z = Math.max(-f.W / 2 + 0.6, Math.min(f.W / 2 - 0.6, b.z));
          b.y = this.P.r;
          b.vx = b.vy = b.vz = 0;
          b.scored = 0;
          this.hitN++;
          this.sendBallNow = true;
          this.live = true;
        });
      }
      return;
    }
    if (k === 'bounce' || k === 'land') this.contact(b.x, b.z);
    else if (k === 'away') {
      if (this.bounces > 0) this.point(this.lastTeam, 'win');
      else this.point(1 - this.lastTeam, 'out');
    }
  }

  // ---------- Pukulan (dari pemain atau bot) ----------
  canHit(idx, team, kind) {
    const s = this.state;
    if (s.phase !== 'play' || !this.live) return false;
    if (s.sport === 'bola') {
      if (s.mode === 'pinalti' || kind === 'serve' || this.gkHold) return false; // penalti: lewat aksi 'pk'
      return this.held < 0 || this.held === idx; // bola lepas, atau milik sendiri
    }
    if (this.held >= 0) return idx === this.held && kind === 'serve';
    return kind !== 'serve' && s.rally.stage === 'play' && this.lastTeam !== team;
  }

  hit(idx, kind, p, v) {
    const s = this.state, b = this.ball;
    const pl = s.players[idx];
    if (!pl || !this.canHit(idx, pl.team, kind)) return false;
    if (kind !== 'serve' && Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) > 3.4) return false;
    const now = Date.now();
    if (kind === 'touch') {
      if (now - (this.lastTouch.get(pl.id) || 0) < 60) return false;
      this.lastTouch.set(pl.id, now);
    }
    const sp = Math.hypot(v.vx, v.vy, v.vz);
    const k = sp > this.P.max ? this.P.max / sp : 1;
    b.x = p.x;
    b.y = Math.max(this.P.r, p.y);
    b.z = p.z;
    b.vx = v.vx * k;
    b.vy = v.vy * k;
    b.vz = v.vz * k;
    b.rolling = false;
    this.hitN++;
    this.sendBallNow = true;
    if (s.sport === 'bola') {
      if (this.held === idx) {
        this.held = -1;
        this.noClaim.set(pl.id, now + 320); // tidak langsung menguasai lagi bola yang baru ditendang
      }
    } else {
      this.serveFlight = this.held >= 0;
      if (this.held >= 0) {
        this.held = -1;
        s.rally.stage = 'play';
      }
      this.lastTeam = pl.team;
      s.rally.last = pl.team;
      this.bounces = 0;
      this.lastHitAt = now;
      this.push();
    }
    return true;
  }

  // ---------- Penguasaan bola (sepak bola) ----------
  /** Menguasai bola lepas (bola menempel di kaki). p = posisi pemain. */
  claim(idx, p) {
    const s = this.state, b = this.ball, pl = s.players[idx];
    if (!pl || s.sport !== 'bola' || s.mode === 'pinalti' || s.phase !== 'play' || !this.live || this.held >= 0 || this.gkHold) return false;
    const now = Date.now();
    if (now < (this.noClaim.get(pl.id) || 0)) return false;
    if (b.y > 1.0 || Math.hypot(b.vx, b.vz) > 17) return false;
    if (Math.hypot(b.x - p.x, b.z - p.z) > (pl.bot ? CLAIM_R : 2.6)) return false; // toleransi jeda jaringan
    this.held = idx;
    this.hitN++;
    this.sendBallNow = true;
    const bot = pl.bot && this.bots.get(pl.id);
    if (bot) {
      bot.ownT = 0;
      bot.shootAt = 9 + Math.random() * 6;
    }
    return true;
  }

  /** Merebut bola dari lawan: 'tackle' (peluang) atau 'slide' (bola terlepas). */
  steal(idx, kind, p) {
    const s = this.state, b = this.ball, pl = s.players[idx];
    if (!pl || s.sport !== 'bola' || s.mode === 'pinalti' || s.phase !== 'play' || !this.live || this.held < 0) return false;
    const owner = s.players[this.held];
    if (!owner || owner.team === pl.team) return false;
    const now = Date.now();
    this.stealCd ||= new Map();
    if (now < (this.stealCd.get(pl.id) || 0)) return false;
    if (Math.hypot(b.x - p.x, b.z - p.z) > (kind === 'slide' ? 2.4 : 2.0)) return false;
    const ok = kind === 'slide' || Math.random() < 0.6;
    this.stealCd.set(pl.id, now + (ok ? 400 : 900));
    if (ok) {
      this.noClaim.set(owner.id, now + 700);
      const ob = owner.bot && this.bots.get(owner.id);
      if (ob) ob.cd = 0.8;
      if (kind === 'slide') {
        // bola terpental ke arah sleding
        const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz) || 1;
        this.held = -1;
        b.vx = (dx / d) * 6;
        b.vz = (dz / d) * 6;
        b.vy = 1.2;
        b.rolling = false;
      } else this.held = idx;
      this.hitN++;
      this.sendBallNow = true;
    }
    this.push({ k: 'steal', p: pl.id, from: owner.id, ok, how: kind });
    return ok;
  }

  // ---------- Kiper otomatis (mode 1v1 & 2v2) ----------
  initKeepers() {
    const L2 = this.f.L / 2;
    this.keepers = this.state.mode === 'pinalti' ? [] : [0, 1].map((team) => {
      const out = -attackDir(team); // arah gawang sendiri
      return { team, id: `gk:${team}`, x: out * (L2 - 0.6), z: 0, vx: 0, vz: 0, ry: -out * Math.PI / 2, spd: 0, react: 0.2, dive: false, actN: 0, actK: '', stun: 0 };
    });
  }

  updateKeepers(dt) {
    if (!this.keepers?.length) return;
    const s = this.state, b = this.ball, f = this.f;
    const L2 = f.L / 2, gw = f.goalW / 2;
    const now = Date.now();
    for (const k of this.keepers) {
      const out = -attackDir(k.team);
      const homeX = out * (L2 - 0.6);
      let tx = homeX, tz = Math.max(-gw + 0.5, Math.min(gw - 0.5, b.z * 0.45)), speed = 4.5;
      const incoming = b.vx * out > 4 && this.held < 0 && !this.gkHold && this.live;
      if (incoming) {
        k.react -= dt;
        const t = (homeX - b.x) / b.vx;
        if (k.react <= 0 && t > 0 && t < 1.5) {
          tz = Math.max(-gw - 0.3, Math.min(gw + 0.3, b.z + b.vz * t));
          speed = 6.5;
          k.dive = true;
        }
      } else {
        k.react = 0.24 + Math.random() * 0.14;
        k.dive = false;
      }
      if (this.gkHold?.k === k) speed = 0;
      const dx = tx - k.x, dz = tz - k.z, d = Math.hypot(dx, dz);
      const sp = Math.min(speed, d * 5);
      const tvx = d > 0.03 ? (dx / d) * sp : 0, tvz = d > 0.03 ? (dz / d) * sp : 0;
      const a = 1 - Math.exp(-(k.dive ? 18 : 8) * dt);
      k.vx += (tvx - k.vx) * a;
      k.vz += (tvz - k.vz) * a;
      k.x += k.vx * dt;
      k.z += k.vz * dt;
      k.x = out > 0 ? Math.max(L2 - 1.6, Math.min(L2 - 0.2, k.x)) : Math.min(-L2 + 1.6, Math.max(-L2 + 0.2, k.x));
      k.z = Math.max(-gw - 0.8, Math.min(gw + 0.8, k.z));
      k.spd = Math.hypot(k.vx, k.vz);
      k.ry = -out * Math.PI / 2;
      if (!this.live || this.gkHold) continue;
      // menangkap / menepis bola
      const bd = Math.hypot(b.x - k.x, b.z - k.z);
      if (this.held < 0 && bd < 0.75 && b.y < 2.1) {
        const v = Math.hypot(b.vx, b.vy, b.vz);
        if (v < 16) this.keeperCatch(k);
        else {
          b.vx = -b.vx * 0.3;
          b.vz += (b.z - k.z) * 3 + (Math.random() - 0.5) * 3;
          b.vy = 2.2;
          b.x = k.x - out * 0.8;
          this.hitN++;
          this.sendBallNow = true;
          k.actN++;
          k.actK = 'wave';
          this.push({ k: 'save', team: k.team, how: 'parry' });
        }
      } else if (this.held >= 0 && s.players[this.held]?.team !== k.team && bd < 0.7 && now > (k.grabCd || 0)) {
        // menyambar bola dari kaki penyerang yang terlalu dekat
        k.grabCd = now + 800;
        if (Math.random() < 0.55) {
          this.noClaim.set(s.players[this.held].id, now + 700);
          this.held = -1;
          this.keeperCatch(k);
        }
      }
    }
    if (this.gkHold && now > this.gkHold.until) this.keeperDistribute();
  }

  keeperCatch(k) {
    const b = this.ball;
    this.gkHold = { k, until: Date.now() + 1100 };
    b.vx = b.vy = b.vz = 0;
    this.hitN++;
    this.sendBallNow = true;
    k.actN++;
    k.actK = 'wave';
    this.push({ k: 'save', team: k.team, how: 'catch' });
  }

  /** Kiper mengumpan ke kawan terdekat (atau menendang jauh ke depan). */
  keeperDistribute() {
    const s = this.state, b = this.ball, k = this.gkHold.k;
    this.gkHold = null;
    const bodies = this.bodies();
    const dir = attackDir(k.team);
    const mates = s.players.map((p, i) => (p.team === k.team ? bodies[i] : null)).filter(Boolean);
    b.x = k.x + dir * 0.6;
    b.z = k.z;
    b.y = this.P.r;
    const tg = pickPassTarget(b.x, b.z, dir > 0 ? Math.PI / 2 : -Math.PI / 2, mates);
    const v = tg ? passVelocity(b.x, b.z, tg.x, tg.z) : kickVelocity(dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0.35, 18);
    b.vx = v.vx;
    b.vy = v.vy;
    b.vz = v.vz;
    b.rolling = false;
    this.hitN++;
    this.sendBallNow = true;
    k.actN++;
    k.actK = 'kick';
  }

  // ---------- Bot ----------
  resetBots() {
    const s = this.state;
    s.players.forEach((p, i) => {
      if (!p.bot) return;
      const sp = spawnFor(s, i);
      const bot = this.bots.get(p.id) || { vx: 0, vz: 0, cd: 0, stun: 0, actN: 0, actK: '', spd: 0, think: 0 };
      Object.assign(bot, { x: sp.x, z: sp.z, ry: sp.rot, vx: 0, vz: 0, dive: false, ownT: 0 });
      this.bots.set(p.id, bot);
    });
  }

  trip(id, dx, dz) {
    const bot = this.bots.get(id);
    if (!bot) return;
    bot.stun = 0.9;
    bot.vx = dx * 4;
    bot.vz = dz * 4;
  }

  /** Posisi semua peserta (manusia & bot) dalam koordinat lokal. */
  bodies() {
    return this.state.players.map((p) => {
      if (p.bot) {
        const b = this.bots.get(p.id);
        return b ? { x: b.x, z: b.z, vx: b.vx, vz: b.vz } : null;
      }
      return this.getPos(p.id);
    });
  }

  botAct(bot, kind) {
    bot.actN++;
    bot.actK = kind;
  }

  botFootball(bot, idx, p, dt, bodies) {
    const s = this.state, b = this.ball, f = this.f;
    const L2 = f.L / 2, gw = f.goalW / 2;
    const dir = attackDir(p.team);
    if (s.mode === 'pinalti') {
      const pk = s.pk;
      if (pk.keeper === idx) {
        // kiper: diam di tengah, melompat ke arah tebakan saat bola ditendang
        const z = pk.stage === 'flight' || pk.stage === 'result' ? pkDiveZ(pk.dive || 0) : 0;
        bot.dive = pk.stage === 'flight';
        return { tx: L2 - 0.45, tz: z, speed: 9 };
      }
      if (pk.shooter === idx && pk.stage === 'aim' && Date.now() > this.botShootAt) {
        this.shootPk([-1, 0, 1][Math.floor(Math.random() * 3)], 0.3 + Math.random() * 0.64);
      }
      return { tx: bot.x, tz: bot.z, speed: 0 };
    }
    const mates = s.players.map((q, i) => i).filter((i) => i !== idx && s.players[i].team === p.team && bodies[i]);
    const opps = s.players.map((q, i) => i).filter((i) => s.players[i].team !== p.team && bodies[i]);
    const owner = this.held >= 0 ? s.players[this.held] : null;
    const ownerPos = owner ? bodies[this.held] : null;
    if (this.gkHold) {
      const sp = spawnFor(s, idx);
      return { tx: sp.x * 0.8 + (this.gkHold.k.team === p.team ? dir * 4 : 0), tz: sp.z, speed: 5 };
    }
    const myD = Math.hypot(bot.x - b.x, bot.z - b.z);
    const closestOfTeam = !mates.some((i) => Math.hypot(bodies[i].x - b.x, bodies[i].z - b.z) < myD - 0.5);

    // --- menguasai bola: menggiring ke gawang, umpan, tembak ---
    if (this.held === idx) {
      bot.ownT = (bot.ownT || 0) + dt;
      let tx = dir * L2, tz = b.z * 0.4;
      for (const i of opps) {
        const o = bodies[i];
        const ahead = (o.x - bot.x) * dir;
        if (ahead > 0 && ahead < 3.2 && Math.abs(o.z - bot.z) < 1.6) {
          // ada lawan di depan: belok ke sisi yang kosong
          tx = bot.x + dir * 3;
          tz = bot.z + (bot.z >= o.z ? 1 : -1) * 3;
        }
      }
      const dg = Math.hypot(dir * L2 - b.x, b.z);
      if (bot.ownT > 0.35 && bot.cd <= 0 && dg < (bot.shootAt || 12)) {
        const aimZ = (Math.random() < 0.5 ? -1 : 1) * (gw - 0.5 - Math.random() * 0.9);
        const face = Math.atan2(dir * L2 - b.x, aimZ - b.z);
        this.botHit(bot, idx, 'kick', shotVelocity(p.team, b.x, b.z, face, 0.4 + Math.random() * 0.45));
      } else if (mates.length && bot.ownT > 0.7 && bot.cd <= 0 && Math.random() < dt * 0.8) {
        const m = bodies[mates[0]];
        const open = !opps.some((i) => Math.hypot(bodies[i].x - m.x, bodies[i].z - m.z) < 2.2);
        if (open && (m.x - bot.x) * dir > 1.5) {
          const tg = pickPassTarget(b.x, b.z, Math.atan2(m.x - b.x, m.z - b.z), [m]);
          if (tg) this.botHit(bot, idx, 'kick', passVelocity(b.x, b.z, tg.x, tg.z));
        }
      }
      return { tx, tz, speed: 6.4 };
    }
    // --- kawan menguasai bola: cari ruang di depan ---
    if (owner && owner.team === p.team && ownerPos) {
      return { tx: Math.max(-L2 + 2, Math.min(L2 - 2, ownerPos.x + dir * 6)), tz: -ownerPos.z * 0.6 + (ownerPos.z >= 0 ? -2 : 2), speed: 6 };
    }
    // --- lawan menguasai bola: tekan atau jaga ---
    if (owner) {
      if (closestOfTeam) {
        if (myD < 1.0 && bot.cd <= 0) {
          this.botAct(bot, 'kick');
          this.steal(idx, 'tackle', { x: bot.x, z: bot.z });
          bot.cd = 1.1;
        }
        return { tx: b.x, tz: b.z, speed: 6.8 };
      }
      return { tx: -dir * L2 + (b.x + dir * L2) * 0.45, tz: b.z * 0.5, speed: 6 };
    }
    // --- bola lepas: yang terdekat mengejar ---
    if (closestOfTeam) {
      if (myD < 0.85 && b.y < 0.8) this.claim(idx, { x: bot.x, z: bot.z });
      return { tx: b.x, tz: b.z, speed: 7 };
    }
    return { tx: -dir * L2 + (b.x + dir * L2) * 0.5, tz: b.z * 0.4, speed: 5.5 };
  }

  /** Perkiraan titik pukul untuk bot raket. */
  predictHit(team) {
    const s = this.state, side = TEAM_SIDE[team];
    const sim = copyBall({}, this.ball);
    let bounced = 0;
    const ev = (k) => {
      if (k === 'bounce' || k === 'land') bounced++;
    };
    const tenis = s.sport === 'tenis';
    let last = null;
    for (let i = 0; i < 150; i++) {
      advance(sim, s.sport, this.f, 1 / 50, ev);
      if (sim.x * side < 0.6) continue;
      last = { x: sim.x, z: sim.z };
      if (tenis) {
        if ((bounced >= 1 && sim.y < 1.5 && sim.y > 0.35) || (bounced === 0 && Math.abs(sim.x) < 5 && sim.y < 1.6 && sim.y > 0.6)) return { x: sim.x, z: sim.z, t: i / 50 };
        if (bounced >= 2) break;
      } else {
        if (sim.vy < 0 && sim.y < 2.3 && sim.y > 0.5) return { x: sim.x, z: sim.z, t: i / 50 };
        if (bounced) break;
      }
    }
    return last;
  }

  botRacket(bot, idx, p, dt, bodies) {
    const s = this.state, b = this.ball;
    const side = TEAM_SIDE[p.team];
    const tenis = s.sport === 'tenis';
    const home = spawnFor(s, idx);
    let tx = side * (tenis ? 9.2 : 4), tz = 0, speed = 6.4;
    if (teamSize(s, p.team) > 1) {
      tx = home.x;
      tz = home.z * 0.6;
    }
    if (this.held === idx) {
      if (Date.now() - this.heldSince > 1300) this.serveFor(idx, 0.25 + Math.random() * 0.4);
      return { tx: home.x, tz: home.z, speed: 0 };
    }
    if (s.rally.stage === 'play' && this.lastTeam !== p.team && this.live) {
      bot.think -= dt;
      if (bot.think <= 0 || !bot.pred) {
        bot.think = 0.2;
        bot.pred = this.predictHit(p.team);
      }
      const mates = s.players.map((q, i) => i).filter((i) => i !== idx && s.players[i].team === p.team && bodies[i]);
      const pr = bot.pred;
      if (pr) {
        const myD = Math.hypot(bot.x - pr.x, bot.z - pr.z);
        const closer = mates.some((i) => Math.hypot(bodies[i].x - pr.x, bodies[i].z - pr.z) < myD - 0.3);
        if (!closer) {
          tx = pr.x + side * 0.3;
          tz = pr.z;
          speed = 7;
        }
      }
      const reach = REACH[s.sport];
      const d = Math.hypot(bot.x - b.x, bot.z - b.z);
      const okH = tenis ? b.y > 0.15 && b.y < 2.3 && (this.bounces >= 1 || Math.abs(b.x) < 5) : b.y > 0.25 && b.y < 2.5;
      if (d < reach && okH && b.x * side > 0 && bot.cd <= 0) {
        const miss = Math.random() < (tenis ? 0.1 : 0.15);
        const c = miss ? 0.95 : 0.35 + Math.random() * 0.4;
        const yaw = Math.atan2(-side, (Math.random() - 0.5) * 1.1);
        const tg = racketTarget(s, p.team, b.x, b.z, yaw, c, false);
        const hw = halfWidth(s) * (miss ? 1.25 : 0.75);
        tg.tz = Math.max(-hw, Math.min(hw, tg.tz));
        const v = solveShot(s.sport, this.f, b.x, b.y, b.z, tg.tx, tg.tz, shotAngles(s.sport, false, b.y > 2));
        this.botHit(bot, idx, 'swing', v);
        bot.pred = null;
      }
    } else bot.pred = null;
    return { tx, tz, speed };
  }

  /** Servis otomatis (bot / pemain yang terlalu lama). */
  serveFor(idx, c) {
    const s = this.state;
    const p = s.players[idx];
    const pos = p.bot ? this.bots.get(p.id) : this.getPos(p.id);
    if (!pos) return;
    const side = TEAM_SIDE[p.team];
    const tenis = s.sport === 'tenis';
    const oy = tenis ? 2.2 : 1.0;
    const yaw = Math.atan2(-side, -Math.sign(pos.z || 1) * 0.25);
    const tg = racketTarget(s, p.team, pos.x, pos.z, yaw, c, true);
    tg.tz = Math.max(-halfWidth(s) * 0.7, Math.min(halfWidth(s) * 0.7, tg.tz));
    const v = solveShot(s.sport, this.f, pos.x, oy, pos.z, tg.tx, tg.tz, shotAngles(s.sport, true));
    const ok = this.hit(idx, 'serve', { x: pos.x - side * 0.3, y: oy, z: pos.z }, v);
    if (ok && p.bot) this.botAct(this.bots.get(p.id), 'racket');
  }

  botHit(bot, idx, kind, v) {
    const b = this.ball;
    if (this.hit(idx, kind === 'swing' ? 'swing' : 'kick', { x: b.x, y: b.y, z: b.z }, v)) {
      bot.cd = 0.6;
      this.botAct(bot, this.state.sport === 'bola' ? 'kick' : 'racket');
    }
  }

  updateBots(dt) {
    const s = this.state;
    if (!this.bots.size) return;
    const bodies = this.bodies();
    const f = this.f;
    s.players.forEach((p, idx) => {
      if (!p.bot) return;
      const bot = this.bots.get(p.id);
      if (!bot) return;
      bot.cd = Math.max(0, bot.cd - dt);
      let goal = { tx: bot.x, tz: bot.z, speed: 0 };
      if (s.phase === 'play' && bot.stun <= 0) {
        goal = s.sport === 'bola' ? this.botFootball(bot, idx, p, dt, bodies) : this.botRacket(bot, idx, p, dt, bodies);
      }
      bot.stun = Math.max(0, bot.stun - dt);
      const dx = goal.tx - bot.x, dz = goal.tz - bot.z;
      const d = Math.hypot(dx, dz);
      const sp = bot.stun > 0 ? 0 : Math.min(goal.speed, d * 4);
      const tvx = d > 0.05 ? (dx / d) * sp : 0, tvz = d > 0.05 ? (dz / d) * sp : 0;
      const k = 1 - Math.exp(-(bot.stun > 0 ? 2 : bot.dive ? 16 : 9) * dt);
      bot.vx += (tvx - bot.vx) * k;
      bot.vz += (tvz - bot.vz) * k;
      bot.x += bot.vx * dt;
      bot.z += bot.vz * dt;
      this.clampBody(bot, p.team, idx);
      bot.spd = Math.hypot(bot.vx, bot.vz);
      if (bot.spd > 0.3 && !(s.mode === 'pinalti' && bot.dive)) bot.ry = Math.atan2(bot.vx, bot.vz);
      else if (s.sport !== 'bola' || s.mode === 'pinalti') bot.ry = spawnFor(s, idx).rot;
      // bola lepas yang membentur badan bot memantul
      if (s.sport === 'bola' && s.mode !== 'pinalti' && this.live && this.held < 0) {
        if (pushBall(this.ball, bot.x, bot.z, bot.vx, bot.vz, CONFIG.player.radius + this.P.r, 1.4) === 2) this.touched(p.id);
      }
    });
  }

  /** Bola menempel di depan kaki pemilik (menggiring). */
  carry(b) {
    const s = this.state, f = this.f;
    const p = s.players[this.held];
    const bot = p?.bot && this.bots.get(p.id);
    const pos = p && (p.bot ? bot : this.getPos(p.id));
    if (!pos || (bot && bot.stun > 0)) {
      this.held = -1;
      this.hitN++;
      this.sendBallNow = true;
      return;
    }
    const ry = pos.ry ?? 0;
    const px = b.x;
    b.x = pos.x + Math.sin(ry) * CARRY;
    b.z = pos.z + Math.cos(ry) * CARRY;
    b.y = this.P.r;
    b.vx = pos.vx || 0;
    b.vz = pos.vz || 0;
    b.vy = 0;
    b.rolling = true;
    const bx = f.L / 2 + BOARD - this.P.r, bz = f.W / 2 + BOARD - this.P.r;
    b.x = Math.max(-bx, Math.min(bx, b.x));
    b.z = Math.max(-bz, Math.min(bz, b.z));
    // menggiring bola masuk ke gawang
    if (Math.abs(px) <= f.L / 2 && Math.abs(b.x) > f.L / 2 && Math.abs(b.z) < f.goalW / 2 - this.P.r) {
      this.held = -1;
      b.scored = Math.sign(b.x);
      this.ballEvent('goal');
    }
  }

  /** Sentuhan tubuh ke bola: beri tahu klien (dibatasi agar tidak membanjiri jaringan). */
  touched(id) {
    const now = Date.now();
    if (now - (this.lastTouch.get(id) || 0) < 90) return;
    this.lastTouch.set(id, now);
    this.hitN++;
    this.sendBallNow = true;
  }

  /** Batas gerak peserta (dipakai juga untuk bot). */
  clampBody(o, team, idx) {
    clampToArea(this.state, o, team, idx);
  }

  // ---------- Tiap frame ----------
  tick(dt) {
    const s = this.state;
    const now = Date.now();
    if (s.invited.length) {
      const before = s.invited.length;
      s.invited = s.invited.filter((x) => x.until > now);
      if (s.invited.length !== before) this.push();
    }
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= now);
      this.timers = this.timers.filter((t) => t.at > now);
      for (const t of due) t.fn();
    }
    if (s.phase === 'play') this.rules(now);

    const b = this.ball;
    if (this.gkHold) {
      const k = this.gkHold.k;
      b.x = k.x + attackDir(k.team) * 0.3;
      b.z = k.z;
      b.y = 1.0;
      b.vx = b.vy = b.vz = 0;
    } else if (this.held >= 0 && s.sport === 'bola') this.carry(b);
    else if (this.held >= 0) {
      // pemegang bola (servis)
      const p = s.players[this.held];
      const pos = p && (p.bot ? this.bots.get(p.id) : this.getPos(p.id));
      if (pos) {
        const side = TEAM_SIDE[p.team];
        b.x = pos.x - side * 0.35;
        b.z = pos.z;
        b.y = 1.05;
        b.vx = b.vy = b.vz = 0;
      }
    } else {
      let t = dt;
      const h = 1 / 120;
      while (t > 1e-5) {
        const d = Math.min(h, t);
        stepBall(b, s.sport, this.f, d, this.onBallEvent);
        t -= d;
      }
    }
    this.updateBots(dt);
    if (s.phase === 'play') this.updateKeepers(dt);

    this.ballTimer += dt;
    if ((this.sendBallNow && this.ballTimer >= 1 / 40) || this.ballTimer >= 1 / 20) {
      this.ballTimer = 0;
      this.sendBallNow = false;
      this.publishBall([r3(b.x), r3(b.y), r3(b.z), r2(b.vx), r2(b.vy), r2(b.vz), Math.round(performance.now()), this.hitN, this.gkHold ? -3 : this.held]);
    }
    this.botTimer += dt;
    if ((this.bots.size || this.keepers?.length) && this.botTimer >= 1 / 15) {
      this.botTimer = 0;
      this.publishBots(this.botList());
    }
  }

  /** Posisi bot & kiper untuk disiarkan: [id, x, z, ry, speed, pusing, nomorAksi, aksi]. */
  botList() {
    const list = [];
    for (const p of this.state.players) {
      const bot = p.bot && this.bots.get(p.id);
      if (bot) list.push([p.id, r2(bot.x), r2(bot.z), r2(bot.ry), r2(bot.spd), bot.stun > 0 ? 1 : 0, bot.actN, bot.actK]);
    }
    if (this.state.phase !== 'lobby') for (const k of this.keepers || []) list.push([k.id, r2(k.x), r2(k.z), r2(k.ry), r2(k.spd), 0, k.actN, k.actK]);
    return list;
  }

  rules(now) {
    const s = this.state, b = this.ball;
    if (s.sport === 'bola') {
      if (s.mode === 'pinalti') {
        const pk = s.pk;
        if (!this.live) return;
        if (pk.stage === 'aim' && now > this.kickDeadline) this.pkResult(false, 'timeout');
        else if (pk.stage === 'flight' && this.pkPlan) {
          const o = this.pkPlan.outcome;
          const L2 = this.f.L / 2;
          if (o === 'save' && b.x >= L2 - 0.8) {
            // ditepis kiper: bola memantul keluar
            b.vx = -Math.abs(b.vx) * 0.25;
            b.vz = (Math.random() - 0.5) * 5;
            b.vy = 2.5;
            this.hitN++;
            this.sendBallNow = true;
            this.pkResult(false, 'save');
          } else if (o === 'over' && b.x >= L2 + 0.3) this.pkResult(false, 'over');
          else if (now > this.flightUntil) this.pkResult(o === 'goal', o === 'goal' ? 'goal' : o);
        }
        return;
      }
      const left = Math.max(0, Math.ceil((this.clockEnd - now) / 1000));
      if (left !== s.left) {
        s.left = left;
        this.push();
      }
      if (left <= 0 && this.live) {
        const [a, c] = s.score;
        this.end(a === c ? -1 : a > c ? 0 : 1, { why: 'time' });
      }
      return;
    }
    // raket: servis kelamaan / bola menggantung
    if (!this.live) return;
    if (this.held >= 0 && now > this.serveDeadline) this.serveFor(this.held, 0.35);
    else if (this.held < 0 && s.rally.stage === 'play' && now - this.lastHitAt > 9000) this.point(1 - Math.max(0, this.lastTeam), 'out');
  }
}

/** Batasi posisi peserta di area lapangan sesuai aturan (lokal lapangan). */
export function clampToArea(m, o, team, idx) {
  const f = FIELDS[m.sport];
  if (m.sport === 'bola') {
    const bx = f.L / 2 + BOARD - 0.45, bz = f.W / 2 + BOARD - 0.45;
    if (m.mode === 'pinalti' && m.phase === 'play' && m.pk) {
      // penalti: penendang & kiper tidak berjalan (kiper hanya melompat ke samping)
      const sp = spawnFor(m, idx);
      o.x = sp.x;
      if (m.pk.keeper === idx) o.z = Math.max(-2.3, Math.min(2.3, o.z));
      else o.z = sp.z;
      return;
    }
    o.x = Math.max(-bx, Math.min(bx, o.x));
    o.z = Math.max(-bz, Math.min(bz, o.z));
    return;
  }
  const run = RUN[m.sport];
  const ax = f.L / 2 + run - 0.4, az = f.W / 2 + run - 0.4;
  const s = TEAM_SIDE[team];
  // tetap di sisi sendiri
  if (s < 0) o.x = Math.max(-ax, Math.min(-0.45, o.x));
  else o.x = Math.max(0.45, Math.min(ax, o.x));
  o.z = Math.max(-az, Math.min(az, o.z));
}

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
