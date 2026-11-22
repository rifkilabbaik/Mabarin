// ---------- Juragan: aturan game jual-beli tanah (mekanik klasik, nama & tema orisinal) ----------
// 40 petak, 22 negara dalam 8 kelompok warna, 4 transportasi, 2 utilitas, pajak, kartu Takdir & Kebijakan.
// Fungsi di sini murni (tanpa three.js / DOM) supaya bisa dites di Node.

export const START_CASH = 1500;
export const SALARY = 200; // lewat / berhenti di MULAI
export const JAIL = 10; // petak penjara
export const GO_JAIL = 30;
export const JAIL_FINE = 50;
export const BANK_HOUSES = 32;
export const BANK_HOTELS = 12;
export const TOKENS = [
  { id: 'becak', name: 'Becak' },
  { id: 'pinisi', name: 'Kapal Pinisi' },
  { id: 'ayam', name: 'Ayam Jago' },
  { id: 'ontel', name: 'Sepeda Ontel' },
  { id: 'peci', name: 'Peci' },
  { id: 'kendi', name: 'Kendi' },
];

export const GROUPS = {
  cokelat: { name: 'Cokelat', color: '#8a5a34', house: 50 },
  biruMuda: { name: 'Biru Muda', color: '#7cc8ee', house: 50 },
  pink: { name: 'Merah Muda', color: '#d9479a', house: 100 },
  oranye: { name: 'Oranye', color: '#f08c1a', house: 100 },
  merah: { name: 'Merah', color: '#e03636', house: 150 },
  kuning: { name: 'Kuning', color: '#f5c518', house: 150 },
  hijau: { name: 'Hijau', color: '#2b9a48', house: 200 },
  biruTua: { name: 'Biru Tua', color: '#2350a8', house: 200 },
};

const P = (name, group, price, rent) => ({ type: 'prop', name, group, price, rent });
const R = (name, icon) => ({ type: 'rail', name, icon, price: 200 });
const U = (name, icon) => ({ type: 'util', name, icon, price: 150 });

