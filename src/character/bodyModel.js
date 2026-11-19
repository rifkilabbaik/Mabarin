// Model tubuh karakter dari "Character Base" (madtrollstudio): mesh statis pose A yang di-rig
// secara prosedural. Berisi:
//  - klasifikasi tiap vertex ke bagian tubuh + bobot skinning (dihaluskan di sendi),
//  - morf bentuk: pria/perempuan dan normal/tinggi/pendek/gemuk,
//  - titik sendi & ukuran (kepala, dada, kaki) untuk tulang dan aksesoris,
//  - pewarnaan pakaian per segitiga (kulit, atasan, bawahan, sepatu).
import * as THREE from 'three';
import { BASE_HEIGHT, BASE_INDICES, BASE_POSITIONS } from './baseMesh.js';

const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const bump = (x, c, w) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));

// ---------- Bagian tubuh & tulang ----------
export const SEG = { TORSO: 0, HEAD: 1, UPPER: 2, FORE: 3, HAND: 4, THIGH: 5, SHIN: 6, FOOT: 7, PELVIS: 8 };
// urutan tulang (dipakai Character): grup-grup Three.js yang sudah ada dijadikan tulang skinning
export const BONE = { hips: 0, torso: 1, head: 2, armR: 3, elbowR: 4, handR: 5, armL: 6, elbowL: 7, handL: 8, legR: 9, kneeR: 10, legL: 11, kneeL: 12 };
const sideBone = (side, r, l) => (side < 0 ? BONE[r] : BONE[l]);

// Titik sendi model dasar (sisi kiri karakter, x > 0; sisi kanan dicerminkan). Satuan meter, pose A.
const J = {
  hip: [0.095, 0.92, -0.02],
  knee: [0.125, 0.5, -0.06],
  ankle: [0.155, 0.11, -0.06],
  toe: [0.17, 0.02, 0.13],
  neck: [0, 1.62, -0.005],
  headTop: [0, 1.91, 0.037],
  shoulder: [0.19, 1.5, -0.03],
  elbow: [0.325, 1.275, -0.025],
  wrist: [0.45, 1.08, 0.095],
  tip: [0.515, 0.89, 0.15],
};
const mirror = (p, side) => [p[0] * side, p[1], p[2]];
const WAIST = 1.06; // garis pinggang (atasan / bawahan)

function closest(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / l2;
  t = Math.min(1, Math.max(0, t));
  const c = [a[0] + abx * t, a[1] + aby * t, a[2] + abz * t];
  return { t, c, d: Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) };
}

// ---------- Data dasar: vertex dilas + info bagian tubuh ----------
const NV = BASE_POSITIONS.length / 3;
const base = (i) => [BASE_POSITIONS[i * 3], BASE_POSITIONS[i * 3 + 1], BASE_POSITIONS[i * 3 + 2]];

/** Komponen terhubung: tangan & jari adalah potongan terpisah (kecil). */
function components() {
  const par = Array.from({ length: NV }, (_, i) => i);
  const f = (a) => {
    while (par[a] !== a) a = par[a] = par[par[a]];
    return a;
  };
  for (let i = 0; i < BASE_INDICES.length; i += 3) {
    const a = f(BASE_INDICES[i]);
    par[f(BASE_INDICES[i + 1])] = a;
    par[f(BASE_INDICES[i + 2])] = a;
  }
  const size = new Map();
  for (let i = 0; i < NV; i++) size.set(f(i), (size.get(f(i)) || 0) + 1);
  const comp = Array.from({ length: NV }, (_, i) => f(i));
  return { comp, small: comp.map((c) => size.get(c) < 60) };
}
const COMP = components();

