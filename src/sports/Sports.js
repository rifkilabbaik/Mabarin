import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Character } from '../character/Character.js';
import { icon } from '../ui/icons.js';
import { clamp, damp, dampAngle, wrapAngle } from '../utils/math.js';
import { BALLS, newBall, copyBall, advance, solveShot, kickVelocity, pushBall } from './physics.js';
import {
  SPORT_DEFS, TEAM_SIDE, TEAM_COLORS, TEAM_NAMES, SportHost, spawnFor, clampToArea, racketTarget,
  chargeWindow, shotAngles, REACH, teamSize,
} from './SportHost.js';
import { CARRY, CLAIM_R, OVER, shotVelocity, passVelocity, pickPassTarget, pkDiveZ } from './football.js';
import { sanitizeLook } from '../character/looks.js';

const $ = (id) => document.getElementById(id);
const INVITE_MS = 30000;
const HELD_ITEM = { bola: 'hand', tenis: 'racket', badminton: 'birdie' };
const CHARGE_TIME = 1.1;
const KEEPER_LOOK = [
  sanitizeLook({ body: 'tall', hair: 'spiky', top: 'shirt', topColor: '#ffd43b', bottom: 'shorts', bottomColor: '#1d2333', hat: 'cap' }),
  sanitizeLook({ body: 'tall', hair: 'bob', top: 'shirt', topColor: '#69db7c', bottom: 'shorts', bottomColor: '#1d2333', hat: 'cap' }),
];
const PK_KEYS = { ArrowLeft: -1, KeyA: -1, ArrowUp: 0, KeyW: 0, ArrowDown: 0, KeyS: 0, ArrowRight: 1, KeyD: 1 };
const DIR_NAME = { '-1': 'kiri', 0: 'tengah', 1: 'kanan' };
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Pengelola pertandingan di kompleks olahraga (sepak bola, adu penalti, tenis, bulu tangkis):
 * lobi & undangan, bola (prediksi + koreksi dari tuan rumah), tendang/pukul dengan tahan-lepas,
 * sleding & dash, papan skor dua sisi, bot.
 */
