import * as THREE from 'three';
import { HostBase } from '../HostBase.js';
import { icon } from '../../ui/icons.js';
import {
  HAND, TILE_L, TILE_W, pips, handValue, makeSet, shuffle, ends, sidesFor, choices, place, canPlay, openingTile, botChoose, layoutChain,
} from './dominoRules.js';

const TILE_T = 0.014; // tebal kartu
const HAND_D = 0.565; // jarak deret kartu pemain dari tengah meja
const HAND_GAP = 0.008;
const OWN_TILT = 0.95; // kartu sendiri bersandar ke belakang (terlihat dari kamera kepala & atas)
const OPP_TILT = 0.12; // kartu lawan hampir tegak, punggungnya menghadap kita
const AUTO_PASS_MS = 1100; // tidak punya kartu yang cocok: lewat otomatis
const FLY = 0.45;
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------- Bandar ----------------
class DominoHost extends HostBase {
  constructor(o) {
    super({ ...o, game: 'domino', min: 2, max: 4 });
    Object.assign(this.state, { hands: {}, line: [], root: 0, must: null, sleep: 0, why: null, pips: null });
    this.lastWinner = null;
    this.push();
  }

  setup() {
    const s = this.state;
    const set = shuffle(makeSet());
    s.hands = {};
    for (const p of s.players) s.hands[p.id] = set.splice(0, HAND);
    s.sleep = set.length; // 2–3 pemain: sisa kartu disisihkan
    s.line = [];
    s.root = 0;
    s.why = null;
    s.pips = null;
    s.must = null;
    let start = this.index(this.lastWinner);
    if (start < 0) {
      // babak pertama: pemegang balak tertinggi membuka dengan balak itu
      const open = openingTile(s.hands);
      s.must = open.id;
      start = this.index(open.owner);
    }
    this.setTurn(start);
  }

  hasMove(pid) {
    const s = this.state;
    return canPlay(s.hands[pid] || [], s.line, s.must);
  }

  onAction(a, from) {
    if (a.a === 'play') this.play(from, String(a.t || ''), a.side);
  }

  play(pid, id, want) {
    const s = this.state;
    if (!this.isTurn(pid)) return;
    const hand = s.hands[pid];
    const idx = hand.indexOf(id);
    if (idx < 0 || (s.must && id !== s.must)) return;
    const sides = sidesFor(id, s.line);
    if (!sides.length) return;
    const side = sides.includes(want) ? want : sides[0];
    hand.splice(idx, 1);
    ({ line: s.line, root: s.root } = place(s.line, s.root, id, side));
    s.must = null;
    const ev = { t: id, side, by: pid };
    if (!hand.length) return this.finishRound(pid, 'out', ev);
    if (!s.players.some((p) => this.hasMove(p.id))) {
      // semua buntu: jumlah titik paling sedikit menang
      return this.finishRound(this.rankRest(s.players.map((p) => p.id))[0], 'block', ev);
    }
    this.setTurn(this.next());
    this.push({ k: 'play', p: pid, t: id, side });
  }

  pass(p) {
    if (!this.isTurn(p.id) || this.hasMove(p.id)) return;
    this.setTurn(this.next());
    this.push({ k: 'pass', p: p.id });
  }

  finishRound(winner, why, ev) {
    const s = this.state;
    s.why = why;
    s.pips = Object.fromEntries(s.players.map((p) => [p.id, handValue(s.hands[p.id])]));
    this.end(winner, { ...ev, why });
  }

  end(winner, extra) {
    super.end(winner, extra);
    this.lastWinner = this.state.winner;
  }

  /** Urutan peringkat: titik paling sedikit, lalu kartu paling sedikit. */
  rankRest(ids) {
    const h = this.state.hands;
    return [...ids].sort((a, b) => handValue(h[a]) - handValue(h[b]) || (h[a]?.length ?? 99) - (h[b]?.length ?? 99));
  }

  onLeave(pid, idx) {
    const s = this.state;
    const hand = s.hands[pid] || [];
    if (s.must && hand.includes(s.must)) s.must = null; // balak pembuka ikut keluar: pemain berikutnya bebas membuka
    s.sleep += hand.length;
    delete s.hands[pid];
    super.onLeave(pid, idx);
  }

