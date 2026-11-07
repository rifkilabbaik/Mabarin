import * as THREE from 'three';
import { ITEMS, getItem, chairMesh } from '../character/items.js';
import { MAX_CHAIRS_PER_PLAYER } from '../world/Seats.js';
import { clamp } from '../utils/math.js';

const r2 = (v) => Math.round(v * 100) / 100;
const finite = (...v) => v.every((x) => Number.isFinite(x));

/**
 * Logika item di hotbar untuk pemain lokal + reaksi terhadap aksi pemain lain.
 * Semua "kena/tidak" dihitung oleh penyerang lalu dikirim lewat event 'bonk'.
 */
export class ItemController {
  constructor({ scene, world, camera, camRig, audio, projectiles, seats, hotbar }) {
    this.world = world;
    this.camera = camera;
    this.camRig = camRig;
    this.audio = audio;
    this.projectiles = projectiles;
    this.seats = seats;
    this.hotbar = hotbar;
    this.slot = 0;
    this.cooldown = 0;
    this.chord = 0;
    this.myChairs = [];
    this.pending = [];
    this.immuneT = 0;
    this.promptT = 0;
    this.enabled = true;

    const ghostMat = new THREE.MeshLambertMaterial({ color: '#69db7c', transparent: true, opacity: 0.45, depthWrite: false });
    this.ghost = chairMesh();
    this.ghost.material = ghostMat;
    this.ghost.castShadow = false;
    this.ghost.visible = false;
    scene.add(this.ghost);
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();

    projectiles.onSplash = (x, y, z) => this.audio.playAt('drip', x, z, { volume: 0.7 });
  }

  attach(local, net, remotes) {
    this.local = local;
    this.net = net;
    this.remotes = remotes;
    net.onEvent('act', (p, from) => this.onAct(p, from));
    net.onEvent('bonk', (p) => this.onBonk(p));
    this.select(0, true);
  }

  get item() {
    return ITEMS[this.slot];
  }

  select(i, silent = false) {
    if (!this.local || i < 0 || i >= ITEMS.length) return;
    this.slot = i;
    const id = ITEMS[i].id;
    this.local.character.setItem(id);
    this.net.me.setState('item', id, true);
    this.hotbar.setSelected(i);
    this.camRig.aimMode = id === 'watergun';
    if (!silent) this.audio.play('click');
  }

  // ---------- Pakai item ----------
  use() {
    const L = this.local;
    if (!L || !this.enabled || this.cooldown > 0) return;
    const item = this.item;
    if (L.sitting && item.id !== 'guitar' && item.id !== 'hand') L.stand();
    this.cooldown = item.cooldown;
    const ch = L.character;

    switch (item.id) {
      case 'hand':
        ch.playAction('wave');
        this.audio.play('wave');
        this.send('act', { k: 'wave' });
        break;
      case 'hammer':
      case 'sword': {
        const kind = item.id === 'hammer' ? 'swing' : 'slash';
        ch.playAction(kind);
        this.audio.play('whoosh');
        this.send('act', { k: kind });
        this.pending.push({ t: item.id === 'hammer' ? 0.15 : 0.1, item });
        break;
      }
      case 'watergun':
        this.shoot();
        break;
      case 'chair':
        this.chairAction();
        break;
      case 'guitar':
        ch.playAction('strum');
        this.audio.strum(this.chord);
        this.send('act', { k: 'strum', c: this.chord });
        this.chord = (this.chord + 1) % 4;
        break;
    }
  }

  send(name, payload) {
    this.net.sendEvent(name, payload);
  }

  meleeHit(item) {
    const L = this.local;
    const fx = Math.sin(L.facing), fz = Math.cos(L.facing);
    let hits = 0;
    for (const rp of this.remotes.values()) {
      if (!rp.hasPose || rp.sitting || rp.busy) continue; // pemain yang duduk / sedang main game tidak bisa di-bonk
      const dx = rp.render.x - L.position.x, dz = rp.render.z - L.position.z;
      const d = Math.hypot(dx, dz);
      if (d > item.reach + 0.35 || Math.abs(rp.render.y - L.position.y) > 1.6) continue;
      if (d > 0.6 && (dx * fx + dz * fz) / d < Math.cos(item.arc)) continue;
      const nx = d > 0.01 ? dx / d : fx, nz = d > 0.01 ? dz / d : fz;
      this.hitRemote(rp, nx, nz, item);
      hits++;
    }
    if (hits) this.camRig.shake(0.12);
  }

  hitRemote(rp, dx, dz, item) {
    this.send('bonk', { to: rp.id, dx: r2(dx), dz: r2(dz), p: item.power, w: item.id });
    rp.character.dizzy(item.id === 'watergun' ? 1 : 1.6);
    this.audio.playAt(item.id === 'watergun' ? 'drip' : 'bonk', rp.render.x, rp.render.z);
  }

  shoot() {
    const L = this.local;
    L.facing = this.camRig.yaw + Math.PI; // hadap ke arah bidikan
    L.syncMesh();
    L.character.playAction('shoot');
    L.character.root.updateMatrixWorld(true);
    const origin = L.character.muzzleWorld(this._v);
    this.camera.getWorldDirection(this._d);
    const target = this._d.clone().multiplyScalar(this.camRig.currentDistance + 30).add(this.camera.position);
    const dir = target.sub(origin).normalize();
    this.projectiles.spawn(origin, dir, true);
    this.audio.play('pew');
    this.send('act', { k: 'shoot', o: [r2(origin.x), r2(origin.y), r2(origin.z)], d: [r2(dir.x), r2(dir.y), r2(dir.z)] });
  }

