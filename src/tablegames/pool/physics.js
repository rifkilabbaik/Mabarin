// Fisika bola pool 2D di atas kain meja.
// Koordinat meja: x sepanjang meja (-L/2..L/2), z melebar (-W/2..W/2), satuan meter.
// Hanya memakai + - * / dan Math.sqrt agar hasil simulasi identik di semua perangkat
// (semua pemain mensimulasikan pukulan yang sama dari state awal yang sama).

// Meja 9 kaki: permukaan main 100 × 50 inci (2.54 × 1.27 m).
export const L = 2.54;
export const W = 1.27;
export const R = 0.03;
export const HEAD_X = -L / 4; // titik kepala (bola putih)
export const FOOT_X = L / 4; // titik kaki (susunan bola)
export const MAX_SPEED = 7.0;
const DT = 1 / 300; // langkah kecil: bola tercepat bergerak < R per langkah (tidak menembus bantalan)
const ROLL = 0.32; // perlambatan gulir (m/s²)
const DRAG = 0.16; // perlambatan sebanding kecepatan
const BALL_E = 0.95;
const RAIL_E = 0.72;

// ---------- Lubang & bantalan ----------
// Mulut lubang = jarak antar ujung jaw. Jaw sedikit menyempit ke arah lubang.
const CORNER_MOUTH = 0.125;
const SIDE_MOUTH = 0.135;
const CORNER_JAW = 0.06;
const SIDE_JAW = 0.05;
const DROP = 0.012; // bola jatuh setelah pusatnya melewati garis mulut sejauh ini
const RAIL_JAW_E = 0.6;

const seg = (ax, az, bx, bz, rail) => {
  const dx = bx - ax, dz = bz - az;
  const len = Math.sqrt(dx * dx + dz * dz);
  return { ax, az, ux: dx / len, uz: dz / len, len, rail };
};

/** Lubang: titik mulut A & B (di garis bantalan), arah ke dalam lubang, lubang 3D untuk tampilan. */
function makePockets() {
  const c = CORNER_MOUTH / Math.SQRT2, hs = SIDE_MOUTH / 2;
  const list = [];
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      // sudut: A di rel panjang, B di rel pendek
      const ax = sx * (L / 2 - c), az = (sz * W) / 2, bx = (sx * L) / 2, bz = sz * (W / 2 - c);
      list.push({ corner: true, ax, az, bx, bz, nx: sx * Math.SQRT1_2, nz: sz * Math.SQRT1_2, jawA: [sx * 0.766, sz * 0.643], jawB: [sx * 0.643, sz * 0.766], jaw: CORNER_JAW, hole: 0.068, holeIn: 0.05 });
    }
    // tengah rel panjang
    list.push({ corner: false, ax: -hs, az: (sz * W) / 2, bx: hs, bz: (sz * W) / 2, nx: 0, nz: sz, jawA: [0.242, sz * 0.97], jawB: [-0.242, sz * 0.97], jaw: SIDE_JAW, hole: 0.064, holeIn: 0.04 });
  }
  // urutan tetap: kiri-belakang, tengah-belakang, kanan-belakang, kiri-depan, tengah-depan, kanan-depan
  const order = [0, 2, 1, 3, 5, 4];
  return order.map((k) => {
    const p = list[k];
    const mx = (p.ax + p.bx) / 2, mz = (p.az + p.bz) / 2;
    return {
      ...p,
      mx,
      mz,
      tx: (p.bx - p.ax) / Math.sqrt((p.bx - p.ax) ** 2 + (p.bz - p.az) ** 2),
      tz: (p.bz - p.az) / Math.sqrt((p.bx - p.ax) ** 2 + (p.bz - p.az) ** 2),
      half: Math.sqrt((p.bx - p.ax) ** 2 + (p.bz - p.az) ** 2) / 2,
      // sasaran bidik bot & titik lubang 3D
      x: mx + p.nx * 0.02,
      z: mz + p.nz * 0.02,
      hx: mx + p.nx * p.holeIn,
      hz: mz + p.nz * p.holeIn,
      r: p.hole,
    };
  });
}
export const POCKETS = makePockets();

