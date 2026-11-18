import * as THREE from 'three';
import { HostBase } from '../HostBase.js';
import { boardGroup, woodMaterial } from '../boardKit.js';

// ---------- Aturan mancala klasik ----------
// Lubang 0..5 milik pemain pertama (kiri → kanan dari sisinya), 6 = lumbungnya.
// Lubang 7..12 milik pemain kedua, 13 = lumbungnya. Biji ditabur berlawanan arah jarum jam,
// melewati lumbung lawan. Biji terakhir di lumbung sendiri = jalan lagi; di lubang kosong sendiri
// (dan lubang seberangnya berisi) = keduanya masuk lumbung. Satu sisi kosong = sisa biji masuk lumbung pemiliknya.
const PITS = 6;
const SEEDS = 4;
const store = (side) => (side === 0 ? 6 : 13);
const sideOf = (i) => (i <= 6 ? 0 : 1);
const isStore = (i) => i === 6 || i === 13;
const ownPit = (side, i) => !isStore(i) && sideOf(i) === side;
const opposite = (i) => 12 - i;

export function newBoard() {
  const b = Array(14).fill(SEEDS);
  b[6] = b[13] = 0;
  return b;
}

/** Jalankan satu taburan; kembalikan { board, path, cap, again, over }. */
export function sow(board, side, pit) {
  const b = board.slice();
  let n = b[pit];
  b[pit] = 0;
  const path = [];
  let i = pit;
  while (n > 0) {
    i = (i + 1) % 14;
    if (i === store(1 - side)) continue;
    b[i]++;
    path.push(i);
    n--;
  }
  let cap = null;
  if (ownPit(side, i) && b[i] === 1 && b[opposite(i)] > 0) {
    const n2 = b[i] + b[opposite(i)];
    cap = { pits: [i, opposite(i)], to: store(side), n: n2 };
    b[store(side)] += n2;
    b[i] = 0;
    b[opposite(i)] = 0;
  }
  const again = i === store(side);
  let over = false;
  const empty = (s) => b.slice(s === 0 ? 0 : 7, s === 0 ? 6 : 13).every((x) => x === 0);
  if (empty(0) || empty(1)) {
    over = true;
    for (let k = 0; k < 13; k++) {
      if (isStore(k)) continue;
      b[store(sideOf(k))] += b[k];
      b[k] = 0;
    }
  }
  return { board: b, path, cap, again: again && !over, over };
}

export const legalPits = (board, side) => {
  const out = [];
  for (let k = 0; k < PITS; k++) {
    const i = side === 0 ? k : 7 + k;
    if (board[i] > 0) out.push(i);
  }
  return out;
};

function search(board, side, me, depth, alpha, beta) {
  const moves = legalPits(board, side);
  if (depth === 0 || !moves.length) return board[store(me)] - board[store(1 - me)];
  let best = side === me ? -Infinity : Infinity;
  for (const pit of moves) {
    const r = sow(board, side, pit);
    const next = r.over ? side : r.again ? side : 1 - side;
    const v = r.over ? (r.board[store(me)] - r.board[store(1 - me)]) * 10 : search(r.board, next, me, depth - 1, alpha, beta);
    if (side === me) {
      if (v > best) best = v;
      alpha = Math.max(alpha, v);
    } else {
      if (v < best) best = v;
      beta = Math.min(beta, v);
    }
    if (beta <= alpha) break;
  }
  return best;
}

export function mancalaBot(board, side, depth = 6) {
  let best = -Infinity, pick = [];
  for (const pit of legalPits(board, side)) {
    const r = sow(board, side, pit);
    const v = r.over ? (r.board[store(side)] - r.board[store(1 - side)]) * 10 : search(r.board, r.again ? side : 1 - side, side, depth - 1, -Infinity, Infinity);
    if (v > best + 0.1) {
      best = v;
      pick = [pit];
    } else if (Math.abs(v - best) <= 0.1) pick.push(pit);
  }
  return pick.length ? pick[Math.floor(Math.random() * pick.length)] : -1;
}

