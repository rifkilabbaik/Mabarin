import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SPACES, GROUPS, fmt } from './rules.js';

// ---------- Ukuran papan ----------
export const BOARD = 1.2; // sisi papan (m) — jauh lebih besar dari Ludo (0,72 m)
export const BOARD_H = 0.045; // papan tebal, tidak menempel tipis di meja
const UNITS = 13; // sudut 2 satuan + 9 petak × 1 satuan + sudut 2 satuan
const PX = 2048;
const U = PX / UNITS;

/** Kotak petak dalam satuan papan (0..13), sisi luar untuk arah tulisan. */
export function spaceRect(i) {
  if (i === 0) return { x: 11, y: 11, w: 2, h: 2, rot: 0, corner: true };
  if (i < 10) return { x: 11 - i, y: 11, w: 1, h: 2, rot: 0 };
  if (i === 10) return { x: 0, y: 11, w: 2, h: 2, rot: Math.PI / 2, corner: true };
  if (i < 20) return { x: 0, y: 21 - i, w: 2, h: 1, rot: Math.PI / 2 };
  if (i === 20) return { x: 0, y: 0, w: 2, h: 2, rot: Math.PI, corner: true };
  if (i < 30) return { x: i - 19, y: 0, w: 1, h: 2, rot: Math.PI };
  if (i === 30) return { x: 11, y: 0, w: 2, h: 2, rot: -Math.PI / 2, corner: true };
  return { x: 11, y: i - 29, w: 2, h: 1, rot: -Math.PI / 2 };
}

/** Satuan papan → koordinat lokal papan (meter). */
export const unitToLocal = (ux, uy, out = new THREE.Vector3()) => out.set((ux / UNITS - 0.5) * BOARD, BOARD_H, (uy / UNITS - 0.5) * BOARD);

/**
 * Titik dalam petak: (a, b) relatif terhadap petak yang "berdiri" dengan sisi luar di bawah:
 * a = −0.5..0.5 sepanjang tepi, b = 0 (dalam/pita warna) .. 1 (luar).
 */
export function spacePoint(i, a, b, out = new THREE.Vector3()) {
  const r = spaceRect(i);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const fw = r.corner ? 2 : 1, fh = 2;
  const lx = a * fw, ly = (b - 0.5) * fh;
  const c = Math.cos(r.rot), s = Math.sin(r.rot);
  return unitToLocal(cx + lx * c - ly * s, cy + lx * s + ly * c, out);
}

/** Petak dari titik lokal papan (hasil raycast). */
export function spaceAt(local) {
  const ux = (local.x / BOARD + 0.5) * UNITS, uy = (local.z / BOARD + 0.5) * UNITS;
  for (let i = 0; i < 40; i++) {
    const r = spaceRect(i);
    if (ux >= r.x && ux < r.x + r.w && uy >= r.y && uy < r.y + r.h) return i;
  }
  return -1;
}

// tempat dua tumpukan kartu di tengah papan (satuan papan & putaran)
export const DECK_SPOTS = { peluang: { x: 8.7, y: 4.3, rot: -Math.PI / 4 }, kas: { x: 4.3, y: 8.7, rot: -Math.PI / 4 } };
const DECK_COLOR = { peluang: '#f08c1a', kas: '#2f80ed' };

