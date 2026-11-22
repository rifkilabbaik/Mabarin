import * as THREE from 'three';
import { icon } from '../../ui/icons.js';
import { avatarUrl } from '../../ui/avatar.js';
import {
  SPACES, GROUPS, TOKENS, CARDS, DECK_NAME, OWNABLE, GROUP_SPACES, JAIL_FINE, fmt, groupOf, isOwnable, netWorth, buildCheck, sellCheck,
  mortgageCheck, mortgageValue, unmortgageCost, houseCost, groupHasBuildings,
} from './rules.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ORDER = ['cokelat', 'biruMuda', 'pink', 'oranye', 'merah', 'kuning', 'hijau', 'biruTua', 'util', 'rail'];
const GROUP_LABEL = { rail: 'Transportasi', util: 'Perusahaan Air & Listrik' };
const groupColor = (g) => GROUPS[g]?.color || (g === 'rail' ? '#495057' : '#868e96');
const NOTE_MS = 3000;
const PILL_MS = 2600;
const DECK_COLOR = { takdir: '#f08c1a', kebijakan: '#2f80ed' };
const OPEN_DELAY = 450; // tangan mengangkat HP dulu (pose selfie), baru layar muncul
// transaksi yang sudah punya notifikasi kartu aset (tidak dibuat baris pembayaran)
const ASSET_WHY = /^(Beli |Lelang |Bangun di |Gadai |Tebus |Nego$)/;

// ikon bidak (garis putih di lingkaran warna pemain)
const TOKEN_ICON = {
  becak: 'M4 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M16 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 16v-6h9v6M6 10c1-4 8-4 9 0M15 13l3 3',
  pinisi: 'M3 15h18l-3 4H6zM9 15V4l-5 9h5M13 15V6l5 7h-5',
  ayam: 'M8 20v-3M12 20v-3M5 12a6 5 0 0 0 12 0V8a3 3 0 0 0-6 0v2H6M14 5l1-2 1 2M18 9h3',
  ontel: 'M3 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0M15 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0M6 17l4-7h5l3 7M10 10l-1-3H7M15 10l1-3h2',
  peci: 'M5 17V9c0-2 14-2 14 0v8zM5 13h14',
  kendi: 'M9 4h6M10 4v3c-4 1-5 4-5 7a7 7 0 0 0 14 0c0-3-1-6-5-7V4M18 11l3-2',
};
const tokenIcon = (k, color) => `<span class="jg-tokic" style="--c:${color}"><svg viewBox="0 0 24 24"><path d="${TOKEN_ICON[TOKENS[k]?.id] || TOKEN_ICON.peci}"/></svg></span>`;
const BOOK = '<svg viewBox="0 0 62 44" class="jg-book"><path d="M31 8C22 2 10 2 3 5v34c7-3 19-3 28 3 9-6 21-6 28-3V5c-7-3-19-3-28 3z"/><path d="M31 8v34" class="ln"/></svg>';

/** Kartu hak milik (HTML, bentuk 1:2) lengkap dengan tabel sewa. */
function deedHtml(i, m, extra = '') {
  const sp = SPACES[i];
  const g = groupOf(i);
  const light = ['kuning', 'biruMuda'].includes(g);
  const o = m?.own?.[i];
  let rows = '';
  if (sp.type === 'prop') {
    const r = sp.rent;
    rows = [['Sewa', r[0]], ['1 rumah', r[1]], ['2 rumah', r[2]], ['3 rumah', r[3]], ['4 rumah', r[4]], ['Hotel', r[5]]]
      .map(([k, v], h) => `<tr class="${o && o.h === h && h ? 'on' : ''}"><td>${k}</td><td>${fmt(v)}</td></tr>`).join('');
  } else if (sp.type === 'rail') {
    rows = [1, 2, 3, 4].map((n) => `<tr><td>${n} transportasi</td><td>${fmt([0, 25, 50, 100, 200][n])}</td></tr>`).join('');
  } else rows = '<tr><td>1 utilitas</td><td>4× dadu</td></tr><tr><td>2 utilitas</td><td>10× dadu</td></tr>';
  const houses = o?.h ? `<div class="jg-dh">${o.h === 5 ? '<i class="ht"></i>' : '<i></i>'.repeat(o.h)}</div>` : '';
  return `<div class="jg-deed">
    <div class="jg-deed-h" style="background:${groupColor(g)};color:${light ? '#2b2118' : '#fff'}"><small>HAK MILIK</small><b>${esc(sp.name)}</b></div>
    <table>${rows}</table>${houses}<div class="jg-deed-p">${fmt(sp.price)}</div>${o?.m ? '<span class="jg-stamp red">DIGADAI</span>' : ''}${extra}</div>`;
}

