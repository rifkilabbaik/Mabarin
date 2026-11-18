import * as THREE from 'three';
import { cardAtlas, makeCard, setCardFace } from './cardArt.js';
import { damp } from '../utils/math.js';

const HAND_W = 0.1;
const FAN_W = 0.2;
const MAX_FAN = 16;
const FAN_R = FAN_W * 0.82; // jarak pusat kartu dari poros genggaman

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

/** Kartu tertutup milik pemain lain: dipegang di kedua tangan karakternya, cukup besar agar jumlahnya terlihat. */
const _ha = new THREE.Vector3();
const _hb = new THREE.Vector3();
export class FanView {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.cards = [];
    parent.add(this.group);
  }

  update(seat, count, character, camera, tableY = -Infinity) {
    const fx = Math.sin(seat.rot), fz = Math.cos(seat.rot);
    const arms = character?.root.visible && character.arms;
    if (arms) {
      // pegangan di antara kedua tangan, sedikit ke depan
      character.root.updateMatrixWorld(true);
      arms[0].userData.hand.getWorldPosition(_ha);
      arms[1].userData.hand.getWorldPosition(_hb);
      this.group.position.set((_ha.x + _hb.x) / 2 + fx * 0.05, (_ha.y + _hb.y) / 2 + 0.01, (_ha.z + _hb.z) / 2 + fz * 0.05);
    } else this.group.position.set(seat.x + fx * 0.44, seat.y + 0.4, seat.z + fz * 0.44);
    // jangan sampai tenggelam ke meja (karakter bertubuh pendek)
    this.group.position.y = Math.max(this.group.position.y, tableY + 0.05);
    // muka kartu menghadap pemiliknya; punggungnya diputar sedikit ke arah kamera agar tetap jelas dari samping
    const base = seat.rot + Math.PI;
    let yaw = base;
    if (camera) {
      const dx = camera.position.x - this.group.position.x, dz = camera.position.z - this.group.position.z;
      let dlt = Math.atan2(-dx, -dz) - base;
      dlt = Math.atan2(Math.sin(dlt), Math.cos(dlt));
      yaw = base + Math.max(-0.9, Math.min(0.9, dlt));
    }
    this.group.rotation.set(0.32, yaw, 0, 'YXZ');
    const m = Math.min(count, MAX_FAN);
    while (this.cards.length < m) {
      const card = makeCard(null);
      card.scale.setScalar(FAN_W);
      this.group.add(card);
      this.cards.push(card);
    }
    // kipas berporos di genggaman
    const step = Math.min(0.17, 1.3 / Math.max(m - 1, 1));
    this.cards.forEach((card, j) => {
      card.visible = j < m;
      const a = -(j - (m - 1) / 2) * step;
      card.position.set(-FAN_R * Math.sin(a), FAN_R * Math.cos(a), -j * 0.0025);
      card.rotation.set(0, 0, a);
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

  update(match, viewerId, seatOf, countOf, charOf, camera) {
    const seen = new Set();
    match.players.forEach((p, i) => {
      if (p.id === viewerId) return;
      seen.add(p.id);
      let f = this.map.get(p.id);
      if (!f) this.map.set(p.id, (f = new FanView(this.parent)));
      f.update(seatOf(i), countOf(p.id), charOf?.(p.id), camera, this.table?.y);
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