/** Klasifikasi tiap vertex: bagian tubuh, sisi, posisi sepanjang tulang, titik poros, bobot tulang. */
function classify() {
  const { small } = COMP;
  const info = [];
  for (let i = 0; i < NV; i++) {
    const p = base(i);
    const side = p[0] >= 0 ? 1 : -1;
    const L = (k) => mirror(J[k], side);
    let seg, t = 0, axis = p, w = [];
    if (small[i]) {
      // telapak & jari
      const c = closest(p, L('wrist'), L('tip'));
      seg = SEG.HAND;
      t = c.t;
      axis = L('wrist');
      w = [[sideBone(side, 'handR', 'handL'), 1]];
    } else if (p[1] < 0.98 && Math.abs(p[0]) > 0.004) {
      // bawah pinggul: rantai kaki (dengan peralihan halus ke panggul)
      let legW = sm(0.985, 0.875, p[1]);
      if (Math.abs(p[0]) < 0.035) legW *= Math.abs(p[0]) / 0.035; // selangkangan ikut panggul
      const th = closest(p, L('hip'), L('knee')), sh = closest(p, L('knee'), L('ankle')), ft = closest(p, L('ankle'), L('toe'));
      const dTh = th.d / 0.085, dSh = sh.d / 0.065, dFt = ft.d / 0.06;
      const legB = sideBone(side, 'legR', 'legL'), kneeB = sideBone(side, 'kneeR', 'kneeL');
      if (dFt < dSh && p[1] < 0.16) {
        seg = SEG.FOOT;
        t = ft.t;
        axis = ft.c;
        w = [[kneeB, 1]];
      } else if (dSh < dTh) {
        seg = SEG.SHIN;
        t = sh.t;
        axis = sh.c;
        const k = 0.5 * sm(0.16, 0, t); // dekat lutut: sebagian ikut paha
        w = [[kneeB, 1 - k], [legB, k]];
      } else {
        seg = SEG.THIGH;
        t = th.t;
        axis = th.c;
        const k = 0.5 * sm(0.84, 1, t);
        w = [[legB, 1 - k], [kneeB, k]];
      }
      if (legW < 1) {
        w = w.map(([b, x]) => [b, x * legW]);
        w.push([BONE.hips, 1 - legW]);
        if (legW < 0.5) {
          seg = SEG.PELVIS;
          axis = [0, p[1], 0];
        }
      }
    } else {
      // atas pinggul: badan, kepala, lengan (lengan terpisah jelas karena pose A)
      const cands = [];
      const tc = closest(p, [0, 0.88, 0.01], [0, 1.6, 0]);
      const dxz = Math.hypot((p[0] - tc.c[0]) / 0.19, (p[2] - tc.c[2]) / 0.12);
      cands.push({ seg: SEG.TORSO, d: Math.hypot(dxz, (p[1] - tc.c[1]) / 0.19), c: tc });
      const hc = closest(p, J.neck, J.headTop);
      cands.push({ seg: SEG.HEAD, d: hc.d / 0.1, c: hc });
      const uc = closest(p, L('shoulder'), L('elbow'));
      cands.push({ seg: SEG.UPPER, d: uc.d / 0.05, c: uc });
      const fc = closest(p, L('elbow'), L('wrist'));
      cands.push({ seg: SEG.FORE, d: fc.d / 0.045, c: fc });
      cands.sort((a, b) => a.d - b.d);
      const best = cands[0];
      seg = best.seg;
      t = best.c.t;
      axis = best.c.c;
      const armB = sideBone(side, 'armR', 'armL'), elbB = sideBone(side, 'elbowR', 'elbowL');
      if (seg === SEG.TORSO) {
        w = [[BONE.torso, 1]];
        if (p[1] < WAIST) seg = SEG.PELVIS;
      } else if (seg === SEG.HEAD) {
        const k = 0.5 * sm(0.14, 0, t); // leher
        w = [[BONE.head, 1 - k], [BONE.torso, k]];
      } else if (seg === SEG.UPPER) {
        const kt = 0.5 * sm(0.22, 0, t), ke = 0.5 * sm(0.84, 1, t);
        w = [[armB, 1 - kt - ke], [BONE.torso, kt], [elbB, ke]];
      } else {
        const k = 0.5 * sm(0.16, 0, t);
        w = [[elbB, 1 - k], [armB, k]];
      }
    }
    info.push({ seg, side, t, axis, w: w.filter(([, x]) => x > 1e-4) });
  }
  return info;
}

const INFO = classify();

/**
 * Arah segitiga di model asli tidak konsisten (sebagian bagian tubuh terbalik ke dalam, termasuk
 * normal tersimpannya). Samakan: setiap segitiga harus menghadap menjauhi poros tulangnya
 * (untuk jari & telapak: menjauhi pusat potongannya).
 */
