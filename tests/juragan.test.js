import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHost, withSeed } from './helpers.js';
import { JuraganHost } from '../src/tablegames/juragan/host.js';
import {
  SPACES, OWNABLE, GROUP_SPACES, CARDS, BANK_HOUSES, BANK_HOTELS, rentOf, buildCheck, sellCheck, mortgageCheck, netWorth, nearest, START_CASH,
} from '../src/tablegames/juragan/rules.js';

// ---------- Papan & aturan murni ----------
test('papan: 40 petak, 28 bisa dimiliki, 8 kelompok warna + 4 transportasi + 2 utilitas', () => {
  assert.equal(SPACES.length, 40);
  assert.equal(OWNABLE.length, 28);
  const sizes = Object.fromEntries(Object.entries(GROUP_SPACES).map(([g, l]) => [g, l.length]));
  assert.deepEqual(sizes, { cokelat: 2, biruMuda: 3, pink: 3, oranye: 3, merah: 3, kuning: 3, hijau: 3, biruTua: 2, rail: 4, util: 2 });
  assert.deepEqual([0, 10, 20, 30].map((i) => SPACES[i].type), ['go', 'jail', 'free', 'gojail']);
  assert.equal(CARDS.takdir.length, 16);
  assert.equal(CARDS.kebijakan.length, 16);
  assert.equal(nearest(7, 'rail'), 15);
  assert.equal(nearest(36, 'rail'), 5);
  assert.equal(nearest(22, 'util'), 28);
});

test('sewa: dasar, kelompok penuh dobel, rumah, hotel, transportasi, utilitas, digadai', () => {
  const own = { 1: { by: 'a', h: 0, m: false } };
  assert.equal(rentOf(own, 1, 7), 2);
  own[3] = { by: 'a', h: 0, m: false };
  assert.equal(rentOf(own, 1, 7), 4, 'kelompok penuh: dobel');
  own[3].h = 3;
  assert.equal(rentOf(own, 3, 7), 180);
  own[3].h = 5;
  assert.equal(rentOf(own, 3, 7), 450);
  own[5] = { by: 'b', h: 0, m: false };
  assert.equal(rentOf(own, 5, 7), 25);
  own[15] = { by: 'b', h: 0, m: false };
  own[25] = { by: 'b', h: 0, m: false };
  assert.equal(rentOf(own, 5, 7), 100);
  assert.equal(rentOf(own, 5, 7, { railMult: 2 }), 200);
  own[12] = { by: 'c', h: 0, m: false };
  assert.equal(rentOf(own, 12, 9), 36);
  own[28] = { by: 'c', h: 0, m: false };
  assert.equal(rentOf(own, 12, 9), 90);
  own[28].m = true;
  assert.equal(rentOf(own, 28, 9), 0);
});

test('bangun merata, batas bank, jual merata, gadai', () => {
  const own = { 6: { by: 'a', h: 0, m: false }, 8: { by: 'a', h: 0, m: false } };
  const bank = { h: 32, H: 12 };
  assert.match(buildCheck(own, bank, 'a', 999, 6), /satu kelompok/);
  own[9] = { by: 'a', h: 0, m: false };
  assert.equal(buildCheck(own, bank, 'a', 999, 6), null);
  own[6].h = 1;
  assert.match(buildCheck(own, bank, 'a', 999, 6), /merata/);
  assert.equal(buildCheck(own, bank, 'a', 999, 8), null);
  assert.match(buildCheck(own, { h: 0, H: 12 }, 'a', 999, 8), /habis/);
  assert.match(buildCheck(own, bank, 'a', 10, 8), /Uang/);
  own[8].h = 1;
  assert.match(sellCheck(own, bank, 'a', 9), /Tidak ada/);
  assert.equal(sellCheck(own, bank, 'a', 6), null);
  assert.match(mortgageCheck(own, 'a', 9), /bangunan/);
  own[6].h = own[8].h = 0;
  assert.equal(mortgageCheck(own, 'a', 9), null);
  own[9].m = true;
  assert.match(buildCheck(own, bank, 'a', 999, 6), /digadai/);
});

