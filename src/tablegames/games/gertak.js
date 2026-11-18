import * as THREE from 'three';
import { HostBase } from '../HostBase.js';
import { HandView, Fans } from '../cardViews.js';
import { GERTAK_RANKS, GERTAK_STYLE, makeCard, setCardFace } from '../cardArt.js';

// Gertak: permainan gertakan orisinal Mabarin.
// Tiap ronde ada "kartu meja". Pemain menaruh 1–3 kartu tertutup sambil mengaku semuanya kartu meja.
// Pemain berikutnya boleh menantang "Bohong!". Yang benar memegang revolver: putar silinder lalu tembak
// ke yang kalah. Peluru = jumlah kekalahan pemain itu (1/6, 2/6, ...). Kena = tersingkir.
// Yang tersisa terakhir menang.

const RANK_NAME = { bintang: 'Bintang', bulan: 'Bulan', hati: 'Hati' };
const HAND = 5;
const key = (id) => id.split(':').slice(0, 2).join(':');
const rankOf = (id) => id.split(':')[1];

function deck() {
  const d = [];
  for (const r of GERTAK_RANKS) for (let i = 0; i < 6; i++) d.push(`g:${r}:${i}`);
  d.push('g:joker:0', 'g:joker:1');
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ---------------- Bandar ----------------
class GertakHost extends HostBase {
  constructor(o) {
    super({ ...o, game: 'gertak', min: 2, max: 4, turnMs: 25000 });
    Object.assign(this.state, { hands: {}, alive: {}, shots: {}, rank: null, pileN: 0, last: null, stage: 'turn', reveal: null, gun: null });
    this.lastCards = []; // kartu yang terakhir ditaruh — rahasia sampai ditantang
    this.timer = null;
    this.push();
  }

  setup() {
    const s = this.state;
    s.alive = {};
    s.shots = {};
    for (const p of s.players) {
      s.alive[p.id] = true;
      s.shots[p.id] = 0;
    }
    this.newRound(Math.floor(Math.random() * s.players.length));
  }

  aliveNext(from) {
    const s = this.state;
    for (let k = 1; k <= s.players.length; k++) {
      const i = this.next(from, k);
      if (s.alive[s.players[i].id]) return i;
    }
    return from;
  }

  newRound(starter) {
    const s = this.state;
    const d = deck();
    s.hands = {};
    for (const p of s.players) s.hands[p.id] = s.alive[p.id] ? d.splice(0, HAND) : [];
    s.rank = GERTAK_RANKS[Math.floor(Math.random() * GERTAK_RANKS.length)];
    s.pileN = 0;
    s.last = null;
    s.reveal = null;
    s.gun = null;
    s.stage = 'turn';
    this.lastCards = [];
    const startIdx = s.alive[s.players[starter]?.id] ? starter : this.aliveNext(starter);
    this.setTurn(startIdx);
  }

  play(pid, cards) {
    const s = this.state;
    if (!this.isTurn(pid) || s.stage !== 'turn' || !Array.isArray(cards)) return;
    const hand = s.hands[pid];
    const uniq = [...new Set(cards)];
    if (uniq.length < 1 || uniq.length > 3 || !uniq.every((c) => hand.includes(c))) return;
    s.hands[pid] = hand.filter((c) => !uniq.includes(c));
    s.pileN += uniq.length;
    s.last = { p: pid, n: uniq.length };
    this.lastCards = uniq;
    this.setTurn(this.aliveNext(s.turn));
    this.push({ k: 'play', p: pid, n: uniq.length });
  }

  call(pid) {
    const s = this.state;
    if (!this.isTurn(pid) || s.stage !== 'turn' || !s.last || s.last.p === pid) return;
    const truthful = this.lastCards.every((c) => rankOf(c) === s.rank || rankOf(c) === 'joker');
    const loser = truthful ? pid : s.last.p;
    s.stage = 'reveal';
    s.reveal = { p: s.last.p, caller: pid, cards: this.lastCards, truthful, loser };
    this.push({ k: 'reveal', p: pid, liar: s.last.p, truthful, loser });
    const shooter = truthful ? s.last.p : pid; // yang benar memegang revolver
    this.timer = { at: Date.now() + 2600, fn: () => this.gunStage(shooter, loser) };
  }

  /** Revolver: peluru sebanyak kekalahan si kalah (1/6, 2/6, ...). */
  gunStage(shooter, target) {
    const s = this.state;
    s.shots[target] = Math.min(6, (s.shots[target] || 0) + 1);
    s.stage = 'gun';
    s.gun = { shooter, target, bullets: s.shots[target], spun: false };
    this.gunAt = Date.now();
    this.push({ k: 'gun', p: shooter, target, bullets: s.gun.bullets });
  }

  spin(pid) {
    const s = this.state;
    if (s.stage !== 'gun' || s.gun.shooter !== pid || s.gun.spun) return;
    s.gun.spun = true;
    this.push({ k: 'spin', p: pid });
  }

  shoot(pid) {
    const s = this.state, g = s.gun;
    if (s.stage !== 'gun' || g.shooter !== pid || !g.spun) return;
    const boom = Math.random() < g.bullets / 6;
    if (boom) s.alive[g.target] = false;
    s.stage = 'shot';
    this.push({ k: 'shot', p: g.target, by: pid, boom, bullets: g.bullets });
    this.timer = { at: Date.now() + 2600, fn: () => this.afterShot(g.target) };
  }

  afterShot(loser) {
    const s = this.state;
    const alive = s.players.filter((p) => s.alive[p.id]);
    if (alive.length <= 1) return this.end(alive[0]?.id || null);
    const li = this.index(loser);
    this.newRound(li >= 0 && s.alive[loser] ? li : this.aliveNext(Math.max(0, li)));
    this.push({ k: 'round' });
  }

  onAction(a, from) {
    if (a.a === 'play') this.play(from, a.cards);
    else if (a.a === 'call') this.call(from);
    else if (a.a === 'spin') this.spin(from);
    else if (a.a === 'shoot') this.shoot(from);
  }

  onTick(now) {
    if (this.timer && now >= this.timer.at) {
      const fn = this.timer.fn;
      this.timer = null;
      fn();
    }
    // revolver dipegang bot / pemain yang terlalu lama
    const g = this.state.gun;
    if (this.state.stage === 'gun' && g) {
      const shooter = this.state.players.find((p) => p.id === g.shooter);
      const wait = now - this.gunAt;
      if ((shooter?.bot && wait > 1200) || wait > 15000) this.spin(g.shooter);
      if ((shooter?.bot && wait > 2600) || wait > 16500) this.shoot(g.shooter);
    }
    // jaga agar timer giliran tidak berjalan saat pengungkapan
    if (this.state.stage !== 'turn') this.state.turnAt = now;
  }

  onLeave(pid, idx) {
    const s = this.state;
    s.alive[pid] = false;
    const g = s.gun;
    super.onLeave(pid, idx);
    const alive = s.players.filter((p) => s.alive[p.id]);
    if (alive.length <= 1) return this.end(alive[0]?.id || null);
    // penembak / sasaran keluar saat revolver dipegang: lanjut ronde baru
    if (s.stage === 'gun' && g && (g.shooter === pid || g.target === pid)) {
      this.timer = null;
      this.newRound(s.turn);
      this.push({ k: 'round' });
    }
  }

  onTimeout(p) {
    const s = this.state;
    if (s.stage !== 'turn') return;
    if (!s.hands[p.id].length && s.last) this.call(p.id);
    else if (s.hands[p.id].length) this.play(p.id, [s.hands[p.id][0]]);
  }

  botMove(p) {
    const s = this.state;
    if (s.stage !== 'turn') return;
    const hand = s.hands[p.id];
    const good = hand.filter((c) => rankOf(c) === s.rank || rankOf(c) === 'joker');
    if (s.last && s.last.p !== p.id) {
      const pCall = !hand.length ? 1 : 0.18 + 0.14 * s.last.n + (good.length >= 3 ? 0.2 : 0);
      if (Math.random() < pCall) return this.call(p.id);
    }
    if (!hand.length) return;
    if (good.length) this.play(p.id, good.slice(0, 1 + Math.floor(Math.random() * Math.min(2, good.length))));
    else this.play(p.id, [hand[Math.floor(Math.random() * hand.length)]]);
  }
}

// ---------------- Tampilan meja ----------------
const METAL = new THREE.MeshLambertMaterial({ color: '#3d434b', flatShading: true });
const GRIP = new THREE.MeshLambertMaterial({ color: '#7a4a24', flatShading: true });
const DRUM_MAT = new THREE.MeshLambertMaterial({ color: '#5c636d', flatShading: true });
const DRUM_DEAD = new THREE.MeshLambertMaterial({ color: '#adb5bd', flatShading: true });
const SLOT_EMPTY = new THREE.MeshBasicMaterial({ color: '#1d2333' });
const SLOT_LOADED = new THREE.MeshBasicMaterial({ color: '#f2c14e' });

/** Revolver low poly (laras mengarah ke +Z). */
function makeRevolver() {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.011, 0.012, 0.15, 8), METAL, 0, 0.012, 0.07, Math.PI / 2);
  add(new THREE.BoxGeometry(0.03, 0.042, 0.075), METAL, 0, 0.002, -0.01);
  add(new THREE.BoxGeometry(0.028, 0.075, 0.034), GRIP, 0, -0.045, -0.048, 0.35);
  add(new THREE.BoxGeometry(0.008, 0.02, 0.012), METAL, 0, 0.03, -0.04, -0.4);
  const drum = add(new THREE.CylinderGeometry(0.027, 0.027, 0.046, 6), DRUM_MAT, 0, 0.004, 0.0, Math.PI / 2);
  const flash = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), new THREE.MeshBasicMaterial({ color: '#ffd43b', transparent: true }));
  flash.position.set(0, 0.012, 0.16);
  flash.visible = false;
  g.add(flash);
  g.userData = { drum, flash };
  return g;
}