function orientTriangles() {
  const cen = new Map();
  for (let i = 0; i < NV; i++) {
    if (!COMP.small[i]) continue;
    const c = cen.get(COMP.comp[i]) || [0, 0, 0, 0];
    const p = base(i);
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
    c[3]++;
    cen.set(COMP.comp[i], c);
  }
  const out = new Uint16Array(BASE_INDICES.length);
  for (let f = 0; f < BASE_INDICES.length; f += 3) {
    const v = [BASE_INDICES[f], BASE_INDICES[f + 1], BASE_INDICES[f + 2]];
    const P0 = base(v[0]), P1 = base(v[1]), P2 = base(v[2]);
    const e1 = [P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]], e2 = [P2[0] - P0[0], P2[1] - P0[1], P2[2] - P0[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const c = [(P0[0] + P1[0] + P2[0]) / 3, (P0[1] + P1[1] + P2[1]) / 3, (P0[2] + P1[2] + P2[2]) / 3];
    let a;
    if (COMP.small[v[0]]) {
      const k = cen.get(COMP.comp[v[0]]);
      a = [k[0] / k[3], k[1] / k[3], k[2] / k[3]];
    } else {
      a = [0, 0, 0];
      for (const i of v) for (let k = 0; k < 3; k++) a[k] += INFO[i].axis[k] / 3;
      if (INFO[v[0]].seg === SEG.TORSO || INFO[v[0]].seg === SEG.PELVIS) a[1] = c[1]; // badan: keluar secara mendatar
    }
    const dot = n[0] * (c[0] - a[0]) + n[1] * (c[1] - a[1]) + n[2] * (c[2] - a[2]);
    out.set(dot < 0 ? [v[0], v[2], v[1]] : v, f);
  }
  return out;
}
const TRIS = orientTriangles();

// ---------- Morf bentuk tubuh ----------
const radial = (p, axis, s, sy = 1) => [axis[0] + (p[0] - axis[0]) * s, axis[1] + (p[1] - axis[1]) * sy, axis[2] + (p[2] - axis[2]) * s];
const isArm = (seg) => seg === SEG.UPPER || seg === SEG.FORE || seg === SEG.HAND;
const isTrunk = (seg) => seg === SEG.TORSO || seg === SEG.PELVIS;

function female(p, I) {
  let [x, y, z] = p;
  const { seg, side } = I;
  if (isArm(seg)) {
    // lengan lebih ramping & bahu lebih sempit
    [x, y, z] = seg === SEG.HAND ? radial([x, y, z], mirror(J.wrist, side), 0.92, 0.92) : radial([x, y, z], I.axis, 0.84);
    x -= side * 0.026;
  } else if (isTrunk(seg) || (seg === SEG.HEAD && y < 1.67)) {
    const k = seg === SEG.HEAD ? 0.5 : 1;
    x *= 1 - 0.14 * sm(1.28, 1.52, y) * k; // bahu & leher
    x *= 1 - 0.1 * bump(y, 1.15, 0.09); // pinggang
    z *= 1 - 0.05 * bump(y, 1.15, 0.09);
    x *= 1 + 0.14 * bump(y, 0.93, 0.08); // pinggul
    // dada
    for (const s of [-1, 1]) {
      const g = Math.exp(-((x - s * 0.07) ** 2) / (2 * 0.042 ** 2) - ((y - 1.36) ** 2) / (2 * 0.05 ** 2));
      const front = sm(-0.02, 0.08, z);
      z += 0.05 * g * front;
      y += 0.006 * g * front;
    }
  } else if (seg === SEG.THIGH) {
    [x, y, z] = radial([x, y, z], I.axis, 1.03);
    x += side * 0.014 * (1 - I.t);
  } else if (seg === SEG.SHIN) {
    [x, y, z] = radial([x, y, z], I.axis, 0.94);
  }
  if (seg === SEG.HEAD) {
    if (y < 1.76) x *= 1 - 0.1 * sm(1.76, 1.66, y); // rahang lebih lancip
    const c = [0, 1.785, 0.037];
    [x, y, z] = [c[0] + (x - c[0]) * 0.97, c[1] + (y - c[1]) * 0.97, c[2] + (z - c[2]) * 0.97];
  }
  return [x, y, z];
}

function bodyType(p, I, body) {
  let [x, y, z] = p;
  const { seg, side } = I;
  if (body === 'chubby') {
    if (isArm(seg)) {
      [x, y, z] = seg === SEG.HAND ? radial([x, y, z], mirror(J.wrist, side), 1.12, 1.05) : radial([x, y, z], I.axis, 1.28);
      x += side * 0.022;
    } else if (isTrunk(seg) || (seg === SEG.HEAD && y < 1.67)) {
      const sx = 1.22 - 0.08 * sm(1.38, 1.55, y);
      x *= sx;
      z = 0.01 + (z - 0.01) * (1.26 - 0.1 * sm(1.4, 1.58, y));
      z += 0.05 * bump(y, 1.12, 0.12) * sm(0, 0.1, z); // perut
    } else if (seg === SEG.THIGH) {
      [x, y, z] = radial([x, y, z], I.axis, 1.26);
      x += side * 0.016 * (1 - I.t);
    } else if (seg === SEG.SHIN) [x, y, z] = radial([x, y, z], I.axis, 1.14);
    if (seg === SEG.HEAD && y < 1.77) x *= 1 + 0.07 * sm(1.77, 1.69, y); // pipi
  }
  // tinggi: kaki & badan diregangkan / dipendekkan (titik sendi ikut berpindah)
  const legS = body === 'tall' ? 1.1 : body === 'short' ? 0.86 : 1;
  const topS = body === 'tall' ? 1.03 : body === 'short' ? 0.95 : 1;
  const H = 0.92;
  y = y < H ? y * legS : H * legS + (y - H) * topS;
  return [x, y, z];
}

function morphPoint(p, I, gender, body) {
  let q = p;
  if (gender === 'f') q = female(q, I);
  return bodyType(q, I, body);
}

// info untuk titik sendi (berada di poros tulang)
const jointInfo = (seg, side, t, p) => ({ seg, side, t, axis: p });

// ---------- Bentuk siap pakai (di-cache per jenis kelamin + bentuk tubuh) ----------
const cache = new Map();

/**
 * @returns {{ positions: Float32Array, skinIndex: Uint16Array, skinWeight: Float32Array, tri: Uint8Array,
 *   triT: Float32Array, joints: object, dims: object, metrics: object }}
 */
export function bodyShape(gender = 'm', body = 'normal') {
  const key = `${gender}|${body}`;
  if (cache.has(key)) return cache.get(key);
  const K = (gender === 'f' ? 1.62 : 1.72) / BASE_HEIGHT;
  const S = (p) => [p[0] * K, p[1] * K, p[2] * K];

  // vertex dilas yang sudah dimorf
  const W = [];
  for (let i = 0; i < NV; i++) W.push(S(morphPoint(base(i), INFO[i], gender, body)));

  // titik sendi
  const jp = (name, seg, side, t) => {
    const p = name === 'neck' || name === 'headTop' ? J[name] : mirror(J[name], side);
    return S(morphPoint(p, jointInfo(seg, side, t, p), gender, body));
  };
  const joints = {};
  for (const side of [-1, 1]) {
    const s = side < 0 ? 'R' : 'L';
    joints['hip' + s] = jp('hip', SEG.THIGH, side, 0);
    joints['knee' + s] = jp('knee', SEG.THIGH, side, 1);
    joints['ankle' + s] = jp('ankle', SEG.SHIN, side, 1);
    joints['shoulder' + s] = jp('shoulder', SEG.UPPER, side, 0);
    joints['elbow' + s] = jp('elbow', SEG.UPPER, side, 1);
    joints['wrist' + s] = jp('wrist', SEG.FORE, side, 1);
    joints['tip' + s] = jp('tip', SEG.HAND, side, 1);
  }
  joints.neck = jp('neck', SEG.HEAD, 1, 0);

  // non-indexed (warna pakaian per segitiga tegas) + bobot skinning
  const NT = TRIS.length / 3;
  const positions = new Float32Array(NT * 9);
  const skinIndex = new Uint16Array(NT * 12);
  const skinWeight = new Float32Array(NT * 12);
  const tri = new Uint8Array(NT), triT = new Float32Array(NT), triSide = new Int8Array(NT), triY = new Float32Array(NT);
  const triX = new Float32Array(NT), triZ = new Float32Array(NT);
  for (let f = 0; f < NT; f++) {
    const segs = [];
    let ty = 0, tx = 0, tz = 0, tt = 0;
    for (let k = 0; k < 3; k++) {
      const v = TRIS[f * 3 + k], o = f * 3 + k;
      positions.set(W[v], o * 3);
      const ww = INFO[v].w.slice(0, 4);
      const sum = ww.reduce((a, [, x]) => a + x, 0) || 1;
      ww.forEach(([b, x], j) => {
        skinIndex[o * 4 + j] = b;
        skinWeight[o * 4 + j] = x / sum;
      });
      segs.push(INFO[v].seg);
      ty += base(v)[1] / 3;
      tx += base(v)[0] / 3;
      tz += base(v)[2] / 3;
      tt += INFO[v].t / 3;
    }
    // bagian segitiga = mayoritas vertex-nya
    tri[f] = segs[0] === segs[1] || segs[0] === segs[2] ? segs[0] : segs[1] === segs[2] ? segs[1] : segs[0];
    triT[f] = tt;
    triY[f] = ty;
    triX[f] = tx;
    triZ[f] = tz;
    triSide[f] = tx >= 0 ? 1 : -1;
  }

  // ukuran untuk tulang, kamera & aksesoris (dari bentuk yang sudah dimorf)
  const head = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const feet = { R: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }, L: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] } };
  const grow = (bb, p) => {
    for (let k = 0; k < 3; k++) {
      bb.min[k] = Math.min(bb.min[k], p[k]);
      bb.max[k] = Math.max(bb.max[k], p[k]);
    }
  };
  for (let i = 0; i < NV; i++) {
    const I = INFO[i], p = W[i];
    if (I.seg === SEG.HEAD && base(i)[1] > 1.645) grow(head, p);
    if (I.seg === SEG.FOOT) grow(I.side < 0 ? feet.R : feet.L, p);
  }
  // profil depan/belakang badan per ketinggian (untuk kancing, ransel, dll.)
  const prof = [];
  for (let i = 0; i < NV; i++) {
    const I = INFO[i];
    if (isTrunk(I.seg) && Math.abs(W[i][0]) < 0.06 * K * 1.2) prof.push(W[i]);
  }
  const zAt = (y, front) => {
    let best = front ? -Infinity : Infinity, bw = 0, acc = 0;
    for (const p of prof) {
      const g = bump(p[1], y, 0.035);
      if (g < 0.05) continue;
      if (front ? p[2] > best : p[2] < best) best = p[2];
      acc += p[2] * g;
      bw += g;
    }
    return Number.isFinite(best) ? best : bw ? acc / bw : 0;
  };
  const halfW = (y) => {
    let m = 0;
    for (let i = 0; i < NV; i++) if (isTrunk(INFO[i].seg) && Math.abs(W[i][1] - y) < 0.04) m = Math.max(m, Math.abs(W[i][0]));
    return m;
  };
  const headC = [0, (head.min[1] + head.max[1]) / 2, (head.min[2] + head.max[2]) / 2];
  const headR = [(head.max[0] - head.min[0]) / 2, (head.max[1] - head.min[1]) / 2, (head.max[2] - head.min[2]) / 2];
  const hipY = (joints.hipL[1] + joints.hipR[1]) / 2;
  const waistY = morphPoint([0, WAIST, 0], jointInfo(SEG.TORSO, 1, 0, [0, WAIST, 0]), gender, body)[1] * K;
  const eyeY = headC[1] + headR[1] * 0.06;
  const top = head.max[1];
  const metrics = {
    K,
    headC,
    headR,
    faceZ: zFace(W, headC, eyeY),
    eyeY,
    waistY,
    zFront: zAt,
    halfW,
    feet,
    neckR: neckRadius(W),
  };
  const dims = {
    hipY,
    neck: joints.neck[1] - hipY,
    headR: headR[1],
    torsoH: joints.neck[1] - hipY - 0.02,
    torsoR: Math.max(0.1, zAt((joints.neck[1] + hipY) / 2 + 0.1 * K, true)),
    arm: Math.hypot(...joints.shoulderL.map((v, k) => v - joints.tipL[k])) * 0.85,
    leg: hipY - joints.ankleL[1],
    limb: 0.045,
    height: top,
    faceY: eyeY,
    seatedEye: eyeY - hipY + 0.05,
  };
  const out = { positions, skinIndex, skinWeight, tri, triT, triSide, triY, triX, triZ, joints, dims, metrics };
  cache.set(key, out);
  return out;
}

