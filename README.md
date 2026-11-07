# Mabarin

Game dunia terbuka **multiplayer** berbasis web (PWA) dengan **Three.js** + **Playroom Kit**.
Art style **low poly** (flat shading) dengan karakter **chibi** yang bisa dikustomisasi.
Tanpa akun, tanpa server sendiri: game di-host gratis di **GitHub Pages**, koneksi antar pemain lewat **server gratis Playroom Kit**.

## Fitur

- **Pulau low poly prosedural** (seed tetap, dunia identik di semua pemain): bukit, gunung bersalju, pantai, laut beranimasi, hutan, api unggun, tenda, plaza meja game, dan **kompleks olahraga**.
- **Karakter chibi** dengan animasi jalan, lari, lompat, berenang, duduk, dash, sleding, tendang, pukul raket. Kepala mengikuti arah pandang saat duduk di meja game.
- **Kustomisasi karakter**: bentuk tubuh (normal / tinggi / pendek / gempal), warna kulit, 8 gaya rambut + warna, 4 gaya mata, atasan / bawahan / sepatu + warna, topi, kacamata, ransel / sayap / jubah, syal / dasi.
- **Hotbar properti**: Tangan, Palu Bonk, Pedang Kayu, Pistol Air, Kursi, Gitar. Senjata bersifat "bonk" (terpental & pusing, tanpa nyawa). Pemain yang sedang main game tidak bisa di-bonk.
- **Game meja** (tampilan orang-pertama, FOV 70°, + tampak atas untuk papan): Kartu Kilat, Gertak, Catur, Dam, Ludo.
- **Kompleks olahraga**: Sepak Bola (1v1, 2v2, adu penalti), Tenis (1v1, ganda), Bulu Tangkis (1v1, ganda), dengan **dash** dan **sleding**.
- **Voice chat berbasis jarak** (WebRTC): suara makin pelan saat menjauh, kiri/kanan mengikuti posisi.
- **Minimap & peta pulau**, **chat dengan riwayat** (juga terlihat saat main game), **musik lofi & efek suara** (Web Audio, tanpa file audio).
- **Bot** untuk mengisi kursi/lapangan kosong, **kick otomatis pemain AFK**, **Main Offline**, **PWA** (bisa di-install).

### Kontrol

| | PC / Laptop | HP / Tablet |
|---|---|---|
| Gerak | Panah / WASD, `Shift` lari | Joystick virtual (dorong penuh = lari) |
| Kamera | Klik layar (Pointer Lock) + mouse, scroll zoom | Geser sisi kanan, cubit untuk zoom |
| Lompat | `Spasi` | Tombol panah atas |
| Dash / Sleding | `Q` / `C` (saat lari) | Tombol dash / sleding (di lapangan) |
| Item | `1`–`6` pilih, klik / `F` pakai | Tombol item & tombol pakai |
| Tembak / pukul (lapangan) | Tahan klik / `F`, lepas | Tahan tombol Tembak / Pukul |
| Umpan (sepak bola) | `E` / klik kanan | Tombol Umpan |
| Penalti | Tahan `←` `↑` `→` (penendang) / tekan (kiper) | Tombol Kiri / Tengah / Kanan |
| Duduk | `E` | Tombol Duduk (muncul dekat kursi) |
| Game | `G` | Tombol kartu (kanan atas) |
| Mikrofon | `V` | Tombol mikrofon (kanan atas) |
| Chat / Peta | `Enter` / `M` | Tombol chat / ketuk minimap |

## Mengajak teman main

Tombol **Game** → pilih game (dan mode) → **Undang teman** (centang pemain) → teman mendapat undangan **Terima / Abaikan**.
Pembuat meja/pertandingan bisa menambah **Bot** dan menekan **Mulai**. Semua pemain di room bisa menonton.

## Game meja

Semua berjalan di meja dengan kamera orang-pertama; tombol **mata** beralih ke tampak atas (otomatis saat giliranmu untuk game papan).

- **Kartu Kilat** (2–4): cocokkan warna atau angka/simbol. Kartu hanya berwarna (merah, kuning, hijau, biru) tanpa simbol. Lewati, Balik, +2, Pelangi, Pelangi +4. Tekan **Kilat!** saat tinggal 2 kartu.
- **Gertak** (2–4): permainan menggertak orisinal. Tiap ronde ada kartu target; taruh 1–3 kartu tertutup dan *ngaku* semuanya target (Joker selalu cocok). Pemain berikutnya boleh menaruh kartu atau menuduh **Bohong!** Yang salah membuka **Kotak Kejutan** — confetti biasa, atau *DOR!* dan tersingkir. Bertahan paling akhir menang.
- **Catur** (1v1): bidak berbentuk koin dengan ikon tiap jenis agar mudah dibaca; aturan lengkap (rokade, en passant, promosi otomatis jadi menteri, skak mat, remis).
- **Dam** (1v1): papan 8×8, wajib makan, makan beruntun, raja terbang.
- **Ludo** (2, 3, atau 4): dadu 3D, keluar dengan 6, petak aman, makan bidak lawan.

