import { CONFIG } from '../config.js';

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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class UI {
  constructor({ onStart, onColorChange, onChat, onChatOpenChange }) {
    this.onStart = onStart;
    this.onColorChange = onColorChange;
    this.onChat = onChat;
    this.onChatOpenChange = onChatOpenChange;

    const saved = loadProfile();
    this.name = saved.name || '';
    this.color = CONFIG.colors.includes(saved.color) ? saved.color : CONFIG.colors[Math.floor(Math.random() * 6)];

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

    const sw = $('swatches');
    for (const c of CONFIG.colors) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = c;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', `Warna ${c}`);
      b.setAttribute('aria-checked', String(c === this.color));
      b.addEventListener('click', () => this.selectColor(c));
      sw.appendChild(b);
    }

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

  selectColor(c) {
    this.color = c;
    for (const b of $('swatches').children) b.setAttribute('aria-checked', String(b.style.background === hexToRgb(c)));
    this.onColorChange?.(c);
  }

  get profile() {
    const name = (this.name || '').trim().slice(0, 16) || `Pemain${Math.floor(Math.random() * 900 + 100)}`;
    return { name, color: this.color };
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

    $('btn-chat').addEventListener('click', () => this.openChat());
    $('btn-invite').addEventListener('click', () => this.shareInvite());
    $('room-pill').addEventListener('click', () => this.shareInvite());

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
    input.addEventListener('blur', () => setTimeout(() => this.closeChat(), 50));

    window.addEventListener('keydown', (e) => {
      if (document.body.dataset.state !== 'playing') return;
      if (e.key === 'Enter' && !this.chatOpen) {
        e.preventDefault();
        this.openChat();
      }
    });
  }

  openChat() {
    if (this.chatOpen) return;
    this.chatOpen = true;
    document.body.classList.add('chatting');
    this.onChatOpenChange?.(true);
    // fokus harus sinkron (masih dalam gesture pengguna) agar keyboard HP muncul
    $('chat-input').focus();
  }

  closeChat() {
    if (!this.chatOpen) return;
    this.chatOpen = false;
    document.body.classList.remove('chatting');
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
      this.toast('Mode offline: buka tab lain di browser yang sama untuk uji multiplayer lokal.');
      return;
    }
    if (navigator.share && document.body.dataset.input === 'touch') {
      try {
        await navigator.share({ title: 'Low Poly World', text: 'Ayo main bareng di Low Poly World!', url });
        return;
      } catch { /* dibatalkan, lanjut salin */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      this.toast('Link undangan disalin ke clipboard ✓');
    } catch {
      this.toast(`Bagikan link ini: ${escapeHtml(url)}`, 8000, true);
    }
  }

  toast(text, ms = 3500, html = false) {
    const el = document.createElement('div');
    el.className = 'toast';
    if (html) el.innerHTML = text;
    else el.textContent = text;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 450);
    }, ms);
  }

  toastPlayer(name, action) {
    this.toast(`<b>${escapeHtml(name)}</b> ${action}`, 3500, true);
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

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
