import { HAND_SIZE, MAX_PLAYERS, SUITS, TURN_MS, bestColor, botChoose, canPlay, makeDeck, parse, shuffle } from './rules.js';
import { randomLook, sanitizeLook } from '../character/looks.js';

const BOT_NAMES = ['Bot Kelapa', 'Bot Mangga', 'Bot Pisang', 'Bot Jambu'];
const BOT_COLORS = ['#ffa94d', '#b197fc', '#38d9a9', '#f783ac'];
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const INVITE_MS = 30000;

/**
 * Logika permainan yang berjalan di perangkat bandar (pembuat meja).
 * State lengkap disiarkan lewat player state 'cg' milik bandar; pemain lain
 * mengirim aksi lewat event 'cg'. Tumpukan kartu (deck) hanya ada di sini.
 */
export class MatchHost {
  constructor({ table, me, publish }) {
    this.publish = publish;
    this.deck = [];
    this.pile = [];
    this.botDelay = 1200;
    this.state = {
      id: `${me.id}-${Date.now().toString(36)}`,
      v: 0,
      table,
      dealer: me.id,
      phase: 'lobby',
      players: [{ id: me.id, name: me.name, color: me.color, look: me.look }],
      invited: [],
      hands: {},
      discard: [],
      drawN: 0,
      color: null,
      turn: 0,
      dir: 1,
      drew: false,
      turnAt: 0,
      winner: null,
      kilat: [],
      ev: { n: 0, k: 'open' },
    };
    this.push();
  }

  push(ev) {
    const s = this.state;
    if (ev) s.ev = { ...ev, n: s.ev.n + 1 };
    s.v++;
    s.drawN = this.deck.length;
    s.discard = this.pile.slice(-5);
    this.publish(s);
  }

  get players() {
    return this.state.players;
  }

  // ---------- Lobi ----------
  invite(ids) {
    const s = this.state;
    const until = Date.now() + INVITE_MS;
    for (const id of ids) {
      if (s.players.some((p) => p.id === id)) continue;
      s.invited = s.invited.filter((x) => x.id !== id);
      s.invited.push({ id, until });
    }
    this.push();
  }

  addBot() {
    const s = this.state;
    if (s.players.length >= MAX_PLAYERS || s.phase !== 'lobby') return false;
    const used = new Set(s.players.map((p) => p.name));
    const i = BOT_NAMES.findIndex((n) => !used.has(n));
    s.players.push({
      id: `bot:${Math.random().toString(36).slice(2, 8)}`,
      name: BOT_NAMES[i < 0 ? 0 : i],
      color: BOT_COLORS[i < 0 ? 0 : i],
      look: randomLook(),
      bot: true,
    });
    this.push({ k: 'join', p: s.players[s.players.length - 1].id });
    return true;
  }

  /** Aksi dari pemain (lokal atau lewat jaringan). */
  handle(a, from) {
    if (!a || typeof a.a !== 'string') return;
    const s = this.state;
    switch (a.a) {
      case 'join': {
        if (s.phase !== 'lobby' || s.players.length >= MAX_PLAYERS) return;
        if (s.players.some((p) => p.id === from)) return;
        if (!s.invited.some((x) => x.id === from)) return;
        s.invited = s.invited.filter((x) => x.id !== from);
        s.players.push({
          id: from,
          name: String(a.n || 'Pemain').slice(0, 16),
          color: COLOR_RE.test(a.c) ? a.c : '#4dabf7',
          look: sanitizeLook(a.look),
        });
        this.push({ k: 'join', p: from });
        break;
      }
      case 'decline':
        if (!s.invited.some((x) => x.id === from)) return;
        s.invited = s.invited.filter((x) => x.id !== from);
        this.push({ k: 'decline', p: from });
        break;
      case 'leave':
        this.removePlayer(from);
        break;
      case 'play':
        this.play(from, a.c, a.col);
        break;
      case 'draw':
        this.draw(from);
        break;
      case 'pass':
        this.pass(from);
        break;
      case 'kilat':
        this.kilat(from);
        break;
    }
  }

  start() {
    const s = this.state;
    if ((s.phase !== 'lobby' && s.phase !== 'end') || s.players.length < 2) return;
    this.deck = shuffle(makeDeck());
    this.pile = [];
    s.hands = {};
    for (const p of s.players) s.hands[p.id] = this.deck.splice(0, HAND_SIZE);
    // kartu pembuka harus kartu angka
    let i = this.deck.findIndex((id) => parse(id).number);
    const first = this.deck.splice(i, 1)[0];
    this.pile.push(first);
    s.color = parse(first).suit;
    s.dir = 1;
    s.winner = null;
    s.kilat = [];
    s.invited = [];
    s.phase = 'play';
    this.setTurn(Math.floor(Math.random() * s.players.length));
    this.push({ k: 'start' });
  }

  // ---------- Giliran ----------
  cur() {
    return this.state.players[this.state.turn];
  }

  step(from, n = 1) {
    const len = this.state.players.length;
    return (((from + this.state.dir * n) % len) + len) % len;
  }

  setTurn(i) {
    const s = this.state;
    s.turn = i;
    s.drew = false;
    s.turnAt = Date.now();
    s.kilat = s.kilat.filter((id) => (s.hands[id]?.length ?? 99) <= 2);
  }

