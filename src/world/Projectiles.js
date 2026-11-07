import * as THREE from 'three';

const BALL_GEO = new THREE.IcosahedronGeometry(0.11, 0);
const DROP_GEO = new THREE.IcosahedronGeometry(0.05, 0);
const BALL_MAT = new THREE.MeshLambertMaterial({ color: '#4dabf7', emissive: '#1c5d8f', flatShading: true, transparent: true, opacity: 0.85 });
const SPEED = 24;
const GRAVITY = 9;

/**
 * Semprotan pistol air. Yang menembak (lokal) yang memeriksa kena/tidak
 * (client-authoritative); semprotan dari pemain lain hanya visual.
 */
export class Projectiles {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.balls = [];
    this.drops = [];
    this._scratch = [];
  }

  spawn(origin, dir, local) {
    let b = this.balls.find((x) => !x.alive);
    if (!b) {
      b = { mesh: new THREE.Mesh(BALL_GEO, BALL_MAT), vel: new THREE.Vector3() };
      this.balls.push(b);
      this.scene.add(b.mesh);
    }
    b.alive = true;
    b.local = local;
    b.life = 1.3;
    b.mesh.visible = true;
    b.mesh.position.copy(origin);
    b.vel.copy(dir).normalize().multiplyScalar(SPEED);
  }

  splash(x, y, z) {
    for (let i = 0; i < 7; i++) {
      let d = this.drops.find((p) => !p.alive);
      if (!d) {
        d = { mesh: new THREE.Mesh(DROP_GEO, BALL_MAT), vel: new THREE.Vector3() };
        this.drops.push(d);
        this.scene.add(d.mesh);
      }
      d.alive = true;
      d.life = 0.35 + Math.random() * 0.2;
      d.mesh.visible = true;
      d.mesh.position.set(x, y, z);
      d.vel.set((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4);
    }
    this.onSplash?.(x, y, z);
  }

  /**
   * @param {number} dt
   * @param {Iterable<{id:string, hasPose:boolean, render:{x,y,z}, character:{height:number}}>} targets
   * @param {(id:string, dx:number, dz:number) => void} onHit
   */
  update(dt, targets, onHit) {
    const w = this.world;
    for (const b of this.balls) {
      if (!b.alive) continue;
      b.life -= dt;
      b.vel.y -= GRAVITY * dt;
      const p = b.mesh.position;
      p.addScaledVector(b.vel, dt);
      let hit = b.life <= 0;
      const ground = w.getHeight(p.x, p.z);
      if (!hit && (p.y < ground || (p.y < w.waterLevel && ground < w.waterLevel))) hit = true;
      if (!hit) {
        for (const c of w.colliders.query(p.x, p.z, 0.3, this._scratch)) {
          const top = Number.isFinite(c.top) ? c.top : ground + 4;
          if (p.y < top && Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.12) {
            hit = true;
            break;
          }
        }
      }
      if (!hit && b.local) {
        for (const t of targets) {
          if (!t.hasPose) continue;
          const r = t.render;
          if (Math.hypot(p.x - r.x, p.z - r.z) < 0.6 && p.y > r.y - 0.1 && p.y < r.y + t.character.height + 0.1) {
            const len = Math.hypot(b.vel.x, b.vel.z) || 1;
            onHit(t.id, b.vel.x / len, b.vel.z / len);
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        b.alive = false;
        b.mesh.visible = false;
        if (b.life > 0) this.splash(p.x, Math.max(p.y, ground), p.z);
      }
    }
    for (const d of this.drops) {
      if (!d.alive) continue;
      d.life -= dt;
      d.vel.y -= 14 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      if (d.life <= 0) {
        d.alive = false;
        d.mesh.visible = false;
      }
    }
  }
}
