# Mabarin — Game Station

Kumpulan game "main bareng" untuk 1–4 pemain dalam satu perangkat.
Dibuat sebagai **PWA** (HTML + CSS + JavaScript murni, tanpa build tool), jadi bisa dibuka di laptop maupun dipasang di Android seperti aplikasi biasa dan tetap jalan offline.

## Halaman

- **Halaman judul**: logo dan loading bar, sambil memuat font dan service worker.
- **Halaman utama**: menu mode 1 / 2 / 3 / 4 Pemain, Main Tim (2vs2), dan Party Games, plus tombol Ajak Teman.
- **Halaman kategori**: daftar game di tiap mode (sementara berisi kartu "Segera Hadir").
- **Pengaturan**: efek suara, getaran, mode gelap, layar penuh, nama 4 pemain, pasang aplikasi, bagikan, dan reset data.

## Game

| Game | Mode | Pemain |
| --- | --- | --- |
| **Tebak Impostor**: semua dapat kata rahasia, satu orang (impostor) dapat kata yang mirip. Beri deskripsi bergiliran lewat roda putar, lalu voting. 1000 pasangan kata dalam 100 kategori. | Party Games | 3–10 |

## Menjalankan

Service worker hanya aktif lewat `http://localhost` atau `https://`, jadi jalankan server statis apa saja:

```bash
python3 -m http.server 8080
# buka http://localhost:8080
```

Supaya bisa dipasang di Android, hosting di HTTPS (misalnya GitHub Pages, Netlify, atau Vercel). Setelah itu buka di Chrome lalu pilih **Instal aplikasi**.

## Struktur

```
index.html            # semua halaman (splash, home, kategori, pengaturan)
css/style.css         # tema & tampilan
js/games.js           # daftar mode & game  ← tambah game di sini
js/app.js             # router, pengaturan, suara, install, share
sw.js                 # service worker (cache offline)
manifest.webmanifest  # metadata PWA
fonts/                # Lilita One & Fredoka (OFL), dihosting lokal
icons/                # ikon aplikasi
games/<id>/           # tiap game di foldernya sendiri
```

## Menambah game baru

1. Buat `games/<id>/index.html`.
2. Daftarkan di `js/games.js`:
   ```js
   { id: 'tap-race', title: 'Tap Race', modes: ['2p', '4p'], color: 'red', icon: '👆', isNew: true }
   ```
3. Tambahkan file game ke `PRECACHE` di `sw.js`, lalu naikkan `CACHE_VERSION` (dan `APP_VERSION` di `js/app.js`) agar pemain mendapat update.

Game bisa membaca pengaturan bersama dari `localStorage`:

```js
const s = JSON.parse(localStorage.getItem('mabarin:settings') || '{}');
s.players // ['Pemain 1', 'Pemain 2', 'Pemain 3', 'Pemain 4']
s.sound, s.vibrate, s.dark
// mode yang dipilih ada di query string: ?mode=2p
```

Simpan data game dengan awalan `mabarin` (misalnya `mabarin:tap-race:highscore`) supaya ikut terhapus oleh tombol **Reset Semua Data**.
