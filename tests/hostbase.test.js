import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHost, addHuman } from './helpers.js';
import { HostBase } from '../src/tablegames/HostBase.js';

class TestHost extends HostBase {
  constructor(o) {
    super({ ...o, game: 'tes', min: 2, max: 4 });
    this.ranked = true;
  }
  setup() {
    this.setTurn(0);
  }
  onAction() {}
  botMove() {}
}

/** Host berisi 4 pemain (saya + 3 bot) yang sudah mulai bermain. */
function fourPlayers() {
  const h = makeHost(TestHost);
  h.addBot();
  h.addBot();
  h.addBot();
  h.start();
  const [A, B, C, D] = h.players.map((p) => p.id);
  return { h, A, B, C, D };
}

test('lobi: gabung hanya bila diundang, bot dibatasi jumlah maksimal', () => {
  const h = makeHost(TestHost);
  h.handle({ a: 'join', n: 'Penyusup' }, 'x');
  assert.equal(h.players.length, 1, 'pemain tanpa undangan tidak boleh masuk');
  addHuman(h, 'teman', 'Teman');
  assert.equal(h.players.length, 2);
  assert.equal(h.state.invited.length, 0, 'undangan terhapus setelah gabung');
  assert.equal(h.addBot(), true);
  assert.equal(h.addBot(), true);
  assert.equal(h.addBot(), false, 'meja penuh (maks 4)');
  assert.equal(new Set(h.players.map((p) => p.name)).size, 4, 'nama bot tidak kembar');
});

test('start() butuh pemain minimal & mengosongkan peringkat', () => {
  const h = makeHost(TestHost);
  h.start();
  assert.equal(h.state.phase, 'lobby', 'satu pemain belum bisa mulai');
  h.addBot();
  h.start();
  assert.equal(h.state.phase, 'play');
  assert.deepEqual(h.state.ranks, []);
  assert.deepEqual(h.state.out, []);
});

test('next() melewati pemain yang sudah selesai atau gugur', () => {
  const { h, A, B, C } = fourPlayers();
  assert.equal(h.next(0), 1);
  h.finish(B);
  assert.equal(h.next(0), 2, 'B sudah juara → dilewati');
  h.knockOut(C);
  assert.equal(h.next(0), 3, 'C gugur → dilewati');
  assert.equal(h.next(3), 0, 'memutar kembali ke awal');
  assert.equal(h.next(0, 1, -1), 3, 'arah terbalik');
  assert.ok(h.isDone(B) && h.isDone(C) && !h.isDone(A));
});

test('peringkat lengkap: juara berurutan, sisa pemain, lalu yang gugur', () => {
  const { h, A, B, C, D } = fourPlayers();
  assert.equal(h.finish(A, {}), false);
  assert.equal(h.knockOut(C, {}), false);
  assert.equal(h.finish(B, {}), true, 'tersisa satu pemain aktif → selesai');
  assert.equal(h.state.phase, 'end');
  assert.equal(h.state.winner, A);
  assert.deepEqual(h.state.ranks, [A, B, D, C]);
});

test('yang pertama gugur menjadi peringkat terakhir', () => {
  const { h, A, B, C, D } = fourPlayers();
  h.knockOut(A);
  h.knockOut(B);
  assert.equal(h.knockOut(C), true);
  assert.equal(h.state.winner, D);
  assert.deepEqual(h.state.ranks, [D, C, B, A]);
});

test('finish() mencatat nomor juara pada event', () => {
  const { h, A, B } = fourPlayers();
  const e1 = {}, e2 = {};
  h.finish(A, e1);
  h.finish(B, e2);
  assert.equal(e1.fin, 1);
  assert.equal(e2.fin, 2);
});

test('end() dua pemain: pemenang di atas, lawan di bawah', () => {
  const h = makeHost(TestHost);
  h.addBot();
  h.start();
  const [A, B] = h.players.map((p) => p.id);
  h.end(B);
  assert.equal(h.state.winner, B);
  assert.deepEqual(h.state.ranks, [B, A]);
});

test('pemain keluar saat bermain: giliran dirapikan & permainan lanjut', () => {
  const h = makeHost(TestHost);
  addHuman(h, 'teman');
  h.addBot();
  h.start();
  h.setTurn(2); // giliran bot
  h.handle({ a: 'leave' }, 'teman');
  assert.equal(h.state.phase, 'play', 'masih ada 2 pemain → lanjut');
  assert.equal(h.players.length, 2);
  assert.equal(h.cur().bot, true, 'giliran tetap pada bot meski indeksnya bergeser');
});

test('manusia terakhir keluar: permainan berakhir', () => {
  const h = makeHost(TestHost);
  addHuman(h, 'teman');
  h.addBot();
  h.start();
  h.removePlayer('me');
  h.removePlayer('teman');
  assert.equal(h.state.phase, 'end');
});

test('setiap push() menaikkan versi state & nomor event', () => {
  const h = makeHost(TestHost);
  const v = h.state.v, n = h.state.ev.n;
  h.push({ k: 'x' });
  assert.equal(h.state.v, v + 1);
  assert.equal(h.state.ev.n, n + 1);
  assert.equal(h.state.ev.k, 'x');
});
