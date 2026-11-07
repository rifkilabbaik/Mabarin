import { CONFIG } from '../config.js';
import { ChatLog } from './ChatLog.js';
import { randomLook, sanitizeLook } from '../character/looks.js';
import { hydrateIcons, icon } from './icons.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'lowpoly-world-profile';

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}
function saveProfile(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* abaikan */ }
}

export class UI {
  constructor({ onStart, onChat, onChatOpenChange, onToggleMap, onCustomize, onExit, onVolume, getVolume, onMenuOpenChange, onGames }) {
    this.onGames = onGames;
    this.onStart = onStart;
    this.onChat = onChat;
    this.onChatOpenChange = onChatOpenChange;
    this.onToggleMap = onToggleMap;
    this.onCustomize = onCustomize;
    this.onExit = onExit;
    this.onVolume = onVolume;
    this.getVolume = getVolume;
    this.onMenuOpenChange = onMenuOpenChange;
    this.chatLog = new ChatLog($('chat-log'));
    hydrateIcons();

    const saved = loadProfile();
    this.name = saved.name || '';
    this.color = CONFIG.colors.includes(saved.color) ? saved.color : CONFIG.colors[Math.floor(Math.random() * 6)];
    this.look = saved.look ? sanitizeLook(saved.look) : randomLook();

    this.buildStartScreen();
    this.bindHud();
    this.bindInstall();
  }

  // ---------- Layar awal ----------
  buildStartScreen() {
    const nameInput = $('name-input');
    nameInput.value = this.name;
    nameInput.addEventListener('input', () => {
      this.name = nameInput.value;
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') (this.inviteRoom ? $('btn-join-invite') : $('btn-public')).click();
    });

    $('cz-dot').style.background = this.color;
    $('btn-customize').addEventListener('click', () => this.onCustomize?.());
    const soundBtn = $('btn-sound');
    const syncSound = () => {
      soundBtn.innerHTML = icon((this.getVolume?.('music') ?? 1) > 0 ? 'volume' : 'mute');
    };
    soundBtn.addEventListener('click', () => {
      const on = (this.getVolume?.('music') ?? 1) > 0;
      this.onVolume?.('music', on ? 0 : 0.6);
      syncSound();
    });
    syncSound();

    $('btn-public').addEventListener('click', () => this.start('public'));
    $('btn-private').addEventListener('click', () => this.start('private'));
    $('btn-offline').addEventListener('click', () => this.start('offline'));
    $('btn-join-invite').addEventListener('click', () => this.start('invite'));
  }

  setInvite(code) {
    this.inviteRoom = code;
    if (!code) return;
    $('invite-box').hidden = false;
    $('invite-code').textContent = code;
    $('btn-join-invite').hidden = false;
    $('btn-join-invite').textContent = `Gabung Room ${code}`;
    $('btn-public').classList.remove('primary');
  }

  /** Dipanggil oleh panel kustomisasi. */
  setAppearance({ color, look }) {
    this.color = color;
    this.look = sanitizeLook(look);
    $('cz-dot').style.background = color;
    saveProfile({ name: (this.name || '').trim().slice(0, 16), color, look: this.look });
  }

  get profile() {
    const name = (this.name || '').trim().slice(0, 16) || `Pemain${Math.floor(Math.random() * 900 + 100)}`;
    return { name, color: this.color, look: this.look };
  }

  start(mode) {
    const profile = this.profile;
    $('name-input').value = profile.name;
    this.name = profile.name;
    saveProfile(profile);
    this.setStartError('');
    this.onStart?.(mode, profile);
  }

  setStartError(msg) {
    const el = $('start-error');
    el.textContent = msg;
    el.hidden = !msg;
  }

  setBusy(busy, text = 'Menghubungkan ke server…') {
    $('loading').hidden = !busy;
    $('loading-text').textContent = text;
    for (const id of ['btn-public', 'btn-private', 'btn-offline', 'btn-join-invite']) $(id).disabled = busy;
  }

  setState(state) {
    document.body.dataset.state = state;
  }

