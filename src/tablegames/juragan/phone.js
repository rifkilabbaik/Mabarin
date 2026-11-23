import { icon } from '../../ui/icons.js';
import { avatarUrl } from '../../ui/avatar.js';
import {
  SPACES, GROUPS, TOKENS, CARDS, DECK_NAME, GROUP_SPACES, OWNABLE, JAIL_FINE, fmt, groupOf, isOwnable, buildCheck, sellCheck, mortgageCheck,
  mortgageValue, unmortgageCost, houseCost, groupHasBuildings,
} from './rules.js';
import { ASK_MORE } from './host.js';

// Kontrol pemain Juragan tanpa layar HP:
// - keputusan cepat di panel aksi bawah (beli/lelang, tawaran, penjara, utang, selesai giliran)
// - laci aset di paling bawah (galeri kartu per set + stempel); ketuk kartu → lembar aksi (bangun/jual/gadai, atau tawar/tukar)
// - notifikasi satu baris tanpa angka di tengah atas; jumlah uang muncul sebentar di daftar pemain
// - karakter mengangkat HP selama sedang memutuskan sesuatu

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ORDER = ['cokelat', 'biruMuda', 'pink', 'oranye', 'merah', 'kuning', 'hijau', 'biruTua', 'util', 'rail'];
const GROUP_LABEL = { rail: 'Transportasi', util: 'Perusahaan Air & Listrik' };
const groupColor = (g) => GROUPS[g]?.color || (g === 'rail' ? '#495057' : '#868e96');
const LINE_MS = 3200;
const DELTA_MS = 2400;
const OFFER_TOTAL = 20000;
const round10 = (v) => Math.round(v / 10) * 10;
const BOOK = '<svg viewBox="0 0 62 44"><path d="M31 8C22 2 10 2 3 5v34c7-3 19-3 28 3 9-6 21-6 28-3V5c-7-3-19-3-28 3z" fill="#fff"/></svg>';

/** Kartu mini (warna kelompok) untuk baris notifikasi & panel. */
const miniCard = (i) => `<span class="jg-mc" style="--g:${groupColor(groupOf(i))}"><i></i></span>`;
const deckIcon = (deck) => `<span class="jg-dk ${deck}">${deck === 'kebijakan' ? BOOK : '?'}</span>`;