// ---------- Ikon sederhana di canvas ----------
function icon(g, kind, s, color = '#2b2118') {
  g.save();
  g.fillStyle = g.strokeStyle = color;
  g.lineWidth = s * 0.07;
  g.lineJoin = g.lineCap = 'round';
  const rr = (x, y, w, h, r) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  };
  switch (kind) {
    case 'train':
      rr(-s * 0.32, -s * 0.42, s * 0.64, s * 0.7, s * 0.12);
      g.fill();
      g.fillStyle = '#f3ead2';
      g.fillRect(-s * 0.22, -s * 0.32, s * 0.44, s * 0.22);
      g.beginPath();
      g.arc(-s * 0.16, s * 0.12, s * 0.06, 0, 7);
      g.arc(s * 0.16, s * 0.12, s * 0.06, 0, 7);
      g.fill();
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(-s * 0.3, s * 0.42);
      g.lineTo(-s * 0.16, s * 0.28);
      g.moveTo(s * 0.3, s * 0.42);
      g.lineTo(s * 0.16, s * 0.28);
      g.stroke();
      break;
    case 'ship':
      g.beginPath();
      g.moveTo(-s * 0.45, s * 0.1);
      g.lineTo(s * 0.45, s * 0.1);
      g.lineTo(s * 0.3, s * 0.32);
      g.lineTo(-s * 0.3, s * 0.32);
      g.fill();
      g.beginPath();
      g.moveTo(-s * 0.05, s * 0.05);
      g.lineTo(-s * 0.05, -s * 0.45);
      g.lineTo(-s * 0.38, s * 0.02);
      g.closePath();
      g.moveTo(s * 0.05, s * 0.05);
      g.lineTo(s * 0.05, -s * 0.36);
      g.lineTo(s * 0.32, s * 0.02);
      g.closePath();
      g.fill();
      break;
    case 'plane':
      g.beginPath();
      g.moveTo(0, -s * 0.45);
      g.quadraticCurveTo(s * 0.07, -s * 0.4, s * 0.06, -s * 0.1);
      g.lineTo(s * 0.45, s * 0.08);
      g.lineTo(s * 0.45, s * 0.16);
      g.lineTo(s * 0.06, s * 0.08);
      g.lineTo(s * 0.04, s * 0.3);
      g.lineTo(s * 0.16, s * 0.4);
      g.lineTo(-s * 0.16, s * 0.4);
      g.lineTo(-s * 0.04, s * 0.3);
      g.lineTo(-s * 0.06, s * 0.08);
      g.lineTo(-s * 0.45, s * 0.16);
      g.lineTo(-s * 0.45, s * 0.08);
      g.lineTo(-s * 0.06, -s * 0.1);
      g.quadraticCurveTo(-s * 0.07, -s * 0.4, 0, -s * 0.45);
      g.fill();
      break;
    case 'bus':
      rr(-s * 0.4, -s * 0.3, s * 0.8, s * 0.5, s * 0.08);
      g.fill();
      g.fillStyle = '#f3ead2';
      for (let k = 0; k < 4; k++) g.fillRect(-s * 0.34 + k * s * 0.18, -s * 0.22, s * 0.13, s * 0.15);
      g.fillStyle = color;
      g.beginPath();
      g.arc(-s * 0.22, s * 0.24, s * 0.08, 0, 7);
      g.arc(s * 0.22, s * 0.24, s * 0.08, 0, 7);
      g.fill();
      break;
    case 'bulb':
      g.beginPath();
      g.arc(0, -s * 0.12, s * 0.26, Math.PI * 0.8, Math.PI * 2.2);
      g.lineTo(s * 0.1, s * 0.22);
      g.lineTo(-s * 0.1, s * 0.22);
      g.closePath();
      g.fillStyle = '#ffd43b';
      g.fill();
      g.stroke();
      g.fillStyle = color;
      g.fillRect(-s * 0.11, s * 0.26, s * 0.22, s * 0.14);
      break;
    case 'drop':
      g.beginPath();
      g.moveTo(0, -s * 0.42);
      g.bezierCurveTo(s * 0.3, -s * 0.05, s * 0.32, s * 0.12, s * 0.3, s * 0.18);
      g.arc(0, s * 0.16, s * 0.3, 0, Math.PI);
      g.bezierCurveTo(-s * 0.32, s * 0.12, -s * 0.3, -s * 0.05, 0, -s * 0.42);
      g.fillStyle = '#4dabf7';
      g.fill();
      break;
    case 'coin':
      g.beginPath();
      g.arc(0, 0, s * 0.36, 0, 7);
      g.fillStyle = '#f5c518';
      g.fill();
      g.stroke();
      g.fillStyle = color;
      g.font = `900 ${s * 0.34}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('Rp', 0, s * 0.02);
      break;
    case 'gem':
      g.beginPath();
      g.moveTo(-s * 0.36, -s * 0.1);
      g.lineTo(-s * 0.2, -s * 0.32);
      g.lineTo(s * 0.2, -s * 0.32);
      g.lineTo(s * 0.36, -s * 0.1);
      g.lineTo(0, s * 0.38);
      g.closePath();
      g.fillStyle = '#74c0fc';
      g.fill();
      g.stroke();
      break;
    case 'question':
      g.font = `900 ${s * 0.95}px Georgia, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('?', 0, s * 0.04);
      break;
    case 'chest':
      rr(-s * 0.38, -s * 0.18, s * 0.76, s * 0.5, s * 0.06);
      g.fill();
      g.beginPath();
      g.ellipse(0, -s * 0.18, s * 0.38, s * 0.2, 0, Math.PI, 0);
      g.fill();
      g.fillStyle = '#ffd43b';
      g.fillRect(-s * 0.07, -s * 0.12, s * 0.14, s * 0.16);
      break;
  }
  g.restore();
}

