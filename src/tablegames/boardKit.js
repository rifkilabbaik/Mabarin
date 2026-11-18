import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Perlengkapan game papan: papan bertekstur canvas di atas meja, konversi petak ↔ posisi,
// pemilihan petak lewat raycast, dan model bidak low poly.

/** Grup papan di atas meja; sumbu lokal +Z menghadap kursi pemain pertama. */
export function boardGroup(ctx, table, seat0) {
  const g = new THREE.Group();
  g.position.set(table.x, table.y + 0.005, table.z);
  g.rotation.y = seat0.rot + Math.PI;
  ctx.scene.add(g);
  return g;
}

/** Bidang papan dengan gambar dari canvas (draw(ctx2d, px)). Juga dipakai sebagai target klik. */
export function canvasPlane(size, px, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  draw(c.getContext('2d'), px);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: tex }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.userData.isBoard = true;
  return mesh;
}

/** Bingkai kayu papan. */
export function boardFrame(size, color = '#6b4226') {
  const t = 0.03;
  const parts = [];
  for (const [w, d, x, z] of [[size + t * 2, t, 0, size / 2 + t / 2], [size + t * 2, t, 0, -size / 2 - t / 2], [t, size, size / 2 + t / 2, 0], [t, size, -size / 2 - t / 2, 0]]) {
    parts.push(new THREE.BoxGeometry(w, 0.03, d).translate(x, 0.005, z));
  }
  const geo = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Pusat petak (f, r) pada grid n×n berukuran size, dalam koordinat lokal papan. */
export function cellPos(f, r, n, size, out = new THREE.Vector3()) {
  const cell = size / n;
  return out.set((f - (n - 1) / 2) * cell, 0, ((n - 1) / 2 - r) * cell);
}

/** Petak dari titik dunia (hasil raycast). */
export function pickCell(point, group, n, size) {
  const p = group.worldToLocal(point.clone());
  const cell = size / n;
  const f = Math.floor(p.x / cell + n / 2);
  const r = Math.floor(n / 2 - p.z / cell);
  if (f < 0 || r < 0 || f >= n || r >= n) return null;
  return { f, r };
}

/** Penanda petak (sorot pilihan / langkah). */
export class Markers {
  constructor(parent, cell) {
    this.parent = parent;
    this.cell = cell;
    this.pool = [];
    this.used = 0;
  }

  begin() {
    this.used = 0;
  }

  add(pos, color, kind = 'square') {
    let m = this.pool[this.used];
    if (!m) {
      m = {
        square: new THREE.Mesh(new THREE.PlaneGeometry(this.cell * 0.96, this.cell * 0.96), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false })),
        dot: new THREE.Mesh(new THREE.CircleGeometry(this.cell * 0.18, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false })),
      };
      for (const k of ['square', 'dot']) {
        m[k].rotation.x = -Math.PI / 2;
        m[k].renderOrder = 2;
        this.parent.add(m[k]);
      }
      this.pool.push(m);
    }
    this.used++;
    m.square.visible = kind === 'square';
    m.dot.visible = kind === 'dot';
    const mesh = m[kind];
    mesh.position.set(pos.x, 0.004, pos.z);
    mesh.material.color.set(color);
  }

  end() {
    for (let i = this.used; i < this.pool.length; i++) {
      this.pool[i].square.visible = false;
      this.pool[i].dot.visible = false;
    }
  }
}

// ---------- Model bidak ----------
const lathe = (pts, seg = 8) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
const merge = (geos) => {
  const g = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)));
  g.computeVertexNormals();
  return g;
};

