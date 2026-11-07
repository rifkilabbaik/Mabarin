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