Logika berjalan di perangkat pembuat meja (bandar): state disiarkan lewat player state `cg`, aksi lewat event `cg`, undangan lewat `cg-inv`.

## Kompleks olahraga

Lapangan ada di utara perkemahan (lihat peta). Satu pertandingan per lapangan.

- **Sepak Bola 1v1 / 2v2** (kontrol ala game bola konsol): 3 menit atau yang pertama mencetak 5 gol.
  - Dekati bola untuk **menguasainya** — bola menempel di kaki saat menggiring (lari sedikit lebih lambat).
  - **Tembak**: tahan lalu lepas. Arah mengikuti hadapan pemain (otomatis ke dalam gawang), makin lama ditahan makin keras; meteran merah = melambung di atas mistar. Tembakan jauh kurang akurat.
  - **Umpan**: otomatis ke kawan yang paling searah hadapanmu (1v1: menyodok bola ke depan).
  - **Rebut**: tombol tembak saat lawan menguasai bola = menerjang (peluang berhasil), **sleding** selalu melepaskan bola dan menjatuhkan lawan.
  - Kamera otomatis mengarah ke gawang lawan bila tidak diputar.
- **Adu Penalti** (tebak arah): 5 tendangan bergantian + sudden death.
  - Penendang **menahan** tombol Kiri / Tengah / Kanan lalu melepasnya; lama menahan = tenaga. Terlalu keras = melambung.
  - Kiper menebak Kiri / Tengah / Kanan sebelum bola ditendang. Tebakan benar = ditepis, kecuali tendangan keras ke pojok (kadang tetap tembus). Tebakan salah = gol.
- **Tenis & bulu tangkis**: arah pukulan mengikuti kamera, tahan untuk tenaga.
- **Tenis**: servis dari belakang garis, harus masuk kotak servis (2 kesempatan). Bola boleh memantul sekali. Pertama mencapai 7 poin (selisih 2). Cincin kuning menunjukkan perkiraan jatuhnya bola; meteran hijau = masih masuk.
- **Bulu Tangkis**: kok melambat cepat di udara, tidak memantul. Pertama mencapai 11 poin (selisih 2, maks. 15).

Fisika bola dihitung oleh pembuat pertandingan (`sb` 20×/detik); pemain lain memprediksi bola secara lokal dan dikoreksi halus, sehingga tendangan sendiri terasa langsung.

## Voice chat

Tekan tombol **mikrofon** (atau `V`) untuk bicara. Semua pemain otomatis bisa *mendengar* pemain yang bicara dalam radius ±26 m (maks. 8 orang terdekat). Ikon mikrofon hijau muncul di atas kepala pemain yang sedang bicara.

- Audio mengalir **langsung antar perangkat** (WebRTC peer-to-peer); Playroom hanya dipakai untuk bertukar sinyal awal.
- Memakai **server STUN publik Google** (gratis, tanpa akun) untuk menemukan alamat. **Tidak ada server TURN**, jadi pada sebagian jaringan dengan NAT ketat (beberapa operator seluler, Wi‑Fi kantor/sekolah) suara mungkin tidak tersambung — fitur lain tetap normal.
- Butuh HTTPS (GitHub Pages sudah HTTPS) dan izin mikrofon.

## Pemain AFK

Pemain yang tidak menyentuh kontrol selama **45 detik** mendapat peringatan "Masih di sini?" dan dikeluarkan otomatis setelah **1 menit**. Saat duduk di meja game atau ikut pertandingan, pemain dianggap aktif. Host room juga mengeluarkan pemain yang tanda aktivitasnya berhenti (mis. aplikasi di HP ditutup). Atur di `src/config.js` → `afk`.

## Main online

Game online lewat GitHub Pages: **https://rifkilabbaik.github.io/Mabarin/**

1. Buka link di PC atau HP, isi nama & atur karakter.
2. **Masuk Dunia Publik** → semua pemain masuk room yang sama. Atau **Buat Room Privat** → menu → Undang ke room untuk membagikan link (`...#r=RXXXX`).
3. Di HP, pilih "Tambahkan ke Layar Utama" / "Install app" untuk memasang sebagai aplikasi.

### Deploy otomatis (GitHub Pages)

Workflow `.github/workflows/deploy-pages.yml` mem-build dan men-deploy game setiap ada push ke `main`.
Syarat (sekali saja): **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Deploy manual: tab **Actions → Deploy ke GitHub Pages → Run workflow**.

### Batasan server Playroom (paket gratis, tanpa akun)

