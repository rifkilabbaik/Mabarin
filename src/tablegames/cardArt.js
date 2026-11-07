import * as THREE from 'three';
import { SUITS, SUIT_INFO } from './games/kilatRules.js';

// Semua muka kartu digambar sekali ke satu atlas (canvas) → satu tekstur, hemat memori.
// Berisi kartu Kartu Kilat (warna saja, tanpa simbol) + kartu Gertak.
const CW = 128, CH = 192, COLS = 8, ROWS = 8;
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', 'p2'];
export const GERTAK_RANKS = ['bintang', 'bulan', 'hati'];
const KEYS = [...SUITS.flatMap((s) => VALUES.map((v) => `${s}:${v}`)), 'wild', 'wild4', 'back', ...GERTAK_RANKS.map((r) => `g:${r}`), 'g:joker'];
export const GERTAK_STYLE = {
  bintang: { bg: '#f59f00', dark: '#c77700', path: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z' },
  bulan: { bg: '#5f3dc4', dark: '#3b2a8c', path: 'M15.5 3.2A9 9 0 1 0 20.8 15 7.2 7.2 0 0 1 15.5 3.2z' },
  hati: { bg: '#e03131', dark: '#a61e1e', path: 'M12 20.5s-8-4.9-8-11A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 8 3.2c0 6.1-8 11-8 11z' },
};

const SKIP = new Path2D('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8');
const REV = new Path2D('M4 9h13l-3.5-3.5M20 15H7l3.5 3.5');
const BOLT = new Path2D('M13 2 4 14h7l-1 8 9-12h-7z');

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPath(ctx, d, cx, cy, size, color) {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(d));
  ctx.restore();
}

function drawGertak(ctx, key, w, h) {
  const rank = key.slice(2);
  const joker = rank === 'joker';
  const st = GERTAK_STYLE[rank];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, joker ? '#2b2f3a' : st.bg);
  g.addColorStop(1, joker ? '#3d4252' : st.dark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore(); // lepas clip
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#fff';
  rr(ctx, 10, 10, w - 20, h - 20, 11);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2 - 8, 38, 0, Math.PI * 2);
  ctx.fill();
  if (joker) quadrants(ctx, w / 2, h / 2 - 8, 32);
  else drawPath(ctx, st.path, w / 2, h / 2 - 8, 52, st.bg);
  ctx.fillStyle = '#fff';
  ctx.font = '800 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(joker ? 'JOKER' : rank.toUpperCase(), w / 2, h - 34);
}

function quadrants(ctx, cx, cy, r) {
  SUITS.forEach((s, i) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, -Math.PI / 2 + (i * Math.PI) / 2, -Math.PI / 2 + ((i + 1) * Math.PI) / 2);
    ctx.closePath();
    ctx.fillStyle = SUIT_INFO[s].color;
    ctx.fill();
  });
}

function valueText(v) {
  return { p2: '+2', wild4: '+4' }[v] ?? v;
}

