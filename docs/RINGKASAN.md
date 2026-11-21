# Ringkasan Proyek Mabarin (untuk sesi baru)

Game PWA multiplayer Three.js (Vite), di-deploy ke GitHub Pages. Repo: `rifkilabbaik/Mabarin`, branch `main`. Teks UI & balasan ke user dalam Bahasa Indonesia.

## Aturan kerja
- **Deploy**: user mengizinkan langsung push ke `main` (`git push origin HEAD:main`) → cek workflow "Deploy ke GitHub Pages" sampai sukses (`gh run list --repo rifkilabbaik/Mabarin --limit 1`).
- Jangan ubah pengaturan GitHub Pages lewat API. Jangan buat ulang game bermerek (semua game desain orisinal).
- Tanyakan ke user sebelum mengerjakan saran besar; user peduli hemat token.
- Pesan commit diakhiri baris `Co-Authored-By` & `Claude-Session` sesuai sesi.

## Arsitektur penting
| Bagian | File |
|---|---|
| Jaringan P2P (Trystero + relay Nostr, server PUBLIK/PUBLIK-N, TURN opsional dari secret `TURN_*`) | `src/net/P2PNetwork.js` |
| Karakter chibi (primitif digabung, cache geometri, pose) | `src/character/Character.js`, `src/character/looks.js` |
| Kerangka game meja (lobi, giliran, bot, peringkat) | `src/tablegames/HostBase.js`, `src/tablegames/TableGames.js` |
| Game | `src/tablegames/games/` — kilat, domino, juragan, catur, dam, ludo, empat, mancala, pool |
| Domino: aturan murni (gaple, tata letak rantai ular `layoutChain`) | `src/tablegames/games/dominoRules.js` |
| Domino: bandar, tampilan 3D, kontrol, panel sisa kartu (`#dm-tiles` di bawah tombol kamera) | `src/tablegames/games/domino.js` |
| Fisika pool (deterministik, `rack` 2 pemain & `rackMulti` 3–4 pemain) | `src/tablegames/pool/physics.js` |
| Lemari kustomisasi | `src/ui/CustomizePanel.js` |
| HUD gaya B, kamera 1st/3rd (tombol P), anti-zoom iPhone | `src/ui/UI.js`, `src/camera/ThirdPersonCamera.js`, `src/ui/zoomGuard.js` |
| Lokasi meja & tempat tunggu (pool 4 tempat) | `src/world/props.js` |
| Olahraga: Sepak Bola (1v1, 2v2, adu penalti) & Tenis (1v1, ganda); `SPORT_DEFS`, bandar & tim | `src/sports/SportHost.js` |
| Olahraga: tampilan, kontrol (tendang/pukul/oper), bot | `src/sports/Sports.js` |
| Olahraga: fisika bola, logika sepak bola, lapangan 3D | `src/sports/physics.js`, `football.js`, `fields.js` |
| Juragan: aturan murni (40 petak, sewa, kartu Peluang/Kas RT, cek bangun/gadai, nilai bot) | `src/tablegames/juragan/rules.js` |
| Juragan: bandar (alur `stage`, lelang, nego, utang/bangkrut, batas waktu, bot) | `src/tablegames/juragan/host.js` |
| Juragan: gambar papan canvas, bidak orisinal, dadu, rumah/hotel, kartu, HP 3D | `src/tablegames/juragan/art.js` |
| Juragan: tampilan meja (bidak melompat, dadu, kartu hak milik & HP di tepi meja) | `src/tablegames/juragan/renderer.js` |
| Juragan: HP (HTML), pengumuman, suara uang, lobi | `src/tablegames/juragan/phone.js` |
| Meja persegi besar (`kind: 'square'`, `CONFIG.sports.squareTables`) | `src/world/props.js` |
| Tes unit (Node `node:test`) & smoke test browser | `tests/*.test.js`, `scripts/smoke.mjs` |

## Fitur terbaru (sudah live)
- **Juragan** (2–4 pemain, game jual-beli tanah; mekanik klasik, nama & tampilan orisinal — user minta tiruan persis Monopoly, tidak boleh dibuat):
  - Meja persegi baru di plaza (x −9 & −18, z −19.5), papan 1,2 m tebal 4,5 cm, 40 petak jalan/kota Indonesia, harga & sewa klasik.
  - Bidak logam orisinal (becak, pinisi, ayam jago, ontel, peci, kendi) dipilih di lobi; lama main: bangkrut / 30 / 45 / 60 menit (kekayaan terbesar menang).
  - Aturan: lewat MULAI +200, penjara (3× kembar, bayar 50, kartu bebas, gagal 3×), kartu Peluang & Kas RT, beli/lelang, sewa dobel satu kelompok, bangun merata, stok 32 rumah/12 hotel, gadai (+10% tebus), nego (tanah digadai: bunga 10%), utang → jual/gadai atau bangkrut.
  - HP: di meja depan tiap pemain; diketuk / tombol HP di bawah tombol kamera → melayang ke wajah lalu layar HTML (saldo, beli/lelang, aset & bangun/gadai, nego, mutasi, pemain). Terbuka otomatis saat perlu keputusan. Pemain yang membuka HP terlihat memegang HP di depan dada (`Character.holdPhone`, `state.phone`).
  - Suara uang pemain lokal: bayar `tungting`, masuk `kencring`, tawaran `buzz` (`AudioManager`). Pengumuman kartu instruksi & hak milik baru di atas layar; kartu hak milik melayang ke depan pemiliknya, kartu bebas penjara di samping HP.
  - Kamera atas jadi bawaan saat masuk meja Juragan.
  - Uji di browser: `window.__game.cards.host` (`drawCard`, `startAuction`, `state.own`), `window.__game.cards.controls.setOpen(true)`.