/** Jari-jari leher (rata-rata lebar & tebal leher di bawah dagu). */
function neckRadius(W) {
  let mx = 0, zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < NV; i++) {
    const b = base(i);
    if (b[1] < 1.585 || b[1] > 1.645 || Math.abs(b[0]) > 0.085 || COMP.small[i]) continue;
    mx = Math.max(mx, Math.abs(W[i][0]));
    zmin = Math.min(zmin, W[i][2]);
    zmax = Math.max(zmax, W[i][2]);
  }
  return Number.isFinite(zmin) ? Math.max(0.035, (mx + (zmax - zmin) / 2) / 2) : 0.05;
}

/** Permukaan depan wajah setinggi mata (untuk mata, kacamata, kumis). */
function zFace(W, headC, eyeY) {
  let z = -Infinity;
  for (let i = 0; i < NV; i++) {
    if (INFO[i].seg !== SEG.HEAD) continue;
    const p = W[i];
    if (Math.abs(p[1] - eyeY) < 0.035 && Math.abs(Math.abs(p[0]) - 0.035) < 0.03) z = Math.max(z, p[2]);
  }
  return Number.isFinite(z) ? z : headC[2] + 0.1;
}

// ---------- Warna pakaian: dihitung per piksel di shader dari posisi asli tubuh ----------
// Batas pakaian (lengan baju, pinggang, celana pendek, sepatu bot) jadi tegas di mana pun,
// tidak mengikuti segitiga mesh yang tidak beraturan.

