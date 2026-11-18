import * as THREE from 'three';
import { HostBase } from '../HostBase.js';
import { boardFrame, boardGroup, canvasPlane, cellPos, pawnGeometry, pieceMaterial } from '../boardKit.js';

// ---------- Aturan ----------
// Lintasan 52 petak searah jarum jam pada grid 15×15 (x = kolom, y = baris).
const TRACK = [];
const seg = (pts) => TRACK.push(...pts);
const range = (a, b) => (a <= b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : Array.from({ length: a - b + 1 }, (_, i) => a - i));
seg(range(14, 9).map((y) => [6, y]));
seg(range(5, 0).map((x) => [x, 8]));
seg([[0, 7]]);
seg(range(0, 5).map((x) => [x, 6]));
seg(range(5, 0).map((y) => [6, y]));
seg([[7, 0]]);
seg(range(0, 5).map((y) => [8, y]));
seg(range(9, 14).map((x) => [x, 6]));
seg([[14, 7]]);
seg(range(14, 9).map((x) => [x, 8]));
seg(range(9, 14).map((y) => [8, y]));
seg([[7, 14]]);
// Tiap warna: indeks petak start, jalur rumah (5 petak), area kandang.
const SEATS = [
  { start: 1, home: range(13, 9).map((y) => [7, y]), base: [1.5, 10.5], color: '#e03131', name: 'Merah' },
  { start: 14, home: range(1, 5).map((x) => [x, 7]), base: [1.5, 1.5], color: '#2f9e44', name: 'Hijau' },
  { start: 27, home: range(1, 5).map((y) => [7, y]), base: [10.5, 1.5], color: '#f59f00', name: 'Kuning' },
  { start: 40, home: range(13, 9).map((x) => [x, 7]), base: [10.5, 10.5], color: '#1c7ed6', name: 'Biru' },
];
const SAFE = new Set([1, 14, 27, 40, 9, 22, 35, 48]);
const FINISH = 56; // 0..50 lintasan, 51..55 jalur rumah, 56 selesai
// Pemain ke-i memakai warna (2 pemain: merah & kuning berhadapan)
const colorsFor = (n) => (n === 2 ? [0, 2] : n === 3 ? [0, 1, 2] : [0, 1, 2, 3]);

const trackIndex = (seat, prog) => (SEATS[seat].start + prog) % 52;

function movable(tokens, die) {
  const out = [];
  tokens.forEach((p, i) => {
    if (p === FINISH) return;
    if (p < 0) {
      if (die === 6) out.push(i);
    } else if (p + die <= FINISH) out.push(i);
  });
  return out;
}

// ---------- Bandar ----------
class LudoHost extends HostBase {
  constructor(o) {
    super({ ...o, game: 'ludo', min: 2, max: 4, turnMs: 25000 });
    Object.assign(this.state, { tokens: {}, colors: {}, die: 0, rolled: false, movable: [], sixes: 0 });
    this.push();
  }

  setup() {
    const s = this.state;
    const cols = colorsFor(s.players.length);
    s.tokens = {};
    s.colors = {};
    s.players.forEach((p, i) => {
      s.tokens[p.id] = [-1, -1, -1, -1];
      s.colors[p.id] = cols[i];
    });
    s.die = 0;
    this.setTurn(0);
  }

  onTurn() {
    const s = this.state;
    s.rolled = false;
    s.movable = [];
  }

  roll(pid) {
    const s = this.state;
    if (!this.isTurn(pid) || s.rolled) return;
    s.die = 1 + Math.floor(Math.random() * 6);
    s.rolled = true;
    s.movable = movable(s.tokens[pid], s.die);
    this.push({ k: 'roll', p: pid, die: s.die });
    if (!s.movable.length) {
      setTimeout(() => {
        if (this.state.rolled && this.isTurn(pid)) this.finishTurn(pid, false);
      }, 900);
    }
  }

  move(pid, t) {
    const s = this.state;
    if (!this.isTurn(pid) || !s.rolled || !s.movable.includes(t)) return;
    const toks = s.tokens[pid];
    const seat = s.colors[pid];
    const from = toks[t];
    toks[t] = from < 0 ? 0 : from + s.die;
    let captured = null;
    if (toks[t] <= 50) {
      const idx = trackIndex(seat, toks[t]);
      if (!SAFE.has(idx)) {
        for (const p of s.players) {
          if (p.id === pid) continue;
          const other = s.tokens[p.id];
          other.forEach((op, j) => {
            if (op >= 0 && op <= 50 && trackIndex(s.colors[p.id], op) === idx) {
              other[j] = -1;
              captured = p.id;
            }
          });
        }
      }
    }
    const ev = { k: 'move', p: pid, t, from, to: toks[t], cap: captured };
    if (toks.every((x) => x === FINISH)) return this.end(pid, ev);
    this.push(ev);
    this.finishTurn(pid, s.die === 6 || !!captured || toks[t] === FINISH);
  }