/** Perkiraan lama animasi taburan (ms) supaya giliran berikutnya menunggu biji selesai jatuh. */
const animMs = (path, cap, over) => 650 + path.length * 250 + (cap ? 1000 : 0) + (over ? 1300 : 0);

// ---------- Bandar ----------
class MancalaHost extends HostBase {
  constructor(o) {
    super({ ...o, game: 'mancala', min: 2, max: 2, turnMs: 40000 });
    Object.assign(this.state, { board: newBoard(), starter: 1 });
    this.push();
  }

  setup() {
    const s = this.state;
    s.board = newBoard();
    s.starter = s.starter ? 0 : 1;
    this.setTurn(s.starter);
  }

  move(pid, pit) {
    const s = this.state;
    const side = this.index(pid);
    if (!this.isTurn(pid) || !ownPit(side, pit) || !s.board[pit]) return;
    const r = sow(s.board, side, pit);
    s.board = r.board;
    const ev = { k: 'sow', p: pid, pit, path: r.path, cap: r.cap, again: r.again };
    if (r.over) {
      const a = s.board[6], b = s.board[13];
      const winner = a === b ? null : s.players[a > b ? 0 : 1]?.id || null;
      return this.end(winner, { ...ev, over: true, score: [a, b] });
    }
    if (!r.again) this.setTurn(this.next());
    // giliran berikutnya baru dihitung setelah biji selesai ditabur
    s.turnAt = Date.now() + animMs(r.path, r.cap, false);
    this.push(ev);
  }

  onAction(a, from) {
    if (a.a === 'sow') this.move(from, a.pit | 0);
    else if (a.a === 'resign') {
      const other = this.state.players.find((p) => p.id !== from);
      this.end(other?.id || null, { why: 'resign', by: from });
    }
  }

  onTimeout(p) {
    this.botMove(p);
  }

  botMove(p) {
    const pit = mancalaBot(this.state.board, this.index(p.id));
    if (pit >= 0) this.move(p.id, pit);
  }
}

// ---------- Tampilan ----------
const PIT_DX = 0.072;
const ROW_Z = 0.058;
const PIT_R = 0.032; // lubang tabung
const PIT_D = 0.026;
const STORE_X = 0.29;
const STORE_R = 0.036; // lumbung kapsul: lurus di tengah, melengkung di ujung
const STORE_A = 0.045; // setengah panjang bagian lurus
const STORE_D = 0.03;
const BOARD = { w: 0.8, d: 0.26, h: 0.034 };
const BEVEL = 0.004;
const SEED_R = 0.0085;
const MARBLES = ['#e64980', '#1c7ed6', '#37b24d', '#f59f00', '#7048e8', '#0ca678', '#f03e3e', '#1098ad'];
const ease = (k) => k * k * (3 - 2 * k);

/** Pusat lubang / lumbung dalam koordinat papan (+Z = sisi pemain pertama). */
function pitCenter(i, out = new THREE.Vector3()) {
  if (i === 6) return out.set(STORE_X, 0, 0);
  if (i === 13) return out.set(-STORE_X, 0, 0);
  if (i < 6) return out.set((i - 2.5) * PIT_DX, 0, ROW_Z);
  return out.set((2.5 - (i - 7)) * PIT_DX, 0, -ROW_Z);
}

/** Papan berujung melengkung dengan lubang tembus (lubang tabung & lumbung kapsul). */
function boardGeometry() {
  const R = BOARD.d / 2, cx = BOARD.w / 2 - R;
  const sh = new THREE.Shape();
  sh.moveTo(-cx, -R);
  sh.lineTo(cx, -R);
  sh.absarc(cx, 0, R, -Math.PI / 2, Math.PI / 2, false);
  sh.lineTo(-cx, R);
  sh.absarc(-cx, 0, R, Math.PI / 2, (Math.PI * 3) / 2, false);
  for (let i = 0; i < 14; i++) {
    const p = pitCenter(i);
    const hole = new THREE.Path();
    if (isStore(i)) {
      const r = STORE_R, a = STORE_A, x = p.x;
      hole.moveTo(x + r, -a);
      hole.lineTo(x + r, a);
      hole.absarc(x, a, r, 0, Math.PI, false);
      hole.lineTo(x - r, -a);
      hole.absarc(x, -a, r, Math.PI, Math.PI * 2, false);
    } else hole.absarc(p.x, -p.z, PIT_R, 0, Math.PI * 2, false);
    sh.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: BOARD.h, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 2, curveSegments: 22 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, BEVEL, 0);
  return g;
}