// ---------- Bandar ----------
/** Host 2–4 pemain siap bermain; dadu bisa diatur. */
function game(bots = 1) {
  const h = makeHost(JuraganHost);
  for (let i = 0; i < bots; i++) h.addBot();
  h.start();
  h.setTurn(0);
  h.stageTo('roll');
  return { h, s: h.state, ids: h.players.map((p) => p.id) };
}

/** Lempar dadu dengan hasil tertentu lalu jalankan semua timer sampai tenang. */
function rollAs(h, pid, a, b) {
  const seq = [(a - 1) / 6 + 0.01, (b - 1) / 6 + 0.01];
  const orig = Math.random;
  Math.random = () => (seq.length ? seq.shift() : orig());
  try {
    h.handle({ a: 'roll' }, pid);
  } finally {
    Math.random = orig;
  }
  flush(h);
}

function flush(h) {
  for (let k = 0; k < 10 && h.pending; k++) h.onTick(h.pending.at + 1);
}

test('mulai: uang awal, bidak berbeda, tahap lempar dadu', () => {
  const { s, ids } = game(3);
  for (const id of ids) assert.equal(s.cash[id], START_CASH);
  assert.equal(new Set(Object.values(s.tok)).size, 4);
  assert.equal(s.stage, 'roll');
});

test('jalan, beli, sewa ke pemilik, lewat MULAI', () => {
  const { h, s, ids } = game();
  const [A, B] = ids;
  rollAs(h, A, 2, 4); // ke petak 6 (Jl. Pasar Baru)
  assert.equal(s.pos[A], 6);
  assert.equal(s.stage, 'buy');
  h.handle({ a: 'buy' }, A);
  assert.equal(s.own[6].by, A);
  assert.equal(s.cash[A], 1400);
  assert.equal(s.stage, 'act');
  h.handle({ a: 'end' }, A);
  assert.equal(h.cur().id, B);
  rollAs(h, B, 1, 5);
  assert.equal(s.cash[B], 1494, 'sewa Rp6');
  assert.equal(s.cash[A], 1406);
  // lewat MULAI
  s.pos[A] = 38;
  h.setTurn(0);
  h.stageTo('roll');
  rollAs(h, A, 2, 3);
  assert.equal(s.pos[A], 3);
  assert.equal(s.cash[A], 1606);
});

test('dadu kembar: lempar lagi; tiga kali kembar: masuk penjara', () => {
  const { h, s, ids } = game();
  const A = ids[0];
  h.decks.kebijakan = [6, ...h.decks.kebijakan.filter((x) => x !== 6)]; // kartu Kebijakan: terima $100
  rollAs(h, A, 1, 1); // petak 2 (Kebijakan) → kartu
  assert.equal(s.stage, 'roll', 'kembar: lempar lagi');
  assert.equal(h.cur().id, A);
  s.pos[A] = 0;
  s.doubles = 2;
  h.stageTo('roll');
  rollAs(h, A, 3, 3);
  assert.equal(s.pos[A], 10);
  assert.equal(s.jail[A], 0);
  assert.equal(s.stage, 'act');
});

