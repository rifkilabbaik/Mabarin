import * as THREE from 'three';
import { cardAtlas, makeCard, setCardFace } from './cardArt.js';
import { damp } from '../utils/math.js';

const HAND_W = 0.1;
const FAN_W = 0.085;
const MAX_FAN = 12;

const countTex = new Map();
export function countTexture(n) {
  let t = countTex.get(n);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(20,24,36,0.85)';
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '800 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 32, 34);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  countTex.set(n, t);
  return t;
}

/** Kartu di tangan sendiri, dipegang di depan mata (tampilan orang-pertama). */
export class HandView {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    scene.add(this.group);
    this.cards = new Map();
    this.selMat = new THREE.MeshBasicMaterial({ map: cardAtlas().texture, alphaTest: 0.5, color: '#fff3bf' });
  }

  /**
   * @param {{ids:string[], eye:THREE.Vector3, rot:number, camera:THREE.Camera, key:(id)=>string,
   *           look:(id)=>('normal'|'dim'|'selected'), hover:string|null}} o
   */
  layout(dt, o) {
    const { material, dimMaterial } = cardAtlas();
    const fx = Math.sin(o.rot), fz = Math.cos(o.rot);
    this.group.position.set(o.eye.x + fx * 0.3, o.eye.y - 0.42, o.eye.z + fz * 0.3);
    this.group.rotation.set(-0.92, o.rot + Math.PI, 0, 'YXZ');
    const keep = new Set(o.ids);
    for (const [id, c] of this.cards) {
      if (!keep.has(id)) {
        c.removeFromParent();
        this.cards.delete(id);
      }
    }
    const n = o.ids.length;
    const cam = o.camera;
    const halfW = 0.52 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect;
    const spacing = Math.min(0.062, 0.56 / Math.max(n, 1), (halfW * 1.8 - HAND_W) / Math.max(n - 1, 1));
    o.ids.forEach((id, i) => {
      let c = this.cards.get(id);
      if (!c) {
        c = makeCard(o.key(id));
        c.scale.setScalar(HAND_W);
        c.position.set(0, -0.25, 0);
        c.userData.front.userData.cardId = id;
        this.group.add(c);
        this.cards.set(id, c);
      }
      setCardFace(c, o.key(id));
      const off = i - (n - 1) / 2;
      const x = off * spacing;
      const look = o.look(id);
      const lift = (o.hover === id ? 0.035 : 0) + (look === 'selected' ? 0.05 : look === 'normal' ? 0.012 : 0);
      c.position.x = damp(c.position.x, x, 14, dt);
      c.position.y = damp(c.position.y, -Math.abs(x) * 0.2 + lift, 14, dt);
      c.position.z = damp(c.position.z, i * 0.002 + (o.hover === id ? 0.01 : 0), 14, dt);
      c.rotation.z = damp(c.rotation.z, -x * 0.9, 14, dt);
      c.userData.front.material = look === 'dim' ? dimMaterial : look === 'selected' ? this.selMat : material;
    });
  }

  targets() {
    return [...this.cards.values()].map((c) => c.userData.front);
  }

  clear() {
    for (const c of this.cards.values()) c.removeFromParent();
    this.cards.clear();
  }
}

/** Kartu tertutup yang dipegang pemain lain (+ angka jumlah kartu). */
export class FanView {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.cards = [];
    this.badge = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false }));
    this.badge.scale.setScalar(0.11);
    this.badge.renderOrder = 5;
    this.group.add(this.badge);
    parent.add(this.group);
  }

  update(seat, count, showBadge = true) {
    this.group.position.set(seat.x + Math.sin(seat.rot) * 0.36, seat.y + 0.62, seat.z + Math.cos(seat.rot) * 0.36);
    this.group.rotation.set(-0.35, seat.rot + Math.PI, 0, 'YXZ');
    const m = Math.min(count, MAX_FAN);
    while (this.cards.length < m) {
      const card = makeCard(null);
      card.scale.setScalar(FAN_W);
      this.group.add(card);
      this.cards.push(card);
    }
    this.cards.forEach((card, j) => {
      card.visible = j < m;
      const off = j - (m - 1) / 2;
      card.position.set(off * 0.028, -Math.abs(off) * 0.004, j * 0.0015);
      card.rotation.set(0, 0, -off * 0.12);
    });
    this.badge.visible = showBadge && count > 0;
    if (this.badge.visible) {
      this.badge.material.map = countTexture(count);
      this.badge.material.needsUpdate = true;
      this.badge.position.set(0, 0.16, 0.02);
    }
  }

  dispose() {
    this.group.removeFromParent();
  }
}

/** Kumpulan FanView per pemain (kecuali penonton/pemain lokal). */
export class Fans {
  constructor(parent) {
    this.parent = parent;
    this.map = new Map();
  }

  update(match, viewerId, seatOf, countOf) {
    const seen = new Set();
    match.players.forEach((p, i) => {
      if (p.id === viewerId) return;
      seen.add(p.id);
      let f = this.map.get(p.id);
      if (!f) this.map.set(p.id, (f = new FanView(this.parent)));
      f.update(seatOf(i), countOf(p.id));
    });
    for (const [id, f] of this.map) {
      if (!seen.has(id)) {
        f.dispose();
        this.map.delete(id);
      }
    }
  }

  dispose() {
    for (const f of this.map.values()) f.dispose();
    this.map.clear();
  }
}
