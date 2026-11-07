import * as THREE from 'three';
import { clamp } from '../utils/math.js';

const MAP_RES = 384; // resolusi gambar pulau (px)
const MINIMAP_RADIUS = 48; // jangkauan minimap (unit dunia dari pemain ke tepi)
const LIGHT = new THREE.Vector3(-0.5, 0.75, -0.45).normalize();

/**
 * Minimap (berputar mengikuti kamera) + peta pulau penuh dengan nama & daftar pemain.
 * Gambar pulau dibuat sekali dari heightfield, jadi biaya per frame kecil.
 */
export class MapView {
  constructor({ world, minimapCanvas, fullCanvas, overlay, listEl, countEl, onToggle }) {
    this.world = world;
    this.minimap = minimapCanvas;
    this.full = fullCanvas;
    this.overlay = overlay;
    this.listEl = listEl;
    this.countEl = countEl;
    this.onToggle = onToggle;
    this.isOpen = false;
    this.mmTimer = 0;
    this.fullTimer = 0;
    this.listSig = '';
    this.image = this.buildIslandImage();
  }

  // ---------- Gambar pulau ----------
  buildIslandImage() {
    const w = this.world;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = MAP_RES;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(MAP_RES, MAP_RES);
    const color = new THREE.Color();
    const n = new THREE.Vector3();
    const step = w.size / MAP_RES;

    for (let py = 0; py < MAP_RES; py++) {
      for (let px = 0; px < MAP_RES; px++) {
        const x = -w.half + (px + 0.5) * step;
        const z = -w.half + (py + 0.5) * step;
        const h = w.getHeight(x, z);
        const hx = w.getHeight(x + 1, z) - w.getHeight(x - 1, z);
        const hz = w.getHeight(x, z + 1) - w.getHeight(x, z - 1);
        n.set(-hx, 2, -hz).normalize();

        if (h < w.waterLevel) {
          const depth = clamp((w.waterLevel - h) / 6, 0, 1);
          color.set('#7fd0ef').lerp(_deep, depth);
        } else {
          w.terrainColor(h, n.y, x, z, color);
          const shade = 0.72 + Math.max(0, n.dot(LIGHT)) * 0.42;
          color.multiplyScalar(shade);
        }
        color.convertLinearToSRGB();
        const i = (py * MAP_RES + px) * 4;
        img.data[i] = clamp(color.r, 0, 1) * 255;
        img.data[i + 1] = clamp(color.g, 0, 1) * 255;
        img.data[i + 2] = clamp(color.b, 0, 1) * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Pohon, batu, tenda, api unggun
    const toPx = (v) => ((v + w.half) / w.size) * MAP_RES;
    const m = w.props.markers;
    const dot = (list, fill, r) => {
      ctx.fillStyle = fill;
      for (const it of list) {
        ctx.beginPath();
        ctx.arc(toPx(it.x), toPx(it.z), r * (it.s || 1), 0, Math.PI * 2);
        ctx.fill();
      }
    };
    dot(m.rocks, 'rgba(120,118,112,0.9)', 1.1);
    dot(m.pines, 'rgba(28,86,52,0.85)', 1.5);
    dot(m.rounds, 'rgba(70,140,45,0.9)', 1.7);
    for (const t of m.tents) {
      ctx.fillStyle = t.color;
      ctx.beginPath();
      const x = toPx(t.x), y = toPx(t.z);
      ctx.moveTo(x, y - 3.5);
      ctx.lineTo(x + 3.5, y + 3);
      ctx.lineTo(x - 3.5, y + 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#8b5a2b';
    for (const t of m.cardTables) {
      ctx.beginPath();
      ctx.arc(toPx(t.x), toPx(t.z), 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.arc(toPx(m.campfire.x), toPx(m.campfire.z), 2.6, 0, Math.PI * 2);
    ctx.fill();
    return canvas;
  }

  // ---------- Buka / tutup peta penuh ----------
  toggle(force) {
    const open = force ?? !this.isOpen;
    if (open === this.isOpen) return;
    this.isOpen = open;
    this.overlay.hidden = !open;
    this.fullTimer = 1; // gambar segera
    this.onToggle?.(open);
  }

  /**
   * @param {number} dt
   * @param {{me:{x:number,z:number,facing:number,name:string,color:string}, yaw:number,
   *          players:{id:string,x:number,z:number,name:string,color:string}[]}} s
   */
  update(dt, s) {
    this.mmTimer += dt;
    if (this.mmTimer >= 1 / 20) {
      this.mmTimer = 0;
      this.drawMinimap(s);
    }
    if (this.isOpen) {
      this.fullTimer += dt;
      if (this.fullTimer >= 1 / 12) {
        this.fullTimer = 0;
        this.drawFull(s);
        this.updateList(s);
      }
    }
  }

  fitCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(canvas.clientWidth * dpr);
    const ch = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    return { dpr, w: cw, h: ch };
  }

  // ---------- Minimap ----------
  drawMinimap({ me, yaw, players }) {
    const c = this.minimap;
    if (!c.clientWidth) return;
    const { dpr, w } = this.fitCanvas(c);
    const ctx = c.getContext('2d');
    const R = w / 2;
    const scale = (R - 2 * dpr) / MINIMAP_RADIUS; // px per unit
    const world = this.world;
    const imgScale = (world.size / MAP_RES) * scale;

    ctx.clearRect(0, 0, w, w);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1.5 * dpr, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#3f9fd0';
    ctx.fillRect(0, 0, w, w);

    // arah pandang kamera = atas
    ctx.translate(R, R);
    ctx.rotate(yaw);
    ctx.translate(-me.x * scale, -me.z * scale);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.image, -world.half * scale, -world.half * scale, MAP_RES * imgScale, MAP_RES * imgScale);

    // pemain lain (yang jauh ditempel di tepi lingkaran)
    for (const p of players) {
      let dx = p.x - me.x, dz = p.z - me.z;
      const d = Math.hypot(dx, dz);
      const maxD = MINIMAP_RADIUS - 3;
      const far = d > maxD;
      if (far) {
        dx *= maxD / d;
        dz *= maxD / d;
      }
      drawDot(ctx, (me.x + dx) * scale, (me.z + dz) * scale, (far ? 3.2 : 4.2) * dpr, p.color, far ? 0.75 : 1);
    }

    // diri sendiri: panah sesuai arah hadap karakter
    ctx.translate(me.x * scale, me.z * scale);
    ctx.rotate(Math.atan2(Math.cos(me.facing), Math.sin(me.facing)));
    drawArrow(ctx, 7 * dpr, me.color);
    ctx.restore();

    // bingkai + penanda Utara
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(R, R, R - 1.5 * dpr, 0, Math.PI * 2);
    ctx.stroke();
    const nr = R - 10 * dpr;
    const nx = R + Math.sin(yaw) * nr * 1;
    const ny = R - Math.cos(yaw) * nr;
    ctx.fillStyle = 'rgba(20,24,36,0.75)';
    ctx.beginPath();
    ctx.arc(nx, ny, 8 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${10 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('U', nx, ny + 0.5 * dpr);
  }

  // ---------- Peta penuh ----------
  drawFull({ me, players }) {
    const c = this.full;
    if (!c.clientWidth) return;
    const { dpr, w, h } = this.fitCanvas(c);
    const ctx = c.getContext('2d');
    const world = this.world;
    const size = Math.min(w, h);
    const ox = (w - size) / 2, oy = (h - size) / 2;
    const toX = (x) => ox + ((x + world.half) / world.size) * size;
    const toY = (z) => oy + ((z + world.half) / world.size) * size;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#7fd0ef';
    ctx.fillRect(ox, oy, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.image, ox, oy, size, size);

    // grid tipis
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = dpr;
    for (let i = 1; i < 6; i++) {
      const t = (i / 6) * size;
      ctx.beginPath(); ctx.moveTo(ox + t, oy); ctx.lineTo(ox + t, oy + size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy + t); ctx.lineTo(ox + size, oy + t); ctx.stroke();
    }

    const labelFont = `700 ${12 * dpr}px system-ui, -apple-system, sans-serif`;
    const label = (text, x, y, baseline = 'bottom') => {
      ctx.font = labelFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = baseline;
      ctx.lineWidth = 4 * dpr;
      ctx.strokeStyle = 'rgba(20,24,36,0.8)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x, y);
    };

    for (const p of players) {
      const x = toX(p.x), y = toY(p.z);
      drawDot(ctx, x, y, 5.5 * dpr, p.color, 1);
      label(p.name, x, y + 9 * dpr, 'top'); // nama pemain lain di bawah titik, nama sendiri di atas
    }

    const x = toX(me.x), y = toY(me.z);
    const pulse = 1 + 0.25 * Math.sin(performance.now() / 220);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, 13 * dpr * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(Math.cos(me.facing), Math.sin(me.facing)));
    drawArrow(ctx, 9 * dpr, me.color);
    ctx.restore();
    label(`${me.name} (kamu)`, x, y - 13 * dpr);

    // kompas
    ctx.fillStyle = 'rgba(20,24,36,0.7)';
    ctx.beginPath();
    ctx.arc(ox + size - 22 * dpr, oy + 22 * dpr, 14 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${13 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('U', ox + size - 22 * dpr, oy + 22 * dpr + 0.5 * dpr);
  }

  updateList({ me, players }) {
    const rows = [
      { id: 'me', name: me.name, color: me.color, d: 0, me: true },
      ...players.map((p) => ({ ...p, d: Math.hypot(p.x - me.x, p.z - me.z) })).sort((a, b) => a.d - b.d),
    ];
    const sig = rows.map((r) => `${r.id}|${r.name}|${r.color}|${Math.round(r.d)}`).join(';');
    if (sig === this.listSig) return;
    this.listSig = sig;
    this.countEl.textContent = String(rows.length);
    this.listEl.replaceChildren(
      ...rows.map((r) => {
        const li = document.createElement('li');
        const dot = document.createElement('span');
        dot.className = 'pl-dot';
        dot.style.background = r.color;
        const name = document.createElement('span');
        name.className = 'pl-name';
        name.textContent = r.me ? `${r.name} (kamu)` : r.name;
        const dist = document.createElement('span');
        dist.className = 'pl-dist';
        dist.textContent = r.me ? '' : `${Math.round(r.d)} m`;
        li.append(dot, name, dist);
        return li;
      })
    );
  }
}

const _deep = new THREE.Color('#2f7f96');

function drawDot(ctx, x, y, r, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r + r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Panah menunjuk ke +x (diputar oleh pemanggil)
function drawArrow(ctx, s, color) {
  ctx.beginPath();
  ctx.moveTo(s * 1.3, 0);
  ctx.lineTo(-s, s * 0.85);
  ctx.lineTo(-s * 0.45, 0);
  ctx.lineTo(-s, -s * 0.85);
  ctx.closePath();
  ctx.lineWidth = s * 0.4;
  ctx.strokeStyle = '#fff';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
}
