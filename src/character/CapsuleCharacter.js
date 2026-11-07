import * as THREE from 'three';
import { clamp, damp, lerp } from '../utils/math.js';
import { createChatBubble, createNameTag, disposeSprite } from './labels.js';
import { BODY_DIMS, DEFAULT_LOOK, sanitizeLook } from './looks.js';
import { buildBack, buildEyes, buildFaceAcc, buildHair, buildHat, buildNeck, disposeGroup } from './parts.js';
import { buildHeldItem } from './items.js';

// Geometri tubuh per bentuk dipakai bersama oleh semua karakter.
const bodyGeoCache = new Map();
function bodyGeo(type) {
  let g = bodyGeoCache.get(type);
  if (!g) {
    const d = BODY_DIMS[type];
    g = new THREE.CapsuleGeometry(d.r, d.len, 3, 10);
    bodyGeoCache.set(type, g);
  }
  return g;
}
const HAND_GEO = new THREE.IcosahedronGeometry(0.13, 0);
const STAR_GEO = new THREE.OctahedronGeometry(0.07, 0);
const STAR_MAT = new THREE.MeshBasicMaterial({ color: '#ffd43b' });

const ease = (t) => t * t * (3 - 2 * t);
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);

const ACTION_DUR = { swing: 0.42, slash: 0.34, shoot: 0.2, strum: 0.4, wave: 1.3 };

export class CapsuleCharacter {
  constructor({ name = 'Pemain', color = '#4dabf7', look = DEFAULT_LOOK, showName = true } = {}) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.bodyMat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    this.handMat = new THREE.MeshLambertMaterial({ color, flatShading: true });

    this.bodyMesh = new THREE.Mesh(bodyGeo('normal'), this.bodyMat);
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.body.add(this.bodyMesh);

    this.face = new THREE.Group();
    this.body.add(this.face);

    // hands[0] = tangan kanan (sisi -X karena karakter menghadap +Z)
    this.hands = [-1, 1].map((side) => {
      const h = new THREE.Mesh(HAND_GEO, this.handMat);
      h.castShadow = true;
      h.userData.side = side;
      this.body.add(h);
      return h;
    });

    this.parts = {};
    this.showName = showName;
    this.name = '';
    this.color = '';
    this.lookSig = '';
    this.topY = 2;
    this.itemId = 'hand';
    this.held = null;
    this.action = null;
    this.dizzyT = 0;
    this.stars = null;

    this.setLook(look);
    this.setProfile(name, color);