class GertakRenderer {
  constructor(ctx, table) {
    this.ctx = ctx;
    this.table = table;
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    this.rankCard = makeCard('g:bintang');
    this.rankCard.scale.setScalar(0.2);
    this.rankCard.rotation.x = -Math.PI / 2;
    this.rankCard.position.set(table.x, table.y + 0.003, table.z);
    this.group.add(this.rankCard);
    this.pile = [];
    this.revealCards = [];
    this.fans = new Fans(this.group, table);
    this.drums = new Map();
    this.gun = makeRevolver();
    this.gun.visible = false;
    this.group.add(this.gun);
    this.spinT = 0;
    this.recoil = 0;
    this.flashT = 0;
    this.lastEv = -1;
  }

  /** Silinder kecil di depan tiap pemain: lubang kuning = peluru (jumlah kekalahan). */
  drumFor(pid) {
    let d = this.drums.get(pid);
    if (d) return d;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.026, 12), DRUM_MAT);
    body.position.y = 0.013;
    body.castShadow = true;
    g.add(body);
    const slots = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 8), SLOT_EMPTY);
      sl.position.set(Math.sin(a) * 0.024, 0.027, Math.cos(a) * 0.024);
      g.add(sl);
      slots.push(sl);
    }
    this.group.add(g);
    d = { g, body, slots };
    this.drums.set(pid, d);
    return d;
  }

  seatPos(m, pid) {
    const i = m.players.findIndex((p) => p.id === pid);
    return i >= 0 ? this.ctx.seatOf(m, i) : null;
  }

  update(dt, m, viewerId) {
    const t = this.table;
    const live = m.phase !== 'lobby';
    this.rankCard.visible = live && !!m.rank;
    if (m.rank) setCardFace(this.rankCard, `g:${m.rank}`);
    // tumpukan kartu tertutup
    const n = live ? Math.min(m.pileN || 0, 14) : 0;
    while (this.pile.length < n) {
      const c = makeCard(null);
      c.scale.setScalar(0.15);
      c.rotation.set(-Math.PI / 2, 0, Math.random() * 0.8 - 0.4);
      this.group.add(c);
      this.pile.push(c);
    }
    this.pile.forEach((c, i) => {
      c.visible = i < n;
      c.position.set(t.x + 0.2, t.y + 0.003 + i * 0.0018, t.z - 0.12 + (i % 3) * 0.01);
    });
    // kartu yang dibuka saat ditantang
    const rev = ['reveal', 'gun', 'shot'].includes(m.stage) && m.reveal ? m.reveal.cards : [];
    while (this.revealCards.length < rev.length) {
      const c = makeCard(null);
      c.scale.setScalar(0.15);
      this.group.add(c);
      this.revealCards.push(c);
    }
    this.revealCards.forEach((c, i) => {
      c.visible = i < rev.length;
      if (!c.visible) return;
      setCardFace(c, key(rev[i]));
      c.rotation.set(-Math.PI / 2, 0, 0);
      c.position.set(t.x - 0.13 + i * 0.13, t.y + 0.006, t.z + 0.16);
    });
    // kartu tertutup lawan (di atas meja) & silinder peluru tiap pemain
    this.fans.update(m, viewerId, (i) => this.ctx.seatOf(m, i), (pid) => (live && m.alive?.[pid] !== false ? m.hands?.[pid]?.length || 0 : 0));
    const seen = new Set();
    m.players.forEach((p, i) => {
      if (!live) return;
      seen.add(p.id);
      const d = this.drumFor(p.id);
      const s = this.ctx.seatOf(m, i);
      const dx = s.x - t.x, dz = s.z - t.z, len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;
      // di sisi kanan pemain, agak ke tengah
      d.g.position.set(t.x + ux * 0.4 - uz * 0.26, t.y, t.z + uz * 0.4 + ux * 0.26);
      const alive = m.alive?.[p.id] !== false;
      d.body.material = alive ? DRUM_MAT : DRUM_DEAD;
      d.slots.forEach((sl, k) => (sl.material = k < (m.shots?.[p.id] || 0) ? SLOT_LOADED : SLOT_EMPTY));
    });
    for (const [id, d] of this.drums) {
      if (!seen.has(id)) {
        d.g.removeFromParent();
        this.drums.delete(id);
      }
    }
    // revolver: dipegang yang benar, mengarah ke yang kalah
    const g = m.gun;
    const showGun = live && g && (m.stage === 'gun' || m.stage === 'shot');
    this.gun.visible = !!showGun;
    if (showGun) {
      const a = this.seatPos(m, g.shooter), b = this.seatPos(m, g.target);
      if (a && b) {
        this.gun.position.set(t.x + (a.x - t.x) * 0.45, t.y + 0.17, t.z + (a.z - t.z) * 0.45);
        this.gun.lookAt(b.x, t.y + 0.35, b.z);
        this.gun.rotateX(-this.recoil);
      }
    }
    if (m.ev && m.ev.n !== this.lastEv) {
      if (this.lastEv !== -1) {
        if (m.ev.k === 'spin') this.spinT = 1.2;
        if (m.ev.k === 'shot') {
          this.recoil = 0.5;
          this.flashT = m.ev.boom ? 0.14 : 0;
        }
      }
      this.lastEv = m.ev.n;
    }
    if (this.spinT > 0) {
      this.spinT = Math.max(0, this.spinT - dt);
      this.gun.userData.drum.rotation.y += dt * 30 * this.spinT;
    }
    this.recoil = Math.max(0, this.recoil - dt * 1.6);
    this.flashT = Math.max(0, this.flashT - dt);
    this.gun.userData.flash.visible = this.flashT > 0;
    this.gun.userData.flash.scale.setScalar(1 + (0.14 - this.flashT) * 8);
  }

  dispose() {
    this.fans.dispose();
    this.group.removeFromParent();
  }
}

