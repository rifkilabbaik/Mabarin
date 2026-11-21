import { icon } from '../../ui/icons.js';
import {
  SPACES, GROUPS, TOKENS, CARDS, DECK_NAME, OWNABLE, GROUP_SPACES, JAIL_FINE, fmt, groupOf, isOwnable, netWorth, buildCheck, sellCheck,
  mortgageCheck, mortgageValue, unmortgageCost, houseCost, groupHasBuildings,
} from './rules.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ORDER = ['cokelat', 'biruMuda', 'pink', 'oranye', 'merah', 'kuning', 'hijau', 'biruTua', 'rail', 'util'];
const GROUP_LABEL = { rail: 'Transportasi', util: 'Utilitas' };
const groupColor = (g) => GROUPS[g]?.color || (g === 'rail' ? '#495057' : '#868e96');
const ANN_MS = 2700;

/** Kartu hak milik (HTML) lengkap dengan tabel sewa. */
function deedHtml(i, m, compact = false) {
  const sp = SPACES[i];
  const g = groupOf(i);
  const light = ['kuning', 'biruMuda'].includes(g);
  const o = m?.own?.[i];
  let rows = '';
  if (!compact) {
    if (sp.type === 'prop') {
      const r = sp.rent;
      rows = `<tr><td>Sewa</td><td>${fmt(r[0])}</td></tr><tr><td>Satu kelompok warna</td><td>${fmt(r[0] * 2)}</td></tr>
        ${[1, 2, 3, 4].map((h) => `<tr class="${o?.h === h ? 'on' : ''}"><td>Dengan ${h} rumah</td><td>${fmt(r[h])}</td></tr>`).join('')}
        <tr class="${o?.h === 5 ? 'on' : ''}"><td>Dengan hotel</td><td>${fmt(r[5])}</td></tr>
        <tr class="sep"><td>Harga rumah / hotel</td><td>${fmt(houseCost(i))}</td></tr>`;
    } else if (sp.type === 'rail') {
      rows = [1, 2, 3, 4].map((n) => `<tr><td>Punya ${n} transportasi</td><td>${fmt([0, 25, 50, 100, 200][n])}</td></tr>`).join('');
    } else {
      rows = `<tr><td>Punya 1 utilitas</td><td>4× dadu</td></tr><tr><td>Punya 2 utilitas</td><td>10× dadu</td></tr>`;
    }
    rows += `<tr class="sep"><td>Nilai gadai</td><td>${fmt(mortgageValue(i))}</td></tr>`;
  }
  return `<div class="jg-deed${compact ? ' compact' : ''}${o?.m ? ' mort' : ''}">
    <div class="jg-deed-h" style="background:${groupColor(g)};color:${light ? '#2b2118' : '#fff'}"><small>HAK MILIK</small><b>${esc(sp.name)}</b></div>
    ${compact ? `<div class="jg-deed-p">${fmt(sp.price)}</div>` : `<table>${rows}</table>`}
    ${o?.m ? '<div class="jg-stamp">DIGADAI</div>' : ''}</div>`;
}

/**
 * Kontrol pemain Juragan: tombol giliran, HP (uang, beli, lelang, aset, nego, mutasi), pengumuman & suara.
 * HP di meja bisa diketuk (atau tombol HP di bawah tombol kamera) → melayang ke wajah, lalu layar HP tampil.
 */
export class JuraganControls {
  constructor(ctx) {
    this.ctx = ctx;
    this.open = false;
    this.tab = 'aset';
    this.detail = -1;
    this.draft = null; // rancangan nego
    this.sig = '';
    this.lastCash = null;
    this.autoKey = '';
    this.annQueue = [];
    this.annUntil = 0;
    this.showAt = 0;
  }

  get me() {
    return this.ctx.myId;
  }