  onTick(now) {
    const p = this.cur();
    if (p && now - this.state.turnAt > AUTO_PASS_MS && !this.hasMove(p.id)) this.pass(p);
  }

  onTimeout(p) {
    this.botMove(p);
  }

  botMove(p) {
    const s = this.state;
    const mv = botChoose(s.hands[p.id] || [], s.line, s.root, s.must);
    if (mv) this.play(p.id, mv.t, mv.side);
    else this.pass(p);
  }
}

// ---------------- Gambar kartu ----------------
const PIPS = {
  0: [],
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

/** Muka kartu: tegak (angka pertama di atas) atau mendatar (angka pertama di kiri). */
function drawFace(g, id, w, h) {
  const flat = w > h;
  const s = flat ? h : w; // ukuran satu sisi
  g.fillStyle = '#f7f1e3';
  g.beginPath();
  g.roundRect(0, 0, w, h, s * 0.12);
  g.fill();
  g.strokeStyle = '#a39579';
  g.lineWidth = s * 0.05;
  g.beginPath();
  if (flat) {
    g.moveTo(w / 2, s * 0.14);
    g.lineTo(w / 2, h - s * 0.14);
  } else {
    g.moveTo(s * 0.14, h / 2);
    g.lineTo(w - s * 0.14, h / 2);
  }
  g.stroke();
  g.fillStyle = '#1d2330';
  const [a, b] = pips(id);
  [a, b].forEach((n, k) => {
    const cx = flat ? s / 2 + k * s : s / 2;
    const cy = flat ? s / 2 : s / 2 + k * s;
    for (const [dx, dy] of PIPS[n]) {
      g.beginPath();
      // pola 6 dibuat dua kolom pada kartu tegak, dua baris pada kartu mendatar
      const px = flat ? dy : dx, py = flat ? dx : dy;
      g.arc(cx + px * s * 0.27, cy + py * s * 0.27, s * 0.085, 0, Math.PI * 2);
      g.fill();
    }
  });
}

const faceTex = new Map();
function faceTexture(id) {
  let t = faceTex.get(id);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    drawFace(c.getContext('2d'), id, 128, 256);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    faceTex.set(id, t);
  }
  return t;
}

const faceUrls = new Map();
/** Gambar kartu mendatar kecil untuk panel sisa kartu. */
function faceUrl(id) {
  let u = faceUrls.get(id);
  if (!u) {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 48;
    drawFace(c.getContext('2d'), id, 96, 48);
    u = c.toDataURL();
    faceUrls.set(id, u);
  }
  return u;
}

let shared = null;
function tileKit() {
  if (shared) return shared;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b02a37';
  g.fillRect(0, 0, 64, 128);
  g.strokeStyle = '#f7f1e3';
  g.lineWidth = 4;
  g.strokeRect(7, 7, 50, 114);
  g.fillStyle = '#f7f1e3';
  g.beginPath();
  g.moveTo(32, 46);
  g.lineTo(46, 64);
  g.lineTo(32, 82);
  g.lineTo(18, 64);
  g.fill();
  const back = new THREE.CanvasTexture(c);
  back.colorSpace = THREE.SRGBColorSpace;
  shared = {
    box: new THREE.BoxGeometry(TILE_W, TILE_T, TILE_L),
    face: new THREE.PlaneGeometry(TILE_W * 0.92, TILE_L * 0.95).rotateX(-Math.PI / 2).translate(0, TILE_T / 2 + 0.0005, 0),
    back: new THREE.PlaneGeometry(TILE_W * 0.92, TILE_L * 0.95).rotateX(Math.PI / 2).translate(0, -TILE_T / 2 - 0.0005, 0),
    body: new THREE.MeshLambertMaterial({ color: '#ece4d0' }),
    blank: new THREE.MeshLambertMaterial({ color: '#f7f1e3' }),
    backMat: new THREE.MeshLambertMaterial({ map: back }),
    faces: new Map(),
  };
  return shared;
}