function drawFace(ctx, key, x, y) {
  const w = CW, h = CH, pad = 4;
  ctx.save();
  ctx.translate(x, y);
  rr(ctx, pad, pad, w - pad * 2, h - pad * 2, 16);
  ctx.save();
  ctx.clip();

  if (key === 'back') {
    ctx.fillStyle = '#22324d';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 10;
    for (let i = -h; i < w + h; i += 22) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
    quadrants(ctx, w / 2, h / 2, 40);
    ctx.fillStyle = '#22324d';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(w / 2 - 22, h / 2 - 22);
    ctx.scale(44 / 24, 44 / 24);
    ctx.fillStyle = '#ffe066';
    ctx.fill(BOLT);
    ctx.restore();
    ctx.restore();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#f8f9fa';
    rr(ctx, pad + 6, pad + 6, w - pad * 2 - 12, h - pad * 2 - 12, 11);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (key.startsWith('g:')) {
    drawGertak(ctx, key, w, h);
    ctx.restore();
    return;
  }

  const wild = key === 'wild' || key === 'wild4';
  const [suit, value] = wild ? [null, key] : key.split(':');
  const info = suit ? SUIT_INFO[suit] : null;

  // latar
  if (wild) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#2b2f3a');
    g.addColorStop(1, '#3d4252');
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, info.color);
    g.addColorStop(1, info.dark);
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, w, h);
  // motif titik halus
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let yy = 14; yy < h; yy += 16) for (let xx = (yy / 16) % 2 ? 10 : 18; xx < w; xx += 16) {
    ctx.beginPath();
    ctx.arc(xx, yy, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // bingkai putih
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ffffff';
  rr(ctx, pad + 6, pad + 6, w - pad * 2 - 12, h - pad * 2 - 12, 11);
  ctx.stroke();

  // lencana tengah
  const cx = w / 2, cy = h / 2, R = 38;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  const ink = info ? info.dark : '#2b2f3a';
  if (wild) {
    quadrants(ctx, cx, cy, R - 6);
    if (value === 'wild4') {
      ctx.font = '900 34px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#2b2f3a';
      ctx.strokeText('+4', cx, cy + 2);
      ctx.fillStyle = '#fff';
      ctx.fillText('+4', cx, cy + 2);
    }
  } else if (value === 'skip' || value === 'rev') {
    ctx.save();
    ctx.translate(cx - 24, cy - 24);
    ctx.scale(2, 2);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(value === 'skip' ? SKIP : REV);
    ctx.restore();
  } else {
    ctx.fillStyle = ink;
    ctx.font = `900 ${value === 'p2' ? 38 : 50}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(valueText(value), cx, cy + 3);
    if (value === '6' || value === '9') ctx.fillRect(cx - 12, cy + 25, 24, 4);
  }

  // pojok: nilai + simbol warna
  const corner = (rot) => {
    ctx.save();
    if (rot) {
      ctx.translate(w, h);
      ctx.rotate(Math.PI);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '900 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (wild) {
      quadrants(ctx, 26, 28, 11);
      if (value === 'wild4') ctx.fillText('+4', 26, 52);
    } else {
      if (value === 'skip' || value === 'rev') {
        ctx.save();
        ctx.translate(14, 16);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke(value === 'skip' ? SKIP : REV);
        ctx.restore();
      } else ctx.fillText(valueText(value), 26, 28);
    }
    ctx.restore();
  };
  corner(false);
  corner(true);
  ctx.restore();
}

let atlas = null;
export function cardAtlas() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = CW * COLS;
  canvas.height = CH * ROWS;
  const ctx = canvas.getContext('2d');
  KEYS.forEach((k, i) => drawFace(ctx, k, (i % COLS) * CW, Math.floor(i / COLS) * CH));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  atlas = {
    texture: tex,
    material: new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5 }),
    dimMaterial: new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, color: '#8d929c' }),
  };
  return atlas;
}

// Geometri kartu (1 × 1.5) dengan UV menunjuk sel atlas.
const geoCache = new Map();
export function cardGeometry(key) {
  let g = geoCache.get(key);
  if (g) return g;
  const i = KEYS.indexOf(key);
  const col = i % COLS, row = Math.floor(i / COLS);
  g = new THREE.PlaneGeometry(1, 1.5);
  const uv = g.attributes.uv;
  const u0 = col / COLS, u1 = (col + 1) / COLS;
  const v1 = 1 - row / ROWS, v0 = 1 - (row + 1) / ROWS;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
  geoCache.set(key, g);
  return g;
}

/** Kartu 2 sisi. key = faceKey(id) atau null untuk kartu tertutup. */
export function makeCard(key) {
  const { material } = cardAtlas();
  const g = new THREE.Group();
  const front = new THREE.Mesh(cardGeometry(key || 'back'), material);
  const back = new THREE.Mesh(cardGeometry('back'), material);
  back.rotation.y = Math.PI;
  g.add(front, back);
  g.userData.front = front;
  g.userData.key = key;
  return g;
}

export function setCardFace(card, key) {
  if (card.userData.key === key) return;
  card.userData.key = key;
  card.userData.front.geometry = cardGeometry(key || 'back');
}
