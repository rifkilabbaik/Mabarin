// Alat bantu tes unit: host game tanpa jaringan & tanpa layar.

// Beberapa modul (gambar kartu) membuat Path2D saat dimuat; di Node cukup tiruan kosong.
globalThis.Path2D ??= class Path2D {};

export const ME = { id: 'me', name: 'Saya', color: '#4dabf7', look: null };

/** Buat host game dengan publish yang mencatat jumlah siaran. */
export function makeHost(Host, opts = {}) {
  const log = { n: 0 };
  const host = new Host({ table: 'meja-tes', me: ME, publish: () => log.n++, ...opts });
  host.log = log;
  return host;
}

/** Tambah pemain manusia lewat alur undang → gabung. */
export function addHuman(host, id, name = id) {
  host.invite([id]);
  host.handle({ a: 'join', n: name, c: '#ff8787' }, id);
}

/** PRNG kecil & deterministik (mulberry32) supaya tes acak selalu sama hasilnya. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Jalankan fn dengan Math.random diganti PRNG berbenih, lalu kembalikan seperti semula. */
export function withSeed(seed, fn) {
  const orig = Math.random;
  Math.random = seeded(seed);
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}
