// Mesin aturan catur ringkas. Papan: array 64, indeks = rank*8 + file (a1 = 0, h8 = 63).
// Bidak: 'wP','wN','wB','wR','wQ','wK','bP',... atau null.

const N = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const K = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const VALUE = { P: 1, N: 3, B: 3.2, R: 5, Q: 9, K: 0 };

export function initialChess() {
  const b = Array(64).fill(null);
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let f = 0; f < 8; f++) {
    b[f] = 'w' + back[f];
    b[8 + f] = 'wP';
    b[48 + f] = 'bP';
    b[56 + f] = 'b' + back[f];
  }
  return { board: b, turn: 'w', castle: 'KQkq', ep: -1, half: 0 };
}

const on = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
const opp = (c) => (c === 'w' ? 'b' : 'w');

export function attacked(board, sq, by) {
  const f = sq % 8, r = (sq / 8) | 0;
  const dir = by === 'w' ? 1 : -1;
  for (const df of [-1, 1]) {
    const pf = f + df, pr = r - dir;
    if (on(pf, pr) && board[pr * 8 + pf] === by + 'P') return true;
  }
  for (const [df, dr] of N) if (on(f + df, r + dr) && board[(r + dr) * 8 + f + df] === by + 'N') return true;
  for (const [df, dr] of K) if (on(f + df, r + dr) && board[(r + dr) * 8 + f + df] === by + 'K') return true;
  const ray = (dirs, kinds) => {
    for (const [df, dr] of dirs) {
      let x = f + df, y = r + dr;
      while (on(x, y)) {
        const p = board[y * 8 + x];
        if (p) {
          if (p[0] === by && kinds.includes(p[1])) return true;
          break;
        }
        x += df;
        y += dr;
      }
    }
    return false;
  };
  return ray(DIAG, 'BQ') || ray(ORTH, 'RQ');
}

function pseudo(st) {
  const { board, turn: c } = st;
  const moves = [];
  const add = (from, to, extra = {}) => moves.push({ from, to, ...extra });
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || p[0] !== c) continue;
    const t = p[1], f = sq % 8, r = (sq / 8) | 0;
    if (t === 'P') {
      const d = c === 'w' ? 1 : -1, start = c === 'w' ? 1 : 6, last = c === 'w' ? 7 : 0;
      const one = (r + d) * 8 + f;
      if (on(f, r + d) && !board[one]) {
        add(sq, one, r + d === last ? { promo: 'Q' } : {});
        const two = (r + 2 * d) * 8 + f;
        if (r === start && !board[two]) add(sq, two, { double: true });
      }
      for (const df of [-1, 1]) {
        if (!on(f + df, r + d)) continue;
        const to = (r + d) * 8 + f + df;
        if (board[to] && board[to][0] !== c) add(sq, to, r + d === last ? { promo: 'Q' } : {});
        else if (to === st.ep) add(sq, to, { epCapture: true });
      }
    } else if (t === 'N' || t === 'K') {
      for (const [df, dr] of t === 'N' ? N : K) {
        if (!on(f + df, r + dr)) continue;
        const to = (r + dr) * 8 + f + df;
        if (!board[to] || board[to][0] !== c) add(sq, to);
      }
      if (t === 'K') {
        const rank = c === 'w' ? 0 : 7, base = rank * 8;
        const [k, q] = c === 'w' ? ['K', 'Q'] : ['k', 'q'];
        if (sq === base + 4 && !attacked(board, sq, opp(c))) {
          if (st.castle.includes(k) && !board[base + 5] && !board[base + 6] && board[base + 7] === c + 'R' && !attacked(board, base + 5, opp(c))) add(sq, base + 6, { castle: 'K' });
          if (st.castle.includes(q) && !board[base + 3] && !board[base + 2] && !board[base + 1] && board[base] === c + 'R' && !attacked(board, base + 3, opp(c))) add(sq, base + 2, { castle: 'Q' });
        }
      }
    } else {
      const dirs = t === 'B' ? DIAG : t === 'R' ? ORTH : [...DIAG, ...ORTH];
      for (const [df, dr] of dirs) {
        let x = f + df, y = r + dr;
        while (on(x, y)) {
          const to = y * 8 + x;
          if (board[to]) {
            if (board[to][0] !== c) add(sq, to);
            break;
          }
          add(sq, to);
          x += df;
          y += dr;
        }
      }
    }
  }
  return moves;
}

export function applyChess(st, mv) {
  const board = st.board.slice();
  const p = board[mv.from];
  const c = p[0];
  const captured = board[mv.to] || (mv.epCapture ? board[mv.to + (c === 'w' ? -8 : 8)] : null);
  board[mv.to] = mv.promo ? c + mv.promo : p;
  board[mv.from] = null;
  if (mv.epCapture) board[mv.to + (c === 'w' ? -8 : 8)] = null;
  if (mv.castle) {
    const base = c === 'w' ? 0 : 56;
    if (mv.castle === 'K') { board[base + 5] = board[base + 7]; board[base + 7] = null; }
    else { board[base + 3] = board[base]; board[base] = null; }
  }
  let castle = st.castle;
  const strip = (chars) => { for (const ch of chars) castle = castle.replace(ch, ''); };
  if (p[1] === 'K') strip(c === 'w' ? 'KQ' : 'kq');
  for (const [sq, ch] of [[0, 'Q'], [7, 'K'], [56, 'q'], [63, 'k']]) if (mv.from === sq || mv.to === sq) strip(ch);
  return {
    board,
    turn: opp(c),
    castle,
    ep: mv.double ? (mv.from + mv.to) / 2 : -1,
    half: p[1] === 'P' || captured ? 0 : st.half + 1,
    captured,
  };
}

export function legalChess(st) {
  return pseudo(st).filter((mv) => {
    const next = applyChess(st, mv);
    const king = next.board.indexOf(st.turn + 'K');
    return !attacked(next.board, king, opp(st.turn));
  });
}

export function inCheck(st) {
  return attacked(st.board, st.board.indexOf(st.turn + 'K'), opp(st.turn));
}

/** 'mate' | 'stalemate' | 'draw' | null */
export function chessResult(st) {
  if (!legalChess(st).length) return inCheck(st) ? 'mate' : 'stalemate';
  const left = st.board.filter(Boolean);
  if (left.length <= 3 && left.every((p) => p[1] === 'K' || p[1] === 'N' || p[1] === 'B')) return 'draw';
  if (st.half >= 100) return 'draw';
  return null;
}

function evaluate(board, c) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const f = i % 8, r = (i / 8) | 0;
    const center = 0.06 * (3.5 - Math.abs(3.5 - f)) * (p[1] === 'N' || p[1] === 'P' ? 1 : 0.3);
    const adv = p[1] === 'P' ? 0.05 * (p[0] === 'w' ? r : 7 - r) : 0;
    s += (p[0] === c ? 1 : -1) * (VALUE[p[1]] + center + adv);
  }
  return s;
}

/** Bot sederhana: cari 2 langkah ke depan (langkah kita + balasan terbaik lawan). */
export function chessBot(st) {
  const moves = legalChess(st);
  let best = null, bestScore = -Infinity;
  for (const mv of moves) {
    const next = applyChess(st, mv);
    const replies = legalChess(next);
    let worst;
    if (!replies.length) worst = inCheck(next) ? 1000 : 0;
    else {
      worst = Infinity;
      for (const rp of replies) worst = Math.min(worst, evaluate(applyChess(next, rp).board, st.turn));
    }
    const score = worst + Math.random() * 0.15;
    if (score > bestScore) {
      bestScore = score;
      best = mv;
    }
  }
  return best;
}
