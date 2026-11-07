// Aturan dam 8×8: bidak di petak gelap, wajib makan, makan beruntun,
// bidak biasa makan maju & mundur, raja (dam) melangkah & makan jarak jauh.
// Papan: array 64 (indeks r*8+f), isi: null | 'w' | 'b' | 'W' | 'B' (huruf besar = raja).

export function initialDam() {
  const b = Array(64).fill(null);
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    if ((f + r) % 2 !== 0) continue;
    if (r < 3) b[r * 8 + f] = 'w';
    else if (r > 4) b[r * 8 + f] = 'b';
  }
  return b;
}

const on = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
const DIRS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
export const colorOf = (p) => (p ? p.toLowerCase() : null);
const isKing = (p) => p === 'W' || p === 'B';

/** Langkah makan dari satu petak: [{from, to, cap}] */
function capturesFrom(board, sq) {
  const p = board[sq];
  const c = colorOf(p);
  const f0 = sq % 8, r0 = (sq / 8) | 0;
  const out = [];
  for (const [df, dr] of DIRS) {
    if (isKing(p)) {
      let f = f0 + df, r = r0 + dr;
      while (on(f, r) && !board[r * 8 + f]) { f += df; r += dr; }
      if (!on(f, r) || colorOf(board[r * 8 + f]) === c) continue;
      const cap = r * 8 + f;
      f += df; r += dr;
      while (on(f, r) && !board[r * 8 + f]) {
        out.push({ from: sq, to: r * 8 + f, cap });
        f += df; r += dr;
      }
    } else {
      const f1 = f0 + df, r1 = r0 + dr, f2 = f0 + 2 * df, r2 = r0 + 2 * dr;
      if (on(f2, r2) && board[r1 * 8 + f1] && colorOf(board[r1 * 8 + f1]) !== c && !board[r2 * 8 + f2]) {
        out.push({ from: sq, to: r2 * 8 + f2, cap: r1 * 8 + f1 });
      }
    }
  }
  return out;
}

function stepsFrom(board, sq) {
  const p = board[sq];
  const fwd = colorOf(p) === 'w' ? 1 : -1;
  const f0 = sq % 8, r0 = (sq / 8) | 0;
  const out = [];
  for (const [df, dr] of DIRS) {
    if (isKing(p)) {
      let f = f0 + df, r = r0 + dr;
      while (on(f, r) && !board[r * 8 + f]) {
        out.push({ from: sq, to: r * 8 + f });
        f += df; r += dr;
      }
    } else if (dr === fwd && on(f0 + df, r0 + dr) && !board[(r0 + dr) * 8 + f0 + df]) {
      out.push({ from: sq, to: (r0 + dr) * 8 + f0 + df });
    }
  }
  return out;
}

/** Semua langkah sah untuk warna c. chain = petak bidak yang sedang makan beruntun. */
export function legalDam(board, c, chain = -1) {
  if (chain >= 0) return capturesFrom(board, chain);
  const caps = [], steps = [];
  for (let sq = 0; sq < 64; sq++) {
    if (colorOf(board[sq]) !== c) continue;
    caps.push(...capturesFrom(board, sq));
    if (!caps.length) steps.push(...stepsFrom(board, sq));
  }
  return caps.length ? caps : steps;
}

/** Jalankan langkah; kembalikan {board, chain, promoted} (chain = -1 bila giliran selesai). */
export function applyDam(board, mv) {
  const b = board.slice();
  const p = b[mv.from];
  b[mv.to] = p;
  b[mv.from] = null;
  if (mv.cap !== undefined) b[mv.cap] = null;
  const r = (mv.to / 8) | 0;
  let promoted = false;
  if (p === 'w' && r === 7) { b[mv.to] = 'W'; promoted = true; }
  if (p === 'b' && r === 0) { b[mv.to] = 'B'; promoted = true; }
  const more = mv.cap !== undefined && !promoted && capturesFrom(b, mv.to).length > 0;
  return { board: b, chain: more ? mv.to : -1, promoted };
}

export function damBot(board, c, chain) {
  const moves = legalDam(board, c, chain);
  if (!moves.length) return null;
  const score = (mv) => {
    const next = applyDam(board, mv);
    let s = Math.random() * 0.5;
    if (mv.cap !== undefined) s += 3 + (next.chain >= 0 ? 2 : 0);
    if (next.promoted) s += 4;
    const r = (mv.to / 8) | 0;
    s += (c === 'w' ? r : 7 - r) * 0.1;
    // hindari langsung dimakan
    const opp = c === 'w' ? 'b' : 'w';
    if (next.chain < 0 && legalDam(next.board, opp).some((m) => m.cap === mv.to)) s -= 2.5;
    return s;
  };
  return moves.reduce((a, b) => (score(b) > score(a) ? b : a));
}