/** Segmen bantalan (garis hidung bantalan) + jaw di setiap mulut lubang. */
function makeCushions() {
  const c = CORNER_MOUTH / Math.SQRT2, hs = SIDE_MOUTH / 2;
  const out = [];
  for (const sz of [-1, 1]) {
    const z = (sz * W) / 2;
    out.push(seg(-L / 2 + c, z, -hs, z, true), seg(hs, z, L / 2 - c, z, true));
  }
  for (const sx of [-1, 1]) {
    const x = (sx * L) / 2;
    out.push(seg(x, -W / 2 + c, x, W / 2 - c, true));
  }
  for (const p of POCKETS) {
    out.push(seg(p.ax, p.az, p.ax + p.jawA[0] * p.jaw, p.az + p.jawA[1] * p.jaw, false));
    out.push(seg(p.bx, p.bz, p.bx + p.jawB[0] * p.jaw, p.bz + p.jawB[1] * p.jaw, false));
  }
  return out;
}
export const CUSHIONS = makeCushions();

export const RED = 'red';
export const BLUE = 'blue';
export const colorOfBall = (id) => (id === 0 ? 'cue' : id === 8 ? 'eight' : id < 8 ? RED : BLUE);

/** Susunan awal. count: 15 (segitiga) atau 9 (belah ketupat). rnd: fungsi acak 0..1. */
export function rack(count, rnd = Math.random) {
  const reds = count === 9 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7];
  const blues = count === 9 ? [9, 10, 11, 12] : [9, 10, 11, 12, 13, 14, 15];
  const dx = R * Math.sqrt(3) + 0.0004;
  const dz = R * 2 + 0.0004;
  const spots = [];
  if (count === 9) {
    const rows = [1, 2, 3, 2, 1];
    rows.forEach((n, k) => {
      for (let j = 0; j < n; j++) spots.push({ x: FOOT_X + k * dx, z: (j - (n - 1) / 2) * dz, k, j, n });
    });
  } else {
    for (let k = 0; k < 5; k++) for (let j = 0; j <= k; j++) spots.push({ x: FOOT_X + k * dx, z: (j - k / 2) * dz, k, j, n: k + 1 });
  }
  const mid = count === 9 ? 4 : 4; // indeks posisi tengah (baris ke-3, tengah)
  const pool = [...reds, ...blues];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const balls = [{ id: 0, x: HEAD_X, z: 0, in: false }];
  let p = 0;
  spots.forEach((s, i) => {
    const id = i === mid ? 8 : pool[p++];
    balls.push({ id, x: s.x, z: s.z, in: false });
  });
  // dua sudut belakang (segitiga) berbeda warna
  if (count === 15) {
    const c1 = balls.find((b) => b.x === spots[10].x && b.z === spots[10].z);
    const c2 = balls.find((b) => b.x === spots[14].x && b.z === spots[14].z);
    if (colorOfBall(c1.id) === colorOfBall(c2.id)) {
      const want = colorOfBall(c1.id) === RED ? BLUE : RED;
      const swap = balls.find((b) => b !== c1 && b !== c2 && b.id !== 0 && b.id !== 8 && colorOfBall(b.id) === want);
      [swap.x, c2.x] = [c2.x, swap.x];
      [swap.z, c2.z] = [c2.z, swap.z];
    }
  }
  return balls.map((b) => ({ ...b, x: round(b.x), z: round(b.z) }));
}

/** Warna grup untuk 3–4 pemain (satu warna per pemain). */
export const MULTI_GROUPS = ['red', 'blue', 'yellow', 'purple'];

/**
 * Susunan 3–4 pemain: 12 bola berwarna (4 atau 3 per pemain) + bola 8 di tengah,
 * segitiga 5 baris tanpa dua sudut belakang. Mengembalikan { balls, cols } (cols: id → warna grup).
 */
export function rackMulti(players, rnd = Math.random) {
  const n = players >= 4 ? 4 : 3;
  const per = 12 / n;
  const ids = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13];
  const cols = {};
  ids.forEach((id, i) => (cols[id] = MULTI_GROUPS[Math.floor(i / per)]));
  const dx = R * Math.sqrt(3) + 0.0004;
  const dz = R * 2 + 0.0004;
  const spots = [];
  for (let k = 0; k < 5; k++) for (let j = 0; j <= k; j++) if (!(k === 4 && (j === 0 || j === 4))) spots.push({ x: FOOT_X + k * dx, z: (j - k / 2) * dz });
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const balls = [{ id: 0, x: HEAD_X, z: 0, in: false }];
  let p = 0;
  spots.forEach((sp, i) => balls.push({ id: i === 4 ? 8 : order[p++], x: round(sp.x), z: round(sp.z), in: false }));
  return { balls, cols };
}

export const round = (v) => Math.round(v * 10000) / 10000;

/**
 * Simulator satu pukulan. step(dt) memajukan waktu nyata; events dicatat untuk suara & aturan.
 * shot: { dx, dz (arah ternormalisasi), v (m/s), top, side (-1..1) }
 */
