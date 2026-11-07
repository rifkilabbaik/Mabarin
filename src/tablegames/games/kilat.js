import * as THREE from 'three';
import { HostBase } from '../HostBase.js';
import { HandView, Fans } from '../cardViews.js';
import { makeCard, setCardFace } from '../cardArt.js';
import { HAND_SIZE, SUITS, SUIT_INFO, bestColor, botChoose, canPlay, faceKey, makeDeck, parse, shuffle } from './kilatRules.js';

const SUIT_ORDER = Object.fromEntries(SUITS.map((s, i) => [s, i]));
const VALUE_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', 'p2', 'wild', 'wild4'];
const sortHand = (ids) => [...ids].sort((a, b) => {
  const A = parse(a), B = parse(b);
  return (A.wild ? 9 : SUIT_ORDER[A.suit]) - (B.wild ? 9 : SUIT_ORDER[B.suit]) || VALUE_ORDER.indexOf(A.value) - VALUE_ORDER.indexOf(B.value) || (a < b ? -1 : 1);
});
const hash = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return h; };

// ---------------- Bandar ----------------
class KilatHost extends HostBase {
  constructor(o) {
    super({ ...o, game: 'kilat', min: 2, max: 4 });
    this.deck = [];
    this.pile = [];
    Object.assign(this.state, { hands: {}, discard: [], drawN: 0, color: null, dir: 1, drew: false, kilat: [] });
    this.push();
  }

  beforePublish() {
    this.state.drawN = this.deck.length;
    this.state.discard = this.pile.slice(-5);
  }

  setup() {
    const s = this.state;
    this.deck = shuffle(makeDeck());
    this.pile = [];
    s.hands = {};
    for (const p of s.players) s.hands[p.id] = this.deck.splice(0, HAND_SIZE);
    const i = this.deck.findIndex((id) => parse(id).number);
    const first = this.deck.splice(i, 1)[0];
    this.pile.push(first);
    s.color = parse(first).suit;
    s.dir = 1;
    s.kilat = [];
    this.setTurn(Math.floor(Math.random() * s.players.length));
  }

  onTurn() {
    const s = this.state;
    s.drew = false;
    s.kilat = s.kilat.filter((id) => (s.hands[id]?.length ?? 99) <= 2);
  }

  step(from, n = 1) {
    return this.next(from, n, this.state.dir);
  }

  drawOne() {
    if (!this.deck.length) {
      const top = this.pile.pop();
      this.deck = shuffle(this.pile);
      this.pile = top ? [top] : [];
    }
    return this.deck.pop() || null;
  }

  give(pid, n) {
    const hand = this.state.hands[pid];
    if (!hand) return;
    for (let i = 0; i < n; i++) {
      const c = this.drawOne();
      if (c) hand.push(c);
    }
    if (hand.length > 2) this.state.kilat = this.state.kilat.filter((id) => id !== pid);
  }

  onAction(a, from) {
    if (a.a === 'play') this.play(from, a.c, a.col);
    else if (a.a === 'draw') this.draw(from);
    else if (a.a === 'pass') this.pass(from);
    else if (a.a === 'kilat') this.kilat(from);
  }

  play(pid, card, col) {
    const s = this.state;
    if (!this.isTurn(pid)) return;
    const hand = s.hands[pid];
    const idx = hand.indexOf(card);
    if (idx < 0 || !canPlay(card, this.pile[this.pile.length - 1], s.color)) return;
    const c = parse(card);
    hand.splice(idx, 1);
    this.pile.push(card);
    s.color = c.wild ? (SUITS.includes(col) ? col : bestColor(hand)) : c.suit;
    const ev = { k: 'play', p: pid, c: card, col: s.color };
    if (!hand.length) {
      this.end(pid, { c: card });
      return;
    }
    if (hand.length === 1 && !s.kilat.includes(pid)) {
      this.give(pid, 2);
      ev.pen = 2;
    }
    let skip = false, draw = 0;
    if (c.value === 'skip') skip = true;
    else if (c.value === 'rev') {
      if (s.players.length === 2) skip = true;
      else s.dir *= -1;
    } else if (c.value === 'p2') { draw = 2; skip = true; }
    else if (c.value === 'wild4') { draw = 4; skip = true; }
    let next = this.step(s.turn);
    if (draw) {
      this.give(s.players[next].id, draw);
      ev.draw = { p: s.players[next].id, n: draw };
    }
    if (skip) {
      ev.skip = s.players[next].id;
      next = this.step(next);
    }
    this.setTurn(next);
    this.push(ev);
  }