/** Posisi asli (model dasar, belum dimorf) untuk tiap vertex non-indexed. */
export const REST_POSITIONS = (() => {
  const out = new Float32Array(TRIS.length * 3);
  for (let i = 0; i < TRIS.length; i++) out.set(base(TRIS[i]), i * 3);
  return out;
})();

const v3 = (p) => `vec3(${p.map((x) => x.toFixed(4)).join(',')})`;
const BODY_FRAG = /* glsl */ `
uniform vec3 uSkin, uTop, uBot, uShoe, uCuff, uHem;
uniform float uSleeve, uLegCut, uDress, uBareSh, uCrew, uJacket, uBoots;
varying vec3 vRest;
float segD(vec3 p, vec3 a, vec3 b, out float t) {
  vec3 ab = b - a;
  t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - (a + ab * t));
}
vec3 bodyColor(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  if (q.y < 0.98 && q.x > 0.004 && q.x < 0.3 && !(q.y > 0.94 && q.x < 0.035)) {
    float tTh, tSh, tFt;
    float dTh = segD(q, ${v3(J.hip)}, ${v3(J.knee)}, tTh) / 0.085;
    float dSh = segD(q, ${v3(J.knee)}, ${v3(J.ankle)}, tSh) / 0.065;
    float dFt = segD(q, ${v3(J.ankle)}, ${v3(J.toe)}, tFt) / 0.06;
    if (dFt < dSh && q.y < 0.16) return uShoe;
    if (dSh < dTh) {
      if (uBoots > 0.5 && tSh > 0.5) return uShoe;
      return uLegCut > 1.5 ? uBot : uSkin;
    }
    if (q.y > 0.9) return uDress > 0.5 ? uTop : uBot;
    return tTh < uLegCut ? uBot : uSkin;
  }
  float tt = clamp((q.y - 0.88) / 0.72, 0.0, 1.0);
  vec3 c = mix(vec3(0.0, 0.88, 0.01), vec3(0.0, 1.6, 0.0), tt);
  float dT = length(vec3(q.x / 0.19, (q.y - c.y) / 0.19, (q.z - c.z) / 0.12));
  float tH, tU, tF, tP;
  float dH = segD(q, ${v3(J.neck)}, ${v3(J.headTop)}, tH) / 0.1;
  float dU = segD(q, ${v3(J.shoulder)}, ${v3(J.elbow)}, tU) / 0.05;
  float dF = segD(q, ${v3(J.elbow)}, ${v3(J.wrist)}, tF) / 0.045;
  float dP = segD(q, ${v3(J.wrist)}, ${v3(J.tip)}, tP) / 0.045;
  float m = min(min(dT, dH), min(min(dU, dF), dP));
  if (m == dP || m == dH) return uSkin;
  if (m == dU) return uSleeve < 0.25 ? uSkin : (uSleeve > 0.75 || tU < 0.55) ? uTop : uSkin;
  if (m == dF) return uSleeve > 0.75 ? (tF > 0.86 ? uCuff : uTop) : uSkin;
  float neckD = length(vec2(q.x, q.z - 0.02));
  if (q.y > 1.6 || (q.y > 1.5 && neckD < 0.062)) return uSkin; // leher
  if (uCrew > 0.5 && q.y > 1.47 && neckD < 0.08 && q.z > 0.0) return uSkin; // kerah bulat
  if (q.y < ${WAIST.toFixed(3)}) return uDress > 0.5 ? uTop : uBot;
  if (uBareSh > 0.5 && q.y > 1.43 && q.x > 0.105) return uSkin;
  if (uJacket > 0.5 && q.y < ${(WAIST + 0.05).toFixed(3)}) return uHem;
  return uTop;
}
`;

