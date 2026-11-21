import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSeed } from './helpers.js';
import { newBoard, sow, legalPits, mancalaBot } from '../src/tablegames/games/mancala.js';

const total = (b) => b.reduce((a, x) => a + x, 0);

test('papan awal: 6 lubang × 4 biji per sisi, lumbung kosong', () => {
  const b = newBoard();
  assert.equal(b.length, 14);
  assert.equal(total(b), 48);
  assert.equal(b[6], 0);
  assert.equal(b[13], 0);
  assert.deepEqual(legalPits(b, 0), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(legalPits(b, 1), [7, 8, 9, 10, 11, 12]);
});

test('biji terakhir di lumbung sendiri → jalan lagi', () => {
  const r = sow(newBoard(), 0, 2); // 4 biji: 3, 4, 5, 6 (lumbung)
  assert.equal(r.again, true);
  assert.equal(r.board[6], 1);
  assert.deepEqual(r.path, [3, 4, 5, 6]);
});

test('menabur melewati lumbung lawan', () => {
  const b = Array(14).fill(0);
  b[5] = 10;
  b[0] = 1;
  b[7] = 1;
  const r = sow(b, 0, 5);
  assert.ok(!r.path.includes(13), 'lumbung lawan dilewati');
  assert.equal(total(r.board), total(b));
});

test('mendarat di lubang kosong sendiri → tangkap biji seberang', () => {
  const b = Array(14).fill(0);
  b[0] = 1; // tabur ke lubang 1 yang kosong
  b[11] = 5; // seberang lubang 1 (12 - 1)
  b[4] = 2; // supaya sisi pemain 0 tidak kosong
  b[9] = 1;
  const r = sow(b, 0, 0);
  assert.deepEqual(r.cap, { pits: [1, 11], to: 6, n: 6 });
  assert.equal(r.board[6], 6);
  assert.equal(r.board[1], 0);
  assert.equal(r.board[11], 0);
});

test('satu sisi kosong → permainan selesai, sisa biji ke lumbung pemiliknya', () => {
  const b = Array(14).fill(0);
  b[5] = 1;
  b[8] = 3;
  b[6] = 20;
  b[13] = 24;
  const r = sow(b, 0, 5);
  assert.equal(r.over, true);
  assert.equal(r.again, false);
  assert.equal(r.board[6], 21);
  assert.equal(r.board[13], 27);
  assert.equal(total(r.board), 48);
});

test('bot selalu memilih lubang yang sah & total biji tetap', () => {
  withSeed(5, () => {
    let b = newBoard(), side = 0, n = 0;
    while (n++ < 200) {
      const pit = mancalaBot(b, side, 3);
      if (pit < 0) break;
      assert.ok(legalPits(b, side).includes(pit));
      const r = sow(b, side, pit);
      b = r.board;
      assert.equal(total(b), 48);
      if (r.over) break;
      if (!r.again) side = 1 - side;
    }
    assert.ok(n < 200, 'permainan bot selesai');
  });
});