  finishTurn(pid, again) {
    const s = this.state;
    if (again && s.sixes < 2) {
      s.sixes++;
      s.rolled = false;
      s.movable = [];
      s.turnAt = Date.now();
    } else {
      s.sixes = 0;
      this.setTurn(this.next());
    }
    this.push();
  }

  onAction(a, from) {
    if (a.a === 'roll') this.roll(from);
    else if (a.a === 'move') this.move(from, a.t | 0);
  }

  onLeave(pid, idx) {
    delete this.state.tokens[pid];
    super.onLeave(pid, idx);
  }

  onTimeout(p) {
    if (!this.state.rolled) this.roll(p.id);
    else if (this.state.movable.length) this.move(p.id, this.state.movable[0]);
  }

  botMove(p) {
    const s = this.state;
    if (!s.rolled) return this.roll(p.id);
    if (!s.movable.length) return;
    const toks = s.tokens[p.id];
    const score = (t) => {
      const cur = toks[t];
      const next = cur < 0 ? 0 : cur + s.die;
      let v = next * 0.05 + Math.random() * 0.3;
      if (cur < 0) v += 2;
      if (next === FINISH) v += 3;
      if (next <= 50) {
        const idx = trackIndex(s.colors[p.id], next);
        for (const o of s.players) if (o.id !== p.id && s.tokens[o.id].some((op) => op >= 0 && op <= 50 && trackIndex(s.colors[o.id], op) === idx) && !SAFE.has(idx)) v += 4;
        if (SAFE.has(idx)) v += 0.5;
      }
      return v;
    };
    this.move(p.id, s.movable.reduce((a, b) => (score(b) > score(a) ? b : a)));
  }
}

// ---------- Tampilan ----------
const SIZE = 0.72;
const N = 15;

function cellOf(seat, prog, tokenIndex) {
  const S = SEATS[seat];
  if (prog < 0) {
    const [bx, by] = S.base;
    return [bx + (tokenIndex % 2) * 2, by + ((tokenIndex / 2) | 0) * 2];
  }
  if (prog <= 50) return TRACK[(S.start + prog) % 52];
  if (prog < FINISH) return S.home[prog - 51];
  // selesai: berkumpul di tengah
  return [7 + ((tokenIndex % 2) - 0.5) * 0.6, 7 + (((tokenIndex / 2) | 0) - 0.5) * 0.6];
}

function drawBoard(g, px) {
  const c = px / N;
  g.fillStyle = '#fdf6e3';
  g.fillRect(0, 0, px, px);
  const cell = (x, y, col) => {
    g.fillStyle = col;
    g.fillRect(x * c, y * c, c, c);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1.5;
    g.strokeRect(x * c, y * c, c, c);
  };
  SEATS.forEach((S) => {
    const [bx, by] = S.base;
    const x0 = bx - 1.5, y0 = by - 1.5;
    g.fillStyle = S.color;
    g.fillRect(x0 * c, y0 * c, 6 * c, 6 * c);
    g.fillStyle = '#fff';
    g.fillRect((x0 + 1) * c, (y0 + 1) * c, 4 * c, 4 * c);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = S.color;
      g.beginPath();
      g.arc((bx + (i % 2) * 2 + 0.5) * c, (by + ((i / 2) | 0) * 2 + 0.5) * c, c * 0.38, 0, Math.PI * 2);
      g.fill();
    }
  });
  TRACK.forEach(([x, y], i) => cell(x, y, '#ffffff'));
  SEATS.forEach((S) => {
    S.home.forEach(([x, y]) => cell(x, y, S.color));
    const [sx, sy] = TRACK[S.start];
    cell(sx, sy, S.color);
  });
  for (const i of [9, 22, 35, 48]) {
    const [x, y] = TRACK[i];
    g.fillStyle = '#adb5bd';
    g.font = `${c * 0.7}px system-ui`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('★', (x + 0.5) * c, (y + 0.55) * c);
  }
  // segitiga tengah
  const cx = 7.5 * c, cy = 7.5 * c;
  const tri = (ax, ay, bx2, by2, col) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(ax * c, ay * c);
    g.lineTo(bx2 * c, by2 * c);
    g.closePath();
    g.fill();
  };
  tri(6, 9, 9, 9, SEATS[0].color);
  tri(6, 6, 6, 9, SEATS[1].color);
  tri(6, 6, 9, 6, SEATS[2].color);
  tri(9, 6, 9, 9, SEATS[3].color);
}

