const MAX_LINES = 150;
const RECENT_MS = 10000; // pesan baru tampil 10 detik saat panel tertutup
const MAX_RECENT_VISIBLE = 6;

const timeFmt = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });

/**
 * Riwayat chat ala game: pesan baru muncul sebentar di layar, riwayat lengkap
 * (bisa di-scroll) terlihat saat kolom chat dibuka. Pesan sistem (masuk/keluar,
 * info) juga masuk ke sini.
 */
export class ChatLog {
  constructor(root) {
    this.root = root;
    this.items = [];
    this.ids = new Set();
    this.open = false;
    setInterval(() => this.refresh(), 1000);
  }

  /**
   * @param {{id?:string, name?:string, color?:string, text:string, at?:number, system?:boolean, history?:boolean}} m
   * @returns {boolean} true jika pesan baru ditambahkan
   */
  add({ id, name, color, text, at = Date.now(), system = false, history = false }) {
    if (id) {
      if (this.ids.has(id)) return false;
      this.ids.add(id);
    }
    const el = document.createElement('div');
    el.className = `chat-line${system ? ' system' : ''}`;

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = timeFmt.format(at);
    el.append(time);

    if (system) {
      const t = document.createElement('span');
      t.textContent = text;
      el.append(t);
    } else {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = color || '#fff';
      const who = document.createElement('b');
      who.textContent = name || 'Pemain';
      const t = document.createElement('span');
      t.className = 'msg';
      t.textContent = text;
      el.append(dot, who, t);
    }

    // urutkan berdasar waktu (riwayat dari server bisa lebih lama dari pesan lokal)
    let idx = this.items.length;
    while (idx > 0 && this.items[idx - 1].at > at) idx--;
    this.root.insertBefore(el, this.items[idx]?.el ?? null);
    this.items.splice(idx, 0, { el, at, shownAt: history ? -Infinity : performance.now() });

    while (this.items.length > MAX_LINES) this.items.shift().el.remove();
    this.refresh();
    if (this.open) this.scrollToEnd();
    return true;
  }

  system(text) {
    this.add({ text, system: true });
  }

  setOpen(open) {
    this.open = open;
    this.root.classList.toggle('open', open);
    this.refresh();
    if (open) this.scrollToEnd();
  }

  scrollToEnd() {
    this.root.scrollTop = this.root.scrollHeight;
  }

  // Saat tertutup: hanya tampilkan beberapa pesan terbaru yang masih "segar".
  refresh() {
    const now = performance.now();
    let visible = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const fresh = now - it.shownAt < RECENT_MS && visible < MAX_RECENT_VISIBLE;
      if (fresh) visible++;
      it.el.classList.toggle('stale', !fresh);
    }
  }
}
