import * as THREE from 'three';
import { clamp, damp } from '../utils/math.js';
import { createChatBubble, createNameTag, disposeSprite } from './labels.js';

// Geometri dipakai bersama oleh semua karakter (hemat memori).
const R = 0.45;
const BODY_LEN = 0.8;
const GEO = {
  body: new THREE.CapsuleGeometry(R, BODY_LEN, 3, 9),
  eye: new THREE.CapsuleGeometry(0.055, 0.1, 2, 6),
  glint: new THREE.IcosahedronGeometry(0.022, 0),
  cheek: new THREE.IcosahedronGeometry(0.06, 0),
  hand: new THREE.IcosahedronGeometry(0.13, 0),
};
const MAT = {
  eye: new THREE.MeshBasicMaterial({ color: '#1b1d29' }),
  glint: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  cheek: new THREE.MeshLambertMaterial({ color: '#ff8fa3', flatShading: true }),
};

export class CapsuleCharacter {
  constructor({ name = 'Pemain', color = '#4dabf7', showName = true } = {}) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.bodyMat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    this.handMat = new THREE.MeshLambertMaterial({ color, flatShading: true });

    const body = new THREE.Mesh(GEO.body, this.bodyMat);
    body.position.y = R + BODY_LEN / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    this.body.add(body);

    // Wajah: mata + kilau + pipi (menghadap +Z)
    const face = new THREE.Group();
    face.position.y = 1.2;
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(GEO.eye, MAT.eye);
      eye.position.set(side * 0.15, 0.02, 0.405);
      face.add(eye);
      const glint = new THREE.Mesh(GEO.glint, MAT.glint);
      glint.position.set(side * 0.15 + 0.022, 0.07, 0.455);
      face.add(glint);
      const cheek = new THREE.Mesh(GEO.cheek, MAT.cheek);
      cheek.scale.set(1, 0.6, 0.5);
      cheek.position.set(side * 0.27, -0.14, 0.355);
      face.add(cheek);
    }
    this.body.add(face);
    this.face = face;

    // Tangan melayang ala capsule character
    this.hands = [-1, 1].map((side) => {
      const h = new THREE.Mesh(GEO.hand, this.handMat);
      h.position.set(side * 0.58, 0.72, 0);
      h.castShadow = true;
      h.userData.side = side;
      this.body.add(h);
      return h;
    });

    this.showName = showName;
    this.name = '';
    this.color = '';
    this.setProfile(name, color);

    this.phase = 0;
    this.squash = 0;
    this.time = Math.random() * 10;
    this.wasGrounded = true;
    this.prevVy = 0;
    this.bubble = null;
    this.bubbleTime = 0;
  }

  setProfile(name, color) {
    if (color && color !== this.color) {
      this.color = color;
      this.bodyMat.color.set(color);
      this.handMat.color.set(color).multiplyScalar(0.82);
    }
    if (name && name !== this.name) {
      this.name = name;
      if (this.showName) {
        disposeSprite(this.nameTag);
        this.nameTag = createNameTag(name, this.color);
        this.nameTag.position.y = 2.0;
        this.root.add(this.nameTag);
      }
    } else if (color && this.nameTag && this.showName) {
      disposeSprite(this.nameTag);
      this.nameTag = createNameTag(this.name, this.color);
      this.nameTag.position.y = 2.0;
      this.root.add(this.nameTag);
    }
  }

  showChat(text) {
    disposeSprite(this.bubble);
    this.bubble = createChatBubble(text);
    this.bubble.position.y = this.showName ? 2.45 : 2.05;
    this.root.add(this.bubble);
    this.bubbleTime = 6 + Math.min(4, text.length * 0.05);
  }

  /**
   * @param {number} dt
   * @param {{speed:number, grounded:boolean, swimming:boolean, vy:number}} s
   */
  animate(dt, s) {
    this.time += dt;
    const walk = clamp(s.speed / 5, 0, 1);
    const run = clamp((s.speed - 5) / 4, 0, 1);
    this.phase += dt * (4 + s.speed * 1.6) * (walk > 0.05 ? 1 : 0);

    // Pendaratan => squash
    if (s.grounded && !this.wasGrounded && this.prevVy < -4) {
      this.squash = Math.min(0.32, -this.prevVy * 0.022);
    }
    this.wasGrounded = s.grounded;
    this.prevVy = s.vy;
    this.squash = damp(this.squash, 0, 9, dt);

    const b = this.body;
    let sy = 1, lean = 0, sway = 0, y = 0;
    let handY = 0.72, handZ = 0, handX = 0.58, handSwing = 0;

    if (s.swimming) {
      y = -0.95 + Math.sin(this.time * 2.2) * 0.06;
      lean = 0.25 * walk;
      handY = 0.98;
      handX = 0.62;
      handSwing = 1;
      this.phase += dt * 5;
    } else if (s.grounded) {
      y = Math.abs(Math.sin(this.phase)) * (0.1 + run * 0.06) * walk;
      lean = 0.1 * walk + 0.12 * run;
      sway = Math.sin(this.phase) * 0.06 * walk;
      sy = 1 + Math.sin(this.time * 2.4) * 0.018 * (1 - walk);
      handZ = Math.sin(this.phase) * (0.22 + run * 0.12) * walk;
      handY = 0.72 + Math.abs(Math.cos(this.phase)) * 0.05 * walk;
    } else {
      sy = 1 + clamp(s.vy * 0.025, -0.12, 0.2);
      lean = 0.08 * walk;
      handY = 1.05 + clamp(s.vy * 0.02, -0.2, 0.15);
      handX = 0.64;
    }

    sy *= 1 - this.squash;
    const sxz = 1 / Math.sqrt(sy);
    b.scale.set(damp(b.scale.x, sxz, 18, dt), damp(b.scale.y, sy, 18, dt), damp(b.scale.z, sxz, 18, dt));
    b.position.y = damp(b.position.y, y, 20, dt);
    b.rotation.x = damp(b.rotation.x, lean, 10, dt);
    b.rotation.z = damp(b.rotation.z, sway, 10, dt);

    for (const h of this.hands) {
      const side = h.userData.side;
      let hz = handZ * side;
      let hy = handY;
      if (handSwing) {
        // gerakan mendayung saat berenang
        hz = Math.sin(this.phase + (side > 0 ? 0 : Math.PI)) * 0.3;
        hy = handY + Math.cos(this.phase + (side > 0 ? 0 : Math.PI)) * 0.12;
      }
      h.position.x = damp(h.position.x, handX * side, 14, dt);
      h.position.y = damp(h.position.y, hy, 14, dt);
      h.position.z = damp(h.position.z, hz, 14, dt);
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

  dispose() {
    disposeSprite(this.nameTag);
    disposeSprite(this.bubble);
    this.bodyMat.dispose();
    this.handMat.dispose();
    this.root.removeFromParent();
  }
}