/** Profil dinding lubang: lurus ke bawah lalu melengkung ke dasar (setengah, dari bibir ke tengah dasar). */
function cupProfile(r, d) {
  const rb = r * 0.7;
  const pts = [[r, 0], [r, -(d - rb)]];
  for (let k = 1; k <= 8; k++) {
    const t = (k / 8) * (Math.PI / 2);
    pts.push([r * Math.cos(t), -(d - rb) - rb * Math.sin(t)]);
  }
  pts[pts.length - 1][0] = 0;
  return pts;
}

/** Mangkuk lubang bulat (tabung berdasar melengkung). */
function pitCup(r, d) {
  return new THREE.LatheGeometry(cupProfile(r, d).map(([x, y]) => new THREE.Vector2(x, y)), 24);
}

/** Mangkuk lumbung kapsul: saluran lurus + dua ujung setengah tabung. */
function storeCup(r, a, d) {
  const P = cupProfile(r, d);
  const S = [...P.map(([x, y]) => [-x, y]), ...P.slice(0, -1).reverse()];
  const pos = [], idx = [];
  S.forEach(([x, y]) => pos.push(x, y, -a, x, y, a));
  for (let i = 0; i < S.length - 1; i++) {
    const a0 = i * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
    idx.push(a0, a1, b0, b0, a1, b1);
  }
  const mid = new THREE.BufferGeometry();
  mid.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  mid.setIndex(idx);
  const v2 = P.map(([x, y]) => new THREE.Vector2(x, y));
  const endA = new THREE.LatheGeometry(v2, 14, -Math.PI / 2, Math.PI).translate(0, 0, a);
  const endB = new THREE.LatheGeometry(v2, 14, Math.PI / 2, Math.PI).translate(0, 0, -a);
  const parts = [mid, endA, endB].map((g) => {
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    return g.index ? g.toNonIndexed() : g;
  });
  const merged = new THREE.BufferGeometry();
  const arr = [];
  for (const g of parts) arr.push(...g.attributes.position.array);
  merged.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  merged.computeVertexNormals();
  return merged;
}

/** Tekstur kelereng: kaca bening berpilin warna. */
const marbleMats = new Map();
function marbleMaterial(color) {
  let m = marbleMats.get(color);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#eef6fb';
  g.fillRect(0, 0, 128, 64);
  for (let k = 0; k < 3; k++) {
    g.strokeStyle = color;
    g.globalAlpha = 0.85 - k * 0.2;
    g.lineWidth = 9 - k * 2;
    g.beginPath();
    for (let x = 0; x <= 128; x += 4) {
      const y = 32 + Math.sin((x / 128) * Math.PI * 4 + k * 2.1) * (14 - k * 3);
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.MeshPhongMaterial({ map: t, shininess: 140, specular: '#ffffff', emissive: color, emissiveIntensity: 0.12 });
  marbleMats.set(color, m);
  return m;
}

/** Label jumlah biji di atas lubang. */
class CountLabel {
  constructor(parent) {
    this.c = document.createElement('canvas');
    this.c.width = this.c.height = 64;
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, transparent: true }));
    this.sprite.scale.setScalar(0.034);
    this.sprite.renderOrder = 5;
    parent.add(this.sprite);
    this.n = -1;
  }

  set(n, mine) {
    const key = `${n}|${mine}`;
    if (key === this.n) return;
    this.n = key;
    const g = this.c.getContext('2d');
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = mine ? 'rgba(47,128,237,0.92)' : 'rgba(29,35,51,0.78)';
    g.beginPath();
    g.arc(32, 32, 28, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = '800 32px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 32, 34);
    this.tex.needsUpdate = true;
  }
}

