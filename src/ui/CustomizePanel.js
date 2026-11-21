import * as THREE from 'three';
import { Character } from '../character/Character.js';
import { LOOK_OPTIONS, randomLook, sanitizeLook } from '../character/looks.js';

// Lemari: tab kategori + grid thumbnail. Thumbnail dirender dari karakter asli memakai tampilan pemain
// saat ini (hanya item yang dipilih yang berbeda), jadi yang terlihat = hasil yang akan dipakai.
const TABS = [
  { label: 'Tubuh', sections: [{ key: 'body', label: 'Bentuk tubuh', frame: 'full' }, { key: 'skin', label: 'Warna kulit', colors: LOOK_OPTIONS.skin }] },
  { label: 'Rambut', sections: [{ key: 'hair', label: 'Gaya rambut', frame: 'head' }, { key: 'hairColor', label: 'Warna rambut', colors: LOOK_OPTIONS.hairColor }] },
  { label: 'Wajah', sections: [{ key: 'eyes', label: 'Mata', frame: 'face' }, { key: 'face', label: 'Aksesoris wajah', frame: 'face' }] },
  { label: 'Atasan', sections: [{ key: 'top', label: 'Atasan', frame: 'full' }, { key: 'topColor', label: 'Warna atasan', colors: LOOK_OPTIONS.topColor }] },
  { label: 'Bawahan', sections: [{ key: 'bottom', label: 'Bawahan', frame: 'legs' }, { key: 'bottomColor', label: 'Warna bawahan', colors: LOOK_OPTIONS.bottomColor }] },
  { label: 'Sepatu', sections: [{ key: 'shoes', label: 'Sepatu', frame: 'feet' }] },
  { label: 'Topi', sections: [{ key: 'hat', label: 'Topi', frame: 'head' }] },
  { label: 'Aksesoris', sections: [{ key: 'back', label: 'Punggung', frame: 'back' }, { key: 'neck', label: 'Leher', frame: 'chest' }] },
];

// ---------- Thumbnail (satu renderer kecil, dipakai bersama) ----------
const SIZE = 160;
let TR = null;
function thumbRenderer() {
  if (TR) return TR;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#9aabc8', 3.1));
  const sun = new THREE.DirectionalLight('#ffffff', 2.1);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  TR = { renderer, scene, cam: new THREE.PerspectiveCamera(30, 1, 0.05, 50) };
  return TR;
}

const THUMBS = new Map(); // tanda tangan → dataURL
const IDLE = { speed: 0, grounded: true, swimming: false, vy: 0 };

function renderThumb(look, frame) {
  const { renderer, scene, cam } = thumbRenderer();
  const c = new Character({ look, showName: false });
  for (let i = 0; i < 4; i++) c.animate(0.4, IDLE);
  const h = c.height, d = c.dims;
  const F = {
    head: [h - 0.42, 1.9, 0.45],
    face: [h - 0.42, 1.7, 0],
    full: [h / 2 + 0.05, 3.6, 0.45],
    back: [h / 2 + 0.1, 3.6, 2.6],
    legs: [0.45, 2.6, 0.45],
    feet: [0.22, 1.45, 0.5],
    chest: [d.hipY + d.neck - 0.08, 2.0, 0.3],
  }[frame];
  c.root.rotation.y = F[2];
  scene.add(c.root);
  cam.position.set(0, F[0] + 0.12, F[1]);
  cam.lookAt(0, F[0], 0);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(c.root);
  c.dispose();
  return url;
}

function thumb(look, frame) {
  const sig = `${frame}|${JSON.stringify(look)}`;
  let url = THUMBS.get(sig);
  if (!url) {
    url = renderThumb(look, frame);
    THUMBS.set(sig, url);
    if (THUMBS.size > 400) THUMBS.delete(THUMBS.keys().next().value);
  }
  return url;
}