  drawOne() {
    if (!this.deck.length) {
      const top = this.pile.pop();
      this.deck = shuffle(this.pile);
      this.pile = top ? [top] : [];
    }
    return this.deck.pop() || null;
  }

  give(pid, n) {
    const hand = this.state.hands[pid];
    if (!hand) return;
    for (let i = 0; i < n; i++) {
      const c = this.drawOne();
      if (c) hand.push(c);
    }
    if (hand.length > 2) this.state.kilat = this.state.kilat.filter((id) => id !== pid);
  }

  play(pid, card, col) {
    const s = this.state;
    if (s.phase !== 'play' || this.cur()?.id !== pid) return;
    const hand = s.hands[pid];
    const idx = hand.indexOf(card);
    if (idx < 0) return;
    const top = this.pile[this.pile.length - 1];
    if (!canPlay(card, top, s.color)) return;
    const c = parse(card);
    hand.splice(idx, 1);
    this.pile.push(card);
    s.color = c.wild ? (SUITS.includes(col) ? col : bestColor(hand)) : c.suit;
    const ev = { k: 'play', p: pid, c: card, col: s.color };

    if (!hand.length) {
      s.winner = pid;
      s.phase = 'end';
      this.push({ ...ev, k: 'win' });
      return;
    }
    if (hand.length === 1 && !s.kilat.includes(pid)) {
      this.give(pid, 2); // lupa teriak "Kilat!"
      ev.pen = 2;
    }

    let skip = false, draw = 0;
    if (c.value === 'skip') skip = true;
    else if (c.value === 'rev') {
      if (s.players.length === 2) skip = true;
      else s.dir *= -1;
    } else if (c.value === 'p2') { draw = 2; skip = true; }
    else if (c.value === 'wild4') { draw = 4; skip = true; }

    let next = this.step(s.turn);
    if (draw) {
      this.give(s.players[next].id, draw);
      ev.draw = { p: s.players[next].id, n: draw };
    }
    if (skip) {
      ev.skip = s.players[next].id;
      next = this.step(next);
    }
    this.setTurn(next);
    this.push(ev);
  }

  draw(pid) {
    const s = this.state;
    if (s.phase !== 'play' || this.cur()?.id !== pid || s.drew) return;
    this.give(pid, 1);
    s.drew = true;
    const top = this.pile[this.pile.length - 1];
    const canAny = s.hands[pid].some((id) => canPlay(id, top, s.color));
    if (!canAny) this.setTurn(this.step(s.turn)); // tidak ada yang bisa dimainkan → lanjut
    this.push({ k: 'draw', p: pid });
  }

  pass(pid) {
    const s = this.state;
    if (s.phase !== 'play' || this.cur()?.id !== pid || !s.drew) return;
    this.setTurn(this.step(s.turn));
    this.push({ k: 'pass', p: pid });
  }

  kilat(pid) {
    const s = this.state;
    if (s.phase !== 'play' || (s.hands[pid]?.length ?? 99) > 2 || s.kilat.includes(pid)) return;
    s.kilat.push(pid);
    this.push({ k: 'kilat', p: pid });
  }

  removePlayer(pid) {
    const s = this.state;
    const idx = s.players.findIndex((p) => p.id === pid);
    if (idx < 0) return;
    if (s.phase === 'play') {
      this.deck.unshift(...(s.hands[pid] || []));
      delete s.hands[pid];
      s.kilat = s.kilat.filter((id) => id !== pid);
      const wasTurn = idx === s.turn;
      s.players.splice(idx, 1);
      if (idx < s.turn) s.turn--;
      if (s.turn >= s.players.length) s.turn = 0;
      const humans = s.players.filter((p) => !p.bot).length;
      if (s.players.length < 2 || humans < 1) {
        s.phase = 'end';
        s.winner = s.players[0]?.id || null;
        this.push({ k: 'win', p: s.winner, left: pid });
        return;
      }
      if (wasTurn) this.setTurn(s.turn);
    } else {
      s.players.splice(idx, 1);
    }
    this.push({ k: 'leave', p: pid });
  }

  /** Dipanggil tiap frame di perangkat bandar. */
  tick(now) {
    const s = this.state;
    if (s.invited.length) {
      const before = s.invited.length;
      s.invited = s.invited.filter((x) => x.until > now);
      if (s.invited.length !== before) this.push();
    }
    if (s.phase !== 'play') return;
    const p = this.cur();
    if (!p) return;
    const elapsed = now - s.turnAt;
    if (p.bot) {
      if (elapsed > this.botDelay) {
        this.botDelay = 900 + Math.random() * 900;
        this.botMove(p);
      }
    } else if (elapsed > TURN_MS) {
      // waktu habis: ambil satu kartu lalu lewat
      if (!s.drew) this.draw(p.id);
      if (this.cur()?.id === p.id) this.pass(p.id);
    }
  }

  botMove(p) {
    const s = this.state;
    const hand = s.hands[p.id];
    const top = this.pile[this.pile.length - 1];
    const card = botChoose(hand, top, s.color);
    if (card) {
      if (hand.length === 2 && Math.random() < 0.85) this.kilat(p.id);
      this.play(p.id, card, bestColor(hand.filter((c) => c !== card)));
    } else if (!s.drew) this.draw(p.id);
    else this.pass(p.id);
  }
}
