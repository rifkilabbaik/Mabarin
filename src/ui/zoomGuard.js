// iPhone/iPad (Safari) mengabaikan `user-scalable=no`, sehingga layar bisa terzoom karena cubit,
// ketuk dua kali, keyboard, atau saat HP diputar. Modul ini mencegahnya dan mengembalikan skala ke 1
// bila halaman terlanjur terzoom.

const isTextField = (el) => !!el?.matches?.('input:not([type=range]):not([type=checkbox]), textarea, select, [contenteditable]');

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export function installZoomGuard() {
  if (!isIOS()) return; // browser lain sudah mematuhi user-scalable=no
  const block = (e) => e.preventDefault();
  // Event gesture* hanya ada di Safari: cubit di mana pun tidak memperbesar halaman
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, block, { passive: false });
  // Cubit lewat touch event (Safari lama): batalkan bila skala berubah
  document.addEventListener(
    'touchmove',
    (e) => {
      if (typeof e.scale === 'number' && e.scale !== 1) e.preventDefault();
    },
    { passive: false }
  );
  // Ketuk dua kali cepat di luar kolom teks: jangan zoom
  let lastEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = e.timeStamp;
      if (now - lastEnd < 300 && e.changedTouches.length === 1 && e.touches.length === 0 && !isTextField(e.target)) e.preventDefault();
      lastEnd = now;
    },
    { passive: false }
  );

  // Kembalikan ke skala 1 bila terlanjur terzoom (mis. setelah keyboard ditutup atau HP diputar)
  const meta = document.querySelector('meta[name=viewport]');
  const base = meta?.getAttribute('content') || '';
  let timer = 0;
  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (isTextField(document.activeElement)) return; // sedang mengetik: biarkan
      const vv = window.visualViewport;
      if (meta && vv && Math.abs(vv.scale - 1) > 0.01) {
        // mengganti isi meta viewport memaksa Safari menghitung ulang skala
        meta.setAttribute('content', base.replace('maximum-scale=1', 'maximum-scale=1.0'));
        setTimeout(() => meta.setAttribute('content', base), 250);
      }
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    }, 120);
  };
  document.addEventListener('focusout', (e) => isTextField(e.target) && reset());
  window.addEventListener('orientationchange', reset);
  window.visualViewport?.addEventListener('resize', reset);
  window.visualViewport?.addEventListener('scroll', reset);
}

/** Ukuran layar untuk kanvas: layout viewport (tidak ikut mengecil saat halaman terzoom). */
export function viewportSize() {
  const de = document.documentElement;
  return { w: de.clientWidth || window.innerWidth, h: de.clientHeight || window.innerHeight };
}
