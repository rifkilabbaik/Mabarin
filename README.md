# Mabarin

Game dunia terbuka **multiplayer** berbasis web (PWA) dengan **Three.js** + **Playroom Kit**.
Art style **low poly** (flat shading) dan karakter bergaya **capsule character**.
Tanpa akun, tanpa server sendiri: game di-host gratis di **GitHub Pages**, koneksi antar pemain lewat **server gratis Playroom Kit**.

## Fitur

- **Pulau low poly prosedural** (seed tetap, dunia identik di semua pemain): bukit, gunung bersalju, pantai, laut beranimasi, hutan, batu, awan, api unggun, tenda, dan 3 meja kartu.
- **Karakter kapsul** dengan animasi idle, jalan, lari, lompat, berenang, duduk.
- **Kustomisasi karakter** (menu awal atau menu dalam game): warna badan, bentuk tubuh, 6 gaya rambut + 8 warna, 4 gaya mata, topi, kacamata / kumis, ransel / sayap / jubah, syal / dasi kupu-kupu.
- **Hotbar properti**: Tangan (melambai), Palu Bonk, Pedang Kayu, Pistol Air, Kursi, Gitar.
  Senjata bersifat "bonk": lawan terpental & pusing sebentar, tanpa nyawa. Kursi bisa ditaruh (maks. 3) dan diduduki; bangku api unggun juga bisa diduduki.
- **Kartu Kilat** — permainan kartu cocok-warna 2–4 pemain di meja, dengan tampilan orang-pertama ala VR (lihat detail di bawah).
- **Minimap & peta pulau** dengan posisi dan daftar pemain.
- **Chat dengan riwayat** (pemain baru ikut melihat 50 pesan terakhir).
- **Musik lofi & efek suara orisinal** dibuat langsung dengan Web Audio (tanpa file audio). Volume diatur di menu.
- **Kick otomatis pemain AFK** supaya room tidak penuh.
- **Ikon SVG** buatan sendiri di seluruh antarmuka (tanpa emoji).
- **Main Offline** (beberapa tab di browser yang sama saling terlihat) dan **PWA** (bisa di-install).

### Kontrol

| | PC / Laptop | HP / Tablet |
|---|---|---|
| Gerak | Panah / WASD, `Shift` lari | Joystick virtual (dorong penuh = lari) |
| Kamera | Klik layar (Pointer Lock) + mouse, scroll zoom | Geser sisi kanan, cubit untuk zoom |
| Lompat | `Spasi` | Tombol panah atas |
| Item | `1`–`6` pilih, klik / `F` pakai | Tombol item & tombol pakai |
| Duduk | `E` | Tombol Duduk (muncul dekat kursi) |
| Game | `G` | Tombol kartu (kanan atas) |
| Chat / Peta | `Enter` / `M` | Tombol chat / ketuk minimap |

Daftar kontrol juga ada di menu → Kontrol.

## Kartu Kilat

Permainan kartu orisinal Mabarin (aturan cocok warna/angka seperti permainan kartu klasik, dengan desain sendiri).

- **Kartu**: 4 warna bertema pulau — Api, Matahari, Daun, Ombak — masing-masing angka 0–9, **Lewati**, **Balik**, **+2**; ditambah **Pelangi** (pilih warna) dan **Pelangi +4**. Total 108 kartu, 7 kartu per pemain.
- **Giliran**: mainkan kartu dengan warna atau angka/simbol yang sama, atau Pelangi. Tidak bisa? Ambil 1 kartu, lalu mainkan atau Lewat. Batas waktu 30 detik per giliran.
- **Kilat!**: saat tinggal 2 kartu di giliranmu, tekan **Kilat!** sebelum memainkan kartu kedua terakhir — kalau lupa, kamu mengambil 2 kartu.
- Yang pertama menghabiskan kartu menang.

**Cara mengajak teman**: tombol Game → **Kartu Kilat** → **Undang teman** (centang pemain) → teman mendapat undangan **Terima / Abaikan**. Bandar (pembuat meja) bisa menambah **Bot** dan menekan **Mulai**.

**Tampilan ala VR**: saat duduk di meja kamera menjadi orang-pertama — menunduk untuk melihat kartu di tangan, lurus ke depan untuk melihat meja dan lawan, menoleh ke samping untuk melihat pemain lain. Geser layar / drag mouse untuk melihat sekeliling, ketuk / klik kartu untuk memainkannya, ketuk tumpukan kartu tertutup untuk mengambil.

Logika permainan berjalan di perangkat bandar: state meja disiarkan lewat player state `cg` milik bandar, aksi pemain dikirim lewat event `cg`, undangan lewat event `cg-inv`. Semua pemain di room bisa menonton meja yang sedang dimainkan. (Kartu di tangan tidak dienkripsi — cocok untuk main santai.)

## Pemain AFK

