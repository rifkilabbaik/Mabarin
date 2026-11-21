// Konfigurasi global game. Ubah nilai di sini untuk menyesuaikan dunia & gameplay.
export const CONFIG = {
  // Multiplayer peer-to-peer (Trystero): tanpa server sendiri, tanpa akun, tanpa kuota.
  maxPlayersPerRoom: 20,
  p2p: {
    appId: 'mabarin.rifkilabbaik.github.io', // pemain dengan appId yang sama bisa saling bertemu
    publicShards: 6, // dunia publik penuh => pindah ke publik-2, publik-3, ...
    relayTimeoutMs: 12000,
    probeMs: 2500,
  },

  world: {
    seed: 1337, // seed yang sama => dunia identik di semua klien
    size: 240, // panjang sisi terrain (unit)
    segments: 96, // resolusi grid terrain (semakin kecil = semakin low poly)
    waterLevel: 0,
    trees: { pine: 230, round: 150 },
    rocks: 130,
    bushes: 160,
    flowers: 700,
    clouds: 16,
  },

  player: {
    walkSpeed: 5,
    runSpeed: 9,
    swimSpeed: 3.2,
    jumpVelocity: 9.5,
    gravity: 26,
    radius: 0.42,
    dashCooldown: 1.6,
    slideCooldown: 1.8,
    height: 1.7,
  },

  camera: {
    distance: 7,
    minDistance: 3,
    maxDistance: 16,
    minPitch: -0.35,
    maxPitch: 1.25,
    mouseSensitivity: 0.0025,
    touchSensitivity: 0.006,
  },

  // Kompleks olahraga (area diratakan) + plaza meja game
  sports: {
    zone: { x: 6, z: -38, w: 76, d: 46, h: 4, margin: 9 },
    fields: {
      bola: { x: -8, z: -38, L: 32, W: 20, goalW: 5, goalH: 2 },
      tenis: { x: 28, z: -46, L: 20, W: 10, net: 0.95 },
    },
    plazaTables: [[0, -19.5], [8, -19.5], [16, -19.5], [24, -19.5]],
    poolTables: [[33, -26.5]], // meja pool (panjang searah sumbu x)
    squareTables: [[-9, -19.5], [-18, -19.5]], // meja persegi besar (Juragan)
  },

  // Pemain yang tidak menyentuh kontrol selama ini dikeluarkan agar room tidak penuh.
  afk: {
    warnMs: 45 * 1000,
    kickMs: 60 * 1000,
  },

  net: {
    sendRate: 15, // update posisi per detik
    interpolationDelay: 120, // ms
  },

  colors: [
    '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7',
    '#748ffc', '#b197fc', '#f783ac', '#f8f9fa', '#868e96', '#5c3d2e',
  ],
};
