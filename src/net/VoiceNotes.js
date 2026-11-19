// Pesan suara: tahan tombol untuk merekam, lepas untuk mengirim.
// Rekaman dikirim ke semua pemain di room dan langsung diputar (termasuk untuk diri sendiri),
// serta tercatat di chat dengan tombol putar ulang.

const MAX_MS = 15000;
const MIN_MS = 400;
const MAX_B64 = 420000; // ±300 KB audio

function pickMime() {
  if (!window.MediaRecorder?.isTypeSupported) return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

const fmt = (ms) => `0:${String(Math.min(59, Math.round(ms / 1000))).padStart(2, '0')}`;

export class VoiceNotes {
  constructor({ audio, ui, button, voice }) {
    this.audio = audio;
    this.ui = ui;
    this.voice = voice;
    this.button = button;
    this.stream = null;
    this.rec = null;
    this.pressing = false;
    this.pill = null;
    this.bind(button);
  }

  get supported() {
    return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && window.isSecureContext);
  }

  attach({ net, me, remotes }) {
    this.net = net;
    this.me = me;
    this.remotes = remotes;
    net.onEvent('vn', (p, from) => this.receive(p, from));
  }

  bind(btn) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {}
      this.press();
    });
    const up = () => this.release();
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault()); // tahan lama di HP tidak memunculkan menu
  }

  async press() {
    if (!this.net) return;
    if (!this.supported) {
      this.ui.toast('Perekam suara tidak didukung di perangkat ini.');
      return;
    }
    this.pressing = true;
    if (!this.stream) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch {
        this.pressing = false;
        this.ui.toast('Izin mikrofon ditolak.');
        return;
      }
      if (!this.pressing) {
        this.ui.toast('Mikrofon siap — tahan tombol untuk merekam.');
        return;
      }
    }
    if (!this.pressing || this.rec) return;
    this.start();
  }

  start() {
    const mime = pickMime();
    this.chunks = [];
    try {
      this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    } catch {
      this.rec = new MediaRecorder(this.stream);
    }
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.onstop = () => this.finish();
    this.rec.start();
    this.t0 = performance.now();
    this.audio.play('click');
    this.button.classList.add('recording');
    this.showPill();
    this.maxT = setTimeout(() => this.release(), MAX_MS);
  }

  release() {
    this.pressing = false;
    if (!this.rec || this.rec.state !== 'recording') return;
    this.dur = performance.now() - this.t0;
    clearTimeout(this.maxT);
    this.rec.stop();
    this.button.classList.remove('recording');
    this.hidePill();
  }

  showPill() {
    if (!this.pill) {
      this.pill = document.createElement('div');
      this.pill.className = 'rec-pill';
      document.getElementById('app')?.appendChild(this.pill) ?? document.body.appendChild(this.pill);
    }
    this.pill.hidden = false;
    const tick = () => {
      const ms = performance.now() - this.t0;
      this.pill.innerHTML = `<i></i><span>Merekam ${fmt(ms)}</span><small>lepas untuk kirim</small>`;
    };
    tick();
    this.pillT = setInterval(tick, 250);
  }

  hidePill() {
    clearInterval(this.pillT);
    if (this.pill) this.pill.hidden = true;
  }

  async finish() {
    const type = this.rec?.mimeType || 'audio/webm';
    const chunks = this.chunks;
    this.rec = null;
    if (this.dur < MIN_MS) {
      this.ui.toast('Tahan tombol lebih lama untuk merekam.');
      return;
    }
    const blob = new Blob(chunks, { type });
    const b64 = toB64(await blob.arrayBuffer());
    if (b64.length > MAX_B64) {
      this.ui.toast('Rekaman terlalu besar.');
      return;
    }
    const me = this.me();
    const msg = { id: `${me.id}-${Date.now()}`, d: b64, m: type.slice(0, 40), ms: Math.round(Math.min(this.dur, MAX_MS)), n: me.name, c: me.color, at: Date.now() };
    this.net.sendEvent('vn', msg);
    this.show(msg, me.id);
  }

  receive(p, from) {
    if (!p || typeof p.d !== 'string' || p.d.length > MAX_B64 || !/^[A-Za-z0-9+/=]+$/.test(p.d.slice(0, 64))) return;
    const rp = this.remotes?.get(from);
    const msg = {
      id: String(p.id || `${from}-${Date.now()}`).slice(0, 64),
      d: p.d,
      m: typeof p.m === 'string' && /^audio\/[\w.+-]+(;\s*codecs=[\w.]+)?$/.test(p.m) ? p.m : 'audio/webm',
      ms: Math.max(0, Math.min(MAX_MS, Number(p.ms) || 0)),
      n: rp?.name || String(p.n || 'Pemain').slice(0, 16),
      c: rp?.color || (/^#[0-9a-f]{6}$/i.test(p.c) ? p.c : '#4dabf7'),
      at: Date.now(),
    };
    this.show(msg, from);
  }

  /** Catat di chat (dengan tombol putar ulang) lalu putar sekarang. */
  show(msg, from) {
    this.ui.chatLog?.add({
      id: `vn-${msg.id}`,
      name: msg.n,
      color: msg.c,
      at: msg.at,
      voice: { ms: msg.ms, onPlay: () => this.play(msg, from) },
    });
    this.play(msg, from);
  }

  async play(msg, from) {
    const buf = fromB64(msg.d);
    const speaking = (on) => from && this.voice?.setSpeaking?.(from, on);
    const a = this.audio;
    a.unlock?.();
    if (a.ctx && a.master) {
      try {
        const ab = await a.ctx.decodeAudioData(buf.slice(0));
        const src = a.ctx.createBufferSource();
        src.buffer = ab;
        const g = a.ctx.createGain();
        g.gain.value = 1.4;
        src.connect(g).connect(a.master);
        speaking(true);
        src.onended = () => speaking(false);
        src.start();
        return;
      } catch {
        /* coba pemutar biasa */
      }
    }
    const url = URL.createObjectURL(new Blob([buf], { type: msg.m }));
    const el = new Audio(url);
    speaking(true);
    el.onended = () => {
      speaking(false);
      URL.revokeObjectURL(url);
    };
    el.play().catch(() => speaking(false));
  }
}
