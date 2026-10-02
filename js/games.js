/*
 * MABARIN - Daftar mode & game
 * ------------------------------------------------------------
 * Cara menambah game baru:
 *   1. Buat folder  games/<id>/  berisi index.html game tersebut.
 *   2. Tambahkan entri di array GAMES di bawah.
 *   3. Tambahkan path file game ke PRECACHE di sw.js agar bisa offline,
 *      lalu naikkan versi CACHE_VERSION di sw.js & APP_VERSION di app.js.
 *
 * Contoh entri:
 *   {
 *     id: 'tap-race',              // nama folder di /games
 *     title: 'Tap Race',           // judul di kartu
 *     modes: ['2p', '3p', '4p'],   // muncul di kategori mana saja
 *     color: 'red',                // red | blue | green | yellow | purple | pink | navy
 *     icon: '👆',                  // emoji / teks pendek, atau path gambar: 'games/tap-race/cover.png'
 *     isNew: true                  // tampilkan pita "BARU!"
 *   }
 */

window.MABARIN_MODES = [
  { id: '1p',    big: '1',  label: 'PEMAIN',      color: 'red',    title: '1 PEMAIN' },
  { id: '2p',    big: '2',  label: 'PEMAIN',      color: 'blue',   title: '2 PEMAIN' },
  { id: '3p',    big: '3',  label: 'PEMAIN',      color: 'green',  title: '3 PEMAIN' },
  { id: '4p',    big: '4',  label: 'PEMAIN',      color: 'yellow', title: '4 PEMAIN' },
  { id: 'team',  big: '2vs2', label: 'TIM',       color: 'purple', title: 'MAIN TIM' },
  { id: 'party', big: '',   label: 'PARTY GAMES', color: 'pink',   title: 'PARTY GAMES', isNew: true }
];

window.MABARIN_GAMES = [
  // Game akan ditambahkan di sini secara berkala.
];
