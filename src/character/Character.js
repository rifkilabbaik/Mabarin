import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp } from '../utils/math.js';
import { createChatBubble, createNameTag, disposeSprite } from './labels.js';
import { DEFAULT_LOOK, sanitizeLook } from './looks.js';
import { buildHeldItem } from './items.js';
import { REST_POSITIONS, bodyShape, createBodyMaterial, paintBody } from './bodyModel.js';

// Karakter memakai model "Character Base" (madtrollstudio) yang di-rig secara prosedural:
// grup-grup badan (pinggul, torso, kepala, bahu, siku, tangan, paha, lutut) menjadi tulang skinning,
// pakaian diwarnai per bagian tubuh, dan rambut/topi/aksesoris dibentuk mengikuti ukuran kepala & badan.

// ---------- Helper geometri berwarna (digabung jadi satu mesh per tulang) ----------
const CHAR_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const DOWN = new THREE.Vector3(0, -1, 0);

function piece(geo, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.dispose();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scale[0], scale[1], scale[2]));
  g.applyMatrix4(_m);
  _c.set(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function build(pieces, matrix) {
  if (!pieces.length) return null;
  const g = mergeGeometries(pieces, false);
  pieces.forEach((p) => p.dispose());
  if (matrix) g.applyMatrix4(matrix);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, CHAR_MAT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const Ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const Cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// ---------- Rambut & topi: dibuat di ruang "kepala satuan" (bola jari-jari 1) lalu diskalakan ke kepala ----------
function hairPieces(look) {
  const P = [], hc = look.hairColor, hat = look.hat !== 'none';
  const cap = () => piece(new THREE.SphereGeometry(1.14, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), hc, { pos: [0, 0.12, -0.06] });
  const back = (thetaLen, rr = 1.08) => piece(new THREE.SphereGeometry(rr + 0.07, 12, 7, Math.PI - 0.25, Math.PI + 0.5, 0, Math.PI * thetaLen), hc, { pos: [0, 0.02, -0.07] });
  let extra = 0;
  switch (look.hair) {
    case 'spiky':
      if (!hat) {
        P.push(cap());
        const spikes = [[0, 0], ...[0, 1, 2, 3, 4, 5, 6].map((k) => [0.75, (k / 7) * Math.PI * 2 + 0.4])];
        for (const [th, ph] of spikes) {
          const n = new THREE.Vector3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
          const g = piece(new THREE.ConeGeometry(0.27, 0.62, 4), hc, {});
          g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
          g.translate(n.x * 1.02, n.y * 1.02 + 0.04, n.z * 1.02);
          P.push(g);
        }
        extra = 0.32;
      }
      P.push(back(0.55, 1.05));
      break;
    case 'bob':
      if (!hat) P.push(cap());
      P.push(back(0.66, 1.1));
      break;
    case 'long':
      if (!hat) P.push(cap());
      P.push(back(0.74, 1.1));
      // rambut panjang terurai sampai punggung atas
      P.push(piece(Box(1.75, 1.9, 0.32), hc, { pos: [0, -0.9, -0.78] }));
      for (const s of [-1, 1]) P.push(piece(Box(0.32, 1.2, 0.5), hc, { pos: [s * 0.9, -0.55, -0.35] }));
      break;
    case 'ponytail':
      if (!hat) P.push(cap());
      P.push(back(0.52, 1.06));
      P.push(piece(Ico(0.3, 0), hc, { pos: [0, 0.3, -1.05] }));
      P.push(piece(new THREE.ConeGeometry(0.28, 1.25, 6), hc, { pos: [0, -0.35, -1.18], rot: [Math.PI + 0.25, 0, 0] }));
      break;
    case 'buns':
      if (!hat) P.push(cap());
      P.push(back(0.52, 1.06));
      for (const s of [-1, 1]) P.push(piece(Ico(0.36, 1), hc, { pos: [s * 0.62, 0.82, -0.1] }));
      extra = 0.2;
      break;
    case 'mohawk':
      if (!hat) {
        for (let i = -3; i <= 3; i++) {
          const a = i * 0.36;
          P.push(piece(Box(0.24, 0.62, 0.36), hc, { pos: [0, Math.cos(a) * 1.08, Math.sin(a) * 1.08], rot: [a, 0, 0] }));
        }
        extra = 0.32;
      }
      break;
    case 'afro':
      if (!hat) {
        const blobs = [[0, 0, 0.75], ...[0, 1, 2, 3, 4, 5].map((k) => [0.75, (k / 6) * Math.PI * 2, 0.68]), [1.3, Math.PI, 0.62], [1.25, 2.3, 0.58], [1.25, 3.98, 0.58]];
        for (const [th, ph, br] of blobs) P.push(piece(Ico(br, 0), hc, { pos: [Math.sin(th) * Math.sin(ph) * 1.02, Math.cos(th) * 1.02, Math.sin(th) * Math.cos(ph) * 1.02] }));
        extra = 0.7;
      } else P.push(back(0.62, 1.12));
      break;
  }
  return { P, extra };
}

function hatPieces(look) {
  const P = [];
  let extra = 0;
  if (look.hat === 'cap') {
    P.push(piece(new THREE.SphereGeometry(1.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#e03131', { pos: [0, 0.16, 0] }));
    P.push(piece(new THREE.CylinderGeometry(0.9, 0.9, 0.09, 12, 1, false, -Math.PI / 2, Math.PI), '#b02525', { pos: [0, 0.22, 0.55] }));
    extra = 0.28;
  } else if (look.hat === 'cowboy') {
    P.push(piece(Cyl(1.85, 1.85, 0.1, 14), '#a0672f', { pos: [0, 0.55, 0] }));
    P.push(piece(Cyl(0.78, 0.92, 0.85, 10), '#a0672f', { pos: [0, 1.0, 0] }));
    P.push(piece(Cyl(0.94, 0.94, 0.16, 10), '#4a2f1b', { pos: [0, 0.66, 0] }));
    extra = 0.95;
  } else if (look.hat === 'beanie') {
    P.push(piece(new THREE.SphereGeometry(1.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#4263eb', { pos: [0, 0.1, 0], scale: [1, 1.12, 1] }));
    P.push(piece(new THREE.TorusGeometry(1.1, 0.15, 5, 16), '#3b5bdb', { pos: [0, 0.16, 0], rot: [Math.PI / 2, 0, 0] }));
    P.push(piece(Ico(0.27, 0), '#f8f9fa', { pos: [0, 1.38, 0] }));
    extra = 0.65;
  } else if (look.hat === 'party') {
    P.push(piece(new THREE.ConeGeometry(0.55, 1.4, 8), '#f783ac', { pos: [0.1, 1.55, 0], rot: [0, 0, -0.15] }));
    P.push(piece(Ico(0.2, 0), '#ffd43b', { pos: [0.3, 2.25, 0] }));
    extra = 1.45;
  } else if (look.hat === 'crown') {
    P.push(piece(Cyl(0.66, 0.64, 0.38, 10), '#f5c518', { pos: [0, 0.92, 0] }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      P.push(piece(new THREE.ConeGeometry(0.17, 0.4, 4), '#f5c518', { pos: [Math.sin(a) * 0.64, 1.3, Math.cos(a) * 0.64] }));
    }
    P.push(piece(new THREE.OctahedronGeometry(0.13, 0), '#e03131', { pos: [0, 0.92, 0.67] }));
    extra = 0.6;
  }
  return { P, extra };
}

// ---------- Wajah (ukuran nyata, di koordinat tubuh) ----------
function facePieces(look, M) {
  const P = [];
  const s = M.headR[1] / 0.117; // skala relatif kepala pria normal
  const ex = M.headR[0] * 0.42, ey = M.eyeY, ez = M.faceZ;
  const black = '#1b1d29';
  for (const k of [-1, 1]) {
    const x = k * ex;
    if (look.eyes === 'happy') P.push(piece(new THREE.TorusGeometry(0.011 * s, 0.0032 * s, 4, 8, Math.PI), black, { pos: [x, ey - 0.004 * s, ez] }));
    else if (look.eyes === 'sleepy') P.push(piece(new THREE.CapsuleGeometry(0.0042 * s, 0.016 * s, 2, 6), black, { pos: [x, ey - 0.003 * s, ez], rot: [0, 0, Math.PI / 2] }));
    else if (look.eyes === 'big') {
      P.push(piece(new THREE.SphereGeometry(0.0135 * s, 8, 6), black, { pos: [x, ey, ez - 0.002], scale: [1, 1.15, 0.5] }));
      P.push(piece(Ico(0.0048 * s, 0), '#ffffff', { pos: [x + 0.004 * s, ey + 0.006 * s, ez + 0.005 * s] }));
    } else {
      P.push(piece(new THREE.CapsuleGeometry(0.0075 * s, 0.009 * s, 2, 6), black, { pos: [x, ey, ez - 0.002], scale: [1, 1, 0.55] }));
      P.push(piece(Ico(0.003 * s, 0), '#ffffff', { pos: [x + 0.003 * s, ey + 0.005 * s, ez + 0.003 * s] }));
    }
    // alis
    P.push(piece(Box(0.026 * s, 0.0055 * s, 0.007), look.hairColor, { pos: [x, ey + 0.022 * s, ez + 0.002], rot: [0, 0, -k * 0.12] }));
  }
  // mulut
  P.push(piece(Box(0.022 * s, 0.0045 * s, 0.006), '#9c3d3d', { pos: [0, ey - 0.074 * s, ez - 0.004] }));

  if (look.face === 'glasses' || look.face === 'shades') {
    const dark = look.face === 'shades';
    const col = dark ? '#111318' : '#343a40';
    for (const k of [-1, 1]) {
      if (dark) P.push(piece(Box(0.036 * s, 0.022 * s, 0.006), col, { pos: [k * ex, ey, ez + 0.009] }));
      else P.push(piece(new THREE.TorusGeometry(0.019 * s, 0.0032 * s, 4, 10), col, { pos: [k * ex, ey, ez + 0.009] }));
      const len = ez - M.headC[2];
      P.push(piece(Box(0.004, 0.004, len), col, { pos: [k * M.headR[0] * 0.98, ey + 0.004, ez - len / 2] }));
    }
    P.push(piece(Box(ex * 2 - 0.034 * s, 0.004, 0.004), col, { pos: [0, ey + 0.004, ez + 0.01] }));
  } else if (look.face === 'mustache') {
    for (const k of [-1, 1]) P.push(piece(Ico(0.016 * s, 0), look.hairColor, { pos: [k * 0.013 * s, ey - 0.056 * s, ez + 0.006], scale: [1.2, 0.45, 0.5], rot: [0, 0, -k * 0.3] }));
  }
  return P;
}

// ---------- Pakaian & aksesoris badan (koordinat tubuh) ----------
function torsoPieces(look, shape) {
  const P = [];
  const M = shape.metrics, J = shape.joints, K = M.K;
  const tc = look.topColor, dark = shade(tc, 0.75);
  const neckY = J.neck[1];
  const zF = (y) => M.zFront(y, true);
  const zB = (y) => M.zFront(y, false);
  const chestY = (J.shoulderL[1] + M.waistY) / 2;
  if (look.top === 'shirt') {
    const cy = neckY - 0.045 * K;
    for (const s of [-1, 1]) P.push(piece(new THREE.ConeGeometry(0.022, 0.05, 3), '#f8f9fa', { pos: [s * 0.022, cy, zF(cy) + 0.006], rot: [Math.PI / 2 + 0.35, 0, s * 0.5] }));
    for (let i = 0; i < 4; i++) {
      const y = neckY - (0.1 + i * 0.1) * K;
      P.push(piece(Ico(0.0065, 0), '#f8f9fa', { pos: [0, y, zF(y) + 0.003] }));
    }
  } else if (look.top === 'hoodie') {
    // tudung terlipat di punggung atas
    const hy = neckY - 0.03 * K;
    P.push(piece(new THREE.TorusGeometry(M.neckR + 0.055, 0.035, 5, 10, Math.PI), tc, { pos: [0, hy, zB(hy) * 0.35], rot: [-Math.PI / 2 + 0.35, 0, Math.PI] }));
    const py = M.waistY + 0.1 * K;
    P.push(piece(Box(M.halfW(py) * 1.2, 0.09 * K, 0.02), dark, { pos: [0, py, zF(py) + 0.006] }));
    for (const s of [-1, 1]) P.push(piece(Box(0.006, 0.1 * K, 0.006), '#f1f3f5', { pos: [s * 0.03, neckY - 0.11 * K, zF(neckY - 0.11 * K) + 0.006] }));
  } else if (look.top === 'jacket') {
    const h = neckY - M.waistY - 0.06 * K;
    for (let i = 0; i < 6; i++) {
      const y = M.waistY + 0.04 * K + (h * (i + 0.5)) / 6;
      P.push(piece(Box(0.009, h / 6 + 0.004, 0.006), '#f1f3f5', { pos: [0, y, zF(y) + 0.003] }));
    }
    for (const s of [-1, 1]) {
      const cy = neckY - 0.05 * K;
      P.push(piece(Box(0.05, 0.07 * K, 0.012), dark, { pos: [s * 0.04, cy, zF(cy) + 0.006], rot: [0.2, 0, s * 0.4] }));
    }
  }
  // leher
  if (look.neck === 'scarf') {
    const y = neckY - 0.035 * K;
    P.push(piece(new THREE.TorusGeometry(M.neckR + 0.03, 0.026, 5, 12), '#f03e3e', { pos: [0, y, (zF(y) + zB(y)) * 0.5 * 0.4], rot: [Math.PI / 2 + 0.15, 0, 0] }));
    const ty = y - 0.13 * K;
    P.push(piece(Box(0.05, 0.22 * K, 0.018), '#f03e3e', { pos: [0.05, ty, zF(ty) + 0.012], rot: [0.08, 0, 0.1] }));
  } else if (look.neck === 'bowtie') {
    const y = neckY - 0.07 * K, z = zF(y) + 0.01;
    for (const s of [-1, 1]) P.push(piece(new THREE.ConeGeometry(0.02, 0.04, 4), '#c92a2a', { pos: [s * 0.02, y, z], rot: [0, 0, s * Math.PI / 2] }));
    P.push(piece(Box(0.014, 0.014, 0.014), '#c92a2a', { pos: [0, y, z + 0.002] }));
  }
  if (look.back === 'backpack') {
    const y = chestY + 0.04 * K, w = M.halfW(y) * 1.5, h = 0.4 * K;
    P.push(piece(Box(w, h, 0.14), '#e8590c', { pos: [0, y, zB(y) - 0.07] }));
    P.push(piece(Box(w * 1.04, 0.06, 0.16), '#b8460a', { pos: [0, y + h * 0.42, zB(y) - 0.07] }));
    for (const s of [-1, 1]) {
      const sy = (J.shoulderL[1] + chestY) / 2;
      P.push(piece(Box(0.03, (J.shoulderL[1] - M.waistY) * 0.85, 0.012), '#b8460a', { pos: [s * M.halfW(sy) * 0.42, sy - 0.02, zF(sy) + 0.006] }));
    }
  }
  return P;
}

function skirtPieces(look, shape) {
  const M = shape.metrics, J = shape.joints, K = M.K;
  const dress = look.top === 'dress';
  if (!dress && look.bottom !== 'skirt') return [];
  const top = M.waistY + 0.02 * K;
  const kneeY = (J.kneeL[1] + J.kneeR[1]) / 2;
  const bottom = dress ? kneeY - 0.03 * K : kneeY + (top - kneeY) * 0.45;
  const h = top - bottom;
  const zc = (M.zFront(top, true) + M.zFront(top, false)) / 2;
  const rTop = Math.max(M.halfW(top), (M.zFront(top, true) - M.zFront(top, false)) / 2) * 1.04;
  const rBot = rTop * (dress ? 1.75 : 1.5);
  return [piece(Cyl(rTop, rBot, h, 14), dress ? look.topColor : look.bottomColor, { pos: [0, top - h / 2, zc], scale: [1, 1, 0.82] })];
}

function solePieces(look, shape, side) {
  const f = shape.metrics.feet[side < 0 ? 'R' : 'L'];
  if (!Number.isFinite(f.min[0])) return [];
  const col = look.shoes === 'boots' ? '#4a2f1b' : look.shoes === 'sandals' ? '#343a40' : '#868e96';
  const w = f.max[0] - f.min[0] + 0.012, d = f.max[2] - f.min[2] + 0.014;
  return [piece(Box(w, 0.024, d), col, { pos: [(f.min[0] + f.max[0]) / 2, f.min[1] + 0.007, (f.min[2] + f.max[2]) / 2] })];
}

/** Matriks dari ruang tubuh (root, pose ikat) ke ruang lokal sebuah grup. */
function invFromRoot(group, root) {
  const m = new THREE.Matrix4();
  for (let o = group; o && o !== root; o = o.parent) {
    o.updateMatrix();
    m.premultiply(o.matrix);
  }
  return m.invert();
}

// ---------- Kelas karakter ----------
const STAR_GEO = new THREE.OctahedronGeometry(0.07, 0);
const STAR_MAT = new THREE.MeshBasicMaterial({ color: '#ffd43b' });
const ACTION_DUR = { swing: 0.42, slash: 0.34, shoot: 0.2, strum: 0.4, wave: 1.3, kick: 0.35, racket: 0.32 };
const ease = (t) => t * t * (3 - 2 * t);
const _reach = new THREE.Vector3();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const SKIN_SPHERE = new THREE.Sphere(new THREE.Vector3(0, 0.85, 0), 1.35);
const REST_ATTR = new THREE.BufferAttribute(REST_POSITIONS, 3);

/** Karakter low poly ber-rig. API sama dengan karakter chibi sebelumnya. */
export class Character {
  constructor({ name = 'Pemain', color = '#4dabf7', look = DEFAULT_LOOK, showName = true } = {}) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.hips = new THREE.Group();
    this.torso = new THREE.Group();
    this.head = new THREE.Group();
    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.add(this.torso);
    this.torso.add(this.head);
    this.arms = [-1, 1].map((side) => {
      const g = new THREE.Group();
      const elbow = new THREE.Group();
      const hand = new THREE.Group();
      g.add(elbow);
      elbow.add(hand);
      g.userData = { side, elbow, hand };
      this.torso.add(g);
      return g;
    });
    this.legs = [-1, 1].map((side) => {
      const g = new THREE.Group();
      const knee = new THREE.Group();
      g.add(knee);
      g.userData = { side, knee };
      this.hips.add(g);
      return g;
    });
    // urutan sesuai BONE di bodyModel.js
    const [aR, aL] = this.arms, [lR, lL] = this.legs;
    this.bones = [this.hips, this.torso, this.head, aR, aR.userData.elbow, aR.userData.hand, aL, aL.userData.elbow, aL.userData.hand, lR, lR.userData.knee, lL, lL.userData.knee];

    this.showName = showName;
    this.name = '';
    this.color = color;
    this.lookSig = '';
    this.meshes = [];
    this.itemId = 'hand';
    this.held = null;
    this.action = null;
    this.dizzyT = 0;
    this.stars = null;
    this.gaze = { yaw: 0, pitch: 0 };
    this.phase = 0;
    this.squash = 0;
    this.time = Math.random() * 10;
    this.wasGrounded = true;
    this.prevVy = 0;
    this.bubble = null;
    this.bubbleTime = 0;
    this.setLook(look);
    this.setProfile(name, color);
  }

  get dims() {
    return this.d;
  }

  get height() {
    return this.d.height;
  }

  setProfile(name, color) {
    let rebuild = false;
    if (color && color !== this.color) {
      this.color = color;
      rebuild = true;
    }
    if (name && name !== this.name) {
      this.name = name;
      rebuild = true;
    }
    if ((rebuild || !this.nameTag) && this.showName && this.name) {
      disposeSprite(this.nameTag);
      this.nameTag = createNameTag(this.name, this.color);
      this.root.add(this.nameTag);
      this.placeLabels();
    }
  }

  /** Letakkan tulang di titik sendi model (pose ikat = pose A model asli). */
  poseBind(shape) {
    const J = shape.joints, hipY = shape.dims.hipY;
    const rel = (p) => new THREE.Vector3(p[0], p[1] - hipY, p[2]);
    const b = this.body;
    b.position.set(0, 0, 0);
    b.rotation.set(0, 0, 0);
    b.scale.set(1, 1, 1);
    this.hips.position.set(0, hipY, 0);
    this.hips.rotation.set(0, 0, 0);
    this.torso.position.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.head.position.copy(rel(J.neck));
    this.head.rotation.set(0, 0, 0);
    this.head.scale.setScalar(1);
    const chain = (g, mid, a, bJ, c, endExtra = 0, endGroup = null) => {
      const A = rel(a), B = rel(bJ), C = rel(c);
      g.position.copy(A);
      const d1 = _v1.subVectors(B, A);
      const l1 = d1.length();
      g.quaternion.setFromUnitVectors(DOWN, d1.normalize());
      mid.position.set(0, -l1, 0);
      const d2 = _v2.subVectors(C, B);
      const l2 = d2.length();
      mid.quaternion.setFromUnitVectors(DOWN, d2.normalize().applyQuaternion(_q.copy(g.quaternion).invert()));
      if (endGroup) {
        endGroup.position.set(0, -(l2 + endExtra), 0);
        endGroup.quaternion.identity();
      }
    };
    for (const a of this.arms) {
      const S = a.userData.side < 0 ? 'R' : 'L';
      const tip = J['tip' + S], wr = J['wrist' + S];
      chain(a, a.userData.elbow, J['shoulder' + S], J['elbow' + S], wr, Math.hypot(tip[0] - wr[0], tip[1] - wr[1], tip[2] - wr[2]) * 0.38, a.userData.hand);
    }
    for (const l of this.legs) {
      const S = l.userData.side < 0 ? 'R' : 'L';
      chain(l, l.userData.knee, J['hip' + S], J['knee' + S], J['ankle' + S]);
    }
  }

  setLook(look) {
    look = sanitizeLook(look, this.color);
    const sig = JSON.stringify(look);
    if (sig === this.lookSig) return;
    this.lookSig = sig;
    this.look = look;
    const shape = (this.shape = bodyShape(look.gender, look.body));
    const d = (this.d = shape.dims);

    // bersihkan model lama
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    this.meshes = [];
    for (const w of this.backAnim?.wings || []) w.removeFromParent();
    this.backAnim?.cape?.removeFromParent();
    this.backAnim = {};
    const add = (parent, mesh) => {
      if (!mesh) return null;
      parent.add(mesh);
      this.meshes.push(mesh);
      return mesh;
    };

    // pose ikat → skinning
    const saved = this.saveRot();
    this.poseBind(shape);
    if (!shape.attrs) {
      shape.attrs = {
        position: new THREE.BufferAttribute(shape.positions, 3),
        skinIndex: new THREE.Uint16BufferAttribute(shape.skinIndex, 4),
        skinWeight: new THREE.BufferAttribute(shape.skinWeight, 4),
      };
      const tmp = new THREE.BufferGeometry();
      tmp.setAttribute('position', shape.attrs.position);
      tmp.computeVertexNormals();
      shape.attrs.normal = tmp.getAttribute('normal');
    }
    const geo = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) geo.setAttribute(k, shape.attrs[k]);
    geo.setAttribute('rest', REST_ATTR);
    if (!this.bodyMat) this.bodyMat = createBodyMaterial();
    paintBody(this.bodyMat, look);
    const skin = new THREE.SkinnedMesh(geo, this.bodyMat);
    skin.castShadow = true;
    skin.receiveShadow = true;
    skin.boundingSphere = SKIN_SPHERE.clone();
    add(this.root, skin);
    this.root.updateMatrixWorld(true);
    skin.bind(new THREE.Skeleton(this.bones));
    this.skin = skin;

    // rambut, topi, wajah (ikut kepala)
    const M = shape.metrics;
    const unitHead = new THREE.Matrix4().compose(new THREE.Vector3(...M.headC), new THREE.Quaternion(), new THREE.Vector3(...M.headR));
    const toHead = invFromRoot(this.head, this.root);
    const hair = hairPieces(look), hat = hatPieces(look);
    const headMesh = build([...hair.P, ...hat.P], new THREE.Matrix4().multiplyMatrices(toHead, unitHead));
    add(this.head, headMesh);
    add(this.head, build(facePieces(look, M), toHead));
    // pakaian & aksesoris badan
    add(this.torso, build(torsoPieces(look, shape), invFromRoot(this.torso, this.root)));
    add(this.hips, build(skirtPieces(look, shape), invFromRoot(this.hips, this.root)));
    for (const l of this.legs) add(l.userData.knee, build(solePieces(look, shape, l.userData.side), invFromRoot(l.userData.knee, this.root)));
    if (look.back === 'wings') this.backAnim.wings = this.wings(shape);
    if (look.back === 'cape') this.backAnim.cape = this.cape(look, shape);
    for (const w of this.backAnim.wings || []) this.meshes.push(...w.children);
    if (this.backAnim.cape) this.meshes.push(...this.backAnim.cape.children);

    // kembali ke pose santai (atau pose animasi sebelumnya)
    this.restoreRot(saved);
    const ex = hat.P.length ? hat.extra : hair.extra;
    this.topY = d.height + ex * M.headR[1];
    this.placeLabels();
    this.attachItem();
  }

  /** Simpan/kembalikan rotasi sendi supaya ganti tampilan tidak membuat pose melompat. */
  saveRot() {
    if (!this.skin) return null;
    const r = (o) => o.rotation.clone();
    return {
      body: [this.body.position.clone(), this.body.rotation.clone(), this.body.scale.clone()],
      head: r(this.head),
      torso: r(this.torso),
      arms: this.arms.map((a) => [r(a), r(a.userData.elbow)]),
      legs: this.legs.map((l) => [r(l), r(l.userData.knee)]),
    };
  }

  restoreRot(s) {
    if (!s) {
      // pose santai awal: lengan turun di samping badan
      for (const a of this.arms) {
        a.rotation.set(0, 0, a.userData.side * 0.12);
        a.userData.elbow.rotation.set(-0.12, 0, 0);
      }
      for (const l of this.legs) {
        l.rotation.set(0, 0, l.userData.side * 0.05);
        l.userData.knee.rotation.set(0, 0, 0);
      }
      return;
    }
    this.body.position.copy(s.body[0]);
    this.body.rotation.copy(s.body[1]);
    this.body.scale.copy(s.body[2]);
    this.head.rotation.copy(s.head);
    this.torso.rotation.copy(s.torso);
    this.arms.forEach((a, i) => {
      a.rotation.copy(s.arms[i][0]);
      a.userData.elbow.rotation.copy(s.arms[i][1]);
    });
    this.legs.forEach((l, i) => {
      l.rotation.copy(s.legs[i][0]);
      l.userData.knee.rotation.copy(s.legs[i][1]);
    });
  }

  wings(shape) {
    const M = shape.metrics, J = shape.joints, K = M.K;
    const toTorso = invFromRoot(this.torso, this.root);
    const out = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      const y = J.shoulderL[1] - 0.12 * K;
      pivot.position.set(s * 0.05, y, M.zFront(y, false) - 0.02).applyMatrix4(toTorso);
      const w = build([
        piece(new THREE.ConeGeometry(0.22, 0.62, 4), '#f8f9fa', { pos: [s * 0.32, 0.05, 0], rot: [0, 0, s * 1.15], scale: [1, 1, 0.18] }),
        piece(new THREE.ConeGeometry(0.15, 0.4, 4), '#f1f3f5', { pos: [s * 0.25, -0.16, 0], rot: [0, 0, s * 1.5], scale: [1, 1, 0.18] }),
      ]);
      pivot.add(w);
      pivot.userData.side = s;
      this.torso.add(pivot);
      out.push(pivot);
    }
    return out;
  }

  cape(look, shape) {
    const M = shape.metrics, J = shape.joints, K = M.K;
    const pivot = new THREE.Group();
    const y = J.neck[1] - 0.06 * K;
    pivot.position.set(0, y, M.zFront(y, false) - 0.015).applyMatrix4(invFromRoot(this.torso, this.root));
    const kneeY = (J.kneeL[1] + J.kneeR[1]) / 2;
    const h = y - kneeY;
    const w = M.halfW(J.shoulderL[1] - 0.05 * K) * 2.1;
    pivot.add(build([piece(Box(w, h, 0.02), '#c92a2a', { pos: [0, -h / 2, -0.012] })]));
    this.torso.add(pivot);
    return pivot;
  }

  placeLabels() {
    if (!this.d) return;
    if (this.nameTag) this.nameTag.position.y = this.topY + 0.22;
    if (this.bubble) this.bubble.position.y = this.topY + (this.showName ? 0.65 : 0.3);
    if (this.stars) this.stars.position.y = this.topY + 0.1;
  }

  // ---------- Item & aksi ----------
  setItem(id) {
    if (id === this.itemId) return;
    this.itemId = id;
    this.action = null;
    this.attachItem();
  }

  attachItem() {
    if (this.held) {
      this.held.traverse((o) => o.isMesh && o.geometry.dispose());
      this.held.removeFromParent();
    }
    this.held = null;
    if (!this.d || this.itemId === 'hand' || this.itemId === 'chair') return;
    this.held = buildHeldItem(this.itemId);
    if (this.itemId === 'guitar') {
      const M = this.shape.metrics, y = (this.shape.joints.shoulderL[1] + M.waistY) / 2;
      this.held.position.set(0.02, y - this.d.hipY, M.zFront(y, true) + 0.08);
      this.held.rotation.set(0, 0, -0.95);
      this.held.scale.setScalar(0.85);
      this.torso.add(this.held);
    } else {
      this.held.rotation.x = Math.PI / 2;
      this.held.scale.setScalar(0.8);
      this.arms[0].userData.hand.add(this.held);
    }
  }

  playAction(kind) {
    if (!ACTION_DUR[kind]) return;
    this.action = { kind, t: 0, dur: ACTION_DUR[kind] };
  }

  /** Arah lengan kanan (rx, rz) agar menunjuk titik dunia (lengan lurus). */
  armAim(world) {
    this.root.updateMatrixWorld(true);
    const v = this.torso.worldToLocal(_reach.copy(world)).sub(this.arms[0].position);
    const len = v.length() || 1;
    return { rx: clamp(Math.atan2(-v.z, -v.y), -2.4, 0.3), rz: Math.asin(clamp(v.x / len, -0.95, 0.95)) };
  }

  /** Tangan kanan meraih titik di dunia lalu kembali (mengambil / menaruh kartu di meja). */
  reachTo(world, dur = 0.6) {
    const a = this.armAim(world);
    this.action = { kind: 'reach', t: 0, dur, rx: a.rx, rz: a.rz };
  }

  dizzy(seconds = 1.6) {
    this.dizzyT = Math.max(this.dizzyT, seconds);
    if (!this.stars) {
      this.stars = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(STAR_GEO, STAR_MAT);
        const a = (i / 3) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26);
        s.scale.setScalar(0.7);
        this.stars.add(s);
      }
      this.root.add(this.stars);
      this.placeLabels();
    }
    this.stars.visible = true;
  }

  /** Arah kepala (radian) relatif badan — mis. mengikuti pandangan saat duduk di meja. */
  setGaze(yaw, pitch) {
    this.gaze.yaw = clamp(yaw, -1.1, 1.1);
    this.gaze.pitch = clamp(pitch, -0.7, 0.55);
  }

  showChat(text) {
    disposeSprite(this.bubble);
    this.bubble = createChatBubble(text);
    this.root.add(this.bubble);
    this.placeLabels();
    this.bubbleTime = 6 + Math.min(4, text.length * 0.05);
  }

  muzzleWorld(out) {
    if (this.held) return this.held.localToWorld(out.set(0, 0.17, 0.45));
    return this.arms[0].userData.hand.getWorldPosition(out);
  }

  // ---------- Animasi ----------
  /**
   * @param {{speed:number, grounded:boolean, swimming:boolean, vy:number, sitting?:boolean, sliding?:boolean, dashing?:boolean}} s
   */
  animate(dt, s) {
    this.time += dt;
    const d = this.d;
    const walk = s.sitting || s.sliding ? 0 : clamp(s.speed / 5, 0, 1);
    const run = s.sitting ? 0 : clamp((s.speed - 5) / 4, 0, 1);
    this.phase += dt * (5 + s.speed * 1.5) * (walk > 0.05 ? 1 : 0);

    if (s.grounded && !this.wasGrounded && this.prevVy < -4) this.squash = Math.min(0.2, -this.prevVy * 0.014);
    this.wasGrounded = s.grounded;
    this.prevVy = s.vy;
    this.squash = damp(this.squash, 0, 9, dt);

    // target pose (lengan menggantung = 0; siku negatif = menekuk ke depan; lutut positif = menekuk ke belakang)
    const open = this.look.body === 'chubby' ? 0.2 : 0.12;
    let bodyY = 0, lean = 0, bend = 0, sway = 0, sy = 1; // lean = seluruh badan miring, bend = menekuk di pinggul
    let legL = 0, legR = 0, kneeL = 0, kneeR = 0;
    let armLx = 0, armRx = 0, armLz = open, armRz = -open, armRy = 0, elbL = -0.12, elbR = -0.12;
    const sin = Math.sin(this.phase);

    if (s.sitting) {
      bodyY = -d.hipY + 0.05;
      legL = legR = -1.5;
      kneeL = kneeR = 1.5;
      armLx = armRx = -0.35;
      elbL = elbR = -0.95;
      armLz = 0.1;
      armRz = -0.1;
      if (this.holdCards) {
        // memegang kartu di depan dada dengan dua tangan
        armLx = armRx = -0.75;
        elbL = elbR = -1.25;
        armLz = -0.35;
        armRz = 0.35;
      }
      sy = 1 + Math.sin(this.time * 2) * 0.006;
    } else if (s.swimming) {
      bodyY = -(d.hipY + d.torsoH * 0.85) + Math.sin(this.time * 2.2) * 0.05;
      lean = 0.35 * walk;
      const p = this.phase * 1.4;
      armLx = -2.2 + Math.sin(p) * 0.8;
      armRx = -2.2 + Math.sin(p + Math.PI) * 0.8;
      armLz = 0.45;
      armRz = -0.45;
      elbL = elbR = -0.3;
      legL = Math.sin(p * 1.5) * 0.4;
      legR = -legL;
      kneeL = 0.15 + Math.max(0, legL) * 0.5;
      kneeR = 0.15 + Math.max(0, legR) * 0.5;
      this.phase += dt * 4;
    } else if (s.sliding) {
      bodyY = -d.hipY * 0.55;
      lean = -0.75;
      legL = -1.35;
      legR = -1.1;
      kneeL = 0.1;
      kneeR = 0.55;
      armLx = armRx = 0.6;
      armLz = 0.9;
      armRz = -0.9;
      elbL = elbR = -0.3;
    } else if (s.grounded) {
      const amp = 0.55 + run * 0.35;
      legL = sin * amp * walk;
      legR = -legL;
      // lutut menekuk saat kaki terayun dari belakang ke depan
      const kb = 0.75 + run * 0.6;
      kneeL = walk * (0.06 + kb * Math.max(0, Math.sin(this.phase + 1.25)));
      kneeR = walk * (0.06 + kb * Math.max(0, Math.sin(this.phase + 1.25 + Math.PI)));
      armLx = -sin * (0.45 + run * 0.35) * walk;
      armRx = -armLx;
      elbL = -0.12 - walk * (0.18 + run * 0.9) - Math.max(0, -armLx) * 0.3;
      elbR = -0.12 - walk * (0.18 + run * 0.9) - Math.max(0, -armRx) * 0.3;
      bodyY = Math.abs(Math.cos(this.phase)) * 0.035 * walk - 0.02 * run;
      lean = 0.05 * walk + 0.16 * run + (s.dashing ? 0.35 : 0);
      sway = sin * 0.03 * walk;
      sy = 1 + Math.sin(this.time * 2.4) * 0.008 * (1 - walk);
    } else {
      sy = 1 + clamp(s.vy * 0.012, -0.06, 0.08);
      legL = -0.6;
      legR = 0.3;
      kneeL = 0.9;
      kneeR = 0.45;
      armLz = 1.05;
      armRz = -1.05;
      elbL = elbR = -0.4;
      lean = 0.08 * walk;
    }

    // tangan kanan mengikuti titik (mis. memindahkan bidak, menabur kelereng); dilepas = kembali pelan
    this.reachK = damp(this.reachK || 0, this.reachAt ? 1 : 0, 10, dt);
    if (this.reachK > 0.01) {
      if (this.reachAt) this.reachAim = this.armAim(this.reachAt);
      if (this.reachAim) {
        armRx = lerp(armRx, this.reachAim.rx, this.reachK);
        armRz = lerp(armRz, this.reachAim.rz, this.reachK);
        elbR = lerp(elbR, -0.05, this.reachK);
        bend += 0.28 * this.reachK;
      }
    }

    // pose membidik bola pool: badan membungkuk, tangan kiri jadi sandaran stik, tangan kanan memegang pangkal
    if (this.cuePose && !s.sitting && !s.swimming) {
      const k = this.cuePose;
      bend += 0.95 * k; // membungkuk di pinggul, kaki tetap berdiri
      lean += 0.05 * k;
      legL = lerp(legL, -0.12, k);
      legR = lerp(legR, 0.22, k);
      kneeL = lerp(kneeL, 0.2, k);
      kneeR = lerp(kneeR, 0.08, k);
      armLx = lerp(armLx, -1.05, k);
      armLz = lerp(armLz, -0.12, k);
      elbL = lerp(elbL, -0.12, k);
      armRx = lerp(armRx, 0.15, k);
      armRz = lerp(armRz, 0.12, k);
      elbR = lerp(elbR, -1.45, k);
    }

    // pose memegang item
    const item = this.itemId;
    let itemRx = Math.PI / 2, itemRy = 0;
    if (!s.swimming && !s.sitting) {
      if (item === 'hammer' || item === 'sword' || item === 'racket') {
        armRx = Math.min(armRx, 0) - 0.3;
        elbR = Math.min(elbR, -0.55);
      } else if (item === 'watergun') {
        armRx = -1.45;
        elbR = -0.1;
      } else if (item === 'guitar') {
        armRx = -0.9;
        armRz = 0.55;
        elbR = -0.8;
        armLx = -1.2;
        armLz = -0.5;
        elbL = -0.9;
      }
    }

    // aksi
    let snap = false;
    if (this.action) {
      const a = this.action;
      a.t += dt;
      const p = clamp(a.t / a.dur, 0, 1);
      snap = true;
      if (a.kind === 'swing' || a.kind === 'racket') {
        const up = ease(seg(p, 0, 0.32)), hit = ease(seg(p, 0.32, 0.55)), back = ease(seg(p, 0.6, 1));
        armRx = lerp(lerp(lerp(armRx, -2.8, up), -0.6, hit), armRx, back);
        elbR = lerp(lerp(elbR, -0.9, up), -0.15, hit);
        lean += 0.15 * hit * (1 - back);
      } else if (a.kind === 'slash') {
        const go = ease(seg(p, 0.1, 0.55)), back = ease(seg(p, 0.65, 1));
        armRx = lerp(-1.35, armRx, back);
        armRz = lerp(lerp(0.9, -1.0, go), armRz, back);
        elbR = lerp(-0.2, elbR, back);
        itemRy = lerp(0.6, 0, back);
      } else if (a.kind === 'shoot') {
        armRx = -1.45 + 0.25 * (1 - p);
        elbR = -0.1;
      } else if (a.kind === 'strum') {
        armRx += Math.sin(p * Math.PI * 4) * 0.2;
      } else if (a.kind === 'wave') {
        armRz = -2.5;
        armRx = -0.2;
        elbR = -0.35 + Math.sin(a.t * 15) * 0.35;
      } else if (a.kind === 'reach') {
        const go = ease(seg(p, 0, 0.38)), back = ease(seg(p, 0.58, 1));
        armRx = lerp(lerp(armRx, a.rx, go), armRx, back);
        armRz = lerp(lerp(armRz, a.rz, go), armRz, back);
        elbR = lerp(lerp(elbR, -0.05, go), elbR, back);
        bend += 0.3 * go * (1 - back); // badan sedikit condong ke meja
      } else if (a.kind === 'kick') {
        const wind = ease(seg(p, 0, 0.35)), hit = ease(seg(p, 0.35, 0.6)), back = ease(seg(p, 0.65, 1));
        legR = lerp(lerp(lerp(legR, 0.9, wind), -1.5, hit), 0, back);
        kneeR = lerp(lerp(lerp(kneeR, 1.3, wind), 0.05, hit), 0, back);
        armLz = 0.7;
        lean -= 0.1 * hit;
      }
      if (p >= 1) this.action = null;
    }

    if (this.dizzyT > 0) {
      this.dizzyT -= dt;
      const k = clamp(this.dizzyT, 0, 1);
      sway += Math.sin(this.time * 12) * 0.12 * k;
      this.stars.rotation.y += dt * 7;
      if (this.dizzyT <= 0) this.stars.visible = false;
    }

    // terapkan (diredam supaya mulus)
    const k = (v) => (snap ? 30 : v);
    sy *= 1 - this.squash;
    const b = this.body;
    b.position.y = damp(b.position.y, bodyY, 18, dt);
    b.rotation.x = damp(b.rotation.x, lean, 10, dt);
    b.rotation.z = damp(b.rotation.z, sway, 10, dt);
    this.torso.rotation.x = damp(this.torso.rotation.x, bend, 10, dt);
    const sxz = 1 / Math.sqrt(sy);
    b.scale.set(damp(b.scale.x, sxz, 18, dt), damp(b.scale.y, sy, 18, dt), damp(b.scale.z, sxz, 18, dt));
    const [lR, lL] = this.legs;
    lR.rotation.x = damp(lR.rotation.x, legR, k(16), dt);
    lL.rotation.x = damp(lL.rotation.x, legL, 16, dt);
    const kR = lR.userData.knee.rotation, kL = lL.userData.knee.rotation;
    kR.set(damp(kR.x, kneeR, k(16), dt), 0, 0);
    kL.set(damp(kL.x, kneeL, 16, dt), 0, 0);
    const [aR, aL] = this.arms;
    aR.rotation.x = damp(aR.rotation.x, armRx, k(14), dt);
    aR.rotation.z = damp(aR.rotation.z, armRz, k(14), dt);
    aR.rotation.y = damp(aR.rotation.y, armRy, 14, dt);
    aL.rotation.x = damp(aL.rotation.x, armLx, 14, dt);
    aL.rotation.z = damp(aL.rotation.z, armLz, 14, dt);
    aL.rotation.y = damp(aL.rotation.y, 0, 14, dt);
    const eR = aR.userData.elbow.rotation, eL = aL.userData.elbow.rotation;
    eR.set(damp(eR.x, elbR, k(14), dt), damp(eR.y, 0, 14, dt), damp(eR.z, 0, 14, dt));
    eL.set(damp(eL.x, elbL, 14, dt), damp(eL.y, 0, 14, dt), damp(eL.z, 0, 14, dt));
    if (this.held) this.held.visible = !(this.holdCards && s.sitting) && !this.cuePose;
    if (this.held && item !== 'guitar') {
      this.held.rotation.x = damp(this.held.rotation.x, itemRx, 20, dt);
      this.held.rotation.y = damp(this.held.rotation.y, itemRy, 20, dt);
    }
    this.head.rotation.y = damp(this.head.rotation.y, this.gaze.yaw, 10, dt);
    // saat memegang kartu kepala tidak menunduk, supaya kipas kartu tidak tertutup kepala
    const headX = this.holdCards && s.sitting ? Math.min(-this.gaze.pitch, 0.16) : -this.gaze.pitch;
    this.head.rotation.x = damp(this.head.rotation.x, headX, 10, dt);
    // kepala disembunyikan (kamera orang pertama): kecilkan tulang kepala agar kulit kepala ikut hilang
    const hs = this.head.visible ? 1 : 0.001;
    if (this.head.scale.x !== hs) this.head.scale.setScalar(hs);

    if (this.backAnim.cape) {
      const flutter = clamp(0.08 + s.speed * 0.07, 0, 0.95) + Math.sin(this.time * 7) * 0.04 * walk;
      this.backAnim.cape.rotation.x = damp(this.backAnim.cape.rotation.x, s.sitting ? 0.02 : flutter, 8, dt);
    }
    if (this.backAnim.wings) {
      const rate = s.grounded || s.sitting ? 2.5 : 14;
      for (const w of this.backAnim.wings) w.rotation.y = Math.sin(this.time * rate) * 0.28 * w.userData.side;
    }

    if (this.bubble) {
      this.bubbleTime -= dt;
      this.bubble.material.opacity = clamp(this.bubbleTime, 0, 1);
      if (this.bubbleTime <= 0) {
        disposeSprite(this.bubble);
        this.bubble = null;
      }
    }
  }

  dispose() {
    disposeSprite(this.nameTag);
    disposeSprite(this.bubble);
    for (const m of this.meshes) m.geometry.dispose();
    this.bodyMat?.dispose();
    if (this.held) this.held.traverse((o) => o.isMesh && o.geometry.dispose());
    this.root.removeFromParent();
  }
}