let seedGeo = null;
class MancalaRenderer {
  constructor(ctx, table) {
    this.ctx = ctx;
    this.table = table;
    this.group = boardGroup(ctx, table, table.seats[0]);
    // papan kayu berujung melengkung + lubang 3D (tabung & kapsul) yang benar-benar berongga
    const board = new THREE.Mesh(boardGeometry(), woodMaterial({ base: '#b47a42', dark: '#6e4019', light: '#d39a5e', seed: 11 }, 0.42));
    board.castShadow = board.receiveShadow = true;
    this.group.add(board);
    this.topY = BOARD.h + BEVEL * 2;
    const inner = woodMaterial({ base: '#8a5528', dark: '#4e2c10', light: '#a2693a', seed: 13 }, 0.2);
    inner.side = THREE.DoubleSide;
    const pitGeo = pitCup(PIT_R - BEVEL * 0.6, PIT_D);
    const storeGeo = storeCup(STORE_R - BEVEL * 0.6, STORE_A, STORE_D);
    for (let i = 0; i < 14; i++) {
      const p = pitCenter(i);
      const cup = new THREE.Mesh(isStore(i) ? storeGeo : pitGeo, inner);
      cup.position.set(p.x, this.topY, p.z);
      cup.receiveShadow = true;
      this.group.add(cup);
    }
    // target ketuk per lubang + cincin penanda lubang yang bisa dipilih
    this.picks = [];
    this.rings = [];
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, depthWrite: false });
    this.ringMat = ringMat;
    for (let i = 0; i < 14; i++) {
      if (isStore(i)) {
        this.picks.push(null);
        this.rings.push(null);
        continue;
      }
      const p = pitCenter(i);
      const pick = new THREE.Mesh(new THREE.CylinderGeometry(PIT_R * 1.15, PIT_R * 1.15, 0.05, 12), new THREE.MeshBasicMaterial({ visible: false }));
      pick.position.set(p.x, this.topY + 0.02, p.z);
      pick.userData.pit = i;
      this.group.add(pick);
      this.picks.push(pick);
      const ring = new THREE.Mesh(new THREE.RingGeometry(PIT_R * 1.02, PIT_R * 1.22, 28), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, this.topY + 0.001, p.z);
      ring.visible = false;
      this.group.add(ring);
      this.rings.push(ring);
    }
    this.labels = [];
    for (let i = 0; i < 14; i++) {
      const l = new CountLabel(this.group);
      const p = pitCenter(i);
      const outward = i < 6 ? 1 : i > 6 && i < 13 ? -1 : 0;
      l.sprite.position.set(p.x, this.topY + 0.012, p.z + outward * (PIT_R + 0.02) + (isStore(i) ? (STORE_A + STORE_R + 0.022) * (i === 6 ? 1 : -1) : 0));
      this.labels.push(l);
    }
    seedGeo ||= new THREE.SphereGeometry(SEED_R, 14, 10);
    this.timers = [];
    this.pits = Array.from({ length: 14 }, () => []);
    this.flying = [];
    this.queue = [];
    this.busy = 0;
    this.lastEv = -1;
    this.time = 0;
    this._v = new THREE.Vector3();
  }

  makeSeed() {
    const m = new THREE.Mesh(seedGeo, marbleMaterial(MARBLES[Math.floor(Math.random() * MARBLES.length)]));
    m.castShadow = true;
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.group.add(m);
    return m;
  }

  /** Letak biji ke-k di lubang i (menyebar lalu bertumpuk). */
  slot(i, k, out = new THREE.Vector3()) {
    pitCenter(i, out);
    const st = isStore(i);
    const ring = st ? 12 : 6;
    const layer = Math.floor(k / (ring + 1));
    const j = k % (ring + 1);
    if (j > 0) {
      const a = j * 2.39996 + layer * 0.9;
      const r = Math.sqrt(j / ring);
      out.x += Math.cos(a) * r * (st ? STORE_R - SEED_R - 0.004 : PIT_R - SEED_R - 0.005);
      out.z += Math.sin(a) * r * (st ? STORE_A + STORE_R - SEED_R - 0.006 : PIT_R - SEED_R - 0.005);
    }
    // kelereng berkumpul di dasar lubang lalu menumpuk
    out.y = this.topY - (st ? STORE_D : PIT_D) + SEED_R + 0.001 + layer * SEED_R * 1.5 + (j > 0 ? 0.002 : 0);
    return out;
  }

  fly(mesh, to, delay, dur, height, sound) {
    this.flying.push({ mesh, from: null, to: to.clone(), t: -delay, dur, height, sound });
  }

  sound(name, opts) {
    this.ctx.audio.playAt(name, this.table.x, this.table.z, opts);
  }

  /** Samakan jumlah biji per lubang dengan state (tanpa animasi). */
  snap(board) {
    for (let i = 0; i < 14; i++) {
      const arr = this.pits[i];
      while (arr.length > board[i]) arr.pop().removeFromParent();
      while (arr.length < board[i]) arr.push(this.makeSeed());
      arr.forEach((m, k) => this.slot(i, k, m.position));
    }
  }

  /** Jalankan fungsi setelah `t` detik (urutan animasi tangan). */
  at(t, fn) {
    this.timers.push({ t: this.time + t, fn });
  }

  world(local) {
    return this.group.localToWorld(local.clone());
  }

  /** Animasi satu taburan: tangan mengambil semua kelereng dari lubang, lalu menjatuhkannya satu per satu. */
  playSow(ev) {
    const hand = this.pits[ev.pit].splice(0);
    const ch = this.ctx.characterOf(ev.p);
    const reach = (local) => ch && (ch.reachAt = local ? this.world(local) : null);
    const above = (i) => pitCenter(i).setY(this.topY + 0.075);
    const cluster = (base, k) => base.clone().add(new THREE.Vector3(((k % 3) - 1) * 0.009, (k / 6) * 0.004, (((k / 3) | 0) % 2) * 0.009 - 0.0045));
    // tangan meraih lubang asal
    reach(pitCenter(ev.pit).setY(this.topY));
    this.at(0.18, () => this.sound('grab'));
    hand.forEach((m, k) => this.fly(m, cluster(above(ev.pit), k), 0.18, 0.24, 0.02));
    this.at(0.18, () => reach(above(ev.pit)));
    let t = 0.48;
    ev.path.forEach((dst, k) => {
      const base = above(dst);
      this.at(t, () => reach(base));
      // kelereng yang masih di genggaman ikut berpindah bersama tangan
      for (let j = k + 1; j < hand.length; j++) this.fly(hand[j], cluster(base, j - k - 1), t, 0.17, 0.01);
      const m = hand[k] || this.makeSeed();
      const to = this.slot(dst, this.pits[dst].length);
      this.pits[dst].push(m);
      this.fly(m, to, t + 0.11, 0.15, 0, 'pebble');
      t += 0.25;
    });
    for (let k = ev.path.length; k < hand.length; k++) hand[k].removeFromParent();
    if (ev.cap) {
      // tangkap: tangan menyapu kelereng lubang terakhir & seberangnya ke lumbung
      t += 0.2;
      const st = ev.cap.to;
      let first = true;
      for (const src of ev.cap.pits) {
        this.at(t, () => reach(pitCenter(src).setY(this.topY + 0.02)));
        t += 0.22;
        for (const m of this.pits[src].splice(0)) {
          const to = this.slot(st, this.pits[st].length);
          this.pits[st].push(m);
          this.fly(m, to, t, 0.42, 0.08, first ? 'collect' : null);
          first = false;
          t += 0.03;
        }
        this.at(t, () => reach(pitCenter(st).setY(this.topY + 0.04)));
        t += 0.25;
      }
      t += 0.3;
    }
    this.at(t, () => reach(null));
    return t + 0.1;
  }

  /** Sisa biji (akhir permainan) atau beda jumlah: pindahkan biji dari lubang berlebih ke yang kurang. */
  reconcile(board, delay = 0) {
    const surplus = [], deficit = [];
    for (let i = 0; i < 14; i++) {
      const d = this.pits[i].length - board[i];
      if (d > 0) surplus.push([i, d]);
      else if (d < 0) deficit.push([i, -d]);
    }
    if (!surplus.length && !deficit.length) return 0;
    let t = delay;
    let any = false;
    for (const [src, n] of surplus) {
      for (let k = 0; k < n; k++) {
        // utamakan lumbung di sisi yang sama
        let di = deficit.findIndex(([i, need]) => need > 0 && isStore(i) && sideOf(i) === sideOf(src));
        if (di < 0) di = deficit.findIndex(([, need]) => need > 0);
        const m = this.pits[src].pop();
        if (di < 0) {
          m.removeFromParent();
          continue;
        }
        const dst = deficit[di][0];
        deficit[di][1]--;
        const to = this.slot(dst, this.pits[dst].length);
        this.pits[dst].push(m);
        this.fly(m, to, t, 0.5, 0.07, any ? null : 'collect');
        any = true;
        t += 0.04;
      }
    }
    for (const [dst, need] of deficit) for (let k = 0; k < need; k++) {
      const m = this.makeSeed();
      this.slot(dst, this.pits[dst].length, m.position);
      this.pits[dst].push(m);
    }
    return t + 0.5;
  }

  update(dt, m, viewerId) {
    this.time += dt;
    const live = m.phase !== 'lobby' && Array.isArray(m.board);
    const board = live ? m.board : newBoard();
    const ev = m.ev;
    if (ev && ev.n !== this.lastEv) {
      if (this.lastEv === -1 || ev.k === 'start') {
        this.queue = [];
        this.flying.forEach((f) => (f.t = f.dur));
        this.timers = [];
        for (const p of m.players) {
          const ch = this.ctx.characterOf(p.id);
          if (ch) ch.reachAt = null;
        }
        this.snapAt = board.slice();
        if (ev.k === 'start' && this.lastEv !== -1) this.sound('grab');
      } else if (ev.path && ev.pit !== undefined) this.queue.push({ ev, board: board.slice() });
      this.lastEv = ev.n;
    }
    if (this.snapAt) {
      this.snap(this.snapAt);
      this.snapAt = null;
    }
    for (const tm of this.timers) if (tm.t <= this.time) tm.fn();
    this.timers = this.timers.filter((tm) => tm.t > this.time);
    // jalankan antrean taburan satu per satu
    this.busy -= dt;
    if (this.busy <= 0 && this.queue.length) {
      const q = this.queue.shift();
      this.busy = this.playSow(q.ev);
      if (!this.queue.length) this.pendingReconcile = { board: q.board, at: this.busy };
    }
    if (this.busy <= 0 && !this.queue.length) {
      const target = this.pendingReconcile?.board || board;
      this.pendingReconcile = null;
      const extra = this.reconcile(target, 0.15);
      if (extra) this.busy = extra;
    }
    for (const f of this.flying) {
      f.t += dt;
      if (f.t < 0) continue;
      if (!f.from) {
        f.from = f.mesh.position.clone();
        if (f.sound) this.sound(f.sound);
        f.sound = null;
      }
      const k = ease(Math.min(1, f.t / f.dur));
      f.mesh.position.lerpVectors(f.from, f.to, k);
      f.mesh.position.y += Math.sin(k * Math.PI) * f.height;
      if (f.t >= f.dur) f.mesh.position.copy(f.to);
    }
    this.flying = this.flying.filter((f) => f.t < f.dur);
    // label jumlah & cincin lubang yang bisa dipilih
    const counts = this.pits.map((a) => a.length);
    const mySide = m.players.findIndex((p) => p.id === viewerId);
    this.labels.forEach((l, i) => {
      l.sprite.visible = live;
      l.set(counts[i], mySide >= 0 && sideOf(i) === mySide && (i !== 13 || mySide === 1) && (i !== 6 || mySide === 0));
    });
    const playable = new Set(this.playable || []);
    this.ringMat.opacity = 0.65 + Math.sin(this.time * 6) * 0.3;
    this.rings.forEach((r, i) => r && (r.visible = playable.has(i) && this.busy <= 0));
  }

  dispose() {
    this.group.removeFromParent();
  }
}

