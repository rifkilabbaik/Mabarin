import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp } from '../utils/math.js';

// Kamera orbit orang-ketiga yang tidak menembus terrain.
export class ThirdPersonCamera {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    const c = CONFIG.camera;
    this.yaw = Math.PI;
    this.pitch = 0.35;
    this.distance = c.distance;
    this.targetDistance = c.distance;
    this.currentDistance = c.distance;
    this.focus = new THREE.Vector3();
    this.initialized = false;
    this.aimMode = false; // kamera geser ke bahu saat membidik pistol air
    this.aimBlend = 0;
    this.shakeT = 0;
    this.shakeAmp = 0;
    this._offset = new THREE.Vector3();
    this._probe = new THREE.Vector3();
  }

  applyInput({ yaw, pitch, zoom }) {
    const c = CONFIG.camera;
    this.yaw += yaw;
    this.pitch = clamp(this.pitch + pitch, c.minPitch, c.maxPitch);
    this.targetDistance = clamp(this.targetDistance + zoom, c.minDistance, c.maxDistance);
  }

  // Arah horizontal "maju" & "kanan" dari sudut pandang kamera.
  basis() {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return { fx: -s, fz: -c, rx: c, rz: -s };
  }

  shake(amount) {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeT = 0.3;
  }

  update(dt, target) {
    this.aimBlend = damp(this.aimBlend, this.aimMode ? 1 : 0, 8, dt);
    const sh = this.aimBlend;
    const goal = this._probe.set(
      target.x + Math.cos(this.yaw) * 0.85 * sh,
      target.y + 1.35 + 0.25 * sh,
      target.z - Math.sin(this.yaw) * 0.85 * sh
    );
    if (!this.initialized) {
      this.focus.copy(goal);
      this.initialized = true;
    } else {
      this.focus.x = damp(this.focus.x, goal.x, 14, dt);
      this.focus.y = damp(this.focus.y, goal.y, 9, dt);
      this.focus.z = damp(this.focus.z, goal.z, 14, dt);
    }
    this.distance = damp(this.distance, this.targetDistance, 10, dt);

    const cp = Math.cos(this.pitch);
    const dir = this._offset.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // Jika terhalang bukit, perpendek jarak kamera.
    let allowed = this.distance;
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const d = (this.distance * i) / steps;
      const px = this.focus.x + dir.x * d;
      const py = this.focus.y + dir.y * d;
      const pz = this.focus.z + dir.z * d;
      if (py < this.world.getHeight(px, pz) + 0.45) {
        allowed = Math.max(1.2, (this.distance * (i - 1)) / steps);
        break;
      }
    }
    // Mendekat cepat, menjauh pelan (hindari kamera "melompat").
    this.currentDistance = allowed < this.currentDistance ? allowed : damp(this.currentDistance, allowed, 4, dt);

    const cam = this.camera;
    cam.position.copy(this.focus).addScaledVector(dir, this.currentDistance);
    const minY = Math.max(this.world.getHeight(cam.position.x, cam.position.z), this.world.waterLevel) + 0.35;
    if (cam.position.y < minY) cam.position.y = minY;
    cam.lookAt(this.focus);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT / 0.3);
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
  }
}
