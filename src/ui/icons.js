// Set ikon SVG garis sederhana (24×24) pengganti emoji. Semua path dibuat khusus untuk Mabarin.
// Pemakaian: icon('music') → string <svg>, atau <i data-icon="music"></i> di HTML lalu hydrateIcons().

const P = {
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V12M17 10a1.5 1.5 0 0 1 3 0v4a7 7 0 0 1-7 7h-1a6 6 0 0 1-4.8-2.4l-3-4.1a1.6 1.6 0 0 1 2.5-2L8 14',
  hammer: 'M5 3.5h12a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 8V5A1.5 1.5 0 0 1 5 3.5zM11 9.5V21M9.5 21h3',
  sword: 'M20 4v3.5L11 16.5 7.5 13 16.5 4zM5.5 11.5l7 7M9.2 16.8 5 21M4 21.5h.01',
  drop: 'M12 3s6.5 6.6 6.5 11.2a6.5 6.5 0 0 1-13 0C5.5 9.6 12 3 12 3z',
  chair: 'M6 21V2.5h4.5V13H18v8M6 13h4.5M6 16h12',
  pistol: 'M2.5 7.5H17l3.5 2.5v3H11l-1.6 7H5l1.6-7H2.5zM8 7.5V4.5h5v3M20.5 11.5h1',
  guitar: 'M14.5 9.5 20 4M18.5 2.5l3 3M11 9.6c-2.2-1.4-5.3.1-5.3 3 0 1.9-2.2 1.9-2.2 3.9a3.6 3.6 0 0 0 3.6 3.6c2 0 2-2.2 3.9-2.2 2.9 0 4.4-3.1 3-5.3M9.5 14.5l1.5-1.5',
  chat: 'M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1-4.5A8.5 8.5 0 1 1 20.5 12z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6h2a4.7 4.7 0 0 0 4.7-4.7C21 6.6 17 3 12 3zM7.5 12h.01M10 7.5h.01M15 7.5h.01',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  fullscreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  volume: 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  mute: 'M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01',
  stand: 'M12 7.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM12 10v5M8 21l4-6 4 6M7 12l5-2 5 2',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  cards: 'M3.5 7.8 11.6 5l3.6 11.2-8.1 2.8zM14.5 4h4.5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3',
  userPlus: 'M15 20v-1.5A3.5 3.5 0 0 0 11.5 15h-5A3.5 3.5 0 0 0 3 18.5V20M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 8v6M22 11h-6',
  check: 'M4.5 12.5 9.5 17.5 19.5 6.5',
  x: 'M6 6l12 12M18 6 6 18',
  crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5zM5 19h14',
  play: 'M7 4.5v15l12-7.5z',
  refresh: 'M20 11a8 8 0 0 0-14.3-4.6L4 8M4 3.5V8h4.5M4 13a8 8 0 0 0 14.3 4.6L20 16M20 20.5V16h-4.5',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  skip: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  reverse: 'M4 9h13l-3.5-3.5M20 15H7l3.5 3.5',
  bot: 'M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM12 8V4.5M12 4.5h.01M9 13h.01M15 13h.01M9.5 16.5h5',
  send: 'M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z',
  keyboard: 'M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  hourglass: 'M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9',
  plus: 'M12 5v14M5 12h14',
  eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  chess: 'M7 21h10M8.5 18h7l-.8-4.5 2.3-2.2-1-4.3-3.5-2.5H10.6l-.6 2L7 9.2l1.6 2.1 2.2-1 .5 2.2-2.8 5.5z',
  dam: 'M4 9.5C4 7.6 7.6 6 12 6s8 1.6 8 3.5-3.6 3.5-8 3.5-8-1.6-8-3.5zM4 9.5v3c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-3M4 12.5v3c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-3',
  mask: 'M4 5c5 1.6 11 1.6 16 0v6a8 8 0 0 1-16 0zM8.5 10h2M13.5 10h2M9 14.5c1.8 1.3 4.2 1.3 6 0',
  ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7l3.8 2.8-1.5 4.4H9.7L8.2 9.8zM12 7V3.2M15.8 9.8l3.8-1.2M14.3 14.2l2.3 3.3M9.7 14.2l-2.3 3.3M8.2 9.8 4.4 8.6',
  tennis: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6a9 9 0 0 1 0 12.8M18.4 5.6a9 9 0 0 0 0 12.8',
  shuttle: 'M9 15 4.5 6.5l3-1L10.5 11M15 15l4.5-8.5-3-1-3 5.5M12 15V4.5M9 15h6v2a3 3 0 0 1-6 0z',
  mic: 'M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21',
  micOff: 'M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M3 3l18 18',
  dash: 'M13 5l7 7-7 7M4 12h15M4 7h5M4 17h5',
  slide: 'M3 19h18M4 15.5 9 14l4 3.5h7M9.5 14l1.2-5.5M13 6.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  kick: 'M7 3h5v8.5l6.5 1.8a2.5 2.5 0 0 1 1.8 2.4V18H4v-3l3-4z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
};

const FILL = new Set(['play', 'bolt']);

export function icon(name, cls = '') {
  const d = P[name];
  if (!d) return '';
  const fill = FILL.has(name);
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

/** Data path SVG mentah (untuk digambar di canvas lewat Path2D). */
export function iconPath(name) {
  return P[name] || '';
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
}

// ---------- Simbol 4 warna Kartu Kilat (dipakai di UI & tekstur kartu) ----------
export const SUIT_ICONS = {
  // api
  api: { fill: 'M12 2.5c1.2 3.6 5.5 5.6 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.7 1.6-4.4 2.7-5.4.3 1.7 1.3 2.8 2.4 3.2-.9-3.2.3-6.4.4-8.3z' },
  // matahari
  matahari: {
    fill: 'M12 7.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6z',
    stroke: 'M12 1.8v2.4M12 19.8v2.4M1.8 12h2.4M19.8 12h2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M4.8 19.2l1.7-1.7M17.5 6.5l1.7-1.7',
  },
  // daun
  daun: { fill: 'M4.5 19.5C4.5 10.5 10 4 20 3.5c0 10.5-6.5 16-15.5 16z', stroke: 'M4.5 19.5 14 10', strokeColor: 'cut' },
  // ombak
  ombak: { stroke: 'M2 8.5c2.5 0 2.5-2.2 5-2.2s2.5 2.2 5 2.2 2.5-2.2 5-2.2 2.5 2.2 5 2.2M2 13.5c2.5 0 2.5-2.2 5-2.2s2.5 2.2 5 2.2 2.5-2.2 5-2.2 2.5 2.2 5 2.2M2 18.5c2.5 0 2.5-2.2 5-2.2s2.5 2.2 5 2.2 2.5-2.2 5-2.2 2.5 2.2 5 2.2' },
};

export function suitIcon(suit) {
  const s = SUIT_ICONS[suit];
  if (!s) return '';
  let inner = '';
  if (s.fill) inner += `<path d="${s.fill}" fill="currentColor"/>`;
  if (s.stroke) inner += `<path d="${s.stroke}" fill="none" stroke="${s.strokeColor === 'cut' ? 'rgba(0,0,0,.25)' : 'currentColor'}" stroke-width="2.2" stroke-linecap="round"/>`;
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
}
