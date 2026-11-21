import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHost, seeded } from './helpers.js';
import pool from '../src/tablegames/games/pool.js';
import { L, W, R, FOOT_X, MULTI_GROUPS, ShotSim, rack, rackMulti } from '../src/tablegames/pool/physics.js';

const copy = (balls) => balls.map((b) => ({ ...b }));

/** Bola tidak boleh saling tumpang tindih. */
function assertNoOverlap(balls) {
  const on = balls.filter((b) => !b.in);
  for (let i = 0; i < on.length; i++)
    for (let j = i + 1; j < on.length; j++) {
      const d = Math.hypot(on[i].x - on[j].x, on[i].z - on[j].z);
      assert.ok(d >= 2 * R - 1e-6, `bola ${on[i].id} & ${on[j].id} bertumpuk (${d.toFixed(4)})`);
    }
}

// ---------- Fisika ----------
test('rack(15) & rack(9): id unik, tidak bertumpuk, deterministik dengan benih', () => {
  for (const n of [15, 9]) {
    const a = rack(n, seeded(42));
    const b = rack(n, seeded(42));
    assert.equal(a.length, n + 1, 'bola + bola putih');
    assert.equal(new Set(a.map((x) => x.id)).size, a.length);
    assert.ok(a.some((x) => x.id === 0) && a.some((x) => x.id === 8));
    assert.deepEqual(a, b);
    assertNoOverlap(a);
  }
});

test('rackMulti(3/4): warna dibagi rata, bola 8 di tengah susunan', () => {
  for (const players of [3, 4]) {
    const { balls, cols } = rackMulti(players, seeded(7));
    assert.equal(balls.length, 14, 'bola putih + 12 warna + bola 8');
    const count = {};
    for (const id of Object.keys(cols)) count[cols[id]] = (count[cols[id]] || 0) + 1;
    assert.deepEqual(Object.keys(count).sort(), MULTI_GROUPS.slice(0, players).sort());
    for (const g in count) assert.equal(count[g], 12 / players, `warna ${g} tidak rata`);
    assert.equal(balls[5].id, 8, 'bola 8 di posisi tengah baris ketiga');
    assertNoOverlap(balls);
  }
});

test('ShotSim deterministik: pukulan sama → hasil sama persis', () => {
  const balls = rack(15, seeded(3));
  const shot = { dx: 1, dz: 0.01, v: 6.5, top: 0.2, side: -0.1 };
  const a = new ShotSim(copy(balls), shot).run();
  const b = new ShotSim(copy(balls), shot).run();
  assert.deepEqual(a.final(), b.final());
  assert.deepEqual(a.pots, b.pots);
  assert.equal(a.first, b.first);
  assert.equal(a.time, b.time);
});

test('ShotSim: semua bola berhenti di dalam meja atau masuk lubang', () => {
  const rnd = seeded(11);
  for (let k = 0; k < 12; k++) {
    const balls = rack(15, rnd);
    const ang = (rnd() - 0.5) * 0.6;
    const sim = new ShotSim(copy(balls), { dx: Math.cos(ang), dz: Math.sin(ang), v: 2 + rnd() * 5, top: 0, side: 0 }).run();
    const fin = sim.final();
    assert.equal(fin.length, balls.length);
    for (const b of fin) {
      if (b.in) continue;
      assert.ok(Math.abs(b.x) <= L / 2 - R + 1e-3 && Math.abs(b.z) <= W / 2 - R + 1e-3, `bola ${b.id} keluar meja (${b.x}, ${b.z})`);
    }
    assertNoOverlap(fin);
    for (const id of sim.pots) assert.ok(fin.find((b) => b.id === id).in, `bola ${id} tercatat masuk`);
  }
});

// ---------- Aturan 3–4 pemain ----------
function multiGame(players = 4) {
  const h = makeHost(pool.Host);
  for (let i = 1; i < players; i++) h.addBot();
  h.start();
  h.setTurn(0);
  h.state.brk = false; // bukan pukulan pembuka
  h.state.stage = 'aim';
  const ids = h.players.map((p) => p.id);
  return { h, ids, s: h.state };
}

/** Sim palsu: bola dalam `pots` dianggap masuk lubang. */
function fakeSim(h, pots, first) {
  return {
    pots,
    first,
    final: () => h.state.balls.map((b) => (pots.includes(b.id) ? { ...b, in: true, pk: 0 } : { ...b })),
  };
}

const ballOf = (s, group) => Number(Object.keys(s.cols).find((id) => s.cols[id] === group));
const groupOf = (s, pid) => s.groups[pid];

test('pool multi: tiap pemain mendapat warna sendiri', () => {
  const { s, ids } = multiGame(4);
  assert.equal(s.multi, true);
  assert.deepEqual(ids.map((id) => s.groups[id]), MULTI_GROUPS);
});

test('pool multi: masukkan bola sendiri → main lagi', () => {
  const { h, s, ids } = multiGame();
  const mine = ballOf(s, groupOf(s, ids[0]));
  h.resolveMulti(fakeSim(h, [mine], mine), ids[0], false);
  assert.equal(h.cur().id, ids[0]);
  assert.equal(s.stage, 'aim');
  assert.equal(s.ev.k, 'again');
});