test('penjara: bayar denda, pakai kartu, gagal 3x lalu wajib bayar', () => {
  const { h, s, ids } = game();
  const A = ids[0];
  h.toJail(A);
  h.stageTo('roll');
  h.handle({ a: 'payJail' }, A);
  assert.equal(s.jail[A], undefined);
  assert.equal(s.cash[A], 1450);
  h.toJail(A);
  s.jhold.takdir = A;
  h.syncJail();
  h.decks.takdir = h.decks.takdir.filter((x) => x !== 7);
  h.handle({ a: 'useCard' }, A);
  assert.equal(s.jail[A], undefined);
  assert.equal(s.jfree[A] || 0, 0);
  assert.equal(s.jhold.takdir, null);
  assert.ok(h.decks.takdir.includes(7), 'kartu kembali ke tumpukan Takdir');
  h.toJail(A);
  s.jail[A] = 2;
  h.stageTo('roll');
  rollAs(h, A, 1, 2);
  assert.equal(s.jail[A], undefined);
  assert.equal(s.pos[A], 13);
  assert.equal(s.cash[A], 1450 - 50 - 140 * 0, 'denda Rp50 (lalu boleh beli)');
});

test('masuk petak "Masuk Penjara" → ke penjara', () => {
  const { h, s, ids } = game();
  const A = ids[0];
  s.pos[A] = 25;
  rollAs(h, A, 2, 3);
  assert.equal(s.pos[A], 10);
  assert.equal(s.jail[A], 0);
});

test('kartu: maju ke MULAI, bayar ke tiap pemain, kartu bebas penjara disimpan', () => {
  const { h, s, ids } = game(2);
  const [A, B, C] = ids;
  h.decks.takdir = [0, ...h.decks.takdir.filter((x) => x !== 0)];
  s.pos[A] = 3;
  rollAs(h, A, 1, 3); // petak 7 Takdir → maju ke MULAI
  assert.equal(s.pos[A], 0);
  assert.equal(s.cash[A], 1700);
  h.setTurn(0);
  h.stageTo('roll');
  h.decks.takdir = [14, ...h.decks.takdir.filter((x) => x !== 14)];
  s.pos[A] = 3;
  rollAs(h, A, 1, 3);
  assert.equal(s.cash[A], 1600);
  assert.equal(s.cash[B], 1550);
  assert.equal(s.cash[C], 1550);
  h.setTurn(0);
  h.stageTo('roll');
  h.decks.kebijakan = [4, ...h.decks.kebijakan.filter((x) => x !== 4)];
  s.pos[A] = 0;
  rollAs(h, A, 1, 1); // petak 2 Kebijakan
  assert.equal(s.jfree[A], 1);
  assert.equal(s.jhold.kebijakan, A);
  assert.ok(!h.decks.kebijakan.includes(4), 'kartu tidak kembali ke tumpukan selama disimpan');
});

test('lelang: menolak beli → lelang, tawaran tertinggi membayar', () => {
  const { h, s, ids } = game(2);
  const [A, B, C] = ids;
  rollAs(h, A, 1, 2); // petak 3
  h.handle({ a: 'noBuy' }, A);
  assert.equal(s.stage, 'auction');
  h.handle({ a: 'bid', amt: 20 }, B);
  h.handle({ a: 'bid', amt: 10 }, C);
  assert.equal(s.auction.bid, 20, 'tawaran lebih rendah ditolak');
  h.handle({ a: 'bid', amt: 40 }, C);
  h.handle({ a: 'pass' }, A);
  h.handle({ a: 'pass' }, B);
  assert.equal(s.auction, null);
  assert.equal(s.own[3].by, C);
  assert.equal(s.cash[C], 1460);
  assert.equal(s.stage, 'act');
});

test('lelang tanpa penawar: tanah tetap milik bank', () => {
  const { h, s, ids } = game(1);
  rollAs(h, ids[0], 1, 2);
  h.handle({ a: 'noBuy' }, ids[0]);
  h.onTick(Date.now() + 20000);
  assert.equal(s.own[3], undefined);
  assert.equal(s.ev.k !== 'sold', true);
});