// ---------- Kontrol ----------
class MancalaControls {
  constructor(ctx) {
    this.ctx = ctx;
  }

  enter() {
    this.btnResign = this.ctx.topButton('flag', 'Menyerah', () => {
      if (confirm('Menyerah?')) this.ctx.act({ a: 'resign' });
    }, 'cu-resign');
  }

  exit() {}

  side(m) {
    return m.players.findIndex((p) => p.id === this.ctx.myId);
  }

  myTurn(m) {
    return m.phase === 'play' && m.players[m.turn]?.id === this.ctx.myId;
  }

  update(dt, m) {
    this.btnResign.hidden = m.phase !== 'play';
    const r = this.ctx.renderer(m);
    if (r) r.playable = this.myTurn(m) && m.board ? legalPits(m.board, this.side(m)) : [];
  }

  playerColor(m, p) {
    return m.players[0]?.id === p.id ? '#e8590c' : '#1971c2';
  }

  targets(m) {
    const r = this.ctx.renderer(m);
    return r ? r.picks.filter(Boolean) : [];
  }

  click(obj, m) {
    if (!obj || m.phase !== 'play') return;
    if (!this.myTurn(m)) return this.ctx.flash('Bukan giliranmu');
    const r = this.ctx.renderer(m);
    if (r && r.busy > 0) return;
    const pit = obj.userData.pit;
    if (!ownPit(this.side(m), pit)) return this.ctx.flash('Pilih lubang di sisimu');
    if (!m.board[pit]) return this.ctx.flash('Lubang itu kosong');
    this.ctx.act({ a: 'sow', pit });
  }

