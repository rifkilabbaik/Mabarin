# Mabarin — Low Poly World 🌲

Game dunia terbuka **multiplayer** berbasis web (PWA) dengan **Three.js** + **Playroom Kit**.
Art style **low poly** (flat shading) dan karakter bergaya **capsule character**.
Tanpa akun, tanpa server sendiri: game di-host gratis di **GitHub Pages**, koneksi antar pemain lewat **server gratis Playroom Kit**.

## Fitur

- 🌍 Pulau low poly prosedural (seed tetap → dunia identik di semua pemain): bukit, gunung bersalju, pantai, laut beranimasi, pohon pinus & pohon bulat, batu, semak, rumput, bunga, awan bergerak, api unggun + tenda di titik spawn.
- 💊 Karakter kapsul dengan mata, pipi, dan tangan melayang; animasi idle, jalan, lari, lompat (stretch & squash), berenang.
- 🗺️ **Minimap** (berputar mengikuti arah kamera, teman yang jauh tampil di tepi lingkaran) dan **peta pulau penuh** berisi posisi + nama semua pemain dan daftar pemain beserta jaraknya.
- 💬 **Chat dengan riwayat**: pesan baru tampil sebentar di layar, riwayat lengkap (bisa di-scroll, dengan jam) terlihat saat kolom chat dibuka. Pemain yang baru masuk ikut melihat 50 pesan terakhir di room. Pemberitahuan masuk/keluar juga tercatat di riwayat. Gelembung chat tetap muncul di atas kepala.
- 🎮 Kontrol:
  - **PC/Laptop** — Arrow keys (juga WASD) bergerak, **Pointer Lock** + mouse untuk kamera, `Shift` lari, `Spasi` lompat, scroll zoom, `Enter` chat, `M` peta, `Esc` tutup peta / lepas kursor.
  - **HP/Tablet** — **joystick virtual** dinamis di kiri (dorong penuh = lari), geser di kanan untuk kamera, cubit (2 jari) untuk zoom, tombol lompat, tombol 💬 chat, ketuk minimap untuk peta.
- 🌐 **Dunia Publik** (satu room bersama), **Room Privat** (link undangan), nama + warna pemain.
- 📴 **Main Offline** — tanpa internet. Beberapa tab di browser yang sama saling terlihat (BroadcastChannel), berguna untuk mencoba multiplayer secara lokal.
- 📲 **PWA** — bisa di-install ke layar utama, layar penuh, aset di-cache.

## Main online

Game sudah online lewat GitHub Pages: **https://rifkilabbaik.github.io/Mabarin/**

1. Buka link di PC atau HP, isi nama & pilih warna.
2. **Masuk Dunia Publik** → semua pemain masuk room yang sama.
   Atau **Buat Room Privat** → tekan tombol 🔗 (kanan atas) untuk membagikan link undangan (`...#r=RXXXX`).
3. Di HP, pilih "Tambahkan ke Layar Utama" / "Install app" untuk memasang sebagai aplikasi.

### Deploy otomatis (GitHub Pages)

Workflow `.github/workflows/deploy-pages.yml` mem-build dan men-deploy game setiap ada push ke `main`.
Syarat (sekali saja): **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Deploy manual: tab **Actions → Deploy ke GitHub Pages → Run workflow**.

### Batasan server Playroom (paket gratis, tanpa akun)

- **Butuh internet.** Koneksi memakai WebSocket ke `ws.joinplayroom.com`. Jaringan yang memblokirnya (sebagian Wi‑Fi kantor/sekolah) membuat game gagal terhubung — coba jaringan lain atau data seluler.
- **Maks. 24 pemain per room** (diatur di `src/config.js` → `maxPlayersPerRoom`). Jika Dunia Publik penuh, pakai Room Privat.
- **Kuota pemakaian.** Playroom menerapkan batas pemakaian untuk paket gratis, dan SDK-nya memperingatkan bahwa game tanpa Game ID bisa terkena batas pemain aktif harian. Angka resminya tidak tercantum di sini — cek joinplayroom.com. Bila kuota habis, game menampilkan pesan *"Kuota gratis server Playroom sedang habis"*.
- **Riwayat chat tidak permanen** — disimpan di state room Playroom (50 pesan terakhir), bukan di database.
- **Koneksi putus** → Playroom memuat ulang halaman; game otomatis bergabung kembali ke room yang sama.

## Pengembangan

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # hasil di dist/
npm run preview    # cek hasil build
```

Untuk mencoba di HP pada Wi‑Fi yang sama, buka alamat "Network" yang ditampilkan Vite.
Pointer Lock dan service worker (PWA) hanya aktif di **HTTPS** atau `localhost`.

### Cara kerja jaringan

Tiap klien mensimulasikan karakternya sendiri (client-authoritative) lalu menyiarkan state:

| Data | Isi | Lewat |
|---|---|---|
| `profile` (player state) | `{ name, color }` | reliable |
| `m` (player state) | `[x, y, z, rotY, speed, flags, waktuKirim]` ±15×/detik | unreliable |
| `chat` (RPC event) | `{ id, t, at, n, c }` | reliable |
| `chatlog` (room state, ditulis host) | 50 pesan terakhir | reliable |

Pemain lain di-render dengan **snapshot interpolation** (jeda 120 ms) memakai cap waktu pengirim, sehingga gerakan tetap mulus meski paket datang tidak teratur.

### Struktur

```
src/
  main.js                    loop game, alur menu → bermain, chat & riwayat
  config.js                  angka penting (dunia, kecepatan, kamera, jaringan, warna)
  world/World.js             terrain heightfield, air (shader ombak), langit, cahaya & bayangan
  world/props.js             pohon/batu/semak/bunga (InstancedMesh), awan, api unggun, tenda
  world/noise.js             RNG ber-seed + simplex noise
  world/Colliders.js         spatial hash collider lingkaran
  character/CapsuleCharacter.js  mesh + animasi karakter kapsul
  character/labels.js        sprite nama & gelembung chat
  controls/InputManager.js   keyboard, Pointer Lock, sentuh, pinch, tombol lompat
  controls/VirtualJoystick.js
  camera/ThirdPersonCamera.js kamera orbit yang tidak menembus bukit
  player/LocalPlayer.js      fisika pemain (gravitasi, lompat, berenang, tabrakan) + kirim state
  player/RemotePlayer.js     interpolasi pemain lain
  net/PlayroomNetwork.js     koneksi Playroom (publik / privat / undangan), RPC, state room
  net/LocalNetwork.js        mode offline (BroadcastChannel antar tab)
  ui/UI.js                   layar awal, HUD, chat, install PWA
  ui/ChatLog.js              panel riwayat chat
  ui/MapView.js              minimap & peta pulau penuh
public/                      favicon & ikon PWA
scripts/generate-icons.mjs   membuat ikon PNG dari SVG (butuh Playwright)
```

### Tips kustomisasi

- Ganti `world.seed` di `src/config.js` untuk pulau yang berbeda.
- `publicRoomCode` di `src/config.js` menentukan room "Dunia Publik".
- Kualitas grafis otomatis: HP/tablet memakai mode `low`. Paksa dengan `?q=high` atau `?q=low` di URL.
- Debug di console browser: `window.__game`.