// ---------------- Kontrol pemain ----------------
class GertakControls {
  constructor(ctx) {
    this.ctx = ctx;
    this.hand = new HandView(ctx.scene);
    this.sel = new Set();
    this.hover = null;
  }

  enter() {
    this.btnCall = this.ctx.button('mask', 'Bohong!', () => this.ctx.act({ a: 'call' }), 'kilat', 'cu-call');
    this.btnPlay = this.ctx.button('arrowRight', 'Taruh', () => {
      this.ctx.act({ a: 'play', cards: [...this.sel] });
      this.sel.clear();
    }, 'primary', 'cu-play');
    this.btnSpin = this.ctx.button('refresh', 'Putar', () => this.ctx.act({ a: 'spin' }), 'primary', 'cu-spin');
    this.btnShoot = this.ctx.button('revolver', 'Tembak', () => this.ctx.act({ a: 'shoot' }), 'kilat', 'cu-shoot');
  }

  exit() {
    this.hand.clear();
  }

  myTurn(m) {
    return m.phase === 'play' && m.stage === 'turn' && m.players[m.turn]?.id === this.ctx.myId;
  }

  update(dt, m) {
    const me = this.ctx.myId;
    const ids = m.phase === 'lobby' ? [] : [...(m.hands?.[me] || [])].sort();
    for (const id of [...this.sel]) if (!ids.includes(id)) this.sel.delete(id);
    const mine = this.myTurn(m);
    this.hand.layout(dt, {
      ids,
      eye: this.ctx.eye(new THREE.Vector3()),
      rot: this.ctx.seatRot(),
      camera: this.ctx.camera,
      key,
      hover: this.hover,
      look: (id) => (this.sel.has(id) ? 'selected' : 'flat'),
    });
    this.btnPlay.hidden = !mine || !this.sel.size || !ids.length;
    this.btnPlay.querySelector('span').textContent = `Taruh ${this.sel.size} ${RANK_NAME[m.rank] || ''}`;
    this.btnCall.hidden = !mine || !m.last || m.last.p === me;
    const shooter = m.phase === 'play' && m.stage === 'gun' && m.gun?.shooter === me;
    this.btnSpin.hidden = !shooter || m.gun.spun;
    this.btnShoot.hidden = !shooter || !m.gun.spun;
  }