function faceMaterial(id, dim) {
  const kit = tileKit();
  if (!id) return kit.blank;
  const key = id + (dim ? 'd' : '');
  let m = kit.faces.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ map: faceTexture(id), color: dim ? '#9d9d9d' : '#ffffff' });
    kit.faces.set(key, m);
  }
  return m;
}

function makeTile() {
  const kit = tileKit();
  const mesh = new THREE.Mesh(kit.box, kit.body);
  mesh.castShadow = true;
  const face = new THREE.Mesh(kit.face, kit.blank);
  const back = new THREE.Mesh(kit.back, kit.backMat);
  mesh.add(face, back);
  mesh.userData.face = face;
  return mesh;
}

// ---------------- Tampilan meja (semua pemain & penonton) ----------------
class DominoRenderer {
  constructor(ctx, table) {
    this.ctx = ctx;
    this.table = table;
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    // sumbu rantai: x lokal tegak lurus arah kursi pertama (berdua: memanjang di antara kedua pemain)
    const phi = table.seats[0].rot;
    this.cos = Math.cos(phi);
    this.sin = Math.sin(phi);
    this.phi = phi;
    this.tiles = new Map(); // kunci → mesh
    this.pool = [];
    this.lastEv = -1;
    this.time = 0;
    // kontrol pemain lokal mengisi ini tiap frame (kartu terpilih, disorot, bisa dimainkan)
    this.view = { sel: null, hover: null, playable: null, myTurn: false };
    const ghostMat = new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.55, depthWrite: false });
    this.ghosts = ['L', 'R'].map((side) => {
      const g = new THREE.Mesh(tileKit().box, ghostMat);
      const face = new THREE.Mesh(tileKit().face, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }));
      g.add(face);
      g.userData = { ghost: true, side, face };
      g.visible = false;
      this.group.add(g);
      return g;
    });
  }

  sound(name) {
    this.ctx.audio.playAt(name, this.table.x, this.table.z);
  }

  /** Titik lokal meja (x, z) → dunia. */
  toWorld(x, z, y, out) {
    const t = this.table;
    return out.set(t.x + x * this.cos + z * this.sin, t.y + y, t.z - x * this.sin + z * this.cos);
  }

  flat(rot, faceDown, out) {
    return out.setFromEuler(_e.set(0, this.phi + rot, faceDown ? Math.PI : 0));
  }

  /** Arah dari tengah meja ke kursi pemain ke-i & arah kanannya (dilihat dari kursi). */
  seatAxes(m, i) {
    const s = this.ctx.seatOf(m, i);
    const u = new THREE.Vector3(s.x - this.table.x, 0, s.z - this.table.z).normalize();
    return { u, r: new THREE.Vector3(u.z, 0, -u.x) };
  }

  handCenter(m, pid) {
    const i = m.players.findIndex((p) => p.id === pid);
    if (i < 0) return new THREE.Vector3(this.table.x, this.table.y + 0.05, this.table.z);
    const { u } = this.seatAxes(m, i);
    return new THREE.Vector3(this.table.x + u.x * HAND_D, this.table.y + 0.05, this.table.z + u.z * HAND_D);
  }

  /** Posisi & arah kartu ke-k dari n di deret depan kursi (miring `tilt`, 0 = tegak, π/2 = telentang). */
  handPose(axes, k, n, tilt, lift, pos, quat) {
    const { u, r } = axes;
    const off = (k - (n - 1) / 2) * (TILE_W + HAND_GAP);
    const nrm = _v.copy(u).multiplyScalar(Math.cos(tilt)).addScaledVector(UP, Math.sin(tilt)); // muka kartu menghadap pemiliknya
    const zAx = new THREE.Vector3().crossVectors(r, nrm); // sumbu panjang: ujung +z di bawah
    quat.setFromRotationMatrix(_m.makeBasis(r, nrm, zAx));
    const t = this.table;
    pos.set(t.x + u.x * HAND_D + r.x * off, t.y + (TILE_T / 2) * Math.sin(tilt) + lift, t.z + u.z * HAND_D + r.z * off);
    pos.addScaledVector(zAx, -TILE_L / 2); // tepi bawah menyentuh meja di garis deret
    pos.y = Math.max(pos.y, t.y + TILE_T / 2 + lift);
  }

  acquire() {
    const mesh = this.pool.pop() || makeTile();
    mesh.visible = true;
    this.group.add(mesh);
    return mesh;
  }

  release(mesh) {
    mesh.removeFromParent();
    mesh.userData.fly = null;
    this.pool.push(mesh);
  }

  /** Kartu milik penonton/pemain lokal yang bisa diketuk (kartu sendiri & bayangan ujung rantai). */
  pickables(viewerId) {
    const list = [];
    for (const [key, mesh] of this.tiles) if (key.startsWith('h:') && mesh.userData.owner === viewerId) list.push(mesh);
    for (const g of this.ghosts) if (g.visible) list.push(g);
    return list;
  }

  update(dt, m, viewerId) {
    this.time += dt;
    const t = this.table;
    let fresh = null;
    if (m.ev && m.ev.n !== this.lastEv) {
      if (this.lastEv !== -1) fresh = m.ev;
      this.lastEv = m.ev.n;
    }
    if (fresh?.k === 'start') {
      // babak baru: semua kartu dikumpulkan lalu dibagikan dari tengah meja
      for (const mesh of this.tiles.values()) this.release(mesh);
      this.tiles.clear();
    }
    const want = new Map();
    const add = (key, spec) => want.set(key, spec);
    if (m.phase === 'lobby') {
      // satu set kartu tertutup bertumpuk di tengah meja
      for (let k = 0; k < 28; k++) {
        const col = k % 4, layer = Math.floor(k / 4);
        const pos = this.toWorld((col - 1.5) * (TILE_W + 0.004), 0, TILE_T / 2 + layer * TILE_T, new THREE.Vector3());
        add(`p:${k}`, { pos, quat: this.flat(0, true, new THREE.Quaternion()) });
      }
    } else {
      const played = fresh && (fresh.k === 'play' || fresh.k === 'win') && fresh.t ? fresh : null;
      // rantai
      const lay = layoutChain(m.line || [], m.root || 0);
      (m.line || []).forEach(([a, b], i) => {
        const id = `${Math.min(a, b)}${Math.max(a, b)}`;
        const p = lay[i];
        // muka kartu digambar dengan angka pertama di −z; pasangan terbalik diputar setengah putaran
        const rot = p.rot + (a > b ? Math.PI : 0);
        const spec = { pos: this.toWorld(p.x, p.z, TILE_T / 2, new THREE.Vector3()), quat: this.flat(rot, false, new THREE.Quaternion()), face: id };
        if (played && played.t === id && !this.tiles.has(`c:${id}`)) {
          const who = played.by || played.p;
          const own = this.tiles.get(`h:${id}`);
          spec.from = own ? own.position.clone() : this.handCenter(m, who);
          spec.fromQ = own ? own.quaternion.clone() : spec.quat.clone();
          this.ctx.characterOf(who)?.reachTo?.(spec.pos);
        }
        add(`c:${id}`, spec);
      });
      if (played) this.sound('card');
      // kartu di tangan
      const reveal = m.phase === 'end';
      const deal = fresh?.k === 'start';
      const center = new THREE.Vector3(t.x, t.y + 0.04, t.z);
      m.players.forEach((p, i) => {
        const hand = m.hands?.[p.id] || [];
        const own = p.id === viewerId;
        const axes = this.seatAxes(m, i);
        const ids = own ? [...hand].sort() : hand;
        ids.forEach((id, k) => {
          const v = this.view;
          const playable = own && v.myTurn && v.playable?.has(id);
          const lift = !own || reveal ? 0 : v.sel === id ? 0.03 : v.hover === id ? 0.012 : playable ? 0.006 : 0;
          const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
          this.handPose(axes, k, ids.length, reveal ? Math.PI / 2 : own ? OWN_TILT : OPP_TILT, lift, pos, quat);
          const spec = { pos, quat, face: own || reveal ? id : null, dim: own && v.myTurn && !playable && !reveal, owner: p.id, tile: own ? id : null };
          if (deal) {
            spec.from = center;
            spec.fromQ = this.flat(0, true, new THREE.Quaternion());
            spec.delay = k * 0.07 + i * 0.02;
          }
          add(own ? `h:${id}` : `o:${p.id}:${k}`, spec);
        });
      });
      // kartu yang disisihkan (2–3 pemain): bertumpuk tertutup di sudut meja
      for (let k = 0; k < (m.sleep || 0); k++) {
        const pos = this.toWorld(0.4 + (k % 2) * (TILE_W + 0.004), 0.4, TILE_T / 2 + Math.floor(k / 2) * TILE_T, new THREE.Vector3());
        add(`s:${k}`, { pos, quat: this.flat(Math.PI / 4, true, new THREE.Quaternion()) });
      }
    }
    // sinkronkan mesh
    for (const [key, mesh] of this.tiles) {
      if (!want.has(key)) {
        this.release(mesh);
        this.tiles.delete(key);
      }
    }
    const k = 1 - Math.exp(-dt * 12);
    for (const [key, w] of want) {
      let mesh = this.tiles.get(key);
      if (!mesh) {
        mesh = this.acquire();
        this.tiles.set(key, mesh);
        mesh.position.copy(w.from || w.pos);
        mesh.quaternion.copy(w.fromQ || w.quat);
        mesh.userData.delay = w.delay || 0;
        mesh.userData.fly = w.from && !w.delay ? { t: 0, from: w.from.clone(), fromQ: (w.fromQ || w.quat).clone() } : null;
      }
      mesh.userData.face.material = faceMaterial(w.face, w.dim);
      mesh.userData.tile = w.tile || null;
      mesh.userData.owner = w.owner || null;
      if (mesh.userData.delay > 0) {
        mesh.userData.delay -= dt;
        if (mesh.userData.delay <= 0) mesh.userData.fly = { t: 0, from: mesh.position.clone(), fromQ: mesh.quaternion.clone() };
        continue;
      }
      const f = mesh.userData.fly;
      if (f) {
        // melayang dengan lengkung kecil
        f.t = Math.min(1, f.t + dt / FLY);
        const e = 1 - (1 - f.t) ** 3;
        mesh.position.lerpVectors(f.from, w.pos, e);
        mesh.position.y += Math.sin(e * Math.PI) * 0.12;
        mesh.quaternion.slerpQuaternions(f.fromQ, w.quat, e);
        if (f.t >= 1) mesh.userData.fly = null;
      } else {
        mesh.position.lerp(w.pos, k);
        mesh.quaternion.slerp(w.quat, k);
      }
    }
    this.updateGhosts(m);
  }

  /** Kartu terpilih bisa disambung ke dua ujung: bayangan kuning di kedua tempat, ketuk untuk memasang. */
  updateGhosts(m) {
    const v = this.view;
    const opts = v.sel && v.myTurn && m.phase === 'play' ? choices(v.sel, m.line, m.root, m.must) : [];
    for (const g of this.ghosts) {
      g.visible = opts.length > 1 && opts.includes(g.userData.side);
      if (!g.visible) continue;
      const { line, root } = place(m.line, m.root, v.sel, g.userData.side);
      const i = g.userData.side === 'L' ? 0 : line.length - 1;
      const p = layoutChain(line, root)[i];
      const [a, b] = line[i];
      this.toWorld(p.x, p.z, TILE_T / 2 + 0.002, g.position);
      this.flat(p.rot + (a > b ? Math.PI : 0), false, g.quaternion);
      g.userData.tile = v.sel;
      g.userData.face.material.map = faceTexture(v.sel);
      g.material.opacity = 0.4 + Math.sin(this.time * 6) * 0.15;
    }
  }

  dispose() {
    this.group.removeFromParent();
  }
}

