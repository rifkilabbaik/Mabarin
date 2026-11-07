import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- Helper ----------
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${opts.side || 0}|${opts.emissive || ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
    matCache.set(key, m);
  }
  return m;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Gabungkan banyak geometri (dengan posisi/rotasi/skala) jadi satu mesh = 1 draw call. */
export function mergedMesh(pieces, material) {
  const geos = pieces.map(({ geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], quat }) => {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    if (quat) _q.copy(quat);
    else _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
    _m.compose(_p.set(...pos), _q, _s.set(...scale));
    g.applyMatrix4(_m);
    g.deleteAttribute('uv');
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  merged.computeVertexNormals();
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  return mesh;
}

function onSphere(center, radius, theta, phi) {
  const n = new THREE.Vector3(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi));
  return { pos: [center.x + n.x * radius, center.y + n.y * radius, center.z + n.z * radius], quat: new THREE.Quaternion().setFromUnitVectors(UP, n) };
}

// ---------- Mata ----------
const WHITE = new THREE.MeshBasicMaterial({ color: '#ffffff' });
export function buildEyes(style, d) {
  const g = new THREE.Group();
  const black = mat('#1b1d29');
  const white = WHITE;
  const ex = d.r * 0.33, ez = d.r * 0.9;
  for (const side of [-1, 1]) {
    if (style === 'happy') {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 4, 8, Math.PI), black);
      arc.position.set(side * ex, 0, ez + 0.01);
      g.add(arc);
    } else if (style === 'sleepy') {
      const line = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.09, 2, 6), black);
      line.rotation.z = Math.PI / 2;
      line.position.set(side * ex, -0.01, ez + 0.005);
      g.add(line);
    } else {
      const big = style === 'big';
      const eye = big
        ? new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), black)
        : new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.1, 2, 6), black);
      if (big) eye.scale.z = 0.5;
      eye.position.set(side * ex, 0.02, ez);
      g.add(eye);
      const glint = new THREE.Mesh(new THREE.IcosahedronGeometry(big ? 0.03 : 0.022, 0), white);
      glint.position.set(side * ex + 0.024, big ? 0.055 : 0.07, ez + (big ? 0.045 : 0.05));
      g.add(glint);
    }
    const cheek = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat('#ff8fa3'));
    cheek.scale.set(1, 0.6, 0.5);
    cheek.position.set(side * d.r * 0.6, -0.14, d.r * 0.79);
    g.add(cheek);
  }
  return g;
}

// ---------- Rambut (bagian "top" disembunyikan saat memakai topi) ----------
export function buildHair(style, color, d) {
  const top = new THREE.Group();
  const side = new THREE.Group();
  const m = mat(color);
  const mSide = mat(color, { side: THREE.DoubleSide });
  const c = new THREE.Vector3(0, d.height - d.r, 0); // pusat "kepala"
  const r = d.r;
  const cap = () => ({ geo: new THREE.SphereGeometry(r * 1.07, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), pos: [0, c.y + 0.06, 0] });

  if (style === 'spiky') {
    const pieces = [{ geo: new THREE.SphereGeometry(r * 1.04, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), pos: [0, c.y + 0.05, 0] }];
    const spikes = [[0, 0], ...[0, 1, 2, 3, 4, 5].map((k) => [0.85, (k / 6) * Math.PI * 2 + 0.3])];
    for (const [th, ph] of spikes) {
      const s = onSphere(c, r * 0.98, th, ph);
      pieces.push({ geo: new THREE.ConeGeometry(0.12, 0.34, 4), pos: s.pos, quat: s.quat });
    }
    top.add(mergedMesh(pieces, m));
  } else if (style === 'bob') {
    top.add(mergedMesh([cap()], m));
    const gap = 0.95;
    const sides = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.07, r * 1.13, 0.46, 12, 1, true, gap, Math.PI * 2 - gap * 2), mSide);
    sides.position.y = c.y - 0.16;
    sides.castShadow = true;
    side.add(sides);
  } else if (style === 'ponytail') {
    top.add(mergedMesh([cap()], m));
    side.add(mergedMesh([
      { geo: new THREE.IcosahedronGeometry(0.15, 0), pos: [0, c.y + 0.02, -r * 1.02] },
      { geo: new THREE.ConeGeometry(0.13, 0.45, 6), pos: [0, c.y - 0.26, -r * 1.12], rot: [Math.PI + 0.25, 0, 0] },
    ], m));
  } else if (style === 'mohawk') {
    const pieces = [];
    for (let i = -3; i <= 3; i++) {
      const a = i * 0.32;
      pieces.push({ geo: new THREE.BoxGeometry(0.08, 0.26, 0.15), pos: [0, c.y + Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05], rot: [a, 0, 0] });
    }
    top.add(mergedMesh(pieces, m));
  } else if (style === 'afro') {
    const pieces = [];
    const blobs = [[0, 0, 0.26], [0.7, 0.4, 0.22], [0.7, 1.45, 0.22], [0.7, 2.5, 0.22], [0.7, 3.55, 0.22], [0.7, 4.6, 0.22], [0.7, 5.65, 0.22], [1.25, Math.PI, 0.2], [1.2, 2.4, 0.19], [1.2, 3.9, 0.19]];
    for (const [th, ph, br] of blobs) {
      const s = onSphere(c, r * 1.02, th, ph);
      pieces.push({ geo: new THREE.IcosahedronGeometry(br + r * 0.12, 0), pos: s.pos });
    }
    top.add(mergedMesh(pieces, m));
  }
  return { top, side, extra: style === 'afro' ? 0.3 : style === 'spiky' || style === 'mohawk' ? 0.15 : 0 };
}