  draw(pid) {
    const s = this.state;
    if (!this.isTurn(pid) || s.drew) return;
    this.give(pid, 1);
    s.drew = true;
    const top = this.pile[this.pile.length - 1];
    if (!s.hands[pid].some((id) => canPlay(id, top, s.color))) this.setTurn(this.step(s.turn));
    this.push({ k: 'draw', p: pid });
  }

  pass(pid) {
    if (!this.isTurn(pid) || !this.state.drew) return;
    this.setTurn(this.step(this.state.turn));
    this.push({ k: 'pass', p: pid });
  }

  kilat(pid) {
    const s = this.state;
    if ((s.hands[pid]?.length ?? 99) > 2 || s.kilat.includes(pid)) return;
    s.kilat.push(pid);
    this.push({ k: 'kilat', p: pid });
  }

  onLeave(pid, idx) {
    this.deck.unshift(...(this.state.hands[pid] || []));
    delete this.state.hands[pid];
    super.onLeave(pid, idx);
  }

  onTimeout(p) {
    if (!this.state.drew) this.draw(p.id);
    if (this.isTurn(p.id)) this.pass(p.id);
  }

  botMove(p) {
    const s = this.state;
    const hand = s.hands[p.id];
    const card = botChoose(hand, this.pile[this.pile.length - 1], s.color);
    if (card) {
      if (hand.length === 2 && Math.random() < 0.85) this.kilat(p.id);
      this.play(p.id, card, bestColor(hand.filter((c) => c !== card)));
    } else if (!s.drew) this.draw(p.id);
    else this.pass(p.id);
  }
}

