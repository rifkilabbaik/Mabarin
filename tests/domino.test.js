import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHost, addHuman, withSeed, seeded } from './helpers.js';
import domino from '../src/tablegames/games/domino.js';
import {
  HAND, TILE_L, TILE_W, makeSet, shuffle, ends, sidesFor, choices, place, canPlay, handValue, openingTile, botChoose, layoutChain,
} from '../src/tablegames/games/dominoRules.js';

// ---------- Aturan dasar ----------
test('set domino: 28 kartu unik, 7 balak', () => {
  const set = makeSet();
  assert.equal(set.length, 28);
  assert.equal(new Set(set).size, 28);
  assert.equal(set.filter((id) => id[0] === id[1]).length, 7);
  assert.equal(handValue(set), 168);
});

test('place(): kartu diputar supaya angkanya menempel, root ikut bergeser', () => {
  let { line, root } = place([], 0, '35', 'R');
  assert.deepEqual(line, [[3, 5]]);
  ({ line, root } = place(line, root, '15', 'R'));
  assert.deepEqual(line, [[3, 5], [5, 1]]);
  ({ line, root } = place(line, root, '03', 'L'));
  assert.deepEqual(line, [[0, 3], [3, 5], [5, 1]]);
  assert.equal(root, 1);
  assert.deepEqual(ends(line), [0, 1]);
});

test('sidesFor() & choices(): ujung sama → satu pilihan di lengan terpendek', () => {
  const line = [[2, 4], [4, 4], [4, 2]];
  assert.deepEqual(sidesFor('26', line), ['L', 'R']);
  assert.deepEqual(choices('26', line, 0), ['L']);
  assert.deepEqual(choices('26', line, 2), ['R']);
  assert.deepEqual(sidesFor('15', line), []);
  assert.deepEqual(choices('66', [], 0, '66'), ['R']);
  assert.deepEqual(choices('55', [], 0, '66'), [], 'langkah pertama wajib balak pembuka');
  assert.equal(canPlay(['15', '26'], line), true);
  assert.equal(canPlay(['15', '33'], line), false);
});

test('openingTile(): balak tertinggi, atau kartu terberat bila tanpa balak', () => {
  assert.deepEqual(openingTile({ a: ['12', '55'], b: ['33', '46'] }), { id: '55', owner: 'a' });
  assert.deepEqual(openingTile({ a: ['12', '45'], b: ['36', '01'] }), { id: '36', owner: 'b' }, 'titik sama: angka terbesar menang');
});

test('botChoose(): selalu langkah sah', () => {
  const rnd = seeded(9);
  for (let k = 0; k < 200; k++) {
    const set = shuffle(makeSet(), rnd);
    const hand = set.slice(0, 7);
    let line = [], root = 0;
    for (const id of set.slice(7, 7 + Math.floor(rnd() * 6))) {
      const s = sidesFor(id, line);
      if (s.length) ({ line, root } = place(line, root, id, s[0]));
    }
    const mv = botChoose(hand, line, root, null, rnd);
    if (!canPlay(hand, line)) assert.equal(mv, null);
    else assert.ok(hand.includes(mv.t) && sidesFor(mv.t, line).includes(mv.side));
  }
});

// ---------- Tata letak rantai ----------
function rects(line, root) {
  return layoutChain(line, root).map((p) => {
    const along = Math.abs(Math.sin(p.rot)) > 0.5; // sumbu panjang kartu sejajar x
    return { x: p.x, z: p.z, hx: (along ? TILE_L : TILE_W) / 2, hz: (along ? TILE_W : TILE_L) / 2 };
  });
}

