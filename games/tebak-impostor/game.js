/* =========================================================
   MABARIN - Tebak Impostor
   Alur: lobi -> lihat kata (bergiliran) -> diskusi + roda giliran
         -> voting -> hasil & poin -> lobi (papan skor)
   ========================================================= */
(function () {
  'use strict';

  var MIN_PLAYERS = 3;
  var MAX_PLAYERS = 10;
  var CREW_POINTS = 1;      // tiap crew dapat poin ini kalau tebakan benar
  var IMPOSTOR_POINTS = 2;  // impostor dapat poin ini kalau lolos
  var STORE_KEY = 'mabarin:impostor';
  var SHARED_KEY = 'mabarin:settings';

  var COLORS = ['#ff5f57', '#12aef0', '#6cc33f', '#ffbb2c', '#c26bf0', '#f45ca2', '#ff8a3d', '#1fc7a6', '#8f9cff', '#c49a6c'];
  var WORDS = window.IMPOSTOR_WORDS || [];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- Penyimpanan ---------------- */
  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; }
  }
  function writeJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* mode privat */ }
  }

  var shared = readJson(SHARED_KEY);
  if (shared.sound === undefined) shared.sound = true;
  if (shared.vibrate === undefined) shared.vibrate = true;
  document.documentElement.setAttribute('data-theme', shared.dark ? 'dark' : 'light');

  var store = readJson(STORE_KEY);
  if (!Array.isArray(store.players) || store.players.length < MIN_PLAYERS) {
    var base = Array.isArray(shared.players) ? shared.players : [];
    store.players = [0, 1, 2].map(function (i) {
      return { name: (base[i] && String(base[i]).trim()) || ('Pemain ' + (i + 1)), score: 0 };
    });
  }
  if (!Array.isArray(store.cats)) store.cats = WORDS.map(function (w) { return w.c; });
  if (!store.used || typeof store.used !== 'object') store.used = {};
  delete store.showCat;
  // mode 'word'  : crew & impostor sama-sama dapat kata (kata impostor mirip)
  // mode 'blind' : impostor tidak dapat kata, hanya kategori
  if (store.mode !== 'word' && store.mode !== 'blind') store.mode = 'word';
  function save() { writeJson(STORE_KEY, store); }

  /* ---------------- Suara & getaran ---------------- */
  var audioCtx = null;
  function tone(freq, dur, type, vol, slide) {
    if (!shared.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t = audioCtx.currentTime;
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
      g.gain.setValueAtTime(vol || 0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + dur);
    } catch (e) { /* tidak didukung */ }
  }
  function buzz(p) { if (shared.vibrate && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { /* abaikan */ } } }
  var sfx = {
    tap: function () { tone(520, 0.08, 'triangle', 0.15, 1.5); buzz(10); },
    tick: function () { tone(1100, 0.03, 'square', 0.05); },
    reveal: function () { tone(440, 0.12, 'sine', 0.15, 2); buzz(20); },
    pick: function () { tone(660, 0.1, 'triangle', 0.18); setTimeout(function () { tone(990, 0.18, 'triangle', 0.18); }, 110); buzz([30, 40, 30]); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { tone(f, 0.18, 'triangle', 0.16); }, i * 110); }); buzz([40, 60, 40]); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { setTimeout(function () { tone(f, 0.25, 'sawtooth', 0.08); }, i * 160); }); buzz(200); }
  };

  /* ---------------- Helper UI ---------------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function show(id) {
    $$('.screen').forEach(function (s) { s.classList.toggle('is-active', s.id === 's-' + id); });
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', id === 'lobby' ? '#2c2f57' : id === 'settings' ? '#ffffff' : '#3b3f6e');
  }
  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-show'); }, 2200);
  }
  function modal(o) {
    $('#modal-title').textContent = o.title || '';
    $('#modal-text').innerHTML = o.html || esc(o.text || '');
    var box = $('#modal-actions');
    box.innerHTML = '';
    (o.buttons || [{ label: 'OKE', cls: 'btn--dark' }]).forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'btn ' + (b.cls || 'btn--dark');
      btn.textContent = b.label;
      btn.addEventListener('click', function () { closeModal(); if (b.onClick) b.onClick(); });
      box.appendChild(btn);
    });
    $('#modal').classList.add('is-open');
    $('#modal').setAttribute('aria-hidden', 'false');
  }
  function closeModal() {
    $('#modal').classList.remove('is-open');
    $('#modal').setAttribute('aria-hidden', 'true');
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ================= LOBI ================= */
  var editing = -1;
  var ICON_EDIT = '<svg viewBox="0 0 32 32"><path d="M6 26l1.5-6L21 6.5a2.1 2.1 0 0 1 3 0l1.5 1.5a2.1 2.1 0 0 1 0 3L12 24.5z" fill="#ffd43b" stroke="#333" stroke-width="1.6" stroke-linejoin="round"/><path d="M19 8.5l4.5 4.5" stroke="#333" stroke-width="1.6"/><path d="M21 6.5a2.1 2.1 0 0 1 3 0l1.5 1.5a2.1 2.1 0 0 1 0 3L24 12.5 19.5 8z" fill="#ff8f8f" stroke="#333" stroke-width="1.6" stroke-linejoin="round"/><path d="M6 26l1.5-6 4.5 4.5z" fill="#f4d4a8" stroke="#333" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  var ICON_TRASH = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="#1f2430" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#1f2430" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function hasScores() { return store.players.some(function (p) { return p.score > 0; }); }

  function renderLobby() {
    var scores = hasScores();
    $('#player-list').innerHTML = store.players.map(function (p, i) {
      var c = COLORS[i % COLORS.length];
      if (i === editing) {
        return '<div class="player" style="--c:' + c + '">' +
          '<input class="player__input" id="name-input" maxlength="14" value="' + esc(p.name) + '" aria-label="Nama pemain ' + (i + 1) + '" enterkeyhint="done" autocomplete="off">' +
          (store.players.length > MIN_PLAYERS ? '<button class="player__icon" data-del="' + i + '" aria-label="Hapus pemain">' + ICON_TRASH + '</button>' : '') +
          '<button class="player__icon" data-save="' + i + '" aria-label="Simpan nama">' + ICON_OK + '</button>' +
        '</div>';
      }
      return '<div class="player" style="--c:' + c + '">' +
        '<button class="player__name" data-edit="' + i + '">' + esc(p.name) + '</button>' +
        (scores ? '<span class="player__score" aria-label="Skor">' + p.score + '</span>' : '') +
        '<button class="player__icon" data-edit="' + i + '" aria-label="Ubah nama ' + esc(p.name) + '">' + ICON_EDIT + '</button>' +
      '</div>';
    }).join('');

    $('#add-player').hidden = store.players.length >= MAX_PLAYERS;
    $('#reset-score').hidden = !scores;

    var input = $('#name-input');
    if (input) { input.focus(); input.select(); }
  }

  function commitEdit() {
    var input = $('#name-input');
    if (!input || editing < 0) return;
    var v = input.value.trim().replace(/\s+/g, ' ');
    if (v) store.players[editing].name = v;
    editing = -1;
    save();
    renderLobby();
  }

  $('#player-list').addEventListener('click', function (e) {
    var t = e.target.closest('[data-edit],[data-del],[data-save]');
    if (!t) return;
    sfx.tap();
    if (t.hasAttribute('data-edit')) {
      if (editing >= 0) commitEdit();
      editing = +t.getAttribute('data-edit');
      renderLobby();
    } else if (t.hasAttribute('data-save')) {
      commitEdit();
    } else {
      var i = +t.getAttribute('data-del');
      store.players.splice(i, 1);
      editing = -1;
      save();
      renderLobby();
    }
  });
  $('#player-list').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.id === 'name-input') commitEdit();
    if (e.key === 'Escape' && e.target.id === 'name-input') { editing = -1; renderLobby(); }
  });
  $('#player-list').addEventListener('focusout', function (e) {
    if (e.target.id !== 'name-input') return;
    // tunda sedikit agar klik tombol hapus/simpan sempat terbaca
    setTimeout(function () {
      var a = document.activeElement;
      if (editing >= 0 && !(a && a.closest && a.closest('[data-del],[data-save]'))) commitEdit();
    }, 150);
  });

  $('#add-player').addEventListener('click', function () {
    if (store.players.length >= MAX_PLAYERS) return;
    sfx.tap();
    if (editing >= 0) commitEdit();
    var n = store.players.length;
    var base = Array.isArray(shared.players) ? shared.players : [];
    var name = (base[n] && String(base[n]).trim()) || ('Pemain ' + (n + 1));
    store.players.push({ name: name, score: 0 });
    save();
    renderLobby();
    var list = $('.lobby__body');
    list.scrollTop = list.scrollHeight;
  });

  $('#reset-score').addEventListener('click', function () {
    sfx.tap();
    modal({
      title: 'Reset Skor?',
      text: 'Skor semua pemain akan kembali ke 0.',
      buttons: [
        { label: 'BATAL', cls: 'btn--soft' },
        { label: 'RESET', cls: 'btn--red', onClick: function () { store.players.forEach(function (p) { p.score = 0; }); save(); renderLobby(); } }
      ]
    });
  });

  $('#play').addEventListener('click', function () {
    sfx.tap();
    if (editing >= 0) commitEdit();
    if (store.players.length < MIN_PLAYERS) { toast('Minimal ' + MIN_PLAYERS + ' pemain'); return; }
    if (!store.cats.length) { toast('Pilih minimal 1 kategori kata'); show('settings'); renderSettings(); return; }
    startRound();
  });

  /* ================= RONDE ================= */
  var round = null;

  function pickPair() {
    var pool = [];
    WORDS.forEach(function (cat) {
      if (store.cats.indexOf(cat.c) === -1) return;
      cat.p.forEach(function (pair, i) { pool.push({ key: cat.c + '|' + i, cat: cat.c, pair: pair }); });
    });
    var fresh = pool.filter(function (x) { return !store.used[x.key]; });
    if (!fresh.length) {
      // semua kata di kategori terpilih sudah dipakai: mulai ulang
      pool.forEach(function (x) { delete store.used[x.key]; });
      fresh = pool;
    }
    var pick = fresh[Math.floor(Math.random() * fresh.length)];
    store.used[pick.key] = 1;
    save();
    return pick;
  }

  function startRound() {
    var pick = pickPair();
    var flip = Math.random() < 0.5;
    round = {
      category: pick.cat,
      crewWord: flip ? pick.pair[1] : pick.pair[0],
      impWord: flip ? pick.pair[0] : pick.pair[1],
      impostor: Math.floor(Math.random() * store.players.length),
      revealIdx: 0,
      pool: [],
      order: [],
      voted: -1
    };
    showReveal();
  }

  function wordFor(i) { return i === round.impostor ? round.impWord : round.crewWord; }

  /* ---------- Lihat kata ---------- */
  function showReveal() {
    var i = round.revealIdx;
    var p = store.players[i];
    var screen = $('#s-reveal');
    screen.style.setProperty('--c', COLORS[i % COLORS.length]);
    $('#reveal-name').textContent = p.name;
    $('#reveal-panel').classList.remove('is-open');
    var blindImp = store.mode === 'blind' && i === round.impostor;
    $('#reveal-word').innerHTML = blindImp
      ? '<span class="reveal__imp">KAMU IMPOSTOR!</span><small>Kategori: ' + esc(round.category) + '</small>'
      : esc(wordFor(i));
    $('#reveal-next').hidden = true;
    var last = i === store.players.length - 1;
    $('#reveal-next').textContent = last ? 'MULAI DISKUSI' : 'SUDAH';
    $('#reveal-pass').textContent = '';
    show('reveal');
  }

  $('#reveal-panel').addEventListener('click', function () {
    var panel = $('#reveal-panel');
    var open = !panel.classList.contains('is-open');
    panel.classList.toggle('is-open', open);
    if (open) {
      sfx.reveal();
      var i = round.revealIdx;
      var last = i === store.players.length - 1;
      $('#reveal-next').hidden = false;
      $('#reveal-pass').textContent = last
        ? 'Semua sudah lihat kata. Taruh HP di tengah!'
        : 'Tutup lalu oper ke ' + store.players[i + 1].name;
    } else {
      sfx.tap();
    }
  });

  $('#reveal-next').addEventListener('click', function () {
    sfx.tap();
    if (round.revealIdx < store.players.length - 1) {
      round.revealIdx++;
      showReveal();
    } else {
      startDiscussion();
    }
  });

  /* ---------- Diskusi + roda ---------- */
  var canvas = $('#wheel-canvas');
  var ctx = canvas.getContext('2d');
  var wheelRot = 0;
  var spinning = false;

  function startDiscussion() {
    round.pool = store.players.map(function (_, i) { return i; });
    round.order = [];
    wheelRot = -Math.PI / 2;
    $('#turn-label').textContent = 'Ketuk PUTAR untuk mulai';
    $('#turn-name').textContent = '';
    $('#turn-next').textContent = '';
    $('#spin').disabled = false;
    $('#spin').hidden = false;
    $('#spin-again').hidden = true;
    renderOrder();
    drawWheel();
    show('discuss');
  }

  function drawWheel() {
    var size = canvas.width;
    var r = size / 2;
    ctx.clearRect(0, 0, size, size);
    var n = round.pool.length;
    if (!n) {
      ctx.fillStyle = '#262a40';
      ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.font = '600 36px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Semua sudah dapat giliran', r, r);
      return;
    }
    var seg = (Math.PI * 2) / n;
    for (var k = 0; k < n; k++) {
      var idx = round.pool[k];
      var a0 = wheelRot + k * seg;
      ctx.beginPath();
      ctx.moveTo(r, r);
      ctx.arc(r, r, r, a0, a0 + seg);
      ctx.closePath();
      ctx.fillStyle = COLORS[idx % COLORS.length];
      ctx.fill();
      if (n > 1) {
        ctx.strokeStyle = 'rgba(0,0,0,.18)';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      // nama di sepanjang jari-jari
      ctx.save();
      ctx.translate(r, r);
      ctx.rotate(a0 + seg / 2);
      ctx.fillStyle = '#1f2430';
      var fs = n > 7 ? 30 : n > 4 ? 36 : 42;
      ctx.font = fs + 'px "Lilita One", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      var name = store.players[idx].name;
      var maxW = r - 110;
      while (ctx.measureText(name).width > maxW && name.length > 2) name = name.slice(0, -2) + '…';
      ctx.fillText(name, r - 26, 0);
      ctx.restore();
    }
  }

  function renderOrder() {
    $('#order').innerHTML = round.order.map(function (idx, n) {
      return '<li style="--c:' + COLORS[idx % COLORS.length] + '"><i>' + (n + 1) + '</i>' + esc(store.players[idx].name) + '</li>';
    }).join('');
  }

  function spin() {
    if (spinning || !round.pool.length) return;
    spinning = true;
    $('#spin').disabled = true;
    $('#turn').classList.remove('is-pop');
    $('#turn-label').textContent = 'Memutar…';
    $('#turn-name').textContent = '';
    $('#turn-next').textContent = '';
    sfx.tap();

    var n = round.pool.length;
    var seg = (Math.PI * 2) / n;
    var target = Math.floor(Math.random() * n);
    var jitter = (Math.random() - 0.5) * seg * 0.7;
    // pusat segmen target harus berada di atas (di bawah penunjuk, sudut -90°)
    var final = -Math.PI / 2 - (target + 0.5) * seg + jitter;
    var turns = 4 + Math.floor(Math.random() * 3);
    while (final < wheelRot + turns * Math.PI * 2) final += Math.PI * 2;

    var start = wheelRot;
    var dist = final - start;
    var dur = 3600 + Math.random() * 900;
    var t0 = performance.now();
    var lastSeg = Math.floor((start + Math.PI / 2) / seg);
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function frame(now) {
      var t = reduce ? 1 : Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - t, 4);
      wheelRot = start + dist * e;
      var s = Math.floor((wheelRot + Math.PI / 2) / seg);
      if (s !== lastSeg) { lastSeg = s; sfx.tick(); }
      drawWheel();
      if (t < 1) requestAnimationFrame(frame);
      else finishSpin(target);
    }
    requestAnimationFrame(frame);
  }

  function finishSpin(k) {
    var idx = round.pool[k];
    sfx.pick();
    $('#turn-label').textContent = 'Giliran ke-' + (round.order.length + 1) + ' memberi deskripsi:';
    $('#turn-name').textContent = store.players[idx].name;
    $('#turn-name').style.color = COLORS[idx % COLORS.length];
    $('#turn').classList.add('is-pop');
    round.order.push(idx);
    renderOrder();
    // nama yang terpilih hilang dari roda
    setTimeout(function () {
      round.pool.splice(k, 1);
      wheelRot = wheelRot % (Math.PI * 2);
      // sisa satu pemain: otomatis jadi giliran terakhir tanpa perlu diputar
      if (round.pool.length === 1) {
        var lastIdx = round.pool.pop();
        round.order.push(lastIdx);
        renderOrder();
        $('#turn-next').innerHTML = 'Setelah itu giliran terakhir: <b style="color:' + COLORS[lastIdx % COLORS.length] + '">' + esc(store.players[lastIdx].name) + '</b>';
      }
      drawWheel();
      spinning = false;
      if (round.pool.length) {
        $('#spin').disabled = false;
      } else {
        $('#spin').hidden = true;
        $('#spin-again').hidden = false;
      }
    }, 900);
  }

  $('#spin').addEventListener('click', spin);
  $('#spin-again').addEventListener('click', function () {
    sfx.tap();
    round.pool = store.players.map(function (_, i) { return i; });
    round.order = [];
    renderOrder();
    $('#spin-again').hidden = true;
    $('#spin').disabled = false;
    $('#spin').hidden = false;
    $('#turn-label').textContent = 'Ronde deskripsi berikutnya. Ketuk PUTAR';
    $('#turn-name').textContent = '';
    $('#turn-next').textContent = '';
    drawWheel();
  });
  $('#to-vote').addEventListener('click', function () {
    if (spinning) return;
    sfx.tap();
    if (round.pool.length && round.order.length < store.players.length) {
      modal({
        title: 'Langsung Voting?',
        text: 'Masih ada pemain yang belum memberi deskripsi.',
        buttons: [
          { label: 'BELUM', cls: 'btn--soft' },
          { label: 'VOTING', cls: 'btn--dark', onClick: startVote }
        ]
      });
      return;
    }
    startVote();
  });

  /* ---------- Voting ---------- */
  function startVote() {
    round.voted = -1;
    var n = store.players.length;
    var list = $('#vote-list');
    list.className = 'vote-list' + (n > 5 ? ' is-many' : n <= 4 ? ' is-few' : '');
    list.innerHTML = store.players.map(function (p, i) {
      return '<button class="vote-card" data-vote="' + i + '" style="--c:' + COLORS[i % COLORS.length] + '">' + esc(p.name) + '</button>';
    }).join('');
    $('#vote-next').disabled = true;
    show('vote');
  }
  $('#vote-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-vote]');
    if (!b) return;
    sfx.tap();
    round.voted = +b.getAttribute('data-vote');
    $$('.vote-card').forEach(function (c) { c.classList.toggle('is-picked', c === b); });
    $('#vote-next').disabled = false;
  });
  $('#vote-next').addEventListener('click', function () {
    if (round.voted < 0) return;
    showResult();
  });

  /* ---------- Hasil ---------- */
  function showResult() {
    var caught = round.voted === round.impostor;
    var imp = store.players[round.impostor];
    var stamp = $('#stamp');
    stamp.textContent = caught ? 'KETAHUAN!' : 'LOLOS!';
    stamp.classList.toggle('is-safe', !caught);
    $('#verdict').textContent = caught
      ? 'Tebakan benar! Crew menang'
      : 'Salah tebak! ' + store.players[round.voted].name + ' bukan impostor';
    $('#res-crew').textContent = round.crewWord;
    var blind = store.mode === 'blind';
    $('#res-imp-label').textContent = blind ? 'Kategori' : 'Kata Impostor';
    $('#res-imp-word').textContent = blind ? round.category : round.impWord;
    $('#res-imp').textContent = imp.name;

    if (caught) {
      store.players.forEach(function (p, i) { if (i !== round.impostor) p.score += CREW_POINTS; });
    } else {
      imp.score += IMPOSTOR_POINTS;
    }
    save();

    // ganti animasi stempel
    var s = $('#s-result');
    s.classList.remove('is-active');
    void s.offsetWidth;
    show('result');
    setTimeout(caught ? sfx.win : sfx.lose, 300);
  }
  $('#result-next').addEventListener('click', function () {
    sfx.tap();
    round = null;
    renderLobby();
    show('lobby');
  });

  /* ---------- Keluar dari ronde ---------- */
  document.addEventListener('click', function (e) {
    var q = e.target.closest('[data-action="quit"]');
    if (!q) return;
    sfx.tap();
    modal({
      title: 'Keluar dari Ronde?',
      text: 'Ronde ini dibatalkan dan tidak ada yang dapat poin.',
      buttons: [
        { label: 'LANJUT MAIN', cls: 'btn--soft' },
        { label: 'KELUAR', cls: 'btn--red', onClick: function () { round = null; spinning = false; renderLobby(); show('lobby'); } }
      ]
    });
  });

  /* ================= PENGATURAN KATA ================= */
  function renderSettings() {
    $('#cat-list').innerHTML = WORDS.map(function (w, i) {
      var on = store.cats.indexOf(w.c) !== -1;
      return '<label class="cat"><input type="checkbox" id="cat-' + i + '" data-cat="' + esc(w.c) + '"' + (on ? ' checked' : '') + '><span class="cat__check"></span><span>' + esc(w.c) + '</span></label>';
    }).join('');
    $$('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === store.mode)); });
    updateCatCount();
  }
  function updateCatCount() {
    var pairs = WORDS.reduce(function (s, w) { return s + (store.cats.indexOf(w.c) !== -1 ? w.p.length : 0); }, 0);
    $('#cat-count').textContent = store.cats.length + ' kategori · ' + pairs + ' pasangan kata';
  }
  $('#cat-list').addEventListener('change', function (e) {
    var name = e.target.getAttribute('data-cat');
    if (!name) return;
    sfx.tap();
    var i = store.cats.indexOf(name);
    if (e.target.checked && i === -1) store.cats.push(name);
    if (!e.target.checked && i !== -1) store.cats.splice(i, 1);
    save();
    updateCatCount();
  });
  $('#cat-all').addEventListener('click', function () {
    sfx.tap();
    store.cats = WORDS.map(function (w) { return w.c; });
    save(); renderSettings();
  });
  $('#cat-none').addEventListener('click', function () {
    sfx.tap();
    store.cats = [];
    save(); renderSettings();
  });
  $('#mode-pick').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]');
    if (!b) return;
    sfx.tap();
    store.mode = b.getAttribute('data-mode');
    save();
    renderSettings();
  });

  /* ================= Navigasi umum ================= */
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-go]');
    if (g) {
      sfx.tap();
      var to = g.getAttribute('data-go');
      if (to === 'settings') renderSettings();
      if (to === 'lobby') {
        if (!store.cats.length) { toast('Pilih minimal 1 kategori kata'); return; }
        renderLobby();
      }
      show(to);
      return;
    }
    if (e.target.closest('[data-action="help"]')) {
      sfx.tap();
      modal({
        title: 'Cara Main',
        html: '<ol>' +
          '<li><b>Atur pemain</b>: 3 sampai 10 orang, ketuk nama untuk mengubahnya. Mode permainan bisa dipilih di ⚙.</li>' +
          (store.mode === 'blind'
            ? '<li><b>Lihat kata</b>: oper HP bergiliran. Semua crew dapat kata yang sama. Impostor tidak dapat kata, hanya kategorinya, jadi harus pintar menebak dari deskripsi teman.</li>'
            : '<li><b>Lihat kata</b>: oper HP bergiliran. Semua crew dapat kata yang sama, impostor dapat kata yang mirip tapi berbeda. Impostor tidak tahu dirinya impostor!</li>') +
          '<li><b>Diskusi</b>: putar roda untuk menentukan giliran. Yang terpilih memberi deskripsi singkat tentang katanya. Pemain terakhir otomatis dapat giliran.</li>' +
          '<li><b>Voting</b>: tentukan bersama siapa yang paling mencurigakan.</li>' +
          '<li><b>Poin</b>: tebakan benar, tiap crew +' + CREW_POINTS + '. Tebakan salah, impostor +' + IMPOSTOR_POINTS + '.</li>' +
        '</ol>'
      });
      return;
    }
    var back = e.target.closest('a[data-sfx]');
    if (back) {
      sfx.tap();
      // kalau datang dari Mabarin, kembali lewat riwayat agar posisi menu tetap
      try {
        if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) {
          e.preventDefault();
          history.back();
        }
      } catch (err) { /* pakai href biasa */ }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('#modal').classList.contains('is-open')) closeModal();
  });

  // gambar ulang roda setelah font siap, agar nama memakai font yang benar
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { if (round && round.pool) drawWheel(); });
  }

  renderLobby();
})();
