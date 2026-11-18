# Mabarin

Game dunia terbuka **multiplayer** berbasis web (PWA) dengan **Three.js** + jaringan **peer-to-peer** ([Trystero](https://github.com/dmotz/trystero)).
Art style **low poly** (flat shading) dengan karakter **chibi** yang bisa dikustomisasi.
Tanpa akun, tanpa server sendiri, **tanpa kuota**: game di-host gratis di **GitHub Pages**, pemain saling tersambung langsung (WebRTC).

## Fitur

- **Pulau low poly prosedural** (seed tetap, dunia identik di semua pemain): bukit, gunung bersalju, pantai, laut beranimasi, hutan, api unggun, tenda, plaza meja game, dan **kompleks olahraga**.
- **Karakter chibi** dengan animasi jalan, lari, lompat, berenang, duduk, dash, sleding, tendang, pukul raket. Kepala mengikuti arah pandang saat duduk di meja game.
- **Kustomisasi karakter**: bentuk tubuh (normal / tinggi / pendek / gempal), warna kulit, 8 gaya rambut + warna, 4 gaya mata, atasan / bawahan / sepatu + warna, topi, kacamata, ransel / sayap / jubah, syal / dasi.
- **Hotbar properti**: Tangan, Palu Bonk, Pedang Kayu, Pistol Air, Kursi, Gitar. Senjata bersifat "bonk" (terpental & pusing, tanpa nyawa). Pemain yang sedang main game tidak bisa di-bonk.
- **Game meja**: Kartu Kilat, Catur, Dam, Ludo, Empat Sejajar & Mancala dengan tiga pilihan kamera (kepala, bebas, atas).
- **Pool** di meja biliar area olahraga: tampilan POV, berjalan memutari meja saat membidik.
- **Kompleks olahraga**: Sepak Bola (1v1, 2v2, adu penalti), Tenis (1v1, ganda), dengan **dash** dan **sleding**.
- **Voice chat berbasis jarak** (WebRTC): suara makin pelan saat menjauh, kiri/kanan mengikuti posisi.
- **Minimap & peta pulau**, **chat dengan riwayat** (juga terlihat saat main game), **musik lofi & efek suara** (Web Audio, tanpa file audio).
- **Bot** untuk mengisi kursi/lapangan kosong, **kick otomatis pemain AFK**, **Main Offline**, **PWA** (bisa di-install).

### Tampilan (HUD)

- **PC**: satu *dock* di bawah layar berisi hotbar item + tombol mikrofon, chat, game, dan menu; peta kecil di kanan atas.
- **HP**: tombol sistem jadi satu kapsul di atas; tombol lompat & aksi sejajar di kanan bawah, tombol pilih item kecil di atasnya.
- **Meja game**: layar bersih — hanya **daftar giliran** di kiri atas (ikon karakter, nama, jumlah kartu, hitung mundur pada pemain yang sedang giliran, arah urutan) dan tombol **gear** (bulat) di kanan atas. Ketuk gear untuk memunculkan chat, mikrofon, menu, menyerah (game papan), dan keluar. Tepat di bawah gear ada **tombol kamera** untuk mengganti tampilan.

### Kontrol

| | PC / Laptop | HP / Tablet |
|---|---|---|
| Gerak | Panah / WASD, `Shift` lari | Joystick virtual (dorong penuh = lari) |
| Kamera | Klik layar (Pointer Lock) + mouse, scroll zoom | Geser sisi kanan, cubit untuk zoom |
| Lompat | `Spasi` | Tombol panah atas |
| Dash / Sleding | `Q` / `C` (saat lari) | Tombol dash / sleding (di lapangan) |
| Item | `1`–`6` / klik slot di dock bawah, klik / `F` pakai | Tombol item kecil (di atas tombol lompat) & tombol aksi |
| Tembak / pukul (lapangan) | Tahan klik / `F`, lepas | Tahan tombol Tembak / Pukul |
| Umpan (sepak bola) | `E` / klik kanan | Tombol Umpan |
| Penalti | Tahan `←` `↑` `→` (penendang) / tekan (kiper) | Tombol Kiri / Tengah / Kanan |
| Duduk | `E` | Tombol Duduk (muncul dekat kursi) |
| Game | `G` / tombol di dock bawah | Tombol kartu (kapsul atas) |
| Mikrofon | `V` / tombol di dock bawah | Tombol mikrofon (kapsul atas) |
| Chat / Peta | `Enter` / `M` | Tombol chat / ketuk minimap |

## Mengajak teman main

Tombol **Game** → pilih game (dan mode) → **Undang teman** (centang pemain) → teman mendapat undangan **Terima / Abaikan**.
Pembuat meja/pertandingan bisa menambah **Bot** dan menekan **Mulai**. Semua pemain di room bisa menonton.

## Game meja

Tombol kamera (di bawah gear) berisi:

- **Kamera kepala** — pandangan dari mata karakter; geser untuk melihat sekeliling, dan kepala karaktermu ikut bergerak (terlihat pemain lain). Bawaan untuk game kartu.
- **Kamera bebas** — kamera di atas kursimu: geser kiri/kanan **sebatas area** di sisimu, atas/bawah untuk tinggi-rendah, cubit / scroll untuk zoom. Kepalamu sendiri disembunyikan saat kamera tepat di atasnya agar meja tidak tertutup. Bawaan untuk game papan.
- **Kamera atas** — khusus game papan (Catur, Dam, Ludo, Mancala): papan dilihat dari atas.

Pilihan kamera terakhir diingat untuk meja berikutnya.

Di game kartu, kartumu **dipegang seperti kipas di depan dada** (tidak ikut kamera) dan mukanya menghadap matamu. Lawan juga memegang kartunya dengan kedua tangan, jadi sisa kartunya terlihat jelas. Saat mengambil atau menaruh kartu, tangan karakter meraih tumpukan dan kartunya melayang ke tangan / ke meja. Kena +2 / +4 berarti mengambil kartu **satu per satu** sebanyak itu, dan di awal permainan kartu dibagikan satu per satu. Kartu yang sudah dibuang menumpuk berserakan di tengah meja dan tumpukannya makin tinggi.

- **Kartu Kilat** (2–4, berdua duduk berhadapan): cocokkan warna atau angka/simbol. Tidak punya kartu cocok? **Ketuk tumpukan kartu** (bertepi kuning berdenyut saat boleh mengambil). Kartu hanya berwarna (merah, kuning, hijau, biru) tanpa simbol. Lewati, Balik, +2, Pelangi, Pelangi +4. Tekan **Kilat!** saat tinggal 2 kartu.
- **Catur** (1v1): bidak 3D bergaris tepi tipis — bidak hitam bergaris putih, bidak putih bergaris hitam — agar mudah dibedakan di petak gelap maupun terang. Aturan lengkap (rokade, en passant, promosi otomatis jadi menteri, skak mat, remis).
- **Dam** (1v1): papan 8×8, wajib makan, makan beruntun. Bidak biasa hanya bisa maju (melangkah maupun makan); **raja** bisa maju-mundur jarak jauh dan tampil sebagai dua keping bertumpuk bermahkota emas.
- **Catur & Dam**: bidak terangkat lalu melayang ke petak tujuannya (termasuk benteng saat rokade). Bidak yang dimakan diangkat dari papan, dibawa ke belakang papan, dan disusun rapi berjajar di sisi pemain yang memakannya.
- **Ludo** (2, 3, atau 4): **ketuk dadu** di depanmu untuk melempar — dadu berpindah ke depan pemain yang mendapat giliran. Pion melompat petak demi petak; pion yang dimakan terpental kembali ke kandang. Bila hanya ada satu pilihan langkah, pion berjalan otomatis. Keluar dengan 6, petak aman bertanda bintang. Saat giliranmu melempar, dadu bergaris tepi kuning; setelah melempar, pion yang bisa dijalankan bergaris tepi kuning. Pion selalu tepat di tengah petak, dan beberapa pion dalam satu petak (termasuk di finis, di segitiga warnanya) bertumpuk ke atas.

- **Empat Sejajar** (1v1): papan kayu tegak 7×6. Arahkan ke kolom (di PC muncul cakram bayangan) lalu ketuk — cakram jatuh dan memantul dengan bunyi "klak". Susun 4 sejajar (mendatar, tegak, atau miring); garis kemenangan menyala. Saat main lagi, kunci bawah dibuka dan semua cakram berjatuhan. Pemain pertama bergantian tiap ronde.
- **Mancala** (1v1, aturan klasik): 6 lubang + 1 lumbung per pemain, 4 biji per lubang. Ketuk lubang di sisimu (bercincin kuning saat bisa dipilih): biji diangkat lalu ditabur satu per satu berlawanan arah jarum jam (melewati lumbung lawan), tiap biji berbunyi "tik". Biji terakhir di lumbung sendiri = jalan lagi; di lubang kosong sendiri = biji di lubang itu & seberangnya dibawa ke lumbung. Bila satu sisi kosong, sisa biji masuk lumbung pemiliknya. Angka di tiap lubang menunjukkan jumlah biji.

Logika berjalan di perangkat pembuat meja (bandar): state disiarkan lewat player state `cg`, aksi lewat event `cg`, undangan lewat `cg-inv`.

## Pool

Meja biliar ada di area olahraga (dekat lapangan tenis, juga tampil di peta). Buka **Game → Pool**, undang teman atau tambah bot. Di lobi, bandar memilih **15 bola** (7 merah, 7 biru, 1 hitam) atau **9 bola** (4 + 4 + 1, ronde cepat). Bola putih = bola tembak.

- **Tampilan POV, tanpa kamera bebas** — kamera dari belakang stik. Saat bidikan diputar, karaktermu **berjalan memutari meja** agar selalu di belakang bola putih (pemain lain melihatmu berjalan & membungkuk memegang stik). Cubit / scroll / geser atas-bawah = maju-mundur kamera. Tahan tombol **Lihat atas** (di bawah gear) untuk melihat seluruh meja.
- **Bidik dua lapis** — kasar: geser layar ke kiri/kanan, atau ketuk bola yang ingin dituju. Halus: geser strip bergerigi di kanan.
- **Garis lintasan dinamis** — garis dari bola putih ke titik sentuh (lingkaran bola hantu), arah bola sasaran setelah dipukul (makin lurus makin panjang), dan arah pantulan bola putih (ikut berubah oleh efek atas/bawah). Bila mengenai bantalan, tampil arah pantulannya. Peringatan muncul bila sasaran bukan bolamu.
- **Pemilih efek** — ketuk bola kecil di kanan bawah, lalu pilih titik pukul di bola besar: atas = bola putih ikut maju, bawah = bola putih tertarik mundur, kiri/kanan = efek saat memantul di bantalan.
- **Power tarik-lepas** — tarik pegangan di bar kiri ke bawah (stik ikut mundur), lepaskan untuk memukul. Tarik kembali ke atas untuk batal.
- **Bola di tangan** — saat pukulan pembuka (di daerah kepala) atau setelah lawan foul: kamera pindah ke atas, geser bola putih ke tempat yang sah, lalu **Selesai**.

Aturan (sederhana): meja terbuka sampai ada yang memasukkan bola — pemain yang **pertama memasukkan bola mengunci warna itu**, lawan mendapat warna lainnya. Masukkan bolamu untuk terus memukul. **Foul** bila bola putih masuk, tidak mengenai bola apa pun, atau lebih dulu mengenai bola lawan / bola 8 → lawan mendapat bola di tangan. Setelah warnamu habis, masukkan **bola 8** (tanpa sebut lubang) untuk menang; bola 8 masuk lebih cepat atau sambil foul = kalah. Bola 8 yang masuk saat pukulan pembuka dikembalikan ke titik kaki. Waktu bidik 45 detik; bila habis, pukulan dilakukan otomatis.

Semua perangkat mensimulasikan setiap pukulan sendiri dari posisi & parameter pukulan yang sama (fisika memakai operasi yang hasilnya identik di semua perangkat), jadi gerak bola mulus tanpa mengirim posisi bola terus-menerus; bandar tetap menetapkan hasil resminya.

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
- **Tenis**: arah pukulan mengikuti kamera, tahan untuk tenaga.
- **Tenis**: servis dari belakang garis, harus masuk kotak servis (2 kesempatan). Bola boleh memantul sekali. Pertama mencapai 7 poin (selisih 2). Cincin kuning menunjukkan perkiraan jatuhnya bola; meteran hijau = masih masuk.

Fisika bola dihitung oleh pembuat pertandingan (`sb` 20×/detik); pemain lain memprediksi bola secara lokal dan dikoreksi halus, sehingga tendangan sendiri terasa langsung.

## Voice chat

Tekan tombol **mikrofon** (atau `V`) untuk bicara. Semua pemain otomatis bisa *mendengar* pemain yang bicara dalam radius ±26 m (maks. 8 orang terdekat). Ikon mikrofon hijau muncul di atas kepala pemain yang sedang bicara.

- Audio mengalir **langsung antar perangkat** (WebRTC peer-to-peer); jaringan game hanya dipakai untuk bertukar sinyal awal.
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
Jika Source masih **Deploy from a branch**, GitHub juga menerbitkan `index.html` mentah (belum di-build) sehingga di HP bisa tampil halaman polos tanpa gaya. Workflow menunggu proses itu selesai lalu menerbitkan hasil build paling akhir, dan halaman mentah otomatis memuat ulang versi terbaru — tetapi ubah Source ke GitHub Actions agar masalah ini hilang sepenuhnya.

### Jaringan peer-to-peer (tanpa server, tanpa kuota)

Multiplayer memakai **Trystero** (`src/net/P2PNetwork.js`):

1. **Perkenalan** — pemain menemukan satu sama lain lewat puluhan **relay Nostr publik** yang gratis (pesan perkenalan dienkripsi). Tidak perlu akun, API key, atau kartu kredit, dan tidak ada kuota bulanan.
2. **Bermain** — setelah tersambung, posisi, chat, game meja, olahraga, dan suara mengalir **langsung antar browser** (WebRTC), tidak lewat server mana pun.

Batasan yang perlu diketahui:

- **Maks. 20 pemain per room** (`src/config.js` → `maxPlayersPerRoom`). Dunia Publik yang penuh otomatis pindah ke *publik-2*, *publik-3*, dst. Room ramai memakai jaringan bertingkat (`scale()`) agar HP tidak kewalahan.
- **Jaringan sangat ketat** (sebagian operator seluler / Wi‑Fi kantor-sekolah dengan NAT simetris) kadang tidak bisa tersambung langsung karena tidak ada server TURN gratis tanpa akun. Bila teman tidak terlihat, coba jaringan lain (mis. Wi‑Fi ⇄ data seluler).
- **Host** (penyimpan riwayat chat & pengeluar pemain AFK) = pemain yang paling dulu masuk; otomatis pindah bila ia keluar. **Riwayat chat** hilang bila semua pemain keluar.
- Relay publik dikelola komunitas Nostr; Trystero memakai beberapa sekaligus, jadi satu relay mati tidak masalah.

## Pengembangan

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # hasil di dist/
npm run preview    # cek hasil build
```

Untuk mencoba di HP pada Wi‑Fi yang sama, buka alamat "Network" yang ditampilkan Vite.
Pointer Lock, mikrofon, dan service worker (PWA) hanya aktif di **HTTPS** atau `localhost`.
Untuk menguji multiplayer tanpa internet, jalankan relay Nostr lokal lalu buka `?relay=ws://127.0.0.1:7777`.

### Cara kerja jaringan

Tiap klien mensimulasikan karakternya sendiri (client-authoritative) lalu menyiarkan state ke semua pemain lewat kanal data WebRTC (aksi Trystero `st` untuk player state, `ev` untuk event, `rs` untuk state room). Pemain baru langsung menerima salinan lengkap state tiap pemain.

| Data | Isi | Lewat |
|---|---|---|
| `profile` (player state) | `{ name, color, look }` | P2P |
| `m` (player state) | `[x, y, z, rotY, speed, flags, waktuKirim, arahKepalaYaw, arahKepalaPitch]` ±15×/detik | P2P |
| `item`, `chairs`, `ia` (player state) | item dipegang, kursi milik pemain, tanda aktivitas AFK | P2P |
| `vc` (player state) | status voice: 0 tidak ikut, 1 mendengar, 2 mikrofon menyala | P2P |
| `cg` (player state bandar) | state meja game | P2P |
| `sp` (player state tuan rumah) | state pertandingan (tim, skor, fase, servis, penalti) | P2P |
| `sb` / `sbt` (player state tuan rumah) | bola `[x,y,z,vx,vy,vz,t,hitN,pemilik]` / posisi bot | P2P |
| `chat`, `act`, `bonk` (RPC) | pesan chat, animasi aksi, bonk | P2P |
| `cg`, `cg-inv`, `sp-a`, `sp-inv`, `sp-tk` (RPC) | aksi & undangan game meja / lapangan, sleding | P2P |
| `vs` (RPC) | sinyal WebRTC voice chat (offer/answer) | P2P |
| `chatlog` (room state, ditulis host) | 50 pesan terakhir | P2P |

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
  tablegames/TableGames.js   pengelola meja: undangan, kamera kepala/bebas/atas, UI
  tablegames/HostBase.js     dasar logika bandar (lobi, giliran, timer, bot)
  tablegames/games/          kilat, catur, dam, ludo, empat (sejajar), mancala, pool (+ file aturan)
  tablegames/pool/physics.js fisika bola pool (deterministik), susunan bola, prediksi lintasan
  sports/fields.js           visual lapangan bola & tenis
  sports/physics.js          fisika bola/kok, solusi lintasan pukulan
  sports/football.js         tembakan & umpan otomatis, penguasaan bola, penalti tebak arah
  sports/SportHost.js        aturan pertandingan, skor, bot (di perangkat tuan rumah)
  sports/Sports.js           lobi, undangan, prediksi bola, tendang/pukul, papan skor
  net/P2PNetwork.js          jaringan peer-to-peer Trystero (publik / privat / undangan, host, kick)
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
