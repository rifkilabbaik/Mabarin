/* =========================================================
   MABARIN - Koas Impostor
   Alur: lobi -> lihat benda (bergiliran) -> menggambar bergiliran
         (1 garis per giliran) -> voting -> tebakan terakhir impostor
         -> hasil & poin -> lobi (papan skor)
   ========================================================= */
(function () {
  'use strict';

  var MIN_PLAYERS = 3;
  var MAX_PLAYERS = 10;
  var CREW_POINTS = 1;      // tiap crew dapat poin ini kalau impostor ketahuan & salah tebak
  var IMPOSTOR_POINTS = 2;  // impostor dapat poin ini kalau lolos
  var GUESS_POINTS = 1;     // impostor dapat poin ini kalau ketahuan tapi berhasil menebak benda
  var STORE_KEY = 'mabarin:koas';
  var SHARED_KEY = 'mabarin:settings';
  var PAPER = '#fffdf6';

  var COLORS = ['#ff5f57', '#12aef0', '#6cc33f', '#ffbb2c', '#c26bf0', '#f45ca2', '#ff8a3d', '#1fc7a6', '#8f9cff', '#c49a6c'];
  var WORDS = window.KOAS_WORDS || [];

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
  // hint 'cat'  : impostor tahu kategori benda
  // hint 'none' : impostor tidak dapat petunjuk sama sekali
  if (store.hint !== 'cat' && store.hint !== 'none') store.hint = 'cat';
  if ([1, 2, 3].indexOf(store.rounds) === -1) store.rounds = 2;
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
    reveal: function () { tone(440, 0.12, 'sine', 0.15, 2); buzz(20); },
    stroke: function () { tone(300, 0.12, 'sine', 0.12, 1.8); buzz(15); },
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
  function colorOf(i) { return COLORS[i % COLORS.length]; }

  /* ================= LOBI ================= */
  var editing = -1;
  var ICON_EDIT = '<svg viewBox="0 0 32 32"><path d="M6 26l1.5-6L21 6.5a2.1 2.1 0 0 1 3 0l1.5 1.5a2.1 2.1 0 0 1 0 3L12 24.5z" fill="#ffd43b" stroke="#333" stroke-width="1.6" stroke-linejoin="round"/><path d="M19 8.5l4.5 4.5" stroke="#333" stroke-width="1.6"/><path d="M21 6.5a2.1 2.1 0 0 1 3 0l1.5 1.5a2.1 2.1 0 0 1 0 3L24 12.5 19.5 8z" fill="#ff8f8f" stroke="#333" stroke-width="1.6" stroke-linejoin="round"/><path d="M6 26l1.5-6 4.5 4.5z" fill="#f4d4a8" stroke="#333" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  var ICON_TRASH = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="#1f2430" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#1f2430" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function hasScores() { return store.players.some(function (p) { return p.score > 0; }); }

  function renderLobby() {
    var scores = hasScores();
    $('#player-list').innerHTML = store.players.map(function (p, i) {
      var c = colorOf(i);
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
    if (!store.cats.length) { toast('Pilih minimal 1 kategori benda'); show('settings'); renderSettings(); return; }
    startRound();
  });

  /* ================= RONDE ================= */
  var round = null;

  function pickWord() {
    var pool = [];
    WORDS.forEach(function (cat) {
      if (store.cats.indexOf(cat.c) === -1) return;
      cat.w.forEach(function (word) { pool.push({ key: cat.c + '|' + word, cat: cat.c, word: word }); });
    });
    var fresh = pool.filter(function (x) { return !store.used[x.key]; });
    if (!fresh.length) {
      // semua benda di kategori terpilih sudah dipakai: mulai ulang
      pool.forEach(function (x) { delete store.used[x.key]; });
      fresh = pool;
    }
    var pick = fresh[Math.floor(Math.random() * fresh.length)];
    store.used[pick.key] = 1;
    save();
    return pick;
  }

  function startRound() {
    var pick = pickWord();
    var n = store.players.length;
    var impostor = Math.floor(Math.random() * n);
    // urutan menggambar acak, tapi impostor tidak pernah menggambar pertama
    // (kalau pertama, dia belum punya garis siapa pun untuk ditiru)
    var order = shuffle(store.players.map(function (_, i) { return i; }));
    if (order[0] === impostor) {
      var j = 1 + Math.floor(Math.random() * (n - 1));
      order[0] = order[j]; order[j] = impostor;
    }
    round = {
      category: pick.cat,
      word: pick.word,
      impostor: impostor,
      revealIdx: 0,
      order: order,
      turn: 0,
      strokes: [],
      current: null,
      pending: false,
      voted: -1,
      art: ''
    };
    showReveal();
  }

  /* ---------- Lihat benda ---------- */
  function showReveal() {
    var i = round.revealIdx;
    var p = store.players[i];
    var screen = $('#s-reveal');
    screen.style.setProperty('--c', colorOf(i));
    $('#reveal-name').textContent = p.name;
    // tutup panel tanpa animasi & kosongkan isinya, supaya benda pemain berikutnya
    // tidak sempat terlihat selama panel memudar
    var panel = $('#reveal-panel');
    panel.classList.add('no-anim');
    panel.classList.remove('is-open');
    $('#reveal-word').innerHTML = '';
    void panel.offsetWidth;
    panel.classList.remove('no-anim');
    $('#reveal-next').hidden = true;
    var last = i === store.players.length - 1;
    $('#reveal-next').textContent = last ? 'MULAI MENGGAMBAR' : 'SUDAH';
    $('#reveal-pass').textContent = '';
    show('reveal');
  }

  function revealHtml(i) {
    if (i === round.impostor) {
      return '<span class="reveal__imp">KAMU IMPOSTOR!</span><small>' +
        (store.hint === 'cat' ? 'Kategori: ' + esc(round.category) : 'Tebak bendanya dari gambar teman') + '</small>';
    }
    return esc(round.word) + '<small>Kategori: ' + esc(round.category) + '</small>';
  }

  $('#reveal-panel').addEventListener('click', function () {
    var panel = $('#reveal-panel');
    var open = !panel.classList.contains('is-open');
    // isi panel baru diisi saat dibuka oleh pemiliknya sendiri
    if (open) $('#reveal-word').innerHTML = revealHtml(round.revealIdx);
    panel.classList.toggle('is-open', open);
    if (open) {
      sfx.reveal();
      var i = round.revealIdx;
      var last = i === store.players.length - 1;
      $('#reveal-next').hidden = false;
      $('#reveal-pass').textContent = last
        ? 'Semua sudah lihat. Taruh HP di tengah!'
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
      startDrawing();
    }
  });

  /* ---------- Menggambar ---------- */
  var canvas = $('#draw-canvas');
  var ctx = canvas.getContext('2d');
  var activePointer = null;
  var drawQueued = false;

  function totalTurns() { return round.order.length * store.rounds; }
  function drawerNow() { return round.order[round.turn % round.order.length]; }

  // gambar semua garis (koordinat 0..1) ke konteks berukuran size x size
  function paint(c, size, strokes) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = PAPER;
    c.fillRect(0, 0, size, size);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = Math.max(3, size * 0.016);
    strokes.forEach(function (s) {
      var pts = s.pts;
      c.strokeStyle = s.c;
      c.fillStyle = s.c;
      if (pts.length === 1) {
        c.beginPath();
        c.arc(pts[0][0] * size, pts[0][1] * size, c.lineWidth / 2, 0, Math.PI * 2);
        c.fill();
        return;
      }
      c.beginPath();
      c.moveTo(pts[0][0] * size, pts[0][1] * size);
      // kurva halus lewat titik tengah antar titik
      for (var k = 1; k < pts.length - 1; k++) {
        var mx = (pts[k][0] + pts[k + 1][0]) / 2;
        var my = (pts[k][1] + pts[k + 1][1]) / 2;
        c.quadraticCurveTo(pts[k][0] * size, pts[k][1] * size, mx * size, my * size);
      }
      var last = pts[pts.length - 1];
      c.lineTo(last[0] * size, last[1] * size);
      c.stroke();
    });
  }

  function redraw() {
    drawQueued = false;
    if (!round) return;
    var strokes = round.current ? round.strokes.concat([round.current]) : round.strokes;
    paint(ctx, canvas.width, strokes);
  }
  function queueRedraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(redraw);
  }

  function layoutCanvas() {
    var board = $('#board');
    // ruang untuk padding papan & bayangan kanvas
    var size = Math.floor(Math.min(board.clientWidth - 44, board.clientHeight - 24));
    size = Math.max(140, size);
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.width = canvas.height = Math.round(size * dpr);
    redraw();
  }

  function artUrl() {
    var c = document.createElement('canvas');
    c.width = c.height = 480;
    paint(c.getContext('2d'), 480, round.strokes);
    return c.toDataURL('image/png');
  }

  function startDrawing() {
    round.turn = 0;
    round.strokes = [];
    round.current = null;
    round.pending = false;
    show('draw');
    layoutCanvas();
    renderTurn();
  }

  function renderTurn() {
    var n = round.order.length;
    var done = round.turn >= totalTurns();
    var idx = done ? -1 : drawerNow();
    $('#draw-round').textContent = done
      ? 'Gambar selesai'
      : 'Putaran ' + (Math.floor(round.turn / n) + 1) + '/' + store.rounds;
    $('#draw-label').textContent = done ? 'Semua sudah menggambar!' : 'Giliran menggambar:';
    $('#draw-name').textContent = done ? '' : store.players[idx].name;
    $('#draw-name').style.color = done ? '' : colorOf(idx);
    $('#draw-turn').classList.remove('is-pop');
    void $('#draw-turn').offsetWidth;
    $('#draw-turn').classList.add('is-pop');

    var pos = round.turn % n;
    $('#draw-order').innerHTML = round.order.map(function (p, k) {
      var cls = done || k < pos ? 'is-done' : k === pos ? 'is-now' : '';
      return '<li class="' + cls + '" style="--c:' + colorOf(p) + '"><i>' + (k + 1) + '</i>' + esc(store.players[p].name) + '</li>';
    }).join('');

    $('#draw-hint').hidden = done || round.pending;
    $('#draw-actions').hidden = done || !round.pending;
    $('#draw-vote').hidden = !done;
    $('#board').classList.toggle('is-locked', done || round.pending);
  }

  function pointFrom(e) {
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width;
    var y = (e.clientY - r.top) / r.height;
    return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (!round || round.pending || round.current || round.turn >= totalTurns()) return;
    if (!e.isPrimary || e.button > 0) return;
    e.preventDefault();
    activePointer = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* abaikan */ }
    round.current = { c: colorOf(drawerNow()), pts: [pointFrom(e)] };
    queueRedraw();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!round || !round.current || e.pointerId !== activePointer) return;
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (!evs.length) evs = [e];
    var pts = round.current.pts;
    evs.forEach(function (ev) {
      var p = pointFrom(ev);
      var q = pts[pts.length - 1];
      // lewati titik yang terlalu rapat
      if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 0.003) pts.push(p);
    });
    queueRedraw();
  });
  function endStroke(e) {
    if (!round || !round.current || e.pointerId !== activePointer) return;
    activePointer = null;
    round.strokes.push(round.current);
    round.current = null;
    round.pending = true;
    sfx.stroke();
    queueRedraw();
    renderTurn();
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  $('#draw-undo').addEventListener('click', function () {
    if (!round || !round.pending) return;
    sfx.tap();
    round.strokes.pop();
    round.pending = false;
    redraw();
    renderTurn();
  });
  $('#draw-ok').addEventListener('click', function () {
    if (!round || !round.pending) return;
    round.pending = false;
    round.turn++;
    if (round.turn >= totalTurns()) sfx.pick(); else sfx.tap();
    renderTurn();
  });
  $('#draw-vote').addEventListener('click', function () {
    sfx.tap();
    startVote();
  });

  window.addEventListener('resize', function () {
    if (round && $('#s-draw').classList.contains('is-active')) layoutCanvas();
  });

  /* ---------- Voting ---------- */
  function startVote() {
    round.voted = -1;
    round.art = artUrl();
    $('#vote-art').src = round.art;
    var n = store.players.length;
    var list = $('#vote-list');
    list.className = 'vote-list' + (n > 5 ? ' is-many' : n <= 4 ? ' is-few' : '');
    list.innerHTML = store.players.map(function (p, i) {
      return '<button class="vote-card" data-vote="' + i + '" style="--c:' + colorOf(i) + '">' + esc(p.name) + '</button>';
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
    sfx.tap();
    if (round.voted === round.impostor) showGuess();
    else showResult('escape');
  });

  /* ---------- Tebakan terakhir impostor ---------- */
  function showGuess() {
    $('#guess-name').textContent = store.players[round.impostor].name;
    $('#guess-art').src = round.art;
    $('#guess-word').textContent = round.word;
    $('#guess-answer').hidden = true;
    $('#guess-show').hidden = false;
    $('#guess-q').hidden = true;
    $('#guess-judge').hidden = true;
    show('guess');
    setTimeout(sfx.pick, 200);
  }
  $('#guess-show').addEventListener('click', function () {
    sfx.reveal();
    $('#guess-answer').hidden = false;
    $('#guess-show').hidden = true;
    $('#guess-q').hidden = false;
    $('#guess-judge').hidden = false;
  });
  $('#guess-right').addEventListener('click', function () { sfx.tap(); showResult('guessed'); });
  $('#guess-wrong').addEventListener('click', function () { sfx.tap(); showResult('caught'); });

  /* ---------- Hasil ---------- */
  // outcome: 'caught' (crew menang), 'guessed' (impostor ketahuan tapi menebak benar),
  //          'escape' (salah tebak, impostor lolos)
  function showResult(outcome) {
    var imp = store.players[round.impostor];
    var stamp = $('#stamp');
    stamp.textContent = outcome === 'caught' ? 'KETAHUAN!' : outcome === 'guessed' ? 'JITU!' : 'LOLOS!';
    stamp.classList.toggle('is-safe', outcome !== 'caught');
    $('#verdict').textContent = outcome === 'caught'
      ? 'Impostor ketahuan & salah tebak! Crew menang'
      : outcome === 'guessed'
        ? 'Impostor ketahuan, tapi berhasil menebak bendanya!'
        : 'Salah tebak! ' + store.players[round.voted].name + ' bukan impostor';
    $('#res-art').src = round.art;
    $('#res-word').textContent = round.word;
    $('#res-imp').textContent = imp.name;

    if (outcome === 'caught') {
      store.players.forEach(function (p, i) { if (i !== round.impostor) p.score += CREW_POINTS; });
    } else {
      imp.score += outcome === 'guessed' ? GUESS_POINTS : IMPOSTOR_POINTS;
    }
    save();

    // ganti animasi stempel
    var s = $('#s-result');
    s.classList.remove('is-active');
    void s.offsetWidth;
    show('result');
    setTimeout(outcome === 'caught' ? sfx.win : sfx.lose, 300);
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
        { label: 'KELUAR', cls: 'btn--red', onClick: function () { round = null; activePointer = null; renderLobby(); show('lobby'); } }
      ]
    });
  });

  /* ================= PENGATURAN ================= */
  function renderSettings() {
    $('#cat-list').innerHTML = WORDS.map(function (w, i) {
      var on = store.cats.indexOf(w.c) !== -1;
      return '<label class="cat"><input type="checkbox" id="cat-' + i + '" data-cat="' + esc(w.c) + '"' + (on ? ' checked' : '') + '><span class="cat__check"></span><span>' + esc(w.c) + '</span></label>';
    }).join('');
    $$('[data-hint]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-hint') === store.hint)); });
    $$('[data-rounds]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-rounds') === store.rounds)); });
    updateCatCount();
  }
  function updateCatCount() {
    var words = WORDS.reduce(function (s, w) { return s + (store.cats.indexOf(w.c) !== -1 ? w.w.length : 0); }, 0);
    $('#cat-count').textContent = store.cats.length + ' kategori · ' + words + ' benda';
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
  $('#hint-pick').addEventListener('click', function (e) {
    var b = e.target.closest('[data-hint]');
    if (!b) return;
    sfx.tap();
    store.hint = b.getAttribute('data-hint');
    save();
    renderSettings();
  });
  $('#rounds-pick').addEventListener('click', function (e) {
    var b = e.target.closest('[data-rounds]');
    if (!b) return;
    sfx.tap();
    store.rounds = +b.getAttribute('data-rounds');
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
        if (!store.cats.length) { toast('Pilih minimal 1 kategori benda'); return; }
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
          '<li><b>Atur pemain</b>: 3 sampai 10 orang, ketuk nama untuk mengubahnya. Petunjuk impostor & jumlah putaran bisa diatur di ⚙.</li>' +
          '<li><b>Lihat benda</b>: oper HP bergiliran. Semua crew dapat nama benda yang sama. Impostor tidak dapat nama benda' +
            (store.hint === 'cat' ? ', hanya kategorinya' : '') + '.</li>' +
          '<li><b>Menggambar</b>: sesuai urutan, tiap pemain menggambar <b>1 garis</b> tanpa mengangkat jari, dengan warnanya sendiri. Jangan terlalu jelas supaya impostor tidak bisa menebak! Impostor harus ikut menggambar sambil menebak dari garis teman.</li>' +
          '<li><b>Voting</b>: lihat gambarnya, tentukan bersama siapa yang paling mencurigakan.</li>' +
          '<li><b>Tebakan terakhir</b>: kalau impostor ketahuan, dia boleh menebak bendanya. Kalau benar, impostor tetap dapat poin.</li>' +
          '<li><b>Poin</b>: impostor ketahuan & salah tebak, tiap crew +' + CREW_POINTS + '. Impostor ketahuan tapi tebakan benar, impostor +' + GUESS_POINTS + '. Salah pilih, impostor +' + IMPOSTOR_POINTS + '.</li>' +
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

  renderLobby();
})();