test('bangun, jual, gadai, tebus lewat aksi; stok rumah bank berkurang', () => {
  const { h, s, ids } = game();
  const A = ids[0];
  for (const i of [1, 3]) s.own[i] = { by: A, h: 0, m: false };
  h.handle({ a: 'build', i: 1 }, A);
  h.handle({ a: 'build', i: 1 }, A);
  assert.equal(s.own[1].h, 1, 'harus merata');
  h.handle({ a: 'build', i: 3 }, A);
  assert.equal(s.bank.h, BANK_HOUSES - 2);
  assert.equal(s.cash[A], 1400);
  h.handle({ a: 'sell', i: 3 }, A);
  assert.equal(s.cash[A], 1425);
  h.handle({ a: 'mort', i: 3 }, A);
  assert.equal(s.own[3].m, false, 'masih ada bangunan di kelompok');
  h.handle({ a: 'sell', i: 1 }, A);
  h.handle({ a: 'mort', i: 3 }, A);
  assert.equal(s.own[3].m, true);
  assert.equal(s.cash[A], 1450 + 30);
  h.handle({ a: 'unmort', i: 3 }, A);
  assert.equal(s.cash[A], 1480 - 33);
  // hotel: 4 rumah kembali ke bank
  s.own[1].h = s.own[3].h = 4;
  s.bank.h = BANK_HOUSES - 8;
  h.handle({ a: 'build', i: 1 }, A);
  assert.equal(s.own[1].h, 5);
  assert.equal(s.bank.H, BANK_HOTELS - 1);
  assert.equal(s.bank.h, BANK_HOUSES - 4);
});

test('nego: tukar tanah + uang; tanah digadai → penerima bayar bunga 10%', () => {
  const { h, s, ids } = game();
  const [A, B] = ids;
  s.own[6] = { by: A, h: 0, m: false };
  s.own[11] = { by: B, h: 0, m: true };
  h.handle({ a: 'offer', to: B, give: { c: 100, p: [6] }, get: { p: [11] } }, A);
  assert.ok(s.offer);
  h.handle({ a: 'offer', to: B, give: { c: 1 } }, A);
  assert.equal(s.offer.give.c, 100, 'hanya satu tawaran sekaligus');
  h.handle({ a: 'accept' }, B);
  assert.equal(s.offer, null);
  assert.equal(s.own[6].by, B);
  assert.equal(s.own[11].by, A);
  assert.equal(s.cash[A], 1500 - 100 - 7);
  assert.equal(s.cash[B], 1600);
});

test('nego tidak sah: tanah orang lain / kelompok berbangunan ditolak', () => {
  const { h, s, ids } = game();
  const [A, B] = ids;
  s.own[6] = { by: B, h: 0, m: false };
  h.handle({ a: 'offer', to: B, give: { p: [6] } }, A);
  assert.equal(s.offer, null);
  s.own[1] = { by: A, h: 1, m: false };
  s.own[3] = { by: A, h: 1, m: false };
  h.handle({ a: 'offer', to: B, give: { p: [3] } }, A);
  assert.equal(s.offer, null);
});

test('utang: jual/gadai sampai lunas, lalu permainan lanjut', () => {
  const { h, s, ids } = game();
  const [A, B] = ids;
  s.own[39] = { by: B, h: 5, m: false };
  s.own[37] = { by: B, h: 5, m: false };
  s.own[6] = { by: A, h: 0, m: false };
  s.own[8] = { by: A, h: 0, m: false };
  s.cash[A] = 1900;
  s.pos[A] = 35;
  rollAs(h, A, 1, 3); // Pondok Indah dengan hotel: sewa 2000
  assert.equal(s.cash[A], -100);
  assert.equal(s.stage, 'debt');
  assert.equal(s.debt.pid, A);
  h.handle({ a: 'mort', i: 6 }, A);
  assert.equal(s.cash[A], -50);
  assert.equal(s.stage, 'debt');
  h.handle({ a: 'mort', i: 8 }, A);
  assert.equal(s.debt, null);
  assert.equal(s.stage, 'act');
});