function wrap(g, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function lines(g, text, y, maxW, size, weight = 800) {
  g.font = `${weight} ${size}px system-ui, sans-serif`;
  const ls = wrap(g, text, maxW);
  ls.forEach((l, k) => g.fillText(l, 0, y + (k - (ls.length - 1) / 2) * size * 1.08));
}

// ---------- Gambar papan ----------
const INK = '#2b2118';
const PAPER = '#f3ead2';

function drawSpace(g, i) {
  const sp = SPACES[i];
  const r = spaceRect(i);
  g.save();
  g.translate((r.x + r.w / 2) * U, (r.y + r.h / 2) * U);
  g.rotate(r.rot);
  const fw = (r.corner ? 2 : 1) * U, fh = 2 * U;
  g.fillStyle = PAPER;
  g.fillRect(-fw / 2, -fh / 2, fw, fh);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = INK;
  const top = -fh / 2;
  if (sp.type === 'prop') {
    g.fillStyle = GROUPS[sp.group].color;
    g.fillRect(-fw / 2, top, fw, fh * 0.24);
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-fw / 2, top + fh * 0.24);
    g.lineTo(fw / 2, top + fh * 0.24);
    g.stroke();
    g.fillStyle = INK;
    lines(g, sp.name.toUpperCase(), top + fh * 0.45, fw * 0.86, 25);
    g.font = `700 26px system-ui, sans-serif`;
    g.fillText(fmt(sp.price), 0, top + fh * 0.87);
  } else if (sp.type === 'rail' || sp.type === 'util') {
    lines(g, sp.name.toUpperCase(), top + fh * 0.16, fw * 0.86, 23);
    icon(g, sp.icon, fw * 0.75);
    g.font = `700 26px system-ui, sans-serif`;
    g.fillText(fmt(sp.price), 0, top + fh * 0.87);
  } else if (sp.type === 'tax') {
    lines(g, sp.name.toUpperCase(), top + fh * 0.18, fw * 0.86, 23);
    g.save();
    g.translate(0, fh * 0.02);
    icon(g, sp.amount > 100 ? 'coin' : 'gem', fw * 0.7);
    g.restore();
    g.font = `700 24px system-ui, sans-serif`;
    g.fillText(`Bayar ${fmt(sp.amount)}`, 0, top + fh * 0.86);
  } else if (sp.type === 'peluang' || sp.type === 'kas') {
    const kas = sp.type === 'kas';
    lines(g, kas ? 'KAS RT' : 'PELUANG', top + fh * 0.16, fw * 0.9, 27, 900);
    g.save();
    g.translate(0, fh * 0.08);
    icon(g, kas ? 'chest' : 'question', fw * 0.8, kas ? '#2f80ed' : '#f08c1a');
    g.restore();
  } else if (sp.type === 'go') {
    g.save();
    g.rotate(-Math.PI / 4);
    g.font = `900 92px system-ui, sans-serif`;
    g.fillStyle = '#c92a2a';
    g.fillText('MULAI', 0, -8);
    g.fillStyle = INK;
    g.font = `700 24px system-ui, sans-serif`;
    g.fillText(`terima ${fmt(200)} setiap lewat`, 0, -78);
    g.restore();
    // panah arah jalan (ke kiri)
    g.fillStyle = '#c92a2a';
    g.beginPath();
    g.moveTo(-fw * 0.42, fh * 0.32);
    g.lineTo(-fw * 0.1, fh * 0.16);
    g.lineTo(-fw * 0.1, fh * 0.26);
    g.lineTo(fw * 0.35, fh * 0.26);
    g.lineTo(fw * 0.35, fh * 0.38);
    g.lineTo(-fw * 0.1, fh * 0.38);
    g.lineTo(-fw * 0.1, fh * 0.48);
    g.closePath();
    g.fill();
  } else if (sp.type === 'jail') {
    // sel penjara di bagian dalam (menghadap tengah papan), "cuma mampir" di jalur luar berbentuk L
    const s0 = fw * 0.3;
    g.fillStyle = '#f08c1a';
    g.fillRect(-fw / 2, -fh / 2, fw - s0, fh - s0);
    g.fillStyle = '#fff4e0';
    g.fillRect(-fw / 2 + 18, -fh / 2 + 18, fw - s0 - 36, fh - s0 - 36);
    g.strokeStyle = INK;
    g.lineWidth = 7;
    for (let k = 0; k < 5; k++) {
      const x = -fw / 2 + 40 + k * ((fw - s0 - 80) / 4);
      g.beginPath();
      g.moveTo(x, -fh / 2 + 22);
      g.lineTo(x, fh / 2 - s0 - 22);
      g.stroke();
    }
    g.save();
    g.translate(-fw / 2 + (fw - s0) / 2, -fh / 2 + (fh - s0) / 2);
    g.rotate(-Math.PI / 4);
    g.fillStyle = 'rgba(255,244,224,0.88)';
    g.fillRect(-104, -26, 208, 52);
    g.fillStyle = INK;
    g.font = `900 40px system-ui, sans-serif`;
    g.fillText('PENJARA', 0, 2);
    g.restore();
    g.fillStyle = INK;
    g.font = `800 25px system-ui, sans-serif`;
    g.save();
    g.translate(fw / 2 - s0 / 2, -fh * 0.12);
    g.rotate(-Math.PI / 2);
    g.fillText('CUMA', 0, 0);
    g.restore();
    g.fillText('MAMPIR', -fw * 0.08, fh / 2 - s0 / 2);
  } else if (sp.type === 'free') {
    g.save();
    g.rotate(-Math.PI / 4);
    g.font = `900 58px system-ui, sans-serif`;
    g.fillStyle = '#2b9a48';
    g.fillText('ISTIRAHAT', 0, 70);
    g.fillStyle = INK;
    // cangkir kopi
    g.beginPath();
    g.roundRect(-46, -70, 92, 84, 16);
    g.fill();
    g.lineWidth = 12;
    g.strokeStyle = INK;
    g.beginPath();
    g.arc(56, -30, 22, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    g.lineWidth = 6;
    for (const x of [-22, 0, 22]) {
      g.beginPath();
      g.moveTo(x, -84);
      g.quadraticCurveTo(x + 10, -100, x, -116);
      g.stroke();
    }
    g.restore();
  } else if (sp.type === 'gojail') {
    g.save();
    g.rotate(-Math.PI / 4);
    g.font = `900 52px system-ui, sans-serif`;
    g.fillStyle = '#1c4fa0';
    g.fillText('MASUK', 0, -60);
    g.fillText('PENJARA', 0, 76);
    // peluit
    g.fillStyle = INK;
    g.beginPath();
    g.roundRect(-60, -24, 100, 44, 22);
    g.fill();
    g.fillRect(30, -24, 40, 18);
    g.fillStyle = PAPER;
    g.beginPath();
    g.arc(-20, -2, 10, 0, 7);
    g.fill();
    g.restore();
  }
  g.restore();
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.strokeRect(r.x * U, r.y * U, r.w * U, r.h * U);
}

function drawBoard(g) {
  g.fillStyle = PAPER;
  g.fillRect(0, 0, PX, PX);
  // tengah papan
  const grd = g.createLinearGradient(2 * U, 2 * U, 11 * U, 11 * U);
  grd.addColorStop(0, '#d7ecd9');
  grd.addColorStop(1, '#b9dcc0');
  g.fillStyle = grd;
  g.fillRect(2 * U, 2 * U, 9 * U, 9 * U);
  // pola batik tipis
  g.strokeStyle = 'rgba(43, 154, 72, 0.13)';
  g.lineWidth = 4;
  for (let x = 2.5; x < 11; x += 1) {
    for (let y = 2.5; y < 11; y += 1) {
      g.beginPath();
      g.ellipse(x * U, y * U, U * 0.32, U * 0.16, Math.PI / 4, 0, 7);
      g.stroke();
    }
  }
  for (let i = 0; i < 40; i++) drawSpace(g, i);
  // logo
  g.save();
  g.translate(6.5 * U, 6.5 * U);
  g.rotate(-Math.PI / 4);
  g.fillStyle = '#9c1c1c';
  g.beginPath();
  g.roundRect(-430, -105, 860, 190, 40);
  g.fill();
  g.strokeStyle = '#f5c518';
  g.lineWidth = 10;
  g.beginPath();
  g.roundRect(-410, -86, 820, 152, 30);
  g.stroke();
  g.fillStyle = '#fff4e0';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 150px Georgia, 'Times New Roman', serif`;
  g.fillText('JURAGAN', 0, -6);
  g.fillStyle = '#2b2118';
  g.font = `800 40px system-ui, sans-serif`;
  g.fillText('TUAN TANAH NUSANTARA', 0, 140);
  g.restore();
  // tempat tumpukan kartu
  for (const [deck, d] of Object.entries(DECK_SPOTS)) {
    g.save();
    g.translate(d.x * U, d.y * U);
    g.rotate(d.rot);
    g.setLineDash([22, 14]);
    g.strokeStyle = DECK_COLOR[deck];
    g.lineWidth = 8;
    g.strokeRect(-1.35 * U, -0.95 * U, 2.7 * U, 1.9 * U);
    g.setLineDash([]);
    g.fillStyle = DECK_COLOR[deck];
    g.font = `900 46px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillText(deck === 'kas' ? 'KAS RT' : 'PELUANG', 0, 1.25 * U);
    g.restore();
  }
  g.strokeStyle = INK;
  g.lineWidth = 8;
  g.strokeRect(4, 4, PX - 8, PX - 8);
  g.strokeRect(2 * U, 2 * U, 9 * U, 9 * U);
}