// ---------------- Kontrol pemain ----------------
class DominoControls {
  constructor(ctx) {
    this.ctx = ctx;
    this.sel = null;
    this.hover = null;
    this.panelSig = '';
  }

  enter() {
    this.btnL = this.ctx.button('arrowRight', 'Sambung', () => this.playSel('L'), '', 'dm-left');
    this.btnR = this.ctx.button('arrowRight', 'Sambung', () => this.playSel('R'), '', 'dm-right');
    this.btnL.querySelector('.ic').style.transform = 'scaleX(-1)';
    // tombol sisa kartu: di bawah tombol kamera
    const root = document.getElementById('cards-ui');
    this.tilesBtn = document.createElement('button');
    this.tilesBtn.type = 'button';
    this.tilesBtn.id = 'dm-tiles';
    this.tilesBtn.className = 'icon-btn';
    this.tilesBtn.title = 'Sisa kartu';
    this.tilesBtn.setAttribute('aria-label', 'Sisa kartu');
    this.tilesBtn.setAttribute('aria-expanded', 'false');
    this.tilesBtn.innerHTML = icon('cards');
    this.tilesBtn.hidden = true;
    this.tilesBtn.addEventListener('click', () => {
      this.togglePanel(this.panel.hidden);
      this.ctx.audio.play('click');
    });
    this.panel = document.createElement('div');
    this.panel.id = 'dm-panel';
    this.panel.className = 'dm-panel';
    this.panel.hidden = true;
    this.panel.innerHTML = `<div class="dm-head"><b>${icon('cards')}Sisa kartu</b><button type="button" class="dm-x" aria-label="Tutup">${icon('x')}</button></div><div class="dm-body"></div>`;
    this.panel.querySelector('.dm-x').addEventListener('click', () => this.togglePanel(false));
    root.append(this.tilesBtn, this.panel);
  }

