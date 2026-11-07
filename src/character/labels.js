import * as THREE from 'three';

// Sprite teks (nama & gelembung chat) digambar pakai canvas 2D.
const FONT = '600 40px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeSprite(canvas, worldHeight) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, 0);
  sprite.scale.set((canvas.width / canvas.height) * worldHeight, worldHeight, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function createNameTag(name, color = '#ffffff') {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = FONT;
  const text = name.slice(0, 18);
  const w = Math.ceil(ctx.measureText(text).width) + 56;
  canvas.width = Math.max(96, w);
  canvas.height = 64;
  ctx.font = FONT;
  roundRect(ctx, 2, 2, canvas.width - 4, 60, 28);
  ctx.fillStyle = 'rgba(20, 24, 36, 0.62)';
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(26, 32, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 42, 34);
  return makeSprite(canvas, 0.36);
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else line = test;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…');
  }
  return lines;
}

export function createChatBubble(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = FONT;
  const lines = wrapText(ctx, text, 520, 3);
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  canvas.width = Math.ceil(textW) + 60;
  canvas.height = lines.length * 50 + 52;
  ctx.font = FONT;
  const h = canvas.height - 20;
  roundRect(ctx, 3, 3, canvas.width - 6, h - 3, 26);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.stroke();
  // ekor gelembung
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 - 14, h - 2);
  ctx.lineTo(canvas.width / 2, canvas.height - 2);
  ctx.lineTo(canvas.width / 2 + 14, h - 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.fillStyle = '#1d2333';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, 30 + i * 50));
  return makeSprite(canvas, (canvas.height / 64) * 0.34);
}

export function disposeSprite(sprite) {
  if (!sprite) return;
  sprite.material.map?.dispose();
  sprite.material.dispose();
  sprite.removeFromParent();
}
