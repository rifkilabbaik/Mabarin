import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHost, withSeed } from './helpers.js';
import kilat from '../src/tablegames/games/kilat.js';
import { HAND_SIZE, makeDeck } from '../src/tablegames/games/kilatRules.js';

const DECK = makeDeck().length;

function newGame(bots) {
  const h = makeHost(kilat.Host);
  for (let i = 0; i < bots; i++) h.addBot();
  h.start();
  return h;
}

/** Semua kartu harus ada tepat di satu tempat: tangan, tumpukan ambil, atau buangan. */
function allCards(h) {
  return [...Object.values(h.state.hands).flat(), ...h.deck, ...h.pile];
}

test('pembagian awal: 7 kartu per pemain, total kartu utuh', () => {
  const h = newGame(3);
  for (const p of h.players) assert.equal(h.state.hands[p.id].length, HAND_SIZE);
  assert.equal(h.pile.length, 1);
  assert.equal(allCards(h).length, DECK);
});

test('refill(): tumpukan habis → buangan (kecuali teratas) dikocok jadi tumpukan baru', () => {
  const h = newGame(1);
  // pindahkan semua kartu tumpukan ke buangan
  h.pile.push(...h.deck.splice(0));
  const top = h.pile[h.pile.length - 1];
  const before = h.pile.length;
  const shuf = h.state.shuf;
  assert.equal(h.refill(), true);
  assert.deepEqual(h.pile, [top], 'buangan tinggal kartu teratas');
  assert.equal(h.deck.length, before - 1);
  assert.equal(h.state.shuf, shuf + 1, 'penanda animasi kocok naik');
  assert.equal(h.refill(), false, 'tumpukan masih ada → tidak dikocok lagi');
  assert.equal(allCards(h).length, DECK);
});

test('refill() otomatis setiap state disiarkan', () => {
  const h = newGame(1);
  h.pile.push(...h.deck.splice(0));
  h.push();
  assert.ok(h.deck.length > 0);
  assert.equal(h.state.drawN, h.deck.length);
  assert.equal(h.state.discard.length, 1);
});

test('lewat boleh tanpa mengambil bila semua kartu ada di tangan', () => {
  const h = newGame(1);
  const me = h.cur().id;
  // semua kartu ke tangan pemain sekarang, buangan tinggal satu
  h.state.hands[me].push(...h.deck.splice(0));
  assert.equal(h.noCards(), true);
  const turn = h.state.turn;
  h.pass(me);
  assert.notEqual(h.state.turn, turn, 'giliran pindah');
});

for (const players of [2, 3, 4]) {
  test(`simulasi ${players} pemain sampai selesai: kartu utuh & peringkat lengkap`, () => {
    for (let seed = 1; seed <= 15; seed++) {
      withSeed(seed * 7919 + players, () => {
        const h = newGame(players - 1);
        let moves = 0;
        while (h.state.phase === 'play' && moves < 3000) {
          h.botMove(h.cur());
          moves++;
          if (h.state.phase === 'play') assert.equal(allCards(h).length, DECK, `kartu hilang/ganda (benih ${seed}, langkah ${moves})`);
        }
        assert.equal(h.state.phase, 'end', `permainan tidak selesai (benih ${seed})`);
        const ids = h.players.map((p) => p.id);
        assert.equal(h.state.ranks.length, players, 'semua pemain mendapat peringkat');
        assert.deepEqual([...h.state.ranks].sort(), [...ids].sort(), 'peringkat tidak kembar');
        assert.equal(h.state.winner, h.state.ranks[0]);
        assert.equal(h.state.hands[h.state.winner].length, 0, 'juara 1 sudah tidak punya kartu');
      });
    }
  });
}