/** Papan tebal: kotak kayu + permukaan bergambar (juga target klik). */
export function makeBoard() {
  const group = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  drawBoard(c.getContext('2d'));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const side = new THREE.MeshLambertMaterial({ color: '#5a3a22' });
  const base = new THREE.Mesh(new THREE.BoxGeometry(BOARD + 0.03, BOARD_H, BOARD + 0.03), side);
  base.position.y = BOARD_H / 2;
  base.castShadow = base.receiveShadow = true;
  const topMesh = new THREE.Mesh(new THREE.PlaneGeometry(BOARD, BOARD), new THREE.MeshLambertMaterial({ map: tex }));
  topMesh.rotation.x = -Math.PI / 2;
  topMesh.position.y = BOARD_H + 0.0008;
  topMesh.receiveShadow = true;
  topMesh.userData.isBoard = true;
  group.add(base, topMesh);
  group.userData.top = topMesh;
  return group;
}

// ---------- Bidak orisinal (logam mengilap di atas alas warna pemain) ----------
const pewter = () => new THREE.MeshPhongMaterial({ color: '#c6cbd2', specular: '#ffffff', shininess: 80 });
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const at = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => geo.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
const wheel = (r, x, y, z, ry = Math.PI / 2) => at(new THREE.TorusGeometry(r, r * 0.22, 6, 16), x, y, z, 0, ry, 0);

