// Pilihan kustomisasi karakter chibi. Semua klien memakai daftar yang sama,
// jadi yang dikirim lewat jaringan cukup id-nya saja.
import { CONFIG } from '../config.js';

export const LOOK_OPTIONS = {
  body: [
    { id: 'normal', label: 'Normal' },
    { id: 'tall', label: 'Tinggi' },
    { id: 'short', label: 'Pendek' },
    { id: 'chubby', label: 'Gemuk' },
  ],
  skin: ['#ffe0c7', '#f5c9a0', '#e3a874', '#c68642', '#8d5524', '#5c3a21'],
  hair: [
    { id: 'none', label: 'Botak' },
    { id: 'spiky', label: 'Jabrik' },
    { id: 'bob', label: 'Bob' },
    { id: 'long', label: 'Panjang' },
    { id: 'ponytail', label: 'Kuncir' },
    { id: 'buns', label: 'Cepol' },
    { id: 'mohawk', label: 'Mohawk' },
    { id: 'afro', label: 'Kribo' },
  ],
  hairColor: ['#2b2118', '#6b4226', '#e0b04a', '#c4542b', '#f1f3f5', '#f783ac', '#4dabf7', '#51cf66'],
  eyes: [
    { id: 'round', label: 'Bulat' },
    { id: 'big', label: 'Besar' },
    { id: 'happy', label: 'Senyum' },
    { id: 'sleepy', label: 'Ngantuk' },
  ],
  top: [
    { id: 'tshirt', label: 'Kaos' },
    { id: 'shirt', label: 'Kemeja' },
    { id: 'hoodie', label: 'Hoodie' },
    { id: 'jacket', label: 'Jaket' },
    { id: 'tank', label: 'Kaos kutang' },
    { id: 'dress', label: 'Gaun' },
  ],
  topColor: CONFIG.colors,
  bottom: [
    { id: 'pants', label: 'Celana panjang' },
    { id: 'shorts', label: 'Celana pendek' },
    { id: 'skirt', label: 'Rok' },
  ],
  bottomColor: ['#364fc7', '#1d2333', '#868e96', '#5c3d2e', '#2b8a3e', '#c92a2a', '#f1f3f5', '#e67700'],
  shoes: [
    { id: 'sneakers', label: 'Sneakers' },
    { id: 'boots', label: 'Sepatu bot' },
    { id: 'sandals', label: 'Sandal' },
  ],
  hat: [
    { id: 'none', label: 'Tidak ada' },
    { id: 'cap', label: 'Topi pet' },
    { id: 'cowboy', label: 'Koboi' },
    { id: 'beanie', label: 'Kupluk' },
    { id: 'party', label: 'Pesta' },
    { id: 'crown', label: 'Mahkota' },
  ],
  face: [
    { id: 'none', label: 'Tidak ada' },
    { id: 'glasses', label: 'Kacamata' },
    { id: 'shades', label: 'Kacamata hitam' },
    { id: 'mustache', label: 'Kumis' },
  ],
  back: [
    { id: 'none', label: 'Tidak ada' },
    { id: 'backpack', label: 'Ransel' },
    { id: 'wings', label: 'Sayap' },
    { id: 'cape', label: 'Jubah' },
  ],
  neck: [
    { id: 'none', label: 'Tidak ada' },
    { id: 'scarf', label: 'Syal' },
    { id: 'bowtie', label: 'Dasi kupu-kupu' },
  ],
};

export const DEFAULT_LOOK = {
  body: 'normal',
  skin: '#f5c9a0',
  hair: 'spiky',
  hairColor: '#2b2118',
  eyes: 'round',
  top: 'tshirt',
  topColor: '#4dabf7',
  bottom: 'pants',
  bottomColor: '#364fc7',
  shoes: 'sneakers',
  hat: 'none',
  face: 'none',
  back: 'none',
  neck: 'none',
};

const ids = (key) => LOOK_OPTIONS[key].map((o) => (typeof o === 'string' ? o : o.id));

// Pastikan data dari jaringan/penyimpanan valid.
export function sanitizeLook(look, fallbackColor) {
  const out = { ...DEFAULT_LOOK };
  if (fallbackColor && ids('topColor').includes(fallbackColor)) out.topColor = fallbackColor;
  if (!look || typeof look !== 'object') return out;
  for (const key of Object.keys(DEFAULT_LOOK)) {
    if (ids(key).includes(look[key])) out[key] = look[key];
  }
  return out;
}

export function randomLook(rand = Math.random) {
  const pick = (key) => {
    const list = ids(key);
    return list[Math.floor(rand() * list.length)];
  };
  const maybe = (key, p) => (rand() < p ? 'none' : pick(key));
  return {
    body: pick('body'),
    skin: pick('skin'),
    hair: pick('hair'),
    hairColor: pick('hairColor'),
    eyes: pick('eyes'),
    top: pick('top'),
    topColor: pick('topColor'),
    bottom: pick('bottom'),
    bottomColor: pick('bottomColor'),
    shoes: pick('shoes'),
    hat: maybe('hat', 0.55),
    face: maybe('face', 0.65),
    back: maybe('back', 0.65),
    neck: maybe('neck', 0.65),
  };
}

// Proporsi chibi per bentuk tubuh (satuan dunia, kaki di y = 0).
const BASE = {
  normal: { leg: 0.42, torsoH: 0.4, torsoR: 0.21, headR: 0.4, arm: 0.36, limb: 0.075 },
  tall: { leg: 0.56, torsoH: 0.47, torsoR: 0.2, headR: 0.38, arm: 0.44, limb: 0.072 },
  short: { leg: 0.3, torsoH: 0.33, torsoR: 0.21, headR: 0.41, arm: 0.3, limb: 0.072 },
  chubby: { leg: 0.4, torsoH: 0.41, torsoR: 0.3, headR: 0.41, arm: 0.36, limb: 0.095 },
};
export const BODY_DIMS = {};
for (const [k, b] of Object.entries(BASE)) {
  const hipY = b.leg + 0.06;
  const neck = b.torsoH + 0.02; // dari pinggul ke leher
  const headC = neck + b.headR * 0.9; // pusat kepala dari pinggul
  BODY_DIMS[k] = {
    ...b,
    hipY,
    neck,
    headC,
    height: hipY + headC + b.headR,
    faceY: hipY + headC, // tinggi mata saat berdiri
    seatedEye: headC + 0.06, // tinggi mata di atas dudukan saat duduk
  };
}