  exit() {
    this.tilesBtn?.remove();
    this.panel?.remove();
    this.sel = null;
  }

  togglePanel(open) {
    this.panel.hidden = !open;
    this.tilesBtn.classList.toggle('on', open);
    this.tilesBtn.setAttribute('aria-expanded', String(open));
    this.panelSig = '';
  }

  myTurn(m) {
    return m.phase === 'play' && m.players[m.turn]?.id === this.ctx.myId;
  }

  update(dt, m) {
    const me = this.ctx.myId;
    const hand = m.hands?.[me] || [];
    const mine = this.myTurn(m);
    if (!mine || !hand.includes(this.sel)) this.sel = null;
    const playable = new Set(mine ? hand.filter((id) => choices(id, m.line || [], m.root, m.must).length) : []);
    const r = this.ctx.renderer(m);
    if (r) r.view = { sel: this.sel, hover: this.hover, playable, myTurn: mine };
    // dua pilihan ujung: tombol "Sambung ke n" (juga bisa ketuk bayangan kuning di meja)
    const opts = this.sel ? choices(this.sel, m.line, m.root, m.must) : [];
    const e = ends(m.line || []);
    for (const [btn, side] of [[this.btnL, 'L'], [this.btnR, 'R']]) {
      btn.hidden = opts.length < 2 || !opts.includes(side);
      if (!btn.hidden) btn.querySelector('span').textContent = `Sambung ke ${e[side === 'L' ? 0 : 1]}`;
    }
    this.tilesBtn.hidden = m.phase === 'lobby' || !m.players.some((p) => p.id === me);
    if (this.tilesBtn.hidden && !this.panel.hidden) this.togglePanel(false);
    if (!this.panel.hidden) this.renderPanel(m);
  }