  enter() {
    const ctx = this.ctx;
    ctx.setTopView(true); // papan besar paling jelas dari atas (tombol kamera tetap bisa mengganti)
    this.btnRoll = ctx.button('dice', 'Lempar dadu', () => this.act({ a: 'roll' }), 'primary', 'jg-roll');
    this.btnEnd = ctx.button('check', 'Selesai giliran', () => this.act({ a: 'end' }), '', 'jg-end');
    this.btnNeed = ctx.button('phone', 'Buka HP', () => this.setOpen(true), 'kilat', 'jg-need');
    const root = $('cards-ui');
    this.phoneBtn = document.createElement('button');
    this.phoneBtn.type = 'button';
    this.phoneBtn.id = 'jg-phone-btn';
    this.phoneBtn.className = 'icon-btn';
    this.phoneBtn.title = 'HP';
    this.phoneBtn.setAttribute('aria-label', 'Buka HP');
    this.phoneBtn.innerHTML = `${icon('phone')}<span class="jg-dot" hidden></span>`;
    this.phoneBtn.hidden = true;
    this.phoneBtn.addEventListener('click', () => this.setOpen(!this.open));
    this.phone = document.createElement('div');
    this.phone.id = 'jg-phone';
    this.phone.className = 'jg-phone';
    this.phone.hidden = true;
    this.phone.innerHTML = `<div class="jg-frame"><div class="jg-notch"></div>
      <div class="jg-status"><span class="jg-clock"></span><span class="jg-bat"><i></i></span></div>
      <div class="jg-scroll"><div class="jg-head"></div><div class="jg-alert"></div>
      <nav class="jg-tabs">${['aset', 'nego', 'mutasi', 'pemain'].map((t) => `<button type="button" data-act="tab" data-tab="${t}">${{ aset: 'Aset', nego: 'Nego', mutasi: 'Mutasi', pemain: 'Pemain' }[t]}</button>`).join('')}</nav>
      <div class="jg-body"></div></div>
      <button type="button" class="jg-close" data-act="close" aria-label="Tutup HP"><i></i></button></div>`;
    this.phone.addEventListener('click', (e) => this.onClick(e));
    this.ann = document.createElement('div');
    this.ann.id = 'jg-ann';
    this.ann.className = 'jg-ann';
    this.ann.hidden = true;
    this.money = document.createElement('div');
    this.money.className = 'jg-money';
    root.append(this.phoneBtn, this.phone, this.ann, this.money);
  }

  exit() {
    if (this.open) this.ctx.act({ a: 'phone', on: false });
    this.open = false;
    $('cards-ui').classList.remove('jg-open');
    for (const el of [this.phoneBtn, this.phone, this.ann, this.money]) el?.remove();
  }

  act(a) {
    this.ctx.act(a);
    this.ctx.audio.play('click');
  }

  setOpen(on) {
    if (on === this.open) return;
    this.open = on;
    this.ctx.act({ a: 'phone', on });
    this.ctx.audio.play(on ? 'pop' : 'click');
    this.showAt = performance.now() + 330; // layar HTML tampil setelah HP sampai di depan wajah
    if (!on) this.phone.hidden = true;
    this.sig = '';
    this.phoneBtn.classList.toggle('on', on);
    $('cards-ui').classList.toggle('jg-open', on);
  }

  myTurn(m) {
    return m.phase === 'play' && m.players[m.turn]?.id === this.me;
  }

  playing(m) {
    return m.players.some((p) => p.id === this.me) && !m.out?.includes(this.me);
  }