const pieceGeoCache = new Map();
/** Bidak catur (satuan: tinggi pion ±0.05). type: P N B R Q K */
export function chessGeometry(type) {
  if (pieceGeoCache.has(type)) return pieceGeoCache.get(type);
  const base = [[0, 0], [0.024, 0], [0.024, 0.006], [0.019, 0.01]];
  let g;
  switch (type) {
    case 'P':
      g = merge([lathe([...base, [0.011, 0.025], [0.007, 0.032], [0, 0.032]]), new THREE.IcosahedronGeometry(0.012, 1).translate(0, 0.04, 0)]);
      break;
    case 'R':
      g = merge([lathe([...base, [0.016, 0.04], [0.019, 0.042], [0.019, 0.055], [0, 0.055]])]);
      break;
    case 'N':
      g = merge([
        lathe([...base, [0.015, 0.022], [0, 0.022]]),
        new THREE.BoxGeometry(0.018, 0.04, 0.026).rotateX(-0.35).translate(0, 0.04, 0.002),
        new THREE.BoxGeometry(0.016, 0.014, 0.026).translate(0, 0.055, 0.012),
      ]);
      break;
    case 'B':
      g = merge([lathe([...base, [0.011, 0.035], [0.014, 0.048], [0.009, 0.06], [0.003, 0.066], [0, 0.068]])]);
      break;
    case 'Q':
      g = merge([lathe([...base, [0.012, 0.042], [0.019, 0.062], [0.012, 0.066], [0, 0.066]]), new THREE.IcosahedronGeometry(0.008, 0).translate(0, 0.072, 0)]);
      break;
    default: // K
      g = merge([
        lathe([...base, [0.013, 0.045], [0.018, 0.064], [0, 0.066]]),
        new THREE.BoxGeometry(0.006, 0.024, 0.006).translate(0, 0.078, 0),
        new THREE.BoxGeometry(0.018, 0.006, 0.006).translate(0, 0.08, 0),
      ]);
  }
  pieceGeoCache.set(type, g);
  return g;
}

export function checkerGeometry(king) {
  const key = king ? 'damK' : 'dam';
  if (pieceGeoCache.has(key)) return pieceGeoCache.get(key);
  const disc = new THREE.CylinderGeometry(0.028, 0.03, 0.012, 14).translate(0, 0.006, 0);
  // raja: dua keping bertumpuk (mahkota emas ditambahkan terpisah)
  const g = king ? merge([disc, new THREE.CylinderGeometry(0.027, 0.028, 0.012, 14).translate(0, 0.0185, 0)]) : merge([disc, new THREE.TorusGeometry(0.018, 0.0025, 4, 12).rotateX(Math.PI / 2).translate(0, 0.0125, 0)]);
  pieceGeoCache.set(key, g);
  return g;
}

/** Mahkota emas untuk raja dam (duduk di atas keping kedua). */
let crownGeo = null;
export function crownMesh() {
  if (!crownGeo) {
    const parts = [new THREE.CylinderGeometry(0.017, 0.019, 0.007, 10).translate(0, 0.0035, 0)];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      parts.push(new THREE.ConeGeometry(0.0045, 0.012, 4).translate(Math.sin(a) * 0.014, 0.012, Math.cos(a) * 0.014));
      parts.push(new THREE.IcosahedronGeometry(0.0022, 0).translate(Math.sin(a) * 0.014, 0.0185, Math.cos(a) * 0.014));
    }
    crownGeo = merge(parts);
  }
  const m = new THREE.Mesh(crownGeo, pieceMaterial('#fcc419'));
  m.position.y = 0.0245;
  m.castShadow = true;
  return m;
}

export function pawnGeometry() {
  if (pieceGeoCache.has('ludo')) return pieceGeoCache.get('ludo');
  const g = merge([lathe([[0, 0], [0.017, 0], [0.017, 0.004], [0.008, 0.026], [0, 0.026]], 10), new THREE.IcosahedronGeometry(0.01, 1).translate(0, 0.032, 0)]);
  pieceGeoCache.set('ludo', g);
  return g;
}

const matCache = new Map();
export function pieceMaterial(color) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    matCache.set(color, m);
  }
  return m;
}

// ---------- Garis tepi (inverted hull) ----------
const hullCache = new Map();
/** Salinan geometri yang didorong keluar sepanjang normal halus — digambar sisi belakangnya sebagai garis tepi. */
export function outlineGeometry(key, geo, width) {
  const k = `${key}:${width}`;
  if (hullCache.has(k)) return hullCache.get(k);
  let g = geo.clone();
  g.deleteAttribute('normal');
  if (g.attributes.uv) g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * width, p.getY(i) + n.getY(i) * width, p.getZ(i) + n.getZ(i) * width);
  hullCache.set(k, g);
  return g;
}