  /** Panel sisa kartu: jumlah kartu tiap pemain, angka yang belum keluar, & 28 kartu (sudah di meja pudar). */
  renderPanel(m) {
    const me = this.ctx.myId;
    const sig = `${m.v}|${m.phase}`;
    if (sig === this.panelSig) return;
    this.panelSig = sig;
    const onTable = new Set((m.line || []).map(([a, b]) => `${Math.min(a, b)}${Math.max(a, b)}`));
    const mine = new Set(m.hands?.[me] || []);
    const unseen = makeSet().filter((id) => !onTable.has(id) && !mine.has(id));
    const body = this.panel.querySelector('.dm-body');
    const players = m.players
      .map((p) => {
        const n = m.hands?.[p.id]?.length ?? 0;
        const name = p.id === me ? 'Kamu' : p.name;
        return `<div><span class="dot" style="background:${p.color}"></span><span class="nm"></span><b>${n}</b> kartu</div>`.replace('<span class="nm"></span>', `<span class="nm">${escapeHtml(name)}</span>`);
      })
      .join('');
    const nums = [0, 1, 2, 3, 4, 5, 6]
      .map((n) => {
        const c = unseen.filter((id) => pips(id).includes(n)).length;
        return `<span class="${c ? '' : 'zero'}"><i>${n}</i><b>${c}</b></span>`;
      })
      .join('');
    let grid = '';
    for (let a = 0; a <= 6; a++) {
      let row = '';
      for (let b = a; b <= 6; b++) {
        const id = `${a}${b}`;
        const cls = onTable.has(id) ? 'played' : mine.has(id) ? 'mine' : '';
        row += `<img src="${faceUrl(id)}" class="${cls}" alt="${a}-${b}" title="${a}-${b}${cls === 'played' ? ' (sudah di meja)' : cls === 'mine' ? ' (kartumu)' : ''}">`;
      }
      grid += `<div class="dm-row">${row}</div>`;
    }
    const sleep = m.sleep ? `<p class="dm-note">${m.sleep} kartu disisihkan (tidak dimainkan).</p>` : '';
    body.innerHTML = `<div class="dm-players">${players}</div>
      <p class="dm-sub">Angka yang belum keluar (di luar kartumu)</p><div class="dm-nums">${nums}</div>
      <p class="dm-sub">Semua kartu · ${onTable.size} di meja · ${unseen.length} belum terlihat</p><div class="dm-grid">${grid}</div>
      <div class="dm-legend"><span><i class="lg-mine"></i>Kartumu</span><span><i class="lg-played"></i>Sudah di meja</span></div>${sleep}`;
  }

