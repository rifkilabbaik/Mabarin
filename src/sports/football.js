import { CONFIG } from '../config.js';
import { BALLS, G, kickVelocity } from './physics.js';

// Mekanik sepak bola ala game bola konsol: bola menempel di kaki, umpan otomatis ke kawan,
// tembakan otomatis ke gawang (arah dari hadapan pemain, tenaga dari lama menahan tombol),
// dan adu penalti tebak arah (kiri / tengah / kanan).

const F = CONFIG.sports.fields.bola;
const R = BALLS.bola.r;
export const L2 = F.L / 2;
export const GW = F.goalW / 2;
export const PK_SPOT = L2 - 6;
export const CARRY = 0.55; // jarak bola di depan kaki saat menggiring
export const CLAIM_R = 0.95; // jarak untuk menguasai bola lepas
export const OVER = 0.9; // tenaga di atas ini = bola melambung

export const attackDir = (team) => (team === 0 ? 1 : -1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Tinggi bola (dengan hambatan udara) saat menempuh jarak horizontal D. */
function heightAt(oy, s, a, D) {
  const P = BALLS.bola;
  let x = 0, y = oy, vx = Math.cos(a) * s, vy = Math.sin(a) * s;
  const h = 1 / 120;
  for (let i = 0; i < 720; i++) {
    const sp = Math.hypot(vx, vy);
    const k = P.drag * sp * h;
    vx -= vx * k;
    vy -= vy * k + G * h;
    x += vx * h;
    y += vy * h;
    if (x >= D) return y;
    if (y < R && vy < 0) return -1 - (D - x); // jatuh sebelum sampai
  }
  return y;
}

/** Sudut tendangan agar bola setinggi `h` saat sampai di jarak D. */
export function loftAngle(D, h, speed) {
  let lo = -0.12, hi = 0.85;
  for (let i = 0; i < 16; i++) {
    const a = (lo + hi) / 2;
    if (heightAt(R, speed, a, D) < h) lo = a;
    else hi = a;
  }
  return (lo + hi) / 2;
}

/**
 * Tembakan ke gawang lawan. Arah menyamping mengikuti hadapan pemain (dibatasi di dalam gawang),
 * tenaga c (0..1) menentukan kecepatan & tinggi; di atas OVER bola melambung di atas mistar.
 */
export function shotVelocity(team, bx, bz, facing, c, rnd = Math.random) {
  const dir = attackDir(team);
  const gx = dir * L2;
  const fx = Math.sin(facing), fz = Math.cos(facing);
  let zt = fx * dir > 0.2 ? bz + fz * ((gx - bx) / fx) : fz * 1.6;
  const lim = GW - 0.35;
  zt = clamp(zt, -lim, lim);
  const D = Math.hypot(gx - bx, zt - bz);
  zt += (rnd() - 0.5) * Math.max(0, D - 9) * 0.08; // tembakan jauh kurang akurat
  const speed = 10 + c * 16;
  const aimY = c > OVER ? 2.4 + (c - OVER) * 20 : 0.2 + c * 1.45;
  const elev = Math.min(loftAngle(D, aimY, speed), 0.15 + c * 0.6);
  return kickVelocity(Math.atan2(gx - bx, zt - bz), elev, speed);
}

/** Umpan ke titik (tx, tz): menyusur tanah, melambung bila jauh. */
export function passVelocity(bx, bz, tx, tz) {
  const d = Math.hypot(tx - bx, tz - bz);
  const yaw = Math.atan2(tx - bx, tz - bz);
  if (d > 16) {
    const speed = clamp(9 + d * 0.5, 14, 22);
    return kickVelocity(yaw, loftAngle(d * 0.8, 0.4, speed), speed);
  }
  return kickVelocity(yaw, 0.02, clamp(4 + d * 1.0, 7, 19));
}

/**
 * Pilih kawan untuk diumpan: yang paling searah dengan hadapan & tidak terlalu jauh.
 * mates: [{ x, z, vx, vz }]. Mengembalikan titik tujuan (dengan sedikit mendahului larinya) atau null.
 */
export function pickPassTarget(bx, bz, facing, mates) {
  const fx = Math.sin(facing), fz = Math.cos(facing);
  let best = null, bestScore = Infinity;
  for (const m of mates) {
    if (!m) continue;
    const dx = m.x - bx, dz = m.z - bz;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) continue;
    const ang = Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1));
    const score = d * (1 + ang * 1.3);
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  if (!best) return null;
  return { x: best.x + (best.vx || 0) * 0.35, z: best.z + (best.vz || 0) * 0.35 };
}

// ---------- Adu penalti ----------
/**
 * Hasil tendangan penalti. d & keep: -1 / 0 / 1 (tanda sumbu z lapangan), c: tenaga 0..1.
 * - terlalu keras (> OVER) → melambung
 * - kiper menebak arah yang sama → ditepis, kecuali tendangan keras ke pojok (kadang tembus)
 * - tebakan salah → gol
 */
export function pkOutcome(d, c, keep, rnd = Math.random) {
  if (c > OVER) return 'over';
  if (keep === d) return d !== 0 && c >= 0.7 && rnd() < 0.45 ? 'goal' : 'save';
  return 'goal';
}

export function pkVelocity(d, c, outcome) {
  const z = d === 0 ? 0 : d * (c >= 0.7 ? 1.95 : 1.6);
  const y = outcome === 'over' ? 3.1 : c < 0.3 ? 0.25 : c < 0.7 ? 0.7 : 1.35;
  const speed = 9 + c * 17;
  const D = Math.hypot(L2 - PK_SPOT, z);
  return kickVelocity(Math.atan2(L2 - PK_SPOT, z), loftAngle(D, y, speed), speed);
}

/** Posisi kiper setelah melompat ke arah tebakannya. */
export const pkDiveZ = (keep) => keep * 1.6;
