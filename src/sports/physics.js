// Fisika bola bersama (dipakai tuan rumah pertandingan & prediksi di semua klien).
// Semua koordinat lokal terhadap pusat lapangan: x = panjang lapangan, z = lebar, y = 0 di permukaan.

export const G = 9.8;

export const BALLS = {
  bola: { r: 0.22, drag: 0.013, rest: 0.55, fric: 0.86, roll: 0.45, rollDecel: 0.7, max: 30 },
  tenis: { r: 0.1, drag: 0.02, rest: 0.74, fric: 0.84, roll: 0.9, rollDecel: 1.4, max: 42 },
  badminton: { r: 0.09, drag: 0.21, rest: 0, fric: 0, roll: 30, rollDecel: 6, max: 60 },
};

export const RUN = { bola: 2.5, tenis: 3, badminton: 2 };
export const BOARD = 1.5; // jarak papan pembatas dari garis lapangan bola
export const BOARD_H = 0.45;

export function newBall() {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rolling: false, scored: 0 };
}

export function copyBall(dst, src) {
  dst.x = src.x; dst.y = src.y; dst.z = src.z;
  dst.vx = src.vx; dst.vy = src.vy; dst.vz = src.vz;
  dst.rolling = src.rolling; dst.scored = src.scored;
  return dst;
}

/** Gravitasi, hambatan udara, pantulan & gulir di tanah. */
function integrate(b, P, dt, ev) {
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  const k = P.drag * sp * dt;
  b.vx -= b.vx * k;
  b.vy -= b.vy * k + G * dt;
  b.vz -= b.vz * k;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  if (b.y <= P.r) {
    b.y = P.r;
    if (b.vy < -0.7 && P.rest > 0) {
      const s = -b.vy;
      b.vy = s * P.rest;
      b.vx *= P.fric;
      b.vz *= P.fric;
      b.rolling = false;
      ev?.('bounce', s);
    } else {
      if (!b.rolling) {
        b.rolling = true;
        ev?.('land', -b.vy);
      }
      b.vy = 0;
      const h = Math.hypot(b.vx, b.vz);
      if (h > 0) {
        const nh = Math.max(0, h * Math.exp(-P.roll * dt) - P.rollDecel * dt);
        b.vx *= nh / h;
        b.vz *= nh / h;
      }
    }
  } else if (b.y > P.r + 0.02) b.rolling = false;
}

/** Gawang, tiang, jaring & papan pembatas lapangan bola. */
function footballBounds(b, P, f, px, pz, ev) {
  const L2 = f.L / 2, gw = f.goalW / 2, gh = f.goalH;
  const bx = L2 + BOARD, bz = f.W / 2 + BOARD;
  const r = P.r;
  // melewati garis gawang
  if (Math.abs(px) <= L2 && Math.abs(b.x) > L2) {
    const s = Math.sign(b.x);
    if (Math.abs(b.z) < gw - r * 0.4 && b.y < gh - r * 0.4) {
      if (!b.scored) {
        b.scored = s;
        ev?.('goal', s);
      }
    } else if (Math.abs(b.z) < gw + r && b.y < gh + r) {
      // kena tiang / mistar
      b.x = s * (L2 - 0.01);
      b.vx *= -0.6;
      ev?.('post');
    }
  }
  // di dalam gawang: tertahan jaring
  if (Math.abs(b.x) > L2 && Math.abs(b.z) < gw + 0.1 && b.y < gh) {
    const s = Math.sign(b.x);
    const back = L2 + 1.2 - r;
    if (Math.abs(b.x) > back) {
      b.x = s * back;
      b.vx *= -0.12;
      b.vz *= 0.5;
    }
    if (Math.abs(pz) >= gw + 0.1 - 1e-6 && !b.scored) {
      // dari samping luar gawang
      b.z = Math.sign(pz) * (gw + 0.1);
      b.vz *= -0.4;
    } else if (b.scored) {
      if (Math.abs(b.z) > gw - r) {
        b.z = Math.sign(b.z) * (gw - r);
        b.vz *= -0.2;
      }
      if (b.y > gh - r) {
        b.y = gh - r;
        b.vy = Math.min(0, b.vy) * 0.2;
      }
    }
  }
  // papan pembatas
  const H = BOARD_H + r;
  if (Math.abs(b.x) > bx - r) {
    if (b.y < H) {
      b.x = Math.sign(b.x) * (bx - r);
      if (b.vx * b.x > 0) b.vx *= -0.65;
      ev?.('wall');
    } else if (Math.abs(b.x) > bx + 0.4) ev?.('out');
  }
  if (Math.abs(b.z) > bz - r) {
    if (b.y < H) {
      b.z = Math.sign(b.z) * (bz - r);
      if (b.vz * b.z > 0) b.vz *= -0.65;
      ev?.('wall');
    } else if (Math.abs(b.z) > bz + 0.4) ev?.('out');
  }
}