const TOKEN_GEO = {
  becak: () => [
    wheel(0.009, -0.015, 0.01, 0.012), wheel(0.009, 0.015, 0.01, 0.012), wheel(0.009, 0, 0.01, -0.021),
    at(new THREE.BoxGeometry(0.03, 0.007, 0.018), 0, 0.02, 0.012),
    at(new THREE.BoxGeometry(0.03, 0.014, 0.004), 0, 0.027, 0.003),
    at(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 12, 1, true, -Math.PI / 2, Math.PI), 0, 0.028, 0.009, 0, 0, Math.PI / 2),
    at(cyl(0.0018, 0.0018, 0.034), 0, 0.02, -0.006, Math.PI / 2.6),
    at(new THREE.BoxGeometry(0.008, 0.003, 0.01), 0, 0.034, -0.017),
    at(cyl(0.0015, 0.0015, 0.024), 0, 0.03, -0.006, 0, 0, Math.PI / 2),
  ],
  pinisi: () => [
    at(new THREE.BoxGeometry(0.016, 0.009, 0.036), 0, 0.009, 0),
    at(new THREE.ConeGeometry(0.008, 0.016, 4), 0, 0.009, 0.026, Math.PI / 2, 0, Math.PI / 4),
    at(cyl(0.0012, 0.0012, 0.044), 0, 0.034, 0.006), at(cyl(0.0012, 0.0012, 0.036), 0, 0.03, -0.01),
    at(new THREE.BoxGeometry(0.0015, 0.026, 0.016), 0, 0.034, 0.014), at(new THREE.BoxGeometry(0.0015, 0.02, 0.013), 0, 0.03, -0.003),
    at(new THREE.BoxGeometry(0.0015, 0.014, 0.01), 0, 0.022, 0.028, Math.PI / 5),
  ],
  ayam: () => [
    at(new THREE.SphereGeometry(0.012, 12, 10).scale(1, 0.95, 1.3), 0, 0.022, 0),
    at(new THREE.SphereGeometry(0.0072, 10, 8), 0, 0.037, 0.011),
    at(new THREE.ConeGeometry(0.0028, 0.007, 6), 0, 0.036, 0.019, Math.PI / 2),
    at(new THREE.BoxGeometry(0.0022, 0.006, 0.009), 0, 0.045, 0.01),
    at(new THREE.ConeGeometry(0.009, 0.026, 8).scale(0.5, 1, 1), 0, 0.034, -0.016, -0.7),
    at(cyl(0.0014, 0.0014, 0.012), -0.004, 0.006, 0.002), at(cyl(0.0014, 0.0014, 0.012), 0.004, 0.006, 0.002),
  ],
  ontel: () => [
    wheel(0.012, 0, 0.014, 0.018), wheel(0.012, 0, 0.014, -0.018),
    at(cyl(0.0016, 0.0016, 0.03), 0, 0.022, 0, Math.PI / 2),
    at(cyl(0.0016, 0.0016, 0.022), 0, 0.022, -0.009, 0.5), at(cyl(0.0016, 0.0016, 0.02), 0, 0.024, 0.012, -0.35),
    at(new THREE.BoxGeometry(0.006, 0.003, 0.01), 0, 0.033, -0.012),
    at(cyl(0.0014, 0.0014, 0.018), 0, 0.034, 0.016, 0, 0, Math.PI / 2),
  ],
  peci: () => [at(cyl(0.0135, 0.0155, 0.022, 24).scale(1.3, 1, 0.85), 0, 0.012, 0), at(cyl(0.0138, 0.0138, 0.003, 24).scale(1.3, 1, 0.85), 0, 0.0235, 0)],
  kendi: () => {
    const prof = [[0.001, 0], [0.008, 0.001], [0.013, 0.008], [0.014, 0.016], [0.011, 0.024], [0.005, 0.029], [0.004, 0.036], [0.006, 0.039], [0.001, 0.039]].map(([x, y]) => new THREE.Vector2(x, y));
    return [new THREE.LatheGeometry(prof, 18).translate(0, 0.003, 0), at(cyl(0.0018, 0.003, 0.016), 0.013, 0.025, 0, 0, 0, -0.9)];
  },
};