Pemain yang tidak menyentuh kontrol selama **4 menit** mendapat peringatan "Masih di sini?" dan dikeluarkan otomatis pada menit ke-**5**. Host room juga mengeluarkan pemain yang tanda aktivitasnya berhenti (mis. aplikasi di HP ditutup tanpa keluar). Atur di `src/config.js` → `afk`.

## Main online

Game sudah online lewat GitHub Pages: **https://rifkilabbaik.github.io/Mabarin/**

1. Buka link di PC atau HP, isi nama & pilih warna.
2. **Masuk Dunia Publik** → semua pemain masuk room yang sama.
   Atau **Buat Room Privat** → menu → Undang ke room untuk membagikan link (`...#r=RXXXX`).
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
| `profile` (player state) | `{ name, color, look }` | reliable |
| `m` (player state) | `[x, y, z, rotY, speed, flags, waktuKirim]` ±15×/detik (flags: di tanah / berenang / duduk) | unreliable |
| `item` (player state) | id item yang dipegang | reliable |
| `chairs` (player state) | kursi milik pemain `[[x, z, rot], …]` | reliable |
| `chat` (RPC event) | `{ id, t, at, n, c }` | reliable |
| `act` (RPC event) | animasi aksi: lambai / pukul / tebas / tembak / petik gitar | reliable |
| `bonk` (RPC event) | `{ to, dx, dz, p }` — dihitung penyerang, korban terpental | reliable |
| `chatlog` (room state, ditulis host) | 50 pesan terakhir | reliable |
| `ia` (player state) | tanda aktivitas (berubah tiap 15 detik saat aktif) untuk deteksi AFK | reliable |
| `cg` (player state bandar) | state meja Kartu Kilat | reliable |
| `cg` / `cg-inv` (RPC event) | aksi pemain di meja / undangan | reliable |

Pemain lain di-render dengan **snapshot interpolation** (jeda 120 ms) memakai cap waktu pengirim, sehingga gerakan tetap mulus meski paket datang tidak teratur.

### Struktur

```
src/
  main.js                    loop game, alur menu ke bermain, chat & riwayat, AFK
  config.js                  angka penting (dunia, kecepatan, kamera, jaringan, warna)
  world/World.js             terrain heightfield, air (shader ombak), langit, cahaya & bayangan
  world/props.js             pohon/batu/semak/bunga (InstancedMesh), awan, api unggun, tenda
  world/noise.js             RNG ber-seed + simplex noise
  world/Colliders.js         spatial hash collider lingkaran
  character/CapsuleCharacter.js  mesh + animasi karakter kapsul (aksi, duduk, pusing)
  character/looks.js         daftar pilihan kustomisasi + validasi
  character/parts.js         model rambut, mata, topi, kacamata, ransel/sayap/jubah, syal
  character/items.js         daftar item hotbar + model item & kursi
  character/labels.js        sprite nama & gelembung chat
  controls/InputManager.js   keyboard, Pointer Lock, sentuh, pinch, tombol lompat
  controls/VirtualJoystick.js
  camera/ThirdPersonCamera.js kamera orbit yang tidak menembus bukit
  player/LocalPlayer.js      fisika pemain (gravitasi, lompat, berenang, tabrakan) + kirim state
  player/RemotePlayer.js     interpolasi pemain lain
  player/ItemController.js   logika item: bonk, pistol air, kursi, duduk, gitar
  world/Seats.js             bangku api unggun + kursi pemain
  world/Projectiles.js       semprotan pistol air
  audio/AudioManager.js      efek suara, gitar, ambience (Web Audio)
  audio/Music.js             musik lofi prosedural
  net/PlayroomNetwork.js     koneksi Playroom (publik / privat / undangan), RPC, state room
  net/LocalNetwork.js        mode offline (BroadcastChannel antar tab)
  ui/UI.js                   layar awal, HUD, chat, install PWA
  ui/ChatLog.js              panel riwayat chat
  ui/MapView.js              minimap & peta pulau penuh
  ui/Hotbar.js               hotbar (PC) & tombol item (HP)
  ui/CustomizePanel.js       panel kustomisasi karakter
  ui/icons.js                ikon SVG (pengganti emoji) + simbol 4 warna kartu
  cards/rules.js             aturan & kartu Kartu Kilat, AI bot sederhana
  cards/MatchHost.js         logika bandar (kocok, bagi, giliran, timer, bot)
  cards/CardGame.js          undangan, tampilan orang-pertama, kartu di tangan, UI meja
  cards/TableView.js         tampilan meja untuk semua pemain (tumpukan, kartu lawan, bot)
  cards/cardArt.js           gambar kartu (atlas canvas)
public/                      favicon & ikon PWA
scripts/generate-icons.mjs   membuat ikon PNG dari SVG (butuh Playwright)
```

### Tips kustomisasi

- Ganti `world.seed` di `src/config.js` untuk pulau yang berbeda.
- `publicRoomCode` di `src/config.js` menentukan room "Dunia Publik".
- Kualitas grafis otomatis: HP/tablet memakai mode `low`. Paksa dengan `?q=high` atau `?q=low` di URL.
- Debug di console browser: `window.__game`.