/** Panel kustomisasi (lemari). Perubahan langsung dikirim lewat onChange. */
export class CustomizePanel {
  constructor({ root, onChange, onClose }) {
    this.root = root;
    this.onChange = onChange;
    this.onClose = onClose;
    this.tab = 0;
    this.queue = [];
    this.tabsEl = root.querySelector('.cz-tabs');
    this.bodyEl = root.querySelector('.cz-body');
    root.querySelector('#cz-done').addEventListener('click', () => this.close());
    root.querySelector('#cz-random').addEventListener('click', () => {
      this.look = randomLook();
      this.color = this.look.topColor;
      this.render();
      this.emit();
    });
    TABS.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t.label;
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => {
        this.tab = i;
        this.render();
        this.bodyEl.scrollTop = 0;
      });
      this.tabsEl.appendChild(b);
    });
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open({ color, look }) {
    this.look = sanitizeLook(look, color);
    this.color = this.look.topColor;
    this.root.hidden = false;
    document.body.classList.add('customizing');
    this.render();
  }

  close() {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.queue = [];
    document.body.classList.remove('customizing');
    this.onClose?.();
  }

  emit() {
    this.onChange?.({ color: this.color, look: { ...this.look } });
  }

  set(key, value) {
    if (this.look[key] === value) return;
    this.look[key] = value;
    if (key === 'topColor') this.color = value; // warna atasan = warna pemain (nama, peta)
    this.render();
    this.emit();
  }

  /** Render thumbnail satu per frame supaya panel tetap responsif. */
  pump() {
    if (this.pumping) return;
    this.pumping = true;
    const step = () => {
      const job = this.queue.shift();
      if (!job || this.root.hidden) {
        this.pumping = false;
        return;
      }
      if (job.img.isConnected) {
        job.img.src = thumb(job.look, job.frame);
        job.img.parentElement?.classList.add('ready');
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  render() {
    [...this.tabsEl.children].forEach((b, i) => b.setAttribute('aria-selected', String(i === this.tab)));
    this.queue = [];
    this.bodyEl.replaceChildren(
      ...TABS[this.tab].sections.map((sec) => {
        const wrap = document.createElement('div');
        wrap.className = 'cz-section';
        const h = document.createElement('h3');
        h.textContent = sec.label;
        const list = document.createElement('div');
        const current = this.look[sec.key];
        if (sec.colors) {
          list.className = 'cz-colors';
          for (const c of sec.colors) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'swatch';
            b.style.background = c;
            b.setAttribute('aria-label', c);
            b.setAttribute('aria-pressed', String(c === current));
            b.addEventListener('click', () => this.set(sec.key, c));
            list.appendChild(b);
          }
        } else {
          list.className = 'cz-grid';
          for (const opt of LOOK_OPTIONS[sec.key]) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'cz-tile';
            b.setAttribute('aria-pressed', String(opt.id === current));
            b.title = opt.label;
            const img = document.createElement('img');
            img.alt = '';
            img.draggable = false;
            const cap = document.createElement('span');
            cap.textContent = opt.label;
            b.append(img, cap);
            b.addEventListener('click', () => this.set(sec.key, opt.id));
            list.appendChild(b);
            const look = { ...this.look, [sec.key]: opt.id };
            const sig = `${sec.frame}|${JSON.stringify(look)}`;
            if (THUMBS.has(sig)) {
              img.src = THUMBS.get(sig);
              b.classList.add('ready');
            } else this.queue.push({ img, look, frame: sec.frame });
          }
        }
        wrap.append(h, list);
        return wrap;
      })
    );
    if (this.queue.length) this.pump();
  }

  /** Ruang layar yang tertutup panel (untuk menggeser kamera). */
  coverage() {
    if (this.root.hidden) return { right: 0, bottom: 0 };
    const r = this.root.querySelector('.cz-panel').getBoundingClientRect();
    const bottomSheet = r.width > window.innerWidth * 0.8;
    return bottomSheet ? { right: 0, bottom: window.innerHeight - r.top } : { right: window.innerWidth - r.left, bottom: 0 };
  }
}