// ---------------- Tampilan meja (untuk semua pemain) ----------------
class KilatRenderer {
  constructor(ctx, table) {
    this.ctx = ctx;
    this.table = table;
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    const side = new THREE.Vector3(table.seats[1].x - table.x, 0, table.seats[1].z - table.z).normalize();
    this.drawSlot = new THREE.Vector3(table.x + side.x * 0.26, table.y, table.z + side.z * 0.26);
    this.pileSlot = new THREE.Vector3(table.x - side.x * 0.1, table.y, table.z - side.z * 0.1);
    this.pile = [];
    this.drawTop = makeCard(null);
    this.drawTop.scale.setScalar(0.17);
    this.drawTop.rotation.set(-Math.PI / 2, 0, 0.2);
    this.drawTop.userData.front.userData.isDrawPile = true;
    this.drawBox = new THREE.Mesh(new THREE.BoxGeometry(0.166, 1, 0.25), new THREE.MeshLambertMaterial({ color: '#d9dde6' }));
    this.drawBox.rotation.y = -0.2;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 6, 28), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.copy(this.pileSlot).setY(table.y + 0.004);
    this.group.add(this.drawTop, this.drawBox, this.ring);
    this.fans = new Fans(this.group);
    this.anim = null;
    this.lastEv = -1;
    this.time = 0;
  }

  update(dt, m, viewerId) {
    this.time += dt;
    const t = this.table;
    const live = m.phase !== 'lobby';
    const discard = live ? m.discard || [] : [];
    while (this.pile.length < discard.length) {
      const card = makeCard(null);
      card.scale.setScalar(0.17);
      this.group.add(card);
      this.pile.push(card);
    }
    this.pile.forEach((card, i) => {
      const id = discard[i];
      card.visible = !!id;
      if (!id) return;
      setCardFace(card, faceKey(id));
      const h = hash(id);
      card.rotation.set(-Math.PI / 2, 0, ((h % 100) / 100) * 0.9 - 0.45);
      card.userData.target = new THREE.Vector3(this.pileSlot.x + (((h >> 3) % 7) - 3) * 0.006, t.y + 0.002 + i * 0.0015, this.pileSlot.z + (((h >> 6) % 7) - 3) * 0.006);
      if (!(this.anim && this.anim.card === card)) card.position.copy(card.userData.target);
    });
    if (m.ev && m.ev.n !== this.lastEv) {
      if (this.lastEv !== -1 && (m.ev.k === 'play' || m.ev.k === 'win') && discard.length) {
        const idx = m.players.findIndex((p) => p.id === m.ev.p);
        const top = this.pile[discard.length - 1];
        if (idx >= 0 && top) {
          const s = this.ctx.seatOf(m, idx);
          this.anim = { card: top, t: 0, from: new THREE.Vector3(s.x + Math.sin(s.rot) * 0.35, s.y + 0.65, s.z + Math.cos(s.rot) * 0.35) };
        }
      }
      this.lastEv = m.ev.n;
    }
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / 0.35);
      const k = 1 - (1 - a.t) ** 3;
      a.card.position.lerpVectors(a.from, a.card.userData.target, k);
      a.card.position.y += Math.sin(k * Math.PI) * 0.12;
      if (a.t >= 1) this.anim = null;
    }
    const n = live ? m.drawN || 0 : 0;
    const hgt = 0.004 + Math.min(n, 90) * 0.0011;
    this.drawBox.visible = this.drawTop.visible = live && n > 0;
    this.drawBox.scale.y = hgt;
    this.drawBox.position.set(this.drawSlot.x, t.y + hgt / 2, this.drawSlot.z);
    this.drawTop.position.set(this.drawSlot.x, t.y + hgt + 0.001, this.drawSlot.z);
    this.ring.visible = live && m.phase === 'play';
    if (m.color) this.ring.material.color.set(SUIT_INFO[m.color]?.color || '#fff');
    this.ring.scale.setScalar(1 + Math.sin(this.time * 4) * 0.04);
    this.fans.update(m, viewerId, (i) => this.ctx.seatOf(m, i), (pid) => (live ? m.hands?.[pid]?.length || 0 : 0));
  }

  dispose() {
    this.fans.dispose();
    this.group.removeFromParent();
  }
}

// ---------------- Kontrol pemain ----------------
class KilatControls {
  constructor(ctx) {
    this.ctx = ctx;
    this.hand = new HandView(ctx.scene);
    this.hover = null;
    this.pendingWild = null;
    this.colorPanel = document.getElementById('cu-colors');
    const grid = this.colorPanel.querySelector('.cu-color-grid');
    grid.replaceChildren(
      ...SUITS.map((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.style.background = SUIT_INFO[s].color;
        b.setAttribute('aria-label', SUIT_INFO[s].name);
        b.addEventListener('click', () => this.chooseColor(s));
        return b;
      })
    );
  }

  enter() {
    this.btnKilat = this.ctx.button('bolt', 'Kilat!', () => this.ctx.act({ a: 'kilat' }), 'kilat', 'cu-kilat');
    this.btnDraw = this.ctx.button('plus', 'Ambil', () => this.ctx.act({ a: 'draw' }), '', 'cu-draw');
    this.btnPass = this.ctx.button('arrowRight', 'Lewat', () => this.ctx.act({ a: 'pass' }), '', 'cu-pass');
  }

  exit() {
    this.hand.clear();
    this.colorPanel.hidden = true;
    this.pendingWild = null;
  }

