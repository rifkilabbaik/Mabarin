import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp } from '../utils/math.js';
import { createChatBubble, createNameTag, disposeSprite } from './labels.js';
import { BODY_DIMS, DEFAULT_LOOK, sanitizeLook } from './looks.js';
import { buildHeldItem } from './items.js';

// ---------- Helper geometri berwarna (digabung jadi satu mesh per bagian tubuh) ----------
const CHAR_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

function piece(geo, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
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

function build(pieces) {
  if (!pieces.length) return null;
  const g = mergeGeometries(pieces, false);
  pieces.forEach((p) => p.dispose());
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

// ---------- Kepala: wajah, rambut, topi, aksesoris wajah ----------
function headPieces(look, d) {
  const r = d.headR, P = [];
  const skin = look.skin;
  P.push(piece(Ico(r, 1), skin, { scale: [1, 0.95, 0.97] }));
  for (const s of [-1, 1]) P.push(piece(Ico(r * 0.17, 0), skin, { pos: [s * r * 0.96, -r * 0.08, 0], scale: [0.6, 1, 0.9] }));

  // mata
  const ex = r * 0.33, ey = -r * 0.04, ez = r * 0.92;
  const black = '#1b1d29';
  for (const s of [-1, 1]) {
    if (look.eyes === 'happy') P.push(piece(new THREE.TorusGeometry(0.06, 0.018, 4, 8, Math.PI), black, { pos: [s * ex, ey, ez] }));
    else if (look.eyes === 'sleepy') P.push(piece(new THREE.CapsuleGeometry(0.026, 0.09, 2, 6), black, { pos: [s * ex, ey - 0.01, ez], rot: [0, 0, Math.PI / 2] }));
    else if (look.eyes === 'big') {
      P.push(piece(new THREE.SphereGeometry(0.085, 8, 6), black, { pos: [s * ex, ey, ez - 0.01], scale: [1, 1.1, 0.5] }));
      P.push(piece(Ico(0.03, 0), '#ffffff', { pos: [s * ex + 0.025, ey + 0.04, ez + 0.035] }));
    } else {
      P.push(piece(new THREE.CapsuleGeometry(0.05, 0.07, 2, 6), black, { pos: [s * ex, ey, ez - 0.01], scale: [1, 1, 0.6] }));
      P.push(piece(Ico(0.02, 0), '#ffffff', { pos: [s * ex + 0.02, ey + 0.04, ez + 0.025] }));
    }
    P.push(piece(Ico(0.055, 0), '#ff8fa3', { pos: [s * r * 0.58, -r * 0.3, r * 0.78], scale: [1, 0.6, 0.45] }));
  }

  // rambut (bagian atas disembunyikan bila memakai topi)
  const hc = look.hairColor, hat = look.hat !== 'none';
  const cap = () => piece(new THREE.SphereGeometry(r * 1.06, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), hc, { pos: [0, 0.02, -0.01] });
  const back = (thetaLen, rr = 1.08) => piece(new THREE.SphereGeometry(r * rr, 12, 7, Math.PI - 0.25, Math.PI + 0.5, 0, Math.PI * thetaLen), hc, { pos: [0, 0, -0.02] });
  let hairExtra = 0;
  switch (look.hair) {
    case 'spiky':
      if (!hat) {
        P.push(cap());
        const spikes = [[0, 0], ...[0, 1, 2, 3, 4, 5, 6].map((k) => [0.75, (k / 7) * Math.PI * 2 + 0.4])];
        for (const [th, ph] of spikes) {
          const n = new THREE.Vector3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
          const g = piece(new THREE.ConeGeometry(0.11, 0.3, 4), hc, {});
          g.applyQuaternion(q);
          g.translate(n.x * r * 0.98, n.y * r * 0.98, n.z * r * 0.98);
          P.push(g);
        }
        hairExtra = 0.15;
      }
      P.push(back(0.55, 1.04));
      break;
    case 'bob':
      if (!hat) P.push(cap());
      P.push(back(0.62));
      break;
    case 'long':
      if (!hat) P.push(cap());
      P.push(back(0.72, 1.09));
      P.push(piece(Box(r * 1.5, r * 1.1, 0.12), hc, { pos: [0, -r * 0.85, -r * 0.62] }));
      break;
    case 'ponytail':
      if (!hat) P.push(cap());
      P.push(back(0.5, 1.05));
      P.push(piece(Ico(0.13, 0), hc, { pos: [0, r * 0.15, -r * 1.05] }));
      P.push(piece(new THREE.ConeGeometry(0.12, 0.42, 6), hc, { pos: [0, -r * 0.35, -r * 1.12], rot: [Math.PI + 0.2, 0, 0] }));
      break;
    case 'buns':
      if (!hat) P.push(cap());
      P.push(back(0.5, 1.05));
      for (const s of [-1, 1]) P.push(piece(Ico(0.15, 1), hc, { pos: [s * r * 0.62, r * 0.78, -r * 0.1] }));
      hairExtra = 0.1;
      break;
    case 'mohawk':
      if (!hat) {
        for (let i = -3; i <= 3; i++) {
          const a = i * 0.34;
          P.push(piece(Box(0.08, 0.24, 0.14), hc, { pos: [0, Math.cos(a) * r * 1.03, Math.sin(a) * r * 1.03], rot: [a, 0, 0] }));
        }
        hairExtra = 0.15;
      }
      break;
    case 'afro':
      if (!hat) {
        const blobs = [[0, 0, 0.27], ...[0, 1, 2, 3, 4, 5].map((k) => [0.75, (k / 6) * Math.PI * 2, 0.24]), [1.3, Math.PI, 0.22], [1.25, 2.3, 0.2], [1.25, 3.98, 0.2]];
        for (const [th, ph, br] of blobs) {
          P.push(piece(Ico(br + r * 0.1, 0), hc, { pos: [Math.sin(th) * Math.sin(ph) * r, Math.cos(th) * r, Math.sin(th) * Math.cos(ph) * r] }));
        }
        hairExtra = 0.3;
      } else P.push(back(0.6, 1.1));
      break;
  }

  // topi
  let hatExtra = 0;
  if (look.hat === 'cap') {
    P.push(piece(new THREE.SphereGeometry(r * 1.08, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#e03131', { pos: [0, r * 0.08, 0] }));
    P.push(piece(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.04, 12, 1, false, -Math.PI / 2, Math.PI), '#b02525', { pos: [0, r * 0.12, r * 0.55] }));
    hatExtra = 0.12;
  } else if (look.hat === 'cowboy') {
    P.push(piece(Cyl(r * 1.75, r * 1.75, 0.05, 14), '#a0672f', { pos: [0, r * 0.5, 0] }));
    P.push(piece(Cyl(r * 0.72, r * 0.86, 0.36, 10), '#a0672f', { pos: [0, r * 0.5 + 0.2, 0] }));
    P.push(piece(Cyl(r * 0.88, r * 0.88, 0.07, 10), '#4a2f1b', { pos: [0, r * 0.5 + 0.06, 0] }));
    hatExtra = 0.4;
  } else if (look.hat === 'beanie') {
    P.push(piece(new THREE.SphereGeometry(r * 1.09, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#4263eb', { pos: [0, r * 0.05, 0], scale: [1, 1.1, 1] }));
    P.push(piece(new THREE.TorusGeometry(r * 1.06, 0.06, 5, 16), '#3b5bdb', { pos: [0, r * 0.08, 0], rot: [Math.PI / 2, 0, 0] }));
    P.push(piece(Ico(0.11, 0), '#f8f9fa', { pos: [0, r * 1.25, 0] }));
    hatExtra = 0.25;
  } else if (look.hat === 'party') {
    P.push(piece(new THREE.ConeGeometry(r * 0.5, 0.55, 8), '#f783ac', { pos: [0.05, r + 0.2, 0], rot: [0, 0, -0.15] }));
    P.push(piece(Ico(0.08, 0), '#ffd43b', { pos: [0.12, r + 0.5, 0] }));
    hatExtra = 0.6;
  } else if (look.hat === 'crown') {
    P.push(piece(Cyl(r * 0.62, r * 0.6, 0.16, 10), '#f5c518', { pos: [0, r * 0.88, 0] }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      P.push(piece(new THREE.ConeGeometry(0.07, 0.17, 4), '#f5c518', { pos: [Math.sin(a) * r * 0.6, r * 0.88 + 0.16, Math.cos(a) * r * 0.6] }));
    }
    P.push(piece(new THREE.OctahedronGeometry(0.05, 0), '#e03131', { pos: [0, r * 0.88, r * 0.63] }));
    hatExtra = 0.25;
  }

  // aksesoris wajah
  if (look.face === 'glasses' || look.face === 'shades') {
    const dark = look.face === 'shades';
    for (const s of [-1, 1]) {
      if (dark) P.push(piece(Box(0.17, 0.11, 0.03), '#111318', { pos: [s * ex, ey, ez + 0.05] }));
      else P.push(piece(new THREE.TorusGeometry(0.085, 0.016, 4, 10), '#343a40', { pos: [s * ex, ey, ez + 0.05] }));
      P.push(piece(Box(0.02, 0.02, r * 0.85), dark ? '#111318' : '#343a40', { pos: [s * (ex + 0.09), ey + 0.01, ez - r * 0.38] }));
    }
    P.push(piece(Box(ex * 2 - 0.16, 0.02, 0.02), dark ? '#111318' : '#343a40', { pos: [0, ey + 0.02, ez + 0.05] }));
  } else if (look.face === 'mustache') {
    for (const s of [-1, 1]) P.push(piece(Ico(0.09, 0), hc, { pos: [s * 0.07, -r * 0.42, r * 0.86], scale: [1.1, 0.42, 0.45], rot: [0, 0, -s * 0.3] }));
  }
  return { pieces: P, extra: hat ? hatExtra : hairExtra };
}

// ---------- Badan: pinggul, torso, leher, aksesoris badan ----------
function torsoPieces(look, d) {
  const P = [];
  const tc = look.topColor, bc = look.bottomColor, skin = look.skin;
  const R = d.torsoR, H = d.torsoH;
  const dress = look.top === 'dress';
  P.push(piece(Cyl(R * 1.02, R * 1.04, 0.14, 10), dress ? tc : bc, { pos: [0, 0, 0], scale: [1, 1, 0.86] }));
  P.push(piece(Cyl(R * 0.9, R, H, 10), tc, { pos: [0, H / 2, 0], scale: [1, 1, 0.86] }));
  P.push(piece(new THREE.SphereGeometry(R * 0.9, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), tc, { pos: [0, H - 0.01, 0], scale: [1, 0.45, 0.86] }));
  P.push(piece(Cyl(0.075, 0.085, 0.08, 8), skin, { pos: [0, H + 0.02, 0] }));
  const dark = shade(tc, 0.75);
  if (look.top === 'shirt') {
    for (const s of [-1, 1]) P.push(piece(new THREE.ConeGeometry(0.06, 0.09, 3), '#f8f9fa', { pos: [s * 0.05, H - 0.02, R * 0.78], rot: [Math.PI / 2 + 0.3, 0, s * 0.5] }));
    for (let i = 0; i < 3; i++) P.push(piece(Ico(0.014, 0), '#f8f9fa', { pos: [0, H * (0.75 - i * 0.22), R * 0.9] }));
  } else if (look.top === 'hoodie') {
    P.push(piece(new THREE.TorusGeometry(0.17, 0.065, 5, 10, Math.PI), tc, { pos: [0, H + 0.03, -0.04], rot: [-Math.PI / 2 + 0.25, 0, Math.PI] }));
    P.push(piece(Box(R * 1.1, H * 0.28, 0.04), dark, { pos: [0, H * 0.25, R * 0.86] }));
  } else if (look.top === 'jacket') {
    P.push(piece(Box(0.035, H * 0.95, 0.03), '#f1f3f5', { pos: [0, H * 0.5, R * 0.88] }));
    P.push(piece(Box(R * 1.6, 0.06, R * 1.8), dark, { pos: [0, 0.05, 0] }));
  }
  if (dress) P.push(piece(Cyl(R * 1.0, R * 1.65, 0.34, 12), tc, { pos: [0, -0.13, 0] }));
  else if (look.bottom === 'skirt') P.push(piece(Cyl(R * 1.0, R * 1.45, 0.26, 12), bc, { pos: [0, -0.09, 0] }));

  // leher & punggung
  if (look.neck === 'scarf') {
    P.push(piece(new THREE.TorusGeometry(0.13, 0.06, 5, 12), '#f03e3e', { pos: [0, H + 0.02, 0], rot: [Math.PI / 2, 0, 0] }));
    P.push(piece(Box(0.11, 0.26, 0.05), '#f03e3e', { pos: [0.1, H - 0.12, R * 0.88], rot: [0.1, 0, 0.12] }));
  } else if (look.neck === 'bowtie') {
    for (const s of [-1, 1]) P.push(piece(new THREE.ConeGeometry(0.06, 0.11, 4), '#c92a2a', { pos: [s * 0.06, H - 0.01, R * 0.86], rot: [0, 0, s * Math.PI / 2] }));
    P.push(piece(Box(0.04, 0.04, 0.04), '#c92a2a', { pos: [0, H - 0.01, R * 0.88] }));
  }
  if (look.back === 'backpack') {
    P.push(piece(Box(R * 1.4, H * 0.85, 0.2), '#e8590c', { pos: [0, H * 0.5, -R * 0.95] }));
    P.push(piece(Box(R * 1.45, 0.08, 0.24), '#b8460a', { pos: [0, H * 0.9, -R * 0.95] }));
  }
  return P;
}

function armPieces(look, d) {
  const { arm: L, limb: r } = d;
  const longSleeve = ['shirt', 'hoodie', 'jacket'].includes(look.top);
  const upper = look.top === 'tank' ? look.skin : look.topColor;
  const lower = longSleeve ? look.topColor : look.skin;
  return [
    piece(Ico(r * 1.15, 0), upper, { pos: [0, -0.01, 0] }),
    piece(Cyl(r, r * 0.95, L / 2, 7), upper, { pos: [0, -L / 4, 0] }),
    piece(Cyl(r * 0.95, r * 0.9, L / 2, 7), lower, { pos: [0, -L * 0.75, 0] }),
    piece(Ico(r * 1.2, 0), look.skin, { pos: [0, -L - r * 0.5, 0] }),
  ];
}

function legPieces(look, d) {
  const { leg: L, limb } = d;
  const r = limb * 1.12;
  const bare = look.top === 'dress' || look.bottom === 'skirt';
  const thigh = bare ? look.skin : look.bottomColor;
  const shin = bare || look.bottom === 'shorts' ? look.skin : look.bottomColor;
  const P = [
    piece(Cyl(r * 1.08, r, L * 0.5, 7), thigh, { pos: [0, -L * 0.25, 0] }),
    piece(Cyl(r, r * 0.92, L * 0.5, 7), shin, { pos: [0, -L * 0.75, 0] }),
  ];
  const fy = -L - 0.02;
  if (look.shoes === 'boots') {
    P.push(piece(Box(r * 2.3, 0.16, r * 2.4), '#6b4226', { pos: [0, fy + 0.04, 0] }));
    P.push(piece(Box(r * 2.3, 0.08, r * 3.2), '#4a2f1b', { pos: [0, fy, 0.03] }));
  } else if (look.shoes === 'sandals') {
    P.push(piece(Box(r * 2, 0.06, r * 3), look.skin, { pos: [0, fy + 0.01, 0.03] }));
    P.push(piece(Box(r * 2.2, 0.03, r * 3.2), '#343a40', { pos: [0, fy - 0.025, 0.03] }));
  } else {
    P.push(piece(Box(r * 2.2, 0.08, r * 3.2), '#f8f9fa', { pos: [0, fy, 0.03] }));
    P.push(piece(Box(r * 2.25, 0.03, r * 3.25), '#868e96', { pos: [0, fy - 0.035, 0.03] }));
  }
  return P;
}

// ---------- Aksesoris bergerak ----------
function wings(torso, d) {
  const out = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.1, d.torsoH * 0.72, -d.torsoR * 0.8);
    const w = build([
      piece(new THREE.ConeGeometry(0.26, 0.7, 4), '#f8f9fa', { pos: [s * 0.36, 0.05, 0], rot: [0, 0, s * 1.15], scale: [1, 1, 0.18] }),
      piece(new THREE.ConeGeometry(0.17, 0.45, 4), '#f1f3f5', { pos: [s * 0.28, -0.18, 0], rot: [0, 0, s * 1.5], scale: [1, 1, 0.18] }),
    ]);
    pivot.add(w);
    pivot.userData.side = s;
    torso.add(pivot);
    out.push(pivot);
  }
  return out;
}

function cape(torso, d) {
  const pivot = new THREE.Group();
  pivot.position.set(0, d.torsoH - 0.02, -d.torsoR * 0.8);
  const h = d.torsoH + d.leg * 0.75;
  pivot.add(build([piece(Box(d.torsoR * 1.9, h, 0.035), '#c92a2a', { pos: [0, -h / 2, -0.02] })]));
  torso.add(pivot);
  return pivot;
}

// ---------- Kelas karakter ----------
const STAR_GEO = new THREE.OctahedronGeometry(0.07, 0);
const STAR_MAT = new THREE.MeshBasicMaterial({ color: '#ffd43b' });
const ACTION_DUR = { swing: 0.42, slash: 0.34, shoot: 0.2, strum: 0.4, wave: 1.3, kick: 0.35, racket: 0.32 };
const ease = (t) => t * t * (3 - 2 * t);
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);

/** Karakter chibi low poly. API sama dengan karakter kapsul lama. */
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
      g.userData.side = side;
      g.userData.hand = new THREE.Group();
      g.add(g.userData.hand);
      this.torso.add(g);
      return g;
    });
    this.legs = [-1, 1].map((side) => {
      const g = new THREE.Group();
      g.userData.side = side;
      this.hips.add(g);
      return g;
    });

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

  setLook(look) {
    look = sanitizeLook(look, this.color);
    const sig = JSON.stringify(look);
    if (sig === this.lookSig) return;
    this.lookSig = sig;
    this.look = look;
    const d = (this.d = BODY_DIMS[look.body]);

    for (const m of this.meshes) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    this.meshes = [];
    for (const w of this.backAnim?.wings || []) w.removeFromParent();
    this.backAnim?.cape?.removeFromParent();
    this.backAnim = {};
    const add = (parent, mesh) => {
      if (!mesh) return;
      parent.add(mesh);
      this.meshes.push(mesh);
    };

    this.hips.position.y = d.hipY;
    this.head.position.set(0, d.neck, 0);
    const head = headPieces(look, d);
    const headMesh = build(head.pieces);
    headMesh.position.y = d.headR * 0.9;
    add(this.head, headMesh);
    add(this.torso, build(torsoPieces(look, d)));
    for (const a of this.arms) {
      a.position.set(a.userData.side * (d.torsoR + d.limb * 0.55), d.torsoH - 0.05, 0);
      a.userData.hand.position.set(0, -d.arm - d.limb * 0.5, 0);
      add(a, build(armPieces(look, d)));
    }
    for (const l of this.legs) {
      l.position.set(l.userData.side * d.torsoR * 0.48, -0.02, 0);
      add(l, build(legPieces(look, d)));
    }
    if (look.back === 'wings') this.backAnim.wings = wings(this.torso, d);
    if (look.back === 'cape') this.backAnim.cape = cape(this.torso, d);
    for (const w of this.backAnim.wings || []) this.meshes.push(...w.children);
    if (this.backAnim.cape) this.meshes.push(...this.backAnim.cape.children);

    this.topY = d.height + head.extra;
    this.placeLabels();
    this.attachItem();
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
      this.held.position.set(0.02, this.d.torsoH * 0.42, this.d.torsoR + 0.1);
      this.held.rotation.set(0, 0, -0.95);
      this.held.scale.setScalar(0.85);
      this.torso.add(this.held);
    } else {
      this.held.rotation.x = Math.PI / 2;
      this.arms[0].userData.hand.add(this.held);
    }
  }

  playAction(kind) {
    if (!ACTION_DUR[kind]) return;
    this.action = { kind, t: 0, dur: ACTION_DUR[kind] };
  }

  dizzy(seconds = 1.6) {
    this.dizzyT = Math.max(this.dizzyT, seconds);
    if (!this.stars) {
      this.stars = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(STAR_GEO, STAR_MAT);
        const a = (i / 3) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34);
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

    if (s.grounded && !this.wasGrounded && this.prevVy < -4) this.squash = Math.min(0.25, -this.prevVy * 0.018);
    this.wasGrounded = s.grounded;
    this.prevVy = s.vy;
    this.squash = damp(this.squash, 0, 9, dt);

    // target pose
    let bodyY = 0, lean = 0, sway = 0, sy = 1;
    let legL = 0, legR = 0, armLx = 0, armRx = 0, armLz = 0.12, armRz = -0.12, armRy = 0;
    const sin = Math.sin(this.phase);

    if (s.sitting) {
      bodyY = -d.hipY + 0.05;
      legL = legR = -1.45;
      armLx = armRx = -0.55;
      armLz = 0.25;
      armRz = -0.25;
      sy = 1 + Math.sin(this.time * 2) * 0.01;
    } else if (s.swimming) {
      bodyY = -(d.hipY + d.torsoH * 0.85) + Math.sin(this.time * 2.2) * 0.05;
      lean = 0.35 * walk;
      const p = this.phase * 1.4;
      armLx = -2.2 + Math.sin(p) * 0.8;
      armRx = -2.2 + Math.sin(p + Math.PI) * 0.8;
      armLz = 0.5;
      armRz = -0.5;
      legL = Math.sin(p * 1.5) * 0.4;
      legR = -legL;
      this.phase += dt * 4;
    } else if (s.sliding) {
      bodyY = -d.hipY * 0.55;
      lean = -0.75;
      legL = -1.35;
      legR = -1.1;
      armLx = armRx = 0.6;
      armLz = 0.9;
      armRz = -0.9;
    } else if (s.grounded) {
      const amp = 0.6 + run * 0.35;
      legL = sin * amp * walk;
      legR = -legL;
      armLx = -sin * (0.55 + run * 0.3) * walk;
      armRx = -armLx;
      bodyY = Math.abs(Math.cos(this.phase)) * 0.05 * walk;
      lean = 0.06 * walk + 0.14 * run + (s.dashing ? 0.35 : 0);
      sway = sin * 0.04 * walk;
      sy = 1 + Math.sin(this.time * 2.4) * 0.015 * (1 - walk);
    } else {
      sy = 1 + clamp(s.vy * 0.02, -0.1, 0.15);
      legL = -0.6;
      legR = 0.35;
      armLz = 1.25;
      armRz = -1.25;
      lean = 0.08 * walk;
    }

    // pose memegang item
    const item = this.itemId;
    let itemRx = Math.PI / 2, itemRy = 0;
    if (!s.swimming && !s.sitting) {
      if (item === 'hammer' || item === 'sword' || item === 'racket' || item === 'shuttle') armRx = Math.min(armRx, 0) - 0.35;
      else if (item === 'watergun') armRx = -1.45;
      else if (item === 'guitar') {
        armRx = -0.9;
        armRz = 0.55;
        armLx = -1.2;
        armLz = -0.5;
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
        lean += 0.15 * hit * (1 - back);
      } else if (a.kind === 'slash') {
        const go = ease(seg(p, 0.1, 0.55)), back = ease(seg(p, 0.65, 1));
        armRx = lerp(-1.35, armRx, back);
        armRz = lerp(lerp(0.9, -1.0, go), armRz, back);
        itemRy = lerp(0.6, 0, back);
      } else if (a.kind === 'shoot') {
        armRx = -1.45 + 0.25 * (1 - p);
      } else if (a.kind === 'strum') {
        armRx += Math.sin(p * Math.PI * 4) * 0.2;
      } else if (a.kind === 'wave') {
        armRz = -2.6 + Math.sin(a.t * 15) * 0.25;
        armRx = -0.2;
      } else if (a.kind === 'kick') {
        const wind = ease(seg(p, 0, 0.35)), hit = ease(seg(p, 0.35, 0.6)), back = ease(seg(p, 0.65, 1));
        legR = lerp(lerp(lerp(legR, 0.9, wind), -1.5, hit), 0, back);
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
    const sxz = 1 / Math.sqrt(sy);
    b.scale.set(damp(b.scale.x, sxz, 18, dt), damp(b.scale.y, sy, 18, dt), damp(b.scale.z, sxz, 18, dt));
    this.legs[0].rotation.x = damp(this.legs[0].rotation.x, legR, k(16), dt);
    this.legs[1].rotation.x = damp(this.legs[1].rotation.x, legL, 16, dt);
    this.arms[0].rotation.x = damp(this.arms[0].rotation.x, armRx, k(14), dt);
    this.arms[0].rotation.z = damp(this.arms[0].rotation.z, armRz, k(14), dt);
    this.arms[0].rotation.y = damp(this.arms[0].rotation.y, armRy, 14, dt);
    this.arms[1].rotation.x = damp(this.arms[1].rotation.x, armLx, 14, dt);
    this.arms[1].rotation.z = damp(this.arms[1].rotation.z, armLz, 14, dt);
    if (this.held && item !== 'guitar') {
      this.held.rotation.x = damp(this.held.rotation.x, itemRx, 20, dt);
      this.held.rotation.y = damp(this.held.rotation.y, itemRy, 20, dt);
    }
    this.head.rotation.y = damp(this.head.rotation.y, this.gaze.yaw, 10, dt);
    this.head.rotation.x = damp(this.head.rotation.x, -this.gaze.pitch, 10, dt);

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
    if (this.held) this.held.traverse((o) => o.isMesh && o.geometry.dispose());
    this.root.removeFromParent();
  }
}