  placementSpot() {
    const L = this.local;
    const x = L.position.x + Math.sin(L.facing) * 1.3;
    const z = L.position.z + Math.cos(L.facing) * 1.3;
    const g = this.world.getHeight(x, z);
    const ok = g > this.world.waterLevel - 0.3 && this.world.colliders.isFree(x, z, 0.35) && Math.hypot(x, z) < this.world.half - 6;
    return { x, z, y: g, rot: L.facing + Math.PI, ok };
  }

  ownChairNear() {
    const p = this.local.position;
    let best = -1, bestD = 1.7;
    this.myChairs.forEach(([x, z], i) => {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < bestD) { best = i; bestD = d; }
    });
    return best;
  }

  chairAction() {
    const near = this.ownChairNear();
    if (near >= 0) {
      this.myChairs.splice(near, 1);
      this.audio.play('pickup');
    } else {
      const s = this.placementSpot();
      if (!s.ok) {
        this.hotbar.flash('Tidak bisa menaruh kursi di sini');
        return;
      }
      this.myChairs.push([r2(s.x), r2(s.z), r2(s.rot)]);
      while (this.myChairs.length > MAX_CHAIRS_PER_PLAYER) this.myChairs.shift();
      this.audio.play('place');
    }
    this.net.me.setState('chairs', [...this.myChairs], true);
  }

  // ---------- Duduk ----------
  isTaken(seat) {
    for (const rp of this.remotes.values()) {
      if (rp.sitting && Math.hypot(rp.render.x - seat.x, rp.render.z - seat.z) < 0.35) return true;
    }
    return false;
  }

  interact() {
    const L = this.local;
    if (!L || !this.enabled) return;
    if (L.sitting) {
      L.stand();
      return;
    }
    const seat = this.seats.nearest(L.position.x, L.position.z, 1.8, (s) => this.isTaken(s));
    if (seat) L.sit(seat);
  }

  // ---------- Event dari pemain lain ----------
  onAct(p, from) {
    const rp = this.remotes.get(from);
    if (!rp || !p || typeof p.k !== 'string') return;
    const { x, z } = rp.render;
    switch (p.k) {
      case 'wave':
        rp.character.playAction('wave');
        this.audio.playAt('wave', x, z, { volume: 0.6 });
        break;
      case 'swing':
      case 'slash':
        rp.character.playAction(p.k);
        this.audio.playAt('whoosh', x, z);
        break;
      case 'shoot':
        rp.character.playAction('shoot');
        if (Array.isArray(p.o) && Array.isArray(p.d) && finite(...p.o, ...p.d)) {
          this.projectiles.spawn(this._v.fromArray(p.o), this._d.fromArray(p.d), false);
        }
        this.audio.playAt('pew', x, z, { volume: 0.7 });
        break;
      case 'kick':
      case 'racket':
        rp.character.playAction(p.k);
        if (p.k === 'racket') this.audio.playAt('whoosh', x, z, { volume: 0.4 });
        break;
      case 'dash':
        this.audio.playAt('dash', x, z, { volume: 0.6 });
        break;
      case 'strum':
        rp.character.playAction('strum');
        this.audio.strum(Number(p.c) || 0, x, z);
        break;
    }
  }

  onBonk(p) {
    if (!p || !finite(p.dx, p.dz, p.p)) return;
    const len = Math.hypot(p.dx, p.dz) || 1;
    const dx = p.dx / len, dz = p.dz / len;
    const power = clamp(p.p, 0, 12);
    const water = p.w === 'watergun';
    if (p.to === this.net.me.id) {
      if (this.immuneT > 0) return;
      this.immuneT = 0.45;
      this.local.knockback(dx, dz, power);
      this.local.character.dizzy(water ? 1 : 1.6);
      this.audio.play(water ? 'drip' : 'bonk');
      this.camRig.shake(water ? 0.12 : 0.3);
    } else {
      const rp = this.remotes.get(p.to);
      if (!rp) return;
      rp.character.dizzy(water ? 1 : 1.6);
      this.audio.playAt(water ? 'drip' : 'bonk', rp.render.x, rp.render.z);
    }
  }

  // ---------- Tiap frame ----------
  update(dt, isTouch) {
    const L = this.local;
    if (!L) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.immuneT = Math.max(0, this.immuneT - dt);

    for (const h of this.pending) h.t -= dt;
    while (this.pending.length && this.pending[0].t <= 0) this.meleeHit(this.pending.shift().item);

    this.projectiles.update(dt, this.remotes.values(), (id, dx, dz) => {
      const rp = this.remotes.get(id);
      if (rp && !rp.sitting && !rp.busy) this.hitRemote(rp, dx, dz, getItem('watergun'));
    });

    // Bayangan kursi saat memegang kursi
    const holdingChair = this.item.id === 'chair' && !L.sitting;
    const nearOwn = holdingChair ? this.ownChairNear() : -1;
    if (holdingChair && nearOwn < 0) {
      const s = this.placementSpot();
      this.ghost.visible = true;
      this.ghost.position.set(s.x, s.y, s.z);
      this.ghost.rotation.y = s.rot;
      this.ghost.material.color.set(s.ok ? '#69db7c' : '#ff6b6b');
    } else this.ghost.visible = false;

    // Petunjuk kontekstual (duduk / berdiri / ambil kursi)
    this.promptT -= dt;
    if (this.promptT <= 0) {
      this.promptT = 0.15;
      let interact = null;
      if (L.sitting) interact = 'Berdiri';
      else if (this.seats.nearest(L.position.x, L.position.z, 1.8, (s) => this.isTaken(s))) interact = 'Duduk';
      let useLabel = this.item.action;
      if (this.item.id === 'chair') useLabel = nearOwn >= 0 ? 'Ambil kursi' : 'Taruh kursi';
      this.hotbar.setContext({ interact, useLabel, isTouch });
    }
  }
}