function diceTexture(n) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#1d2333';
  const P = { 1: [[32, 32]], 2: [[18, 18], [46, 46]], 3: [[16, 16], [32, 32], [48, 48]], 4: [[18, 18], [46, 18], [18, 46], [46, 46]], 5: [[16, 16], [48, 16], [32, 32], [16, 48], [48, 48]], 6: [[18, 14], [46, 14], [18, 32], [46, 32], [18, 50], [46, 50]] }[n];
  for (const [x, y] of P) {
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// sisi kubus: +x,-x,+y,-y,+z,-z  → angka 3,4,1,6,2,5 (sisi berseberangan berjumlah 7)
const FACE_NUM = [3, 4, 1, 6, 2, 5];
const UP_ROT = { 1: [0, 0], 6: [Math.PI, 0], 2: [-Math.PI / 2, 0], 5: [Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2] };

const HOP = 0.17; // detik per petak
const DIE_R = SIZE / 2 + 0.075; // dadu di tepi papan, di depan pemain yang mendapat giliran
const ease = (k) => k * k * (3 - 2 * k);

class LudoRenderer {
  constructor(ctx, table) {
    this.ctx = ctx;
    this.table = table;
    this.group = boardGroup(ctx, table, table.seats[0]);
    this.plane = canvasPlane(SIZE, 1024, drawBoard);
    this.group.add(this.plane, boardFrame(SIZE, '#8b5a2b'));
    this.tokens = new Map(); // key -> { mesh, prog, anim }
    this.die = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), FACE_NUM.map((n) => new THREE.MeshLambertMaterial({ map: diceTexture(n) })));
    this.die.castShadow = true;
    this.die.userData.isDie = true;
    this.group.add(this.die);
    // cincin penanda "ketuk dadu"
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.058, 28), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.group.add(this.ring);
    this.dieAngle = null;
    this.dieSlide = null;
    this.rollT = 0;
    this.lastEv = -1;
    this.time = 0;
    this._v = new THREE.Vector3();
  }

  pos(cx, cy, out = new THREE.Vector3()) {
    return cellPos(cx, 14 - cy, N, SIZE, out);
  }

  /** Sudut (lokal papan) dari pusat papan ke kursi pemain ke-i. */
  seatAngle(m, i) {
    const seat = this.ctx.seatOf(m, i);
    if (!seat) return 0;
    const v = this.group.worldToLocal(this._v.set(seat.x, this.group.position.y, seat.z));
    return Math.atan2(v.x, v.z);
  }

  play(name) {
    const t = this.table;
    this.ctx.audio.playAt(name, t.x, t.z);
  }

  /** Petak-petak yang dilewati pion dari progres `from` ke `to`. */
  path(seat, i, from, to) {
    const cells = [];
    if (from < 0) cells.push(cellOf(seat, 0, i));
    else for (let p = from + 1; p <= to; p++) cells.push(cellOf(seat, p, i));
    return cells.map(([x, y]) => this.pos(x, y));
  }

  syncTokens(m) {
    const seen = new Set();
    const knocks = [];
    let walkLeft = 0;
    for (const p of m.players) {
      const seat = m.colors?.[p.id];
      const toks = m.tokens?.[p.id];
      if (seat === undefined || !toks) continue;
      toks.forEach((prog, i) => {
        const key = `${p.id}:${i}`;
        seen.add(key);
        let rec = this.tokens.get(key);
        if (!rec) {
          const mesh = new THREE.Mesh(pawnGeometry(), pieceMaterial(SEATS[seat].color));
          mesh.scale.setScalar(1.25);
          mesh.castShadow = true;
          mesh.userData = { owner: p.id, index: i };
          const [cx, cy] = cellOf(seat, prog, i);
          this.pos(cx, cy, mesh.position);
          this.group.add(mesh);
          rec = { mesh, prog, anim: null, seat, i };
          this.tokens.set(key, rec);
        }
        if (prog !== rec.prog) {
          const from = rec.prog;
          if (prog < 0 && from >= 0) {
            knocks.push(rec); // terdepak kembali ke kandang
          } else if (prog > from) {
            const pts = this.path(seat, i, from, prog);
            rec.anim = { type: 'walk', from: rec.mesh.position.clone(), pts, k: 0, t: 0, big: from < 0, finish: prog === FINISH };
            walkLeft = Math.max(walkLeft, pts.length * HOP + (from < 0 ? HOP : 0));
          } else rec.anim = null;
          rec.prog = prog;
        }
        if (rec.anim?.type === 'walk') walkLeft = Math.max(walkLeft, (rec.anim.pts.length - rec.anim.k) * HOP);
      });
    }
    for (const rec of knocks) {
      const [cx, cy] = cellOf(rec.seat, -1, rec.i);
      rec.anim = { type: 'knock', from: rec.mesh.position.clone(), to: this.pos(cx, cy), t: 0, delay: walkLeft, started: false };
    }
    for (const [k, rec] of this.tokens) {
      if (!seen.has(k)) {
        rec.mesh.removeFromParent();
        this.tokens.delete(k);
      }
    }
  }

  animateTokens(dt, m) {
    for (const rec of this.tokens.values()) {
      const mesh = rec.mesh;
      const a = rec.anim;
      if (a?.type === 'walk') {
        // melompat petak demi petak
        const dur = a.big && a.k === 0 ? HOP * 2 : HOP;
        a.t += dt / dur;
        const fromP = a.k === 0 ? a.from : a.pts[a.k - 1];
        const toP = a.pts[a.k];
        const e = ease(Math.min(1, a.t));
        mesh.position.lerpVectors(fromP, toP, e);
        mesh.position.y = Math.sin(e * Math.PI) * (a.big && a.k === 0 ? 0.07 : 0.03);
        mesh.scale.set(1.25, 1.25 * (1 - Math.sin(e * Math.PI) * -0.12), 1.25);
        if (a.t >= 1) {
          a.k++;
          a.t = 0;
          this.play('hop');
          if (a.k >= a.pts.length) {
            rec.anim = null;
            mesh.position.y = 0;
            if (a.finish) this.play('chime');
          }
        }
      } else if (a?.type === 'knock') {
        if (a.delay > 0) {
          a.delay -= dt;
          continue;
        }
        if (!a.started) {
          a.started = true;
          this.play('knock');
        }
        // terpental melambung kembali ke kandang sambil berputar
        a.t = Math.min(1, a.t + dt / 0.75);
        const e = ease(a.t);
        mesh.position.lerpVectors(a.from, a.to, e);
        mesh.position.y = Math.sin(a.t * Math.PI) * 0.2;
        mesh.rotation.x = a.t * Math.PI * 4;
        mesh.rotation.z = a.t * Math.PI * 2;
        if (a.t >= 1) {
          rec.anim = null;
          mesh.rotation.set(0, 0, 0);
          mesh.position.y = 0;
          this.play('plop');
        }
      } else {
        // diam di petak (bertumpuk: geser sedikit)
        const [cx, cy] = cellOf(rec.seat, rec.prog, rec.i);
        const target = this.pos(cx, cy, this._v);
        mesh.position.x += (target.x + (rec.i - 1.5) * 0.004 - mesh.position.x) * Math.min(1, dt * 12);
        mesh.position.z += (target.z - mesh.position.z) * Math.min(1, dt * 12);
        mesh.position.y = 0;
      }
      const hi = !a && this.highlight?.has(rec.i) && mesh.userData.owner === this.ctx.myId;
      if (a?.type !== 'walk') mesh.scale.setScalar(hi ? 1.25 + Math.sin(this.time * 8) * 0.12 : 1.25);
    }
  }

  updateDie(dt, m) {
    const live = m.phase === 'play' || m.phase === 'end';
    this.die.visible = live;
    this.ring.visible = false;
    if (!live) return;
    // dadu pindah ke depan pemain yang mendapat giliran (memutari tepi papan)
    const target = this.seatAngle(m, m.turn);
    if (this.dieAngle === null) this.dieAngle = target;
    else if (!this.dieSlide && Math.abs(Math.atan2(Math.sin(target - this.dieAngle), Math.cos(target - this.dieAngle))) > 0.01) {
      this.dieSlide = { a0: this.dieAngle, d: Math.atan2(Math.sin(target - this.dieAngle), Math.cos(target - this.dieAngle)), t: 0 };
      this.play('diceSlide');
    }
    let lift = 0;
    if (this.dieSlide) {
      const sl = this.dieSlide;
      sl.t = Math.min(1, sl.t + dt / 0.55);
      this.dieAngle = sl.a0 + sl.d * ease(sl.t);
      lift = Math.sin(sl.t * Math.PI) * 0.03;
      this.die.rotation.y += dt * 9;
      if (sl.t >= 1) this.dieSlide = null;
    }
    const a = this.dieAngle;
    this.die.position.set(Math.sin(a) * DIE_R, 0.03 + lift, Math.cos(a) * DIE_R);
    if (m.ev && m.ev.n !== this.lastEv) {
      if (m.ev.k === 'roll') this.rollT = 0.7;
      this.lastEv = m.ev.n;
    }
    if (this.rollT > 0) {
      this.rollT -= dt;
      this.die.rotation.x += dt * 17;
      this.die.rotation.z += dt * 13;
      this.die.position.y = 0.03 + Math.abs(Math.sin(this.rollT * 11)) * 0.07 * Math.min(1, this.rollT * 3);
    } else if (m.die && !this.dieSlide) {
      const [rx, rz] = UP_ROT[m.die];
      this.die.rotation.set(rx, 0, rz);
    }
    // giliran kita & belum melempar: dadu memantul pelan + cincin berdenyut
    if (this.prompt && !this.rollT && !this.dieSlide) {
      this.die.position.y = 0.03 + Math.abs(Math.sin(this.time * 4)) * 0.025;
      this.ring.visible = true;
      this.ring.position.set(this.die.position.x, 0.003, this.die.position.z);
      this.ring.scale.setScalar(1 + Math.sin(this.time * 6) * 0.12);
    }
  }

  update(dt, m) {
    this.time += dt;
    // permainan baru dimulai: pion langsung di kandang (tanpa animasi terdepak)
    if (m.ev?.k === 'start' && m.ev.n !== this.startEv) {
      this.startEv = m.ev.n;
      for (const rec of this.tokens.values()) rec.mesh.removeFromParent();
      this.tokens.clear();
    }
    if (m.phase !== 'lobby') this.syncTokens(m);
    else for (const rec of this.tokens.values()) rec.mesh.visible = false;
    this.animateTokens(dt, m);
    this.updateDie(dt, m);
  }

  dispose() {
    this.group.removeFromParent();
  }
}

