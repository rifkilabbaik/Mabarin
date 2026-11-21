# Mabarin

Game dunia terbuka **multiplayer** berbasis web (PWA) dengan **Three.js** + jaringan **peer-to-peer** ([Trystero](https://github.com/dmotz/trystero)).
Art style **low poly** (flat shading) dengan karakter **chibi** yang bisa dikustomisasi.
Tanpa akun, tanpa server sendiri, **tanpa kuota**: game di-host gratis di **GitHub Pages**, pemain saling tersambung langsung (WebRTC).

## Fitur

- **Pulau low poly prosedural** (seed tetap, dunia identik di semua pemain): bukit, gunung bersalju, pantai, laut beranimasi, hutan, api unggun, tenda, plaza meja game, dan **kompleks olahraga**.
- **Karakter chibi halus** (bentuk bulat, sudut membulat, shading halus — tidak bersegi) dengan animasi jalan, lari, lompat, berenang, duduk, dash, sleding, tendang, pukul raket. Kepala mengikuti arah pandang saat duduk di meja game.
- **Kustomisasi karakter (Lemari)**: panel kanan saat layar mendatar, panel bawah saat tegak; tab kategori dengan **thumbnail bergambar** yang dirender dari karakter sendiri (item yang dipilih langsung terlihat di badanmu). Pilihan: bentuk tubuh (normal / tinggi / pendek / gempal), warna kulit, 8 gaya rambut + warna, 4 gaya mata, atasan / bawahan / sepatu + warna, topi, kacamata, ransel / sayap / jubah, syal / dasi.
- **Hotbar properti**: Tangan, Palu Bonk, Pedang Kayu, Pistol Air, Kursi, Gitar. Senjata bersifat "bonk" (terpental & pusing, tanpa nyawa). Pemain yang sedang main game tidak bisa di-bonk.
- **Game meja**: Kartu Kilat, Catur, Dam, Ludo, Empat Sejajar & Mancala dengan tiga pilihan kamera (kepala, bebas, atas).
- **Pool** di meja biliar area olahraga: tampilan POV, berjalan memutari meja saat membidik.
- **Kompleks olahraga**: Sepak Bola (1v1, 2v2, adu penalti), Tenis (1v1, ganda), dengan **dash** dan **sleding**.
- **Voice chat berbasis jarak** (WebRTC): suara makin pelan saat menjauh, kiri/kanan mengikuti posisi.
- **Minimap & peta pulau**, **chat dengan riwayat** (juga terlihat saat main game), **musik lofi & efek suara** (Web Audio, tanpa file audio).
- **Bot** untuk mengisi kursi/lapangan kosong, **kick otomatis pemain AFK**, **Main Offline**, **PWA** (bisa di-install).

### Tampilan (HUD)

- **Dunia (sama seperti di meja game)**: kiri atas **peta** + info room ringkas (Publik / kode room / Offline · jumlah pemain). Kanan atas tombol **gear**; di bawahnya **rekam pesan suara → chat → kamera** (orang pertama/ketiga). Ketuk gear untuk baki **mikrofon, game, menu**. PC: hotbar item di bawah tengah.
- **HP**: tata letak yang sama; joystick di kiri bawah, tombol lompat & aksi di kanan bawah, tombol pilih item kecil di atasnya.
- **Meja game**: layar bersih — hanya **daftar giliran** di kiri atas (ikon karakter, nama, jumlah kartu, hitung mundur pada pemain yang sedang giliran, arah urutan) dan tombol **gear** (bulat) di kanan atas. Di bawah gear berurutan tombol **rekam pesan suara** dan **chat**; ketuk gear untuk memunculkan mikrofon, menu, menyerah (game papan), dan keluar. Di bawahnya lagi ada **tombol kamera** untuk mengganti tampilan.

- **iPhone/iPad**: Safari mengabaikan larangan zoom, jadi game memblokir cubit/ketuk-dua-kali yang memperbesar halaman dan mengembalikan skala ke normal setelah mengetik chat atau memutar HP.

### Kontrol

| | PC / Laptop | HP / Tablet |
|---|---|---|
| Gerak | Panah / WASD, `Shift` lari | Joystick virtual (dorong penuh = lari) |
| Kamera | Klik layar (Pointer Lock) + mouse, scroll zoom | Geser sisi kanan, cubit untuk zoom |
| Orang pertama / ketiga | `P` atau tombol kamera di dock | Tombol kamera di kapsul atas |
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

Saat permainan selesai, hasilnya (**Kamu menang!**, **Kamu kalah**, atau **Seri**) tampil sebagai banner di atas, sedangkan tombol **Keluar** & **Ulangi** ada di bawah — meja tetap terlihat.

Di game kartu, kartumu **dipegang seperti kipas di depan dada** (tidak ikut kamera) dan mukanya menghadap matamu. Lawan juga memegang kartunya dengan kedua tangan, jadi sisa kartunya terlihat jelas. Saat mengambil atau menaruh kartu, tangan karakter meraih tumpukan dan kartunya melayang ke tangan / ke meja. Kena +2 / +4 berarti mengambil kartu **satu per satu** sebanyak itu, dan di awal permainan kartu dibagikan satu per satu. Kartu yang sudah dibuang menumpuk berserakan di tengah meja dan tumpukannya makin tinggi.

- **Kartu Kilat** (2–4, berdua duduk berhadapan): cocokkan warna atau angka/simbol. Tidak punya kartu cocok? **Ketuk tumpukan kartu** (bertepi kuning berdenyut saat boleh mengambil). Kartu hanya berwarna (merah, kuning, hijau, biru) tanpa simbol. Lewati, Balik, +2, Pelangi, Pelangi +4. Tekan **Kilat!** saat tinggal 2 kartu.
- **Catur** (1v1): bidak 3D bergaris tepi tipis — bidak hitam bergaris putih, bidak putih bergaris hitam — agar mudah dibedakan di petak gelap maupun terang. Aturan lengkap (rokade, en passant, promosi otomatis jadi menteri, skak mat, remis).
- **Dam** (1v1): papan 8×8, wajib makan, makan beruntun. Bidak biasa hanya bisa maju (melangkah maupun makan); **raja** bisa maju-mundur jarak jauh dan tampil sebagai dua keping bertumpuk bermahkota emas.
- **Catur & Dam**: tangan karakter meraih bidak, mengangkatnya, lalu menaruhnya di petak tujuan (benteng saat rokade ikut pindah). Bidak yang dimakan diambil tangan, dibawa ke belakang papan, dan disusun rapi berjajar di sisi pemain yang memakannya.
- **Ludo** (2, 3, atau 4): **ketuk dadu** di depanmu untuk melempar — dadu berpindah ke depan pemain yang mendapat giliran. Pion melompat petak demi petak; pion yang dimakan terpental kembali ke kandang. Bila hanya ada satu pilihan langkah, pion berjalan otomatis. Keluar dengan 6, petak aman bertanda bintang. Saat giliranmu melempar, dadu bergaris tepi kuning; setelah melempar, pion yang bisa dijalankan bergaris tepi kuning. Pion selalu tepat di tengah petak, dan beberapa pion dalam satu petak (termasuk di finis, di segitiga warnanya) bertumpuk ke atas.

- **Empat Sejajar** (1v1): papan kayu tegak 7×6 yang tebal (dua panel kayu berlubang dengan sekat antar kolom, terlihat bervolume dari atas). Arahkan ke kolom (di PC muncul cakram bayangan) lalu ketuk — tangan karakter membawa cakram ke atas kolom, cakram jatuh dan memantul dengan bunyi "klak". Susun 4 sejajar (mendatar, tegak, atau miring): cakramnya menyala dan garis kemenangan tumbuh melintasinya. Saat main lagi, kunci bawah dibuka dan semua cakram berjatuhan. Pemain pertama bergantian tiap ronde.
- **Mancala** (1v1, aturan klasik): papan kayu berserat halus dengan ujung melengkung; lubang berbentuk tabung (dinding lurus, dasar melengkung) dan lumbung berbentuk kapsul, semuanya benar-benar berongga. 6 lubang + 1 lumbung per pemain, 4 kelereng per lubang. Ketuk lubang di sisimu (bercincin kuning saat bisa dipilih): tangan karakter menggenggam semua kelereng lalu menaburnya satu per satu berlawanan arah jarum jam (melewati lumbung lawan), tiap kelereng berbunyi "tik". Biji terakhir di lumbung sendiri = jalan lagi; di lubang kosong sendiri = biji di lubang itu & seberangnya dibawa ke lumbung. Bila satu sisi kosong, sisa biji masuk lumbung pemiliknya. Angka di tiap lubang menunjukkan jumlah biji.

Logika berjalan di perangkat pembuat meja (bandar): state disiarkan lewat player state `cg`, aksi lewat event `cg`, undangan lewat `cg-inv`.

## Pool

Meja biliar **9 kaki** (bidang main 2,54 × 1,27 m) bergaya klasik — bingkai kayu oak, tutup lubang hitam, kain hijau, kaki meruncing berkaki krom — ada di area olahraga (dekat lapangan tenis, juga tampil di peta). Buka **Game → Pool**, undang teman, tambah bot, atau langsung **Mulai sendirian (latihan solo)** — giliran tetap padamu, warna dikunci saat bola pertama masuk, dan bola 8 yang masuk terlalu cepat berarti kalah/coba lagi. Bot berjalan langsung dari posisinya ke posisi tembak berikutnya (tidak kembali ke tempat tunggu). Di lobi, bandar memilih **15 bola** (7 merah, 7 biru, 1 hitam) atau **9 bola** (4 + 4 + 1, ronde cepat). Bola putih = bola tembak.

- **Tampilan POV dari mata karakter, tanpa kamera bebas.** Kolom kanan (dari atas): gear → rekam suara → chat → dua ikon mode → tombol efek bola putih → bar stik. Ikon mode:
  - **Membungkuk** — membungkuk di belakang stik untuk menembak (hanya saat giliranmu). Pindah dari berdiri ke membungkuk (dan sebaliknya) memakai transisi halus kamera & badan. Bidikan awal mengarah dari tempatmu berdiri ke bola putih; saat bidikan diputar, karakter ikut memutari meja. Karakter selalu berdiri **di luar meja** — bila bola putih jauh di tengah, karakter tetap di tepi meja (pandangan condong sedikit di atas bantalan); cubit / scroll = zoom lensa untuk melihat bola yang jauh.
  - **Berjalan** — berjalan mengelilingi meja dengan joystick yang tampil di kiri bawah (sentuh atau mouse) atau WASD / panah (PC) untuk mencari posisi menembak. Tidak bisa menembus meja — harus memutar untuk pindah ke seberang. Saat karakter (atau bot) berpindah tempat menembak, ia berjalan memutari meja lewat sudut-sudutnya, tidak pernah menembus meja. Bisa dipakai juga sambil menunggu lawan.
  - Setelah menembak, karakter otomatis kembali ke mode **berjalan** (bisa langsung berkeliling & menoleh). Pemain lain melihatmu berjalan atau membungkuk memegang stik.
- **Geser stik vs geser layar** — saat membungkuk, menggeser **stik** membuat stik ikut bergerak (bidikan berputar di sekitar bola putih); menggeser bagian lain layar memutar pandangan seperti mata.
- **Bidik** — geser stik, atau ketuk bola yang ingin dituju. Garis bantu, bola bayangan, dan stik hanya tampil saat **membungkuk** — sebelum membungkuk tidak terlihat. Garis & cincin bola bayangan menebal mengikuti jarak, jadi tetap jelas walau bola jauh.
- **Garis lintasan dinamis** — garis dari bola putih ke titik sentuh (lingkaran bola hantu), arah bola sasaran setelah dipukul (makin lurus makin panjang), dan arah pantulan bola putih (ikut berubah oleh efek atas/bawah). Bila mengenai bantalan, tampil arah pantulannya. Peringatan muncul bila sasaran bukan bolamu.
- **Pemilih efek** — ketuk bola kecil di kanan bawah, lalu pilih titik pukul di bola besar: atas = bola putih ikut maju, bawah = bola putih tertarik mundur, kiri/kanan = efek saat memantul di bantalan.
- **Power tarik-lepas** — bar stik di kolom kanan (setengah tinggi layar, di bawah tombol efek): tarik ke bawah (stik di meja ikut mundur), lepaskan untuk memukul. Tarik kembali ke atas untuk batal.
- **Warna & sisa bola** tampil di samping nama tiap pemain di daftar giliran (bulat merah-biru = meja masih terbuka, bola hitam "8" = tinggal bola 8). Peringatan merah muncul di atas bila bidikan mengenai bola lawan lebih dulu.
- **Bola di tangan** — saat pukulan pembuka (di daerah kepala) atau setelah lawan foul: kamera pindah ke atas, geser bola putih ke tempat yang sah, lalu **Selesai** (langsung membungkuk siap menembak).

Aturan (sederhana): meja terbuka sampai ada yang memasukkan bola — pemain yang **pertama memasukkan bola mengunci warna itu**, lawan mendapat warna lainnya. Masukkan bolamu untuk terus memukul. **Foul** bila bola putih masuk, tidak mengenai bola apa pun, atau lebih dulu mengenai bola lawan / bola 8 → lawan mendapat bola di tangan. Setelah warnamu habis, masukkan **bola 8** (tanpa sebut lubang) untuk menang; bola 8 masuk lebih cepat atau sambil foul = kalah. Bola 8 yang masuk saat pukulan pembuka dikembalikan ke titik kaki. Waktu bidik 45 detik; bila habis, pukulan dilakukan otomatis.

**Lubang & bantalan akurat** — lubang berupa lubang 3D sungguhan (bukan gambar hitam) dengan **keranjang jaring** di bawahnya: bola yang masuk jatuh ke keranjang lubang itu dan tetap terlihat di sana. Bantalan dan *jaw* (sudut miring di mulut lubang) dihitung sebagai segmen garis dengan ujung membulat, sehingga bola yang menyentuh bantalan atau tepi mulut lubang memantul dengan benar; bola baru masuk setelah melewati garis mulut lubang.

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
- Memakai **server STUN publik Google** (gratis, tanpa akun) untuk menemukan alamat, ditambah server **TURN** bila dikonfigurasi (lihat *Server TURN* di bawah). Tanpa TURN, pada sebagian jaringan dengan NAT ketat (beberapa operator seluler, Wi‑Fi kantor/sekolah) suara mungkin tidak tersambung.
- Butuh HTTPS (GitHub Pages sudah HTTPS) dan izin mikrofon.

## Pesan suara

**Tahan** tombol rekam (ikon gelombang suara, di sebelah mikrofon; di meja game ada di bawah gear) untuk merekam, **lepas** untuk mengirim. Rekaman (maks. 15 detik) langsung diputar untuk dirimu dan semua pemain di room, ikon bicara muncul di atas kepala pengirim, dan tercatat di chat dengan tombol putar ulang. Pertama kali dipakai, browser meminta izin mikrofon.

## Pemain AFK

Pemain yang tidak menyentuh kontrol selama **45 detik** mendapat peringatan "Masih di sini?" dan dikeluarkan otomatis setelah **1 menit**. Saat duduk di meja game atau ikut pertandingan, pemain dianggap aktif. Host room juga mengeluarkan pemain yang tanda aktivitasnya berhenti (mis. aplikasi di HP ditutup). Atur di `src/config.js` → `afk`.

## Main online

Game online lewat GitHub Pages: **https://rifkilabbaik.github.io/Mabarin/**

1. Buka link di PC atau HP, isi nama & atur karakter.
2. **Masuk Dunia Publik** → semua pemain masuk room yang sama. Link undangan dari Dunia Publik (`...#r=RPUBLIK`) membawa teman ke dunia publik yang sama. Atau **Buat Room Privat** → menu → Undang ke room untuk membagikan link (`...#r=RXXXX`).
3. Di HP, pilih "Tambahkan ke Layar Utama" / "Install app" untuk memasang sebagai aplikasi.

### Deploy otomatis (GitHub Pages)

Workflow `.github/workflows/deploy-pages.yml` mem-build dan men-deploy game setiap ada push ke `main`.
Syarat (sekali saja): **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Deploy manual: tab **Actions → Deploy ke GitHub Pages → Run workflow**.
Jika Source masih **Deploy from a branch**, GitHub juga menerbitkan `index.html` mentah (belum di-build) sehingga di HP bisa tampil halaman polos tanpa gaya. Workflow menunggu proses itu selesai lalu menerbitkan hasil build paling akhir, dan halaman mentah otomatis memuat ulang versi terbaru — tetapi ubah Source ke GitHub Actions agar masalah ini hilang sepenuhnya.

### Jaringan peer-to-peer (tanpa server, tanpa kuota)

Multiplayer memakai **Trystero** (`src/net/P2PNetwork.js`):

1. **Perkenalan** — pemain menemukan satu sama lain lewat **11 relay Nostr publik** yang gratis (pesan perkenalan dienkripsi): 5 relay pilihan lama (agar tetap cocok dengan versi sebelumnya) + relay besar dari daftar yang sudah diuji Trystero. Banyak relay sekaligus membuat pemain tetap punya relay bersama walau sebagian relay mati atau diblokir operator internet. Tidak perlu akun, API key, atau kartu kredit, dan tidak ada kuota bulanan.
2. **Bermain** — setelah tersambung, posisi, chat, game meja, olahraga, dan suara mengalir **langsung antar browser** (WebRTC), tidak lewat server mana pun.

Batasan yang perlu diketahui:

- **Maks. 20 pemain per room** (`src/config.js` → `maxPlayersPerRoom`). Dunia Publik yang penuh otomatis pindah ke *publik-2*, *publik-3*, dst. Room ramai memakai jaringan bertingkat (`scale()`) agar HP tidak kewalahan.
- **Jaringan sangat ketat** (sebagian operator seluler / Wi‑Fi kantor-sekolah dengan NAT simetris/CGNAT) kadang tidak bisa tersambung langsung. Game memberi tahu bila ini terjadi. Solusinya server **TURN** (jalur cadangan) — lihat di bawah. Tanpa TURN, coba jaringan lain (mis. Wi‑Fi ⇄ data seluler).
- **Host** (penyimpan riwayat chat & pengeluar pemain AFK) = pemain yang paling dulu masuk; otomatis pindah bila ia keluar. **Riwayat chat** hilang bila semua pemain keluar.
- Relay publik dikelola komunitas Nostr; game memakai 11 sekaligus, jadi beberapa relay mati tidak masalah. Bila dua pemain tidak punya relay bersama, pemain ketiga yang tersambung ke keduanya ikut menjembatani.

#### Server TURN (opsional, disarankan untuk pemain data seluler)

Daftar layanan TURN gratis (mis. Metered Open Relay atau ExpressTURN), lalu isi **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Isi |
|---|---|
| `TURN_URLS` | alamat TURN dipisah koma, mis. `turn:host:80,turns:host:443?transport=tcp` |
| `TURN_USERNAME`, `TURN_CREDENTIAL` | nama pengguna & kata sandi TURN |
| `TURN_API` | *(alternatif)* URL yang mengembalikan daftar `iceServers` JSON, mis. endpoint kredensial Metered |

Workflow deploy membaca secret ini saat build (`VITE_TURN_*`) dan dipakai untuk koneksi game & voice chat. Catatan: kredensial TURN ikut terkirim ke browser pemain (semua klien butuh), jadi gunakan akun gratis khusus game ini.

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
| `vn` (RPC) | pesan suara (audio terkompresi, maks. 15 detik) | P2P |
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