const tokenCache = new Map();
/** Model bidak (Group) dengan alas warna pemain. */
export function makeToken(id, color) {
  let geo = tokenCache.get(id);
  if (!geo) {
    geo = mergeGeometries((TOKEN_GEO[id] || TOKEN_GEO.peci)().map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => {
      x.deleteAttribute('uv');
      return x;
    }));
    tokenCache.set(id, geo);
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo, pewter());
  body.position.y = 0.004;
  body.scale.setScalar(1.6);
  body.castShadow = true;
  const base = new THREE.Mesh(cyl(0.022, 0.024, 0.005, 20), new THREE.MeshLambertMaterial({ color }));
  base.position.y = 0.0025;
  g.add(base, body);
  return g;
}

// ---------- Dadu ----------
function diceFace(n) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfbf7';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = n === 1 ? '#c92a2a' : '#1d2333';
  const P = { 1: [[32, 32]], 2: [[18, 18], [46, 46]], 3: [[16, 16], [32, 32], [48, 48]], 4: [[18, 18], [46, 18], [18, 46], [46, 46]], 5: [[16, 16], [48, 16], [32, 32], [16, 48], [48, 48]], 6: [[18, 14], [46, 14], [18, 32], [46, 32], [18, 50], [46, 50]] }[n];
  for (const [x, y] of P) {
    g.beginPath();
    g.arc(x, y, n === 1 ? 9 : 6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// sisi kubus: +x,-x,+y,-y,+z,-z → angka 3,4,1,6,2,5
const FACE_NUM = [3, 4, 1, 6, 2, 5];
export const DICE_UP = { 1: [0, 0], 6: [Math.PI, 0], 2: [-Math.PI / 2, 0], 5: [Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2] };
let diceMats = null;
export function makeDie() {
  diceMats ||= FACE_NUM.map((n) => new THREE.MeshLambertMaterial({ map: diceFace(n) }));
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.032), diceMats);
  m.castShadow = true;
  return m;
}

