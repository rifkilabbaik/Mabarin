import * as THREE from 'three';
import { SUIT_INFO, faceKey } from './rules.js';
import { makeCard, setCardFace } from './cardArt.js';
import { CapsuleCharacter } from '../character/CapsuleCharacter.js';

const TABLE_W = 0.17;
const FAN_W = 0.085;
const MAX_FAN = 12;

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

const countTex = new Map();
function countTexture(n) {
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

/**
 * Tampilan satu meja (dilihat semua pemain, termasuk penonton):
 * tumpukan buang, tumpukan ambil, cincin warna aktif, penanda giliran,
 * kartu di tangan pemain lain (tertutup), dan bot.
 */
export class TableView {
  constructor(scene, table) {
    this.table = table;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    const c = new THREE.Vector3(table.x, table.y, table.z);
    this.center = c;

    this.pile = [];
    this.drawTop = makeCard(null);
    this.drawTop.scale.setScalar(TABLE_W);
    this.drawTop.rotation.set(-Math.PI / 2, 0, 0.2);
    this.drawBox = new THREE.Mesh(
      new THREE.BoxGeometry(TABLE_W * 0.98, 1, TABLE_W * 1.47),
      new THREE.MeshLambertMaterial({ color: '#d9dde6' })
    );
    this.drawBox.rotation.y = -0.2;
    // tumpukan ambil sedikit ke samping pusat meja
    const side = new THREE.Vector3(table.seats[1].x - table.x, 0, table.seats[1].z - table.z).normalize();
    this.drawSlot = new THREE.Vector3(table.x + side.x * 0.26, table.y, table.z + side.z * 0.26);
    this.pileSlot = new THREE.Vector3(table.x - side.x * 0.1, table.y, table.z - side.z * 0.1);
    this.drawTop.userData.isDrawPile = true;
    this.drawTop.userData.front.userData.isDrawPile = true;
    this.group.add(this.drawTop, this.drawBox);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 6, 28), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.copy(this.pileSlot).setY(table.y + 0.004);
    this.group.add(this.ring);

    this.marker = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), new THREE.MeshBasicMaterial({ color: '#ffe066' }));
    this.marker.rotation.x = -Math.PI / 2;
    this.group.add(this.marker);

    this.fans = new Map();
    this.bots = new Map();
    this.anim = null;
    this.lastEv = -1;
    this.time = 0;
  }

  seatPos(i) {
    return this.table.seats[i];
  }

  /** Posisi dunia tangan pemain di kursi i (asal animasi kartu). */
  handPos(i, out) {
    const s = this.seatPos(i);
    return out.set(s.x + Math.sin(s.rot) * 0.35, s.y + 0.65, s.z + Math.cos(s.rot) * 0.35);
  }

  update(dt, match, viewerId) {
    this.time += dt;
    const live = match && match.phase !== 'lobby';
    this.group.visible = !!match;
    if (!match) {
      this.clearBots();
      for (const f of this.fans.values()) f.group.removeFromParent();
      this.fans.clear();
      this.lastEv = -1;
      return;
    }
    const t = this.table;

    // ---- Tumpukan buang ----
    const discard = live ? match.discard || [] : [];
    while (this.pile.length < discard.length) {
      const card = makeCard(null);
      card.scale.setScalar(TABLE_W);
      this.group.add(card);
      this.pile.push(card);
    }
    this.pile.forEach((card, i) => {
      const id = discard[i];
      card.visible = !!id;
      if (!id) return;
      setCardFace(card, faceKey(id));
      const h = hash(id);
      card.rotation.set(-Math.PI / 2, 0, ((h % 100) / 100) * 0.9 - 0.45);
      card.userData.target = new THREE.Vector3(
        this.pileSlot.x + (((h >> 3) % 7) - 3) * 0.006,
        t.y + 0.002 + i * 0.0015,
        this.pileSlot.z + (((h >> 6) % 7) - 3) * 0.006
      );
      if (!(this.anim && this.anim.card === card)) card.position.copy(card.userData.target);
    });

    // animasi kartu terakhir yang dimainkan: dari tangan pemain ke meja
    const ev = match.ev;
    if (ev && ev.n !== this.lastEv) {
      if (this.lastEv !== -1 && (ev.k === 'play' || ev.k === 'win') && discard.length) {
        const idx = match.players.findIndex((p) => p.id === ev.p);
        const top = this.pile[discard.length - 1];
        if (idx >= 0 && top) {
          this.anim = { card: top, t: 0, from: this.handPos(idx, new THREE.Vector3()) };
        }
      }
      this.lastEv = ev.n;
    }
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / 0.35);
      const k = 1 - (1 - a.t) ** 3;
      a.card.position.lerpVectors(a.from, a.card.userData.target, k);
      a.card.position.y += Math.sin(k * Math.PI) * 0.12;
      if (a.t >= 1) this.anim = null;
    }

    // ---- Tumpukan ambil ----
    const n = live ? match.drawN || 0 : 0;
    const hgt = 0.004 + Math.min(n, 90) * 0.0011;
    this.drawBox.visible = this.drawTop.visible = live && n > 0;
    this.drawBox.scale.y = hgt;
    this.drawBox.position.set(this.drawSlot.x, t.y + hgt / 2, this.drawSlot.z);
    this.drawTop.position.set(this.drawSlot.x, t.y + hgt + 0.001, this.drawSlot.z);

    // ---- Cincin warna aktif & penanda giliran ----
    this.ring.visible = live && match.phase === 'play';
    if (match.color) this.ring.material.color.set(SUIT_INFO[match.color]?.color || '#ffffff');
    this.ring.scale.setScalar(1 + Math.sin(this.time * 4) * 0.04);
    const turnSeat = match.phase === 'play' ? this.seatPos(match.turn) : null;
    this.marker.visible = !!turnSeat;
    if (turnSeat) {
      this.marker.position.set(t.x + (turnSeat.x - t.x) * 0.55, t.y + 0.003, t.z + (turnSeat.z - t.z) * 0.55);
      this.marker.scale.setScalar(1 + Math.sin(this.time * 6) * 0.15);
    }

    // ---- Kartu tertutup di tangan pemain lain ----
    const seen = new Set();
    match.players.forEach((p, i) => {
      if (p.id === viewerId) return;
      seen.add(p.id);
      let f = this.fans.get(p.id);
      if (!f) {
        f = { group: new THREE.Group(), cards: [], badge: new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false })) };
        f.badge.scale.setScalar(0.11);
        f.badge.renderOrder = 5;
        f.group.add(f.badge);
        this.group.add(f.group);
        this.fans.set(p.id, f);
      }
      const s = this.seatPos(i);
      f.group.position.set(s.x + Math.sin(s.rot) * 0.36, s.y + 0.62, s.z + Math.cos(s.rot) * 0.36);
      f.group.rotation.set(0, s.rot + Math.PI, 0, 'YXZ');
      f.group.rotation.x = -0.35;
      const count = live ? match.hands?.[p.id]?.length || 0 : 0;
      const m = Math.min(count, MAX_FAN);
      while (f.cards.length < m) {
        const card = makeCard(null);
        card.scale.setScalar(FAN_W);
        f.group.add(card);
        f.cards.push(card);
      }
      f.cards.forEach((card, j) => {
        card.visible = j < m;
        const off = j - (m - 1) / 2;
        card.position.set(off * 0.028, -Math.abs(off) * 0.004, j * 0.0015);
        card.rotation.set(0, 0, -off * 0.12);
      });
      f.badge.visible = count > 0;
      if (count > 0) {
        f.badge.material.map = countTexture(count);
        f.badge.position.set(0, 0.16, 0.02);
      }
    });
    for (const [id, f] of this.fans) {
      if (!seen.has(id)) {
        f.group.removeFromParent();
        this.fans.delete(id);
      }
    }

    // ---- Bot ----
    const bots = new Set();
    match.players.forEach((p, i) => {
      if (!p.bot) return;
      bots.add(p.id);
      let b = this.bots.get(p.id);
      if (!b) {
        b = new CapsuleCharacter({ name: p.name, color: p.color, look: p.look, showName: true });
        this.group.add(b.root);
        this.bots.set(p.id, b);
      }
      const s = this.seatPos(i);
      b.root.position.set(s.x, s.y, s.z);
      b.root.rotation.y = s.rot;
      b.animate(dt, { speed: 0, grounded: true, swimming: false, vy: 0, sitting: true });
    });
    for (const [id, b] of this.bots) {
      if (!bots.has(id)) {
        b.dispose();
        this.bots.delete(id);
      }
    }
  }

  clearBots() {
    for (const b of this.bots.values()) b.dispose();
    this.bots.clear();
  }
}