export class ShotSim {
  constructor(balls, shot) {
    this.balls = balls.map((b) => ({ id: b.id, x: b.x, z: b.z, vx: 0, vz: 0, in: !!b.in, pk: b.pk, rx: 0, rz: 0 }));
    this.cue = this.balls.find((b) => b.id === 0);
    this.cue.vx = shot.dx * shot.v;
    this.cue.vz = shot.dz * shot.v;
    this.top = shot.top || 0;
    this.side = shot.side || 0;
    this.dir = { x: shot.dx, z: shot.dz };
    this.first = null; // bola pertama yang disentuh bola putih
    this.pots = []; // urutan bola masuk
    this.rails = 0;
    this.events = [];
    this.acc = 0;
    this.time = 0;
    this.done = false;
    this.spinUsed = false;
  }

  /** Maju dt detik (waktu nyata); kembalikan true bila semua bola sudah diam. */
  step(dt) {
    this.acc += dt;
    while (this.acc >= DT && !this.done) {
      this.acc -= DT;
      this.tick();
    }
    return this.done;
  }

  /** Jalankan sampai selesai (bandar & bot). */
  run(maxSec = 40) {
    let n = 0;
    while (!this.done && n < maxSec / DT) {
      this.tick();
      n++;
    }
    this.done = true;
    return this;
  }

  tick() {
    const bs = this.balls;
    let moving = false;
    for (const b of bs) {
      if (b.in) continue;
      const sp2 = b.vx * b.vx + b.vz * b.vz;
      if (sp2 <= 0) continue;
      const sp = Math.sqrt(sp2);
      const ns = sp - (ROLL + DRAG * sp) * DT;
      if (ns <= 0.004) {
        b.vx = 0;
        b.vz = 0;
        continue;
      }
      b.vx = (b.vx / sp) * ns;
      b.vz = (b.vz / sp) * ns;
      b.x += b.vx * DT;
      b.z += b.vz * DT;
      b.rx += b.vz * DT; // untuk putaran tampilan
      b.rz -= b.vx * DT;
      moving = true;
    }
    // tumbukan antar bola
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (a.in) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (b.in) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        const push = (2 * R - d) / 2;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (rel <= 0) continue;
        const imp = ((1 + BALL_E) / 2) * rel;
        a.vx -= nx * imp;
        a.vz -= nz * imp;
        b.vx += nx * imp;
        b.vz += nz * imp;
        this.events.push({ t: this.time, k: 'hit', s: rel });
        const cueHit = a.id === 0 ? b : b.id === 0 ? a : null;
        if (cueHit && this.first === null) this.first = cueHit.id;
        if (cueHit && !this.spinUsed && this.top) {
          // efek gulir depan / tarik: bola putih terus maju atau mundur setelah benturan pertama
          this.spinUsed = true;
          const k = this.top * 0.55 * rel;
          this.cue.vx += this.dir.x * k;
          this.cue.vz += this.dir.z * k;
        }
        moving = true;
      }
    }
    // lubang: jatuh bila pusat bola melewati garis mulut lubang
    for (const b of bs) {
      if (b.in) continue;
      for (let k = 0; k < POCKETS.length; k++) {
        const p = POCKETS[k];
        const ox = b.x - p.mx, oz = b.z - p.mz;
        if (ox * p.nx + oz * p.nz > DROP && Math.abs(ox * p.tx + oz * p.tz) < p.half + 0.01) {
          b.in = true;
          b.pk = k;
          b.vx = b.vz = 0;
          b.x = p.hx;
          b.z = p.hz;
          this.pots.push(b.id);
          this.events.push({ t: this.time, k: 'pot', id: b.id, pk: k });
          break;
        }
      }
      if (b.in) continue;
      // jauh dari tepi: tidak perlu cek bantalan
      if (b.x > -L / 2 + R + 0.01 && b.x < L / 2 - R - 0.01 && b.z > -W / 2 + R + 0.01 && b.z < W / 2 - R - 0.01) continue;
      // bantalan & jaw: titik terdekat pada segmen (ujung segmen = hidung jaw yang membulat)
      for (const c of CUSHIONS) {
        const wx = b.x - c.ax, wz = b.z - c.az;
        let t = wx * c.ux + wz * c.uz;
        if (t < 0) t = 0;
        else if (t > c.len) t = c.len;
        const qx = c.ax + c.ux * t, qz = c.az + c.uz * t;
        const dx = b.x - qx, dz = b.z - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        b.x = qx + nx * R;
        b.z = qz + nz * R;
        const vn = b.vx * nx + b.vz * nz;
        if (vn >= 0) continue;
        const e = c.rail ? RAIL_E : RAIL_JAW_E;
        b.vx -= (1 + e) * vn * nx;
        b.vz -= (1 + e) * vn * nz;
        if (b.id === 0 && this.side && c.rail) {
          // efek samping: bola putih membelok di sepanjang bantalan
          b.vx += -nz * this.side * 0.3 * -vn;
          b.vz += nx * this.side * 0.3 * -vn;
          this.side *= 0.6;
        }
        this.rails++;
        this.events.push({ t: this.time, k: 'rail', s: -vn });
      }
      // pengaman: bola tidak boleh keluar meja
      const lim = 0.2;
      if (b.x > L / 2 + lim || b.x < -L / 2 - lim || b.z > W / 2 + lim || b.z < -W / 2 - lim) {
        b.x = Math.max(-L / 2 + R, Math.min(L / 2 - R, b.x));
        b.z = Math.max(-W / 2 + R, Math.min(W / 2 - R, b.z));
        b.vx = b.vz = 0;
      }
    }
    this.time += DT;
    if (!moving) this.done = true;
  }

  /** Posisi akhir (dibulatkan) untuk state. */
  final() {
    return this.balls.map((b) => (b.in ? { id: b.id, x: round(b.x), z: round(b.z), in: true, pk: b.pk ?? 0 } : { id: b.id, x: round(b.x), z: round(b.z), in: false }));
  }
}

