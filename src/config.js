// Konfigurasi global game. Ubah nilai di sini untuk menyesuaikan dunia & gameplay.
export const CONFIG = {
  // ID game dari dashboard Playroom (https://dev.joinplayroom.com). Bisa diisi via .env: VITE_PLAYROOM_GAME_ID
  playroomGameId: import.meta.env.VITE_PLAYROOM_GAME_ID || '',
  // Kode room untuk "Dunia Publik" — semua pemain yang memilih dunia publik masuk ke room ini.
  publicRoomCode: import.meta.env.VITE_PUBLIC_ROOM || 'LOWPOLYWORLD',
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
    radius: 0.45,
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

  net: {
    sendRate: 15, // update posisi per detik
    interpolationDelay: 120, // ms
  },

  colors: [
    '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7',
    '#748ffc', '#b197fc', '#f783ac', '#f8f9fa', '#868e96', '#5c3d2e',
  ],
};