class LudoControls {
  constructor(ctx) {
    this.ctx = ctx;
    this.wasMine = false;
  }

  enter() {}

  exit() {}

  myTurn(m) {
    return m.phase === 'play' && m.players[m.turn]?.id === this.ctx.myId;
  }

  update(dt, m) {
    const mine = this.myTurn(m);
    const r = this.ctx.renderer(m);
    if (r) {
      r.highlight = mine && m.rolled ? new Set(m.movable) : null;
      r.prompt = mine && !m.rolled;
    }
    if (mine && !m.rolled && !this.wasMine) this.ctx.flash('Giliranmu — ketuk dadu');
    this.wasMine = mine && !m.rolled;
  }

  playerColor(m, p) {
    const seat = m.colors?.[p.id];
    return seat === undefined ? null : SEATS[seat].color;
  }

  chip(m) {
    const seat = m.colors?.[this.ctx.myId];
    if (m.phase !== 'play' || seat === undefined) return null;
    return { bg: SEATS[seat].color, title: `Kamu ${SEATS[seat].name}`, html: m.die ? `<b style="font-size:16px">${m.die}</b>` : '' };
  }

  targets(m) {
    const r = this.ctx.renderer(m);
    if (!r) return [];
    return [...r.tokens.values()].map((x) => x.mesh).filter((t) => t.userData.owner === this.ctx.myId).concat([r.die]);
  }

