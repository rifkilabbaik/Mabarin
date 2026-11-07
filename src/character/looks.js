// Pilihan kustomisasi karakter. Semua klien memakai daftar yang sama,
// jadi yang dikirim lewat jaringan cukup id-nya saja.

export const LOOK_OPTIONS = {
  body: [
    { id: 'normal', label: 'Normal' },
    { id: 'tall', label: 'Tinggi' },
    { id: 'short', label: 'Pendek' },
    { id: 'chubby', label: 'Gemuk' },
  ],
  hair: [
    { id: 'none', label: 'Botak' },
    { id: 'spiky', label: 'Jabrik' },
    { id: 'bob', label: 'Bob' },
    { id: 'ponytail', label: 'Kuncir' },
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
  hair: 'spiky',
  hairColor: '#2b2118',
  eyes: 'round',
  hat: 'none',
  face: 'none',
  back: 'none',
  neck: 'none',
};

const ids = (key) => LOOK_OPTIONS[key].map((o) => (typeof o === 'string' ? o : o.id));

// Pastikan data dari jaringan/penyimpanan valid.
export function sanitizeLook(look) {
  const out = { ...DEFAULT_LOOK };
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
  return {
    body: pick('body'),
    hair: pick('hair'),
    hairColor: pick('hairColor'),
    eyes: pick('eyes'),
    hat: rand() < 0.5 ? 'none' : pick('hat'),
    face: rand() < 0.6 ? 'none' : pick('face'),
    back: rand() < 0.6 ? 'none' : pick('back'),
    neck: rand() < 0.6 ? 'none' : pick('neck'),
  };
}

// Ukuran kapsul per bentuk tubuh + titik tempel aksesoris.
export const BODY_DIMS = {
  normal: { r: 0.45, len: 0.8, faceY: 1.2, handY: 0.72, handX: 0.58 },
  tall: { r: 0.4, len: 1.15, faceY: 1.45, handY: 0.85, handX: 0.53 },
  short: { r: 0.45, len: 0.42, faceY: 0.9, handY: 0.56, handX: 0.58 },
  chubby: { r: 0.56, len: 0.6, faceY: 1.2, handY: 0.72, handX: 0.7 },
};
for (const d of Object.values(BODY_DIMS)) d.height = d.r * 2 + d.len;
