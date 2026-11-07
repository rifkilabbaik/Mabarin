import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

// ---------- Bidak catur bentuk koin dengan ikon ----------
// Ikon digambar di kotak 100×100 (silhouette sederhana per jenis bidak).
function drawChessIcon(g, type) {
  const poly = (pts) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  };
  const circle = (x, y, r) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  const base = () => g.fillRect(26, 72, 48, 12);
  switch (type) {
    case 'P':
      circle(50, 30, 13);
      poly([[41, 42], [59, 42], [66, 72], [34, 72]]);
      base();
      break;
    case 'R':
      poly([[26, 18], [36, 18], [36, 26], [45, 26], [45, 18], [55, 18], [55, 26], [64, 26], [64, 18], [74, 18], [74, 36], [26, 36]]);
      g.fillRect(34, 36, 32, 36);
      base();
      break;
    case 'N':
      poly([[34, 72], [36, 60], [44, 50], [34, 50], [24, 54], [18, 46], [30, 28], [42, 18], [48, 10], [54, 18], [64, 22], [74, 38], [76, 58], [70, 72]]);
      base();
      break;
    case 'B':
      circle(50, 14, 6);
      g.beginPath();
      g.moveTo(50, 18);
      g.quadraticCurveTo(70, 34, 64, 54);
      g.lineTo(36, 54);
      g.quadraticCurveTo(30, 34, 50, 18);
      g.fill();
      g.fillRect(38, 56, 24, 7);
      poly([[40, 63], [60, 63], [64, 72], [36, 72]]);
      base();
      break;
    case 'Q':
      poly([[30, 66], [20, 28], [32, 46], [36, 20], [44, 42], [50, 14], [56, 42], [64, 20], [68, 46], [80, 28], [70, 66]]);
      for (const [x, y] of [[20, 26], [36, 18], [50, 12], [64, 18], [80, 26]]) circle(x, y, 5);
      base();
      break;
    default: // K
      g.fillRect(46, 6, 8, 24);
      g.fillRect(38, 12, 24, 8);
      poly([[30, 66], [24, 38], [40, 32], [50, 40], [60, 32], [76, 38], [70, 66]]);
      base();
  }
}

const discTex = new Map();
function chessTopTexture(piece) {
  if (discTex.has(piece)) return discTex.get(piece);
  const white = piece[0] === 'w';
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = white ? '#f8f3e6' : '#2f333b';
  g.fillRect(0, 0, 128, 128);
  g.lineWidth = 7;
  g.strokeStyle = white ? '#c9a66b' : '#8c96a3';
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.stroke();
  g.save();
  g.translate(64 - 40, 64 - 40);
  g.scale(0.8, 0.8);
  g.fillStyle = white ? '#2b2f36' : '#f8f3e6';
  drawChessIcon(g, piece[1]);
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  discTex.set(piece, tex);
  return tex;
}

let discGeo = null;
/**
 * Bidak catur berbentuk koin dengan ikon di permukaan atas. piece: 'wK', 'bP', dst.
 * Ikon tegak bila rotation.y = π/2 untuk pemain putih (sisi +Z papan), -π/2 untuk hitam.
 */
export function chessDisc(piece) {
  discGeo ||= new THREE.CylinderGeometry(0.031, 0.033, 0.014, 28).translate(0, 0.007, 0);
  const side = pieceMaterial(piece[0] === 'w' ? '#e9dfc8' : '#24272e');
  const top = new THREE.MeshLambertMaterial({ map: chessTopTexture(piece) });
  const m = new THREE.Mesh(discGeo, [side, top, side]);
  m.castShadow = true;
  m.rotation.y = Math.PI / 2;
  return m;
}

export function checkerGeometry(king) {
  const key = king ? 'damK' : 'dam';
  if (pieceGeoCache.has(key)) return pieceGeoCache.get(key);
  const disc = new THREE.CylinderGeometry(0.028, 0.03, 0.012, 14).translate(0, 0.006, 0);
  const g = king ? merge([disc, new THREE.CylinderGeometry(0.026, 0.028, 0.012, 14).translate(0, 0.018, 0), new THREE.TorusGeometry(0.012, 0.003, 4, 10).rotateX(Math.PI / 2).translate(0, 0.026, 0)]) : merge([disc, new THREE.TorusGeometry(0.018, 0.0025, 4, 12).rotateX(Math.PI / 2).translate(0, 0.0125, 0)]);
  pieceGeoCache.set(key, g);
  return g;
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