const hullMats = new Map();
export function outlineMaterial(color, transparent = false) {
  const k = `${color}:${transparent}`;
  let m = hullMats.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent, depthWrite: !transparent });
    hullMats.set(k, m);
  }
  return m;
}

// ---------- Bidak catur 3D ----------
export const CHESS_COLORS = { w: '#f4ede0', b: '#2f333b' };
const CHESS_EDGE = { w: '#1d2026', b: '#ffffff' }; // putih bergaris tepi hitam, hitam bergaris tepi putih

/** Bidak catur 3D bergaris tepi tipis kontras. piece: 'wK', 'bP', dst. */
export function chessPiece(piece) {
  const mesh = new THREE.Mesh();
  mesh.castShadow = true;
  mesh.scale.setScalar(1.35);
  const edge = new THREE.Mesh();
  mesh.add(edge);
  mesh.userData.edge = edge;
  setChessPiece(mesh, piece);
  return mesh;
}

export function setChessPiece(mesh, piece) {
  const c = piece[0], t = piece[1];
  mesh.geometry = chessGeometry(t);
  mesh.material = pieceMaterial(CHESS_COLORS[c]);
  mesh.userData.edge.geometry = outlineGeometry(`chess${t}`, chessGeometry(t), 0.0016);
  mesh.userData.edge.material = outlineMaterial(CHESS_EDGE[c]);
  mesh.rotation.y = c === 'w' ? Math.PI : 0; // kuda menghadap lawan
  mesh.userData.piece = piece;
}

// ---------- Bidak yang dimakan ----------
const easeIO = (k) => k * k * (3 - 2 * k);

/**
 * Bidak yang dimakan diangkat dari papan, dibawa ke belakang papan, lalu disusun rapi
 * di sisi pemain yang memakannya ('w' = sisi +Z papan, 'b' = sisi -Z).
 */
export class Captures {
  constructor(group, { make, perRow, gap, rowGap, edge, onLand }) {
    this.group = group;
    this.o = { make, perRow, gap, rowGap, edge };
    this.onLand = onLand;
    this.sides = { w: [], b: [] };
    this.pending = [];
    this.anims = [];
  }

  slot(side, i, out = new THREE.Vector3()) {
    const { perRow, gap, rowGap, edge } = this.o;
    const s = side === 'w' ? 1 : -1;
    const row = Math.floor(i / perRow), col = i % perRow;
    return out.set(s * (col - (perRow - 1) / 2) * gap, 0, s * (edge + row * rowGap));
  }

  /** Mesh bidak dari papan yang baru dimakan oleh `side` — dianimasikan ke tempat simpan. */
  adopt(side, mesh, delay) {
    this.pending.push({ side, mesh, delay });
  }

  /** lists: { w: [bidak yang dimakan putih], b: [...] } dari state. */
  sync(lists) {
    for (const side of ['w', 'b']) {
      const list = lists?.[side] || [];
      const arr = this.sides[side];
      if (arr.length > list.length || arr.some((e, i) => e.piece !== list[i])) {
        for (const e of arr) e.mesh.removeFromParent();
        arr.length = 0;
        this.anims = this.anims.filter((a) => a.mesh.parent);
      }
      while (arr.length < list.length) {
        const i = arr.length;
        const piece = list[i];
        const pi = this.pending.findIndex((p) => p.side === side);
        let mesh;
        if (pi >= 0) {
          const p = this.pending.splice(pi, 1)[0];
          mesh = p.mesh;
          this.anims.push({ mesh, from: null, to: this.slot(side, i), t: -p.delay, spin: (Math.random() < 0.5 ? -1 : 1) * Math.PI * 2 });
        } else {
          mesh = this.o.make(piece);
          this.slot(side, i, mesh.position);
          this.group.add(mesh);
        }
        arr.push({ piece, mesh });
      }
    }
    for (const p of this.pending) p.mesh.removeFromParent();
    this.pending.length = 0;
  }

