import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { CapsuleCharacter } from '../character/CapsuleCharacter.js';
import { dampAngle } from '../utils/math.js';

export const FLAG_GROUNDED = 1;
export const FLAG_SWIM = 2;

// Pemain yang dikendalikan perangkat ini. Fisika dihitung lokal (client-authoritative),
// lalu posisinya disiarkan ke pemain lain lewat Playroom.
export class LocalPlayer {
  constructor({ world, scene, net, name, color }) {
    this.world = world;
    this.net = net;
    this.character = new CapsuleCharacter({ name, color, showName: false });
    scene.add(this.character.root);

    this.position = world.spawnPoint();
    this.velocity = new THREE.Vector3();
    this.facing = Math.atan2(-this.position.x, -this.position.z); // menghadap api unggun
    this.grounded = true;
    this.swimming = false;
    this.speed = 0;
    this.sendTimer = 0;
    this.lastSent = '';
    this.keepAlive = 0;
    this._scratch = [];
    this.syncMesh();
  }

  respawn() {
    this.position.copy(this.world.spawnPoint());
    this.velocity.set(0, 0, 0);
  }

  update(dt, input, camRig) {
    const P = CONFIG.player;
    const w = this.world;
    const pos = this.position;
    const vel = this.velocity;

    // --- arah gerak relatif kamera ---
    const { fx, fz, rx, rz } = camRig.basis();
    let wx = fx * input.move.y + rx * input.move.x;
    let wz = fz * input.move.y + rz * input.move.x;
    const mag = Math.min(1, Math.hypot(wx, wz));
    if (mag > 0) {
      const l = Math.hypot(wx, wz);
      wx /= l;
      wz /= l;
    }

    const ground = w.getHeight(pos.x, pos.z);
    const deep = ground < w.waterLevel - 1.05;
    this.swimming = deep && pos.y <= w.waterLevel + 0.05;

    const wading = !this.swimming && ground < w.waterLevel - 0.3;
    let maxSpeed = this.swimming ? P.swimSpeed : input.run ? P.runSpeed : P.walkSpeed;
    if (wading) maxSpeed *= 0.7;
    const targetVX = wx * maxSpeed * mag;
    const targetVZ = wz * maxSpeed * mag;
    const accel = this.grounded || this.swimming ? 14 : 3.5;
    const k = 1 - Math.exp(-accel * dt);
    vel.x += (targetVX - vel.x) * k;
    vel.z += (targetVZ - vel.z) * k;

    // --- lompat & gravitasi ---
    const jump = input.consumeJump();
    if (jump && this.grounded) {
      vel.y = P.jumpVelocity;
      this.grounded = false;
    } else if (jump && this.swimming) {
      vel.y = P.jumpVelocity * 0.75;
      this.swimming = false;
    }

    if (this.swimming) {
      // mengapung di permukaan air
      vel.y = 0;
      pos.y += (w.waterLevel - pos.y) * Math.min(1, dt * 8);
    } else {
      vel.y -= P.gravity * dt;
    }

    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    pos.y += vel.y * dt;

    // --- tabrakan dengan pohon/batu/tenda ---
    w.colliders.resolve(pos, P.radius, this._scratch);

    // --- batas dunia ---
    const lim = w.half - 4;
    const r = Math.hypot(pos.x, pos.z);
    if (r > lim) {
      pos.x *= lim / r;
      pos.z *= lim / r;
    }

    // --- tanah ---
    const g = w.getHeight(pos.x, pos.z);
    if (!this.swimming) {
      if (g < w.waterLevel - 1.05 && pos.y <= w.waterLevel && vel.y <= 0) {
        // masuk ke air dalam
        this.swimming = true;
        vel.y = 0;
        this.grounded = false;
      } else if (pos.y <= g) {
        pos.y = g;
        if (vel.y < 0) vel.y = 0;
        this.grounded = true;
      } else if (this.grounded && vel.y <= 0 && pos.y - g < 0.35) {
        pos.y = g; // menempel saat menuruni bukit
        vel.y = 0;
      } else {
        this.grounded = false;
      }
    } else if (g >= w.waterLevel - 1.05) {
      // keluar dari air ke pantai
      this.swimming = false;
      pos.y = Math.max(pos.y, g);
      this.grounded = false;
    }

    if (pos.y < -20) this.respawn();

    // --- rotasi karakter mengikuti arah gerak ---
    this.speed = Math.hypot(vel.x, vel.z);
    if (this.speed > 0.4) {
      this.facing = dampAngle(this.facing, Math.atan2(vel.x, vel.z), 12, dt);
    }

    this.syncMesh();
    this.character.animate(dt, {
      speed: this.speed,
      grounded: this.grounded,
      swimming: this.swimming,
      vy: vel.y,
    });

    this.sendState(dt);
  }

  syncMesh() {
    this.character.root.position.copy(this.position);
    this.character.root.rotation.y = this.facing;
  }

  // Kirim posisi ~15x/detik lewat kanal unreliable (cepat, boleh hilang).
  sendState(dt) {
    this.sendTimer += dt;
    this.keepAlive += dt;
    if (this.sendTimer < 1 / CONFIG.net.sendRate) return;
    this.sendTimer = 0;
    const p = this.position;
    const flags = (this.grounded ? FLAG_GROUNDED : 0) | (this.swimming ? FLAG_SWIM : 0);
    const data = [
      round2(p.x), round2(p.y), round2(p.z),
      round2(this.facing), Math.round(this.speed * 10) / 10, flags,
    ];
    const sig = data.join(',');
    if (sig === this.lastSent && this.keepAlive < 1) return;
    this.lastSent = sig;
    this.keepAlive = 0;
    data.push(Math.round(performance.now()));
    this.net.me.setState('m', data, false);
  }

  setProfile(name, color) {
    this.character.setProfile(name, color);
  }

  say(text) {
    this.character.showChat(text);
  }

}

const round2 = (v) => Math.round(v * 100) / 100;