  // ---------- HUD ----------
  bindHud() {
    $('btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) $('btn-fullscreen').hidden = true;

    $('btn-chat').addEventListener('click', () => this.toggleChat());
    $('btn-invite').addEventListener('click', () => {
      this.toggleMenu(false);
      this.shareInvite();
    });
    $('room-pill').addEventListener('click', () => this.shareInvite());

    // Menu utama (ikon garis tiga)
    $('btn-menu').addEventListener('click', () => this.toggleMenu());
    $('m-customize').addEventListener('click', () => {
      this.toggleMenu(false);
      this.onCustomize?.();
    });
    $('m-exit').addEventListener('click', () => {
      this.toggleMenu(false);
      this.confirmExit(true);
    });
    $('exit-cancel').addEventListener('click', () => this.confirmExit(false));
    $('exit-ok').addEventListener('click', () => this.onExit?.());
    for (const kind of ['music', 'sfx']) {
      const el = $(`vol-${kind}`);
      el.addEventListener('input', () => this.onVolume?.(kind, Number(el.value) / 100));
    }
    $('surface').addEventListener('pointerdown', () => this.toggleMenu(false));

    // Game & dialog umum
    $('btn-games').addEventListener('click', () => this.onGames?.());
    $('m-help').addEventListener('click', () => {
      this.toggleMenu(false);
      this.openModal('help-modal');
    });
    document.querySelectorAll('.modal [data-close]').forEach((b) =>
      b.addEventListener('click', () => this.closeModal(b.closest('.modal').id))
    );

    const form = $('chat-form');
    const input = $('chat-input');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) this.onChat?.(text);
      input.value = '';
      this.closeChat();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        input.value = '';
        this.closeChat();
      }
      e.stopPropagation();
    });
    // Ketuk/klik area game menutup chat (riwayat tetap bisa di-scroll saat terbuka)
    $('surface').addEventListener('pointerdown', () => this.closeChat());

    window.addEventListener('keydown', (e) => {
      if (document.body.dataset.state !== 'playing' || isTyping(e)) return;
      if (e.key === 'Enter' && !this.chatOpen) {
        e.preventDefault();
        this.openChat();
      } else if (e.code === 'KeyM' && !e.repeat) {
        this.onToggleMap?.();
      } else if (e.code === 'KeyG' && !e.repeat) {
        this.onGames?.();
      } else if (e.key === 'Escape') {
        this.onToggleMap?.(false);
        this.toggleMenu(false);
        this.confirmExit(false);
        document.querySelectorAll('.modal:not([hidden])').forEach((m) => {
          if (m.id !== 'afk-modal') this.closeModal(m.id);
        });
      }
    });

    $('minimap-btn').addEventListener('click', () => this.onToggleMap?.(true));
    $('map-close').addEventListener('click', () => this.onToggleMap?.(false));
    $('map-overlay').addEventListener('pointerdown', (e) => {
      if (e.target === $('map-overlay')) this.onToggleMap?.(false);
    });
  }

  toggleMenu(force) {
    const menu = $('hud-menu');
    const open = force ?? menu.hidden;
    if (open === !menu.hidden) return;
    menu.hidden = !open;
    $('btn-menu').setAttribute('aria-expanded', String(open));
    if (open) {
      for (const kind of ['music', 'sfx']) $(`vol-${kind}`).value = String(Math.round((this.getVolume?.(kind) ?? 1) * 100));
      document.exitPointerLock?.();
    }
    this.onMenuOpenChange?.(this.overlayOpen);
  }

  confirmExit(open) {
    if (open) this.openModal('confirm-exit');
    else this.closeModal('confirm-exit');
  }

  openModal(id) {
    $(id).hidden = false;
    document.exitPointerLock?.();
    this.onMenuOpenChange?.(this.overlayOpen);
  }

  closeModal(id) {
    if ($(id).hidden) return;
    $(id).hidden = true;
    this.onMenuOpenChange?.(this.overlayOpen);
  }

  /** Ada menu/dialog yang terbuka (input game dimatikan). */
  get overlayOpen() {
    return !$('hud-menu').hidden || !!document.querySelector('.modal:not([hidden])');
  }

  toggleChat() {
    if (this.chatOpen) this.closeChat();
    else this.openChat();
  }

  openChat() {
    if (this.chatOpen) return;
    this.chatOpen = true;
    document.body.classList.add('chatting');
    this.chatLog.setOpen(true);
    this.onChatOpenChange?.(true);
    // fokus harus sinkron (masih dalam gesture pengguna) agar keyboard HP muncul
    $('chat-input').focus();
  }

  closeChat() {
    if (!this.chatOpen) return;
    this.chatOpen = false;
    document.body.classList.remove('chatting');
    this.chatLog.setOpen(false);
    $('chat-input').blur();
    this.onChatOpenChange?.(false);
  }

  setNetwork(net) {
    this.net = net;
    const pill = $('room-pill');
    pill.classList.toggle('offline', net.kind === 'local');
    $('room-label').textContent =
      net.kind === 'local' ? 'Offline' : net.isPublic ? 'Dunia Publik' : `Room ${net.roomCode}`;
    $('btn-invite').hidden = net.kind === 'local';
  }

  setConnected(ok) {
    $('room-pill').classList.toggle('disconnected', !ok);
  }

  setPlayerCount(n) {
    $('player-count').textContent = String(n);
  }

  setPointerLocked(locked) {
    document.body.classList.toggle('locked', locked);
  }

  async shareInvite() {
    const url = this.net?.inviteUrl?.();
    if (!url) {
      this.toast('Mode offline tidak punya link undangan.');
      return;
    }
    if (navigator.share && document.body.dataset.input === 'touch') {
      try {
        await navigator.share({ title: 'Mabarin', text: 'Ayo mabar di Mabarin!', url });
        return;
      } catch { /* dibatalkan, lanjut salin */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      this.toast('Link undangan disalin');
    } catch {
      this.toast(`Bagikan link ini: ${url}`);
    }
  }

  // Notifikasi masuk ke riwayat chat sebagai pesan sistem.
  toast(text) {
    this.chatLog.system(text);
  }

  toastPlayer(name, action) {
    this.chatLog.system(`${name} ${action}`);
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        const el = document.documentElement;
        await (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
      }
    } catch { /* tidak didukung */ }
  }

  // ---------- PWA install ----------
  bindInstall() {
    const btn = $('btn-install');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installEvent = e;
      btn.hidden = false;
    });
    btn.addEventListener('click', async () => {
      if (!this.installEvent) return;
      this.installEvent.prompt();
      await this.installEvent.userChoice.catch(() => {});
      this.installEvent = null;
      btn.hidden = true;
    });
    window.addEventListener('appinstalled', () => {
      btn.hidden = true;
    });
  }
}


function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