  update(dt) {
    for (const a of this.anims) {
      a.t += dt / 0.65;
      if (a.t < 0) continue;
      if (!a.from) {
        a.from = a.mesh.position.clone();
        a.rot0 = a.mesh.rotation.y;
      }
      const k = easeIO(Math.min(1, a.t));
      a.mesh.position.lerpVectors(a.from, a.to, k);
      a.mesh.position.y = a.from.y * (1 - k) + Math.sin(k * Math.PI) * 0.13;
      a.mesh.rotation.y = a.rot0 + a.spin * k;
      if (a.t >= 1) {
        a.mesh.position.copy(a.to);
        a.mesh.rotation.y = a.rot0;
        this.onLand?.();
      }
    }
    this.anims = this.anims.filter((a) => a.t < 1);
  }

  get busy() {
    return this.anims.length > 0;
  }
}

/**
 * Selaraskan mesh bidak dengan isi papan terbaru.
 * - bidak yang dijalankan (ev.from → ev.to) melompat ke petak barunya;
 * - bidak lain yang pindah dalam langkah yang sama (mis. benteng saat rokade) ikut dianimasikan;
 * - bidak yang hilang karena dimakan diserahkan ke `captures` (dibawa ke belakang papan);
 * - bidak yang berubah jenis (promosi / jadi raja) diganti bentuknya tanpa memutus animasi.
 * o: { pos(sq,out), make(piece), retype(mesh,piece), colorOf(piece), ev, capSide, captures, anims }
 */
export function syncBoard(meshes, board, o) {
  const next = new Map();
  const vanished = [];
  const ev = o.ev;
  const moving = new Set();
  if (ev && ev.from !== undefined && ev.to !== undefined && meshes.has(ev.from)) {
    const mover = meshes.get(ev.from);
    meshes.delete(ev.from);
    const victim = meshes.get(ev.to);
    if (victim) {
      meshes.delete(ev.to);
      vanished.push(victim);
    }
    next.set(ev.to, mover);
    moving.add(mover);
    o.anims.push({ mesh: mover, from: mover.position.clone(), to: o.pos(ev.to), t: 0 });
  }
  for (const [sq, mesh] of meshes) {
    if (!next.has(sq) && board[sq] === mesh.userData.piece) next.set(sq, mesh);
    else vanished.push(mesh);
  }
  // bidak sama jenis yang muncul di petak lain = ikut pindah (rokade)
  for (let sq = 0; sq < board.length; sq++) {
    const p = board[sq];
    if (!p || next.has(sq)) continue;
    const vi = vanished.findIndex((m) => m.userData.piece === p);
    if (vi >= 0) {
      const mesh = vanished.splice(vi, 1)[0];
      next.set(sq, mesh);
      o.anims.push({ mesh, from: mesh.position.clone(), to: o.pos(sq), t: 0 });
    } else {
      const mesh = o.make(p);
      o.pos(sq, mesh.position);
      next.set(sq, mesh);
    }
  }
  // berubah jenis di petak yang sama (promosi)
  for (const [sq, mesh] of next) {
    const p = board[sq];
    if (p && mesh.userData.piece !== p && o.colorOf(mesh.userData.piece) === o.colorOf(p)) o.retype(mesh, p);
    else if (p && mesh.userData.piece !== p) {
      vanished.push(mesh);
      const fresh = o.make(p);
      o.pos(sq, fresh.position);
      next.set(sq, fresh);
    }
  }
  for (const mesh of vanished) {
    if (o.capSide && o.colorOf(mesh.userData.piece) !== o.capSide) o.captures.adopt(o.capSide, mesh, 0.28);
    else mesh.removeFromParent();
  }
  meshes.clear();
  for (const [sq, mesh] of next) meshes.set(sq, mesh);
}

/** Gerak bidak: terangkat, melayang ke petak tujuan, lalu turun. */
export function animatePieces(anims, dt, height = 0.045, dur = 0.4) {
  for (const a of anims) {
    a.t = Math.min(1, a.t + dt / dur);
    const k = easeIO(a.t);
    a.mesh.position.lerpVectors(a.from, a.to, k);
    a.mesh.position.y = Math.sin(k * Math.PI) * height;
  }
  return anims.filter((a) => a.t < 1);
}