test('bangkrut ke pemain lain: harta pindah, gugur, sisa satu → selesai', () => {
  const { h, s, ids } = game(2);
  const [A, B, C] = ids;
  s.own[39] = { by: B, h: 5, m: false };
  s.own[37] = { by: B, h: 5, m: false };
  s.own[6] = { by: A, h: 0, m: true };
  s.cash[A] = 100;
  s.pos[A] = 35;
  rollAs(h, A, 1, 3);
  assert.deepEqual(s.out, [A], 'tidak mungkin lunas → langsung bangkrut');
  assert.equal(s.own[6].by, B, 'tanah pindah ke penagih');
  assert.equal(s.phase, 'play');
  assert.equal(h.cur().id, B);
  h.bankrupt(C, null);
  assert.equal(s.phase, 'end');
  assert.equal(s.winner, B);
  assert.deepEqual(s.ranks, [B, C, A]);
});

test('batas waktu: kekayaan terbesar menang, peringkat lengkap', () => {
  const h = makeHost(JuraganHost);
  h.addBot();
  h.addBot();
  h.setLimit(30);
  h.start();
  const s = h.state;
  const [A, B, C] = h.players.map((p) => p.id);
  s.cash[A] = 100;
  s.cash[B] = 900;
  s.own[39] = { by: A, h: 0, m: false };
  s.endsAt = Date.now() - 1;
  h.setTurn(0);
  h.stageTo('act');
  h.handle({ a: 'end' }, A);
  assert.equal(s.phase, 'end');
  assert.equal(s.why, 'time');
  assert.deepEqual(s.ranks, [C, B, A]);
  assert.equal(netWorth(s.cash[A], s.own, A), 500);
});

for (const players of [2, 3, 4]) {
  test(`simulasi ${players} pemain dengan bot: aturan konsisten sampai selesai`, () => {
    for (let seed = 1; seed <= 6; seed++) {
      withSeed(seed * 97 + players, () => {
        const h = makeHost(JuraganHost);
        for (let i = 1; i < players; i++) h.addBot();
        h.start();
        const s = h.state;
        let now = Date.now();
        for (let step = 0; step < 4000 && s.phase === 'play'; step++) {
          now += 3000;
          if (step === 3000) s.endsAt = Date.now() - 1; // jangan terlalu lama: batas waktu
          h.tick(now);
          // stok bangunan selalu cocok
          let houses = 0, hotels = 0;
          for (const i in s.own) {
            const o = s.own[i];
            assert.ok(h.players.some((p) => p.id === o.by) && !s.out.includes(o.by), 'tanah milik pemain aktif');
            if (o.h === 5) hotels++;
            else houses += o.h;
            assert.ok(!(o.m && o.h), 'tanah digadai tanpa bangunan');
          }
          assert.equal(houses + s.bank.h, BANK_HOUSES);
          assert.equal(hotels + s.bank.H, BANK_HOTELS);
          if (s.stage !== 'debt' && !h.debtQueue.length) for (const p of h.activePlayers()) assert.ok(s.cash[p.id] >= 0, `uang minus tanpa utang (${p.id})`);
        }
        assert.equal(s.phase, 'end', `tidak selesai (benih ${seed})`);
        assert.equal(s.ranks.length, players);
        assert.deepEqual([...s.ranks].sort(), h.players.map((p) => p.id).sort());
      });
    }
  });
}

test('dadu berguling dulu, bidak baru jalan setelah dadu berhenti', () => {
  const { h, s, ids } = game();
  const A = ids[0];
  const orig = Math.random;
  const seq = [0.2, 0.5];
  Math.random = () => (seq.length ? seq.shift() : orig());
  try {
    h.handle({ a: 'roll' }, A);
  } finally {
    Math.random = orig;
  }
  assert.equal(s.stage, 'dice');
  assert.equal(s.pos[A], 0, 'belum jalan');
  h.onTick(h.pending.at + 1);
  assert.equal(s.stage, 'move');
  assert.equal(s.pos[A], 6);
});

