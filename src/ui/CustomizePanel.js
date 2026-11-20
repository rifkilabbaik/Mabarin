import { LOOK_OPTIONS, randomLook, sanitizeLook } from '../character/looks.js';

const TABS = [
  { label: 'Tubuh', sections: [{ key: 'body', label: 'Bentuk tubuh' }, { key: 'skin', label: 'Warna kulit', colors: LOOK_OPTIONS.skin }] },
  { label: 'Rambut', sections: [{ key: 'hair', label: 'Gaya rambut' }, { key: 'hairColor', label: 'Warna rambut', colors: LOOK_OPTIONS.hairColor }] },
  { label: 'Wajah', sections: [{ key: 'eyes', label: 'Mata' }, { key: 'face', label: 'Aksesoris wajah' }] },
  {
    label: 'Pakaian',
    sections: [
      { key: 'top', label: 'Atasan' },
      { key: 'topColor', label: 'Warna atasan', colors: LOOK_OPTIONS.topColor },
      { key: 'bottom', label: 'Bawahan' },
      { key: 'bottomColor', label: 'Warna bawahan', colors: LOOK_OPTIONS.bottomColor },
      { key: 'shoes', label: 'Sepatu' },
    ],
  },
  { label: 'Aksesoris', sections: [{ key: 'hat', label: 'Topi' }, { key: 'back', label: 'Punggung' }, { key: 'neck', label: 'Leher' }] },
];

/** Panel kustomisasi karakter. Perubahan langsung dikirim lewat onChange. */
export class CustomizePanel {
  constructor({ root, onChange, onClose }) {
    this.root = root;
    this.onChange = onChange;
    this.onClose = onClose;
    this.tab = 0;
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
    document.body.classList.remove('customizing');
    this.onClose?.();
  }

  emit() {
    this.onChange?.({ color: this.color, look: { ...this.look } });
  }

  set(key, value) {
    this.look[key] = value;
    if (key === 'topColor') this.color = value; // warna atasan = warna pemain (nama, peta)
    this.render();
    this.emit();
  }

  render() {
    [...this.tabsEl.children].forEach((b, i) => b.setAttribute('aria-selected', String(i === this.tab)));
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
          list.className = 'cz-chips';
          for (const opt of LOOK_OPTIONS[sec.key]) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'chip';
            b.textContent = opt.label;
            b.setAttribute('aria-pressed', String(opt.id === current));
            b.addEventListener('click', () => this.set(sec.key, opt.id));
            list.appendChild(b);
          }
        }
        wrap.append(h, list);
        return wrap;
      })
    );
  }

  /** Ruang layar yang tertutup panel (untuk menggeser kamera). */
  coverage() {
    if (this.root.hidden) return { right: 0, bottom: 0 };
    const r = this.root.querySelector('.cz-panel').getBoundingClientRect();
    const bottomSheet = r.width > window.innerWidth * 0.8;
    return bottomSheet ? { right: 0, bottom: window.innerHeight - r.top } : { right: window.innerWidth - r.left, bottom: 0 };
  }
}
