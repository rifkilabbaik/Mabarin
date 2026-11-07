# Low Poly World 🌲

Game dunia terbuka **multiplayer** berbasis web (PWA) dengan **Three.js** + **Playroom Kit**.
Art style **low poly** (flat shading) dan karakter bergaya **capsule character**.

## Fitur

- 🌍 Pulau low poly prosedural (seed tetap → dunia identik di semua pemain): bukit, gunung bersalju, pantai, laut beranimasi, pohon pinus & pohon bulat, batu, semak, rumput, bunga, awan bergerak, api unggun + tenda di titik spawn.
- 💊 Karakter kapsul dengan mata, pipi, dan tangan melayang; animasi idle, jalan, lari, lompat (stretch & squash), berenang.
- 🎮 Kontrol:
  - **PC/Laptop** — Arrow keys (juga WASD) untuk bergerak, **Pointer Lock** + mouse untuk kamera, `Shift` lari, `Spasi` lompat, scroll untuk zoom, `Enter` chat, `Esc` lepas kursor.
  - **HP/Tablet** — **joystick virtual** dinamis di sisi kiri (dorong penuh = lari), geser di sisi kanan untuk kamera, cubit (2 jari) untuk zoom, tombol lompat, tombol chat.
- 🌐 Multiplayer via Playroom Kit: **Dunia Publik** (satu room bersama), **Room Privat** (link undangan), nama + warna pemain, gelembung chat di atas kepala, notifikasi pemain masuk/keluar.
- 📴 **Main Offline** — tanpa server. Buka beberapa tab di browser yang sama dan mereka saling terlihat (BroadcastChannel), berguna untuk menguji multiplayer.
- 📲 **PWA** — bisa di-install ke layar utama, layar penuh, aset di-cache untuk dibuka offline.

## Menjalankan

```bash
npm install
cp .env.example .env   # opsional: isi VITE_PLAYROOM_GAME_ID
npm run dev
```

Buka `http://localhost:5173`. Untuk mencoba di HP pada jaringan Wi‑Fi yang sama, buka alamat "Network" yang ditampilkan Vite.

> Pointer Lock dan service worker (PWA) hanya aktif di **HTTPS** atau `localhost`. Saat diakses lewat IP LAN (http), game tetap jalan tapi tidak bisa di-install.

### Build & deploy

```bash
npm run build      # hasil di folder dist/
npm run preview    # cek hasil build secara lokal
```

Upload folder `dist/` ke hosting statis ber-HTTPS (Vercel, Netlify, Cloudflare Pages, GitHub Pages, dll).
Jika di-deploy di sub-folder (mis. GitHub Pages `https://user.github.io/repo/`), build dengan `npx vite build --base=/repo/`.

## Playroom Kit

1. Buat game di dashboard Playroom (`https://joinplayroom.com/dev`) dan salin **Game ID**.
2. Isi `VITE_PLAYROOM_GAME_ID` di `.env`. (Tanpa Game ID tetap jalan, tapi Playroom memberi peringatan di console.)
3. `VITE_PUBLIC_ROOM` menentukan kode room "Dunia Publik". Maksimal pemain per room diatur di `src/config.js` (`maxPlayersPerRoom`).

**Model jaringan** — tiap klien mensimulasikan karakternya sendiri (client-authoritative) lalu menyiarkan state:

| Key player state | Isi | Kanal |
|---|---|---|
| `profile` | `{ name, color }` | reliable |
| `m` | `[x, y, z, rotY, speed, flags, waktuKirim]` ±15×/detik | unreliable |
| `chat` | `{ id, text, at }` | reliable |

Pemain lain di-render dengan **snapshot interpolation** (jeda 120 ms) memakai cap waktu pengirim, sehingga gerakan tetap mulus meski paket datang tidak teratur.

Catatan: Playroom me-*reload* halaman jika koneksi gagal/terputus. Game menangani ini — setelah reload, muncul pesan error (bila gagal terhubung) atau otomatis bergabung kembali ke room yang sama (bila terputus saat bermain).

## Struktur

```
src/
  main.js                    loop game, alur menu → bermain
  config.js                  semua angka penting (dunia, kecepatan, kamera, jaringan, warna)
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
  net/PlayroomNetwork.js     koneksi Playroom (publik / privat / undangan)
  net/LocalNetwork.js        mode offline (BroadcastChannel antar tab)
  ui/UI.js                   layar awal, HUD, chat, toast, install PWA
public/                      favicon & ikon PWA
scripts/generate-icons.mjs   membuat ikon PNG dari SVG (butuh Playwright)
```

## Tips kustomisasi

- Ganti `world.seed` di `src/config.js` untuk pulau yang berbeda.
- Kualitas grafis otomatis: HP/tablet memakai mode `low` (bayangan 1024, tanpa antialias). Paksa dengan `?q=high` atau `?q=low` di URL.
- Debug di console browser: `window.__game` (scene, world, local, remotes, net).