- **Butuh internet.** Koneksi memakai WebSocket ke `ws.joinplayroom.com`. Jaringan yang memblokirnya membuat game gagal terhubung — coba jaringan lain.
- **Maks. 24 pemain per room** (`src/config.js` → `maxPlayersPerRoom`). Jika Dunia Publik penuh, pakai Room Privat.
- **Kuota pemakaian.** Paket gratis Playroom punya batas pemakaian (cek joinplayroom.com). Bila habis, game menampilkan pesan *"Kuota gratis server Playroom sedang habis"*.
- **Riwayat chat tidak permanen** — 50 pesan terakhir disimpan di state room.
- **Koneksi putus** → Playroom memuat ulang halaman; game otomatis bergabung kembali ke room yang sama.

## Pengembangan

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # hasil di dist/
npm run preview    # cek hasil build
```

Untuk mencoba di HP pada Wi‑Fi yang sama, buka alamat "Network" yang ditampilkan Vite.
Pointer Lock, mikrofon, dan service worker (PWA) hanya aktif di **HTTPS** atau `localhost`.

### Cara kerja jaringan

Tiap klien mensimulasikan karakternya sendiri (client-authoritative) lalu menyiarkan state:

| Data | Isi | Lewat |
|---|---|---|
| `profile` (player state) | `{ name, color, look }` | reliable |
| `m` (player state) | `[x, y, z, rotY, speed, flags, waktuKirim, arahKepalaYaw, arahKepalaPitch]` ±15×/detik | unreliable |
| `item`, `chairs`, `ia` (player state) | item dipegang, kursi milik pemain, tanda aktivitas AFK | reliable |
| `vc` (player state) | status voice: 0 tidak ikut, 1 mendengar, 2 mikrofon menyala | reliable |
| `cg` (player state bandar) | state meja game | reliable |
| `sp` (player state tuan rumah) | state pertandingan (tim, skor, fase, servis, penalti) | reliable |
| `sb` / `sbt` (player state tuan rumah) | bola `[x,y,z,vx,vy,vz,t,hitN,pemilik]` / posisi bot | unreliable |
| `chat`, `act`, `bonk` (RPC) | pesan chat, animasi aksi, bonk | reliable |
| `cg`, `cg-inv`, `sp-a`, `sp-inv`, `sp-tk` (RPC) | aksi & undangan game meja / lapangan, sleding | reliable |
| `vs` (RPC) | sinyal WebRTC voice chat (offer/answer) | reliable |
| `chatlog` (room state, ditulis host) | 50 pesan terakhir | reliable |

Pemain lain di-render dengan **snapshot interpolation** (jeda 120 ms) memakai cap waktu pengirim.

### Struktur

```
src/
  main.js                    loop game, alur menu ke bermain, chat & riwayat, AFK
  config.js                  angka penting (dunia, kecepatan, kamera, jaringan, lapangan, AFK)
  world/                     terrain, air, langit, props, collider, kursi, semprotan air
  character/Character.js     karakter chibi (mesh + animasi + item + kepala mengikuti pandangan)
  character/looks.js         pilihan kustomisasi + validasi
  character/items.js         item hotbar + raket + kursi
  controls/                  keyboard, Pointer Lock, sentuh, joystick
  camera/ThirdPersonCamera.js
  player/                    pemain lokal (fisika, dash, sleding), pemain lain, logika item
  tablegames/TableGames.js   pengelola meja: undangan, kamera orang-pertama/tampak atas, UI
  tablegames/HostBase.js     dasar logika bandar (lobi, giliran, timer, bot)
  tablegames/games/          kilat, gertak, catur, dam, ludo (+ file aturan)
  sports/fields.js           visual lapangan bola, tenis, bulu tangkis
  sports/physics.js          fisika bola/kok, solusi lintasan pukulan
  sports/football.js         tembakan & umpan otomatis, penguasaan bola, penalti tebak arah
  sports/SportHost.js        aturan pertandingan, skor, bot (di perangkat tuan rumah)
  sports/Sports.js           lobi, undangan, prediksi bola, tendang/pukul, papan skor
  net/PlayroomNetwork.js     koneksi Playroom (publik / privat / undangan)
  net/LocalNetwork.js        mode offline (BroadcastChannel antar tab)
  net/VoiceChat.js           voice chat berbasis jarak (WebRTC)
  audio/                     efek suara & musik lofi (Web Audio)
  ui/                        layar awal, HUD, chat, peta, hotbar, kustomisasi, menu game, ikon SVG
public/                      favicon & ikon PWA
```

### Tips kustomisasi

- Ganti `world.seed` di `src/config.js` untuk pulau yang berbeda (lapangan ikut diratakan di `sports.zone`).
- Kualitas grafis otomatis: HP/tablet memakai mode `low`. Paksa dengan `?q=high` atau `?q=low` di URL.
- Debug di console browser: `window.__game`.