// ---------- Rumah & hotel ----------
let bld = null;
function buildingKit() {
  if (bld) return bld;
  const roof = (w, d, h) => new THREE.CylinderGeometry(0, Math.SQRT1_2 * 1, 1, 4, 1).rotateY(Math.PI / 4).scale(w, h, d);
  bld = {
    houseWall: new THREE.BoxGeometry(0.016, 0.012, 0.018).translate(0, 0.006, 0),
    houseRoof: roof(0.02, 0.022, 0.012).translate(0, 0.018, 0),
    hotelWall: new THREE.BoxGeometry(0.03, 0.022, 0.02).translate(0, 0.011, 0),
    hotelRoof: roof(0.034, 0.024, 0.01).translate(0, 0.027, 0),
    wall: new THREE.MeshLambertMaterial({ color: '#fff4e0' }),
    roof: new THREE.MeshLambertMaterial({ color: '#d9480f' }),
    hwall: new THREE.MeshLambertMaterial({ color: '#f8f9fa' }),
    hroof: new THREE.MeshLambertMaterial({ color: '#1c7ed6' }),
  };
  return bld;
}

export function makeHouse(hotel = false) {
  const k = buildingKit();
  const g = new THREE.Group();
  const a = new THREE.Mesh(hotel ? k.hotelWall : k.houseWall, hotel ? k.hwall : k.wall);
  const b = new THREE.Mesh(hotel ? k.hotelRoof : k.houseRoof, hotel ? k.hroof : k.roof);
  a.castShadow = b.castShadow = true;
  g.add(a, b);
  return g;
}

// ---------- Kartu kecil di meja (hak milik, bebas penjara, tumpukan kartu) ----------
const cardTex = new Map();
function cardTexture(key, draw) {
  let t = cardTex.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 224;
    const g = c.getContext('2d');
    g.fillStyle = '#fffdf6';
    g.beginPath();
    g.roundRect(0, 0, 160, 224, 14);
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    draw(g);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    cardTex.set(key, t);
  }
  return t;
}