// ---------- Topi ----------
export function buildHat(style, d) {
  const g = new THREE.Group();
  const c = d.height - d.r;
  const r = d.r;
  let extra = 0;
  if (style === 'cap') {
    g.add(mergedMesh([
      { geo: new THREE.SphereGeometry(r * 1.08, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), pos: [0, c + 0.04, 0] },
      { geo: new THREE.IcosahedronGeometry(0.05, 0), pos: [0, c + r * 1.1 + 0.04, 0] },
    ], mat('#e03131')));
    g.add(mergedMesh([{ geo: new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.04, 10, 1, false, -Math.PI / 2, Math.PI), pos: [0, c + 0.06, r * 0.6] }], mat('#b02525')));
    extra = 0.1;
  } else if (style === 'cowboy') {
    const y0 = c + r * 0.5;
    g.add(mergedMesh([
      { geo: new THREE.CylinderGeometry(r * 1.8, r * 1.8, 0.05, 12), pos: [0, y0, 0] },
      { geo: new THREE.CylinderGeometry(r * 0.72, r * 0.88, 0.36, 10), pos: [0, y0 + 0.2, 0] },
    ], mat('#a0672f')));
    g.add(mergedMesh([{ geo: new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.07, 10), pos: [0, y0 + 0.06, 0] }], mat('#4a2f1b')));
    extra = 0.4;
  } else if (style === 'beanie') {
    g.add(mergedMesh([
      { geo: new THREE.SphereGeometry(r * 1.09, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), pos: [0, c + 0.03, 0], scale: [1, 1.12, 1] },
      { geo: new THREE.TorusGeometry(r * 1.06, 0.065, 5, 14), pos: [0, c + 0.06, 0], rot: [Math.PI / 2, 0, 0] },
    ], mat('#4263eb')));
    g.add(mergedMesh([{ geo: new THREE.IcosahedronGeometry(0.12, 0), pos: [0, c + r * 1.2 + 0.1, 0] }], mat('#f8f9fa')));
    extra = 0.25;
  } else if (style === 'party') {
    g.add(mergedMesh([{ geo: new THREE.ConeGeometry(r * 0.55, 0.6, 8), pos: [0.05, d.height + 0.22, 0], rot: [0, 0, -0.15] }], mat('#f783ac')));
    g.add(mergedMesh([{ geo: new THREE.IcosahedronGeometry(0.08, 0), pos: [0.13, d.height + 0.54, 0] }], mat('#ffd43b')));
    extra = 0.6;
  } else if (style === 'crown') {
    const gold = mat('#f5c518', { emissive: '#5c4300', side: THREE.DoubleSide });
    const pieces = [{ geo: new THREE.CylinderGeometry(r * 0.62, r * 0.58, 0.16, 10, 1, true), pos: [0, d.height - 0.02, 0] }];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      pieces.push({ geo: new THREE.ConeGeometry(0.07, 0.17, 4), pos: [Math.sin(a) * r * 0.6, d.height + 0.14, Math.cos(a) * r * 0.6] });
    }
    g.add(mergedMesh(pieces, gold));
    g.add(mergedMesh([{ geo: new THREE.OctahedronGeometry(0.05, 0), pos: [0, d.height - 0.02, r * 0.63] }], mat('#e03131')));
    extra = 0.25;
  }
  return { group: g, extra };
}

