import { ITEMS } from '../character/items.js';

const $ = (id) => document.getElementById(id);

/**
 * Hotbar item.
 *  - PC  : baris 6 slot di bawah layar (tombol 1–6), klik/F pakai, E duduk.
 *  - HP  : tombol item (ketuk untuk memilih), tombol pakai, tombol duduk kontekstual.
 */
export class Hotbar {
  constructor({ onSelect, onUse, onInteract }) {
    this.onSelect = onSelect;
    this.onUse = onUse;
    this.onInteract = onInteract;
    this.selected = 0;
    this.ctxSig = '';

    // PC
    this.bar = $('hotbar');
    this.slots = ITEMS.map((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot';
      b.title = `${it.name} (${i + 1})`;
      b.innerHTML = `<span class="ico"></span><span class="key">${i + 1}</span>`;
      b.querySelector('.ico').textContent = it.icon;
      b.addEventListener('click', () => this.onSelect?.(i));
      this.bar.appendChild(b);
      return b;
    });
    this.nameEl = $('item-name');
    this.promptEl = $('prompt');

    // HP
    this.itemBtn = $('btn-item');
    this.menu = $('item-menu');
    ITEMS.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span class="ico"></span><span class="lbl"></span>`;
      b.querySelector('.ico').textContent = it.icon;
      b.querySelector('.lbl').textContent = it.name;
      b.addEventListener('click', () => {
        this.onSelect?.(i);
        this.toggleMenu(false);
      });
      this.menu.appendChild(b);
    });
    this.itemBtn.addEventListener('click', () => this.toggleMenu());

    this.useBtn = $('btn-use');
    this.useBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.useBtn.classList.add('pressed');
      this.onUse?.();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.useBtn.addEventListener(ev, () => this.useBtn.classList.remove('pressed'));

    this.interactBtn = $('btn-interact');
    this.interactBtn.addEventListener('click', () => this.onInteract?.());
  }

  toggleMenu(force) {
    const open = force ?? this.menu.hidden;
    this.menu.hidden = !open;
  }

  setSelected(i) {
    this.selected = i;
    this.slots.forEach((s, k) => s.classList.toggle('active', k === i));
    this.menu.querySelectorAll('button').forEach((b, k) => b.classList.toggle('active', k === i));
    this.itemBtn.textContent = ITEMS[i].icon;
    this.useBtn.querySelector('.ico').textContent = ITEMS[i].icon;
    this.flash(ITEMS[i].name);
    this.ctxSig = '';
  }

  flash(text) {
    this.nameEl.textContent = text;
    this.nameEl.classList.remove('show');
    void this.nameEl.offsetWidth; // ulang animasi
    this.nameEl.classList.add('show');
  }

  /** @param {{interact:string|null, useLabel:string, isTouch:boolean}} c */
  setContext({ interact, useLabel, isTouch }) {
    const sig = `${interact}|${useLabel}|${isTouch}`;
    if (sig === this.ctxSig) return;
    this.ctxSig = sig;
    this.useBtn.querySelector('.lbl').textContent = useLabel;
    this.interactBtn.hidden = !interact;
    this.interactBtn.textContent = interact === 'Berdiri' ? '🧍 Berdiri' : '🪑 Duduk';
    if (interact) {
      this.promptEl.hidden = false;
      this.promptEl.innerHTML = `<kbd>E</kbd> ${interact}`;
    } else this.promptEl.hidden = true;
  }
}
