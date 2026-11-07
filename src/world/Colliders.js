// Spatial hash sederhana untuk collider lingkaran (pohon, batu, tenda, dll).
export class Colliders {
  constructor(cellSize = 4) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.list = [];
  }

  key(cx, cz) {
    return cx * 73856093 ^ cz * 19349663;
  }

  add(x, z, r, top = Infinity) {
    const c = { x, z, r, top };
    this.list.push(c);
    const cs = this.cellSize;
    const x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs);
    const z0 = Math.floor((z - r) / cs), z1 = Math.floor((z + r) / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        let arr = this.cells.get(k);
        if (!arr) this.cells.set(k, (arr = []));
        arr.push(c);
      }
    }
    return c;
  }

  query(x, z, r, out = []) {
    out.length = 0;
    const cs = this.cellSize;
    const x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs);
    const z0 = Math.floor((z - r) / cs), z1 = Math.floor((z + r) / cs);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.cells.get(this.key(cx, cz));
        if (!arr) continue;
        for (const c of arr) if (!out.includes(c)) out.push(c);
      }
    }
    return out;
  }

  // Cek apakah area kosong (dipakai saat menyebar props).
  isFree(x, z, r) {
    const near = this.query(x, z, r + 2);
    for (const c of near) {
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < (r + c.r) ** 2) return false;
    }
    return true;
  }

  // Dorong lingkaran (x,z,r) keluar dari semua collider. y = posisi kaki, untuk collider yang bisa dipanjat (top).
  resolve(pos, r, scratch = []) {
    const near = this.query(pos.x, pos.z, r, scratch);
    let hit = false;
    for (const c of near) {
      if (pos.y >= c.top) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const minD = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD * minD) {
        const d = Math.sqrt(d2) || 0.0001;
        const push = minD - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
        hit = true;
      }
    }
    return hit;
  }
}