// ---------- Aksesoris wajah (di dalam grup wajah, y=0 = tinggi mata) ----------
export function buildFaceAcc(style, d, hairColor) {
  const g = new THREE.Group();
  const ex = d.r * 0.33, ez = d.r * 0.9;
  if (style === 'glasses') {
    g.add(mergedMesh([
      { geo: new THREE.TorusGeometry(0.09, 0.017, 4, 10), pos: [-ex, 0.02, ez + 0.05] },
      { geo: new THREE.TorusGeometry(0.09, 0.017, 4, 10), pos: [ex, 0.02, ez + 0.05] },
      { geo: new THREE.BoxGeometry(ex * 2 - 0.18, 0.02, 0.02), pos: [0, 0.03, ez + 0.05] },
      { geo: new THREE.BoxGeometry(0.02, 0.02, d.r * 0.8), pos: [-ex - 0.09, 0.03, ez - d.r * 0.38] },
      { geo: new THREE.BoxGeometry(0.02, 0.02, d.r * 0.8), pos: [ex + 0.09, 0.03, ez - d.r * 0.38] },
    ], mat('#343a40')));
  } else if (style === 'shades') {
    g.add(mergedMesh([
      { geo: new THREE.BoxGeometry(0.19, 0.11, 0.03), pos: [-ex, 0.02, ez + 0.05] },
      { geo: new THREE.BoxGeometry(0.19, 0.11, 0.03), pos: [ex, 0.02, ez + 0.05] },
      { geo: new THREE.BoxGeometry(ex * 2, 0.025, 0.025), pos: [0, 0.05, ez + 0.05] },
      { geo: new THREE.BoxGeometry(0.02, 0.02, d.r * 0.8), pos: [-ex - 0.1, 0.04, ez - d.r * 0.38] },
      { geo: new THREE.BoxGeometry(0.02, 0.02, d.r * 0.8), pos: [ex + 0.1, 0.04, ez - d.r * 0.38] },
    ], mat('#111318')));
  } else if (style === 'mustache') {
    g.add(mergedMesh([
      { geo: new THREE.IcosahedronGeometry(0.1, 0), pos: [-0.075, -0.2, d.r * 0.9], scale: [1.1, 0.42, 0.45], rot: [0, 0, 0.3] },
      { geo: new THREE.IcosahedronGeometry(0.1, 0), pos: [0.075, -0.2, d.r * 0.9], scale: [1.1, 0.42, 0.45], rot: [0, 0, -0.3] },
    ], mat(hairColor)));
  }
  return g;
}

// ---------- Punggung ----------
export function buildBack(style, d) {
  const g = new THREE.Group();
  const mid = d.r + d.len * 0.55;
  const anim = {};
  if (style === 'backpack') {
    const h = d.len * 0.7 + 0.25;
    g.add(mergedMesh([
      { geo: new THREE.BoxGeometry(d.r * 1.15, h, 0.3), pos: [0, mid, -d.r - 0.06] },
      { geo: new THREE.BoxGeometry(d.r * 0.8, h * 0.4, 0.12), pos: [0, mid - h * 0.15, -d.r - 0.26] },
    ], mat('#e8590c')));
    g.add(mergedMesh([{ geo: new THREE.BoxGeometry(d.r * 1.2, 0.12, 0.34), pos: [0, mid + h / 2 - 0.04, -d.r - 0.06] }], mat('#b8460a')));
  } else if (style === 'wings') {
    const white = mat('#f8f9fa');
    anim.wings = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.12, mid + 0.15, -d.r * 0.92);
      const w = mergedMesh([
        { geo: new THREE.ConeGeometry(0.3, 0.85, 4), pos: [s * 0.42, 0.05, 0], rot: [0, 0, s * 1.15], scale: [1, 1, 0.18] },
        { geo: new THREE.ConeGeometry(0.2, 0.55, 4), pos: [s * 0.33, -0.22, 0], rot: [0, 0, s * 1.5], scale: [1, 1, 0.18] },
      ], white);
      pivot.add(w);
      pivot.userData.side = s;
      g.add(pivot);
      return pivot;
    });
  } else if (style === 'cape') {
    const pivot = new THREE.Group();
    pivot.position.set(0, d.faceY - 0.18, -d.r * 0.82);
    const h = d.height * 0.62;
    const cape = mergedMesh([{ geo: new THREE.BoxGeometry(d.r * 1.55, h, 0.04), pos: [0, -h / 2, -0.03] }], mat('#c92a2a'));
    pivot.add(cape);
    g.add(pivot);
    anim.cape = pivot;
  }
  return { group: g, anim };
}

// ---------- Leher ----------
export function buildNeck(style, d) {
  const g = new THREE.Group();
  const y = d.faceY - 0.3;
  if (style === 'scarf') {
    g.add(mergedMesh([
      { geo: new THREE.TorusGeometry(d.r * 0.99, 0.08, 5, 14), pos: [0, y, 0], rot: [Math.PI / 2, 0, 0] },
      { geo: new THREE.BoxGeometry(0.14, 0.38, 0.06), pos: [0.17, y - 0.2, d.r * 0.98], rot: [0.15, 0, 0.12] },
    ], mat('#f03e3e')));
  } else if (style === 'bowtie') {
    g.add(mergedMesh([
      { geo: new THREE.ConeGeometry(0.075, 0.14, 4), pos: [-0.075, y, d.r * 0.93], rot: [0, 0, -Math.PI / 2] },
      { geo: new THREE.ConeGeometry(0.075, 0.14, 4), pos: [0.075, y, d.r * 0.93], rot: [0, 0, Math.PI / 2] },
      { geo: new THREE.BoxGeometry(0.05, 0.05, 0.05), pos: [0, y, d.r * 0.95] },
    ], mat('#c92a2a')));
  }
  return g;
}

export function disposeGroup(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.isMesh) o.geometry.dispose();
  });
  obj.removeFromParent();
}