/** Petak 0..39 searah giliran (MULAI di sudut kanan bawah, berjalan ke kiri). */
export const SPACES = [
  { type: 'go', name: 'MULAI' },
  P('Nepal', 'cokelat', 60, [2, 10, 30, 90, 160, 250]),
  { type: 'kebijakan', name: 'Kebijakan' },
  P('Kamboja', 'cokelat', 60, [4, 20, 60, 180, 320, 450]),
  { type: 'tax', name: 'Pajak Penghasilan', amount: 200 },
  R('Stasiun Kereta Api', 'train'),
  P('Laos', 'biruMuda', 100, [6, 30, 90, 270, 400, 550]),
  { type: 'takdir', name: 'Takdir' },
  P('Myanmar', 'biruMuda', 100, [6, 30, 90, 270, 400, 550]),
  P('Vietnam', 'biruMuda', 120, [8, 40, 100, 300, 450, 600]),
  { type: 'jail', name: 'Penjara' },
  P('Filipina', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  U('Perusahaan Listrik', 'bulb'),
  P('India', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  P('Indonesia', 'pink', 160, [12, 60, 180, 500, 700, 900]),
  R('Terminal Bus', 'bus'),
  P('Kazakhstan', 'oranye', 180, [14, 70, 200, 550, 750, 950]),
  { type: 'kebijakan', name: 'Kebijakan' },
  P('Thailand', 'oranye', 180, [14, 70, 200, 550, 750, 950]),
  P('Malaysia', 'oranye', 200, [16, 80, 220, 600, 800, 1000]),
  { type: 'free', name: 'Istirahat' },
  P('Oman', 'merah', 220, [18, 90, 250, 700, 875, 1050]),
  { type: 'takdir', name: 'Takdir' },
  P('Kuwait', 'merah', 220, [18, 90, 250, 700, 875, 1050]),
  P('Arab Saudi', 'merah', 240, [20, 100, 300, 750, 925, 1100]),
  R('Bandara Pesawat', 'plane'),
  P('Tiongkok', 'kuning', 260, [22, 110, 330, 800, 975, 1150]),
  P('Taiwan', 'kuning', 260, [22, 110, 330, 800, 975, 1150]),
  U('Perusahaan Air', 'drop'),
  P('Korea Selatan', 'kuning', 280, [24, 120, 360, 850, 1025, 1200]),
  { type: 'gojail', name: 'Masuk Penjara' },
  P('Uni Emirat Arab', 'hijau', 300, [26, 130, 390, 900, 1100, 1275]),
  P('Brunei Darussalam', 'hijau', 300, [26, 130, 390, 900, 1100, 1275]),
  { type: 'kebijakan', name: 'Kebijakan' },
  P('Jepang', 'hijau', 320, [28, 150, 450, 1000, 1200, 1400]),
  R('Pelabuhan Kapal', 'ship'),
  { type: 'takdir', name: 'Takdir' },
  P('Qatar', 'biruTua', 350, [35, 175, 500, 1100, 1300, 1500]),
  { type: 'tax', name: 'Pajak Barang Mewah', amount: 100 },
  P('Singapura', 'biruTua', 400, [50, 200, 600, 1400, 1700, 2000]),
];

export const isOwnable = (i) => ['prop', 'rail', 'util'].includes(SPACES[i]?.type);
export const OWNABLE = SPACES.map((_, i) => i).filter(isOwnable);
export const groupOf = (i) => (SPACES[i].type === 'prop' ? SPACES[i].group : SPACES[i].type);
export const GROUP_SPACES = {};
for (const i of OWNABLE) (GROUP_SPACES[groupOf(i)] ||= []).push(i);
export const mortgageValue = (i) => SPACES[i].price / 2;
export const unmortgageCost = (i) => Math.round(mortgageValue(i) * 1.1);
export const houseCost = (i) => GROUPS[SPACES[i].group]?.house || 0;

// ---------- Kartu ----------
// Efek: go (maju ke petak), back (mundur), near (maju ke transportasi/utilitas terdekat), jail, cash (+/-),
// each (+ terima dari / − bayar ke tiap pemain), repair [per rumah, per hotel], free (kartu bebas penjara)
export const CARDS = {
  takdir: [
    { text: 'Kesempatan emas! Maju ke MULAI dan terima $200.', go: 0 },
    { text: 'Diundang ke Arab Saudi. Maju ke sana; bila lewat MULAI, terima $200.', go: 24 },
    { text: 'Urusan bisnis di Filipina. Maju ke sana; bila lewat MULAI, terima $200.', go: 11 },
    { text: 'Maju ke perusahaan utilitas terdekat. Bila sudah dimiliki, bayar 10× angka dadu.', near: 'util' },
    { text: 'Maju ke transportasi terdekat. Bila sudah dimiliki, bayar sewa dua kali lipat.', near: 'rail' },
    { text: 'Maju ke transportasi terdekat. Bila sudah dimiliki, bayar sewa dua kali lipat.', near: 'rail' },
    { text: 'Saham naik! Terima dividen $50.', cash: 50 },
    { text: 'Bebas dari penjara. Simpan kartu ini sampai dipakai atau dijual.', free: true },
    { text: 'Ada barang ketinggalan. Mundur 3 petak.', back: 3 },
    { text: 'Tertangkap basah! Masuk penjara, tidak lewat MULAI.', jail: true },
    { text: 'Bangunan perlu perbaikan: bayar $25 per rumah dan $100 per hotel.', repair: [25, 100] },
    { text: 'Kena tilang di jalan. Bayar $15.', cash: -15 },
    { text: 'Naik kereta dari Stasiun Kereta Api. Bila lewat MULAI, terima $200.', go: 5 },
    { text: 'Liburan ke Singapura. Maju ke sana.', go: 39 },
    { text: 'Terpilih jadi ketua panitia. Bayar $50 ke tiap pemain.', each: -50 },
    { text: 'Investasi cair. Terima $150.', cash: 150 },
  ],
  kebijakan: [
    { text: 'Program pemerintah: maju ke MULAI dan terima $200.', go: 0 },
    { text: 'Kesalahan bank menguntungkanmu. Terima $200.', cash: 200 },
    { text: 'Iuran kesehatan wajib. Bayar $50.', cash: -50 },
    { text: 'Insentif usaha kecil. Terima $50.', cash: 50 },
    { text: 'Amnesti: bebas dari penjara. Simpan kartu ini sampai dipakai atau dijual.', free: true },
    { text: 'Pelanggaran aturan! Masuk penjara, tidak lewat MULAI.', jail: true },
    { text: 'Subsidi pemerintah cair. Terima $100.', cash: 100 },
    { text: 'Pengembalian pajak. Terima $20.', cash: 20 },
    { text: 'Hari jadimu! Terima $10 dari tiap pemain.', each: 10 },
    { text: 'Klaim asuransi disetujui. Terima $100.', cash: 100 },
    { text: 'Biaya rumah sakit. Bayar $100.', cash: -100 },
    { text: 'Biaya pendidikan. Bayar $50.', cash: -50 },
    { text: 'Honor konsultan. Terima $25.', cash: 25 },
    { text: 'Pajak properti baru: bayar $40 per rumah dan $115 per hotel.', repair: [40, 115] },
    { text: 'Juara lomba kebersihan. Terima $10.', cash: 10 },
    { text: 'Dana warisan cair. Terima $100.', cash: 100 },
  ],
};
export const DECK_NAME = { takdir: 'Takdir', kebijakan: 'Kebijakan' };
export const DECKS = ['takdir', 'kebijakan'];

// ---------- Hitungan ----------
/** Pemilik petak (pid) atau null. `own` = { [i]: { by, h, m } } (h: 0..4 rumah, 5 = hotel; m: digadai). */
export const ownerOf = (own, i) => own[i]?.by || null;

export function ownsGroup(own, pid, group) {
  return GROUP_SPACES[group].every((i) => own[i]?.by === pid);
}

export function countOwned(own, pid, group) {
  return GROUP_SPACES[group].filter((i) => own[i]?.by === pid).length;
}

/** Sewa petak bila didatangi pemain lain. `dice` = jumlah dadu (utilitas). `mult`: sewa ganda dari kartu. */
export function rentOf(own, i, dice, { railMult = 1, utilMult = 0 } = {}) {
  const o = own[i];
  if (!o || o.m) return 0;
  const sp = SPACES[i];
  if (sp.type === 'prop') {
    if (o.h > 0) return sp.rent[o.h];
    return sp.rent[0] * (ownsGroup(own, o.by, sp.group) ? 2 : 1);
  }
  if (sp.type === 'rail') return [0, 25, 50, 100, 200][countOwned(own, o.by, 'rail')] * railMult;
  if (sp.type === 'util') return (utilMult || (countOwned(own, o.by, 'util') === 2 ? 10 : 4)) * dice;
  return 0;
}

/** Jumlah rumah & hotel milik pemain (untuk kartu renovasi). */
export function buildings(own, pid) {
  let houses = 0, hotels = 0;
  for (const i in own) {
    if (own[i].by !== pid) continue;
    if (own[i].h === 5) hotels++;
    else houses += own[i].h;
  }
  return { houses, hotels };
}

/** Kekayaan bersih: uang + harga tanah (yang digadai: setengah) + harga bangunan. */
export function netWorth(cash, own, pid) {
  let v = cash;
  for (const i in own) {
    const o = own[i];
    if (o.by !== pid) continue;
    v += o.m ? mortgageValue(+i) : SPACES[+i].price;
    v += o.h * houseCost(+i);
  }
  return v;
}

/** Uang maksimal yang bisa dikumpulkan (jual semua bangunan setengah harga + gadai semua tanah). */
export function liquidValue(cash, own, pid) {
  let v = cash;
  for (const i in own) {
    const o = own[i];
    if (o.by !== pid) continue;
    v += (o.h * houseCost(+i)) / 2;
    if (!o.m) v += mortgageValue(+i);
  }
  return v;
}

export const groupHasBuildings = (own, group) => GROUP_SPACES[group].some((i) => own[i]?.h > 0);

/** Bisa membangun satu tingkat di petak i? (mengembalikan alasan bila tidak) */
export function buildCheck(own, bank, pid, cash, i) {
  const sp = SPACES[i], o = own[i];
  if (sp?.type !== 'prop' || o?.by !== pid) return 'Bukan tanahmu';
  if (!ownsGroup(own, pid, sp.group)) return 'Kuasai satu kelompok warna dulu';
  const g = GROUP_SPACES[sp.group];
  if (g.some((j) => own[j].m)) return 'Ada tanah kelompok ini yang digadai';
  if (o.h >= 5) return 'Sudah hotel';
  if (o.h > Math.min(...g.map((j) => own[j].h))) return 'Bangun merata dulu di kelompok ini';
  if (o.h === 4 ? bank.H <= 0 : bank.h <= 0) return o.h === 4 ? 'Hotel di bank habis' : 'Rumah di bank habis';
  if (cash < houseCost(i)) return 'Uang tidak cukup';
  return null;
}

export function sellCheck(own, bank, pid, i) {
  const sp = SPACES[i], o = own[i];
  if (sp?.type !== 'prop' || o?.by !== pid) return 'Bukan tanahmu';
  if (!o.h) return 'Tidak ada bangunan';
  const g = GROUP_SPACES[sp.group];
  if (o.h < Math.max(...g.map((j) => own[j].h))) return 'Jual merata dulu di kelompok ini';
  if (o.h === 5 && bank.h < 4) return 'Rumah di bank tidak cukup untuk menurunkan hotel';
  return null;
}

export function mortgageCheck(own, pid, i) {
  const o = own[i];
  if (!o || o.by !== pid) return 'Bukan tanahmu';
  if (o.m) return 'Sudah digadai';
  if (groupHasBuildings(own, groupOf(i))) return 'Jual bangunan di kelompok ini dulu';
  return null;
}

/** Petak tujuan "terdekat" (transportasi/utilitas) di depan posisi pos. */
export function nearest(pos, type) {
  for (let k = 1; k <= 40; k++) {
    const i = (pos + k) % 40;
    if (SPACES[i].type === type) return i;
  }
  return pos;
}

// ---------- Penilaian untuk bot ----------
/** Nilai tanah bagi seorang pemain (lebih tinggi bila melengkapi kelompok). */
export function valueFor(own, pid, i) {
  const sp = SPACES[i];
  const g = groupOf(i);
  const total = GROUP_SPACES[g].length;
  const mine = GROUP_SPACES[g].filter((j) => j !== i && own[j]?.by === pid).length;
  let v = sp.price;
  if (mine === total - 1) v *= sp.type === 'prop' ? 2.2 : 1.4; // melengkapi kelompok
  else if (mine > 0) v *= 1.3;
  return v;
}

/** Apakah memberikan tanah i ke pemain `to` melengkapi kelompoknya? */
export function completesFor(own, to, i) {
  const g = groupOf(i);
  return GROUP_SPACES[g].every((j) => j === i || own[j]?.by === to);
}

export const fmt = (n) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
