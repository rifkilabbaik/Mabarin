import * as THREE from 'three';
import { HostBase } from '../HostBase.js';
import { HandView, Fans } from '../cardViews.js';
import { GERTAK_RANKS, GERTAK_STYLE, makeCard, setCardFace } from '../cardArt.js';

// Gertak: permainan gertakan orisinal Mabarin.
// Tiap ronde ada "kartu meja". Pemain menaruh 1–3 kartu tertutup sambil mengaku semuanya kartu meja.
// Pemain berikutnya boleh menantang "Bohong!". Yang kalah membuka Kotak Kejutan (peluang 1/6, lalu 1/5, ...).
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
    Object.assign(this.state, { hands: {}, alive: {}, shots: {}, rank: null, pileN: 0, last: null, stage: 'turn', reveal: null });
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
    this.timer = { at: Date.now() + 2600, fn: () => this.penalty(loser) };
  }

  penalty(loser) {
    const s = this.state;
    const shots = s.shots[loser] || 0;
    const boom = Math.random() < 1 / Math.max(1, 6 - shots);
    if (boom) s.alive[loser] = false;
    else s.shots[loser] = shots + 1;
    s.stage = 'box';
    this.push({ k: 'box', p: loser, boom, shots: s.shots[loser] });
    this.timer = {
      at: Date.now() + 2200,
      fn: () => {
        const alive = s.players.filter((p) => s.alive[p.id]);
        if (alive.length <= 1) return this.end(alive[0]?.id || null);
        const li = this.index(loser);
        this.newRound(s.alive[loser] ? li : this.aliveNext(li));
        this.push({ k: 'round' });
      },
    };
  }

  onAction(a, from) {
    if (a.a === 'play') this.play(from, a.cards);
    else if (a.a === 'call') this.call(from);
  }

  onTick(now) {
    if (this.timer && now >= this.timer.at) {
      const fn = this.timer.fn;
      this.timer = null;
      fn();
    }
    // jaga agar timer giliran tidak berjalan saat pengungkapan
    if (this.state.stage !== 'turn') this.state.turnAt = now;
  }

  onLeave(pid, idx) {
    this.state.alive[pid] = false;
    super.onLeave(pid, idx);
    const alive = this.state.players.filter((p) => this.state.alive[p.id]);
    if (alive.length <= 1) this.end(alive[0]?.id || null);
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
const confettiColors = ['#ff6b6b', '#fcc419', '#51cf66', '#4dabf7', '#b197fc'];
const BOX_MAT = new THREE.MeshLambertMaterial({ color: '#7048e8', flatShading: true });
const BOX_DEAD = new THREE.MeshLambertMaterial({ color: '#868e96', flatShading: true });
const LAMP_OFF = new THREE.MeshBasicMaterial({ color: '#343a40' });
const LAMP_ON = new THREE.MeshBasicMaterial({ color: '#ff6b6b' });

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
    this.fans = new Fans(this.group);
    this.boxes = new Map();
    this.confetti = [];
    this.lastEv = -1;
  }

  boxFor(pid) {
    let b = this.boxes.get(pid);
    if (b) return b;
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.1), BOX_MAT);
    box.position.y = 0.035;
    box.castShadow = true;
    g.add(box);
    const lamps = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), LAMP_OFF);
      l.position.set(-0.035 + (i % 3) * 0.035, 0.074, -0.018 + ((i / 3) | 0) * 0.036);
      g.add(l);
      lamps.push(l);
    }
    this.group.add(g);
    b = { g, box, lamps };
    this.boxes.set(pid, b);
    return b;
  }

  burst(pos) {
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.012), new THREE.MeshBasicMaterial({ color: confettiColors[i % 5], side: THREE.DoubleSide }));
      m.position.copy(pos);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 2.4, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2.4);
      m.userData.life = 1.6;
      this.group.add(m);
      this.confetti.push(m);
    }
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
      c.position.set(t.x + 0.22, t.y + 0.003 + i * 0.0018, t.z - 0.05 + (i % 3) * 0.01);
    });
    // kartu yang dibuka saat ditantang
    const rev = (m.stage === 'reveal' || m.stage === 'box') && m.reveal ? m.reveal.cards : [];
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
      c.position.set(t.x - 0.2 + i * 0.12, t.y + 0.006, t.z + 0.18);
    });
    // kartu tertutup di tangan lawan & kotak kejutan
    this.fans.update(m, viewerId, (i) => this.ctx.seatOf(m, i), (pid) => (live ? m.hands?.[pid]?.length || 0 : 0));
    const seen = new Set();
    m.players.forEach((p, i) => {
      if (!live) return;
      seen.add(p.id);
      const b = this.boxFor(p.id);
      const s = this.ctx.seatOf(m, i);
      b.g.position.set(t.x + (s.x - t.x) * 0.52, t.y, t.z + (s.z - t.z) * 0.52);
      b.g.rotation.y = s.rot;
      const alive = m.alive?.[p.id] !== false;
      b.box.material = alive ? BOX_MAT : BOX_DEAD;
      b.lamps.forEach((l, k) => (l.material = k < (m.shots?.[p.id] || 0) ? LAMP_ON : LAMP_OFF));
    });
    for (const [id, b] of this.boxes) {
      if (!seen.has(id)) {
        b.g.removeFromParent();
        this.boxes.delete(id);
      }
    }
    if (m.ev && m.ev.n !== this.lastEv) {
      if (this.lastEv !== -1 && m.ev.k === 'box' && m.ev.boom) {
        const b = this.boxes.get(m.ev.p);
        if (b) this.burst(b.g.position.clone().setY(t.y + 0.1));
      }
      this.lastEv = m.ev.n;
    }
    for (const c of this.confetti) {
      c.userData.life -= dt;
      c.userData.v.y -= 5 * dt;
      c.position.addScaledVector(c.userData.v, dt);
      c.rotation.x += dt * 9;
      c.rotation.y += dt * 7;
      if (c.userData.life <= 0) c.removeFromParent();
    }
    this.confetti = this.confetti.filter((c) => c.userData.life > 0);
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
    } else if (ev.k === 'box') {
      this.ctx.playAtTable(ev.boom ? 'boom' : 'click2', m);
      this.ctx.flash(ev.boom ? `DUAR! ${name(ev.p)} tersingkir` : `${name(ev.p)} selamat (${ev.shots}/6)`);
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
  seatOrder: [0, 1, 2, 3],
  topView: false,
  Host: GertakHost,
  Renderer: GertakRenderer,
  Controls: GertakControls,
};