  playerBadge(m, p) {
    if (m.phase !== 'play') return '';
    return `<span class="cp-badge" title="Sisa kartu">${m.hands?.[p.id]?.length ?? 0}</span>`;
  }

  targets(m) {
    return this.ctx.renderer(m)?.pickables(this.ctx.myId) || [];
  }

  setHover(obj) {
    this.hover = obj?.userData.tile && !obj.userData.ghost ? obj.userData.tile : null;
  }

  click(obj, m) {
    if (m.phase !== 'play' || !obj) return;
    const d = obj.userData;
    if (!this.myTurn(m)) return this.ctx.flash('Bukan giliranmu');
    if (d.ghost) return this.playSel(d.side);
    if (!d.tile) return;
    const opts = choices(d.tile, m.line, m.root, m.must);
    if (!opts.length) {
      this.ctx.audio.play('click');
      return this.ctx.flash(m.must ? `Buka dengan balak ${m.must[0]}` : 'Tidak bisa disambung');
    }
    if (opts.length === 1) return this.send(d.tile, opts[0]);
    this.sel = this.sel === d.tile ? null : d.tile;
    this.ctx.audio.play('click');
  }

  playSel(side) {
    if (this.sel) this.send(this.sel, side);
  }

  send(t, side) {
    this.ctx.act({ a: 'play', t, side });
    this.sel = null;
  }

  onEvent(ev, m) {
    const name = this.ctx.playerName;
    if (ev.k === 'pass') this.ctx.flash(ev.p === this.ctx.myId ? 'Kamu lewat (tidak ada yang cocok)' : `${name(ev.p)} lewat`);
    else if (ev.k === 'win' && ev.why === 'block') this.ctx.flash('Buntu!');
  }

  endText(m) {
    const w = m.winner;
    if (!w) return '';
    if (m.why === 'block') return `Buntu · ${this.ctx.playerName(w)} paling sedikit titik (${m.pips?.[w] ?? 0})`;
    if (m.why === 'out') return `${this.ctx.playerName(w)} menghabiskan kartu`;
    return '';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export default {
  id: 'domino',
  name: 'Domino',
  icon: 'domino',
  art: 'linear-gradient(135deg, #495057, #212529)',
  min: 2,
  max: 4,
  seatOrder: (n) => (n === 2 ? [0, 2] : [0, 1, 2, 3]), // berdua: duduk berhadapan
  topView: true, // kamera atas untuk melihat rantai kartu
  cam: { dist: 1.25, el: 1.0, topH: 1.2 },
  headPitch: -0.75,
  holdsCards: false,
  Host: DominoHost,
  Renderer: DominoRenderer,
  Controls: DominoControls,
};