  // ---------- Tiap frame ----------
  update(dt, m) {
    this.lastM = m;
    const r = this.ctx.renderer(m);
    const live = m.phase !== 'lobby';
    const playing = this.playing(m);
    if (r) {
      r.view.phoneOpen = this.open && live;
      r.view.sel = this.open && this.detail >= 0 ? this.detail : -1;
    }
    if ((!live || !playing) && this.open) this.setOpen(false);
    const mine = this.myTurn(m);
    const st = m.stage;
    this.btnRoll.hidden = !mine || st !== 'roll';
    this.btnRoll.querySelector('span').textContent = m.jail?.[this.me] !== undefined ? 'Lempar (cari kembar)' : m.doubles > 0 ? 'Lempar lagi (kembar)' : 'Lempar dadu';
    this.btnEnd.hidden = !mine || st !== 'act';
    const need = live && playing && this.needsPhone(m);
    this.btnNeed.hidden = !need || this.open;
    this.phoneBtn.hidden = !live || !playing;
    this.phoneBtn.querySelector('.jg-dot').hidden = !need;
    // buka HP otomatis saat perlu keputusan (sekali per kejadian)
    if (need && need !== this.autoKey) {
      this.autoKey = need;
      if (!this.open) this.setOpen(true);
      this.detail = -1;
    }
    if (!need) this.autoKey = '';
    // suara uang: bayar "tung ting", uang masuk "kencring"
    const cash = m.cash?.[this.me];
    if (live && cash !== undefined && this.lastCash !== null && cash !== this.lastCash) {
      const d = cash - this.lastCash;
      this.ctx.audio.play(d < 0 ? 'tungting' : 'kencring');
      this.moneyPop(d);
    }
    this.lastCash = live ? (cash ?? null) : null;
    if (this.open && performance.now() >= this.showAt) {
      this.phone.hidden = false;
      this.render(m);
      this.tickLive(m);
    }
    this.updateAnn();
  }

  /** Kunci keputusan yang butuh HP (beli, lelang, tawaran, utang), atau '' bila tidak ada. */
  needsPhone(m) {
    const me = this.me;
    if (m.debt?.pid === me) return `debt${m.debt.until}`;
    if (m.offer?.to === me) return `offer${m.offer.n}`;
    if (m.auction && !m.auction.out.includes(me)) return `auction${m.auction.n}`;
    if (this.myTurn(m) && m.stage === 'buy') return `buy${m.rollN}:${m.pos[me]}`;
    return '';
  }

  moneyPop(d) {
    const el = this.money;
    el.textContent = `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`;
    el.className = `jg-money ${d > 0 ? 'in' : 'out'}`;
    void el.offsetWidth;
    el.classList.add('show');
  }