  click(obj, m) {
    if (!obj || m.phase !== 'play') return;
    if (!this.myTurn(m)) return this.ctx.flash('Bukan giliranmu');
    if (obj.userData.isDie) {
      if (!m.rolled) this.ctx.act({ a: 'roll' });
      return;
    }
    if (!m.rolled) return this.ctx.flash('Ketuk dadu dulu');
    const t = obj.userData.index;
    if (m.movable.includes(t)) this.ctx.act({ a: 'move', t });
    else this.ctx.flash('Pion itu tidak bisa jalan');
  }

  onEvent(ev, m) {
    if (ev.k === 'roll') {
      this.ctx.playAtTable('dice', m);
      if (ev.p === this.ctx.myId && !m.movable.length) this.ctx.flash(`Dadu ${ev.die} — tidak ada langkah`);
    } else if (ev.k === 'move' && ev.cap) {
      setTimeout(() => this.ctx.flash(`${this.ctx.playerName(ev.p)} mendepak pion ${this.ctx.playerName(ev.cap)}!`), 300);
    }
  }
}

export default {
  id: 'ludo',
  name: 'Ludo',
  icon: 'dice',
  art: 'conic-gradient(#e03131 0 25%, #2f9e44 0 50%, #f59f00 0 75%, #1c7ed6 0)',
  min: 2,
  max: 4,
  seatOrder: (n) => (n === 2 ? [0, 2] : [0, 1, 2, 3]),
  topView: true,
  Host: LudoHost,
  Renderer: LudoRenderer,
  Controls: LudoControls,
};