/** Kartu Takdir/Kebijakan (HTML) berwarna penuh. */
function instructionHtml(deck, text) {
  return `<div class="jg-icard ${deck}"><b>${deck === 'kebijakan' ? 'KEBIJAKAN' : 'TAKDIR'}</b>${deck === 'kebijakan' ? BOOK : '<span class="q">?</span>'}<p>${esc(text)}</p></div>`;
}

/**
 * Kontrol pemain Juragan: dadu & tumpukan kartu diketuk di meja, HP (uang, beli/lelang, aset, nego/barter, mutasi),
 * notifikasi kartu & aset (atas) serta pembayaran (bawah), suara uang.
 */
export class JuraganControls {
  constructor(ctx) {
    this.ctx = ctx;
    this.open = false;
    this.tab = 'aset';
    this.detail = -1; // petak yang dilihat (atau 'j:takdir' untuk kartu bebas penjara)
    this.deal = null; // rancangan nego/barter/tawar balik
    this.sig = '';
    this.lastCash = null;
    this.lastLog = null;
    this.autoKey = '';
    this.notes = [];
    this.noteUntil = 0;
    this.pills = [];
    this.pillMore = 0;
    this.showAt = 0;
    this.turnHint = -1;
  }

  get me() {
    return this.ctx.myId;
  }