test('pool multi: kena bola lawan duluan → foul, bola di tangan untuk pemain berikutnya', () => {
  const { h, s, ids } = multiGame();
  const theirs = ballOf(s, groupOf(s, ids[1]));
  h.resolveMulti(fakeSim(h, [], theirs), ids[0], false);
  assert.equal(h.cur().id, ids[1]);
  assert.equal(s.stage, 'place');
  assert.equal(s.ev.k, 'foul');
});

test('pool multi: bola putih masuk → foul & bola putih kembali ke meja', () => {
  const { h, s, ids } = multiGame();
  const mine = ballOf(s, groupOf(s, ids[0]));
  h.resolveMulti(fakeSim(h, [0], mine), ids[0], false);
  assert.equal(s.ev.k, 'foul');
  assert.equal(s.stage, 'place');
  assert.equal(s.balls.find((b) => b.id === 0).in, false);
});

test('pool multi: pukulan pembuka boleh kena warna apa saja', () => {
  const { h, s, ids } = multiGame();
  s.brk = true;
  const theirs = ballOf(s, groupOf(s, ids[2]));
  h.resolveMulti(fakeSim(h, [], theirs), ids[0], false);
  assert.equal(s.ev.k, 'switch', 'bukan foul');
  assert.equal(s.stage, 'aim');
});

test('pool multi: bola 8 terlalu cepat → gugur, bolanya diangkat, permainan lanjut', () => {
  const { h, s, ids } = multiGame();
  const g = groupOf(s, ids[0]);
  h.resolveMulti(fakeSim(h, [8], 8), ids[0], false);
  assert.deepEqual(s.out, [ids[0]]);
  assert.equal(s.ev.k, 'ko');
  assert.equal(s.phase, 'play');
  assert.equal(h.remaining(g), 0, 'bola warnanya diangkat dari meja');
  const eight = s.balls.find((b) => b.id === 8);
  assert.equal(eight.in, false, 'bola 8 dikembalikan');
  assert.ok(Math.abs(eight.x - FOOT_X) < 0.5);
  assert.notEqual(h.cur().id, ids[0], 'giliran pindah');
});

test('pool multi: warna habis lalu bola 8 masuk → juara 1, lalu peringkat lengkap', () => {
  const { h, s, ids } = multiGame(3);
  const [A, B, C] = ids;
  // A menghabiskan warnanya lalu memasukkan bola 8
  for (const b of s.balls) if (s.cols[b.id] === groupOf(s, A)) b.in = true;
  h.resolveMulti(fakeSim(h, [8], 8), A, true);
  assert.deepEqual(s.ranks, [A]);
  assert.equal(s.ev.k, 'fin');
  assert.equal(s.phase, 'play', 'masih 2 pemain → lanjut');
  // C memasukkan bola 8 terlalu cepat → gugur → tersisa B → selesai
  h.setTurn(2);
  h.resolveMulti(fakeSim(h, [8], 8), C, false);
  assert.equal(s.phase, 'end');
  assert.equal(s.winner, A);
  assert.deepEqual(s.ranks, [A, B, C]);
});

test('pool multi: harus kena bola 8 duluan saat warna sudah habis', () => {
  const { h, s, ids } = multiGame();
  const theirs = ballOf(s, groupOf(s, ids[1]));
  h.resolveMulti(fakeSim(h, [], theirs), ids[0], true);
  assert.equal(s.ev.k, 'foul');
  assert.match(s.ev.why, /bola 8/);
});

// ---------- Aturan 2 pemain ----------
function duelGame() {
  const h = makeHost(pool.Host);
  h.addBot();
  h.start();
  h.setTurn(0);
  h.state.brk = false;
  h.state.stage = 'aim';
  return { h, s: h.state, ids: h.players.map((p) => p.id) };
}

function resolveWith(h, sim, by, onEight = false) {
  h.pending = { sim, by, onEight, until: 0 };
  h.resolve();
}

test('pool 2 pemain: bola pertama yang masuk mengunci warna', () => {
  const { h, s, ids } = duelGame();
  resolveWith(h, fakeSim(h, [3], 3), ids[0]);
  assert.equal(s.groups[ids[0]], 'red');
  assert.equal(s.groups[ids[1]], 'blue');
  assert.equal(h.cur().id, ids[0], 'main lagi');
});

test('pool 2 pemain: bola 8 masuk sebelum warna habis → kalah', () => {
  const { h, s, ids } = duelGame();
  resolveWith(h, fakeSim(h, [8], 8), ids[0]);
  assert.equal(s.phase, 'end');
  assert.equal(s.winner, ids[1]);
});

test('pool 2 pemain: bola 8 masuk saat pukulan pembuka → dikembalikan', () => {
  const { h, s, ids } = duelGame();
  s.brk = true;
  resolveWith(h, fakeSim(h, [8], 1), ids[0]);
  assert.equal(s.phase, 'play');
  assert.equal(s.balls.find((b) => b.id === 8).in, false);
});

test('pool solo: giliran tetap pada pemain yang sama', () => {
  const h = makeHost(pool.Host);
  h.start();
  assert.equal(h.state.phase, 'play');
  h.state.brk = false;
  resolveWith(h, fakeSim(h, [], null), 'me');
  assert.equal(h.cur().id, 'me');
  assert.equal(h.state.stage, 'place', 'foul (tidak kena bola) → bola di tangan untuk diri sendiri');
});