/** Net tenis / bulu tangkis. */
function netBounds(b, P, f, px, sport, ev) {
  const span = f.W / 2 + 0.5;
  if (px !== 0 && Math.sign(px) !== Math.sign(b.x) && Math.abs(b.z) < span) {
    if (b.y < f.net + P.r) {
      b.x = Math.sign(px) * P.r;
      b.vx *= -0.12;
      b.vz *= 0.4;
      b.vy = Math.min(b.vy, 0) * 0.3;
      ev?.('net');
    } else ev?.('cross');
  }
  const run = RUN[sport];
  if (Math.abs(b.x) > f.L / 2 + run + 3 || Math.abs(b.z) > f.W / 2 + run + 3) ev?.('away');
}

/** Satu langkah simulasi. `ev(nama, nilai)` opsional untuk aturan permainan. */
export function stepBall(b, sport, f, dt, ev) {
  const P = BALLS[sport];
  const px = b.x, pz = b.z;
  integrate(b, P, dt, ev);
  if (sport === 'bola') footballBounds(b, P, f, px, pz, ev);
  else netBounds(b, P, f, px, sport, ev);
}

/** Jalankan simulasi beberapa saat ke depan (substep tetap). */
export function advance(b, sport, f, seconds, ev) {
  const h = 1 / 120;
  let t = seconds;
  while (t > 1e-5) {
    const d = Math.min(h, t);
    stepBall(b, sport, f, d, ev);
    t -= d;
  }
}

/**
 * Cari kecepatan pukulan agar bola mendarat di (tx, tz) dan melewati net.
 * Dicoba dari sudut paling datar; dipilih yang melewati net dengan aman.
 */
export function solveShot(sport, f, ox, oy, oz, tx, tz, angles) {
  const P = BALLS[sport];
  const dx = tx - ox, dz = tz - oz;
  const D = Math.hypot(dx, dz) || 0.01;
  const ux = dx / D, uz = dz / D;
  const crossT = Math.abs(ux) > 1e-3 ? -ox / ux : Infinity; // jarak horizontal ke net (x=0)
  let fallback = null;
  for (const a of angles) {
    let lo = 1, hi = P.max * 1.6, best = null;
    for (let it = 0; it < 18; it++) {
      const s = (lo + hi) / 2;
      const r = flight(P, oy, s, a, crossT);
      if (r.dist < D) lo = s;
      else hi = s;
      best = { s, r };
    }
    const v = { vx: ux * Math.cos(a) * best.s, vy: Math.sin(a) * best.s, vz: uz * Math.cos(a) * best.s };
    fallback = v;
    if (best.s > P.max) continue; // terlalu keras: coba sudut lebih tinggi
    if (crossT > 0 && crossT < D && best.r.netY < f.net + P.r + (sport === 'badminton' ? 0.3 : 0.18)) continue;
    return v;
  }
  return fallback;
}

// Lintasan 2D (jarak horizontal, tinggi) untuk solveShot.
function flight(P, oy, s, a, crossT) {
  let x = 0, y = oy, vx = Math.cos(a) * s, vy = Math.sin(a) * s;
  let netY = Infinity;
  const h = 1 / 90;
  for (let i = 0; i < 540; i++) {
    const sp = Math.hypot(vx, vy);
    const k = P.drag * sp * h;
    vx -= vx * k;
    vy -= vy * k + G * h;
    const nx = x + vx * h;
    const ny = y + vy * h;
    if (x < crossT && nx >= crossT) netY = y + ((crossT - x) / (nx - x)) * (ny - y);
    x = nx;
    y = ny;
    if (y <= P.r) return { dist: x, netY };
  }
  return { dist: x, netY };
}

/** Arah tendangan dari sudut kamera. */
export function kickVelocity(yaw, elev, speed) {
  const c = Math.cos(elev);
  return { vx: Math.sin(yaw) * c * speed, vy: Math.sin(elev) * speed, vz: Math.cos(yaw) * c * speed };
}

/**
 * Tubuh pemain mendorong bola (menggiring / menghalangi).
 * Mengembalikan 0 = tidak kena, 1 = hanya digeser, 2 = kecepatan bola berubah.
 */
export function pushBall(b, px, pz, pvx, pvz, R, height, power = 1) {
  if (b.y > height) return 0;
  const dx = b.x - px, dz = b.z - pz;
  const d = Math.hypot(dx, dz);
  if (d >= R) return 0;
  const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
  b.x = px + nx * R;
  b.z = pz + nz * R;
  const vn = (b.vx - pvx) * nx + (b.vz - pvz) * nz;
  if (vn > -0.05) return 1;
  const j = -1.2 * vn * power;
  b.vx += nx * j + pvx * 0.06;
  b.vz += nz * j + pvz * 0.06;
  return 2;
}
