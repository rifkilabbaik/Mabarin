// ---------- Aturan domino gaya gaple ----------
// 28 kartu (0-0 … 6-6), tiap pemain 7 kartu; sisanya (2–3 pemain) disisihkan & tidak dipakai.
// Kartu disambung ke salah satu ujung rantai. Tidak bisa menyambung = lewat.
// Kartu habis = menang. Semua buntu = jumlah titik paling sedikit menang.
// Kartu ditulis sebagai string 2 angka, angka kecil dulu: '06', '33'.
// Rantai `line` berisi pasangan [kiri, kanan] berurutan dari ujung kiri ke ujung kanan;
// `root` = indeks kartu pertama yang dipasang (titik tengah rantai di meja).

export const HAND = 7;
export const TILE_L = 0.08; // panjang kartu di meja (m)
export const TILE_W = 0.04; // lebar kartu
export const CHAIN_XMAX = 0.3; // rantai berbelok saat mencapai batas ini dari tengah meja
const VERT = 2; // jumlah kartu di setiap belokan

export const pips = (id) => [+id[0], +id[1]];
export const value = (id) => +id[0] + +id[1];
export const isDouble = (id) => id[0] === id[1];
export const handValue = (hand = []) => hand.reduce((a, id) => a + value(id), 0);

export function makeSet() {
  const set = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) set.push(`${a}${b}`);
  return set;
}

export function shuffle(arr, rand = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Angka di ujung kiri & kanan rantai (null bila meja masih kosong). */
export const ends = (line) => (line.length ? [line[0][0], line[line.length - 1][1]] : null);

/** Sisi yang bisa disambung kartu ini: 'L', 'R' (meja kosong: bebas, dicatat 'R'). */
export function sidesFor(id, line) {
  if (!line.length) return ['R'];
  const [a, b] = pips(id);
  const [l, r] = ends(line);
  const out = [];
  if (a === l || b === l) out.push('L');
  if (a === r || b === r) out.push('R');
  return out;
}

/**
 * Pilihan sisa yang perlu ditanyakan ke pemain. Kedua ujung sama angkanya → satu pilihan saja
 * (lengan rantai yang lebih pendek). `must`: kartu wajib di langkah pertama (balak tertinggi).
 */
export function choices(id, line, root, must = null) {
  if (must && id !== must) return [];
  const s = sidesFor(id, line);
  if (s.length === 2) {
    const [l, r] = ends(line);
    if (l === r) return [root < line.length - 1 - root ? 'L' : 'R'];
  }
  return s;
}

/** Pasang kartu di sisi tertentu; mengembalikan rantai & root baru (tidak mengubah aslinya). */
export function place(line, root, id, side) {
  const [a, b] = pips(id);
  if (!line.length) return { line: [[a, b]], root: 0 };
  if (side === 'L') {
    const e = line[0][0];
    return { line: [b === e ? [a, b] : [b, a], ...line], root: root + 1 };
  }
  const e = line[line.length - 1][1];
  return { line: [...line, a === e ? [a, b] : [b, a]], root };
}

export const canPlay = (hand, line, must = null) => hand.some((id) => (!must || id === must) && sidesFor(id, line).length > 0);

/** Kartu pembuka babak pertama: balak tertinggi; bila tidak ada balak, kartu bertitik terbanyak. */
export function openingTile(hands) {
  let best = null, bestSc = -1, owner = null;
  for (const [pid, hand] of Object.entries(hands)) {
    for (const id of hand) {
      const sc = (isDouble(id) ? 100 : 0) + value(id) * 7 + Math.max(...pips(id));
      if (sc > bestSc) {
        bestSc = sc;
        best = id;
        owner = pid;
      }
    }
  }
  return { id: best, owner };
}

/** Langkah bot: buang kartu berat & balak dulu, utamakan ujung baru yang masih banyak dipegang. */
export function botChoose(hand, line, root, must = null, rand = Math.random) {
  let best = null, bestSc = -Infinity;
  const holds = (n) => hand.filter((id) => pips(id).includes(n)).length;
  for (const id of hand) {
    for (const side of choices(id, line, root, must)) {
      const [a, b] = pips(id);
      let sc = a + b + (a === b ? 6 : 0) + rand() * 0.8;
      if (line.length) {
        const e = side === 'L' ? line[0][0] : line[line.length - 1][1];
        sc += holds(a === e ? b : a) * 1.5;
      }
      if (sc > bestSc) {
        bestSc = sc;
        best = { t: id, side };
      }
    }
  }
  return best;
}

/**
 * Tata letak rantai di meja (koordinat lokal meja, meter): lengan kanan berjalan ke +x, lengan kiri ke −x;
 * saat mencapai batas, berbelok (VERT kartu tegak) lalu berbalik arah — membentuk ular.
 * Balak di jalur mendatar dipasang melintang. Hasil: [{ x, z, rot }] per kartu di `line`
 * (`rot` = rotation.y kartu yang ujung angka pertamanya di sisi −z lokal kartu).
 */
export function layoutChain(line, root, L = TILE_L, W = TILE_W, xmax = CHAIN_XMAX) {
  const out = new Array(line.length);
  if (!line.length) return out;
  const yaw = (vx, vz) => Math.atan2(vx, vz);
  const d0 = line[root][0] === line[root][1];
  out[root] = { x: 0, z: 0, rot: yaw(1, 0) + (d0 ? Math.PI / 2 : 0) };
  const half = d0 ? W / 2 : L / 2;
  for (const sgn of [1, -1]) {
    let dir = sgn; // arah jalan di sumbu x
    const t = sgn; // arah belok di sumbu z (kanan ke +z, kiri ke −z)
    let c = sgn * half; // tepi tempat kartu berikutnya menempel
    let z = 0;
    let vert = 0, vx = 0, vz = 0;
    // lengan kanan: angka pertama pasangan di belakang (menempel); lengan kiri: angka kedua yang menempel
    const face = (vx2, vz2) => (sgn > 0 ? yaw(vx2, vz2) : yaw(-vx2, -vz2));
    for (let i = root + sgn; i >= 0 && i < line.length; i += sgn) {
      const dbl = line[i][0] === line[i][1];
      if (!vert) {
        const len = dbl ? W : L;
        if (dir * c + len <= xmax) {
          out[i] = { x: c + (dir * len) / 2, z, rot: face(dir, 0) + (dbl ? Math.PI / 2 : 0) };
          c += dir * len;
          continue;
        }
        // tidak muat: mulai belok di samping ujung kartu terakhir
        vert = VERT;
        vx = c + (dir * W) / 2;
        vz = z - (t * W) / 2;
      }
      out[i] = { x: vx, z: vz + (t * L) / 2, rot: face(0, t) };
      vz += t * L;
      if (--vert === 0) {
        // kembali mendatar, berlawanan arah, menempel di sisi kartu belokan terakhir
        z = vz - (t * W) / 2;
        c = vx - (dir * W) / 2;
        dir = -dir;
      }
    }
  }
  return out;
}
