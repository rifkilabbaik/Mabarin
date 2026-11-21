import { HostBase } from '../HostBase.js';
import {
  START_CASH, SALARY, JAIL, JAIL_FINE, BANK_HOUSES, BANK_HOTELS, TOKENS, SPACES, CARDS, DECK_NAME, GROUP_SPACES, OWNABLE,
  isOwnable, groupOf, rentOf, buildings, netWorth, liquidValue, groupHasBuildings, buildCheck, sellCheck, mortgageCheck,
  mortgageValue, unmortgageCost, houseCost, nearest, valueFor, completesFor, ownsGroup,
} from './rules.js';

export const HOP_MS = 230; // lama bidak melompat satu petak (sama dengan animasi)
const CARD_MS = 2800; // kartu diumumkan dulu sebelum efeknya berlaku
const AUCTION_MS = 10000;
const BID_MS = 6000; // setiap tawaran memperpanjang lelang
const OFFER_MS = 40000;
const DEBT_MS = 45000;
const LOG_MAX = 60;
const LIMITS = [0, 30, 45, 60]; // menit; 0 = sampai bangkrut

const die = () => 1 + Math.floor(Math.random() * 6);
const shuffled = (n) => {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const FREE_CARD = { peluang: CARDS.peluang.findIndex((c) => c.free), kas: CARDS.kas.findIndex((c) => c.free) };

/**
 * Bandar Juragan. Alur giliran (state.stage):
 * roll → move → (card) → buy/auction → act → giliran berikutnya. 'debt': ada pemain yang uangnya minus.
 * Sebagian besar aksi (bangun, gadai, nego) boleh dilakukan pemain mana pun kapan saja.
 */
export class JuraganHost extends HostBase {
  constructor(o) {
    super({ ...o, game: 'juragan', min: 2, max: 4, turnMs: 45000 });
    this.ranked = true; // bangkrut = gugur; lanjut sampai tersisa satu
    Object.assign(this.state, {
      opts: { limit: 0 }, tok: {}, cash: {}, pos: {}, own: {}, jail: {}, jfree: {}, bank: { h: BANK_HOUSES, H: BANK_HOTELS },
      stage: 'lobby', dice: [3, 4], rollN: 0, doubles: 0, again: false, mv: null, card: null, auction: null, offer: null, debt: null,
      log: [], logN: 0, phone: {}, endsAt: 0, why: null,
    });
    this.seq = 0;
    this.pending = null;
    this.debtQueue = [];
    this.think = {}; // jadwal berpikir bot di luar gilirannya (lelang, nego, utang)
    this.botPhone = {};
    this.botOffered = new Set();
    this.push();
  }

  // ---------- Lobi ----------
  beforePublish() {
    // setiap pemain punya bidak berbeda (pemain baru: bidak pertama yang masih kosong)
    const s = this.state;
    for (const id of Object.keys(s.tok)) if (this.index(id) < 0) delete s.tok[id];
    const used = new Set(Object.values(s.tok));
    for (const p of s.players) {
      if (s.tok[p.id] !== undefined) continue;
      const k = TOKENS.findIndex((_, i) => !used.has(i));
      s.tok[p.id] = k;
      used.add(k);
    }
  }

  handle(a, from) {
    if (!a || typeof a.a !== 'string') return;
    const s = this.state;
    if (a.a === 'tok') {
      const k = a.k | 0;
      if (s.phase !== 'lobby' || this.index(from) < 0 || k < 0 || k >= TOKENS.length) return;
      if (Object.entries(s.tok).some(([id, t]) => t === k && id !== from)) return;
      s.tok[from] = k;
      return this.push();
    }
    if (a.a === 'phone') {
      // pemain membuka/menutup HP: karakternya terlihat mengangkat HP ke wajah
      if (this.index(from) < 0 || !!s.phone[from] === !!a.on) return;
      if (a.on) s.phone[from] = true;
      else delete s.phone[from];
      return this.push();
    }
    super.handle(a, from);
  }

  setLimit(min) {
    const s = this.state;
    if (s.phase === 'play' || !LIMITS.includes(min)) return;
    s.opts.limit = min;
    this.push();
  }

  // ---------- Mulai ----------
  setup() {
    const s = this.state;
    s.cash = {};
    s.pos = {};
    s.jail = {};
    s.jfree = {};
    s.own = {};
    s.bank = { h: BANK_HOUSES, H: BANK_HOTELS };
    for (const p of s.players) {
      s.cash[p.id] = START_CASH;
      s.pos[p.id] = 0;
    }
    this.decks = { peluang: shuffled(CARDS.peluang.length), kas: shuffled(CARDS.kas.length) };
    Object.assign(s, { dice: [3, 4], doubles: 0, again: false, mv: null, card: null, auction: null, offer: null, debt: null, log: [], phone: {}, why: null });
    s.endsAt = s.opts.limit ? Date.now() + s.opts.limit * 60000 : 0;
    this.pending = null;
    this.debtQueue = [];
    this.think = {};
    this.botOffered.clear();
    this.setTurn(Math.floor(Math.random() * s.players.length));
    this.stageTo('roll');
  }

  onTurn() {
    this.state.doubles = 0;
    this.state.again = false;
  }

  stageTo(stage) {
    this.state.stage = stage;
    this.state.turnAt = Date.now();
  }

  active(pid) {
    return this.index(pid) >= 0 && !this.isDone(pid);
  }

  deny(pid, msg) {
    this.push({ k: 'deny', p: pid, msg });
  }

  // ---------- Uang ----------
  /** Pindahkan uang (null = bank). Uang boleh minus sementara → pemain harus melunasi (stage 'debt'). */
  transfer(from, to, amt, why) {
    amt = Math.round(amt);
    if (!(amt > 0)) return;
    const s = this.state;
    if (from) s.cash[from] -= amt;
    if (to) s.cash[to] += amt;
    s.log.push({ n: ++s.logN, from, to, amt, why });
    if (s.log.length > LOG_MAX) s.log.shift();
    if (from && s.cash[from] < 0 && !this.debtQueue.some((d) => d.pid === from) && s.debt?.pid !== from) this.debtQueue.push({ pid: from, to });
  }

  /** Selesaikan antrean utang: lunas → lanjut; tidak mungkin lunas → bangkrut; selain itu tunggu pemain. */
  settle() {
    const s = this.state;
    while (!s.debt && this.debtQueue.length && s.phase === 'play') {
      const d = this.debtQueue.shift();
      if (!this.active(d.pid) || s.cash[d.pid] >= 0) continue;
      if (liquidValue(s.cash[d.pid], s.own, d.pid) < 0) {
        this.bankrupt(d.pid, d.to);
        continue;
      }
      s.debt = { pid: d.pid, to: d.to, until: Date.now() + DEBT_MS, back: s.stage };
      this.stageTo('debt');
      this.push({ k: 'debt', p: d.pid, amt: -s.cash[d.pid] });
    }
  }

  /** Utang lunas setelah menjual / menggadai. */
  debtCheck(pid) {
    const s = this.state;
    if (s.debt?.pid !== pid || s.cash[pid] < 0) return;
    const back = s.debt.back;
    s.debt = null;
    this.stageTo(back);
    this.push({ k: 'paid', p: pid });
    this.settle();
  }

  bankrupt(pid, to) {
    const s = this.state;
    if (!this.active(pid)) return;
    const creditor = to && this.active(to) ? to : null;
    let cash = s.cash[pid];
    for (const i of Object.keys(s.own)) {
      const o = s.own[i];
      if (o.by !== pid) continue;
      // bangunan dijual ke bank setengah harga, hasilnya untuk penagih
      if (o.h) {
        cash += (o.h * houseCost(+i)) / 2;
        if (o.h === 5) s.bank.H++;
        else s.bank.h += o.h;
        o.h = 0;
      }
      if (creditor) o.by = creditor;
      else delete s.own[i]; // kembali ke bank, bisa dibeli lagi
    }
    if (creditor) {
      if (cash > 0) this.transfer(null, creditor, cash, 'Harta pemain bangkrut');
      s.jfree[creditor] = (s.jfree[creditor] || 0) + (s.jfree[pid] || 0);
    }
    s.cash[pid] = 0;
    s.jfree[pid] = 0;
    delete s.jail[pid];
    delete s.phone[pid];
    if (s.offer && (s.offer.from === pid || s.offer.to === pid)) s.offer = null;
    if (s.auction) {
      if (s.auction.by === pid) Object.assign(s.auction, { by: null, bid: 0 });
      if (!s.auction.out.includes(pid)) s.auction.out.push(pid);
    }
    this.debtQueue = this.debtQueue.filter((d) => d.pid !== pid);
    const wasDebt = s.debt?.pid === pid;
    const back = s.debt?.back;
    if (wasDebt) s.debt = null;
    const ev = { bk: pid, to: creditor };
    if (this.knockOut(pid, ev)) return; // tersisa satu pemain → selesai
    this.push({ ...ev, k: 'bankrupt', p: pid });
    if (this.cur()?.id === pid || this.isDone(this.cur()?.id)) this.nextTurn();
    else if (wasDebt) this.stageTo(back);
  }

  /** Jual bangunan & gadai otomatis sampai uang tidak minus (bot / waktu habis). */
  autoLiquidate(pid) {
    const s = this.state;
    for (let guard = 0; guard < 80 && s.cash[pid] < 0; guard++) {
      const mine = OWNABLE.filter((i) => s.own[i]?.by === pid);
      const sell = mine.filter((i) => !sellCheck(s.own, s.bank, pid, i)).sort((a, b) => houseCost(b) - houseCost(a))[0];
      if (sell !== undefined) {
        this.sell(pid, sell, true);
        continue;
      }
      const mort = mine.filter((i) => !mortgageCheck(s.own, pid, i)).sort((a, b) => mortgageValue(a) - mortgageValue(b))[0];
      if (mort !== undefined) {
        this.mortgage(pid, mort, true);
        continue;
      }
      break;
    }
  }

  // ---------- Giliran ----------
  nextTurn() {
    const s = this.state;
    if (s.phase !== 'play') return;
    if (this.timeUp()) return;
    s.mv = null;
    this.setTurn(this.next());
    this.stageTo('roll');
    this.push({ k: 'turn', p: this.cur().id });
  }

  timeUp() {
    const s = this.state;
    if (!s.endsAt || Date.now() < s.endsAt) return false;
    s.why = 'time';
    const ids = this.activePlayers().map((p) => p.id);
    this.end(this.rankRest(ids)[0], { why: 'time' });
    return true;
  }

  /** Peringkat sisa pemain: kekayaan bersih terbesar di atas. */
  rankRest(ids) {
    const s = this.state;
    return [...ids].sort((a, b) => netWorth(s.cash[b] || 0, s.own, b) - netWorth(s.cash[a] || 0, s.own, a));
  }

  onAction(a, from) {
    const s = this.state;
    const i = a.i | 0;
    switch (a.a) {
      case 'roll': return this.roll(from);
      case 'buy': return this.buy(from);
      case 'noBuy': return this.decline(from); // bukan 'decline' (dipakai lobi untuk menolak undangan)
      case 'end': return this.endTurn(from);
      case 'payJail': return this.payJail(from);
      case 'useCard': return this.useCard(from);
      case 'bid': return this.bid(from, +a.amt);
      case 'pass': return this.passAuction(from);
      case 'build': return this.build(from, i);
      case 'sell': return this.sell(from, i);
      case 'mort': return this.mortgage(from, i);
      case 'unmort': return this.unmortgage(from, i);
      case 'offer': return this.makeOffer(from, a);
      case 'accept': return this.respond(from, true);
      case 'reject': return this.respond(from, false);
      case 'cancel': return this.cancelOffer(from);
      case 'bankrupt': if (s.debt?.pid === from) this.bankrupt(from, s.debt.to); return;
    }
  }

  roll(pid) {
    const s = this.state;
    if (!this.isTurn(pid) || s.stage !== 'roll') return;
    const d = [die(), die()];
    s.dice = d;
    s.rollN++;
    const dbl = d[0] === d[1];
    const sum = d[0] + d[1];
    if (s.jail[pid] !== undefined) {
      if (dbl) {
        delete s.jail[pid];
        s.again = false; // keluar penjara dengan dadu kembar: jalan, tanpa lempar lagi
        this.push({ k: 'roll', p: pid, d, free: true });
        return this.walk(pid, sum);
      }
      s.jail[pid]++;
      if (s.jail[pid] >= 3) {
        // percobaan ketiga gagal: wajib bayar denda lalu jalan
        delete s.jail[pid];
        this.transfer(pid, null, JAIL_FINE, 'Denda penjara');
        this.push({ k: 'roll', p: pid, d, fine: true });
        return this.walk(pid, sum);
      }
      this.push({ k: 'roll', p: pid, d, stay: true });
      this.stageTo('act');
      return this.settle();
    }
    if (dbl && ++s.doubles >= 3) {
      this.push({ k: 'roll', p: pid, d, triple: true });
      this.toJail(pid);
      this.stageTo('act');
      return this.push();
    }
    s.again = dbl;
    this.push({ k: 'roll', p: pid, d });
    this.walk(pid, sum);
  }

  walk(pid, steps, ctx = {}) {
    const s = this.state;
    const from = s.pos[pid];
    const to = (((from + steps) % 40) + 40) % 40;
    s.mv = { n: ++this.seq, pid, from, to, steps, kind: steps < 0 ? 'back' : 'walk' };
    s.pos[pid] = to;
    this.stageTo('move');
    this.pending = { at: Date.now() + Math.abs(steps) * HOP_MS + 450, fn: () => this.land(pid, { ...ctx, salary: steps > 0 && from + steps >= 40 }) };
    this.push();
  }

  toJail(pid) {
    const s = this.state;
    s.mv = { n: ++this.seq, pid, from: s.pos[pid], to: JAIL, steps: 0, kind: 'jump' };
    s.pos[pid] = JAIL;
    s.jail[pid] = 0;
    s.again = false;
    this.push({ k: 'jail', p: pid });
  }

  land(pid, ctx = {}) {
    const s = this.state;
    if (s.phase !== 'play' || !this.active(pid)) return;
    if (ctx.salary) {
      this.transfer(null, pid, SALARY, 'Lewat MULAI');
      this.push({ k: 'salary', p: pid, amt: SALARY });
    }
    const i = s.pos[pid];
    const sp = SPACES[i];
    if (isOwnable(i)) {
      const o = s.own[i];
      if (!o) {
        this.stageTo('buy');
        return this.push({ k: 'land', p: pid, i });
      }
      if (o.by !== pid && !o.m) {
        const amt = rentOf(s.own, i, s.dice[0] + s.dice[1], ctx);
        this.transfer(pid, o.by, amt, `Sewa ${sp.name}`);
        this.push({ k: 'rent', p: pid, to: o.by, amt, i });
      }
    } else if (sp.type === 'tax') {
      this.transfer(pid, null, sp.amount, sp.name);
      this.push({ k: 'tax', p: pid, amt: sp.amount, i });
    } else if (sp.type === 'peluang' || sp.type === 'kas') {
      return this.drawCard(pid, sp.type);
    } else if (sp.type === 'gojail') {
      this.toJail(pid);
    }
    this.afterLand(pid);
  }

  afterLand(pid) {
    const s = this.state;
    if (s.phase !== 'play') return;
    const again = s.again && s.jail[pid] === undefined && this.active(pid) && this.cur()?.id === pid;
    this.stageTo(again ? 'roll' : 'act');
    this.push();
    this.settle();
  }

  endTurn(pid) {
    const s = this.state;
    if (!this.isTurn(pid) || s.stage !== 'act') return;
    this.nextTurn();
  }

  // ---------- Kartu ----------
  drawCard(pid, deck) {
    const s = this.state;
    const d = this.decks[deck];
    const id = d.shift();
    if (!CARDS[deck][id].free) d.push(id); // kartu bebas penjara disimpan pemain sampai dipakai
    s.card = { n: ++this.seq, deck, id, p: pid };
    this.stageTo('card');
    this.push({ k: 'card', p: pid, deck, id });
    this.pending = { at: Date.now() + CARD_MS, fn: () => this.applyCard(pid, deck, id) };
  }

  applyCard(pid, deck, id) {
    const s = this.state;
    const c = CARDS[deck][id];
    s.card = null;
    if (!this.active(pid)) return;
    const why = DECK_NAME[deck];
    if (c.free) {
      s.jfree[pid] = (s.jfree[pid] || 0) + 1;
      this.push({ k: 'keep', p: pid });
    } else if (c.cash > 0) this.transfer(null, pid, c.cash, why);
    else if (c.cash < 0) this.transfer(pid, null, -c.cash, why);
    else if (c.each) {
      for (const q of this.activePlayers()) {
        if (q.id === pid) continue;
        if (c.each > 0) this.transfer(q.id, pid, c.each, why);
        else this.transfer(pid, q.id, -c.each, why);
      }
    } else if (c.repair) {
      const b = buildings(s.own, pid);
      this.transfer(pid, null, b.houses * c.repair[0] + b.hotels * c.repair[1], why);
    } else if (c.jail) {
      this.toJail(pid);
    } else if (c.go !== undefined) {
      return this.walk(pid, (c.go - s.pos[pid] + 40) % 40 || 40);
    } else if (c.near) {
      const t = nearest(s.pos[pid], c.near);
      return this.walk(pid, (t - s.pos[pid] + 40) % 40, c.near === 'rail' ? { railMult: 2 } : { utilMult: 10 });
    } else if (c.back) {
      return this.walk(pid, -c.back);
    }
    this.afterLand(pid);
  }

  payJail(pid) {
    const s = this.state;
    if (!this.isTurn(pid) || s.stage !== 'roll' || s.jail[pid] === undefined) return;
    if (s.cash[pid] < JAIL_FINE) return this.deny(pid, 'Uang tidak cukup');
    delete s.jail[pid];
    this.transfer(pid, null, JAIL_FINE, 'Denda penjara');
    this.push({ k: 'free', p: pid, how: 'pay' });
  }

  useCard(pid) {
    const s = this.state;
    if (!this.isTurn(pid) || s.stage !== 'roll' || s.jail[pid] === undefined || !(s.jfree[pid] > 0)) return;
    s.jfree[pid]--;
    delete s.jail[pid];
    // kembalikan ke tumpukan yang sedang tidak punya kartu bebas penjara
    const deck = this.decks.peluang.includes(FREE_CARD.peluang) ? 'kas' : 'peluang';
    this.decks[deck].push(FREE_CARD[deck]);
    this.push({ k: 'free', p: pid, how: 'card' });
  }

  // ---------- Beli & lelang ----------
  buy(pid) {
    const s = this.state;
    if (!this.isTurn(pid) || s.stage !== 'buy') return;
    const i = s.pos[pid];
    const price = SPACES[i].price;
    if (s.own[i] || s.cash[pid] < price) return this.deny(pid, 'Uang tidak cukup');
    this.transfer(pid, null, price, `Beli ${SPACES[i].name}`);
    s.own[i] = { by: pid, h: 0, m: false };
    this.push({ k: 'buy', p: pid, i, amt: price });
    this.afterLand(pid);
  }

  decline(pid) {
    const s = this.state;
    if (!this.isTurn(pid) || s.stage !== 'buy') return;
    this.startAuction(s.pos[pid]);
  }

  startAuction(i) {
    const s = this.state;
    s.auction = { n: ++this.seq, i, bid: 0, by: null, until: Date.now() + AUCTION_MS, out: [] };
    this.stageTo('auction');
    this.push({ k: 'auction', i });
  }

  bid(pid, amt) {
    const s = this.state;
    const a = s.auction;
    if (!a || s.stage !== 'auction' || !this.active(pid) || a.out.includes(pid)) return;
    amt = Math.floor(amt);
    if (!(amt > a.bid) || amt > s.cash[pid]) return;
    a.bid = amt;
    a.by = pid;
    a.until = Math.max(a.until, Date.now() + BID_MS);
    this.push({ k: 'bid', p: pid, amt });
    this.auctionCheck();
  }

  passAuction(pid) {
    const a = this.state.auction;
    if (!a || !this.active(pid) || a.out.includes(pid) || a.by === pid) return;
    a.out.push(pid);
    this.push({ k: 'apass', p: pid });
    this.auctionCheck();
  }

  auctionCheck() {
    const a = this.state.auction;
    if (!a) return;
    const left = this.activePlayers().filter((p) => !a.out.includes(p.id));
    if (!left.length || (left.length === 1 && a.by === left[0].id)) this.closeAuction();
  }

  closeAuction() {
    const s = this.state;
    const a = s.auction;
    if (!a) return;
    s.auction = null;
    if (a.by && this.active(a.by) && !s.own[a.i]) {
      this.transfer(a.by, null, a.bid, `Lelang ${SPACES[a.i].name}`);
      s.own[a.i] = { by: a.by, h: 0, m: false };
      this.push({ k: 'sold', p: a.by, i: a.i, amt: a.bid });
    } else this.push({ k: 'nosale', i: a.i });
    this.afterLand(this.cur().id);
  }

  // ---------- Bangunan & gadai (pemain mana pun, kapan saja kecuali saat lelang) ----------
  build(pid, i) {
    const s = this.state;
    if (!this.active(pid) || s.stage === 'auction') return;
    const err = buildCheck(s.own, s.bank, pid, s.cash[pid], i);
    if (err) return this.deny(pid, err);
    const o = s.own[i];
    this.transfer(pid, null, houseCost(i), `Bangun di ${SPACES[i].name}`);
    if (o.h === 4) {
      s.bank.H--;
      s.bank.h += 4;
    } else s.bank.h--;
    o.h++;
    this.push({ k: 'build', p: pid, i, h: o.h });
  }

  sell(pid, i, quiet = false) {
    const s = this.state;
    if (!this.active(pid)) return;
    const err = sellCheck(s.own, s.bank, pid, i);
    if (err) return quiet ? null : this.deny(pid, err);
    const o = s.own[i];
    if (o.h === 5) {
      s.bank.H++;
      s.bank.h -= 4;
    } else s.bank.h++;
    o.h--;
    this.transfer(null, pid, houseCost(i) / 2, `Jual bangunan ${SPACES[i].name}`);
    this.push({ k: 'sellh', p: pid, i, h: o.h });
    if (!quiet) this.debtCheck(pid);
  }

  mortgage(pid, i, quiet = false) {
    const s = this.state;
    if (!this.active(pid)) return;
    const err = mortgageCheck(s.own, pid, i);
    if (err) return quiet ? null : this.deny(pid, err);
    s.own[i].m = true;
    this.transfer(null, pid, mortgageValue(i), `Gadai ${SPACES[i].name}`);
    this.push({ k: 'mort', p: pid, i });
    if (!quiet) this.debtCheck(pid);
  }

  unmortgage(pid, i) {
    const s = this.state;
    const o = s.own[i];
    if (!this.active(pid) || o?.by !== pid || !o.m) return;
    if (s.cash[pid] < unmortgageCost(i)) return this.deny(pid, 'Uang tidak cukup');
    o.m = false;
    this.transfer(pid, null, unmortgageCost(i), `Tebus ${SPACES[i].name}`);
    this.push({ k: 'unmort', p: pid, i });
  }

  // ---------- Nego ----------
  cleanSide(x, pid) {
    const s = this.state;
    const c = Math.max(0, Math.floor(+x?.c || 0));
    const p = [...new Set((Array.isArray(x?.p) ? x.p : []).map((v) => v | 0))];
    const j = Math.max(0, Math.floor(+x?.j || 0));
    if (c > Math.max(0, s.cash[pid])) return null;
    if (j > (s.jfree[pid] || 0)) return null;
    for (const i of p) if (s.own[i]?.by !== pid || groupHasBuildings(s.own, groupOf(i))) return null;
    return { c, p, j };
  }

  makeOffer(from, a) {
    const s = this.state;
    if (s.offer || s.stage === 'auction' || !this.active(from) || !this.active(a.to) || a.to === from) return this.deny(from, 'Tawaran tidak bisa dikirim sekarang');
    const give = this.cleanSide(a.give, from);
    const get = this.cleanSide(a.get, a.to);
    if (!give || !get) return this.deny(from, 'Isi tawaran tidak sah');
    if (!give.c && !give.p.length && !give.j && !get.c && !get.p.length && !get.j) return this.deny(from, 'Tawaran masih kosong');
    s.offer = { n: ++this.seq, from, to: a.to, give, get, until: Date.now() + OFFER_MS };
    this.push({ k: 'offer', p: from, to: a.to });
  }

  respond(pid, yes) {
    const s = this.state;
    const o = s.offer;
    if (!o || o.to !== pid) return;
    s.offer = null;
    if (!yes) return this.push({ k: 'reject', p: pid, to: o.from });
    const give = this.cleanSide(o.give, o.from);
    const get = this.cleanSide(o.get, o.to);
    if (!give || !get) return this.push({ k: 'reject', p: pid, to: o.from, invalid: true });
    const swap = (side, from, to) => {
      if (side.c) this.transfer(from, to, side.c, 'Nego');
      for (const i of side.p) {
        s.own[i].by = to;
        // tanah yang masih digadai: penerima membayar bunga 10%
        if (s.own[i].m) this.transfer(to, null, Math.round(mortgageValue(i) * 0.1), `Bunga gadai ${SPACES[i].name}`);
      }
      if (side.j) {
        s.jfree[from] -= side.j;
        s.jfree[to] = (s.jfree[to] || 0) + side.j;
      }
    };
    swap(give, o.from, o.to);
    swap(get, o.to, o.from);
    this.push({ k: 'trade', p: o.from, to: o.to, give, get });
    this.settle();
  }

  cancelOffer(pid) {
    const s = this.state;
    if (s.offer?.from !== pid) return;
    s.offer = null;
    this.push({ k: 'ocancel', p: pid });
  }

  // ---------- Pemain keluar ----------
  onLeave(pid, idx) {
    const s = this.state;
    const wasTurn = idx === s.turn;
    for (const i of Object.keys(s.own)) {
      const o = s.own[i];
      if (o.by !== pid) continue;
      if (o.h === 5) s.bank.H++;
      else s.bank.h += o.h;
      delete s.own[i];
    }
    if (s.offer && (s.offer.from === pid || s.offer.to === pid)) s.offer = null;
    if (s.auction) {
      if (s.auction.by === pid) Object.assign(s.auction, { by: null, bid: 0 });
      s.auction.out = s.auction.out.filter((id) => id !== pid);
    }
    this.debtQueue = this.debtQueue.filter((d) => d.pid !== pid);
    const debtBack = s.debt?.pid === pid ? s.debt.back : null;
    if (debtBack) s.debt = null;
    for (const k of ['cash', 'pos', 'jail', 'jfree', 'phone', 'tok']) delete s[k][pid];
    super.onLeave(pid, idx);
    if (wasTurn && s.phase === 'play') {
      this.pending = null;
      s.card = null;
      if (s.auction) return; // lelang tetap berjalan, lalu giliran pemain berikutnya
      s.mv = null;
      this.stageTo('roll');
    } else if (debtBack) this.stageTo(debtBack);
  }

  // ---------- Waktu ----------
  onTick(now) {
    const s = this.state;
    if (this.pending && now >= this.pending.at) {
      const fn = this.pending.fn;
      this.pending = null;
      fn();
    }
    if (s.phase !== 'play') return;
    if (s.auction) {
      if (now >= s.auction.until) this.closeAuction();
      else this.botAuction(now);
    }
    if (s.offer) {
      if (now >= s.offer.until) {
        const o = s.offer;
        s.offer = null;
        this.push({ k: 'reject', p: o.to, to: o.from, timeout: true });
      } else this.botRespond(now);
    }
    if (s.debt) {
      const d = s.debt;
      const bot = s.players.find((p) => p.id === d.pid)?.bot;
      if (now >= d.until || (bot && this.ready(d.pid, now, 1200))) {
        this.autoLiquidate(d.pid);
        if (s.cash[d.pid] < 0) this.bankrupt(d.pid, d.to);
        else this.debtCheck(d.pid);
      }
    }
    // bot yang sedang "memakai HP" (lelang, nego, bangun) terlihat mengangkat HP
    let changed = false;
    for (const [pid, until] of Object.entries(this.botPhone)) {
      const on = now < until && this.index(pid) >= 0;
      if (!!s.phone[pid] !== on) {
        if (on) s.phone[pid] = true;
        else delete s.phone[pid];
        changed = true;
      }
      if (!on) delete this.botPhone[pid];
    }
    if (changed) this.push();
  }

  /** Jadwal berpikir bot di luar gilirannya. */
  ready(pid, now, base = 900) {
    if (!this.think[pid]) this.think[pid] = now + base * (0.7 + Math.random() * 0.8);
    if (now < this.think[pid]) return false;
    delete this.think[pid];
    return true;
  }

  usePhone(pid, ms = 2200) {
    this.botPhone[pid] = Date.now() + ms;
  }

  onTimeout(p) {
    const s = this.state;
    if (s.stage === 'roll') this.roll(p.id);
    else if (s.stage === 'buy') this.decline(p.id);
    else if (s.stage === 'act') this.endTurn(p.id);
    else s.turnAt = Date.now();
  }

  // ---------- Bot ----------
  botMove(p) {
    const s = this.state;
    const pid = p.id;
    if (s.stage === 'roll') {
      if (s.jail[pid] !== undefined) {
        if (s.jfree[pid] > 0) return this.useCard(pid);
        if (s.cash[pid] > 500) return this.payJail(pid);
      }
      return this.roll(pid);
    }
    if (s.stage === 'buy') {
      const i = s.pos[pid];
      const price = SPACES[i].price;
      const keep = completesFor(s.own, pid, i) ? 0 : 120;
      this.usePhone(pid);
      return s.cash[pid] - price >= keep ? this.buy(pid) : this.decline(pid);
    }
    if (s.stage === 'act') {
      if (this.botManage(pid)) {
        s.turnAt = Date.now(); // satu langkah per jeda supaya terlihat
        return;
      }
      return this.endTurn(pid);
    }
  }

  /** Satu langkah pengelolaan aset bot: tebus, bangun, atau tawarkan nego. */
  botManage(pid) {
    const s = this.state;
    const cash = s.cash[pid];
    const mine = OWNABLE.filter((i) => s.own[i]?.by === pid);
    const unm = mine.find((i) => s.own[i].m && cash - unmortgageCost(i) > 450);
    if (unm !== undefined) {
      this.usePhone(pid);
      this.unmortgage(pid, unm);
      return true;
    }
    const build = mine
      .filter((i) => !buildCheck(s.own, s.bank, pid, cash, i) && cash - houseCost(i) >= 200)
      .sort((a, b) => s.own[a].h - s.own[b].h || houseCost(a) - houseCost(b))[0];
    if (build !== undefined) {
      this.usePhone(pid);
      this.build(pid, build);
      return true;
    }
    // nego: lengkapi kelompok warna yang tinggal satu tanah milik pemain lain
    if (!s.offer && Math.random() < 0.5) {
      for (const g of Object.keys(GROUP_SPACES)) {
        const sp = GROUP_SPACES[g];
        const missing = sp.filter((i) => s.own[i]?.by !== pid);
        if (missing.length !== 1 || groupHasBuildings(s.own, g)) continue;
        const i = missing[0];
        const owner = s.own[i]?.by;
        const key = `${pid}:${i}`;
        if (!owner || !this.active(owner) || this.botOffered.has(key)) continue;
        const pay = Math.round((SPACES[i].price * 1.7) / 10) * 10;
        if (cash - pay < 150) continue;
        this.botOffered.add(key);
        this.usePhone(pid);
        this.makeOffer(pid, { to: owner, give: { c: pay }, get: { p: [i] } });
        return true;
      }
    }
    return false;
  }

  botAuction(now) {
    const s = this.state;
    const a = s.auction;
    for (const p of this.activePlayers()) {
      if (!p.bot || a.out.includes(p.id) || a.by === p.id || !this.ready(p.id, now)) continue;
      const val = valueFor(s.own, p.id, a.i) * (0.8 + ((p.id.charCodeAt(4) || 7) % 5) * 0.06);
      const limit = Math.min(val, s.cash[p.id] - 60);
      const step = a.bid < 100 ? 10 : a.bid < 300 ? 20 : 50;
      this.usePhone(p.id);
      if (limit >= a.bid + step) this.bid(p.id, a.bid + step);
      else this.passAuction(p.id);
      if (!s.auction) return;
    }
  }

  botRespond(now) {
    const s = this.state;
    const o = s.offer;
    const bot = s.players.find((p) => p.id === o.to && p.bot);
    if (!bot || !this.ready(bot.id, now, 1500)) return;
    // nilai yang didapat bot dikurangi yang dilepas; melepas tanah yang melengkapi kelompok lawan = mahal
    const own = s.own;
    let gain = o.give.c - o.get.c + (o.give.j - o.get.j) * 50;
    for (const i of o.give.p) gain += valueFor(own, bot.id, i);
    for (const i of o.get.p) {
      gain -= valueFor(own, bot.id, i) * 1.1;
      if (completesFor(own, o.from, i)) gain -= SPACES[i].price * 1.2;
      if (SPACES[i].type === 'prop' && ownsGroup(own, bot.id, SPACES[i].group)) gain -= SPACES[i].price * 3;
    }
    this.usePhone(bot.id);
    this.respond(bot.id, gain > 0 && s.cash[bot.id] - o.get.c >= 0);
  }
}