// ---------- Prediksi lintasan (garis bantu bidik) ----------
/**
 * Dari bola putih (cx, cz) ke arah (dx, dz): titik sentuh pertama (bola atau bantalan).
 * Kembalikan { x, z (pusat bola putih saat menyentuh), ball (id|null), nx, nz (normal), rail }.
 */
export function traceAim(balls, cx, cz, dx, dz) {
  let best = Infinity, hit = null;
  for (const b of balls) {
    if (b.in || b.id === 0) continue;
    // jarak t sepanjang sinar di mana |c + d t - b| = 2R
    const ox = cx - b.x, oz = cz - b.z;
    const bq = ox * dx + oz * dz;
    const cq = ox * ox + oz * oz - 4 * R * R;
    const disc = bq * bq - cq;
    if (disc < 0) continue;
    const t = -bq - Math.sqrt(disc);
    if (t > 1e-4 && t < best) {
      best = t;
      hit = b;
    }
  }
  // bantalan
  const mx = L / 2 - R, mz = W / 2 - R;
  let tr = Infinity, rnx = 0, rnz = 0;
  if (dx > 0) { const t = (mx - cx) / dx; if (t < tr) { tr = t; rnx = -1; rnz = 0; } }
  if (dx < 0) { const t = (-mx - cx) / dx; if (t < tr) { tr = t; rnx = 1; rnz = 0; } }
  if (dz > 0) { const t = (mz - cz) / dz; if (t < tr) { tr = t; rnx = 0; rnz = -1; } }
  if (dz < 0) { const t = (-mz - cz) / dz; if (t < tr) { tr = t; rnx = 0; rnz = 1; } }
  if (hit && best <= tr) {
    const x = cx + dx * best, z = cz + dz * best;
    const nx = (hit.x - x) / (2 * R), nz = (hit.z - z) / (2 * R);
    return { x, z, ball: hit.id, nx, nz, rail: false, t: best };
  }
  return { x: cx + dx * tr, z: cz + dz * tr, ball: null, nx: rnx, nz: rnz, rail: true, t: tr };
}

/** Apakah posisi bola putih sah (di dalam meja, tidak menindih bola lain, opsional: di daerah kepala). */
export function validCuePos(balls, x, z, kitchen = false) {
  const mx = L / 2 - R, mz = W / 2 - R;
  if (x < -mx || x > mx || z < -mz || z > mz) return false;
  if (kitchen && x > HEAD_X) return false;
  for (const b of balls) {
    if (b.in || b.id === 0) continue;
    const dx = b.x - x, dz = b.z - z;
    if (dx * dx + dz * dz < 4 * R * R * 1.05) return false;
  }
  return true;
}

export function clampCuePos(x, z, kitchen = false) {
  const mx = L / 2 - R, mz = W / 2 - R;
  return { x: Math.max(-mx, Math.min(kitchen ? HEAD_X : mx, x)), z: Math.max(-mz, Math.min(mz, z)) };
}