export class Sports {
  constructor({ scene, camRig, audio, ui, input, fields, onEnter, onExit }) {
    this.scene = scene;
    this.camRig = camRig;
    this.audio = audio;
    this.ui = ui;
    this.input = input;
    this.fields = fields;
    this.onEnter = onEnter;
    this.onExit = onExit;
    this.host = null;
    this.match = null;
    this.leftMatch = null;
    this.invite = null;
    this.joining = null;
    this.balls = new Map();
    this.botViews = new Map();
    this.rings = [];
    this.charging = false;
    this.charge = 0;
    this.swingT = 0;
    this.touchAt = 0;
    this.tackled = false;
    this.claimAt = 0;
    this.noClaimUntil = 0;
    this.tackleCd = 0;
    this.camManualAt = 0;
    this.lastCamYaw = null;
    this.keepChoice = null;
    this.pkKey = null;
    this.lastReset = -1;
    this.lastEvN = -1;
    this.lastPhase = null;
    this.uiSig = '';
    this.uiTimer = 0;
    this.busy = null; // () => sedang di meja game
    this.target = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 24), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.85, depthWrite: false }));
    this.target.rotation.x = -Math.PI / 2;
    this.target.visible = false;
    scene.add(this.target);
    this.ringGeo = new THREE.RingGeometry(0.5, 0.62, 24);
    this.bindDom();
  }

  attach({ net, local, remotes, profile }) {
    this.net = net;
    this.local = local;
    this.remotes = remotes;
    this.profile = profile;
    net.onEvent('sp-a', (p, from) => {
      if (this.host && p?.m === this.host.state.id) this.host.handle(p, from);
    });
    net.onEvent('sp-inv', (p, from) => this.receiveInvite(p, from));
    net.onEvent('sp-tk', (p) => this.onTackle(p));
  }

  get myId() {
    return this.net?.me.id;
  }

  /** Sedang ikut pertandingan (lobi / main / selesai). */
  get active() {
    return !!this.match;
  }

  get playing() {
    return this.match?.phase === 'play';
  }

  entries() {
    return Object.entries(SPORT_DEFS).map(([id, d]) => {
      const sizes = d.modes.map((m) => m.size);
      return {
        id,
        name: d.name,
        icon: d.icon,
        art: d.art,
        players: `${Math.min(...sizes)}–${Math.max(...sizes)}`,
        modes: d.modes.map((m) => ({ id: m.id, name: m.name, players: String(m.size) })),
        start: (mode) => this.createMatch(id, mode),
      };
    });
  }

  // ---------- Pertandingan di room ----------
  allMatches() {
    const list = [];
    if (this.host) list.push(this.host.state);
    if (this.remotes) {
      for (const rp of this.remotes.values()) {
        const s = rp.handle.getState('sp');
        if (s && s.host === rp.id && SPORT_DEFS[s.sport] && Array.isArray(s.players) && Array.isArray(s.score)) list.push(s);
      }
    }
    return list;
  }

  posOf(id, sport) {
    const f = this.fields[sport];
    if (id === this.myId) {
      const p = this.local.position, v = this.local.velocity;
      return { x: p.x - f.x, y: p.y - f.y, z: p.z - f.z, vx: v.x, vz: v.z, ry: this.local.facing };
    }
    const bv = this.botViews.get(id);
    if (bv) return { x: bv.x - f.x, y: 0, z: bv.z - f.z, vx: Math.sin(bv.ry) * bv.spd, vz: Math.cos(bv.ry) * bv.spd, ry: bv.ry };
    const rp = this.remotes.get(id);
    if (!rp?.hasPose) return null;
    const r = rp.render;
    return { x: r.x - f.x, y: r.y - f.y, z: r.z - f.z, vx: Math.sin(r.ry) * r.spd, vz: Math.cos(r.ry) * r.spd, ry: r.ry };
  }

  myIndex(m = this.match) {
    return m ? m.players.findIndex((p) => p.id === this.myId) : -1;
  }

  playerName(id) {
    if (id === this.myId) return 'Kamu';
    return this.match?.players.find((p) => p.id === id)?.name || this.remotes?.get(id)?.name || 'Pemain';
  }

  // ---------- Membuat pertandingan & undangan ----------
  createMatch(sport, mode) {
    if (!this.net) return;
    if (this.match || this.host) return this.ui.toast('Kamu sedang dalam pertandingan.');
    if (this.busy?.()) return this.ui.toast('Selesaikan game di meja dulu.');
    if (this.allMatches().some((m) => m.sport === sport)) return this.ui.toast('Lapangan sedang dipakai.');
    const p = this.profile();
    this.host = new SportHost({
      sport,
      mode,
      me: { id: this.myId, name: p.name, color: p.color, look: p.look },
      publish: (s) => this.net.me.setState('sp', s ? JSON.parse(JSON.stringify(s)) : null, true),
      publishBall: (a) => this.net.me.setState('sb', a, false),
      publishBots: (l) => this.net.me.setState('sbt', l, false),
      getPos: (id) => this.posOf(id, sport),
    });
    this.audio.play('whistle');
    setTimeout(() => this.openInvite(), 500);
  }

  openInvite() {
    if (!this.host || this.host.state.phase !== 'lobby') return;
    const busy = new Set(this.allMatches().flatMap((m) => m.players.map((p) => p.id)));
    const rows = [...this.remotes.values()].filter((rp) => rp.hasPose && !busy.has(rp.id) && !rp.busy);
    $('invite-list').replaceChildren(
      ...rows.map((rp) => {
        const li = document.createElement('li');
        li.innerHTML = '<label style="display:contents"><input type="checkbox" /><span class="dot"></span><span class="name"></span></label>';
        li.querySelector('input').value = rp.id;
        li.querySelector('.dot').style.background = rp.color;
        li.querySelector('.name').textContent = rp.name;
        return li;
      })
    );
    $('invite-empty').hidden = rows.length > 0;
    $('invite-bot').hidden = this.host.freeTeam() < 0;
    $('invite-modal').dataset.kind = 'sport';
    this.ui.openModal('invite-modal');
  }

  sendInvites() {
    if ($('invite-modal').dataset.kind !== 'sport') return;
    const ids = [...$('invite-list').querySelectorAll('input:checked')].map((i) => i.value);
    this.ui.closeModal('invite-modal');
    if (!ids.length || !this.host) return;
    const s = this.host.state;
    const to = ids.slice(0, Math.max(0, this.host.size - s.players.length));
    if (!to.length) return;
    this.host.invite(to);
    this.net.sendEvent('sp-inv', { m: s.id, s: s.sport, mode: s.mode, to });
    this.ui.toast(`Undangan terkirim ke ${to.length} pemain.`);
  }

  receiveInvite(p, from) {
    if (!p || !Array.isArray(p.to) || !p.to.includes(this.myId) || !SPORT_DEFS[p.s]) return;
    if (this.match || this.host || this.busy?.() || !$('invite-pop').hidden) {
      this.net.sendEvent('sp-a', { m: p.m, a: 'decline' });
      return;
    }
    const def = SPORT_DEFS[p.s];
    const mode = def.modes.find((x) => x.id === p.mode);
    this.invite = { m: p.m, from, until: Date.now() + INVITE_MS };
    $('ip-from').textContent = this.remotes.get(from)?.name || 'Teman';
    $('ip-what').textContent = `ngajak main ${def.name}${mode ? ` · ${mode.name}` : ''}`;
    $('invite-pop').dataset.owner = 'sport';
    $('invite-pop').hidden = false;
    this.audio.play('chime');
  }

  answerInvite(yes) {
    if ($('invite-pop').dataset.owner !== 'sport') return;
    const inv = this.invite;
    $('invite-pop').hidden = true;
    $('invite-pop').dataset.owner = '';
    this.invite = null;
    if (!inv) return;
    if (yes) {
      const p = this.profile();
      this.net.sendEvent('sp-a', { m: inv.m, a: 'join', n: p.name, c: p.color, look: p.look });
      this.joining = { m: inv.m, until: Date.now() + 6000 };
    } else this.net.sendEvent('sp-a', { m: inv.m, a: 'decline' });
  }

  act(a) {
    if (!this.match) return;
    if (this.host && this.host.state.id === this.match.id) this.host.handle(a, this.myId);
    else this.net.sendEvent('sp-a', { ...a, m: this.match.id });
  }

  leave() {
    if (this.host) {
      this.host = null;
      this.net.me.setState('sp', null, true);
      this.net.me.setState('sb', null, false);
      this.net.me.setState('sbt', null, false);
    } else if (this.match) {
      this.act({ a: 'leave' });
      this.leftMatch = this.match.id;
    }
    this.exit();
  }

  onPlayerQuit(id) {
    this.host?.removePlayer(id);
  }

  // ---------- DOM ----------
  bindDom() {
    $('invite-send').addEventListener('click', () => this.sendInvites());
    $('invite-bot').addEventListener('click', () => {
      if ($('invite-modal').dataset.kind !== 'sport') return;
      if (this.host?.addBot()) this.audio.play('click');
      this.ui.closeModal('invite-modal');
    });
    $('ip-yes').addEventListener('click', () => this.answerInvite(true));
    $('ip-no').addEventListener('click', () => this.answerInvite(false));
    $('sp-invite').addEventListener('click', () => this.openInvite());
    $('sp-bot').addEventListener('click', () => {
      if (this.host?.addBot()) this.audio.play('click');
    });
    $('sp-team').addEventListener('click', () => this.act({ a: 'team' }));
    $('sp-start').addEventListener('click', () => this.host?.start());
    $('sp-again').addEventListener('click', () => this.host?.start());
    $('sp-exit').addEventListener('click', () => this.leave());
    $('sp-leave').addEventListener('click', () => this.leave());

    const hold = (el, down, up) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('pressed');
        down();
      });
      const end = () => {
        if (!el.classList.contains('pressed')) return;
        el.classList.remove('pressed');
        up?.();
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('pointerleave', end);
    };
    hold($('sp-hit'), () => this.pressHit(), () => this.releaseHit());
    hold($('sp-pass'), () => this.pass());
    hold($('sp-dash'), () => this.dash());
    hold($('sp-slide'), () => this.slide());
    // adu penalti: tombol kiri / tengah / kanan
    for (const b of $('sp-pk').querySelectorAll('button')) {
      const d = Number(b.dataset.d);
      hold(b, () => this.pkPress(d), () => this.pkRelease(d));
    }
    const typing = (e) => /INPUT|TEXTAREA/.test(e.target?.tagName || '');
    window.addEventListener('keydown', (e) => {
      if (e.repeat || typing(e) || !(e.code in PK_KEYS) || !this.pkRole()) return;
      this.pkKey = e.code;
      this.pkPress(PK_KEYS[e.code]);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code !== this.pkKey) return;
      this.pkKey = null;
      this.pkRelease(PK_KEYS[e.code]);
    });
  }

  // ---------- Masuk / keluar ----------
  enter(m) {
    this.match = m;
    this.lastEvN = m.ev?.n ?? -1;
    this.lastReset = m.reset;
    this.lastPhase = null;
    this.uiSig = '';
    const f = this.fields[m.sport];
    const idx = this.myIndex(m);
    const L = this.local;
    if (L.seat) L.stand();
    // berdiri di pinggir lapangan selama lobi
    const side = f.W / 2 + (m.sport === 'bola' ? 0.8 : 1.4);
    L.position.set(f.x - 2.5 + idx * 1.6, f.y - 0.02, f.z - side);
    L.velocity.set(0, 0, 0);
    L.facing = 0;
    L.syncMesh();
    this.camRig.yaw = Math.PI;
    this.camRig.pitch = 0.32;
    this.camRig.initialized = false;
    L.immune = true;
    L.character.setItem(HELD_ITEM[m.sport]);
    this.net.me.setState('item', HELD_ITEM[m.sport], true);
    document.body.classList.add('in-sport');
    $('sport-ui').hidden = false;
    $('sport-ui').dataset.sport = m.sport;
    const def = SPORT_DEFS[m.sport];
    $('sp-icon').innerHTML = icon(def.icon);
    const mode = def.modes.find((x) => x.id === m.mode);
    $('sp-title').textContent = `${def.name} · ${mode?.name || ''}`;
    const bola = m.sport === 'bola';
    $('sport-ui').dataset.mode = m.mode;
    document.body.classList.toggle('sport-pk', m.mode === 'pinalti');
    this.hitLabel = '';
    this.setHitLabel(bola ? 'Tembak' : 'Pukul', bola ? 'kick' : def.icon);
    $('sp-pass').innerHTML = `${icon('arrowRight')}<span class="lbl">Umpan</span>`;
    $('sp-help').innerHTML = m.mode === 'pinalti'
      ? 'Penendang: tahan <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> lalu lepas · Kiper: tebak <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd>'
      : bola
        ? 'Tahan <kbd>F</kbd>/klik: tembak · <kbd>E</kbd>/klik kanan: umpan · <kbd>F</kbd> tanpa bola: rebut · <kbd>Q</kbd> dash · <kbd>C</kbd> sleding'
        : '<kbd>F</kbd>/klik tahan: pukul · <kbd>Q</kbd> dash';
    $('sp-slide').hidden = !bola;
    $('sp-pass').hidden = !bola;
    this.input.exitLock();
    this.onEnter?.();
  }

  exit(reason) {
    if (!this.match) return;
    this.match = null;
    this.local.speedMul = 1;
    $('sp-pk').hidden = true;
    this.charging = false;
    this.swingT = 0;
    this.target.visible = false;
    this.local.immune = false;
    document.body.classList.remove('in-sport', 'sport-pk');
    $('sport-ui').hidden = true;
    $('sp-lobby').hidden = true;
    $('sp-end').hidden = true;
    $('sp-charge').classList.remove('on');
    this.onExit?.();
    if (reason) this.ui.toast(reason);
  }

  teleport(sp, f) {
    const L = this.local;
    L.position.set(f.x + sp.x, f.y - 0.02, f.z + sp.z);
    L.velocity.set(0, 0, 0);
    L.facing = sp.rot;
    L.stunT = 0;
    L.syncMesh();
    this.camRig.yaw = sp.rot + Math.PI;
    this.camRig.pitch = 0.32;
    this.camRig.initialized = false;
  }

  // ---------- Input ----------
  setHitLabel(text, ic) {
    const key = text + ic;
    if (key === this.hitLabel) return;
    this.hitLabel = key;
    $('sp-hit').innerHTML = `${icon(ic)}<span class="lbl">${text}</span>`;
  }

  pressHit() {
    if (!this.playing) return;
    const m = this.match;
    if (m.sport === 'bola') {
      if (m.mode === 'pinalti') return; // penalti memakai tombol arah
      const st = this.ballState(m);
      if (st && st.oppOwns) {
        this.tackle(m, st);
        return;
      }
    }
    this.charging = true;
    this.chargeKind = 'hit';
    this.chargeAt = performance.now();
    this.charge = 0;
  }

  releaseHit() {
    if (!this.charging || this.chargeKind !== 'hit') return;
    this.charge = Math.min(1, (performance.now() - this.chargeAt) / 1000 / CHARGE_TIME);
    this.charging = false;
    if (this.match?.sport === 'bola') this.shoot(this.charge);
    else this.swing(this.charge);
  }

  dash() {
    if (this.match?.mode === 'pinalti') return;
    if (this.local?.dash() && this.match) this.net.sendEvent('act', { k: 'dash' });
  }

  slide() {
    if (this.match && (this.match.sport !== 'bola' || this.match.mode === 'pinalti')) return;
    this.local?.slide();
  }

  // ---------- Sepak bola: kuasai, giring, umpan, tembak, rebut ----------
  /** Siapa yang menguasai bola (dengan prediksi klaim kita sendiri). */
  holderOf(cb, idx, now = performance.now()) {
    return idx >= 0 && now < cb.claimUntil ? idx : cb.held;
  }

  ballState(m) {
    const cb = this.balls.get(m.id);
    const idx = this.myIndex(m);
    if (!cb || idx < 0) return null;
    const team = m.players[idx].team;
    const holder = this.holderOf(cb, idx);
    const me = this.local2(m);
    const b = this.ballLocal(cb);
    const d = Math.hypot(b.x - me.x, b.z - me.z);
    const near = cb.held === -1 && d < REACH.bola + (this.local.slideT > 0 ? 0.3 : 0) && b.y - me.y < 0.95;
    return { cb, idx, team, me, b, d, mine: holder === idx, near, oppOwns: holder >= 0 && m.players[holder]?.team !== team };
  }

  /** Posisi bola di kaki kita. */
  feetBall(m) {
    const me = this.local2(m);
    const a = this.local.facing;
    return { x: me.x + Math.sin(a) * CARRY, y: BALLS.bola.r, z: me.z + Math.cos(a) * CARRY };
  }

  kickBall(m, st, v, power) {
    const b = st.mine ? this.feetBall(m) : st.b;
    this.local.character.playAction('kick');
    this.net.sendEvent('act', { k: 'kick' });
    this.audio.play('kick', { strength: 0.35 + power * 0.65 });
    st.cb.held = -1;
    st.cb.claimUntil = 0;
    this.noClaimUntil = performance.now() + 350;
    this.sendHit(m, st.cb, 'kick', b, v);
  }

  /** Tembak ke gawang lawan: arah dari hadapan pemain, tenaga dari lama menahan. */
  shoot(c) {
    const m = this.match;
    if (!m || m.phase !== 'play') return;
    const st = this.ballState(m);
    if (!st) return;
    if (st.mine || st.near) {
      const b = st.mine ? this.feetBall(m) : st.b;
      this.kickBall(m, st, shotVelocity(st.team, b.x, b.z, this.local.facing, c), c);
      return;
    }
    // bola belum sampai: tendang langsung saat bola datang (sepersekian detik)
    this.local.character.playAction('kick');
    this.net.sendEvent('act', { k: 'kick' });
    this.swingT = 0.22;
    this.swingC = c;
  }

  /** Umpan ke kawan yang paling searah hadapan; tanpa kawan = sodok bola ke depan. */
  pass() {
    const m = this.match;
    if (!m || m.phase !== 'play' || m.sport !== 'bola' || m.mode === 'pinalti') return;
    const st = this.ballState(m);
    if (!st || !(st.mine || st.near)) return;
    const b = st.mine ? this.feetBall(m) : st.b;
    const mates = m.players.filter((p) => p.team === st.team && p.id !== this.myId).map((p) => this.posOf(p.id, m.sport));
    const tg = pickPassTarget(b.x, b.z, this.local.facing, mates);
    const v = tg ? passVelocity(b.x, b.z, tg.x, tg.z) : kickVelocity(this.local.facing, 0.02, 9);
    this.kickBall(m, st, v, 0.3);
  }

  /** Rebut bola: menerjang ke arah bola yang dikuasai lawan. */
  tackle(m, st) {
    const now = performance.now();
    if (now < this.tackleCd) return;
    this.tackleCd = now + 900;
    const L = this.local;
    if (st.d < 3) L.facing = Math.atan2(st.b.x - st.me.x, st.b.z - st.me.z);
    L.velocity.x = Math.sin(L.facing) * 8.5;
    L.velocity.z = Math.cos(L.facing) * 8.5;
    L.dashT = 0.16;
    L.syncMesh();
    L.character.playAction('kick');
    this.net.sendEvent('act', { k: 'kick' });
    this.audio.play('whoosh', { volume: 0.6 });
    if (st.d < 1.9) this.sendSteal(m, st.idx, 'tackle');
  }

  sendSteal(m, idx, kind) {
    const me = this.local2(m);
    if (this.host && this.host.state.id === m.id) this.host.steal(idx, kind, me);
    else this.net.sendEvent('sp-a', { m: m.id, a: 'steal', k: kind, p: [r2(me.x), r2(me.z)] });
  }

  /** Menguasai bola lepas yang menyentuh kaki. */
  autoClaim(m, cb, now) {
    if (m.mode === 'pinalti' || cb.held !== -1 || now < cb.claimUntil || now < this.noClaimUntil || now < this.claimAt) return;
    const L = this.local;
    if (L.slideT > 0 || L.stunT > 0) return;
    const b = this.ballLocal(cb);
    const me = this.local2(m);
    if (b.y - me.y > 0.8 || Math.hypot(b.x - me.x, b.z - me.z) > CLAIM_R) return;
    if (Math.hypot(cb.pred.vx - L.velocity.x, cb.pred.vz - L.velocity.z) > 15) return;
    this.claimAt = now + 250;
    const idx = this.myIndex(m);
    if (this.host && this.host.state.id === m.id) {
      if (this.host.claim(idx, me)) cb.held = idx;
      return;
    }
    cb.claimUntil = now + 500;
    this.net.sendEvent('sp-a', { m: m.id, a: 'own', p: [r2(me.x), r2(me.z)] });
  }

  // ---------- Adu penalti ----------
  pkRole() {
    const m = this.match;
    if (!m || m.mode !== 'pinalti' || m.phase !== 'play' || m.pk?.stage !== 'aim') return null;
    const idx = this.myIndex(m);
    return m.pk.shooter === idx ? 'shooter' : m.pk.keeper === idx ? 'keeper' : null;
  }

  pkPress(d) {
    const role = this.pkRole();
    if (role === 'keeper') {
      this.keepChoice = d;
      this.act({ a: 'keep', d: -d }); // kanan kiper = sisi -z lapangan
      this.audio.play('click');
      this.renderPk();
    } else if (role === 'shooter' && !this.charging) {
      this.charging = true;
      this.chargeKind = 'pk';
      this.pkDir = d;
      this.chargeAt = performance.now();
      this.charge = 0;
      this.renderPk();
    }
  }

  pkRelease(d) {
    if (!this.charging || this.chargeKind !== 'pk' || d !== this.pkDir) return;
    this.charging = false;
    const c = Math.min(1, (performance.now() - this.chargeAt) / 1000 / CHARGE_TIME);
    if (this.pkRole() !== 'shooter') return;
    this.local.character.playAction('kick');
    this.net.sendEvent('act', { k: 'kick' });
    this.act({ a: 'pk', d, c: Math.round(c * 100) / 100 }); // kanan penendang = sisi +z lapangan
    this.renderPk();
  }

  renderPk() {
    const role = this.pkRole();
    const el = $('sp-pk');
    el.hidden = !role;
    if (!role) return;
    el.dataset.role = role;
    const pick = role === 'keeper' ? this.keepChoice : this.charging && this.chargeKind === 'pk' ? this.pkDir : null;
    for (const b of el.querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.d) === pick);
    $('sp-pk-hint').textContent = role === 'keeper'
      ? this.keepChoice === null ? 'Tebak arah tendangan lawan' : `Kamu menjaga ${DIR_NAME[this.keepChoice]}`
      : 'Tahan arah tendangan, lepas untuk menendang';
  }

  // ---------- Tendang / pukul ----------
  swing(c) {
    const m = this.match;
    const cb = this.balls.get(m.id);
    if (!cb) return;
    const L = this.local;
    const bola = m.sport === 'bola';
    const yaw = this.camRig.yaw + Math.PI;
    L.facing = yaw;
    L.syncMesh();
    const kind = bola ? 'kick' : 'racket';
    L.character.playAction(kind);
    this.net.sendEvent('act', { k: kind });
    if (!bola) this.audio.play('whoosh', { volume: 0.6 });
    this.swingC = c;
    this.swingYaw = yaw;
    this.swingPitch = this.camRig.pitch;
    const idx = this.myIndex();
    if (!bola && cb.held === idx && idx >= 0) {
      this.serve(m, cb, idx, c);
      return;
    }
    this.swingT = bola ? 0.22 : 0.32;
    this.tryContact(m, cb);
  }

  local2(m) {
    const f = this.fields[m.sport];
    const p = this.local.position;
    return { x: p.x - f.x, y: p.y - f.y, z: p.z - f.z };
  }

  ballLocal(cb) {
    return { x: cb.pred.x + cb.off.x, y: cb.pred.y + cb.off.y, z: cb.pred.z + cb.off.z };
  }

  tryContact(m, cb) {
    if (cb.held !== -1) return false;
    const idx = this.myIndex(m);
    const team = m.players[idx]?.team;
    if (team === undefined) return false;
    const me = this.local2(m);
    const b = this.ballLocal(cb);
    const d = Math.hypot(b.x - me.x, b.z - me.z);
    const h = b.y - me.y;
    const c = this.swingC;
    let v, kind;
    if (m.sport === 'bola') {
      if (m.mode === 'pinalti') return false;
      const reach = REACH.bola + (this.local.slideT > 0 ? 0.3 : 0);
      if (h < 0.95 && d < reach) v = shotVelocity(team, b.x, b.z, this.local.facing, c); // tendangan langsung
      else if (h >= 0.95 && h < 2.1 && d < 0.85) {
        const s = shotVelocity(team, b.x, b.z, this.local.facing, 0.3); // sundulan
        v = { vx: s.vx * 0.6, vy: 1.5, vz: s.vz * 0.6 };
      } else return false;
      kind = 'kick';
      cb.held = -1;
      this.noClaimUntil = performance.now() + 350;
      this.audio.play('kick', { strength: 0.4 + c * 0.6 });
    } else {
      const r = m.rally;
      if (!r || r.stage !== 'play' || r.last === team) return false;
      if (b.x * TEAM_SIDE[team] < -0.3) return false;
      if (d > REACH[m.sport] || h < 0.08 || h > 2.6) return false;
      const tg = racketTarget(m, team, b.x, b.z, this.swingYaw, c, false);
      v = solveShot(m.sport, this.fields[m.sport], b.x, b.y, b.z, tg.tx, tg.tz, shotAngles(m.sport, false, b.y > 2.1));
      kind = 'swing';
      this.audio.play('hit', { strength: 0.5 + c * 0.5 });
    }
    this.sendHit(m, cb, kind, b, v);
    this.swingT = 0;
    return true;
  }

  serve(m, cb, idx, c) {
    const team = m.players[idx].team;
    const side = TEAM_SIDE[team];
    const me = this.local2(m);
    const oy = m.sport === 'tenis' ? 2.2 : 1.0;
    const o = { x: me.x - side * 0.3, y: oy, z: me.z };
    const tg = racketTarget(m, team, o.x, o.z, this.swingYaw, c, true);
    const v = solveShot(m.sport, this.fields[m.sport], o.x, o.y, o.z, tg.tx, tg.tz, shotAngles(m.sport, true));
    this.audio.play('hit', { strength: 0.6 + c * 0.4 });
    cb.held = -1;
    this.sendHit(m, cb, 'serve', o, v);
  }

  sendHit(m, cb, kind, p, v) {
    const now = performance.now();
    cb.pred.x = p.x;
    cb.pred.y = Math.max(BALLS[m.sport].r, p.y);
    cb.pred.z = p.z;
    cb.pred.vx = v.vx;
    cb.pred.vy = v.vy;
    cb.pred.vz = v.vz;
    cb.pred.rolling = false;
    cb.off.set(0, 0, 0);
    cb.ownUntil = now + 450;
    const idx = this.myIndex(m);
    const pa = [r2(p.x), r2(p.y), r2(p.z)], va = [r2(v.vx), r2(v.vy), r2(v.vz)];
    if (this.host && this.host.state.id === m.id) {
      this.host.hit(idx, kind, { x: pa[0], y: pa[1], z: pa[2] }, { vx: va[0], vy: va[1], vz: va[2] });
      cb.hitN = this.host.hitN;
    } else this.net.sendEvent('sp-a', { m: m.id, a: 'hit', k: kind, p: pa, v: va });
  }

  /** Tubuh kita mendorong bola (menggiring, menghalangi, menepis). */
  bodyTouch(m, cb, now) {
    if (m.sport !== 'bola' || m.mode === 'pinalti' || cb.held !== -1 || now < cb.claimUntil || now < this.noClaimUntil) return;
    const idx = this.myIndex(m);
    const L = this.local;
    let R = CONFIG.player.radius + BALLS.bola.r, H = 1.4, pow = 1;
    if (L.slideT > 0) {
      R += 0.3;
      H = 0.7;
      pow = 1.5;
    }
    const me = this.local2(m);
    const isHost = this.host && this.host.state.id === m.id;
    const ball = isHost ? this.host.ball : cb.pred;
    const res = pushBall(ball, me.x, me.z, L.velocity.x, L.velocity.z, R, H + Math.max(0, me.y), pow);
    if (res !== 2) return;
    if (isHost) {
      if (this.host.canHit(idx, m.players[idx].team, 'touch')) {
        this.host.touched(this.myId);
        cb.hitN = this.host.hitN;
      }
      return;
    }
    cb.off.set(0, 0, 0);
    if (now < this.touchAt) return;
    this.touchAt = now + 70;
    cb.ownUntil = now + 450;
    const b = cb.pred;
    this.net.sendEvent('sp-a', { m: m.id, a: 'hit', k: 'touch', p: [r2(b.x), r2(b.y), r2(b.z)], v: [r2(b.vx), r2(b.vy), r2(b.vz)] });
  }

  /** Sleding mengenai lawan = lawan terjatuh. */
  tackles(m) {
    const L = this.local;
    if (L.slideT <= 0) {
      this.tackled = false;
      this.slideStole = false;
      return;
    }
    if (m.sport !== 'bola' || m.mode === 'pinalti') return;
    if (!this.slideStole) {
      const st = this.ballState(m);
      if (st?.oppOwns && st.d < 1.5) {
        this.slideStole = true;
        this.sendSteal(m, st.idx, 'slide');
      }
    }
    if (this.tackled) return;
    const idx = this.myIndex(m);
    const team = m.players[idx].team;
    const me = this.local2(m);
    for (const p of m.players) {
      if (p.team === team || p.id === this.myId) continue;
      const o = this.posOf(p.id, m.sport);
      if (!o) continue;
      const dx = o.x - me.x, dz = o.z - me.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.0) continue;
      this.tackled = true;
      const nx = d > 0.01 ? dx / d : Math.sin(L.facing), nz = d > 0.01 ? dz / d : Math.cos(L.facing);
      if (p.bot && this.host?.state.id === m.id) this.host.trip(p.id, nx, nz);
      else this.net.sendEvent('sp-tk', { m: m.id, to: p.id, dx: r2(nx), dz: r2(nz) });
      this.audio.play('bonk', { volume: 0.7 });
      break;
    }
  }

  onTackle(p) {
    if (!p || !Number.isFinite(p.dx) || !Number.isFinite(p.dz)) return;
    if (this.host && this.host.state.id === p.m && String(p.to).startsWith('bot:')) {
      this.host.trip(p.to, clamp(p.dx, -1, 1), clamp(p.dz, -1, 1));
      return;
    }
    if (p.to !== this.myId || this.match?.id !== p.m || !this.playing) return;
    const L = this.local;
    L.stunT = 0.85;
    L.velocity.set(clamp(p.dx, -1, 1) * 5, 3.2, clamp(p.dz, -1, 1) * 5);
    L.grounded = false;
    L.character.dizzy(1.2);
    this.audio.play('bonk');
    this.camRig.shake(0.25);
    this.flash('Kena sleding!');
  }

  // ---------- Tampilan bola, bot & penanda tim ----------
  ballView(m) {
    let cb = this.balls.get(m.id);
    if (cb) return cb;
    const mesh = ballMesh(m.sport);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(BALLS[m.sport].r * 1.3, 14), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(mesh, shadow);
    cb = { mesh, shadow, sport: m.sport, pred: newBall(), off: new THREE.Vector3(), lastT: -1, hitN: -1, held: -1, ownUntil: 0, claimUntil: 0, prevVy: 0 };
    cb.pred.y = BALLS[m.sport].r;
    this.balls.set(m.id, cb);
    return cb;
  }

  updateBall(m, dt, now) {
    const cb = this.ballView(m);
    const f = this.fields[m.sport];
    const isHost = this.host && this.host.state.id === m.id;
    if (isHost) {
      copyBall(cb.pred, this.host.ball);
      cb.held = this.host.gkHold ? -3 : this.host.held;
      if (this.host.hitN !== cb.hitN) {
        if (cb.hitN >= 0 && now > cb.ownUntil) this.hitSound(m, cb);
        cb.hitN = this.host.hitN;
      }
      cb.off.set(0, 0, 0);
    } else {
      const rp = this.remotes.get(m.host);
      const sb = rp?.handle.getState('sb');
      if (Array.isArray(sb) && sb.length >= 9 && sb[6] !== cb.lastT && sb.slice(0, 6).every(Number.isFinite)) {
        cb.lastT = sb[6];
        const own = now < cb.ownUntil;
        const changed = sb[7] !== cb.hitN;
        if (changed || !own) {
          const st = { x: sb[0], y: sb[1], z: sb[2], vx: sb[3], vy: sb[4], vz: sb[5], rolling: false, scored: 0 };
          st.rolling = st.y <= BALLS[m.sport].r + 0.002 && Math.abs(st.vy) < 0.01;
          if (sb[8] < 0) {
            const offset = Number.isFinite(rp.offset) ? rp.offset : now - sb[6];
            advance(st, m.sport, f, clamp(now - offset - sb[6] + 40, 0, 350) / 1000);
          }
          const jump = Math.hypot(cb.pred.x - st.x, cb.pred.y - st.y, cb.pred.z - st.z);
          if (cb.hitN < 0 || jump > 2.5 || sb[8] >= 0) cb.off.set(0, 0, 0);
          else cb.off.set(cb.off.x + cb.pred.x - st.x, cb.off.y + cb.pred.y - st.y, cb.off.z + cb.pred.z - st.z);
          copyBall(cb.pred, st);
          if (changed) {
            if (cb.hitN >= 0 && !own) this.hitSound(m, cb);
            cb.hitN = sb[7];
            cb.ownUntil = 0;
          }
          cb.held = sb[8] | 0;
          const myIdx = this.myIndex(m);
          if (cb.held === myIdx && myIdx >= 0) cb.claimUntil = 0; // klaim kita dikonfirmasi
        }
      }
      if (cb.held === -1 && !(now < cb.claimUntil)) advance(cb.pred, m.sport, f, dt);
    }
    cb.off.multiplyScalar(Math.exp(-7 * dt));

    // bunyi pantulan
    if (cb.prevVy < -1.5 && cb.pred.vy > 0) this.audio.playAt(m.sport === 'bola' ? 'kick' : 'click2', f.x + cb.pred.x, f.z + cb.pred.z, { strength: 0.15, volume: clamp(-cb.prevVy / 8, 0.2, 0.8) });
    cb.prevVy = cb.pred.vy;

    const mesh = cb.mesh;
    let x = f.x + cb.pred.x + cb.off.x, y = f.y + cb.pred.y + cb.off.y, z = f.z + cb.pred.z + cb.off.z;
    const holder = this.holderOf(cb, this.myIndex(m), now);
    if (m.sport === 'bola' && holder >= 0 && m.players[holder]) {
      // bola menempel di kaki pemilik (posisi yang kita lihat, tanpa jeda tambahan)
      const o = this.posOf(m.players[holder].id, m.sport);
      if (o) {
        x = f.x + o.x + Math.sin(o.ry) * CARRY;
        z = f.z + o.z + Math.cos(o.ry) * CARRY;
        y = f.y + BALLS.bola.r;
        cb.pred.x = x - f.x;
        cb.pred.z = z - f.z;
        cb.pred.y = BALLS.bola.r;
        cb.off.set(0, 0, 0);
      }
    } else if (cb.held >= 0 && m.players[cb.held]?.id === this.myId) {
      // bola di tangan kita sendiri: ikuti posisi lokal tanpa jeda
      const side = TEAM_SIDE[m.players[cb.held].team];
      x = this.local.position.x - side * 0.35;
      z = this.local.position.z;
      y = f.y + 1.05;
    }
    const prev = mesh.position.clone();
    mesh.position.set(x, y, z);
    if (m.sport === 'badminton') {
      const v = new THREE.Vector3(cb.pred.vx, cb.pred.vy, cb.pred.vz);
      if (v.lengthSq() > 0.5) mesh.quaternion.setFromUnitVectors(UP, v.normalize());
      else if (cb.pred.rolling) mesh.quaternion.setFromAxisAngle(X_AXIS, Math.PI / 2.4);
    } else {
      // putaran menggelinding
      const dx = x - prev.x, dz = z - prev.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-4 && dist < 3) mesh.rotateOnWorldAxis(new THREE.Vector3(dz / dist, 0, -dx / dist), dist / BALLS[m.sport].r);
    }
    const hgt = Math.max(0, y - f.y);
    cb.shadow.position.set(x, f.y + 0.015, z);
    cb.shadow.scale.setScalar(1 + hgt * 0.15);
    cb.shadow.material.opacity = 0.32 * clamp(1 - hgt / 7, 0.15, 1);
  }

  hitSound(m, cb) {
    const f = this.fields[m.sport];
    this.audio.playAt(m.sport === 'bola' ? 'kick' : 'hit', f.x + cb.pred.x, f.z + cb.pred.z, { strength: clamp(Math.hypot(cb.pred.vx, cb.pred.vy, cb.pred.vz) / 20, 0.2, 1) });
  }

  updateBots(m, dt, seen) {
    const f = this.fields[m.sport];
    let list;
    if (this.host && this.host.state.id === m.id) {
      list = [];
      for (const p of m.players) {
        const b = p.bot && this.host.bots.get(p.id);
        if (b) list.push([p.id, b.x, b.z, b.ry, b.spd, b.stun > 0 ? 1 : 0, b.actN, b.actK]);
      }
    } else list = this.remotes.get(m.host)?.handle.getState('sbt');
    if (!Array.isArray(list)) return;
    for (const e of list) {
      if (!Array.isArray(e) || !e.slice(1, 5).every(Number.isFinite)) continue;
      let p = m.players.find((q) => q.id === e[0] && q.bot);
      if (!p && (e[0] === 'gk:0' || e[0] === 'gk:1') && m.sport === 'bola') {
        const t = e[0] === 'gk:0' ? 0 : 1;
        p = { id: `${m.id}:${e[0]}`, name: `Kiper ${TEAM_NAMES[t]}`, color: TEAM_COLORS[t], look: KEEPER_LOOK[t] };
      }
      if (!p) continue;
      seen.add(p.id);
      let v = this.botViews.get(p.id);
      const tx = f.x + e[1], tz = f.z + e[2];
      if (!v) {
        const ch = new Character({ name: p.name, color: p.color, look: p.look, showName: true });
        ch.setItem(HELD_ITEM[m.sport]);
        this.scene.add(ch.root);
        v = { ch, x: tx, z: tz, ry: e[3], actN: e[6], stun: 0, spd: 0 };
        this.botViews.set(p.id, v);
      }
      v.spd = e[4];
      v.x = damp(v.x, tx, 14, dt);
      v.z = damp(v.z, tz, 14, dt);
      if (Math.hypot(v.x - tx, v.z - tz) > 6) {
        v.x = tx;
        v.z = tz;
      }
      v.ry = dampAngle(v.ry, e[3], 14, dt);
      if (e[6] !== v.actN) {
        v.actN = e[6];
        if (e[7]) v.ch.playAction(e[7]);
      }
      if (e[5] && !v.stun) v.ch.dizzy(1.2);
      v.stun = e[5];
      v.ch.root.position.set(v.x, f.y - 0.02, v.z);
      v.ch.root.rotation.y = v.ry;
      v.ch.animate(dt, { speed: e[4], grounded: true, swimming: false, vy: 0 });
    }
  }

  updateRings(matches) {
    let n = 0;
    for (const m of matches) {
      if (m.phase === 'end') continue;
      const f = this.fields[m.sport];
      for (const p of m.players) {
        const o = this.posOf(p.id, m.sport);
        if (!o) continue;
        let ring = this.rings[n];
        if (!ring) {
          ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.75, depthWrite: false }));
          ring.rotation.x = -Math.PI / 2;
          this.scene.add(ring);
          this.rings.push(ring);
        }
        ring.visible = true;
        ring.material.color.set(TEAM_COLORS[p.team] || '#fff');
        ring.position.set(f.x + o.x, f.y + 0.02, f.z + o.z);
        n++;
      }
    }
    for (let i = n; i < this.rings.length; i++) this.rings[i].visible = false;
  }

  // ---------- Tiap frame (dipanggil setelah pemain lokal bergerak) ----------
  update(dt) {
    if (!this.net || !this.local) return;
    const now = performance.now();
    this.host?.tick(dt);
    const matches = this.allMatches();

    const ids = new Set();
    for (const m of matches) for (const p of m.players) ids.add(p.id);
    for (const rp of this.remotes.values()) rp.busy = ids.has(rp.id);

    if (this.invite) {
      const left = (this.invite.until - Date.now()) / INVITE_MS;
      $('ip-bar').style.transform = `scaleX(${clamp(left, 0, 1)})`;
      if (left <= 0) this.answerInvite(false);
    }

    const mine = matches.find((m) => m.players.some((p) => p.id === this.myId) && m.id !== this.leftMatch);
    if (this.leftMatch && !matches.some((m) => m.id === this.leftMatch && m.players.some((p) => p.id === this.myId))) this.leftMatch = null;
    if (mine && !this.match) this.enter(mine);
    if (!mine && this.match) this.exit(this.match.host === this.myId ? '' : 'Pertandingan dibubarkan.');
    if (this.joining) {
      if (mine) this.joining = null;
      else if (Date.now() > this.joining.until) {
        this.joining = null;
        this.ui.toast('Undangan sudah tidak berlaku.');
      }
    }
    if (mine) this.match = mine;

    // bola & bot semua lapangan (terlihat juga oleh penonton)
    const live = new Set();
    const seenBots = new Set();
    for (const m of matches) {
      live.add(m.id);
      this.updateBall(m, dt, now);
      this.updateBots(m, dt, seenBots);
    }
    for (const [id, cb] of this.balls) {
      if (live.has(id)) continue;
      cb.mesh.removeFromParent();
      cb.shadow.removeFromParent();
      this.balls.delete(id);
    }
    for (const [id, v] of this.botViews) {
      if (seenBots.has(id)) continue;
      v.ch.dispose();
      this.botViews.delete(id);
    }
    this.updateRings(matches);

    if (this.match) this.updateActive(dt, now);
  }

  updateActive(dt, now) {
    const m = this.match;
    const f = this.fields[m.sport];
    const idx = this.myIndex(m);
    if (idx < 0) return;
    const team = m.players[idx].team;
    const cb = this.balls.get(m.id);

    if (m.phase !== this.lastPhase) {
      if (m.phase !== 'play') {
        this.input.exitLock();
        this.charging = false;
      }
      this.lastPhase = m.phase;
    }
    if (m.phase === 'play' && m.reset !== this.lastReset) {
      this.lastReset = m.reset;
      this.teleport(spawnFor(m, idx), f);
      this.keepChoice = null;
      this.charging = false;
      if (m.mode === 'pinalti') this.input.exitLock(); // tombol arah bisa diklik
    }
    this.handleEvent(m);
    const football = m.sport === 'bola' && m.mode !== 'pinalti';
    const L = this.local;

    if (m.phase === 'play' && cb) {
      // batas gerak
      const o = { x: L.position.x - f.x, z: L.position.z - f.z };
      clampToArea(m, o, team, idx);
      if (m.mode === 'pinalti') {
        const sp = spawnFor(m, idx);
        const pk = m.pk;
        L.velocity.x = L.velocity.z = 0;
        L.facing = sp.rot;
        if (pk.keeper === idx && pk.dive !== null && pk.dive !== undefined && pk.stage !== 'aim') {
          // kiper melompat ke arah tebakannya
          if (this.divedFor !== m.reset) {
            this.divedFor = m.reset;
            L.velocity.y = 4.2;
            L.grounded = false;
            L.dashT = 0.3;
          }
          const tz = pkDiveZ(pk.dive);
          o.z += clamp(tz - o.z, -9 * dt, 9 * dt);
        } else o.z = sp.z;
      } else if (cb.held === idx && m.sport !== 'bola') {
        const sp = spawnFor(m, idx);
        o.x = sp.x;
        o.z = sp.z;
        L.velocity.x = L.velocity.z = 0;
      }
      L.position.x = f.x + o.x;
      L.position.z = f.z + o.z;
      L.syncMesh();

      if (this.swingT > 0) {
        this.swingT -= dt;
        this.tryContact(m, cb);
      }
      if (football) this.autoClaim(m, cb, now);
      this.bodyTouch(m, cb, now);
      this.tackles(m);
    }
    if (football) {
      const st = this.ballState(m);
      // menggiring sedikit lebih lambat
      L.speedMul = st?.mine ? 0.9 : 1;
      if (st?.oppOwns && !st.mine) this.setHitLabel('Rebut', 'hand');
      else this.setHitLabel('Tembak', 'kick');
      $('sp-pass').classList.toggle('dim', !(st?.mine || st?.near));
      // kamera pelan-pelan mengarah ke gawang lawan bila tidak sedang diputar pemain
      if (m.phase === 'play') {
        if (this.lastCamYaw !== null && Math.abs(wrapAngle(this.camRig.yaw - this.lastCamYaw)) > 1e-4) this.camManualAt = now;
        if (now - this.camManualAt > 1500) this.camRig.yaw = dampAngle(this.camRig.yaw, (team === 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI, 1.6, dt);
        this.lastCamYaw = this.camRig.yaw;
      }
    }
    if (m.mode === 'pinalti') {
      const sig = `${this.pkRole()}|${this.keepChoice}|${this.charging}|${this.pkDir}`;
      if (sig !== this.pkSig) {
        this.pkSig = sig;
        this.renderPk();
      }
    }

    // meteran tenaga
    if (this.charging) this.charge = Math.min(1, (now - this.chargeAt) / 1000 / CHARGE_TIME);
    const meter = $('sp-charge');
    meter.classList.toggle('on', this.charging);
    if (this.charging) {
      meter.querySelector('.sp-fill').style.transform = `scaleX(${this.charge})`;
      const serve = cb && cb.held === idx;
      const win = chargeWindow(m, serve);
      const zone = meter.querySelector('.sp-zone');
      zone.hidden = !win;
      if (win) {
        zone.style.left = `${win[0] * 100}%`;
        zone.style.width = `${(win[1] - win[0]) * 100}%`;
      }
    }
    this.updateTarget(m, cb, idx, team);
    this.updateUi(dt, m);
  }

  /** Cincin sasaran pukulan raket saat menahan tombol. */
  updateTarget(m, cb, idx, team) {
    const show = this.charging && m.sport !== 'bola' && cb;
    this.target.visible = !!show;
    if (!show) return;
    const f = this.fields[m.sport];
    const serve = cb.held === idx;
    const me = this.local2(m);
    const o = serve ? { x: me.x, z: me.z } : this.ballLocal(cb);
    const tg = racketTarget(m, team, o.x, o.z, this.camRig.yaw + Math.PI, this.charge, serve);
    this.target.position.set(f.x + tg.tx, f.y + 0.03, f.z + tg.tz);
    const win = chargeWindow(m, serve);
    const ok = !win || (this.charge >= win[0] && this.charge <= win[1]);
    this.target.material.color.set(ok ? '#ffe066' : '#ff6b6b');
  }

  flash(text) {
    const el = $('sp-msg');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  handleEvent(m) {
    const ev = m.ev;
    if (!ev || ev.n === this.lastEvN) return;
    this.lastEvN = ev.n;
    const idx = this.myIndex(m);
    const myTeam = m.players[idx]?.team;
    const tn = (t) => `Tim ${TEAM_NAMES[t]}`;
    switch (ev.k) {
      case 'start':
        this.audio.play('whistle');
        this.flash('Mulai!');
        break;
      case 'goal':
        this.audio.play('whistle');
        this.audio.play('cheer');
        this.flash(m.mode === 'pinalti' ? 'GOL!' : ev.team === myTeam ? 'GOL!' : 'Kebobolan!');
        break;
      case 'miss':
        this.audio.play('whistle');
        this.flash(ev.why === 'timeout' ? 'Waktu habis' : ev.why === 'save' ? 'Ditepis kiper!' : ev.why === 'over' ? 'Melambung!' : 'Meleset!');
        break;
      case 'steal':
        if (ev.p === this.myId) {
          this.flash(ev.ok ? 'Bola direbut!' : 'Gagal merebut');
          if (ev.ok) this.audio.play('kick', { strength: 0.4 });
        } else if (ev.from === this.myId && ev.ok) {
          this.flash('Bola direbut lawan!');
          this.noClaimUntil = performance.now() + 700;
        }
        break;
      case 'save':
        this.audio.play('kick', { strength: 0.5 });
        this.flash(ev.how === 'catch' ? 'Ditangkap kiper!' : 'Ditepis kiper!');
        break;
      case 'out':
        this.audio.play('whistle');
        this.flash('Bola keluar');
        break;
      case 'point': {
        const why = { out: 'keluar', net: 'net', fault: 'fault' }[ev.why];
        this.audio.play(ev.team === myTeam ? 'turn' : 'click2');
        this.flash(`Poin ${tn(ev.team)}${why ? ` (${why})` : ''}`);
        break;
      }
      case 'fault':
        this.audio.play('click2');
        this.flash('Fault! Servis kedua');
        break;
      case 'end':
        this.audio.play('whistle');
        if (ev.team === myTeam) setTimeout(() => this.audio.play('win'), 300);
        break;
      case 'join':
        if (ev.p !== this.myId) this.ui.toast(`${this.playerName(ev.p)} masuk lapangan`);
        break;
      case 'decline':
        this.ui.toast(`${this.playerName(ev.p)} menolak undangan`);
        break;
      case 'leave':
        if (ev.p !== this.myId) this.ui.toast(`${this.playerName(ev.p)} meninggalkan pertandingan`);
        break;
    }
  }

  // ---------- Papan skor & panel ----------
  updateUi(dt, m) {
    this.uiTimer -= dt;
    const sig = `${m.v}|${m.phase}`;
    if (sig === this.uiSig && this.uiTimer > 0) return;
    this.uiSig = sig;
    this.uiTimer = 0.5;
    const isHost = this.host && this.host.state.id === m.id;
    const def = SPORT_DEFS[m.sport];
    const size = def.modes.find((x) => x.id === m.mode)?.size || 2;

    for (const t of [0, 1]) {
      const names = m.players.filter((p) => p.team === t).map((p) => (p.id === this.myId ? 'Kamu' : p.name));
      $(`sp-n${t}`).textContent = names.join(' · ') || `Tim ${TEAM_NAMES[t]}`;
      $(`sp-s${t}`).textContent = String(m.score[t] ?? 0);
      const k = $(`sp-k${t}`);
      if (m.mode === 'pinalti' && m.pk) {
        const kicks = m.pk.kicks[t] || [];
        const n = Math.max(5, kicks.length);
        k.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < kicks.length ? (kicks[i] ? 'in' : 'miss') : ''}"></i>`).join('');
        k.hidden = false;
      } else k.hidden = true;
    }
    let mid = '';
    if (m.phase === 'lobby') mid = 'Lobi';
    else if (m.phase === 'end') mid = 'Selesai';
    else if (m.sport === 'bola' && m.mode !== 'pinalti') mid = `${Math.floor(m.left / 60)}:${String(m.left % 60).padStart(2, '0')}`;
    else if (m.mode === 'pinalti') mid = m.pk?.shooter >= 0 ? `Tendang: ${this.short(m.players[m.pk.shooter])}` : 'Penalti';
    else if (m.rally) mid = m.rally.stage === 'serve' ? `Servis: ${this.short(m.players[m.rally.server])}` : 'Reli';
    $('sp-clock').textContent = mid;

    $('sp-lobby').hidden = m.phase !== 'lobby';
    $('sp-end').hidden = m.phase !== 'end';
    if (m.phase === 'lobby') {
      for (const t of [0, 1]) {
        const rows = [];
        const members = m.players.filter((p) => p.team === t);
        for (let i = 0; i < size / 2; i++) {
          const p = members[i];
          const li = document.createElement('li');
          if (p) {
            li.innerHTML = `<span class="dot"></span><span class="name"></span>${p.bot ? `<span class="tag">${icon('bot')}Bot</span>` : p.id === m.host ? `<span class="tag">${icon('crown')}</span>` : ''}`;
            li.querySelector('.dot').style.background = p.color;
            li.querySelector('.name').textContent = p.id === this.myId ? `${p.name} (kamu)` : p.name;
          } else {
            li.className = 'empty-seat';
            li.innerHTML = `${icon('plus')}<span class="name">Kosong</span>`;
          }
          rows.push(li);
        }
        $(`sp-t${t}`).replaceChildren(...rows);
      }
      const full = m.players.length >= size;
      const myTeam = m.players[this.myIndex(m)]?.team ?? 0;
      $('sp-invite').hidden = !isHost || full;
      $('sp-bot').hidden = !isHost || full;
      $('sp-team').hidden = teamSize(m, 1 - myTeam) >= size / 2;
      $('sp-start').hidden = !isHost;
      $('sp-start').disabled = teamSize(m, 0) < 1 || teamSize(m, 1) < 1;
      $('sp-wait').hidden = !!isHost;
      const pending = m.invited?.length ? ` · ${m.invited.length} diundang` : '';
      $('sp-wait').lastChild.textContent = `Menunggu tuan rumah…${pending}`;
    }
    if (m.phase === 'end') {
      const idx = this.myIndex(m);
      const myTeam = m.players[idx]?.team;
      const w = m.winner;
      $('sp-winner').textContent = w === -1 || w === null || w === undefined ? 'Seri!' : w === myTeam ? 'Kamu menang!' : `Tim ${TEAM_NAMES[w]} menang`;
      $('sp-final').textContent = `${m.score[0]} – ${m.score[1]}`;
      $('sp-again').hidden = !isHost || teamSize(m, 0) < 1 || teamSize(m, 1) < 1;
    }
  }

  short(p) {
    if (!p) return '';
    return p.id === this.myId ? 'kamu' : p.name;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

function ballMesh(sport) {
  const P = BALLS[sport];
  if (sport === 'bola') {
    // bola low poly: segilima gelap di 12 titik ikosahedron
    const geo = new THREE.IcosahedronGeometry(P.r, 2);
    const base = new THREE.IcosahedronGeometry(1, 0).attributes.position;
    const dirs = [];
    for (let i = 0; i < base.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(base, i).normalize();
      if (!dirs.some((d) => d.distanceTo(v) < 1e-3)) dirs.push(v);
    }
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      let dark = false;
      for (let k = 0; k < 3 && !dark; k++) {
        v.fromBufferAttribute(pos, i + k).normalize();
        dark = dirs.some((d) => d.dot(v) > 0.999);
      }
      const c = dark ? 0.08 : 0.95;
      for (let k = 0; k < 3; k++) col.set([c, c, c], (i + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.castShadow = true;
    return m;
  }
  if (sport === 'tenis') {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(P.r * 1.35, 1), new THREE.MeshLambertMaterial({ color: '#d4f23c', flatShading: true }));
    m.castShadow = true;
    return m;
  }
  // kok bulu tangkis: gabus di depan, bulu mengembang di belakang (sumbu +y = arah terbang)
  const g = new THREE.Group();
  const cork = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshLambertMaterial({ color: '#f1f3f5' }));
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.15, 10, 1, true), new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
  skirt.position.y = -0.09; // ujung sempit kerucut menempel di gabus
  cork.castShadow = skirt.castShadow = true;
  g.add(cork, skirt);
  return g;
}