/** Tabel sewa kartu hak milik (HTML). */
function rentTable(i) {
  const sp = SPACES[i];
  let rows;
  if (sp.type === 'prop') rows = [['Sewa', sp.rent[0]], ['Satu set warna', sp.rent[0] * 2], ['1 rumah', sp.rent[1]], ['2 rumah', sp.rent[2]], ['3 rumah', sp.rent[3]], ['4 rumah', sp.rent[4]], ['Hotel', sp.rent[5]], ['Harga rumah', houseCost(i)]];
  else if (sp.type === 'rail') rows = [1, 2, 3, 4].map((n) => [`${n} transportasi`, [0, 25, 50, 100, 200][n]]);
  else return '<table class="jg-rent"><tr><td>1 utilitas</td><td>4× dadu</td></tr><tr><td>2 utilitas</td><td>10× dadu</td></tr></table>';
  rows.push(['Nilai gadai', mortgageValue(i)]);
  return `<table class="jg-rent">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${fmt(v)}</td></tr>`).join('')}</table>`;
}

export class JuraganControls {
  constructor(ctx) {
    this.ctx = ctx;
    this.expanded = false; // laci aset ditarik ke atas
    this.sheet = null; // petak (angka) / 'j:takdir' yang sedang dilihat di lembar aksi
    this.showRent = false;
    this.lines = []; // notifikasi satu baris
    this.delta = {}; // pid → { d, until } (uang keluar/masuk di daftar pemain)
    this.prevCash = null;
    this.phoneOn = false;
    this.sig = {};
    this.turnHint = -1;
  }

  get me() {
    return this.ctx.myId;
  }

  enter() {
    this.ctx.setTopView(true); // papan besar paling jelas dari atas (tombol kamera tetap bisa mengganti)
    const root = $('cards-ui');
    this.linesEl = document.createElement('div');
    this.linesEl.className = 'jg-lines';
    this.dock = document.createElement('div');
    this.dock.className = 'jg-dock';
    this.dock.innerHTML = '<div class="jg-panel" hidden></div><div class="jg-drawer"><button type="button" class="jg-dbar" data-act="drawer"><span class="jg-grab"></span><span class="jg-dh"><b></b><small></small></span><span class="jg-chips"></span></button><div class="jg-gal" hidden></div></div>';
    this.sheetEl = document.createElement('div');
    this.sheetEl.className = 'jg-sheetwrap';
    this.sheetEl.hidden = true;
    this.sheetEl.innerHTML = '<div class="jg-dim" data-act="sclose"></div><div class="jg-sheet"></div>';
    for (const el of [this.dock, this.sheetEl]) el.addEventListener('click', (e) => this.onClick(e));
    root.append(this.linesEl, this.dock, this.sheetEl);
  }

  exit() {
    if (this.phoneOn) this.ctx.act({ a: 'phone', on: false });
    this.phoneOn = false;
    for (const el of [this.linesEl, this.dock, this.sheetEl]) el?.remove();
  }

  act(a) {
    this.ctx.act(a);
    this.ctx.audio.play('click');
  }

  myTurn(m) {
    return m.phase === 'play' && m.players[m.turn]?.id === this.me;
  }

  playing(m) {
    return m.players.some((p) => p.id === this.me) && !m.out?.includes(this.me);
  }

  name(m, id) {
    if (!id) return 'Bank';
    if (id === this.me) return 'Kamu';
    return m.players.find((p) => p.id === id)?.name || 'Pemain';
  }

  avatar(m, id) {
    const p = m.players.find((x) => x.id === id);
    return p ? `<img class="jg-av" src="${avatarUrl(p.look, p.color)}" alt="" style="--c:${p.color}">` : '';
  }

  // ---------- Tiap frame ----------
  update(dt, m) {
    this.lastM = m;
    const live = m.phase !== 'lobby';
    const playing = live && this.playing(m);
    const now = performance.now();
    this.dock.hidden = !playing;
    if (!playing) {
      this.expanded = false;
      this.sheet = null;
    }
    // uang keluar/masuk: suara untuk kita, angka sebentar di daftar pemain untuk semua
    if (live && m.cash) {
      if (this.prevCash) {
        for (const p of m.players) {
          const d = (m.cash[p.id] ?? 0) - (this.prevCash[p.id] ?? m.cash[p.id] ?? 0);
          if (!d) continue;
          const cur = this.delta[p.id];
          this.delta[p.id] = { d: (cur && cur.until > now ? cur.d : 0) + d, until: now + DELTA_MS };
          if (p.id === this.me) this.ctx.audio.play(d < 0 ? 'tungting' : 'kencring');
        }
      }
      this.prevCash = { ...m.cash };
    } else this.prevCash = null;
    // petunjuk giliran
    if (this.myTurn(m) && m.stage === 'roll' && this.turnHint !== m.rollN) {
      this.turnHint = m.rollN;
      this.ctx.flash(m.jail?.[this.me] !== undefined ? 'Di penjara: ketuk dadu cari kembar' : m.doubles > 0 ? 'Kembar! Ketuk dadu lagi' : 'Giliranmu — ketuk dadu');
    }
    const dec = playing ? this.decision(m) : null;
    this.renderPanel(m, dec);
    if (playing) {
      this.renderDrawer(m);
      this.renderSheet(m);
    }
    this.sheetEl.hidden = this.sheet === null || !playing;
    // HP diangkat = sedang memutuskan (panel keputusan, laci aset, lembar aksi)
    const on = playing && (!!dec?.decide || this.expanded || this.sheet !== null);
    if (on !== this.phoneOn) {
      this.phoneOn = on;
      this.ctx.act({ a: 'phone', on });
    }
    this.tickTimer(m);
    this.renderLines(now);
  }

  // ---------- Panel aksi (keputusan cepat) ----------
  /** Keputusan yang sedang menunggu kita: { key, html, decide } atau petunjuk ringan. */
  decision(m) {
    const me = this.me;
    const timer = '<div class="jg-timer"><i></i></div>';
    const btn = (act, label, cls = '', extra = '') => `<button type="button" class="jg-b ${cls}" data-act="${act}" ${extra}>${label}</button>`;
    if (m.debt?.pid === me) {
      return { key: `debt${m.debt.until}|${m.cash[me]}`, decide: true, html: `<div class="jg-pt warn">${icon('flag')}<span>Uangmu kurang ${fmt(-m.cash[me])}</span></div>${timer}<div class="jg-btns">${btn('autopay', 'Lunasi otomatis', 'p')}${btn('bankrupt', 'Bangkrut', 'd')}</div>` };
    }
    if (m.offer?.to === me) {
      const o = m.offer;
      const what = this.offerText(m, o);
      if (o.round) {
        return { key: `offer${o.n}`, decide: true, html: `<div class="jg-pt">${this.avatar(m, o.from)}<span>${esc(this.name(m, o.from))} ${what}</span></div>${timer}<div class="jg-btns">${btn('reject', 'Tolak')}${btn('accept', 'Terima', 'g')}</div>` };
      }
      const more = (o.give.c || 0) + ASK_MORE;
      return { key: `offer${o.n}`, decide: true, html: `<div class="jg-pt">${this.avatar(m, o.from)}<span>${esc(this.name(m, o.from))} ${what}</span></div>${timer}<div class="jg-btns">${btn('reject', 'Tolak')}${btn('askmore', o.kind === 'barter' || !o.give.c ? `Minta +${fmt(ASK_MORE)}` : `Minta ${fmt(more)}`)}${btn('accept', 'Terima', 'g')}</div>` };
    }
    if (m.auction && !m.auction.out.includes(me)) {
      const a = m.auction;
      const cash = m.cash[me];
      const who = a.by ? (a.by === me ? 'kamu tertinggi' : esc(this.name(m, a.by))) : 'belum ada tawaran';
      const bid = (d) => btn('bid', `+${d}`, '', `data-amt="${a.bid + d}" ${a.bid + d > cash ? 'disabled' : ''}`);
      return { key: `auc${a.n}|${a.bid}|${a.by}`, decide: true, html: `<div class="jg-pt">${miniCard(a.i)}<span>Lelang ${esc(SPACES[a.i].name)} · <b>${fmt(a.bid)}</b> <small>${who}</small></span></div>${timer}<div class="jg-btns">${a.by === me ? '<span class="jg-ok">Kamu penawar tertinggi</span>' : `${bid(10)}${bid(50)}${bid(100)}${btn('pass', 'Lewat')}`}</div>` };
    }
    if (this.myTurn(m) && m.stage === 'buy') {
      const i = m.pos[me];
      const sp = SPACES[i];
      return { key: `buy${m.rollN}:${i}|${m.cash[me]}`, decide: true, html: `<div class="jg-pt">${miniCard(i)}<span><b>${esc(sp.name)}</b> <small>${sp.type === 'prop' ? `sewa ${fmt(sp.rent[0])}` : sp.type === 'rail' ? 'transportasi' : 'utilitas'}</small></span><button type="button" class="jg-link" data-act="info" data-i="${i}">info</button></div><div class="jg-btns">${btn('noBuy', 'Lelang')}${btn('buy', `Beli ${fmt(sp.price)}`, 'p', m.cash[me] < sp.price ? 'disabled' : '')}</div>` };
    }
    if (this.myTurn(m) && m.stage === 'roll' && m.jail?.[me] !== undefined) {
      return { key: `jail${m.rollN}|${m.cash[me]}|${m.jfree?.[me]}`, decide: true, html: `<div class="jg-pt">${icon('flag')}<span>Di penjara (${m.jail[me] + 1}/3) · ketuk dadu cari kembar</span></div><div class="jg-btns">${btn('payJail', `Bayar ${fmt(JAIL_FINE)}`, '', m.cash[me] < JAIL_FINE ? 'disabled' : '')}${btn('useCard', 'Pakai kartu', '', m.jfree?.[me] ? '' : 'disabled')}</div>` };
    }
    if (this.myTurn(m) && m.stage === 'draw' && m.drawDeck) {
      return { key: `draw${m.drawDeck}${m.rollN}`, hint: true, html: `<div class="jg-pt">${deckIcon(m.drawDeck)}<span>Ketuk kartu ${DECK_NAME[m.drawDeck]} di tengah papan</span></div>` };
    }
    if (m.offer?.from === me) {
      return { key: `wait${m.offer.n}`, hint: true, html: `<div class="jg-pt"><span>${this.offerTitle(m, m.offer)} · menunggu ${esc(this.name(m, m.offer.to))}</span><button type="button" class="jg-x" data-act="cancel" aria-label="Batalkan">${icon('x')}</button></div>${timer}` };
    }
    if (this.myTurn(m) && m.stage === 'act') {
      return { key: 'end', html: `<div class="jg-btns">${btn('end', `${icon('check')}Selesai giliran`, 'p')}</div>` };
    }
    return null;
  }

  /** Kalimat tawaran dari sudut pandang penerima. */
  offerText(m, o) {
    const cards = (x) => [...x.p.map((i) => esc(SPACES[i].name)), ...(x.j ? ['kartu bebas penjara'] : [])].join(' + ');
    const give = cards(o.give), get = cards(o.get);
    if (o.round) {
      const ask = [get, o.get.c ? fmt(o.get.c) : ''].filter(Boolean).join(' + ');
      return `minta <b>${ask}</b> untuk <b>${give || fmt(o.give.c || 0)}</b>`;
    }
    if (give && get) return `tawar tukar <b>${give}</b> ⇄ <b>${get}</b>${o.give.c ? ` + ${fmt(o.give.c)}` : ''}`;
    if (get) return `mau beli <b>${get}</b> ${fmt(o.give.c || 0)}`;
    if (give) return `menawarkan <b>${give}</b> ${fmt(o.get.c || 0)}`;
    return `menawar ${fmt(o.give.c || 0)}`;
  }

  /** Ringkasan tawaran kita yang sedang menunggu jawaban. */
  offerTitle(m, o) {
    const get = [...o.get.p.map((i) => SPACES[i].name), ...(o.get.j ? ['kartu bebas penjara'] : [])].join(' + ');
    if (o.round) return `Minta ${fmt(o.get.c || 0)}`;
    if (o.give.p.length) return `Tukar ${esc(o.give.p.map((i) => SPACES[i].name).join(' + '))} ⇄ ${esc(get)}`;
    return `Tawar ${esc(get)} ${fmt(o.give.c || 0)}`;
  }

  renderPanel(m, dec) {
    const el = this.dock.querySelector('.jg-panel');
    const key = dec ? `${dec.key}|${m.offer?.n}|${m.v}` : '';
    if (key === this.sig.panel) return;
    this.sig.panel = key;
    el.hidden = !dec;
    if (!dec) return;
    el.className = `jg-panel${dec.hint ? ' jg-tip' : ''}`;
    el.innerHTML = dec.html;
  }

  tickTimer(m) {
    const bar = this.dock.querySelector('.jg-panel:not([hidden]) .jg-timer i');
    if (!bar) return;
    const t = m.auction && !m.auction.out.includes(this.me) && m.debt?.pid !== this.me && m.offer?.to !== this.me ? m.auction : m.offer || m.debt;
    if (!t) return;
    const total = t === m.auction ? 10000 : t === m.offer ? OFFER_TOTAL : 45000;
    bar.style.transform = `scaleX(${Math.max(0, Math.min(1, (t.until - Date.now()) / total))})`;
  }

  // ---------- Laci aset ----------
  galleryCard(m, i) {
    const me = this.me;
    const o = m.own?.[i];
    const sp = SPACES[i];
    const g = groupOf(i);
    let cls = '', stamp = '';
    if (o?.by === me) {
      cls = 'own';
      if (o.m) stamp = '<span class="jg-stamp" style="--s:#c92a2a">DIGADAI</span>';
    } else if (o) {
      const p = m.players.find((x) => x.id === o.by);
      cls = 'dark';
      stamp = `<span class="jg-stamp" style="--s:${p?.color || '#e03131'}">${esc(this.name(m, o.by)).toUpperCase()}</span>`;
    } else {
      cls = 'dark';
      stamp = '<span class="jg-stamp" style="--s:#2b9a48">TERSEDIA</span>';
    }
    const b = o?.h ? `<span class="jg-gh">${o.h === 5 ? '<i class="ht"></i>' : '<i></i>'.repeat(o.h)}</span>` : '';
    return `<button type="button" class="jg-gc ${cls}" data-act="card" data-i="${i}"><span class="jg-gc-h" style="background:${groupColor(g)}"></span><span class="jg-gc-n">${esc(sp.name)}</span>${b}<span class="jg-gc-p">${fmt(sp.price)}</span>${stamp}</button>`;
  }

  jailCard(m, deck) {
    const holder = m.jhold?.[deck];
    const p = m.players.find((x) => x.id === holder);
    const stamp = holder === this.me ? '' : holder ? `<span class="jg-stamp" style="--s:${p?.color || '#e03131'}">${esc(this.name(m, holder)).toUpperCase()}</span>` : '<span class="jg-stamp" style="--s:#6c737d">DI TUMPUKAN</span>';
    return `<button type="button" class="jg-gc jail ${deck} ${holder === this.me ? 'own' : 'dark'}" data-act="card" data-j="${deck}"><span class="jg-gc-n">BEBAS PENJARA</span><span class="jg-gc-p">${DECK_NAME[deck]}</span>${stamp}</button>`;
  }

  renderDrawer(m) {
    const me = this.me;
    const mine = OWNABLE.filter((i) => m.own?.[i]?.by === me);
    const head = `${m.cash?.[me]}|${mine.map((i) => `${i}${m.own[i].m ? 'm' : ''}`).join()}|${this.expanded}`;
    if (head !== this.sig.dhead) {
      this.sig.dhead = head;
      this.dock.querySelector('.jg-dh b').textContent = `Asetku · ${fmt(m.cash?.[me] ?? 0)}`;
      this.dock.querySelector('.jg-dh small').textContent = this.expanded ? 'tutup ▾' : 'buka ▴';
      this.dock.querySelector('.jg-chips').innerHTML = mine.map((i) => `<i style="--g:${groupColor(groupOf(i))}" class="${m.own[i].m ? 'm' : ''}"></i>`).join('') + (m.jfree?.[me] ? '<i class="free"></i>' : '');
      this.dock.querySelector('.jg-drawer').classList.toggle('open', this.expanded);
    }
    const gal = this.dock.querySelector('.jg-gal');
    gal.hidden = !this.expanded;
    if (!this.expanded) return;
    const sig = `${m.v}`;
    if (sig === this.sig.gal) return;
    this.sig.gal = sig;
    let html = '';
    for (const g of ORDER) {
      const n = GROUP_SPACES[g].filter((i) => m.own?.[i]?.by === me).length;
      html += `<div class="jg-gr-h">${esc(GROUPS[g]?.name || GROUP_LABEL[g])}<span>${n}/${GROUP_SPACES[g].length}</span></div><div class="jg-gr">${[...GROUP_SPACES[g]].sort((a, b) => SPACES[a].price - SPACES[b].price || a - b).map((i) => this.galleryCard(m, i)).join('')}</div>`;
    }
    html += `<div class="jg-gr-h">Bebas Penjara</div><div class="jg-gr">${this.jailCard(m, 'takdir')}${this.jailCard(m, 'kebijakan')}</div>`;
    gal.innerHTML = html;
  }

  // ---------- Lembar aksi kartu ----------
  renderSheet(m) {
    if (this.sheet === null) return;
    const sig = `${this.sheet}|${m.v}|${this.showRent}`;
    if (sig === this.sig.sheet) return;
    this.sig.sheet = sig;
    this.sheetEl.querySelector('.jg-sheet').innerHTML = `<span class="jg-grab"></span>${typeof this.sheet === 'string' ? this.jailSheet(m, this.sheet.slice(2)) : this.cardSheet(m, this.sheet)}`;
  }

  cardSheet(m, i) {
    const me = this.me;
    const sp = SPACES[i];
    if (!isOwnable(i)) {
      const info = { go: 'Terima $200 setiap lewat atau berhenti di sini.', jail: 'Cuma mampir, atau tempat tahanan.', free: 'Petak istirahat, tidak terjadi apa-apa.', gojail: 'Langsung masuk penjara!', tax: `Bayar ${fmt(sp.amount || 0)} ke bank.`, takdir: 'Ambil kartu Takdir.', kebijakan: 'Ambil kartu Kebijakan.' }[sp.type];
      return `<div class="jg-sh"><b>${esc(sp.name)}</b><small>${info}</small></div>`;
    }
    const o = m.own?.[i];
    const cash = m.cash?.[me] ?? 0;
    const head = (sub) => `<div class="jg-sh">${miniCard(i)}<div><b>${esc(sp.name)}</b><small>${sub}</small></div></div>`;
    const rent = `<button type="button" class="jg-link" data-act="rent">${this.showRent ? 'Sembunyikan tabel sewa ▾' : 'Lihat tabel sewa ▸'}</button>${this.showRent ? rentTable(i) : ''}`;
    const btn = (act, label, err, cls = '') => `<button type="button" class="jg-b ${cls}" data-act="${act}" data-i="${i}" ${err ? `disabled title="${esc(err)}"` : ''}>${label}</button>`;
    if (o?.by === me) {
      let html = head(`milikmu${o.h ? ` · ${o.h === 5 ? 'hotel' : `${o.h} rumah`}` : ''}${o.m ? ' · digadai' : ''}`) + '<div class="jg-col">';
      if (sp.type === 'prop') {
        const b = buildCheck(m.own, m.bank, me, cash, i);
        html += btn('build', `${o.h === 4 ? 'Bangun hotel' : 'Bangun rumah'} · ${fmt(houseCost(i))}`, b, 'p');
        if (b && b !== 'Sudah hotel') html += `<small class="jg-why">${esc(b)}</small>`;
        html += btn('sell', `Jual bangunan · +${fmt(houseCost(i) / 2)}`, sellCheck(m.own, m.bank, me, i));
      }
      html += o.m ? btn('unmort', `Tebus · ${fmt(unmortgageCost(i))}`, cash < unmortgageCost(i) ? 'Uang tidak cukup' : null) : btn('mort', `Gadai · +${fmt(mortgageValue(i))}`, mortgageCheck(m.own, me, i));
      return `${html}</div>${rent}`;
    }
    if (o) {
      let html = head(`milik ${esc(this.name(m, o.by))} · harga ${fmt(sp.price)}`);
      if (m.out?.includes(o.by)) return html + rent;
      if (groupHasBuildings(m.own, groupOf(i))) return `${html}<p class="jg-why">Ada bangunan di kelompok ini — tidak bisa ditawar.</p>${rent}`;
      const busy = m.offer || m.auction ? 'disabled' : '';
      const prices = [sp.price, round10(sp.price * 1.5), sp.price * 2];
      html += `<div class="jg-lbl">Beli seharga</div><div class="jg-btns">${prices.map((v) => `<button type="button" class="jg-b p" data-act="obuy" data-i="${i}" data-c="${v}" ${busy || v > cash ? 'disabled' : ''}>${fmt(v)}</button>`).join('')}</div>`;
      const mine = OWNABLE.filter((j) => m.own?.[j]?.by === me && !groupHasBuildings(m.own, groupOf(j)));
      if (mine.length) html += `<div class="jg-lbl">atau tukar dengan kartumu</div><div class="jg-btns wrap">${mine.map((j) => `<button type="button" class="jg-b" data-act="oswap" data-i="${i}" data-g="${j}" ${busy}>${miniCard(j)}${esc(SPACES[j].name)}</button>`).join('')}</div>`;
      if (busy) html += '<small class="jg-why">Tunggu tawaran / lelang yang sedang berjalan selesai.</small>';
      return html + rent;
    }
    return `${head(`tersedia · harga ${fmt(sp.price)}`)}<p class="jg-why">Berhenti di petak ini untuk membeli.</p>${rent}`;
  }

  jailSheet(m, deck) {
    const holder = m.jhold?.[deck];
    const head = `<div class="jg-sh">${deckIcon(deck)}<div><b>Kartu Bebas Penjara</b><small>dari tumpukan ${DECK_NAME[deck]}</small></div></div>`;
    if (!holder) return `${head}<p class="jg-why">Masih di tumpukan kartu.</p>`;
    if (holder === this.me) return `${head}<p class="jg-why">Milikmu — dipakai saat di penjara.</p>`;
    const cash = m.cash?.[this.me] ?? 0;
    const busy = m.offer || m.auction;
    return `${head}<div class="jg-lbl">Beli dari ${esc(this.name(m, holder))} seharga</div><div class="jg-btns">${[50, 75, 100].map((v) => `<button type="button" class="jg-b p" data-act="ojail" data-c="${v}" data-to="${holder}" ${busy || v > cash ? 'disabled' : ''}>${fmt(v)}</button>`).join('')}</div>`;
  }

  // ---------- Klik ----------
  onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const m = this.lastM;
    const a = b.dataset.act;
    const i = +b.dataset.i;
    switch (a) {
      case 'drawer':
        this.expanded = !this.expanded;
        this.sig.dhead = '';
        this.sig.gal = '';
        return this.ctx.audio.play('click');
      case 'card':
        this.sheet = b.dataset.j ? `j:${b.dataset.j}` : i;
        this.showRent = false;
        this.sig.sheet = '';
        return this.ctx.audio.play('click');
      case 'info':
        this.sheet = i;
        this.showRent = true;
        this.sig.sheet = '';
        return;
      case 'sclose':
        this.sheet = null;
        return;
      case 'rent':
        this.showRent = !this.showRent;
        return;
      case 'obuy':
        this.sheet = null;
        return this.act({ a: 'offer', to: m.own[i].by, give: { c: +b.dataset.c }, get: { p: [i] }, kind: 'nego' });
      case 'oswap':
        this.sheet = null;
        return this.act({ a: 'offer', to: m.own[i].by, give: { p: [+b.dataset.g] }, get: { p: [i] }, kind: 'barter' });
      case 'ojail':
        this.sheet = null;
        return this.act({ a: 'offer', to: b.dataset.to, give: { c: +b.dataset.c }, get: { j: 1 }, kind: 'nego' });
      case 'askmore': {
        // minta lebih: penawar menambah $50
        const o = m.offer;
        return this.act({ a: 'counter', to: o.from, give: o.get, get: { ...o.give, c: (o.give.c || 0) + ASK_MORE }, kind: o.kind });
      }
      case 'bid': return this.act({ a: 'bid', amt: +b.dataset.amt });
      case 'build': case 'sell': case 'mort': case 'unmort':
        return this.act({ a, i });
      default:
        return this.act({ a });
    }
  }

  targets(m) {
    return this.ctx.renderer(m)?.pickables(this.me, m) || [];
  }

  setHover() {}

  click(obj, m) {
    if (!obj || m.phase === 'lobby') return;
    const d = obj.userData;
    if (d.dice) return this.act({ a: 'roll' });
    if (d.deck) return this.act({ a: 'draw' });
    if (d.phoneOf) {
      // HP di meja: buka/tutup laci aset
      if (this.playing(m)) {
        this.expanded = !this.expanded;
        this.sig.dhead = '';
        this.sig.gal = '';
      }
      return;
    }
    if (d.isBoard && this.ctx.lastHitPoint) {
      const i = this.ctx.renderer(m)?.spaceFromPoint(this.ctx.lastHitPoint);
      if (i === undefined || i < 0) return;
      if (!this.playing(m)) return this.ctx.flash(SPACES[i].name);
      this.sheet = i;
      this.showRent = false;
      this.sig.sheet = '';
    }
  }

  // ---------- Notifikasi satu baris (tanpa angka) ----------
  line(html) {
    this.lines.push({ html, until: 0 });
    if (this.lines.length > 12) this.lines.splice(0, this.lines.length - 12);
  }

  renderLines(now) {
    let shown = this.lines.filter((l) => l.until > now);
    while (shown.length < 3) {
      const next = this.lines.find((l) => !l.until);
      if (!next) break;
      next.until = now + LINE_MS + shown.length * 200;
      shown.push(next);
    }
    this.lines = this.lines.filter((l) => !l.until || l.until > now);
    const waiting = this.lines.filter((l) => !l.until).length;
    const sig = shown.map((l) => l.until).join() + `|${waiting}`;
    if (sig === this.sig.lines) return;
    this.sig.lines = sig;
    this.linesEl.innerHTML = shown.map((l) => `<div class="jg-line">${l.html}</div>`).join('') + (waiting ? `<div class="jg-line more">+${waiting} lainnya</div>` : '');
  }

  onEvent(ev, m) {
    const N = (id) => esc(this.name(m, id));
    const sp = (i) => esc(SPACES[i]?.name);
    const who = (id, text) => this.line(`${this.avatar(m, id)}<span>${text}</span>`);
    const card = (i, text) => this.line(`${miniCard(i)}<span>${text}</span>`);
    switch (ev.k) {
      case 'card': this.line(`${deckIcon(ev.deck)}<span>${N(ev.p)} ambil kartu ${DECK_NAME[ev.deck]}: ${esc(CARDS[ev.deck][ev.id].text)}</span>`); break;
      case 'buy': card(ev.i, `${N(ev.p)} membeli ${sp(ev.i)}`); break;
      case 'sold': card(ev.i, `${N(ev.p)} menang lelang ${sp(ev.i)}`); break;
      case 'mort': card(ev.i, `${N(ev.p)} menggadai ${sp(ev.i)}`); break;
      case 'unmort': card(ev.i, `${N(ev.p)} menebus ${sp(ev.i)}`); break;
      case 'build': card(ev.i, `${N(ev.p)} membangun ${ev.h === 5 ? 'hotel' : 'rumah'} di ${sp(ev.i)}`); break;
      case 'sellh': card(ev.i, `${N(ev.p)} menjual bangunan di ${sp(ev.i)}`); break;
      case 'trade': {
        const moved = [...ev.give.p.map((i) => [i, ev.to]), ...ev.get.p.map((i) => [i, ev.p])];
        const how = ev.kind === 'barter' ? 'barter' : 'nego';
        if (moved.length) for (const [i, to] of moved) card(i, `${sp(i)} pindah ke ${N(to)} (${how})`);
        if (ev.give.j || ev.get.j) who(ev.give.j ? ev.to : ev.p, `Kartu bebas penjara pindah ke ${N(ev.give.j ? ev.to : ev.p)}`);
        break;
      }
      case 'rent': who(ev.p, `${N(ev.p)} bayar sewa ${sp(ev.i)} ke ${N(ev.to)}`); break;
      case 'tax': who(ev.p, `${N(ev.p)} bayar ${sp(ev.i)}`); break;
      case 'salary': who(ev.p, `${N(ev.p)} lewat MULAI`); break;
      case 'jail': who(ev.p, `${N(ev.p)} masuk penjara`); break;
      case 'free': who(ev.p, `${N(ev.p)} keluar dari penjara`); break;
      case 'keep': who(ev.p, `${N(ev.p)} menyimpan kartu bebas penjara`); break;
      case 'auction': card(ev.i, `Lelang ${sp(ev.i)} dimulai`); break;
      case 'nosale': card(ev.i, `Lelang ${sp(ev.i)} tanpa penawar`); break;
      case 'bankrupt': who(ev.p, `${N(ev.p)} bangkrut`); break;
      case 'debt': if (ev.p !== this.me) who(ev.p, `${N(ev.p)} kekurangan uang`); break;
      case 'offer':
        if (ev.to === this.me) this.ctx.audio.play('buzz');
        break;
      case 'reject': if (ev.to === this.me) who(ev.p, ev.timeout ? 'Tawaranmu tidak dijawab' : `${N(ev.p)} menolak tawaranmu`); break;
      case 'deny': if (ev.p === this.me) this.ctx.flash(ev.msg); break;
      case 'roll':
        if (ev.triple) who(ev.p, `${N(ev.p)} tiga kali kembar — masuk penjara`);
        else if (ev.stay) who(ev.p, `${N(ev.p)} tetap di penjara`);
        break;
    }
  }

  // ---------- Bingkai lain ----------
  /** Saldo di daftar pemain + jumlah uang keluar/masuk sebentar. */
  playerBadge(m, p) {
    if (m.phase !== 'play' || m.out?.includes(p.id)) return '';
    const d = this.delta[p.id];
    const delta = d && d.until > performance.now() ? `<span class="jg-delta ${d.d > 0 ? 'up' : 'dn'}">${d.d > 0 ? '+' : '−'}${fmt(Math.abs(d.d))}</span>` : '';
    return `<span class="cp-badge" title="Saldo">${fmt(m.cash?.[p.id] ?? 0)}</span>${delta}`;
  }

  endText(m) {
    if (m.why === 'time') return 'Waktu habis · kekayaan terbesar menang';
    if (m.winner) return 'Semua lawan bangkrut';
    return '';
  }

  lobby(el, m, isHost) {
    if (m.phase !== 'lobby') {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const me = this.me;
    const sig = `${JSON.stringify(m.tok)}|${m.opts?.limit}|${isHost}|${m.players.length}`;
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    const owner = (k) => m.players.find((p) => m.tok?.[p.id] === k);
    const limit = m.opts?.limit || 0;
    el.innerHTML = `<div class="jg-opts"><span class="cu-opt-label">Pilih bidak</span><div class="jg-toks">${TOKENS.map((t, k) => {
      const o = owner(k);
      return `<button type="button" data-tok="${k}" class="${o?.id === me ? 'on' : ''}" ${o && o.id !== me ? 'disabled' : ''}><b>${esc(t.name)}</b>${o ? `<small style="color:${o.color}">${esc(o.id === me ? 'kamu' : o.name)}</small>` : '<small>kosong</small>'}</button>`;
    }).join('')}</div>
      <span class="cu-opt-label">Lama main</span><div class="cu-seg">${[0, 30, 45, 60].map((n) => `<button type="button" data-limit="${n}" class="${limit === n ? 'on' : ''}" ${isHost ? '' : 'disabled'}>${n ? `${n} mnt` : 'Bangkrut'}</button>`).join('')}</div></div>`;
    el.querySelectorAll('[data-tok]').forEach((b) => b.addEventListener('click', () => this.act({ a: 'tok', k: +b.dataset.tok })));
    el.querySelectorAll('[data-limit]').forEach((b) =>
      b.addEventListener('click', () => {
        this.ctx.ownHost()?.setLimit(+b.dataset.limit);
        this.ctx.audio.play('click');
      })
    );
  }
}
