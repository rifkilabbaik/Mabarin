# Ringkasan Proyek Mabarin (untuk sesi baru)

Game PWA multiplayer Three.js (Vite), di-deploy ke GitHub Pages. Repo: `rifkilabbaik/Mabarin`, branch `main`. Teks UI & balasan ke user dalam Bahasa Indonesia.

## Aturan kerja
- **Deploy**: `git push origin main` → cek workflow "Deploy ke GitHub Pages" sampai sukses (`gh run list --repo rifkilabbaik/Mabarin --limit 1`).
- Jangan ubah pengaturan GitHub Pages lewat API. Jangan buat ulang game bermerek (semua game desain orisinal).
- Tanyakan ke user sebelum mengerjakan saran besar; user peduli hemat token.
- Pesan commit diakhiri baris `Co-Authored-By` & `Claude-Session` sesuai sesi.

## Arsitektur penting
| Bagian | File |
|---|---|
| Jaringan P2P (Trystero + relay Nostr, server PUBLIK/PUBLIK-N, TURN opsional dari secret `TURN_*`) | `src/net/P2PNetwork.js` |
| Karakter chibi (primitif digabung, cache geometri, pose) | `src/character/Character.js`, `src/character/looks.js` |
| Kerangka game meja (lobi, giliran, bot, peringkat) | `src/tablegames/HostBase.js`, `src/tablegames/TableGames.js` |
| Game | `src/tablegames/games/` — kilat, catur, dam, ludo, empat, mancala, pool |
| Fisika pool (deterministik, `rack` 2 pemain & `rackMulti` 3–4 pemain) | `src/tablegames/pool/physics.js` |
| Lemari kustomisasi | `src/ui/CustomizePanel.js` |
| HUD gaya B, kamera 1st/3rd (tombol P), anti-zoom iPhone | `src/ui/UI.js`, `src/camera/ThirdPersonCamera.js`, `src/ui/zoomGuard.js` |
| Lokasi meja & tempat tunggu (pool 4 tempat) | `src/world/props.js` |

## Fitur terbaru (sudah live)
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
- Server dev: `npx vite --host 127.0.0.1 --port 5173 --strictPort`.
- Playwright + Chromium: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
- Alur:
  1. Buka `?q=low`, isi `#name-input`, klik `#btn-offline`.
  2. Tekan `KeyG`, klik `#games-list .game-tile:has-text("Pool")`.
  3. Tambah bot: klik `#invite-bot` (bot berikutnya: `window.__game.cards.host.addBot()`).
  4. Klik `#cu-start` (main solo: sembunyikan `#invite-modal` dulu).
- State game: `window.__game.cards.host.state`. Uji aturan pool: `host.resolveMulti()` dengan objek `sim` palsu `{ pots, first, final() }`.