export function deedTexture(i) {
  return cardTexture(`d${i}`, (g) => {
    const sp = SPACES[i];
    const color = sp.type === 'prop' ? GROUPS[sp.group].color : '#495057';
    g.fillStyle = color;
    g.fillRect(10, 10, 140, 70);
    g.fillStyle = sp.type === 'prop' && ['kuning', 'biruMuda'].includes(sp.group) ? INK : '#fff';
    g.font = '700 15px system-ui, sans-serif';
    g.fillText('HAK MILIK', 80, 30);
    g.font = '900 19px system-ui, sans-serif';
    const ls = wrap(g, sp.name.toUpperCase(), 130);
    ls.forEach((l, k) => g.fillText(l, 80, 56 + (k - (ls.length - 1) / 2) * 20));
    g.fillStyle = INK;
    if (sp.type !== 'prop') {
      g.save();
      g.translate(80, 140);
      icon(g, sp.icon, 90);
      g.restore();
    } else {
      g.font = '600 15px system-ui, sans-serif';
      g.fillText(`Sewa ${fmt(sp.rent[0])}`, 80, 112);
      g.fillText(`Hotel ${fmt(sp.rent[5])}`, 80, 140);
    }
    g.font = '800 18px system-ui, sans-serif';
    g.fillText(fmt(sp.price), 80, 196);
  });
}

export function freeCardTexture() {
  return cardTexture('free', (g) => {
    g.fillStyle = '#f08c1a';
    g.fillRect(10, 10, 140, 204);
    g.fillStyle = '#fff';
    g.font = '900 22px system-ui, sans-serif';
    g.fillText('BEBAS', 80, 70);
    g.fillText('PENJARA', 80, 98);
    g.font = '600 14px system-ui, sans-serif';
    g.fillText('simpan atau', 80, 150);
    g.fillText('jual ke pemain', 80, 168);
  });
}

export function deckTexture(deck) {
  return cardTexture(`k${deck}`, (g) => {
    g.fillStyle = DECK_COLOR[deck];
    g.fillRect(8, 8, 144, 208);
    g.fillStyle = '#fff';
    g.font = `900 ${deck === 'kas' ? 30 : 26}px system-ui, sans-serif`;
    g.save();
    g.translate(80, 112);
    g.rotate(-Math.PI / 2);
    g.fillText(DECK_NAME_UP[deck], 0, 0);
    g.restore();
  });
}
const DECK_NAME_UP = { peluang: 'PELUANG', kas: 'KAS RT' };

export const CARD_W = 0.05, CARD_L = 0.07;
const cardGeo = new THREE.PlaneGeometry(CARD_W, CARD_L).rotateX(-Math.PI / 2);
export function makeCardMesh(tex) {
  const m = new THREE.Mesh(cardGeo, new THREE.MeshLambertMaterial({ map: tex }));
  m.receiveShadow = true;
  return m;
}

/** Tumpukan kartu Peluang / Kas RT di tengah papan. */
export function makeDeck(deck) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.108, 0.014, 0.076), new THREE.MeshLambertMaterial({ color: '#f1ead8' }));
  box.position.y = 0.007;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(0.072, 0.104).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: deckTexture(deck) }));
  top.position.y = 0.0145;
  top.rotation.y = Math.PI / 2;
  g.add(box, top);
  return g;
}

// ---------- HP ----------
export const PHONE_W = 0.072, PHONE_L = 0.148, PHONE_T = 0.008;
function phoneScreen(color) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, color);
  grd.addColorStop(1, '#141824');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = '800 30px system-ui, sans-serif';
  g.fillText('Rp', 64, 112);
  g.font = '700 13px system-ui, sans-serif';
  g.fillText('Bank Juragan', 64, 140);
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.fillRect(44, 236, 40, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** HP di meja: badan gelap + layar menyala (layar menghadap +y). */
export function makePhone(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(PHONE_W, PHONE_T, PHONE_L), new THREE.MeshLambertMaterial({ color: '#1f2430' }));
  body.castShadow = true;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(PHONE_W * 0.9, PHONE_L * 0.93).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: phoneScreen(color), transparent: true }));
  screen.position.y = PHONE_T / 2 + 0.0006;
  g.add(body, screen);
  g.userData.body = body;
  g.userData.screen = screen;
  return g;
}
