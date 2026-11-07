import { randomLook, sanitizeLook } from '../character/looks.js';

const BOT_NAMES = ['Bot Kelapa', 'Bot Mangga', 'Bot Pisang', 'Bot Jambu'];
const BOT_COLORS = ['#ffa94d', '#b197fc', '#38d9a9', '#f783ac'];
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const INVITE_MS = 30000;

/**
 * Dasar semua game meja. Berjalan di perangkat "bandar" (pembuat meja):
 * lobi (undang, gabung, tolak, keluar, bot), giliran & timer.
 * State disiarkan lewat player state 'cg' milik bandar; pemain lain mengirim aksi lewat event 'cg'.
 * Subclass mengisi: setup(), onAction(a, from), onLeave(pid, index), onTick(now), botMove(player).
 */
export class HostBase {
  constructor({ game, table, me, publish, min = 2, max = 4, turnMs = 30000 }) {
    this.publish = publish;
    this.min = min;
    this.max = max;
    this.turnMs = turnMs;
    this.botDelay = 1200;
    this.state = {
      id: `${me.id}-${Date.now().toString(36)}`,
      game,
      v: 0,
      table,
      dealer: me.id,
      phase: 'lobby',
      players: [{ id: me.id, name: me.name, color: me.color, look: me.look }],
      invited: [],
      turn: 0,
      turnAt: 0,
      turnMs,
      winner: null,
      ev: { n: 0, k: 'open' },
    };
  }

  /** Kirim state ke semua pemain (tambahkan event opsional untuk efek/suara). */
  push(ev) {
    const s = this.state;
    if (ev) s.ev = { ...ev, n: s.ev.n + 1 };
    s.v++;
    this.beforePublish?.();
    this.publish(s);
  }

  get players() {
    return this.state.players;
  }

  index(pid) {
    return this.state.players.findIndex((p) => p.id === pid);
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
    if (s.players.length >= this.max || s.phase !== 'lobby') return false;
    const used = new Set(s.players.map((p) => p.name));
    let i = BOT_NAMES.findIndex((n) => !used.has(n));
    if (i < 0) i = 0;
    s.players.push({ id: `bot:${Math.random().toString(36).slice(2, 8)}`, name: BOT_NAMES[i], color: BOT_COLORS[i], look: randomLook(), bot: true });
    this.push({ k: 'join', p: s.players[s.players.length - 1].id });
    return true;
  }

  handle(a, from) {
    if (!a || typeof a.a !== 'string') return;
    const s = this.state;
    switch (a.a) {
      case 'join': {
        if (s.phase !== 'lobby' || s.players.length >= this.max) return;
        if (s.players.some((p) => p.id === from) || !s.invited.some((x) => x.id === from)) return;
        s.invited = s.invited.filter((x) => x.id !== from);
        s.players.push({
          id: from,
          name: String(a.n || 'Pemain').slice(0, 16),
          color: COLOR_RE.test(a.c) ? a.c : '#4dabf7',
          look: sanitizeLook(a.look),
        });
        this.push({ k: 'join', p: from });
        return;
      }
      case 'decline':
        if (!s.invited.some((x) => x.id === from)) return;
        s.invited = s.invited.filter((x) => x.id !== from);
        this.push({ k: 'decline', p: from });
        return;
      case 'leave':
        this.removePlayer(from);
        return;
    }
    if (s.phase === 'play' && this.index(from) >= 0) this.onAction(a, from);
  }

  start() {
    const s = this.state;
    if ((s.phase !== 'lobby' && s.phase !== 'end') || s.players.length < this.min) return;
    s.invited = [];
    s.winner = null;
    s.phase = 'play';
    this.setup();
    this.push({ k: 'start' });
  }

  end(winner, extra = {}) {
    const s = this.state;
    s.phase = 'end';
    s.winner = winner;
    this.push({ k: 'win', p: winner, ...extra });
  }

  // ---------- Giliran ----------
  cur() {
    return this.state.players[this.state.turn];
  }

  isTurn(pid) {
    return this.state.phase === 'play' && this.cur()?.id === pid;
  }

  setTurn(i) {
    this.state.turn = i;
    this.state.turnAt = Date.now();
    this.onTurn?.();
  }

  next(from = this.state.turn, n = 1, dir = 1) {
    const len = this.state.players.length;
    return (((from + dir * n) % len) + len) % len;
  }

  removePlayer(pid) {
    const s = this.state;
    const idx = this.index(pid);
    if (idx < 0) return;
    if (s.phase === 'play') {
      const humans = s.players.filter((p) => !p.bot && p.id !== pid).length;
      if (s.players.length - 1 < this.min || humans < 1 || this.forfeitOnLeave) {
        // lawan menang otomatis
        s.players.splice(idx, 1);
        const winner = s.players.find((p) => !p.bot)?.id || s.players[0]?.id || null;
        this.end(winner, { left: pid });
        return;
      }
      this.onLeave(pid, idx);
      if (s.phase === 'end') return; // permainan selesai karena pemain keluar
    } else {
      s.players.splice(idx, 1);
    }
    this.push({ k: 'leave', p: pid });
  }

  /** Bawaan: keluarkan pemain dari daftar & rapikan giliran. */
  onLeave(pid, idx) {
    const s = this.state;
    const wasTurn = idx === s.turn;
    s.players.splice(idx, 1);
    if (idx < s.turn) s.turn--;
    if (s.turn >= s.players.length) s.turn = 0;
    if (wasTurn) this.setTurn(s.turn);
  }

  tick(now) {
    const s = this.state;
    if (s.invited.length) {
      const before = s.invited.length;
      s.invited = s.invited.filter((x) => x.until > now);
      if (s.invited.length !== before) this.push();
    }
    if (s.phase !== 'play') return;
    this.onTick?.(now);
    const p = this.cur();
    if (!p) return;
    const elapsed = now - s.turnAt;
    if (p.bot) {
      if (elapsed > this.botDelay) {
        this.botDelay = 900 + Math.random() * 900;
        this.botMove(p);
      }
    } else if (this.turnMs && elapsed > this.turnMs) {
      this.onTimeout?.(p);
    }
  }
}
