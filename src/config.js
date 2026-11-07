// Konfigurasi global game. Ubah nilai di sini untuk menyesuaikan dunia & gameplay.
export const CONFIG = {
  // Multiplayer memakai server gratis Playroom Kit (tanpa akun / Game ID).
  // Kode room untuk "Dunia Publik" — semua pemain yang memilih dunia publik masuk ke room ini.
  publicRoomCode: 'LOWPOLYWORLD',
  maxPlayersPerRoom: 24,
  connectTimeoutMs: 15000,

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
      badminton: { x: 28, z: -29, L: 13, W: 6, net: 1.55 },
    },
    plazaTables: [[0, -19.5], [8, -19.5], [16, -19.5], [24, -19.5]],
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
