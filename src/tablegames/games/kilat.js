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
const PILE_SHOW = 14; // kartu buangan teratas yang terlihat di meja
const CARD_S = 0.19; // ukuran kartu di meja
const FLY = 0.42; // lama kartu terbang (detik)
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const hash = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return h; };

// ---------------- Bandar ----------------
class KilatHost extends HostBase {
  constructor(o) {
    super({ ...o, game: 'kilat', min: 2, max: 4 });
    this.ranked = true; // lanjut sampai tersisa satu pemain (juara 1, 2, 3, terakhir)
    this.deck = [];
    this.pile = [];
    Object.assign(this.state, { hands: {}, discard: [], drawN: 0, color: null, dir: 1, drew: false, kilat: [], shuf: 0 });
    this.push();
  }

  beforePublish() {
    if (this.state.phase === 'play') this.refill(); // tumpukan habis: langsung dikocok ulang (tidak menunggu waktu habis)
    this.state.drawN = this.deck.length;
    this.state.discard = this.pile.slice(-PILE_SHOW);
    this.state.pileN = this.pile.length;
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

  /** Tumpukan ambil habis: kartu buangan (kecuali teratas) dikocok jadi tumpukan baru. */
  refill() {
    if (this.deck.length || this.pile.length < 2) return false;
    const top = this.pile.pop();
    this.state.shufN = Math.min(this.pile.length, PILE_SHOW);
    this.deck = shuffle(this.pile);
    this.pile = [top];
    this.state.shuf = (this.state.shuf || 0) + 1;
    return true;
  }

  drawOne() {
    this.refill();
    return this.deck.pop() || null;
  }

  rankRest(ids) {
    // permainan berhenti lebih awal (mis. pemain keluar): sisa kartu paling sedikit di atas
    const n = (id) => this.state.hands[id]?.length ?? 99;
    return [...ids].sort((a, b) => n(a) - n(b));
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
      // kartu habis: jadi juara berikutnya; sisanya lanjut bermain
      if (this.finish(pid, { p: pid, c: card })) return;
      ev.fin = s.ranks.length;
      s.kilat = s.kilat.filter((id) => id !== pid);
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

  /** Tumpukan & buangan kosong (semua kartu di tangan): boleh lewat tanpa mengambil. */
  noCards() {
    return !this.deck.length && this.pile.length < 2;
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
    if (!this.isTurn(pid) || (!this.state.drew && !this.noCards())) return;
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
    if (!this.state.drew && !this.noCards()) this.draw(p.id);
    if (this.isTurn(p.id)) this.pass(p.id);
  }

  botMove(p) {
    const s = this.state;
    const hand = s.hands[p.id];
    const card = botChoose(hand, this.pile[this.pile.length - 1], s.color);
    if (card) {
      if (hand.length === 2 && Math.random() < 0.85) this.kilat(p.id);
      this.play(p.id, card, bestColor(hand.filter((c) => c !== card)));
    } else if (!s.drew && !this.noCards()) this.draw(p.id);
    else this.pass(p.id);
  }
}

// Bingkai kuning membulat (penanda tumpukan bisa diambil)
let outlineTex = null;
function outlineTexture() {
  if (outlineTex) return outlineTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 176;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffe066';
  g.lineWidth = 16;
  g.shadowColor = '#ffd43b';
  g.shadowBlur = 18;
  g.beginPath();
  g.roundRect(14, 14, 100, 148, 16);
  g.stroke();
  outlineTex = new THREE.CanvasTexture(c);
  outlineTex.colorSpace = THREE.SRGBColorSpace;
  return outlineTex;
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
    this.drawTop.scale.setScalar(CARD_S);
    this.drawTop.rotation.set(-Math.PI / 2, 0, 0.2);
    this.drawTop.userData.front.userData.isDrawPile = true;
    const edge = new THREE.MeshLambertMaterial({ color: '#d9dde6' });
    this.drawBox = new THREE.Mesh(new THREE.BoxGeometry(CARD_S * 0.97, 1, CARD_S * 1.45), edge);
    this.drawBox.rotation.y = -0.2;
    // alas tumpukan buangan: makin tinggi seiring makin banyak kartu dibuang
    this.pileBase = new THREE.Mesh(new THREE.BoxGeometry(CARD_S * 0.97, 1, CARD_S * 1.45), edge);
    this.pileBase.rotation.y = 0.15;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 6, 28), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.copy(this.pileSlot).setY(table.y + 0.004);
    // garis tepi berdenyut di tumpukan = boleh ambil kartu
    this.drawGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.41), new THREE.MeshBasicMaterial({ map: outlineTexture(), transparent: true, depthWrite: false }));
    this.drawGlow.rotation.set(-Math.PI / 2, 0, 0.2);
    this.drawGlow.visible = false;
    this.group.add(this.drawTop, this.drawBox, this.pileBase, this.ring, this.drawGlow);
    this.fans = new Fans(this.group, table);
    this.anim = null;
    this.lastEv = -1;
    this.time = 0;
    this.queue = []; // kartu yang akan diambil: { pid, at, deal }
    this.flights = []; // kartu tertutup yang sedang terbang ke pemain lain
    this.pool = [];
    this.lastQueued = new Map();
    this.side = side;
    this.shuffle = null; // animasi kocok ulang: buangan diambil, dikocok, ditaruh jadi tumpukan baru
    this.shufPool = [];
    this.lastShuf = undefined;
    this.prevDiscard = [];
  }

  /** Kartu buangan (selain teratas) diangkat, dibalik, dikocok (riffle), lalu ditaruh di tempat tumpukan. */
  startShuffle(m) {
    const top = m.discard?.[m.discard.length - 1];
    const from = [];
    for (let i = this.prevDiscard.length - 1; i >= 0 && from.length < 12; i--) {
      const c = this.pile[i];
      if (!c || !c.visible || this.prevDiscard[i] === top) continue;
      from.push({ pos: c.position.clone(), quat: c.quaternion.clone(), key: faceKey(this.prevDiscard[i]) });
    }
    while (from.length < 8) {
      // buangan lama tidak terlihat (mis. baru bergabung): mulai dari alas tumpukan
      from.push({ pos: this.pileSlot.clone().setY(this.table.y + 0.004 + from.length * 0.0016), quat: _q.setFromEuler(_e.set(-Math.PI / 2, 0, from.length * 0.4)).clone(), key: 'back' });
    }
    if (this.shuffle) for (const c of this.shuffle.cards) this.shufPool.push(c.mesh);
    const y0 = this.table.y;
    const mid = this.pileSlot.clone().lerp(this.drawSlot, 0.5).setY(y0 + 0.13);
    const down = new THREE.Quaternion().setFromEuler(_e.set(Math.PI / 2, 0, -0.2));
    const n = from.length;
    const cards = from.map((f, i) => {
      const mesh = this.shufPool.pop() || makeCard(null);
      setCardFace(mesh, f.key);
      mesh.scale.setScalar(CARD_S);
      mesh.visible = true;
      this.group.add(mesh);
      mesh.position.copy(f.pos);
      mesh.quaternion.copy(f.quat);
      const half = i % 2 ? 1 : -1; // dua belahan untuk riffle
      return { mesh, f, i, half, slot: Math.floor(i / 2) + (half > 0 ? 0.5 : 0) };
    });
    this.shuffle = { t: 0, cards, mid, down, n };
    const dealer = m.players.some((p) => p.id === m.dealer) ? m.dealer : m.players[m.turn]?.id;
    this.shuffle.who = dealer;
    this.reach(dealer, this.pileSlot);
  }

  updateShuffle(dt) {
    const sh = this.shuffle;
    if (!sh) return;
    const t0 = sh.t;
    sh.t += dt;
    const t = sh.t;
    const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const sd = this.side;
    const GATHER = 0.5, SPLIT = 0.72, TAP = 1.48, PLACE = 1.85;
    if (t0 < GATHER && t >= GATHER) this.sound('shuffle');
    if (t0 < TAP && t >= TAP) this.reach(sh.who, this.drawSlot);
    const drawH = this.drawSlot.y + 0.004;
    const sp = ease((t - GATHER) / (SPLIT - GATHER));
    const pl = ease((t - TAP) / (PLACE - TAP));
    for (const c of sh.cards) {
      const m = c.mesh;
      const hi = Math.floor(c.i / 2);
      // 1) diangkat dari buangan & dibalik jadi tertutup, bertumpuk di atas meja
      const g = ease((t - c.i * 0.022) / (GATHER - 0.24));
      // 2) dibelah dua ke kiri & kanan
      const off = c.half * 0.075 * sp;
      const sx = sh.mid.x + sd.x * off, sz = sh.mid.z + sd.z * off;
      const sy = sh.mid.y + (c.i + (hi - c.i) * sp) * 0.0018 + sp * 0.01;
      // 3) diselipkan bergantian dari bawah (riffle)
      const rf = ease((t - SPLIT - (c.slot / sh.n) * 0.42) / 0.14);
      let x = sx + (sh.mid.x - sx) * rf, z = sz + (sh.mid.z - sz) * rf;
      let y = sy + (sh.mid.y + c.i * 0.0016 - sy) * rf + Math.sin(rf * Math.PI) * 0.03;
      if (g < 1) {
        x = c.f.pos.x + (x - c.f.pos.x) * g;
        z = c.f.pos.z + (z - c.f.pos.z) * g;
        y = c.f.pos.y + (y - c.f.pos.y) * g + Math.sin(g * Math.PI) * 0.07;
        m.quaternion.slerpQuaternions(c.f.quat, sh.down, g);
      } else m.quaternion.copy(sh.down).multiply(_q.setFromEuler(_e.set(0, c.half * 0.2 * sp * (1 - rf), 0)));
      // 4) dirapikan lalu 5) ditaruh di tempat tumpukan
      if (pl > 0) {
        x += (this.drawSlot.x - sh.mid.x) * pl;
        z += (this.drawSlot.z - sh.mid.z) * pl;
        y += (drawH + c.i * 0.0011 - (sh.mid.y + c.i * 0.0016)) * pl;
      }
      m.position.set(x, y, z);
    }
    if (t >= PLACE) {
      for (const c of sh.cards) {
        c.mesh.visible = false;
        c.mesh.removeFromParent();
        this.shufPool.push(c.mesh);
      }
      this.shuffle = null;
    }
  }

  /** Antrekan pengambilan `n` kartu oleh pemain (satu per satu, tangan meraih tumpukan). */
  queueDraw(pid, n, delay = 0, deal = false) {
    const gap = deal ? 0.11 : 0.34;
    const at = Math.max(this.time + delay, this.lastQueued.get(pid) || 0);
    for (let k = 0; k < n; k++) this.queue.push({ pid, at: at + k * gap, deal });
    this.lastQueued.set(pid, at + n * gap);
  }

  /** Kartu yang belum sampai ke tangan pemain (untuk menunda tambahan di kipasnya). */
  incoming(pid) {
    let k = 0;
    for (const q of this.queue) if (q.pid === pid) k++;
    for (const f of this.flights) if (f.pid === pid) k++;
    return k;
  }

  reach(pid, pos) {
    const ch = this.ctx.characterOf(pid);
    if (ch?.root.visible) ch.reachTo(pos);
  }

  sound(name) {
    this.ctx.audio.playAt(name, this.table.x, this.table.z);
  }

  /** Titik awal kartu yang dimainkan: dari kartu di tangan kita, kipas lawan, atau depan kursinya. */
  origin(m, pid, cardId, viewerId, pos, quat) {
    const own = pid === viewerId ? this.ctx.handCard(cardId) : null;
    if (own) {
      own.getWorldPosition(pos);
      own.getWorldQuaternion(quat);
      return;
    }
    const fan = this.fans.map.get(pid);
    if (fan) {
      pos.copy(fan.group.position).y += 0.14;
      quat.copy(fan.group.quaternion);
      return;
    }
    const idx = m.players.findIndex((p) => p.id === pid);
    const s = idx >= 0 ? this.ctx.seatOf(m, idx) : this.table;
    pos.set(s.x + Math.sin(s.rot || 0) * 0.4, (s.y || this.table.y) + 0.55, s.z + Math.cos(s.rot || 0) * 0.4);
    quat.setFromEuler(_e.set(Math.PI / 2, 0, 0));
  }

  fanTarget(m, pid, out) {
    const fan = this.fans.map.get(pid);
    if (fan) return out.copy(fan.group.position).setY(fan.group.position.y + 0.14);
    const idx = m.players.findIndex((p) => p.id === pid);
    if (idx < 0) return out.set(this.table.x, this.table.y + 0.3, this.table.z);
    const s = this.ctx.seatOf(m, idx);
    return out.set(s.x + Math.sin(s.rot) * 0.45, s.y + 0.55, s.z + Math.cos(s.rot) * 0.45);
  }

  onEvent(m, ev, viewerId, discard) {
    if (ev.k === 'start') {
      // bagikan kartu ke semua pemain
      this.queue = [];
      this.lastQueued.clear();
      for (const p of m.players) this.queueDraw(p.id, m.hands?.[p.id]?.length || 0, 0.25, true);
      return;
    }
    if ((ev.k === 'play' || ev.k === 'win') && ev.c && discard.length) {
      const top = this.pile[discard.length - 1];
      if (top) {
        const from = new THREE.Vector3(), fromQ = new THREE.Quaternion();
        this.origin(m, ev.p, ev.c, viewerId, from, fromQ);
        this.anim = { card: top, t: 0, from, fromQ };
      }
      this.reach(ev.p, this.pileSlot);
      this.sound('card');
      if (ev.pen) this.queueDraw(ev.p, ev.pen, ev.p === viewerId ? 0 : 0.5);
      if (ev.draw) this.queueDraw(ev.draw.p, ev.draw.n, ev.draw.p === viewerId ? 0 : 0.45);
    } else if (ev.k === 'draw') this.queueDraw(ev.p, 1, 0);
  }

  updateDraws(dt, m, viewerId) {
    // mulai ambil kartu yang sudah waktunya (ditahan selama tumpukan baru dikocok)
    for (let i = 0; i < this.queue.length; i++) {
      const q = this.queue[i];
      if (q.at > this.time || (this.shuffle && !q.deal)) continue;
      this.queue.splice(i--, 1);
      if (!m.players.some((p) => p.id === q.pid)) continue;
      if (!q.deal) this.reach(q.pid, this.drawSlot);
      if (!q.deal || this.flights.length % 2 === 0) this.sound('card');
      if (q.pid === viewerId) continue; // kartu kita sendiri diterbangkan oleh tampilan tangan
      const mesh = this.pool.pop() || makeCard(null);
      mesh.scale.setScalar(CARD_S);
      mesh.visible = true;
      this.group.add(mesh);
      const from = this.drawTop.position.clone();
      this.flights.push({ mesh, pid: q.pid, t: 0, from, fromQ: this.drawTop.quaternion.clone() });
    }
    // kartu terbang dari tumpukan ke kipas pemain
    for (let i = 0; i < this.flights.length; i++) {
      const f = this.flights[i];
      f.t = Math.min(1, f.t + dt / FLY);
      const k = 1 - (1 - f.t) ** 3;
      this.fanTarget(m, f.pid, _v);
      f.mesh.position.lerpVectors(f.from, _v, k);
      f.mesh.position.y += Math.sin(k * Math.PI) * 0.16;
      const fan = this.fans.map.get(f.pid);
      f.mesh.quaternion.slerpQuaternions(f.fromQ, fan ? fan.group.quaternion : f.fromQ, k);
      f.mesh.scale.setScalar(CARD_S + (0.2 - CARD_S) * k);
      if (f.t >= 1) {
        f.mesh.visible = false;
        f.mesh.removeFromParent();
        this.pool.push(f.mesh);
        this.flights.splice(i--, 1);
      }
    }
  }

  update(dt, m, viewerId) {
    this.time += dt;
    const t = this.table;
    const live = m.phase !== 'lobby';
    const discard = live ? m.discard || [] : [];
    // tumpukan buangan: kartu-kartu terakhir berserakan sedikit agar jelas terlihat, alasnya makin tinggi
    if (m.shuf !== this.lastShuf) {
      if (this.lastShuf !== undefined && m.phase === 'play') this.startShuffle(m);
      this.lastShuf = m.shuf;
    }
    this.prevDiscard = discard;
    const under = Math.max(0, (m.pileN ?? discard.length) - discard.length);
    const baseH = under * 0.0011;
    this.pileBase.visible = live && under > 0;
    if (this.pileBase.visible) {
      this.pileBase.scale.y = baseH;
      this.pileBase.position.set(this.pileSlot.x, t.y + baseH / 2, this.pileSlot.z);
    }
    while (this.pile.length < discard.length) {
      const card = makeCard(null);
      card.scale.setScalar(CARD_S);
      card.userData.target = new THREE.Vector3();
      card.userData.tq = new THREE.Quaternion();
      this.group.add(card);
      this.pile.push(card);
    }
    this.pile.forEach((card, i) => {
      const id = discard[i];
      card.visible = !!id;
      if (!id) return;
      setCardFace(card, faceKey(id));
      const h = Math.abs(hash(id));
      const spread = i === discard.length - 1 ? 0.4 : 1; // kartu teratas lebih rapi di tengah
      card.userData.tq.setFromEuler(_e.set(-Math.PI / 2, 0, ((h % 100) / 100 - 0.5) * 1.3 * spread));
      card.userData.target.set(
        this.pileSlot.x + (((h >> 3) % 11) - 5) * 0.009 * spread,
        t.y + baseH + 0.002 + i * 0.0016,
        this.pileSlot.z + (((h >> 7) % 11) - 5) * 0.009 * spread
      );
      if (this.anim && this.anim.card === card) return;
      card.position.copy(card.userData.target);
      card.quaternion.copy(card.userData.tq);
    });
    if (m.ev && m.ev.n !== this.lastEv) {
      if (this.lastEv !== -1) this.onEvent(m, m.ev, viewerId, discard);
      this.lastEv = m.ev.n;
    }
    if (this.anim) {
      // kartu dimainkan: dari tangan pemain melayang ke tumpukan sambil terbuka
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / FLY);
      const k = 1 - (1 - a.t) ** 3;
      a.card.position.lerpVectors(a.from, a.card.userData.target, k);
      a.card.position.y += Math.sin(k * Math.PI) * 0.14;
      a.card.quaternion.slerpQuaternions(a.fromQ, a.card.userData.tq, k);
      if (a.t >= 1) this.anim = null;
    }
    this.updateShuffle(dt);
    this.updateDraws(dt, m, viewerId);
    const n = live && !this.shuffle ? m.drawN || 0 : 0;
    const hgt = 0.004 + Math.min(n, 90) * 0.0011;
    this.drawBox.visible = this.drawTop.visible = live && n > 0;
    this.drawBox.scale.y = hgt;
    this.drawBox.position.set(this.drawSlot.x, t.y + hgt / 2, this.drawSlot.z);
    this.drawTop.position.set(this.drawSlot.x, t.y + hgt + 0.001, this.drawSlot.z);
    this.drawGlow.visible = !!this.canDraw && this.drawTop.visible;
    if (this.drawGlow.visible) {
      this.drawGlow.position.set(this.drawSlot.x, t.y + hgt + 0.003, this.drawSlot.z);
      this.drawGlow.material.opacity = 0.75 + Math.sin(this.time * 5) * 0.25;
      this.drawGlow.scale.setScalar(1 + Math.sin(this.time * 5) * 0.03);
    }
    this.ring.visible = live && m.phase === 'play';
    if (m.color) this.ring.material.color.set(SUIT_INFO[m.color]?.color || '#fff');
    this.ring.scale.setScalar(1 + Math.sin(this.time * 4) * 0.04);
    this.fans.update(m, viewerId, (i) => this.ctx.seatOf(m, i), (pid) => (live ? Math.max(0, (m.hands?.[pid]?.length || 0) - this.incoming(pid)) : 0), (pid) => this.ctx.characterOf(pid), this.ctx.camera);
  }

  dispose() {
    if (this.shuffle) this.shuffle.cards.forEach((c) => c.mesh.removeFromParent());
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
    this.btnPass = this.ctx.button('arrowRight', 'Lewat', () => this.ctx.act({ a: 'pass' }), '', 'cu-pass');
  }

  exit() {
    this.hand.clear();
    this.hand.group.removeFromParent();
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
    const r = this.ctx.renderer(m);
    this.hand.layout(dt, {
      ids,
      eye: this.ctx.eye(new THREE.Vector3()),
      seat: this.ctx.mySeat(),
      table: this.ctx.tableOf(m),
      key: faceKey,
      hover: this.hover,
      look: (id) => (mine ? (canPlay(id, top, m.color) ? 'normal' : 'dim') : 'flat'),
      spawn: r?.drawTop.visible ? r.drawTop.position : r?.drawSlot,
    });
    const hand = m.hands?.[me] || [];
    if (r) r.canDraw = mine && !m.drew; // ambil kartu dengan mengetuk tumpukan
    const noCards = !m.drawN && (m.pileN ?? 0) < 2; // semua kartu ada di tangan: boleh lewat
    this.btnPass.hidden = !mine || (!m.drew && !noCards);
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
      const c = parse(ev.c);
      if (ev.pen) this.ctx.flash(`${name(ev.p)} lupa Kilat! +2`);
      else if (ev.draw) this.ctx.flash(`${name(ev.draw.p)} +${ev.draw.n}`);
      else if (ev.skip) this.ctx.flash(`${name(ev.skip)} dilewati`);
      else if (c.value === 'rev') this.ctx.flash('Arah dibalik');
      else if (c.wild) this.ctx.flash(`Warna ${SUIT_INFO[ev.col]?.name || ''}`);
    } else if (ev.k === 'kilat') {
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
  seatOrder: (n) => (n === 2 ? [0, 2] : [0, 1, 2, 3]), // berdua: duduk berhadapan
  topView: false,
  holdsCards: true,
  Host: KilatHost,
  Renderer: KilatRenderer,
  Controls: KilatControls,
};
