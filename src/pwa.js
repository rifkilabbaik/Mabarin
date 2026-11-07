import { registerSW } from 'virtual:pwa-register';

// Service worker: cache aset game agar bisa dibuka offline & di-install sebagai aplikasi.
export function registerPWA() {
  if (!('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onRegisterError(err) {
      console.warn('Service worker gagal didaftarkan', err);
    },
  });
}