  // ---------- Layar HP ----------
  render(m) {
    const sig = `${m.v}|${this.tab}|${this.detail}|${JSON.stringify(this.draft)}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const me = this.me;
    const p = m.players.find((x) => x.id === me);
    const cash = m.cash?.[me] ?? 0;
    const tok = TOKENS[m.tok?.[me] ?? 0];
    const now = new Date();
    this.phone.querySelector('.jg-clock').textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.phone.querySelector('.jg-head').innerHTML = `
      <div class="jg-who"><span class="dot" style="background:${p?.color}"></span><b>${esc(p?.name)}</b><span class="jg-tok">${esc(tok?.name)}</span></div>
      <div class="jg-saldo-l">Saldo</div><div class="jg-saldo${cash < 0 ? ' neg' : ''}">${fmt(cash)}</div>
      <div class="jg-worth">Kekayaan ${fmt(netWorth(cash, m.own || {}, me))}${m.jfree?.[me] ? ` · ${m.jfree[me]} kartu bebas penjara` : ''}${m.jail?.[me] !== undefined ? ' · <b>di penjara</b>' : ''}</div>`;
    this.phone.querySelector('.jg-alert').innerHTML = this.alertHtml(m);
    this.phone.querySelectorAll('.jg-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab && this.detail < 0));
    this.phone.querySelector('.jg-body').innerHTML = this.detail >= 0 ? this.detailHtml(m, this.detail) : this[`${this.tab}Html`](m);
  }

  /** Bagian yang bergerak tiap frame (hitung mundur lelang / tawaran). */
  tickLive(m) {
    const bar = this.phone.querySelector('.jg-timer i');
    if (!bar) return;
    const t = m.auction || m.offer || m.debt;
    if (!t) return;
    const total = m.auction ? 10000 : m.offer ? 40000 : 45000;
    bar.style.transform = `scaleX(${Math.max(0, Math.min(1, (t.until - Date.now()) / total))})`;
    const sec = this.phone.querySelector('.jg-timer b');
    if (sec) sec.textContent = `${Math.max(0, Math.ceil((t.until - Date.now()) / 1000))} dtk`;
  }

  name(m, id) {
    if (!id) return 'Bank';
    if (id === this.me) return 'Kamu';
    return m.players.find((p) => p.id === id)?.name || 'Pemain';
  }

  alertHtml(m) {
    const me = this.me;
    const timer = '<div class="jg-timer"><i></i><b></b></div>';
    if (m.debt?.pid === me) {
      return `<div class="jg-card warn"><h4>${icon('flag')}Uangmu kurang ${fmt(-m.cash[me])}</h4>
        <p>Jual bangunan atau gadai tanah di tab <b>Aset</b> sampai saldo tidak minus. Utang ke ${esc(this.name(m, m.debt.to))}.</p>${timer}
        <div class="jg-row"><button type="button" class="jg-btn danger" data-act="bankrupt">Nyatakan bangkrut</button></div></div>`;
    }
    if (m.offer?.to === me) return `<div class="jg-card hot"><h4>${icon('chat')}Tawaran dari ${esc(this.name(m, m.offer.from))}</h4>${this.offerSummary(m, m.offer, true)}${timer}
      <div class="jg-row"><button type="button" class="jg-btn" data-act="reject">Tolak</button><button type="button" class="jg-btn primary" data-act="accept">Terima</button></div></div>`;
    if (m.auction) {
      const a = m.auction;
      const out = a.out.includes(me);
      const high = a.by === me;
      const cash = m.cash[me];
      const bidBtn = (d) => `<button type="button" class="jg-btn" data-act="bid" data-amt="${a.bid + d}" ${a.bid + d > cash || out ? 'disabled' : ''}>+${d}</button>`;
      return `<div class="jg-card hot"><h4>${icon('hammer')}Lelang</h4><div class="jg-auc">${deedHtml(a.i, m, true)}
        <div><small>Tawaran tertinggi</small><b class="jg-big">${fmt(a.bid)}</b><span>${a.by ? esc(this.name(m, a.by)) : 'belum ada'}</span></div></div>${timer}
        ${out ? '<p class="jg-muted">Kamu sudah lewat.</p>' : high ? '<p class="jg-ok">Kamu penawar tertinggi.</p>' : `<div class="jg-row">${bidBtn(10)}${bidBtn(50)}${bidBtn(100)}<button type="button" class="jg-btn" data-act="pass">Lewat</button></div>`}</div>`;
    }
    if (this.myTurn(m) && m.stage === 'buy') {
      const i = m.pos[me];
      const price = SPACES[i].price;
      return `<div class="jg-card hot"><h4>${icon('crown')}Beli tanah ini?</h4>${deedHtml(i, m)}
        <div class="jg-row"><button type="button" class="jg-btn" data-act="noBuy">Lelang</button><button type="button" class="jg-btn primary" data-act="buy" ${m.cash[me] < price ? 'disabled' : ''}>Beli ${fmt(price)}</button></div></div>`;
    }
    if (this.myTurn(m) && m.stage === 'roll' && m.jail?.[me] !== undefined) {
      return `<div class="jg-card"><h4>${icon('flag')}Kamu di penjara (percobaan ${m.jail[me] + 1}/3)</h4><p>Lempar dadu kembar untuk keluar, atau:</p>
        <div class="jg-row"><button type="button" class="jg-btn" data-act="payJail" ${m.cash[me] < JAIL_FINE ? 'disabled' : ''}>Bayar ${fmt(JAIL_FINE)}</button>
        <button type="button" class="jg-btn" data-act="useCard" ${m.jfree?.[me] ? '' : 'disabled'}>Pakai kartu bebas</button></div></div>`;
    }
    if (m.offer?.from === me) return `<div class="jg-card"><h4>${icon('hourglass')}Menunggu jawaban ${esc(this.name(m, m.offer.to))}</h4>${this.offerSummary(m, m.offer, false)}${timer}
      <div class="jg-row"><button type="button" class="jg-btn" data-act="cancel">Batalkan</button></div></div>`;
    return '';
  }

  offerSummary(m, o, forMe) {
    const side = (x) => {
      const parts = [];
      if (x.c) parts.push(`<b>${fmt(x.c)}</b>`);
      for (const i of x.p) parts.push(`<span class="jg-chip" style="--c:${groupColor(groupOf(i))}">${esc(SPACES[i].name)}${m.own?.[i]?.m ? ' (gadai)' : ''}</span>`);
      if (x.j) parts.push(`${x.j} kartu bebas penjara`);
      return parts.join(' ') || '<i>—</i>';
    };
    const a = forMe ? 'Kamu dapat' : `${esc(this.name(m, o.to))} dapat`;
    const b = forMe ? 'Kamu beri' : 'Kamu dapat';
    return `<div class="jg-offer"><div><small>${a}</small>${side(o.give)}</div><div><small>${b}</small>${side(o.get)}</div></div>`;
  }

  // ---------- Tab Aset ----------
  asetHtml(m) {
    const me = this.me;
    const mine = OWNABLE.filter((i) => m.own?.[i]?.by === me);
    if (!mine.length) return '<p class="jg-empty">Belum punya tanah. Berhenti di petak kosong untuk membeli, atau ikut lelang.</p>';
    let html = '';
    for (const g of ORDER) {
      const list = mine.filter((i) => groupOf(i) === g);
      if (!list.length) continue;
      const total = GROUP_SPACES[g].length;
      html += `<div class="jg-group"><div class="jg-group-h" style="--c:${groupColor(g)}">${esc(GROUPS[g]?.name || GROUP_LABEL[g])}<span>${list.length}/${total}${list.length === total ? ' · lengkap' : ''}</span></div>`;
      for (const i of list) {
        const o = m.own[i];
        const b = o.h === 5 ? '<span class="jg-hotel"></span>' : '<span class="jg-house"></span>'.repeat(o.h);
        html += `<button type="button" class="jg-prop" data-act="info" data-i="${i}"><span>${esc(SPACES[i].name)}</span><span class="jg-b">${b}${o.m ? '<em>gadai</em>' : ''}</span>${icon('arrowRight')}</button>`;
      }
      html += '</div>';
    }
    return html;
  }

  detailHtml(m, i) {
    const me = this.me;
    const sp = SPACES[i];
    if (!isOwnable(i)) {
      const info = { go: 'Terima Rp200 setiap lewat atau berhenti di sini.', jail: 'Cuma mampir, atau tempat tahanan.', free: 'Petak istirahat, tidak terjadi apa-apa.', gojail: 'Langsung masuk penjara!', tax: `Bayar ${fmt(sp.amount || 0)} ke bank.`, peluang: 'Ambil kartu Peluang.', kas: 'Ambil kartu Kas RT.' }[sp.type];
      return `<button type="button" class="jg-back" data-act="back">${icon('arrowRight')}Kembali</button><div class="jg-card"><h4>${esc(sp.name)}</h4><p>${info}</p></div>`;
    }
    const o = m.own?.[i];
    const cash = m.cash?.[me] ?? 0;
    let btns = '';
    if (o?.by === me && m.phase === 'play') {
      const b = sp.type === 'prop' ? buildCheck(m.own, m.bank, me, cash, i) : 'x';
      const s = sp.type === 'prop' ? sellCheck(m.own, m.bank, me, i) : 'x';
      const mg = mortgageCheck(m.own, me, i);
      const btn = (act, label, err, cls = '') => `<button type="button" class="jg-btn ${cls}" data-act="${act}" data-i="${i}" ${err ? `disabled title="${esc(err)}"` : ''}>${label}</button>`;
      if (sp.type === 'prop') btns += btn('build', `${o.h === 4 ? 'Bangun hotel' : 'Bangun rumah'} ${fmt(houseCost(i))}`, b, 'primary') + btn('sell', `Jual bangunan +${fmt(houseCost(i) / 2)}`, s);
      btns += o.m ? btn('unmort', `Tebus ${fmt(unmortgageCost(i))}`, cash < unmortgageCost(i) ? 'Uang tidak cukup' : null) : btn('mort', `Gadai +${fmt(mortgageValue(i))}`, mg);
      const why = sp.type === 'prop' && b && b !== 'Sudah hotel' ? `<p class="jg-muted">${esc(b)}</p>` : '';
      btns = `<div class="jg-grid2">${btns}</div>${why}`;
    }
    const owner = o ? `Pemilik: <b>${esc(this.name(m, o.by))}</b>${o.h ? ` · ${o.h === 5 ? 'hotel' : `${o.h} rumah`}` : ''}` : 'Belum dimiliki';
    return `<button type="button" class="jg-back" data-act="back">${icon('arrowRight')}Kembali</button>${deedHtml(i, m)}<p class="jg-owner">${owner}</p>${btns}`;
  }

  // ---------- Tab Nego ----------
  negoHtml(m) {
    const me = this.me;
    if (m.offer && (m.offer.from === me || m.offer.to === me)) return '<p class="jg-empty">Ada tawaran yang sedang berjalan (lihat di atas).</p>';
    const others = m.players.filter((p) => p.id !== me && !m.out?.includes(p.id));
    if (!others.length) return '<p class="jg-empty">Tidak ada pemain lain.</p>';
    const d = (this.draft ||= { to: others[0].id, give: { c: 0, p: [], j: 0 }, get: { c: 0, p: [], j: 0 } });
    if (!others.some((p) => p.id === d.to)) d.to = others[0].id;
    const tradable = (pid) => OWNABLE.filter((i) => m.own?.[i]?.by === pid && !groupHasBuildings(m.own, groupOf(i)));
    const list = (pid, side) => {
      const ps = tradable(pid);
      if (!ps.length) return '<p class="jg-muted">Tidak ada tanah yang bisa ditukar.</p>';
      return ps.map((i) => `<button type="button" class="jg-chip pick${d[side].p.includes(i) ? ' on' : ''}" style="--c:${groupColor(groupOf(i))}" data-act="ntog" data-side="${side}" data-i="${i}">${esc(SPACES[i].name)}${m.own[i].m ? ' (gadai)' : ''}</button>`).join('');
    };
    const money = (side, max) => `<div class="jg-cash"><button type="button" data-act="ncash" data-side="${side}" data-d="-50">−50</button><button type="button" data-act="ncash" data-side="${side}" data-d="-10">−10</button>
      <b>${fmt(d[side].c)}</b><button type="button" data-act="ncash" data-side="${side}" data-d="10">+10</button><button type="button" data-act="ncash" data-side="${side}" data-d="50">+50</button></div>
      <small class="jg-muted">maks ${fmt(Math.max(0, max))}</small>`;
    const jail = (side, n) => (n ? `<button type="button" class="jg-chip pick${d[side].j ? ' on' : ''}" data-act="njail" data-side="${side}">Kartu bebas penjara</button>` : '');
    const empty = !d.give.c && !d.give.p.length && !d.give.j && !d.get.c && !d.get.p.length && !d.get.j;
    return `<div class="jg-nego">
      <div class="jg-seg">${others.map((p) => `<button type="button" class="${p.id === d.to ? 'on' : ''}" data-act="nto" data-to="${p.id}">${esc(p.name)}</button>`).join('')}</div>
      <h5>Kamu beri</h5>${money('give', m.cash[me])}<div class="jg-chips">${list(me, 'give')}${jail('give', m.jfree?.[me])}</div>
      <h5>Kamu minta</h5>${money('get', m.cash[d.to])}<div class="jg-chips">${list(d.to, 'get')}${jail('get', m.jfree?.[d.to])}</div>
      <div class="jg-row"><button type="button" class="jg-btn" data-act="nreset">Kosongkan</button><button type="button" class="jg-btn primary" data-act="nsend" ${empty || m.auction ? 'disabled' : ''}>Kirim tawaran</button></div></div>`;
  }

  // ---------- Tab Mutasi ----------
  mutasiHtml(m) {
    const me = this.me;
    const rows = (m.log || []).filter((l) => l.from === me || l.to === me).slice(-25).reverse();
    if (!rows.length) return '<p class="jg-empty">Belum ada transaksi.</p>';
    return `<ul class="jg-log">${rows
      .map((l) => {
        const inn = l.to === me;
        const who = inn ? (l.from ? `dari ${esc(this.name(m, l.from))}` : '') : l.to ? `ke ${esc(this.name(m, l.to))}` : '';
        return `<li class="${inn ? 'in' : 'out'}"><span><b>${esc(l.why)}</b><small>${who || 'Bank'}</small></span><em>${inn ? '+' : '−'}${fmt(l.amt)}</em></li>`;
      })
      .join('')}</ul>`;
  }

  // ---------- Tab Pemain ----------
  pemainHtml(m) {
    return `<ul class="jg-players">${m.players
      .map((p) => {
        const out = m.out?.includes(p.id);
        const n = OWNABLE.filter((i) => m.own?.[i]?.by === p.id).length;
        const cash = m.cash?.[p.id] ?? 0;
        return `<li class="${out ? 'out' : ''}"><span class="dot" style="background:${p.color}"></span><span class="nm"><b>${esc(this.name(m, p.id))}</b>
          <small>${esc(TOKENS[m.tok?.[p.id] ?? 0]?.name)} · ${n} tanah${m.jail?.[p.id] !== undefined ? ' · penjara' : ''}${out ? ' · bangkrut' : ''}</small></span>
          <span class="cash"><b>${fmt(cash)}</b><small>kekayaan ${fmt(netWorth(cash, m.own || {}, p.id))}</small></span></li>`;
      })
      .join('')}</ul><p class="jg-muted">Bank: ${m.bank?.h ?? 32} rumah · ${m.bank?.H ?? 12} hotel tersisa${m.endsAt ? ` · sisa waktu ${Math.max(0, Math.ceil((m.endsAt - Date.now()) / 60000))} menit` : ''}</p>`;
  }

  // ---------- Klik di HP ----------
  onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const m = this.lastM;
    const a = b.dataset.act;
    const i = +b.dataset.i;
    switch (a) {
      case 'close': return this.setOpen(false);
      case 'tab':
        this.tab = b.dataset.tab;
        this.detail = -1;
        break;
      case 'info': this.detail = i; break;
      case 'back': this.detail = -1; break;
      case 'bid': return this.act({ a: 'bid', amt: +b.dataset.amt });
      case 'nto':
        this.draft = { to: b.dataset.to, give: { c: 0, p: [], j: 0 }, get: { c: 0, p: [], j: 0 } };
        break;
      case 'ntog': {
        const s = this.draft[b.dataset.side];
        s.p = s.p.includes(i) ? s.p.filter((x) => x !== i) : [...s.p, i];
        break;
      }
      case 'ncash': {
        const side = b.dataset.side;
        const max = Math.max(0, m?.cash?.[side === 'give' ? this.me : this.draft.to] ?? 0);
        this.draft[side].c = Math.max(0, Math.min(max, this.draft[side].c + +b.dataset.d));
        break;
      }
      case 'njail': {
        const s = this.draft[b.dataset.side];
        s.j = s.j ? 0 : 1;
        break;
      }
      case 'nreset': this.draft = null; break;
      case 'nsend':
        this.act({ a: 'offer', to: this.draft.to, give: this.draft.give, get: this.draft.get });
        this.draft = null;
        break;
      case 'build': case 'sell': case 'mort': case 'unmort':
        return this.act({ a, i });
      default:
        return this.act({ a });
    }
    this.sig = '';
    this.ctx.audio.play('click');
  }

  // ---------- Pengumuman ----------
  announce(html, cls = '') {
    this.annQueue.push({ html, cls });
    if (this.annQueue.length > 4) this.annQueue.shift();
  }

  updateAnn() {
    const now = performance.now();
    if (now < this.annUntil) return;
    const next = this.annQueue.shift();
    if (!next) {
      this.ann.hidden = true;
      return;
    }
    this.ann.className = `jg-ann ${next.cls}`;
    this.ann.innerHTML = next.html;
    this.ann.hidden = false;
    void this.ann.offsetWidth;
    this.ann.classList.add('show');
    this.annUntil = now + ANN_MS;
  }

  onEvent(ev, m) {
    const nm = (id) => esc(this.name(m, id));
    const flash = (t) => this.ctx.flash(t);
    const sp = (i) => esc(SPACES[i]?.name);
    switch (ev.k) {
      case 'card': {
        const c = CARDS[ev.deck][ev.id];
        this.announce(`<div class="jg-cardann ${ev.deck}"><small>${DECK_NAME[ev.deck]}</small><p>${esc(c.text)}</p><span>${nm(ev.p)}</span></div>`, 'is-card');
        break;
      }
      case 'buy':
        this.announce(`<div class="jg-buyann">${deedHtml(ev.i, m, true)}<p><b>${nm(ev.p)}</b> membeli <b>${sp(ev.i)}</b></p></div>`, 'is-buy');
        break;
      case 'sold':
        this.announce(`<div class="jg-buyann">${deedHtml(ev.i, m, true)}<p><b>${nm(ev.p)}</b> memenangkan lelang <b>${sp(ev.i)}</b> seharga ${fmt(ev.amt)}</p></div>`, 'is-buy');
        break;
      case 'trade':
        this.announce(`<div class="jg-buyann"><p><b>${nm(ev.p)}</b> &amp; <b>${nm(ev.to)}</b> sepakat nego</p></div>`, 'is-buy');
        break;
      case 'bankrupt':
        this.announce(`<div class="jg-buyann"><p><b>${nm(ev.p)}</b> bangkrut!</p></div>`, 'is-bad');
        break;
      case 'auction': flash(`Lelang ${SPACES[ev.i].name}!`); break;
      case 'nosale': flash('Lelang tanpa penawar'); break;
      case 'rent': flash(`${this.name(m, ev.p)} bayar sewa ${fmt(ev.amt)} ke ${this.name(m, ev.to)}`); break;
      case 'tax': flash(`${this.name(m, ev.p)} bayar ${SPACES[ev.i].name} ${fmt(ev.amt)}`); break;
      case 'salary': flash(`${this.name(m, ev.p)} lewat MULAI +${fmt(ev.amt)}`); break;
      case 'jail': flash(`${this.name(m, ev.p)} masuk penjara!`); break;
      case 'free': flash(`${this.name(m, ev.p)} keluar dari penjara`); break;
      case 'keep': flash(`${this.name(m, ev.p)} menyimpan kartu bebas penjara`); break;
      case 'build': flash(`${this.name(m, ev.p)} membangun ${ev.h === 5 ? 'hotel' : 'rumah'} di ${SPACES[ev.i].name}`); break;
      case 'mort': flash(`${this.name(m, ev.p)} menggadai ${SPACES[ev.i].name}`); break;
      case 'debt': if (ev.p !== this.me) flash(`${this.name(m, ev.p)} kekurangan uang`); break;
      case 'offer': if (ev.to === this.me) this.ctx.audio.play('buzz'); break;
      case 'reject': if (ev.to === this.me) flash(ev.timeout ? 'Tawaran tidak dijawab' : `${this.name(m, ev.p)} menolak tawaranmu`); break;
      case 'deny': if (ev.p === this.me) flash(ev.msg); break;
      case 'roll':
        if (ev.triple) flash('Tiga kali kembar — masuk penjara!');
        else if (ev.stay) flash(`${this.name(m, ev.p)} tetap di penjara`);
        break;
    }
  }

  // ---------- Bingkai lain ----------
  playerBadge(m, p) {
    if (m.phase !== 'play' || m.out?.includes(p.id)) return '';
    return `<span class="cp-badge" title="Saldo">${fmt(m.cash?.[p.id] ?? 0)}</span>`;
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

  targets(m) {
    return this.ctx.renderer(m)?.pickables(this.me) || [];
  }

  setHover() {}

  click(obj, m) {
    if (!obj || m.phase === 'lobby') return;
    if (obj.userData.phoneOf) {
      if (this.playing(m)) this.setOpen(!this.open);
      return;
    }
    if (obj.userData.isBoard && this.ctx.lastHitPoint) {
      const i = this.ctx.renderer(m)?.spaceFromPoint(this.ctx.lastHitPoint);
      if (i === undefined || i < 0) return;
      if (!this.playing(m)) return this.ctx.flash(SPACES[i].name);
      this.detail = i;
      this.sig = '';
      if (!this.open) this.setOpen(true);
    }
  }
}