- **Domino** (2–4 pemain, gaya gaple):
  - 28 kartu, 7 per pemain; 2–3 pemain sisanya disisihkan (bertumpuk di sudut meja, tidak dipakai).
  - Babak pertama dibuka pemegang balak tertinggi (`must`); "Ulangi" dibuka pemenang sebelumnya bebas.
  - Tidak ada kartu cocok = lewat otomatis (1,1 dtk). Kartu habis = menang; buntu = titik paling sedikit menang. Sisa pemain diurutkan dari titik paling sedikit (`rankRest`).
  - Kartu sendiri berdiri miring di depan kursi (ketuk untuk main; kartu yang tak bisa dimainkan digelapkan). Cocok di dua ujung: bayangan kuning di meja + tombol "Sambung ke n".
  - Tombol kartu di bawah tombol kamera membuka panel **Sisa kartu**: jumlah kartu tiap pemain, angka yang belum keluar, 28 kartu (di meja pudar, milikmu bergaris biru).
  - Akhir babak: kartu semua pemain dibuka telentang.
- **Peringkat 3–4 pemain** (Kilat, Ludo, Pool): Juara 1, 2, 3, Terakhir.
  - `HostBase.finish()` / `knockOut()` mencatat pemain yang selesai / gugur.
  - `next()` melewati pemain yang sudah selesai.
  - `state.ranks` & `state.out` menyimpan urutan; banner akhir menampilkan daftar `#cu-ranks`.
- **Kilat**: tumpukan habis langsung dikocok ulang (`refill()`) dengan animasi; buangan tinggal 1 kartu; tombol Lewat muncul bila semua kartu ada di tangan.
- **Pool**:
  - Mode berjalan & membungkuk, bisa solo.
  - 3–4 pemain: warna Merah/Biru/Kuning/Ungu, masukkan bola 8 untuk jadi juara, bola 8 terlalu cepat = gugur.
  - Pose membidik menekuk di pinggul (`CUE_BEND = 0.3`); tempat berdiri dari jejak badan (`AIM_HULL`, `standSpot`); jarak jalan ≥ 0,55 m dari tepi kain.
  - Stik dipegang semua pemain, transisi tangan → garis bidik (`handCue`, `updateHands`, `placeViewCue` via hook `afterCamera`).
- HUD gaya B, lemari bergambar (landscape kanan / portrait bawah), model chibi halus, kamera 1st/3rd person.

## Tertunda
- Item kustomisasi baru/revisi: **ditunda** sampai user minta.
- TURN server opsional: user mengisi repo secret `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`, `TURN_API`.

## Cara uji
- **`npm test`**: tes unit aturan game (< 1 detik), juga dijalankan workflow deploy sebelum build (gagal = tidak deploy).
  - `tests/hostbase.test.js`: lobi, `next()`, peringkat (`finish`/`knockOut`/`end`), pemain keluar.
  - `tests/kilat.test.js`: `refill()`, lewat, simulasi permainan bot 2–4 pemain sampai selesai (kartu harus utuh).
  - `tests/pool.test.js`: `rack`/`rackMulti`, `ShotSim` deterministik, aturan 2 pemain, solo, & 3–4 pemain (`resolveMulti`).
  - `tests/mancala.test.js`: tabur, tangkap, akhir permainan, bot.
  - `tests/juragan.test.js`: papan, sewa, bangun/gadai, jalan & beli, penjara, kartu, lelang, nego, utang, bangkrut, batas waktu, simulasi bot 2–4 pemain.
  - `tests/domino.test.js`: aturan, rantai tidak bertumpuk/putus, lewat otomatis, buntu, pemain keluar, simulasi 2–4 pemain.
  - Bantuan: `tests/helpers.js` (`makeHost`, `addHuman`, `withSeed` untuk acak berbenih).
- **`npm run smoke`** (atau `npm run smoke -- pool ludo`): buka tiap game meja di Chromium dengan meja penuh bot, semua pemain dimainkan bot ±8 detik, gagal bila ada error konsol/halaman atau state tidak bergerak. Tangkapan layar gagal di `/tmp/mabarin-smoke/`. Butuh Playwright (sudah ada di sesi cloud; di komputer lain: `npm i -D playwright && npx playwright install chromium`). ±2 menit.
- Jalankan keduanya sebelum push ke `main`.
- Server dev manual: `npx vite --host 127.0.0.1 --port 5173 --strictPort`.
- Playwright + Chromium: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
- Alur:
  1. Buka `?q=low`, isi `#name-input`, klik `#btn-offline`.
  2. Tekan `KeyG`, klik `#games-list .game-tile:has-text("Pool")`.
  3. Tambah bot: klik `#invite-bot` (bot berikutnya: `window.__game.cards.host.addBot()`).
  4. Klik `#cu-start` (main solo: sembunyikan `#invite-modal` dulu).
- State game: `window.__game.cards.host.state`. Uji aturan pool: `host.resolveMulti()` dengan objek `sim` palsu `{ pots, first, final() }`.
