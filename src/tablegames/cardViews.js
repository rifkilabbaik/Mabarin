import * as THREE from 'three';
import { cardAtlas, makeCard, setCardFace } from './cardArt.js';
import { damp } from '../utils/math.js';

const HAND_W = 0.1;
const FAN_W = 0.13;
const MAX_FAN = 16;

/** Kartu di tangan sendiri: selalu di bagian bawah layar, mengikuti kamera. */
const HAND_AT = new THREE.Vector3(0, -0.155, -0.52);
const HAND_TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.35);
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
    this.anchor(o.camera);
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

  /** Tempelkan kartu ke kamera (dipanggil lagi setelah kamera bergerak agar tidak tertinggal). */
  anchor(camera) {
    camera.updateMatrixWorld();
    this.group.position.copy(HAND_AT).applyMatrix4(camera.matrixWorld);
    this.group.quaternion.copy(camera.quaternion).multiply(HAND_TILT);
  }

  targets() {
    return [...this.cards.values()].map((c) => c.userData.front);
  }

  clear() {
    for (const c of this.cards.values()) c.removeFromParent();
    this.cards.clear();
  }
}

/** Kartu tertutup milik pemain lain: berdiri di atas meja di depannya, dikipas agar jumlahnya terlihat. */
export class FanView {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.cards = [];
    parent.add(this.group);
  }

  update(seat, count, table) {
    const dx = seat.x - table.x, dz = seat.z - table.z;
    const len = Math.hypot(dx, dz) || 1;
    // di atas meja, di depan pemain (terpisah dari badan karakter)
    this.group.position.set(table.x + (dx / len) * 0.42, table.y + 0.012, table.z + (dz / len) * 0.42);
    this.group.rotation.set(-Math.PI / 2 + 0.18, seat.rot + Math.PI, 0, 'YXZ'); // hampir rata di meja: terlihat jelas dari kursi mana pun
    const m = Math.min(count, MAX_FAN);
    while (this.cards.length < m) {
      const card = makeCard(null);
      card.scale.setScalar(FAN_W);
      this.group.add(card);
      this.cards.push(card);
    }
    const spacing = Math.min(0.045, 0.46 / Math.max(m - 1, 1));
    this.cards.forEach((card, j) => {
      card.visible = j < m;
      const off = j - (m - 1) / 2;
      card.position.set(off * spacing, -Math.abs(off) * 0.004, j * 0.0015);
      card.rotation.set(0, 0, -off * Math.min(0.07, 0.6 / Math.max(m, 1)));
    });
  }

  dispose() {
    this.group.removeFromParent();
  }
}

/** Kumpulan FanView per pemain (kecuali penonton/pemain lokal). */
export class Fans {
  constructor(parent, table) {
    this.parent = parent;
    this.table = table;
    this.map = new Map();
  }

  update(match, viewerId, seatOf, countOf) {
    const seen = new Set();
    match.players.forEach((p, i) => {
      if (p.id === viewerId) return;
      seen.add(p.id);
      let f = this.map.get(p.id);
      if (!f) this.map.set(p.id, (f = new FanView(this.parent)));
      f.update(seatOf(i), countOf(p.id), this.table);
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