    this.phase = 0;
    this.squash = 0;
    this.time = Math.random() * 10;
    this.wasGrounded = true;
    this.prevVy = 0;
    this.bubble = null;
    this.bubbleTime = 0;
  }

  // ---------- Profil & tampilan ----------
  setProfile(name, color) {
    let rebuildTag = false;
    if (color && color !== this.color) {
      this.color = color;
      this.bodyMat.color.set(color);
      this.handMat.color.set(color).multiplyScalar(0.82);
      rebuildTag = true;
    }
    if (name && name !== this.name) {
      this.name = name;
      rebuildTag = true;
    }
    if (rebuildTag && this.showName) {
      disposeSprite(this.nameTag);
      this.nameTag = createNameTag(this.name, this.color);
      this.root.add(this.nameTag);
      this.placeLabels();
    }
  }

  setLook(look) {
    look = sanitizeLook(look);
    const sig = JSON.stringify(look);
    if (sig === this.lookSig) return;
    this.lookSig = sig;
    this.look = look;
    const d = (this.dims = BODY_DIMS[look.body]);

    this.bodyMesh.geometry = bodyGeo(look.body);
    this.bodyMesh.position.y = d.r + d.len / 2;
    this.face.position.set(0, d.faceY, 0);

    for (const key of Object.keys(this.parts)) disposeGroup(this.parts[key]);
    const hair = buildHair(look.hair, look.hairColor, d);
    const hat = buildHat(look.hat, d);
    const back = buildBack(look.back, d);
    this.parts = {
      eyes: buildEyes(look.eyes, d),
      faceAcc: buildFaceAcc(look.face, d, look.hairColor),
      hairTop: hair.top,
      hairSide: hair.side,
      hat: hat.group,
      back: back.group,
      neck: buildNeck(look.neck, d),
    };
    this.backAnim = back.anim;
    this.face.add(this.parts.eyes, this.parts.faceAcc);
    this.body.add(this.parts.hairTop, this.parts.hairSide, this.parts.hat, this.parts.back, this.parts.neck);
    this.parts.hairTop.visible = look.hat === 'none';

    this.topY = d.height + (look.hat !== 'none' ? hat.extra : hair.extra);
    for (const h of this.hands) h.position.set(h.userData.side * d.handX, d.handY, 0);
    this.placeLabels();
    this.attachItem();
  }

  placeLabels() {
    if (this.nameTag) this.nameTag.position.y = this.topY + 0.25;
    if (this.bubble) this.bubble.position.y = this.topY + (this.showName ? 0.68 : 0.3);
    if (this.stars) this.stars.position.y = this.topY + 0.12;
  }

  // ---------- Item & aksi ----------
  setItem(id) {
    if (id === this.itemId) return;
    this.itemId = id;
    this.action = null;
    this.attachItem();
  }

  attachItem() {
    disposeGroup(this.held);
    this.held = null;
    if (!this.dims || this.itemId === 'hand' || this.itemId === 'chair') return;
    this.held = buildHeldItem(this.itemId);
    if (this.itemId === 'guitar') {
      const d = this.dims;
      this.held.position.set(0.02, d.handY - 0.02, d.r + 0.1);
      this.held.rotation.set(0, 0, -0.95);
      this.body.add(this.held);
    } else {
      this.hands[0].add(this.held);
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
        s.position.set(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
        this.stars.add(s);
      }
      this.root.add(this.stars);
      this.placeLabels();
    }
    this.stars.visible = true;
  }

  showChat(text) {
    disposeSprite(this.bubble);
    this.bubble = createChatBubble(text);
    this.root.add(this.bubble);
    this.placeLabels();
    this.bubbleTime = 6 + Math.min(4, text.length * 0.05);
  }

  // ---------- Animasi ----------
  /**
   * @param {number} dt
   * @param {{speed:number, grounded:boolean, swimming:boolean, vy:number, sitting?:boolean}} s
   */
  animate(dt, s) {
    this.time += dt;
    const d = this.dims;
    const walk = s.sitting ? 0 : clamp(s.speed / 5, 0, 1);
    const run = s.sitting ? 0 : clamp((s.speed - 5) / 4, 0, 1);
    this.phase += dt * (4 + s.speed * 1.6) * (walk > 0.05 ? 1 : 0);

    if (s.grounded && !this.wasGrounded && this.prevVy < -4) {
      this.squash = Math.min(0.32, -this.prevVy * 0.022);
    }
    this.wasGrounded = s.grounded;
    this.prevVy = s.vy;
    this.squash = damp(this.squash, 0, 9, dt);

    const b = this.body;
    let sy = 1, lean = 0, sway = 0, y = 0;
    const hx = d.handX, hy = d.handY;
    // target posisi tangan [kanan, kiri]
    const H = [{ x: -hx, y: hy, z: 0 }, { x: hx, y: hy, z: 0 }];
    let swimHands = false;

    if (s.sitting) {
      lean = -0.1;
      H[0] = { x: -hx * 0.75, y: d.r * 0.85, z: d.r * 0.75 };
      H[1] = { x: hx * 0.75, y: d.r * 0.85, z: d.r * 0.75 };
      sy = 1 + Math.sin(this.time * 2) * 0.012;
    } else if (s.swimming) {
      y = -(d.height * 0.56) + Math.sin(this.time * 2.2) * 0.06;
      lean = 0.25 * walk;
      swimHands = true;
      this.phase += dt * 5;
    } else if (s.grounded) {
      y = Math.abs(Math.sin(this.phase)) * (0.1 + run * 0.06) * walk;
      lean = 0.1 * walk + 0.12 * run;
      sway = Math.sin(this.phase) * 0.06 * walk;
      sy = 1 + Math.sin(this.time * 2.4) * 0.018 * (1 - walk);
      const swing = Math.sin(this.phase) * (0.22 + run * 0.12) * walk;
      H[0].z = -swing;
      H[1].z = swing;
      const lift = Math.abs(Math.cos(this.phase)) * 0.05 * walk;
      H[0].y += lift;
      H[1].y += lift;
    } else {
      sy = 1 + clamp(s.vy * 0.025, -0.12, 0.2);
      lean = 0.08 * walk;
      const up = d.height * 0.62 + clamp(s.vy * 0.02, -0.2, 0.15);
      H[0] = { x: -hx - 0.06, y: up, z: 0 };
      H[1] = { x: hx + 0.06, y: up, z: 0 };
    }

    if (swimHands) {
      for (let i = 0; i < 2; i++) {
        const ph = this.phase + (i === 0 ? 0 : Math.PI);
        H[i] = { x: (i === 0 ? -1 : 1) * (hx + 0.04), y: d.height * 0.58 + Math.cos(ph) * 0.12, z: Math.sin(ph) * 0.3 };
      }
    }

    // Pose memegang item
    const item = this.itemId;
    let itemRot = null;
    if (!s.swimming) {
      if (item === 'hammer' || item === 'sword') {
        H[0].z += 0.12;
        H[0].y += 0.05;
        itemRot = { x: 0.55, y: 0, z: 0 };
      } else if (item === 'watergun') {
        H[0] = { x: -hx * 0.75, y: hy + 0.12, z: 0.32 };
        itemRot = { x: 0, y: 0, z: 0 };
      } else if (item === 'guitar') {
        H[0] = { x: -0.08, y: hy + 0.02, z: d.r + 0.2 };
        H[1] = { x: 0.4, y: hy + 0.34, z: d.r + 0.18 };
      }
    }

    // Aksi (pukul, tembak, petik, lambai) menimpa pose tangan kanan
    let snap = false;
    if (this.action) {
      const a = this.action;
      a.t += dt;
      const p = clamp(a.t / a.dur, 0, 1);
      const R = H[0];
      if (a.kind === 'swing') {
        const up = ease(seg(p, 0, 0.32));
        const hit = ease(seg(p, 0.32, 0.55));
        const back = ease(seg(p, 0.6, 1));
        const rx = lerp(lerp(lerp(0.55, -1.5, up), 1.9, hit), 0.55, back);
        R.y += lerp(lerp(0, 0.4, up), -0.08, hit) * (1 - back);
        R.z += lerp(lerp(0, -0.12, up), 0.45, hit) * (1 - back);
        itemRot = { x: rx, y: 0, z: 0 };
        lean += 0.18 * hit * (1 - back);
      } else if (a.kind === 'slash') {
        const go = ease(seg(p, 0.1, 0.55));
        const back = ease(seg(p, 0.65, 1));
        R.x = lerp(lerp(-hx - 0.2, hx * 0.6, go), -hx, back);
        R.z += lerp(0.15, 0.45, Math.sin(go * Math.PI)) * (1 - back);
        R.y += 0.12 * (1 - back);
        itemRot = { x: 1.45, y: lerp(lerp(1.1, -1.1, go), 0, back), z: 0 };
      } else if (a.kind === 'shoot') {
        const k = 1 - p;
        R.z -= 0.1 * k;
        if (itemRot) itemRot.x = -0.35 * k;
      } else if (a.kind === 'strum') {
        R.y += Math.sin(p * Math.PI * 4) * 0.08;
      } else if (a.kind === 'wave') {
        R.x = -hx - 0.12 + Math.sin(a.t * 15) * 0.12;
        R.y = d.faceY + 0.18;
        R.z = 0.12;
      }
      snap = true;
      if (p >= 1) this.action = null;
    }

    // Pusing (kena bonk)
    if (this.dizzyT > 0) {
      this.dizzyT -= dt;
      const k = clamp(this.dizzyT, 0, 1);
      sway += Math.sin(this.time * 12) * 0.14 * k;
      this.stars.rotation.y += dt * 7;
      if (this.dizzyT <= 0) this.stars.visible = false;
    }

    sy *= 1 - this.squash;
    const sxz = 1 / Math.sqrt(sy);
    b.scale.set(damp(b.scale.x, sxz, 18, dt), damp(b.scale.y, sy, 18, dt), damp(b.scale.z, sxz, 18, dt));
    b.position.y = damp(b.position.y, y, 20, dt);
    b.rotation.x = damp(b.rotation.x, lean, 10, dt);
    b.rotation.z = damp(b.rotation.z, sway, 10, dt);

    for (let i = 0; i < 2; i++) {
      const h = this.hands[i], t = H[i];
      const k = snap && i === 0 ? 40 : 14;
      h.position.x = damp(h.position.x, t.x, k, dt);
      h.position.y = damp(h.position.y, t.y, k, dt);
      h.position.z = damp(h.position.z, t.z, k, dt);
    }
    if (this.held && itemRot && item !== 'guitar') {
      const k = snap ? 40 : 12;
      this.held.rotation.x = damp(this.held.rotation.x, itemRot.x, k, dt);
      this.held.rotation.y = damp(this.held.rotation.y, itemRot.y, k, dt);
      this.held.rotation.z = damp(this.held.rotation.z, itemRot.z, k, dt);
    }

    // Aksesoris bergerak
    if (this.backAnim?.cape) {
      const flutter = clamp(0.08 + s.speed * 0.07, 0, 0.95) + Math.sin(this.time * 7) * 0.04 * walk;
      this.backAnim.cape.rotation.x = damp(this.backAnim.cape.rotation.x, s.sitting ? 0.02 : flutter, 8, dt);
    }
    if (this.backAnim?.wings) {
      const rate = s.grounded || s.sitting ? 2.5 : 14;
      for (const w of this.backAnim.wings) w.rotation.y = Math.sin(this.time * rate) * 0.28 * w.userData.side;
    }

    // Gelembung chat memudar
    if (this.bubble) {
      this.bubbleTime -= dt;
      this.bubble.material.opacity = clamp(this.bubbleTime, 0, 1);
      if (this.bubbleTime <= 0) {
        disposeSprite(this.bubble);
        this.bubble = null;
      }
    }
  }

  // Posisi dunia ujung tangan kanan (asal semprotan pistol air)
  muzzleWorld(out) {
    const hand = this.hands[0];
    out.set(0, 0.18, 0.4);
    return hand.localToWorld(out);
  }

  get height() {
    return this.dims.height;
  }

  dispose() {
    disposeSprite(this.nameTag);
    disposeSprite(this.bubble);
    for (const key of Object.keys(this.parts)) disposeGroup(this.parts[key]);
    disposeGroup(this.held);
    this.bodyMat.dispose();
    this.handMat.dispose();
    this.root.removeFromParent();
  }
}
