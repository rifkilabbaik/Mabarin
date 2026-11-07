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

### Build

```bash
npm run build      # hasil di folder dist/
npm run preview    # cek hasil build secara lokal
```

Build memakai path relatif (`base: './'`), jadi folder `dist/` bisa di-host di root domain maupun sub-folder tanpa diubah.

## Main online dengan Playroom Kit

Kode multiplayer sudah tersambung ke Playroom. Untuk main online bersama teman cukup dua langkah: **pasang Game ID** dan **online-kan game di URL HTTPS**.

### 1. Ambil Game ID

1. Buka dev portal Playroom di **https://dev.joinplayroom.com**, daftar lalu login.
2. Buat project/game baru, lalu salin **Game ID**-nya.
3. Masukkan ke file `.env` di root proyek:

   ```bash
   cp .env.example .env
   # edit .env:
   VITE_PLAYROOM_GAME_ID=isi_game_id_kamu
   ```

4. Tes lokal dengan `npm run dev`. Buka di dua browser/perangkat lalu pilih **Masuk Dunia Publik**, kedua karakter akan saling terlihat.

> Tanpa Game ID game tetap bisa terhubung, tapi Playroom memberi peringatan di console dan statistik/kuota tidak tercatat ke project kamu.
> Game ID bukan rahasia (ikut terbaca di bundle JavaScript), jadi aman dipasang sebagai environment variable biasa.
> Variabel `VITE_*` dibaca saat **build**, jadi harus diisi sebelum `npm run build` / sebelum deploy.

### 2. Online-kan game (pilih salah satu)

**Vercel (paling mudah, deploy otomatis tiap push ke GitHub)**
1. Login ke vercel.com dengan akun GitHub, klik **Add New → Project**, pilih repo ini (repo privat juga bisa).
2. Framework terdeteksi otomatis sebagai **Vite** (build `npm run build`, output `dist`).
3. Di **Environment Variables** tambahkan `VITE_PLAYROOM_GAME_ID` (dan opsional `VITE_PUBLIC_ROOM`).
4. Klik **Deploy**. Bagikan URL `https://<nama>.vercel.app` ke teman.

**Netlify**: buat site dari repo GitHub, build command `npm run build`, publish directory `dist`, lalu tambahkan environment variable yang sama.

**Hosting Playroom**: jalankan `npm run build` (dengan `.env` sudah terisi), lalu unggah isi folder `dist/` di tab Hosting pada dev portal.

**GitHub Pages**: hanya untuk repo publik (atau akun berbayar). Unggah isi `dist/` atau pakai GitHub Actions.

### 3. Main bareng

- **Masuk Dunia Publik**: semua pemain masuk room yang sama (`VITE_PUBLIC_ROOM`, default `LOWPOLYWORLD`, maks. 24 pemain, bisa diubah di `src/config.js`).
- **Buat Room Privat**: room dengan kode acak. Tekan tombol 🔗 di pojok kanan atas untuk menyalin/membagikan link undangan (`...#r=RXXXX`). Teman yang membuka link langsung melihat tombol **Gabung Room**.
- Di HP, buka URL-nya lalu pilih "Tambahkan ke Layar Utama" / "Install app" untuk memasang sebagai aplikasi (PWA).

### Jika tidak bisa terhubung

- Muncul pesan *"Tidak bisa terhubung ke server Playroom"*: periksa koneksi internet. Beberapa jaringan kantor/sekolah memblokir WebSocket ke `ws.joinplayroom.com`. Coba jaringan lain atau data seluler.
- Room publik penuh: pakai **Room Privat**, atau ganti `VITE_PUBLIC_ROOM`.
- Batas pemakaian (jumlah pemain harian, dsb.) mengikuti paket Playroom kamu, cek di dev portal.

### Cara kerja jaringan

Tiap klien mensimulasikan karakternya sendiri (client-authoritative) lalu menyiarkan state:

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