/** Material badan per karakter (program shader dipakai bersama, warna lewat uniform). */
export function createBodyMaterial() {
  const u = {
    uSkin: { value: new THREE.Color() },
    uTop: { value: new THREE.Color() },
    uBot: { value: new THREE.Color() },
    uShoe: { value: new THREE.Color() },
    uCuff: { value: new THREE.Color() },
    uHem: { value: new THREE.Color() },
    uSleeve: { value: 0.5 },
    uLegCut: { value: 2 },
    uDress: { value: 0 },
    uBareSh: { value: 0 },
    uCrew: { value: 1 },
    uJacket: { value: 0 },
    uBoots: { value: 0 },
  };
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  mat.userData.u = u;
  mat.customProgramCacheKey = () => 'mabarin-body-v1';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 rest;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = rest;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + BODY_FRAG)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( bodyColor(vRest), opacity );');
  };
  return mat;
}

const SKIN_LINEAR = new THREE.Color();
/** Isi warna & gaya pakaian ke uniform material badan. */
export function paintBody(mat, look) {
  const u = mat.userData.u;
  const dress = look.top === 'dress';
  const set = (key, hex) => u[key].value.set(hex);
  set('uSkin', look.skin);
  set('uTop', look.topColor);
  set('uBot', look.bottomColor);
  set('uShoe', look.shoes === 'boots' ? '#6b4226' : look.shoes === 'sandals' ? look.skin : '#f8f9fa');
  u.uCuff.value.copy(SKIN_LINEAR.set(look.topColor)).multiplyScalar(0.78);
  u.uHem.value.copy(SKIN_LINEAR.set(look.topColor)).multiplyScalar(0.72);
  u.uSleeve.value = look.top === 'tank' || dress ? 0 : ['shirt', 'hoodie', 'jacket'].includes(look.top) ? 1 : 0.5;
  u.uLegCut.value = dress || look.bottom === 'skirt' ? 0 : look.bottom === 'shorts' ? 0.6 : 2;
  u.uDress.value = dress ? 1 : 0;
  u.uBareSh.value = look.top === 'tank' || dress ? 1 : 0;
  u.uCrew.value = look.top === 'tshirt' ? 1 : 0;
  u.uJacket.value = look.top === 'jacket' ? 1 : 0;
  u.uBoots.value = look.shoes === 'boots' ? 1 : 0;
}
