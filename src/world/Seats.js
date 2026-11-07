import { chairMesh, CHAIR_SEAT_HEIGHT } from '../character/items.js';

export const MAX_CHAIRS_PER_PLAYER = 3;

/**
 * Tempat duduk: bangku api unggun (tetap) + kursi yang ditaruh pemain
 * (disimpan di player state 'chairs' milik masing-masing pemain).
 */
export class Seats {
  constructor(world) {
    this.world = world;
    this.static = [];
    for (const b of world.props.markers.benches) {
      const ax = Math.sin(b.a), az = -Math.cos(b.a); // arah memanjang bangku
      const rot = Math.atan2(-Math.cos(b.a), -Math.sin(b.a)); // menghadap api unggun
      for (const k of [-0.5, 0.5]) {
        this.static.push({ key: `bench:${this.static.length}`, x: b.x + ax * k, z: b.z + az * k, y: b.y, rot });
      }
    }
    this.chairs = new Map(); // key -> { mesh, seat }
  }

  /** @param {{owner:string, chairs:number[][]}[]} lists */
  syncChairs(lists) {
    const seen = new Set();
    for (const { owner, chairs } of lists) {
      if (!Array.isArray(chairs)) continue;
      for (const c of chairs.slice(0, MAX_CHAIRS_PER_PLAYER)) {
        if (!Array.isArray(c) || c.length < 3 || !c.every(Number.isFinite)) continue;
        const [x, z, rot] = c;
        if (Math.hypot(x, z) > this.world.half) continue;
        const key = `${owner}:${x.toFixed(2)},${z.toFixed(2)},${rot.toFixed(2)}`;
        seen.add(key);
        if (this.chairs.has(key)) continue;
        const ground = this.world.getHeight(x, z);
        const mesh = chairMesh();
        mesh.position.set(x, ground, z);
        mesh.rotation.y = rot;
        this.world.scene.add(mesh);
        this.chairs.set(key, { mesh, seat: { key, owner, x, z, y: ground + CHAIR_SEAT_HEIGHT, rot } });
      }
    }
    for (const [key, c] of this.chairs) {
      if (!seen.has(key)) {
        c.mesh.removeFromParent();
        this.chairs.delete(key);
      }
    }
  }

  all() {
    const out = [...this.static];
    for (const c of this.chairs.values()) out.push(c.seat);
    return out;
  }

  /** Kursi/bangku kosong terdekat dalam jarak maxDist. isTaken(seat) => bool */
  nearest(x, z, maxDist, isTaken) {
    let best = null, bestD = maxDist;
    for (const s of this.all()) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bestD && !isTaken?.(s)) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }
}
