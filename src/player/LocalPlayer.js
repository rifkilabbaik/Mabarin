import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Character } from '../character/Character.js';
import { dampAngle } from '../utils/math.js';

export const FLAG_GROUNDED = 1;
export const FLAG_SWIM = 2;
export const FLAG_SIT = 4;
export const FLAG_SLIDE = 8;
export const FLAG_DASH = 16;

// Pemain yang dikendalikan perangkat ini. Fisika dihitung lokal (client-authoritative),
// lalu posisinya disiarkan ke pemain lain lewat Playroom.
export class LocalPlayer {
  constructor({ world, scene, net, name, color, look, onSfx }) {
    this.world = world;
    this.net = net;
    this.onSfx = onSfx; // (nama, opsi) => void — langkah, lompat, mendarat, cipratan
    this.character = new Character({ name, color, look, showName: false });
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
    this.seat = null; // tempat duduk yang sedang dipakai
    this.stunT = 0; // sisa waktu terpental (input diabaikan)
    this.dashT = 0;
    this.slideT = 0;
    this.dashCd = 0;
    this.slideCd = 0;
    this.gaze = { yaw: 0, pitch: 0 };
    this.immune = false;
    this.speedMul = 1; // pengali kecepatan (mis. saat menggiring bola)
    this.lastStepPhase = 0;
    this.syncMesh();
  }

  respawn() {
    this.position.copy(this.world.spawnPoint());
    this.velocity.set(0, 0, 0);
    this.seat = null;
  }

  get sitting() {
    return !!this.seat;
  }

  sit(seat) {
    this.seat = seat;
    this.position.set(seat.x, seat.y, seat.z);
    this.velocity.set(0, 0, 0);
    this.facing = seat.rot;
    this.grounded = true;
    this.swimming = false;
    this.onSfx?.('sit');
  }

  stand() {
    if (!this.seat) return;
    const s = this.seat;
    this.seat = null;
    // turun dari kursi ke arah depan
    this.position.x = s.x + Math.sin(s.rot) * 0.75;
    this.position.z = s.z + Math.cos(s.rot) * 0.75;
    this.position.y = Math.max(this.world.getHeight(this.position.x, this.position.z), s.y - 0.4);
    this.grounded = false;
    this.onSfx?.('stand');
  }

  /** Terpental kena bonk. (dx,dz) arah dorongan ternormalisasi. */
  knockback(dx, dz, power) {
    if (this.seat?.locked || this.immune) return; // sedang main game meja / pertandingan
    if (this.seat) this.stand();
    const p = Math.min(power, 13);
    this.velocity.x = dx * p;
    this.velocity.z = dz * p;
    this.velocity.y = 4.5 + p * 0.3;
    this.grounded = false;
    this.swimming = false;
    this.stunT = 0.55;
  }

  /** Dash: dorongan cepat ke arah gerak/hadap. */
  dash() {
    if (this.seat || this.dashCd > 0 || this.swimming || this.stunT > 0) return false;
    const a = this.facing;
    this.velocity.x = Math.sin(a) * 15;
    this.velocity.z = Math.cos(a) * 15;
    this.dashT = 0.2;
    this.dashCd = CONFIG.player.dashCooldown;
    this.onSfx?.('dash');
    return true;
  }

  /** Sleding: meluncur rendah saat berlari. */
  slide() {
    if (this.seat || this.slideCd > 0 || !this.grounded || this.swimming || this.speed < 3) return false;
    const a = this.facing;
    const sp = Math.max(this.speed, 10.5);
    this.velocity.x = Math.sin(a) * sp;
    this.velocity.z = Math.cos(a) * sp;
    this.slideT = 0.6;
    this.slideCd = CONFIG.player.slideCooldown;
    this.onSfx?.('slide');
    return true;
  }