  enter() {
    const ctx = this.ctx;
    ctx.setTopView(true); // papan besar paling jelas dari atas (tombol kamera tetap bisa mengganti)
    this.btnEnd = ctx.button('check', 'Selesai giliran', () => this.act({ a: 'end' }), '', 'jg-end');
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
      <nav class="jg-tabs">${['aset', 'mutasi', 'pemain'].map((t) => `<button type="button" data-act="tab" data-tab="${t}">${{ aset: 'Aset', mutasi: 'Mutasi', pemain: 'Pemain' }[t]}</button>`).join('')}</nav>
      <div class="jg-body"></div></div>
      <button type="button" class="jg-close" data-act="close" aria-label="Tutup HP"><i></i></button></div>`;
    this.phone.addEventListener('click', (e) => this.onClick(e));
    this.note = document.createElement('div');
    this.note.className = 'jg-note';
    this.note.hidden = true;
    this.pillBox = document.createElement('div');
    this.pillBox.className = 'jg-pills';
    root.append(this.phoneBtn, this.phone, this.note, this.pillBox);
  }

  exit() {
    if (this.open) this.ctx.act({ a: 'phone', on: false });
    this.open = false;
    $('cards-ui').classList.remove('jg-open');
    for (const el of [this.phoneBtn, this.phone, this.note, this.pillBox]) el?.remove();
  }

  act(a) {
    this.ctx.act(a);
    this.ctx.audio.play('click');
  }

  // ---------- Buka / tutup HP (pose selfie → layar muncul dari HP ke tengah) ----------
  setOpen(on) {
    if (on === this.open) return;
    this.open = on;
    this.phoneBtn.classList.toggle('on', on);
    this.sig = '';
    if (on) {
      this.ctx.act({ a: 'phone', on: true });
      this.ctx.audio.play('pop');
      this.showAt = performance.now() + OPEN_DELAY;
      this.popping = true;
    } else {
      this.ctx.audio.play('click');
      this.popping = false;
      this.phone.classList.remove('pop');
      this.phone.classList.add('unpop');
      clearTimeout(this.closeT);
      this.closeT = setTimeout(() => {
        this.phone.hidden = true;
        this.phone.classList.remove('unpop');
        $('cards-ui').classList.remove('jg-open');
        if (!this.open) this.ctx.act({ a: 'phone', on: false });
      }, 220);
    }
  }

  /** Titik asal popup: HP di tangan karakter kita (diproyeksikan ke layar), atau bawah tengah. */
  popOrigin() {
    const ch = this.ctx.characterOf(this.me);
    const cam = this.ctx.camera;
    let x = window.innerWidth / 2, y = window.innerHeight;
    if (ch?.phoneMesh?.visible && ch.root.visible) {
      const v = ch.phoneMesh.getWorldPosition(new THREE.Vector3()).project(cam);
      if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1) {
        x = ((v.x + 1) / 2) * window.innerWidth;
        y = ((1 - v.y) / 2) * window.innerHeight;
      }
    }
    return { dx: x - window.innerWidth / 2, dy: y - window.innerHeight / 2 };
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
    if (r) r.view.sel = this.open && typeof this.detail === 'number' && this.detail >= 0 ? this.detail : -1;
    if ((!live || !playing) && this.open) this.setOpen(false);
    const mine = this.myTurn(m);
    this.btnEnd.hidden = !mine || m.stage !== 'act';
    const need = live && playing && this.needsPhone(m);
    this.phoneBtn.hidden = !live || !playing;
    this.phoneBtn.querySelector('.jg-dot').hidden = !need;
    if (need && need !== this.autoKey) {
      this.autoKey = need;
      this.detail = -1;
      this.deal = null;
      if (!this.open) this.setOpen(true);
    }
    if (!need) this.autoKey = '';
    // petunjuk giliran: ketuk dadu / ambil kartu
    if (mine && m.stage === 'roll' && this.turnHint !== m.rollN) {
      this.turnHint = m.rollN;
      this.ctx.flash(m.jail?.[this.me] !== undefined ? 'Di penjara: ketuk dadu cari kembar' : m.doubles > 0 ? 'Kembar! Ketuk dadu lagi' : 'Giliranmu — ketuk dadu');
    }
    // suara uang: bayar "tung ting", uang masuk "kencring"
    const cash = m.cash?.[this.me];
    if (live && cash !== undefined && this.lastCash !== null && cash !== this.lastCash) this.ctx.audio.play(cash < this.lastCash ? 'tungting' : 'kencring');
    this.lastCash = live ? (cash ?? null) : null;
    this.updatePills(m, live);
    if (this.open && this.popping && performance.now() >= this.showAt) {
      // layar muncul dari HP di tangan menuju tengah layar
      this.popping = false;
      const o = this.popOrigin();
      this.phone.style.setProperty('--ox', `${o.dx}px`);
      this.phone.style.setProperty('--oy', `${o.dy}px`);
      this.phone.hidden = false;
      this.phone.classList.remove('unpop');
      void this.phone.offsetWidth;
      this.phone.classList.add('pop');
      $('cards-ui').classList.add('jg-open');
    }
    if (this.open && !this.phone.hidden) {
      this.render(m);
      this.tickLive(m);
    }
    this.updateNote();
  }

  /** Kunci keputusan yang butuh HP (beli, lelang, tawaran, utang, penjara), atau '' bila tidak ada. */
  needsPhone(m) {
    const me = this.me;
    if (m.debt?.pid === me) return `debt${m.debt.until}`;
    if (m.offer?.to === me) return `offer${m.offer.n}`;
    if (m.auction && !m.auction.out.includes(me)) return `auction${m.auction.n}`;
    if (this.myTurn(m) && m.stage === 'buy') return `buy${m.rollN}:${m.pos[me]}`;
    if (this.myTurn(m) && m.stage === 'roll' && m.jail?.[me] !== undefined && (m.cash[me] >= JAIL_FINE || m.jfree?.[me])) return `jail${m.rollN}`;
    return '';
  }

  // ---------- Layar HP ----------
  render(m) {
    const sig = `${m.v}|${this.tab}|${this.detail}|${JSON.stringify(this.deal)}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const me = this.me;
    const p = m.players.find((x) => x.id === me);
    const cash = m.cash?.[me] ?? 0;
    const now = new Date();
    this.phone.querySelector('.jg-clock').textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.phone.querySelector('.jg-head').innerHTML = `
      <div class="jg-avwrap"><img class="jg-av" src="${avatarUrl(p?.look, p?.color)}" alt="">${tokenIcon(m.tok?.[me] ?? 0, p?.color)}</div>
      <b class="jg-name">${esc(p?.name)}</b><span class="jg-tokname">${esc(TOKENS[m.tok?.[me] ?? 0]?.name)}</span>
      <div class="jg-saldo${cash < 0 ? ' neg' : ''}">${fmt(cash)}</div>
      <div class="jg-worth">Kekayaan ${fmt(netWorth(cash, m.own || {}, me))}${m.jfree?.[me] ? ` · ${m.jfree[me]} kartu bebas penjara` : ''}${m.jail?.[me] !== undefined ? ' · <b>di penjara</b>' : ''}</div>`;
    this.phone.querySelector('.jg-alert').innerHTML = this.deal ? '' : this.alertHtml(m);
    const inSub = this.deal || this.detail !== -1;
    this.phone.querySelectorAll('.jg-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab && !inSub));
    this.phone.querySelector('.jg-body').innerHTML = this.deal ? this.dealHtml(m) : this.detail !== -1 ? this.detailHtml(m, this.detail) : this[`${this.tab}Html`](m);
  }

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

  player(m, id) {
    return m.players.find((p) => p.id === id);
  }

  avatar(m, id, cls = '') {
    const p = this.player(m, id);
    return p ? `<img class="jg-mav ${cls}" src="${avatarUrl(p.look, p.color)}" alt="" style="--c:${p.color}">` : '';
  }

  alertHtml(m) {
    const me = this.me;
    const timer = '<div class="jg-timer"><i></i><b></b></div>';
    if (m.debt?.pid === me) {
      return `<div class="jg-card warn"><h4>${icon('flag')}Uangmu kurang ${fmt(-m.cash[me])}</h4>
        <p>Jual bangunan atau gadai kartu (ketuk kartumu di bawah) sampai saldo tidak minus. Utang ke ${esc(this.name(m, m.debt.to))}.</p>${timer}
        <div class="jg-row"><button type="button" class="jg-btn danger" data-act="bankrupt">Nyatakan bangkrut</button></div></div>`;
    }
    if (m.offer?.to === me) {
      const o = m.offer;
      return `<div class="jg-card hot"><h4>${this.avatar(m, o.from)}${o.round ? 'Tawar balik' : o.kind === 'barter' ? 'Barter' : 'Nego'} dari ${esc(this.name(m, o.from))}</h4>${this.offerSummary(m, o, true)}${timer}
        <div class="jg-row"><button type="button" class="jg-btn" data-act="reject">Tolak</button><button type="button" class="jg-btn" data-act="counter">Tawar balik</button><button type="button" class="jg-btn primary" data-act="accept">Terima</button></div></div>`;
    }
    if (m.auction) {
      const a = m.auction;
      const out = a.out.includes(me);
      const high = a.by === me;
      const cash = m.cash[me];
      const bidBtn = (d) => `<button type="button" class="jg-btn" data-act="bid" data-amt="${a.bid + d}" ${a.bid + d > cash || out ? 'disabled' : ''}>+${d}</button>`;
      return `<div class="jg-card hot"><h4>${icon('hammer')}Lelang</h4><div class="jg-auc"><div class="jg-mini">${deedHtml(a.i, m)}</div>
        <div><small>Tawaran tertinggi</small><b class="jg-big">${fmt(a.bid)}</b><span>${a.by ? `${this.avatar(m, a.by, 'sm')} ${esc(this.name(m, a.by))}` : 'belum ada'}</span></div></div>${timer}
        ${out ? '<p class="jg-muted">Kamu sudah lewat.</p>' : high ? '<p class="jg-ok">Kamu penawar tertinggi.</p>' : `<div class="jg-row">${bidBtn(10)}${bidBtn(50)}${bidBtn(100)}<button type="button" class="jg-btn" data-act="pass">Lewat</button></div>`}</div>`;
    }
    if (this.myTurn(m) && m.stage === 'buy') {
      const i = m.pos[me];
      const price = SPACES[i].price;
      return `<div class="jg-card hot"><h4>${icon('crown')}Beli ${esc(SPACES[i].name)}?</h4><div class="jg-buy">${deedHtml(i, m)}</div>
        <div class="jg-row"><button type="button" class="jg-btn" data-act="noBuy">Lelang</button><button type="button" class="jg-btn primary" data-act="buy" ${m.cash[me] < price ? 'disabled' : ''}>Beli ${fmt(price)}</button></div></div>`;
    }
    if (this.myTurn(m) && m.stage === 'roll' && m.jail?.[me] !== undefined) {
      return `<div class="jg-card"><h4>${icon('flag')}Kamu di penjara (percobaan ${m.jail[me] + 1}/3)</h4><p>Ketuk dadu untuk mencari kembar, atau:</p>
        <div class="jg-row"><button type="button" class="jg-btn" data-act="payJail" ${m.cash[me] < JAIL_FINE ? 'disabled' : ''}>Bayar ${fmt(JAIL_FINE)}</button>
        <button type="button" class="jg-btn" data-act="useCard" ${m.jfree?.[me] ? '' : 'disabled'}>Pakai kartu bebas</button></div></div>`;
    }
    if (m.offer?.from === me) return `<div class="jg-card"><h4>${icon('hourglass')}Menunggu jawaban ${esc(this.name(m, m.offer.to))}</h4>${this.offerSummary(m, m.offer, false)}${timer}
      <div class="jg-row"><button type="button" class="jg-btn" data-act="cancel">Batalkan</button></div></div>`;
    return '';
  }

  sideHtml(m, x) {
    const parts = [];
    if (x.c) parts.push(`<b>${fmt(x.c)}</b>`);
    for (const i of x.p) parts.push(`<span class="jg-chip" style="--c:${groupColor(groupOf(i))}">${esc(SPACES[i].name)}${m.own?.[i]?.m ? ' (gadai)' : ''}</span>`);
    if (x.j) parts.push(`<span class="jg-chip" style="--c:#f08c1a">${x.j} kartu bebas penjara</span>`);
    return parts.join(' ') || '<i>—</i>';
  }

  offerSummary(m, o, forMe) {
    return `<div class="jg-offer"><div><small>${forMe ? 'Kamu dapat' : `${esc(this.name(m, o.to))} dapat`}</small>${this.sideHtml(m, o.give)}</div>
      <div><small>${forMe ? 'Kamu beri' : 'Kamu dapat'}</small>${this.sideHtml(m, o.get)}</div></div>`;
  }

  // ---------- Tab Aset: galeri kartu, 1 set per baris (termurah → termahal) ----------
  galleryCard(m, i) {
    const me = this.me;
    const o = m.own?.[i];
    const sp = SPACES[i];
    const g = groupOf(i);
    let cls = '', stamp = '';
    if (o?.by === me) {
      cls = 'own';
      if (o.m) stamp = '<span class="jg-stamp red">DIGADAI</span>';
    } else if (o) {
      const p = this.player(m, o.by);
      cls = 'dark';
      stamp = `<span class="jg-stamp" style="--s:${p?.color || '#e03131'}">DIMILIKI<small>${esc(this.name(m, o.by))}</small></span>`;
    } else {
      cls = 'dark';
      stamp = '<span class="jg-stamp" style="--s:#2b9a48">TERSEDIA</span>';
    }
    const b = o?.h ? `<span class="jg-gh">${o.h === 5 ? '<i class="ht"></i>' : '<i></i>'.repeat(o.h)}</span>` : '';
    const light = ['kuning', 'biruMuda'].includes(g);
    return `<button type="button" class="jg-gc ${cls}" data-act="card" data-i="${i}"><span class="jg-gc-h" style="background:${groupColor(g)};color:${light ? '#2b2118' : '#fff'}"></span>
      <span class="jg-gc-n">${esc(sp.name)}</span>${b}<span class="jg-gc-p">${fmt(sp.price)}</span>${stamp}</button>`;
  }

  jailCard(m, deck) {
    const holder = m.jhold?.[deck];
    let cls = 'dark', stamp = '<span class="jg-stamp" style="--s:#6c737d">DI TUMPUKAN</span>';
    if (holder === this.me) {
      cls = 'own';
      stamp = '';
    } else if (holder) stamp = `<span class="jg-stamp" style="--s:${this.player(m, holder)?.color || '#e03131'}">DIMILIKI<small>${esc(this.name(m, holder))}</small></span>`;
    return `<button type="button" class="jg-gc jail ${cls} ${deck}" data-act="jcard" data-deck="${deck}"><span class="jg-gc-n">BEBAS PENJARA</span><span class="jg-gc-p">${DECK_NAME[deck]}</span>${stamp}</button>`;
  }

  asetHtml(m) {
    let html = '';
    for (const g of ORDER) {
      const mine = GROUP_SPACES[g].filter((i) => m.own?.[i]?.by === this.me).length;
      html += `<div class="jg-gr-h">${esc(GROUPS[g]?.name || GROUP_LABEL[g])}<span>${mine}/${GROUP_SPACES[g].length}</span></div>
        <div class="jg-gr">${[...GROUP_SPACES[g]].sort((a, b) => SPACES[a].price - SPACES[b].price || a - b).map((i) => this.galleryCard(m, i)).join('')}</div>`;
    }
    html += `<div class="jg-gr-h">Bebas Penjara</div><div class="jg-gr">${this.jailCard(m, 'takdir')}${this.jailCard(m, 'kebijakan')}</div>`;
    return html;
  }

  detailHtml(m, key) {
    const me = this.me;
    const back = `<button type="button" class="jg-back" data-act="back">${icon('arrowRight')}Kembali</button>`;
    if (typeof key === 'string') {
      // kartu bebas penjara milik pemain lain → nego / barter
      const deck = key.slice(2);
      const holder = m.jhold?.[deck];
      return `${back}<div class="jg-card"><h4>Kartu Bebas Penjara (${DECK_NAME[deck]})</h4><p>Dipegang ${esc(this.name(m, holder))}.</p>
        <div class="jg-row"><button type="button" class="jg-btn" data-act="deal" data-kind="barter" data-j="1">Barter</button><button type="button" class="jg-btn primary" data-act="deal" data-kind="nego" data-j="1">Nego</button></div></div>`;
    }
    const i = key;
    const sp = SPACES[i];
    if (!isOwnable(i)) {
      const info = { go: 'Terima $200 setiap lewat atau berhenti di sini.', jail: 'Cuma mampir, atau tempat tahanan.', free: 'Petak istirahat, tidak terjadi apa-apa.', gojail: 'Langsung masuk penjara!', tax: `Bayar ${fmt(sp.amount || 0)} ke bank.`, takdir: 'Ambil kartu Takdir.', kebijakan: 'Ambil kartu Kebijakan.' }[sp.type];
      return `${back}<div class="jg-card"><h4>${esc(sp.name)}</h4><p>${info}</p></div>`;
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
    } else if (o && m.phase === 'play' && !m.out?.includes(o.by)) {
      const blocked = groupHasBuildings(m.own, groupOf(i));
      btns = blocked
        ? '<p class="jg-muted">Ada bangunan di kelompok ini — tidak bisa ditukar.</p>'
        : `<div class="jg-row"><button type="button" class="jg-btn" data-act="deal" data-kind="barter" data-i="${i}">Barter</button><button type="button" class="jg-btn primary" data-act="deal" data-kind="nego" data-i="${i}">Nego</button></div>`;
    } else if (!o) btns = '<p class="jg-muted">Tersedia: berhenti di petak ini untuk membeli.</p>';
    const owner = o ? `${this.avatar(m, o.by, 'sm')}Pemilik: <b>${esc(this.name(m, o.by))}</b>` : 'Belum dimiliki';
    return `${back}<div class="jg-detail">${deedHtml(i, m)}</div><p class="jg-owner">${owner}</p>${btns}`;
  }

  // ---------- Nego / barter / tawar balik ----------
  dealHtml(m) {
    const me = this.me;
    const d = this.deal;
    const tradable = (pid) => OWNABLE.filter((i) => m.own?.[i]?.by === pid && !groupHasBuildings(m.own, groupOf(i)));
    const chips = (pid, side) => {
      const ps = tradable(pid);
      if (!ps.length) return '<p class="jg-muted">Tidak ada kartu yang bisa ditukar.</p>';
      return ps.map((i) => `<button type="button" class="jg-chip pick${d[side].p.includes(i) ? ' on' : ''}" style="--c:${groupColor(groupOf(i))}" data-act="dtog" data-side="${side}" data-i="${i}">${esc(SPACES[i].name)}${m.own[i].m ? ' (gadai)' : ''}</button>`).join('');
    };
    const money = (side, max) => `<div class="jg-cash"><button type="button" data-act="dcash" data-side="${side}" data-d="-50">−50</button><button type="button" data-act="dcash" data-side="${side}" data-d="-10">−10</button>
      <b>${fmt(d[side].c)}</b><button type="button" data-act="dcash" data-side="${side}" data-d="10">+10</button><button type="button" data-act="dcash" data-side="${side}" data-d="50">+50</button></div>
      <small class="jg-muted">maks ${fmt(Math.max(0, max))}</small>`;
    const jail = (side, n) => (n ? `<button type="button" class="jg-chip pick${d[side].j ? ' on' : ''}" style="--c:#f08c1a" data-act="djail" data-side="${side}">Kartu bebas penjara</button>` : '');
    const empty = !d.give.c && !d.give.p.length && !d.give.j && !d.get.c && !d.get.p.length && !d.get.j;
    const title = d.counter ? 'Tawar balik ke' : d.kind === 'barter' ? 'Barter dengan' : 'Nego dengan';
    return `<button type="button" class="jg-back" data-act="dcancel">${icon('arrowRight')}Batal</button>
      <div class="jg-deal"><h4>${this.avatar(m, d.to)}${title} ${esc(this.name(m, d.to))}</h4>
      <h5>Kamu minta</h5>${money('get', m.cash[d.to])}<div class="jg-chips">${chips(d.to, 'get')}${jail('get', m.jfree?.[d.to])}</div>
      <h5>Kamu beri</h5>${money('give', m.cash[me])}<div class="jg-chips">${chips(me, 'give')}${jail('give', m.jfree?.[me])}</div>
      <div class="jg-row"><button type="button" class="jg-btn primary" data-act="dsend" ${empty || m.auction ? 'disabled' : ''}>${d.counter ? 'Kirim tawar balik' : 'Kirim tawaran'}</button></div></div>`;
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
        return `<li class="${out ? 'out' : ''}"><span class="jg-avwrap sm"><img class="jg-av" src="${avatarUrl(p.look, p.color)}" alt="">${tokenIcon(m.tok?.[p.id] ?? 0, p.color)}</span><span class="nm"><b>${esc(this.name(m, p.id))}</b>
          <small>${esc(TOKENS[m.tok?.[p.id] ?? 0]?.name)} · ${n} kartu${m.jail?.[p.id] !== undefined ? ' · penjara' : ''}${out ? ' · bangkrut' : ''}</small></span>
          <span class="cash"><b>${fmt(cash)}</b><small>kekayaan ${fmt(netWorth(cash, m.own || {}, p.id))}</small></span></li>`;
      })
      .join('')}</ul><p class="jg-muted">Bank: ${m.bank?.h ?? 32} rumah · ${m.bank?.H ?? 12} hotel tersisa${m.endsAt ? ` · sisa waktu ${Math.max(0, Math.ceil((m.endsAt - Date.now()) / 60000))} menit` : ''}</p>`;
  }

  // ---------- Klik di HP ----------
  startDeal(m, to, kind, getP = [], getJ = 0, counter = false) {
    const price = getP.reduce((a, i) => a + SPACES[i].price, 0);
    this.deal = { to, kind, counter, give: { c: kind === 'nego' ? Math.min(price || 50, Math.max(0, m.cash[this.me])) : 0, p: [], j: 0 }, get: { c: 0, p: getP, j: getJ } };
  }

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
        this.deal = null;
        break;
      case 'card': this.detail = i; break;
      case 'jcard': {
        const holder = m.jhold?.[b.dataset.deck];
        if (!holder || holder === this.me) return;
        this.detail = `j:${b.dataset.deck}`;
        break;
      }
      case 'back': this.detail = -1; break;
      case 'deal': {
        const kind = b.dataset.kind;
        if (b.dataset.j) this.startDeal(m, m.jhold[this.detail.slice(2)], kind, [], 1);
        else this.startDeal(m, m.own[i].by, kind, [i]);
        break;
      }
      case 'counter': {
        // tawar balik: isi tawaran dibalik, lalu bisa diubah
        const o = m.offer;
        this.deal = { to: o.from, kind: o.kind, counter: true, give: { ...o.get, p: [...o.get.p] }, get: { ...o.give, p: [...o.give.p] } };
        break;
      }
      case 'dcancel': this.deal = null; break;
      case 'dtog': {
        const s = this.deal[b.dataset.side];
        s.p = s.p.includes(i) ? s.p.filter((x) => x !== i) : [...s.p, i];
        break;
      }
      case 'dcash': {
        const side = b.dataset.side;
        const max = Math.max(0, m?.cash?.[side === 'give' ? this.me : this.deal.to] ?? 0);
        this.deal[side].c = Math.max(0, Math.min(max, this.deal[side].c + +b.dataset.d));
        break;
      }
      case 'djail': {
        const s = this.deal[b.dataset.side];
        s.j = s.j ? 0 : 1;
        break;
      }
      case 'dsend': {
        const d = this.deal;
        this.act({ a: d.counter ? 'counter' : 'offer', to: d.to, give: d.give, get: d.get, kind: d.kind });
        this.deal = null;
        this.detail = -1;
        break;
      }
      case 'bid': return this.act({ a: 'bid', amt: +b.dataset.amt });
      case 'build': case 'sell': case 'mort': case 'unmort':
        return this.act({ a, i });
      default:
        return this.act({ a });
    }
    this.sig = '';
    this.ctx.audio.play('click');
  }

  // ---------- Notifikasi ----------
  /** Notifikasi kartu (Takdir/Kebijakan/aset) di atas tengah layar, bergiliran. */
  pushNote(html) {
    this.notes.push(html);
    if (this.notes.length > 4) this.notes.shift();
  }

  updateNote() {
    const now = performance.now();
    if (now < this.noteUntil) return;
    const next = this.notes.shift();
    if (!next) {
      this.note.hidden = true;
      return;
    }
    this.note.innerHTML = next;
    this.note.hidden = false;
    this.note.classList.remove('show');
    void this.note.offsetWidth;
    this.note.classList.add('show');
    this.noteUntil = now + NOTE_MS;
  }

  caption(m, who, text) {
    return `<div class="jg-cap"><div class="p">${who}</div><small>${text}</small></div>`;
  }

  person(m, id) {
    return `${this.avatar(m, id)}<b>${esc(this.name(m, id))}</b>`;
  }

  /** Baris pembayaran simpel (bawah tengah) dari mutasi uang terbaru. */
  updatePills(m, live) {
    const log = live ? m.log || [] : [];
    const last = log.length ? log[log.length - 1].n : 0;
    if (this.lastLog === null || !live) this.lastLog = last;
    for (const l of log) {
      if (l.n <= this.lastLog) continue;
      if (ASSET_WHY.test(l.why)) continue;
      const pid = l.from || l.to;
      const mine = l.to === this.me ? 'in' : l.from === this.me ? 'out' : '';
      const amt = l.from && l.to ? fmt(l.amt) : l.from ? `−${fmt(l.amt)}` : `+${fmt(l.amt)}`;
      const who = l.from && l.to ? `${esc(this.name(m, l.from))} → ${esc(this.name(m, l.to))}` : esc(this.name(m, pid));
      this.pills.push({ html: `${this.avatar(m, pid)}<span>${who} · ${esc(l.why)}</span><b class="${mine || (l.from && !l.to ? 'out' : l.to && !l.from ? 'in' : '')}">${amt}</b>`, until: 0 });
    }
    this.lastLog = Math.max(this.lastLog, last);
    const now = performance.now();
    // tampilkan maks. 3 sekaligus; sisanya digabung "+n lainnya"
    let shown = this.pills.filter((p) => p.until > now);
    while (shown.length < 3) {
      const next = this.pills.find((p) => !p.until);
      if (!next) break;
      next.until = now + PILL_MS + shown.length * 250;
      shown.push(next);
    }
    this.pills = this.pills.filter((p) => !p.until || p.until > now);
    const waiting = this.pills.filter((p) => !p.until).length;
    const sig = shown.map((p) => p.until).join() + `|${waiting}`;
    if (sig === this.pillSig) return;
    this.pillSig = sig;
    this.pillBox.innerHTML = shown.map((p) => `<div class="jg-pill">${p.html}</div>`).join('') + (waiting ? `<div class="jg-pill more">+${waiting} lainnya</div>` : '');
  }

  onEvent(ev, m) {
    const flash = (t) => this.ctx.flash(t);
    const N = (id) => this.name(m, id);
    switch (ev.k) {
      case 'card':
        this.pushNote(`${instructionHtml(ev.deck, CARDS[ev.deck][ev.id].text)}${this.caption(m, this.person(m, ev.p), `mendapat kartu ${DECK_NAME[ev.deck]}`)}`);
        break;
      case 'buy':
        this.pushNote(`${deedHtml(ev.i, m)}${this.caption(m, this.person(m, ev.p), `membeli · <b class="out">−${fmt(ev.amt)}</b>`)}`);
        break;
      case 'sold':
        this.pushNote(`${deedHtml(ev.i, m)}${this.caption(m, this.person(m, ev.p), `menang lelang · <b class="out">−${fmt(ev.amt)}</b>`)}`);
        break;
      case 'mort':
        this.pushNote(`${deedHtml(ev.i, m)}${this.caption(m, this.person(m, ev.p), `menggadai · <b class="in">+${fmt(mortgageValue(ev.i))}</b>`)}`);
        break;
      case 'unmort':
        this.pushNote(`${deedHtml(ev.i, m)}${this.caption(m, this.person(m, ev.p), `menebus · <b class="out">−${fmt(unmortgageCost(ev.i))}</b>`)}`);
        break;
      case 'build':
        this.pushNote(`${deedHtml(ev.i, m)}${this.caption(m, this.person(m, ev.p), `membangun ${ev.h === 5 ? 'hotel' : `rumah ke-${ev.h}`} · <b class="out">−${fmt(houseCost(ev.i))}</b>`)}`);
        break;
      case 'trade': {
        // kartu yang pindah tangan (yang pertama ditampilkan), detail di bawah
        const moved = [...ev.give.p.map((i) => [i, ev.p, ev.to]), ...ev.get.p.map((i) => [i, ev.to, ev.p])];
        const how = ev.kind === 'barter' ? 'barter' : 'nego';
        const who = `${this.person(m, ev.p)}<span class="arr">⇄</span>${this.person(m, ev.to)}`;
        if (moved.length) {
          const [i, from, to] = moved[0];
          this.pushNote(`${deedHtml(i, m)}${this.caption(m, who, `pindah tangan (${how}): ${esc(N(from))} → ${esc(N(to))}${moved.length > 1 ? ` · +${moved.length - 1} kartu lain` : ''}`)}`);
        } else this.pushNote(this.caption(m, who, `sepakat ${how}`));
        break;
      }
      case 'bankrupt': flash(`${N(ev.p)} bangkrut!`); break;
      case 'auction': flash(`Lelang ${SPACES[ev.i].name}!`); break;
      case 'nosale': flash('Lelang tanpa penawar'); break;
      case 'jail': flash(`${N(ev.p)} masuk penjara!`); break;
      case 'free': flash(`${N(ev.p)} keluar dari penjara`); break;
      case 'mustDraw': if (ev.p === this.me) flash(`Ambil kartu ${DECK_NAME[ev.deck]} di tengah papan`); break;
      case 'debt': if (ev.p !== this.me) flash(`${N(ev.p)} kekurangan uang`); break;
      case 'offer': if (ev.to === this.me) this.ctx.audio.play('buzz'); break;
      case 'reject': if (ev.to === this.me) flash(ev.timeout ? 'Tawaran tidak dijawab' : `${N(ev.p)} menolak tawaranmu`); break;
      case 'deny': if (ev.p === this.me) flash(ev.msg); break;
      case 'roll':
        if (ev.triple) flash('Tiga kali kembar — masuk penjara!');
        else if (ev.stay) flash(`${N(ev.p)} tetap di penjara`);
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
      return `<button type="button" data-tok="${k}" class="${o?.id === me ? 'on' : ''}" ${o && o.id !== me ? 'disabled' : ''}>${tokenIcon(k, o?.color || '#868e96')}<b>${esc(t.name)}</b>${o ? `<small style="color:${o.color}">${esc(o.id === me ? 'kamu' : o.name)}</small>` : '<small>kosong</small>'}</button>`;
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
    return this.ctx.renderer(m)?.pickables(this.me, m) || [];
  }

  setHover() {}

  click(obj, m) {
    if (!obj || m.phase === 'lobby') return;
    const d = obj.userData;
    if (d.dice) return this.act({ a: 'roll' });
    if (d.deck) return this.act({ a: 'draw' });
    if (d.phoneOf) {
      if (this.playing(m)) this.setOpen(!this.open);
      return;
    }
    if (d.isBoard && this.ctx.lastHitPoint) {
      const i = this.ctx.renderer(m)?.spaceFromPoint(this.ctx.lastHitPoint);
      if (i === undefined || i < 0) return;
      if (!this.playing(m)) return this.ctx.flash(SPACES[i].name);
      this.detail = i;
      this.deal = null;
      this.sig = '';
      if (!this.open) this.setOpen(true);
    }
  }
}
