import { sanitizeLook } from '../character/looks.js';

// Ikon wajah karakter chibi (2D, dari data tampilan) untuk daftar giliran di meja game.
const cache = new Map();

export function avatarUrl(look, color) {
  const L = sanitizeLook(look, color);
  const key = JSON.stringify(L);
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const circle = (x, y, r) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  const ellipse = (x, y, rx, ry) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  g.save();
  g.beginPath();
  g.arc(32, 32, 32, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#e7edf5';
  g.fillRect(0, 0, 64, 64);
  // baju
  g.fillStyle = L.topColor;
  ellipse(32, 68, 27, 20);
  // rambut di belakang kepala
  g.fillStyle = L.hairColor;
  if (L.hair === 'afro') circle(32, 28, 23);
  if (L.hair === 'long') g.fillRect(13, 26, 38, 26);
  if (L.hair === 'bob') g.fillRect(14, 24, 36, 18);
  if (L.hair === 'ponytail') ellipse(52, 36, 6, 11);
  if (L.hair === 'buns') {
    circle(17, 14, 7);
    circle(47, 14, 7);
  }
  // kepala
  g.fillStyle = L.skin;
  circle(32, 32, 17);
  // rambut bagian atas
  g.fillStyle = L.hairColor;
  if (L.hair !== 'none' && L.hair !== 'mohawk') {
    g.beginPath();
    g.ellipse(32, 26, 18, 13, 0, Math.PI, 0);
    g.fill();
  }
  if (L.hair === 'spiky') {
    g.beginPath();
    g.moveTo(14, 26);
    for (let i = 0; i <= 5; i++) g.lineTo(16 + i * 6.4, i % 2 ? 6 : 14);
    g.lineTo(50, 26);
    g.fill();
  }
  if (L.hair === 'mohawk') g.fillRect(28, 8, 8, 14);
  // mata
  g.fillStyle = '#1d2333';
  g.strokeStyle = '#1d2333';
  g.lineWidth = 2.2;
  g.lineCap = 'round';
  for (const x of [25.5, 38.5]) {
    if (L.eyes === 'happy') {
      g.beginPath();
      g.arc(x, 36, 3, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    } else if (L.eyes === 'sleepy') {
      g.beginPath();
      g.moveTo(x - 3, 35);
      g.lineTo(x + 3, 35);
      g.stroke();
    } else {
      const r = L.eyes === 'big' ? 3.4 : 2.5;
      circle(x, 35, r);
      g.fillStyle = '#fff';
      circle(x + 0.9, 34, r * 0.35);
      g.fillStyle = '#1d2333';
    }
  }
  // pipi
  g.fillStyle = 'rgba(255,120,140,0.35)';
  circle(21, 41, 3);
  circle(43, 41, 3);
  // topi
  const hats = { cap: '#e03131', beanie: '#4dabf7', cowboy: '#8b5a2b', crown: '#fcc419' };
  if (hats[L.hat]) {
    g.fillStyle = hats[L.hat];
    if (L.hat === 'crown') {
      g.beginPath();
      g.moveTo(20, 18);
      g.lineTo(22, 6);
      g.lineTo(27, 13);
      g.lineTo(32, 4);
      g.lineTo(37, 13);
      g.lineTo(42, 6);
      g.lineTo(44, 18);
      g.fill();
    } else if (L.hat === 'cowboy') {
      ellipse(32, 19, 25, 5);
      ellipse(32, 13, 12, 8);
    } else {
      g.beginPath();
      g.ellipse(32, 20, 17, 12, 0, Math.PI, 0);
      g.fill();
      if (L.hat === 'cap') ellipse(42, 20, 12, 3);
    }
  }
  g.restore();
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
