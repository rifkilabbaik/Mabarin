import * as THREE from 'three';
import { cardAtlas, makeCard, setCardFace } from './cardArt.js';

const FAN_W = 0.2;
const MAX_FAN = 16;
const FAN_R = FAN_W * 0.82; // jarak pusat kartu dari poros genggaman

const HAND_W = 0.12;
const HAND_R = 0.3; // jari-jari kipas kartu di tangan sendiri
const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Kartu di tangan sendiri: dipegang seperti kipas di depan dada (di dunia, tidak ikut kamera), muka menghadap mata kita. */
export class HandView {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.cards = new Map();
    this.selMat = new THREE.MeshBasicMaterial({ map: cardAtlas().texture, alphaTest: 0.5, color: '#fff3bf' });
    this.time = 0;
    this.nextShow = 0;
  }

  /**
   * @param {{ids:string[], eye:THREE.Vector3, seat:{x,y,z,rot}|null, table:{y:number}, key:(id)=>string,
   *           look:(id)=>('normal'|'dim'|'selected'), hover:string|null, spawn?:THREE.Vector3}} o
   */
  layout(dt, o) {
    this.time += dt;
    const { material, dimMaterial } = cardAtlas();
    this.place(o);
    const keep = new Set(o.ids);
    for (const [id, c] of this.cards) {
      if (!keep.has(id)) {
        c.removeFromParent();
        this.cards.delete(id);
      }
    }
    const n = o.ids.length;
    const fresh = o.ids.reduce((k, id) => k + (this.cards.has(id) ? 0 : 1), 0);
    const gap = fresh >= 5 ? 0.11 : 0.34; // bagi kartu awal cepat; ambil kartu satu per satu
    const k = 1 - Math.exp(-12 * dt);
    const step = Math.min(0.15, 1.5 / Math.max(n - 1, 1));
    o.ids.forEach((id, i) => {
      let c = this.cards.get(id);
      if (!c) {
        c = makeCard(o.key(id));
        c.scale.setScalar(HAND_W);
        c.userData.front.userData.cardId = id;
        this.group.add(c);
        this.cards.set(id, c);
        if (o.spawn) {
          // terbang dari tumpukan ambil dalam keadaan tertelungkup, lalu terbuka di tangan
          this.group.updateMatrixWorld(true);
          c.position.copy(this.group.worldToLocal(_v.copy(o.spawn)));
          this.group.getWorldQuaternion(_qi).invert();
          c.quaternion.copy(_qi).multiply(_q.setFromEuler(_e.set(Math.PI / 2, (o.seat?.rot || 0) + Math.PI, 0)));
          this.nextShow = Math.max(this.nextShow, this.time);
          c.userData.showAt = this.nextShow;
          this.nextShow += gap;
          c.visible = false;
        } else c.userData.snap = true;
      }
      setCardFace(c, o.key(id));
      const look = o.look(id);
      const hover = o.hover === id;
      const lift = (hover ? 0.035 : 0) + (look === 'selected' ? 0.05 : look === 'normal' ? 0.012 : 0);
      // kipas berporos di genggaman; kartu yang bisa dimainkan sedikit terangkat
      const a = -(i - (n - 1) / 2) * step;
      _t.set(-(HAND_R + lift) * Math.sin(a), (HAND_R + lift) * Math.cos(a) - HAND_R, i * 0.0022 + (hover ? 0.004 : 0));
      if (c.userData.showAt > this.time) return;
      c.visible = true;
      const kk = c.userData.snap ? 1 : k;
      c.userData.snap = false;
      c.position.lerp(_t, kk);
      c.quaternion.slerp(_q.setFromEuler(_e.set(0, 0, a)), kk);
      c.userData.front.material = look === 'dim' ? dimMaterial : look === 'selected' ? this.selMat : material;
    });
  }

  /** Di depan dada, di atas meja, menghadap mata kita. */
  place(o) {
    const seat = o.seat;
    if (!seat) return;
    const fx = Math.sin(seat.rot), fz = Math.cos(seat.rot);
    this.group.position.set(seat.x + fx * 0.45, Math.max(seat.y + 0.5, (o.table?.y ?? -Infinity) + 0.13), seat.z + fz * 0.45);
    this.group.lookAt(o.eye);
  }

  targets() {
    return [...this.cards.values()].filter((c) => c.visible).map((c) => c.userData.front);
  }

  /** Kartu sedang terbang ke tangan (belum sampai). */
  get arriving() {
    let k = 0;
    for (const c of this.cards.values()) if (c.userData.showAt > this.time) k++;
    return k;
  }

  clear() {
    for (const c of this.cards.values()) c.removeFromParent();
    this.cards.clear();
  }
}

/** Kartu tertutup milik pemain lain: dipegang di kedua tangan karakternya, cukup besar agar jumlahnya terlihat. */
const _ha = new THREE.Vector3();
export class FanView {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.cards = [];
    parent.add(this.group);
  }

  update(seat, count, character, camera, tableY = -Infinity) {
    const fx = Math.sin(seat.rot), fz = Math.cos(seat.rot);
    // di depan dada; tinggi mengikuti tangan kiri (tangan kanan dipakai mengambil / menaruh kartu)
    let y = seat.y + 0.4;
    if (character?.root.visible && character.arms) {
      character.root.updateMatrixWorld(true);
      y = character.arms[1].userData.hand.getWorldPosition(_ha).y + 0.01;
    }
    this.group.position.set(seat.x + fx * 0.47, y, seat.z + fz * 0.47);
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