  onEvent(ev, m) {
    const name = this.ctx.playerName;
    const delay = 350 + (ev.path?.length || 0) * 210;
    if (ev.k === 'sow' || (ev.k === 'win' && ev.path)) {
      if (ev.cap) setTimeout(() => this.ctx.flash(`${name(ev.p)} menangkap ${ev.cap.n} biji!`), delay);
      else if (ev.again) setTimeout(() => this.ctx.flash(ev.p === this.ctx.myId ? 'Masuk lumbung — jalan lagi!' : `${name(ev.p)} jalan lagi`), delay);
    }
  }

  endText(m) {
    const ev = m.ev;
    if (ev.why === 'resign') return `${this.ctx.playerName(ev.by)} menyerah`;
    if (ev.score) {
      const [a, b] = ev.score;
      const mine = this.side(m);
      const head = m.winner ? (m.winner === this.ctx.myId ? 'Kamu menang!' : `${this.ctx.playerName(m.winner)} menang`) : 'Seri!';
      return `${head} (${mine === 1 ? b : a} – ${mine === 1 ? a : b})`;
    }
    return null;
  }
}

export default {
  id: 'mancala',
  name: 'Mancala',
  icon: 'seeds',
  art: 'radial-gradient(circle at 25% 50%, #5a3215 0 13%, transparent 14%), radial-gradient(circle at 50% 50%, #5a3215 0 13%, transparent 14%), radial-gradient(circle at 75% 50%, #5a3215 0 13%, transparent 14%), #b4743a',
  min: 2,
  max: 2,
  seatOrder: [0, 2],
  topView: true,
  cam: { el: 1.02, dist: 0.66 },
  Host: MancalaHost,
  Renderer: MancalaRenderer,
  Controls: MancalaControls,
};