test('layoutChain(): kartu tidak bertumpuk & tetap di area tengah meja (rantai acak sampai 28 kartu)', () => {
  const rnd = seeded(2024);
  for (let k = 0; k < 400; k++) {
    let line = [], root = 0;
    const set = shuffle(makeSet(), rnd);
    // sambung sebanyak mungkin (kadang berat ke satu sisi)
    const bias = rnd();
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < set.length; i++) {
        const s = sidesFor(set[i], line);
        if (!s.length) continue;
        const side = s.length === 2 ? (rnd() < bias ? 'L' : 'R') : s[0];
        ({ line, root } = place(line, root, set[i], side));
        set.splice(i, 1);
        progress = true;
        break;
      }
    }
    const rs = rects(line, root);
    for (const r of rs) {
      assert.ok(Math.hypot(Math.abs(r.x) + r.hx, Math.abs(r.z) + r.hz) < 0.6, `kartu keluar area (${r.x.toFixed(2)}, ${r.z.toFixed(2)})`);
      assert.ok(Math.abs(r.z) + r.hz < 0.5, 'tidak sampai ke kartu pemain');
    }
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j];
        const ox = a.hx + b.hx - Math.abs(a.x - b.x), oz = a.hz + b.hz - Math.abs(a.z - b.z);
        assert.ok(ox <= 1e-6 || oz <= 1e-6, `kartu ${i} & ${j} bertumpuk (rantai ${line.length})`);
      }
  }
});

test('layoutChain(): kartu bersebelahan saling menempel (rantai tidak putus)', () => {
  let line = [], root = 0;
  for (const [id, side] of [['33', 'R'], ['36', 'R'], ['16', 'R'], ['11', 'R'], ['14', 'R'], ['24', 'R'], ['25', 'R'], ['05', 'R'], ['03', 'L'], ['00', 'L']]) {
    ({ line, root } = place(line, root, id, side));
  }
  const rs = rects(line, root);
  for (let i = 0; i + 1 < rs.length; i++) {
    const a = rs[i], b = rs[i + 1];
    const gx = Math.abs(a.x - b.x) - a.hx - b.hx, gz = Math.abs(a.z - b.z) - a.hz - b.hz;
    assert.ok(Math.max(gx, gz) < 1e-6, `celah antara kartu ${i} & ${i + 1}`);
  }
});

// ---------- Bandar ----------
function newGame(bots, seed = 1) {
  return withSeed(seed, () => {
    const h = makeHost(domino.Host);
    for (let i = 0; i < bots; i++) h.addBot();
    h.start();
    return h;
  });
}

const all = (h) => [...Object.values(h.state.hands).flat(), ...h.state.line.map(([a, b]) => `${Math.min(a, b)}${Math.max(a, b)}`)];

test('pembagian: 7 kartu per pemain, sisanya disisihkan, pembuka memegang balak tertinggi', () => {
  for (const n of [2, 3, 4]) {
    const h = newGame(n - 1, n);
    const s = h.state;
    for (const p of h.players) assert.equal(s.hands[p.id].length, HAND);
    assert.equal(s.sleep, 28 - 7 * n);
    const open = openingTile(s.hands);
    assert.equal(s.must, open.id);
    assert.equal(h.cur().id, open.owner);
  }
});

test('langkah tidak sah ditolak', () => {
  const h = newGame(1);
  const s = h.state;
  const cur = h.cur().id;
  const other = h.players.find((p) => p.id !== cur).id;
  const wrong = s.hands[cur].find((id) => id !== s.must);
  h.handle({ a: 'play', t: wrong, side: 'R' }, cur);
  assert.equal(s.line.length, 0, 'harus balak pembuka dulu');
  h.handle({ a: 'play', t: s.hands[other][0], side: 'R' }, other);
  assert.equal(s.line.length, 0, 'bukan giliran');
  h.handle({ a: 'play', t: s.must, side: 'R' }, cur);
  assert.equal(s.line.length, 1);
  assert.equal(s.must, null);
  assert.equal(h.cur().id, other);
});

test('tidak punya kartu yang cocok → otomatis lewat', () => {
  const h = newGame(1);
  const s = h.state;
  const [A, B] = h.players.map((p) => p.id);
  s.line = [[6, 6]];
  s.root = 0;
  s.must = null;
  s.hands[A] = ['01', '12'];
  s.hands[B] = ['36', '22'];
  h.setTurn(0);
  h.onTick(Date.now() + 500);
  assert.equal(h.cur().id, A, 'belum lewat sebelum jeda');
  h.onTick(Date.now() + 1500);
  assert.equal(h.cur().id, B);
  assert.equal(s.ev.k, 'pass');
});

