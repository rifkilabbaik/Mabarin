// Aturan Kartu Kilat — permainan kartu cocok-warna orisinal Mabarin.
// Kartu: "<warna>:<nilai>:<salinan>", wild memakai warna "w".
// Nilai: 0–9, skip (Lewati), rev (Balik), p2 (+2), wild (Pelangi), wild4 (Pelangi +4).

export const SUITS = ['api', 'matahari', 'daun', 'ombak'];
export const SUIT_INFO = {
  api: { name: 'Api', color: '#ff6b6b', dark: '#c92a2a' },
  matahari: { name: 'Matahari', color: '#fcc419', dark: '#e67700' },
  daun: { name: 'Daun', color: '#51cf66', dark: '#2b8a3e' },
  ombak: { name: 'Ombak', color: '#4dabf7', dark: '#1864ab' },
};
export const HAND_SIZE = 7;
export const MAX_PLAYERS = 4;
export const TURN_MS = 30000;

export function makeDeck() {
  const d = [];
  for (const s of SUITS) {
    d.push(`${s}:0:0`);
    for (let n = 1; n <= 9; n++) for (let k = 0; k < 2; k++) d.push(`${s}:${n}:${k}`);
    for (const v of ['skip', 'rev', 'p2']) for (let k = 0; k < 2; k++) d.push(`${s}:${v}:${k}`);
  }
  for (let k = 0; k < 4; k++) d.push(`w:wild:${k}`, `w:wild4:${k}`);
  return d;
}

const cache = new Map();
export function parse(id) {
  let c = cache.get(id);
  if (!c) {
    const [s, v] = String(id).split(':');
    c = { id, suit: s === 'w' ? null : s, value: v, wild: s === 'w', number: /^\d$/.test(v) };
    cache.set(id, c);
  }
  return c;
}

/** Kunci tampilan (tanpa nomor salinan) — dipakai untuk tekstur. */
export const faceKey = (id) => {
  const c = parse(id);
  return c.wild ? c.value : `${c.suit}:${c.value}`;
};

export function canPlay(id, topId, color) {
  const c = parse(id);
  if (c.wild) return true;
  if (!topId) return true;
  return c.suit === color || c.value === parse(topId).value;
}

export function shuffle(arr, rand = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const label = (id) => {
  const c = parse(id);
  const v = { skip: 'Lewati', rev: 'Balik', p2: '+2', wild: 'Pelangi', wild4: 'Pelangi +4' }[c.value] || c.value;
  return c.wild ? v : `${SUIT_INFO[c.suit].name} ${v}`;
};

/** Pilihan sederhana untuk bot: utamakan kartu aksi, simpan wild untuk terakhir. */
export function botChoose(hand, topId, color) {
  const playable = hand.filter((id) => canPlay(id, topId, color));
  if (!playable.length) return null;
  const score = (id) => {
    const c = parse(id);
    if (c.wild) return c.value === 'wild4' ? 1 : 2;
    let s = 10;
    if (!c.number) s += 5;
    if (c.suit === color) s += 2;
    return s + Math.random();
  };
  playable.sort((a, b) => score(b) - score(a));
  return playable[0];
}

export function bestColor(hand) {
  const count = Object.fromEntries(SUITS.map((s) => [s, 0]));
  for (const id of hand) {
    const c = parse(id);
    if (!c.wild) count[c.suit]++;
  }
  return SUITS.reduce((a, b) => (count[b] > count[a] ? b : a), SUITS[Math.floor(Math.random() * 4)]);
}