  myTurn(m) {
    return m.phase === 'play' && m.players[m.turn]?.id === this.ctx.myId;
  }

  update(dt, m) {
    const me = this.ctx.myId;
    const ids = m.phase === 'lobby' ? [] : sortHand(m.hands?.[me] || []);
    const mine = this.myTurn(m);
    const top = m.discard?.[m.discard.length - 1];
    this.hand.layout(dt, {
      ids,
      eye: this.ctx.eye(new THREE.Vector3()),
      rot: this.ctx.seatRot(),
      camera: this.ctx.camera,
      key: faceKey,
      hover: this.hover,
      look: (id) => (mine ? (canPlay(id, top, m.color) ? 'normal' : 'dim') : 'flat'),
    });
    const hand = m.hands?.[me] || [];
    this.btnDraw.hidden = !mine || m.drew;
    this.btnPass.hidden = !mine || !m.drew;
    this.btnKilat.hidden = !mine || hand.length !== 2 || m.kilat?.includes(me);
    if (m.phase !== 'play') {
      this.colorPanel.hidden = true;
      this.pendingWild = null;
    }
  }

  chip(m) {
    if (m.phase !== 'play') return null;
    return { bg: SUIT_INFO[m.color]?.color, title: SUIT_INFO[m.color]?.name, dir: m.dir };
  }

  targets(m) {
    const list = this.hand.targets();
    const r = this.ctx.renderer(m);
    if (r?.drawTop.visible) list.push(r.drawTop.userData.front);
    return list;
  }

  setHover(obj) {
    this.hover = obj?.userData.cardId || null;
  }

  click(obj, m) {
    if (m.phase !== 'play' || !obj) return;
    if (!this.myTurn(m)) return this.ctx.flash('Bukan giliranmu');
    if (obj.userData.isDrawPile) {
      if (!m.drew) this.ctx.act({ a: 'draw' });
      return;
    }
    const id = obj.userData.cardId;
    if (!id) return;
    if (!canPlay(id, m.discard?.[m.discard.length - 1], m.color)) {
      this.ctx.flash('Kartu tidak cocok');
      this.ctx.audio.play('click');
      return;
    }
    if (parse(id).wild) {
      this.pendingWild = id;
      this.colorPanel.hidden = false;
      return;
    }
    this.ctx.act({ a: 'play', c: id });
  }

  chooseColor(suit) {
    this.colorPanel.hidden = true;
    if (!this.pendingWild) return;
    this.ctx.act({ a: 'play', c: this.pendingWild, col: suit });
    this.pendingWild = null;
  }

  onEvent(ev, m) {
    const name = this.ctx.playerName;
    const at = (n) => this.ctx.playAtTable(n, m);
    if (ev.k === 'play') {
      at('card');
      const c = parse(ev.c);
      if (ev.pen) this.ctx.flash(`${name(ev.p)} lupa Kilat! +2`);
      else if (ev.draw) this.ctx.flash(`${name(ev.draw.p)} +${ev.draw.n}`);
      else if (ev.skip) this.ctx.flash(`${name(ev.skip)} dilewati`);
      else if (c.value === 'rev') this.ctx.flash('Arah dibalik');
      else if (c.wild) this.ctx.flash(`Warna ${SUIT_INFO[ev.col]?.name || ''}`);
    } else if (ev.k === 'draw') at('card');
    else if (ev.k === 'kilat') {
      at('kilat');
      this.ctx.flash(`${name(ev.p)}: Kilat!`);
    }
  }
}

export default {
  id: 'kilat',
  name: 'Kartu Kilat',
  icon: 'bolt',
  art: 'conic-gradient(#ff6b6b 0 25%, #fcc419 0 50%, #51cf66 0 75%, #4dabf7 0)',
  min: 2,
  max: 4,
  seatOrder: [0, 1, 2, 3],
  topView: false,
  Host: KilatHost,
  Renderer: KilatRenderer,
  Controls: KilatControls,
};