  chip(m) {
    if (m.phase !== 'play' || !m.rank) return null;
    const st = GERTAK_STYLE[m.rank];
    return { bg: st.bg, title: `Kartu meja: ${RANK_NAME[m.rank]}`, html: `<svg class="ic" viewBox="0 0 24 24"><path d="${st.path}" fill="#fff"/></svg>` };
  }

  targets() {
    return this.hand.targets();
  }

  setHover(obj) {
    this.hover = obj?.userData.cardId || null;
  }

  click(obj, m) {
    const id = obj?.userData.cardId;
    if (!id || m.phase !== 'play') return;
    if (this.sel.has(id)) this.sel.delete(id);
    else if (this.sel.size < 3) this.sel.add(id);
    else this.ctx.flash('Maksimal 3 kartu');
    this.ctx.audio.play('click');
  }

  onEvent(ev, m) {
    const name = this.ctx.playerName;
    if (ev.k === 'play') {
      this.ctx.playAtTable('card', m);
      this.ctx.flash(`${name(ev.p)}: ${ev.n} ${RANK_NAME[m.rank]}`);
    } else if (ev.k === 'reveal') {
      this.ctx.playAtTable('kilat', m);
      this.ctx.flash(ev.truthful ? `Jujur! ${name(ev.loser)} kalah` : `Bohong! ${name(ev.liar)} ketahuan`);
    } else if (ev.k === 'gun') {
      this.ctx.playAtTable('cock', m);
      this.ctx.flash(ev.p === this.ctx.myId ? `Putar silinder, tembak ${name(ev.target)} (${ev.bullets}/6)` : `${name(ev.p)} memegang revolver — ${ev.bullets}/6 peluru`);
    } else if (ev.k === 'spin') {
      this.ctx.playAtTable('spin', m);
    } else if (ev.k === 'shot') {
      this.ctx.playAtTable(ev.boom ? 'gunshot' : 'dryfire', m);
      this.ctx.flash(ev.boom ? `DOR! ${name(ev.p)} tersingkir` : `Klik… ${name(ev.p)} selamat (${ev.bullets}/6)`);
    } else if (ev.k === 'round') {
      this.ctx.playAtTable('shuffle', m);
      this.ctx.flash(`Kartu meja: ${RANK_NAME[m.rank]}`);
    }
  }
}

export default {
  id: 'gertak',
  name: 'Gertak',
  icon: 'mask',
  art: 'linear-gradient(135deg, #7048e8, #e03131)',
  min: 2,
  max: 4,
  seatOrder: (n) => (n === 2 ? [0, 2] : [0, 1, 2, 3]), // berdua: duduk berhadapan
  topView: false,
  Host: GertakHost,
  Renderer: GertakRenderer,
  Controls: GertakControls,
};