test('kartu Takdir/Kebijakan diambil manual (atau otomatis bila diam)', () => {
  const { h, s, ids } = game();
  const [A, B] = ids;
  h.decks.kebijakan = [6, ...h.decks.kebijakan.filter((x) => x !== 6)];
  s.pos[A] = 0;
  h.walk(A, 2);
  h.onTick(h.pending.at + 1);
  assert.equal(s.stage, 'draw');
  assert.equal(s.drawDeck, 'kebijakan');
  h.handle({ a: 'draw' }, B);
  assert.equal(s.stage, 'draw', 'hanya pemain yang berhenti di petak kartu');
  h.handle({ a: 'draw' }, A);
  assert.equal(s.stage, 'card');
  assert.equal(s.card.deck, 'kebijakan');
  flush(h);
  assert.equal(s.cash[A], 1600);
});

test('tawar balik: penerima mengirim tawaran baru, lalu disepakati', () => {
  const { h, s, ids } = game();
  const [A, B] = ids;
  s.own[11] = { by: B, h: 0, m: false };
  h.handle({ a: 'offer', to: B, give: { c: 100 }, get: { p: [11] }, kind: 'nego' }, A);
  assert.equal(s.offer.round, 0);
  h.handle({ a: 'counter', to: A, give: { p: [11] }, get: { c: 180 }, kind: 'nego' }, A);
  assert.equal(s.offer.from, A, 'pengirim tidak boleh membalas tawarannya sendiri');
  h.handle({ a: 'counter', to: A, give: { p: [11] }, get: { c: 180 }, kind: 'nego' }, B);
  assert.equal(s.offer.from, B);
  assert.equal(s.offer.round, 1);
  h.handle({ a: 'accept' }, A);
  assert.equal(s.own[11].by, A);
  assert.equal(s.cash[A], 1320);
  assert.equal(s.cash[B], 1680);
});

test('barter kartu bebas penjara ikut pindah tangan', () => {
  const { h, s, ids } = game();
  const [A, B] = ids;
  s.jhold.kebijakan = A;
  h.syncJail();
  h.handle({ a: 'offer', to: B, give: { j: 1 }, get: { c: 40 } }, A);
  h.handle({ a: 'accept' }, B);
  assert.equal(s.jhold.kebijakan, B);
  assert.equal(s.jfree[B], 1);
  assert.equal(s.cash[A], 1540);
});

test('tawar balik hanya sekali; penawar awal cuma bisa terima/tolak', () => {
  const { h, s, ids } = game();
  const [A, B] = ids;
  s.own[11] = { by: B, h: 0, m: false };
  h.handle({ a: 'offer', to: B, give: { c: 150 }, get: { p: [11] } }, A);
  h.handle({ a: 'counter', to: A, give: { p: [11] }, get: { c: 200 } }, B);
  assert.equal(s.offer.round, 1);
  h.handle({ a: 'counter', to: B, give: { c: 250 }, get: { p: [11] } }, A);
  assert.equal(s.offer.from, B, 'tidak boleh tawar balik lagi');
  h.handle({ a: 'reject' }, A);
  assert.equal(s.offer, null);
  assert.equal(s.own[11].by, B);
});

test('lunasi otomatis: jual/gadai sampai saldo tidak minus', () => {
  const { h, s, ids } = game();
  const [A, B] = ids;
  for (const i of [6, 8, 9]) s.own[i] = { by: A, h: 1, m: false };
  s.bank.h -= 3;
  s.own[39] = { by: B, h: 5, m: false };
  s.own[37] = { by: B, h: 5, m: false };
  s.cash[A] = 1800;
  s.pos[A] = 35;
  rollAs(h, A, 1, 3);
  assert.equal(s.stage, 'debt');
  h.handle({ a: 'autopay' }, A);
  assert.equal(s.debt, null);
  assert.ok(s.cash[A] >= 0);
  assert.equal(s.out.length, 0);
});
