/* =========================================================
   MABARIN - Game Station
   ========================================================= */
(function () {
  'use strict';

  var APP_VERSION = '1.2.0';
  var SHARE_URL = 'https://github.com/rifkilabbaik/Mabarin';
  var STORAGE_KEY = 'mabarin:settings';
  var MODES = window.MABARIN_MODES || [];
  var GAMES = window.MABARIN_GAMES || [];

  var DEFAULTS = {
    sound: true,
    vibrate: true,
    dark: false
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------------- Settings ---------------- */
  var settings = loadSettings();

  function loadSettings() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { s = {}; }
    return Object.assign({}, DEFAULTS, s);
  }
  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { /* mode privat */ }
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', settings.dark ? 'dark' : 'light');
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', settings.dark ? '#262c45' : '#ffffff');
  }
  applyTheme();

  /* ---------------- Suara & getaran ---------------- */
  var audioCtx = null;
  function tone(freq, dur, type, vol) {
    if (!settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
      gain.gain.setValueAtTime(vol || 0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch (e) { /* audio tidak didukung */ }
  }
  function buzz(ms) {
    if (settings.vibrate && navigator.vibrate) {
      try { navigator.vibrate(ms || 12); } catch (e) { /* abaikan */ }
    }
  }
  var sfx = {
    tap: function () { tone(520, 0.08, 'triangle'); buzz(10); },
    back: function () { tone(380, 0.08, 'triangle'); buzz(10); },
    toggle: function (on) { tone(on ? 660 : 440, 0.1, 'sine'); buzz(15); },
    error: function () { tone(200, 0.18, 'square', 0.08); buzz([20, 40, 20]); }
  };

  /* ---------------- UI helpers ---------------- */
  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-show'); }, 2200);
  }

  function modal(opts) {
    var el = $('#modal');
    $('#modal-title').textContent = opts.title || '';
    $('#modal-text').textContent = opts.text || '';
    var actions = $('#modal-actions');
    actions.innerHTML = '';
    (opts.buttons || [{ label: 'OKE', style: 'navy' }]).forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'btn-pill btn-pill--' + (b.style || 'navy');
      btn.textContent = b.label;
      btn.addEventListener('click', function () {
        closeModal();
        if (b.onClick) b.onClick();
      });
      actions.appendChild(btn);
    });
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    var first = actions.querySelector('button');
    if (first) first.focus();
  }
  function closeModal() {
    var el = $('#modal');
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
  }

  function openDrawer() {
    var d = $('#drawer');
    d.classList.add('is-open');
    d.setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    var d = $('#drawer');
    d.classList.remove('is-open');
    d.setAttribute('aria-hidden', 'true');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- Render: halaman utama ---------------- */
  var PARTY_SVG =
    '<svg class="mode-card__party" viewBox="0 0 120 70" aria-hidden="true">' +
      '<g fill="#6cc33f"><circle cx="22" cy="16" r="11"/><path d="M4 56c0-14 8-26 18-26s18 12 18 26z"/></g>' +
      '<g fill="#ffbb2c"><circle cx="96" cy="16" r="11"/><path d="M78 56c0-14 8-26 18-26s18 12 18 26z"/></g>' +
      '<g fill="#ff5f57"><circle cx="44" cy="22" r="11"/><path d="M26 62c0-14 8-26 18-26s18 12 18 26z"/></g>' +
      '<g fill="#12aef0"><circle cx="76" cy="22" r="11"/><path d="M58 62c0-14 8-26 18-26s18 12 18 26z"/></g>' +
      '<g fill="#d04bf0"><circle cx="50" cy="38" r="8"/><path d="M37 70c0-11 6-20 13-20s13 9 13 20z"/></g>' +
      '<g fill="#d04bf0"><circle cx="72" cy="38" r="8"/><path d="M59 70c0-11 6-20 13-20s13 9 13 20z"/></g>' +
    '</svg>';

  function modeCardHtml(m) {
    var big;
    if (m.id === 'party') {
      big = PARTY_SVG;
    } else if (m.id === 'team') {
      big = '<span class="mode-card__big mode-card__big--vs"><span class="vs1">2</span><small>vs</small><span class="vs2">2</span></span>';
    } else {
      big = '<span class="mode-card__lines"></span><span class="mode-card__big">' + escapeHtml(m.big) + '</span>';
    }
    return (
      '<button class="mode-card" style="--c: var(--' + m.color + ')" data-nav="mode/' + m.id + '" aria-label="' + escapeHtml(m.title) + '">' +
        big +
        '<span class="mode-card__label">' + escapeHtml(m.label) + '</span>' +
        (m.isNew ? '<span class="ribbon"><span>BARU!</span></span>' : '') +
      '</button>'
    );
  }

  function renderHome() {
    var html = '';
    for (var i = 0; i < MODES.length; i += 2) {
      html += '<div class="mode-row">' + modeCardHtml(MODES[i]) + (MODES[i + 1] ? modeCardHtml(MODES[i + 1]) : '') + '</div>';
    }
    $('#mode-grid').innerHTML = html;
    $$('.mode-card').forEach(function (el, i) { el.style.animationDelay = (i * 0.05) + 's'; });
  }

  /* ---------------- Render: kategori ---------------- */
  var SPARKLE = '<svg viewBox="0 0 24 24"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z"/></svg>';
  var SHARE_ICON = '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3.4"/><circle cx="6" cy="12" r="3.4"/><circle cx="18" cy="19" r="3.4"/><path d="M8.6 10.5 15.4 6.5M8.6 13.5l6.8 4" stroke="#fff" stroke-width="2.4"/></svg>';
  var LABEL_COLOR = { red: 'red', blue: 'blue', green: 'green', yellow: 'yellow', purple: 'purple', pink: 'pink', navy: 'red' };

  function gameCardHtml(g) {
    var isImg = /\.(png|jpe?g|webp|svg|gif)$/i.test(g.icon || '');
    var art = isImg ? '<img src="' + escapeHtml(g.icon) + '" alt="" loading="lazy">' : escapeHtml(g.icon || '🎮');
    return (
      '<button class="game-card" data-game="' + escapeHtml(g.id) + '" style="--c: var(--' + (g.color || 'navy') + '); --c2: var(--' + (LABEL_COLOR[g.color] || 'red') + ')">' +
        '<span class="game-card__art">' + art + '</span>' +
        '<span class="game-card__label">' + escapeHtml(g.title.toUpperCase()) + '</span>' +
        (g.isNew ? '<span class="ribbon"><span>BARU!</span></span>' : '') +
      '</button>'
    );
  }

  function renderCategory(modeId) {
    var mode = MODES.filter(function (m) { return m.id === modeId; })[0];
    if (!mode) return false;
    $('#category-title').textContent = mode.title;
    var list = GAMES.filter(function (g) { return (g.modes || []).indexOf(modeId) !== -1; });
    var html = list.map(gameCardHtml).join('');

    html +=
      '<button class="game-card game-card--share" data-action="share">' +
        '<span class="game-card__head"><span class="logo">' +
          '<span class="logo__top"><span class="c-red">G</span><span class="c-blue">A</span><span class="c-green">M</span><span class="c-yellow">E</span><span class="logo__gap"></span><span class="c-red">S</span><span class="c-blue">T</span><span class="c-green">A</span><span class="c-yellow">T</span><span class="c-red">I</span><span class="c-blue">O</span><span class="c-green">N</span></span>' +
          '<span class="logo__title">MABARIN</span>' +
          '<span class="logo__bar"><i></i><i></i><i></i><i></i></span>' +
        '</span></span>' +
        '<span class="game-card__box">AJAK TEMAN<br>BUAT MAIN<br>BARENG!</span>' +
        '<span class="game-card__label">' + SHARE_ICON + 'BAGIKAN!</span>' +
      '</button>';

    html +=
      '<div class="game-card game-card--soon" aria-label="Game lainnya segera hadir">' +
        '<span class="sparkles">' + SPARKLE + SPARKLE + SPARKLE + '</span>' +
        '<span class="soon__text">SEGERA<br>HADIR!</span>' +
      '</div>';

    var grid = $('#game-grid');
    grid.innerHTML = html;
    $$('.game-card', grid).forEach(function (el, i) { el.style.animationDelay = (i * 0.06) + 's'; });
    return true;
  }

  function openGame(id, modeId) {
    var g = GAMES.filter(function (x) { return x.id === id; })[0];
    if (!g) return;
    var url = g.url || ('games/' + g.id + '/index.html');
    location.href = url + (url.indexOf('?') === -1 ? '?' : '&') + 'mode=' + encodeURIComponent(modeId || '');
  }

  /* ---------------- Render: pengaturan ---------------- */
  function renderSettings() {
    $$('[data-setting]').forEach(function (el) {
      var key = el.getAttribute('data-setting');
      el.checked = key === 'fullscreen' ? !!document.fullscreenElement : !!settings[key];
    });
    $('#app-version').textContent = APP_VERSION;
    updateInstallUi();
    var canFs = document.fullscreenEnabled && !isStandalone();
    $('#row-fullscreen').hidden = !canFs;
  }

  /* ---------------- Router ---------------- */
  var SCREENS = { home: '#screen-home', mode: '#screen-category', settings: '#screen-settings' };
  var DEPTH = { home: 0, mode: 1, settings: 1 };
  var current = null;
  var navStack = 0;

  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('/');
    return { name: parts[0] || 'home', param: parts[1] || '' };
  }

  function show(route) {
    var name = SCREENS[route.name] ? route.name : 'home';
    if (name === 'mode' && !renderCategory(route.param)) name = 'home';
    if (name === 'settings') renderSettings();

    var target = $(SCREENS[name]);
    var goingBack = current && DEPTH[name] < DEPTH[current];
    $$('.screen').forEach(function (s) {
      if (s === target) return;
      if (s.classList.contains('is-active')) {
        s.classList.toggle('is-back', !goingBack);
        s.classList.remove('is-active');
      }
    });
    target.classList.remove('is-back');
    if (goingBack) {
      target.style.transform = 'translateX(-24px)';
      void target.offsetWidth;
      target.style.transform = '';
    }
    target.classList.add('is-active');
    current = name;
    var body = target.querySelector('main');
    if (body && !goingBack) body.scrollTop = 0;
  }

  function navigate(path) {
    var next = '#/' + path;
    if (location.hash === next) return;
    navStack++;
    location.hash = next;
  }
  function goBack() {
    if (navStack > 0) { navStack--; history.back(); }
    else { history.replaceState(null, '', '#/home'); show(parseHash()); }
  }

  window.addEventListener('hashchange', function () {
    closeDrawer();
    closeModal();
    show(parseHash());
  });

  /* ---------------- Install (PWA) ---------------- */
  var deferredPrompt = null;
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true;
  }
  function isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

  function updateInstallUi() {
    $('#install-btn').hidden = !deferredPrompt || isStandalone();
    // sudah terpasang: menu Pasang Aplikasi tidak perlu ditampilkan
    $('#drawer-install').hidden = isStandalone();
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    updateInstallUi();
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    updateInstallUi();
    toast('Mabarin berhasil dipasang! 🎉');
  });

  function install() {
    if (isStandalone()) { toast('Mabarin sudah terpasang 👍'); return; }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        updateInstallUi();
      });
      return;
    }
    modal({
      title: 'Pasang Mabarin',
      text: isIos()
        ? 'Di Safari, ketuk tombol Bagikan lalu pilih "Tambah ke Layar Utama".'
        : 'Buka menu browser (⋮) lalu pilih "Instal aplikasi" atau "Tambahkan ke layar utama".\n\nDi laptop, klik ikon instal di bilah alamat Chrome / Edge.'
    });
  }

  /* ---------------- Share ---------------- */
  function share() {
    var data = {
      title: 'Mabarin - Game Station',
      text: 'Yuk main bareng di Mabarin! Banyak game seru untuk dimainkan bareng teman dalam satu HP.',
      url: SHARE_URL
    };
    if (navigator.share) {
      navigator.share(data).catch(function () { /* dibatalkan */ });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(data.text + ' ' + data.url)
        .then(function () { toast('Link disalin! Tempel ke temanmu 📋'); })
        .catch(function () { toast(data.url); });
    } else {
      toast(data.url);
    }
  }

  /* ---------------- Actions ---------------- */
  var ACTIONS = {
    back: function () { sfx.back(); goBack(); },
    'open-drawer': function () { sfx.tap(); openDrawer(); },
    'close-drawer': function () { closeDrawer(); },
    install: function () { sfx.tap(); install(); },
    share: function () { sfx.tap(); share(); },
    reset: function () {
      sfx.tap();
      modal({
        title: 'Reset Data?',
        text: 'Semua pengaturan, nama pemain dan skor di game akan dihapus.',
        buttons: [
          { label: 'BATAL', style: 'ghost' },
          {
            label: 'RESET', style: 'red', onClick: function () {
              try {
                Object.keys(localStorage).forEach(function (k) { if (k.indexOf('mabarin') === 0) localStorage.removeItem(k); });
              } catch (e) { /* abaikan */ }
              settings = loadSettings();
              applyTheme();
              renderSettings();
              toast('Data berhasil direset');
            }
          }
        ]
      });
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action], [data-nav], [data-game]');
    if (!el) return;
    if (el.hasAttribute('data-close')) closeDrawer();

    var action = el.getAttribute('data-action');
    if (action && ACTIONS[action]) { ACTIONS[action](el); return; }

    var nav = el.getAttribute('data-nav');
    if (nav) {
      sfx.tap();
      if (nav === 'home' && current !== 'home') { goHome(); return; }
      navigate(nav);
      return;
    }

    var game = el.getAttribute('data-game');
    if (game) { sfx.tap(); openGame(game, parseHash().param); }
  });

  function goHome() {
    if (navStack > 0) { var n = navStack; navStack = 0; history.go(-n); }
    else { history.replaceState(null, '', '#/home'); show({ name: 'home' }); }
  }

  document.addEventListener('change', function (e) {
    var el = e.target;
    var key = el.getAttribute('data-setting');
    if (key) {
      if (key === 'fullscreen') {
        toggleFullscreen(el.checked);
      } else {
        settings[key] = el.checked;
        saveSettings();
        if (key === 'dark') applyTheme();
      }
      // bunyikan setelah disimpan agar mematikan suara tidak berbunyi
      sfx.toggle(el.checked);
      return;
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if ($('#modal').classList.contains('is-open')) closeModal();
      else if ($('#drawer').classList.contains('is-open')) closeDrawer();
      else if (current && current !== 'home') goBack();
    }
  });

  function toggleFullscreen(on) {
    var p = on ? document.documentElement.requestFullscreen() : document.exitFullscreen();
    if (p && p.catch) p.catch(function () { sfx.error(); toast('Layar penuh tidak didukung'); renderSettings(); });
  }
  document.addEventListener('fullscreenchange', function () {
    var el = $('[data-setting="fullscreen"]');
    if (el) el.checked = !!document.fullscreenElement;
  });

  /* ---------------- Splash / loading ---------------- */
  function runSplash() {
    var fill = $('#splash-fill');
    var text = $('#splash-text');
    var bar = fill.parentNode;
    var progress = 0;
    var ready = false;
    var minTime = 1400;
    var start = Date.now();

    // splash hanya diputar penuh sekali per sesi (mis. tidak lagi saat kembali dari game)
    var booted = false;
    try { booted = sessionStorage.getItem('mabarin:booted') === '1'; sessionStorage.setItem('mabarin:booted', '1'); } catch (e) { /* abaikan */ }

    var tasks = [];
    if (document.fonts && document.fonts.ready) tasks.push(document.fonts.ready);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      tasks.push(navigator.serviceWorker.register('sw.js').catch(function () { /* offline tanpa SW */ }));
    }
    var timeout = new Promise(function (r) { setTimeout(r, 4000); });
    Promise.race([Promise.all(tasks), timeout]).then(function () { ready = true; });
    if (booted) { finishSplash(); return; }

    function step() {
      var elapsed = Date.now() - start;
      var cap = ready ? 100 : 90;
      var targetByTime = Math.min(100, (elapsed / minTime) * 100);
      progress = Math.min(cap, Math.max(progress + 0.4, Math.min(targetByTime, cap)));
      var p = Math.floor(progress);
      fill.style.width = p + '%';
      text.textContent = p + '%';
      bar.setAttribute('aria-valuenow', p);
      if (p >= 100) {
        setTimeout(finishSplash, 250);
      } else {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  function finishSplash() {
    var route = parseHash();
    if (!SCREENS[route.name]) route = { name: 'home' };
    // pastikan tombol kembali selalu berakhir di beranda
    history.replaceState(null, '', '#/home');
    if (route.name !== 'home') {
      navStack = 1;
      history.pushState(null, '', '#/' + route.name + (route.param ? '/' + route.param : ''));
    }
    show(route);
    $('#screen-splash').classList.remove('is-active');
  }

  /* ---------------- Init ---------------- */
  renderHome();
  updateInstallUi();
  runSplash();
})();