  update(dt, input, camRig) {
    const P = CONFIG.player;
    const w = this.world;
    const pos = this.position;
    const vel = this.velocity;
    this.dashT = Math.max(0, this.dashT - dt);
    this.slideT = Math.max(0, this.slideT - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.slideCd = Math.max(0, this.slideCd - dt);

    if (this.seat) {
      const jump = input.consumeJump();
      const wantsUp = !this.seat.locked && (Math.hypot(input.move.x, input.move.y) > 0.3 || jump);
      if (wantsUp) this.stand();
      else {
        this.speed = 0;
        pos.set(this.seat.x, this.seat.y, this.seat.z);
        this.facing = this.seat.rot;
        this.syncMesh();
        this.character.animate(dt, { speed: 0, grounded: true, swimming: false, vy: 0, sitting: true });
        this.sendState(dt);
        return;
      }
    }
    this.stunT = Math.max(0, this.stunT - dt);
    const stunned = this.stunT > 0;

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
    maxSpeed *= this.speedMul;
    const coasting = stunned || this.slideT > 0 || this.dashT > 0;
    const targetVX = coasting ? vel.x * 0.6 : wx * maxSpeed * mag;
    const targetVZ = coasting ? vel.z * 0.6 : wz * maxSpeed * mag;
    const accel = this.dashT > 0 ? 0 : this.slideT > 0 ? 1.6 : stunned ? 1.5 : this.grounded || this.swimming ? 14 : 3.5;
    const k = 1 - Math.exp(-accel * dt);
    vel.x += (targetVX - vel.x) * k;
    vel.z += (targetVZ - vel.z) * k;

    // --- lompat & gravitasi ---
    const jump = input.consumeJump() && !stunned && this.slideT <= 0;
    if (jump && (this.grounded || this.swimming)) this.onSfx?.('jump');
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
    const wasGrounded = this.grounded;
    const fallSpeed = vel.y;
    if (!this.swimming) {
      if (g < w.waterLevel - 1.05 && pos.y <= w.waterLevel && vel.y <= 0) {
        // masuk ke air dalam
        this.swimming = true;
        vel.y = 0;
        this.grounded = false;
        this.onSfx?.('splash');
      } else if (pos.y <= g) {
        pos.y = g;
        if (vel.y < 0) vel.y = 0;
        this.grounded = true;
        if (!wasGrounded && fallSpeed < -6) {
          this.onSfx?.(g < w.waterLevel ? 'splash' : 'land', { strength: Math.min(1, -fallSpeed / 14) });
        }
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
    if (this.speed > 0.4 && this.slideT <= 0) {
      this.facing = dampAngle(this.facing, Math.atan2(vel.x, vel.z), 12, dt);
    }

    this.syncMesh();
    this.character.animate(dt, {
      speed: this.speed,
      grounded: this.grounded,
      swimming: this.swimming,
      vy: vel.y,
      sliding: this.slideT > 0,
      dashing: this.dashT > 0,
    });

    // Bunyi langkah tiap kaki "menapak" (fase animasi melewati kelipatan π)
    const ph = this.character.phase;
    if (this.grounded && this.speed > 1.2 && Math.floor(ph / Math.PI) !== Math.floor(this.lastStepPhase / Math.PI)) {
      const surface = g < w.waterLevel - 0.2 ? 'water' : g < 1.1 ? 'sand' : 'grass';
      this.onSfx?.('step', { surface, volume: this.speed > 6 ? 1 : 0.7 });
    }
    this.lastStepPhase = ph;

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
    const flags = (this.grounded ? FLAG_GROUNDED : 0) | (this.swimming ? FLAG_SWIM : 0) | (this.seat ? FLAG_SIT : 0)
      | (this.slideT > 0 ? FLAG_SLIDE : 0) | (this.dashT > 0 ? FLAG_DASH : 0);
    const data = [
      round2(p.x), round2(p.y), round2(p.z),
      round2(this.facing), Math.round(this.speed * 10) / 10, flags,
    ];
    // arah kepala (mis. saat duduk di meja game) — dikirim setelah cap waktu
    const gy = Math.round((this.gaze?.yaw || 0) * 20) / 20, gp = Math.round((this.gaze?.pitch || 0) * 20) / 20;
    const sig = data.join(',') + `|${gy},${gp}`;
    if (sig === this.lastSent && this.keepAlive < 1) return;
    this.lastSent = sig;
    this.keepAlive = 0;
    data.push(Math.round(performance.now()), gy, gp);
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