test('kartu habis → menang; sisa pemain diurutkan dari titik paling sedikit', () => {
  const h = newGame(3);
  const s = h.state;
  const [A, B, C, D] = h.players.map((p) => p.id);
  s.line = [[3, 3]];
  s.root = 0;
  s.must = null;
  s.hands = { [A]: ['13'], [B]: ['66', '55'], [C]: ['01'], [D]: ['24', '00'] };
  h.setTurn(0);
  h.handle({ a: 'play', t: '13', side: 'R' }, A);
  assert.equal(s.phase, 'end');
  assert.equal(s.winner, A);
  assert.equal(s.why, 'out');
  assert.deepEqual(s.ranks, [A, C, D, B]);
});

test('semua buntu → titik paling sedikit menang', () => {
  const h = newGame(1);
  const s = h.state;
  const [A, B] = h.players.map((p) => p.id);
  s.line = [[2, 3]];
  s.root = 0;
  s.must = null;
  s.hands = { [A]: ['34', '66'], [B]: ['00', '11'] };
  h.setTurn(0);
  h.handle({ a: 'play', t: '34', side: 'R' }, A); // ujung 2 & 4: tidak ada yang bisa jalan
  assert.equal(s.phase, 'end');
  assert.equal(s.why, 'block');
  assert.equal(s.winner, B, '0+0+1+1 = 2 lebih ringan dari 12');
  assert.deepEqual(s.pips, { [A]: 12, [B]: 2 });
});

test('main lagi: pemenang babak sebelumnya membuka bebas', () => {
  const h = newGame(1);
  h.end(h.players[1].id);
  h.start();
  assert.equal(h.cur().id, h.players[1].id);
  assert.equal(h.state.must, null);
});

test('pemain keluar: kartunya disisihkan, balak wajibnya tidak membuat macet', () => {
  const h = makeHost(domino.Host);
  addHuman(h, 'teman');
  h.addBot();
  h.start();
  const s = h.state;
  // anggap teman pemegang balak pembuka & sedang giliran
  s.must = s.hands.teman[0];
  h.setTurn(h.index('teman'));
  h.removePlayer('teman');
  assert.equal(s.phase, 'play');
  assert.equal(s.must, null);
  assert.equal(s.sleep, 28 - 7 * 3 + 7);
  assert.equal(s.hands.teman, undefined);
  assert.ok(canPlay(s.hands[h.cur().id], s.line));
});

for (const players of [2, 3, 4]) {
  test(`simulasi ${players} pemain sampai selesai: kartu utuh & peringkat lengkap`, () => {
    for (let seed = 1; seed <= 25; seed++) {
      const h = newGame(players - 1, seed * 31 + players);
      withSeed(seed, () => {
        let steps = 0;
        let now = Date.now();
        while (h.state.phase === 'play' && steps++ < 500) {
          now += 2000;
          h.tick(now); // lewat otomatis / bot
          if (h.state.phase === 'play' && !h.cur().bot) h.botMove(h.cur()); // "pemain" kita juga dimainkan
          assert.equal(all(h).length + h.state.sleep, 28, `kartu hilang/ganda (benih ${seed})`);
        }
      });
      const s = h.state;
      assert.equal(s.phase, 'end', `tidak selesai (benih ${seed})`);
      assert.equal(s.ranks.length, players);
      assert.deepEqual([...s.ranks].sort(), h.players.map((p) => p.id).sort());
      if (s.why === 'out') assert.equal(s.hands[s.winner].length, 0);
      else assert.equal(handValue(s.hands[s.winner]), Math.min(...h.players.map((p) => handValue(s.hands[p.id]))));
      // titik setiap pemain di peringkat tidak menurun (kecuali juara yang menghabiskan kartu)
      const pts = s.ranks.slice(1).map((id) => handValue(s.hands[id]));
      for (let i = 1; i < pts.length; i++) assert.ok(pts[i] >= pts[i - 1]);
    }
  });
}
