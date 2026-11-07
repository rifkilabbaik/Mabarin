import { LofiMusic } from './Music.js';
import { clamp, smoothstep } from '../utils/math.js';

const STORE_KEY = 'mabarin-audio';
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Akor gitar (MIDI): C, G, Am, F
const GUITAR_CHORDS = [
  [48, 52, 55, 60, 64],
  [43, 47, 50, 55, 59, 67],
  [45, 52, 57, 60, 64],
  [41, 48, 53, 57, 60, 65],
];

/**
 * Semua suara game disintesis langsung dengan Web Audio (tanpa file audio):
 * efek suara, gitar (Karplus-Strong), ambience laut & api unggun, dan musik lofi.
 */
export class AudioManager {
  constructor() {
    this.settings = { music: 0.6, sfx: 0.8 };
    try {
      Object.assign(this.settings, JSON.parse(localStorage.getItem(STORE_KEY)) || {});
    } catch { /* abaikan */ }
    this.ctx = null;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.pluckCache = new Map();
    this.fireTimer = 0;

    // Browser hanya mengizinkan audio setelah interaksi pengguna.
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.ambientGain = ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.ambientGain.connect(this.sfxGain);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.music = new LofiMusic(ctx, this.musicGain, this.noise);
    this.applyVolumes();
    this.startAmbient();
  }

  // ---------- Pengaturan ----------
  setVolume(kind, v) {
    this.settings[kind] = clamp(v, 0, 1);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.settings)); } catch { /* abaikan */ }
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(this.settings.music * 0.55, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
    if (this.settings.music > 0) this.music.start();
    else this.music.stop();
  }

  setListener(x, z, yaw) {
    this.listener.x = x;
    this.listener.z = z;
    this.listener.yaw = yaw;
  }

  // ---------- Suara posisional ----------
  spatial(x, z) {
    const L = this.listener;
    const dx = x - L.x, dz = z - L.z;
    const d = Math.hypot(dx, dz);
    if (d > 45) return null;
    const vol = 1 / (1 + (d / 7) ** 2);
    const pan = d > 0.5 ? clamp(((dx / d) * Math.cos(L.yaw) - (dz / d) * Math.sin(L.yaw)) * 0.85, -1, 1) : 0;
    return { vol, pan };
  }

  output(vol = 1, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.sfxGain);
    } else g.connect(this.sfxGain);
    return g;
  }

  play(name, opts = {}) {
    if (!this.ready || this.settings.sfx <= 0) return;
    const fn = SFX[name];
    if (!fn) return;
    const out = this.output(opts.volume ?? 1, opts.pan ?? 0);
    fn(this, out, this.ctx.currentTime + 0.005, opts);
  }

  playAt(name, x, z, opts = {}) {
    const s = this.spatial(x, z);
    if (!s || s.vol < 0.02) return;
    this.play(name, { ...opts, volume: (opts.volume ?? 1) * s.vol, pan: s.pan });
  }

  // ---------- Primitif sintesis ----------
  env(t, attack, decay, peak, dest) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }

  tone(type, f0, f1, t, dur, peak, dest) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(this.env(t, 0.005, dur, peak, dest));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hiss(t, dur, peak, dest, type, f0, f1, q = 0.8) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    src.connect(f).connect(this.env(t, 0.004, dur, peak, dest));
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  // Senar gitar dengan algoritma Karplus-Strong (buffer disimpan per nada)
  pluckBuffer(midi) {
    let buf = this.pluckCache.get(midi);
    if (buf) return buf;
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 1.8);
    buf = this.ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / mtof(midi)));
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const next = (idx + 1) % N;
      const v = ring[idx];
      ring[idx] = 0.996 * 0.5 * (v + ring[next]);
      out[i] = v * 0.5;
      idx = next;
    }
    this.pluckCache.set(midi, buf);
    return buf;
  }

  strum(chordIndex, x, z) {
    if (!this.ready || this.settings.sfx <= 0) return;
    let vol = 1, pan = 0;
    if (x !== undefined) {
      const s = this.spatial(x, z);
      if (!s) return;
      vol = s.vol;
      pan = s.pan;
    }
    const out = this.output(vol * 0.9, pan);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    lp.connect(out);
    const notes = GUITAR_CHORDS[((chordIndex % 4) + 4) % 4];
    const t = this.ctx.currentTime + 0.005;
    notes.forEach((n, i) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.pluckBuffer(n);
      const g = this.ctx.createGain();
      g.gain.value = 0.32;
      src.connect(g).connect(lp);
      src.start(t + i * 0.016);
    });
  }

  // ---------- Ambience ----------
  startAmbient() {
    const ctx = this.ctx;
    const loop = (type, freq) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.ambientGain);
      src.start();
      return g;
    };
    this.oceanGain = loop('lowpass', 420);
    this.fireGain = loop('lowpass', 260);
    this.windGain = loop('bandpass', 700);
  }

  /** Dipanggil tiap frame dengan posisi pemain. */
  updateAmbient(dt, x, z, groundH, time) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const r = Math.hypot(x, z);
    const nearSea = smoothstep(55, 105, r) + (groundH < 1.5 ? 0.45 : 0);
    const swell = 0.75 + 0.25 * Math.sin(time * 0.7) + 0.1 * Math.sin(time * 1.9);
    this.oceanGain.gain.setTargetAtTime((0.04 + 0.32 * clamp(nearSea, 0, 1)) * swell, t, 0.3);
    this.windGain.gain.setTargetAtTime(0.012 + clamp((groundH - 8) / 12, 0, 1) * 0.06, t, 0.5);

    const fire = this.spatial(0, 0);
    const fireVol = fire ? clamp(fire.vol * 1.6, 0, 1) * smoothstep(18, 4, r) : 0;
    this.fireGain.gain.setTargetAtTime(fireVol * 0.09, t, 0.3);
    // letupan kayu terbakar
    this.fireTimer -= dt;
    if (fireVol > 0.03 && this.fireTimer <= 0) {
      this.fireTimer = 0.04 + Math.random() * 0.22;
      const out = this.output(fireVol, fire.pan);
      this.hiss(t, 0.01 + Math.random() * 0.03, 0.05 + Math.random() * 0.18, out, 'bandpass', 1800 + Math.random() * 3500, 0, 2);
    }
  }
}

// ---------- Efek suara ----------
const SFX = {
  step(a, out, t, { surface = 'grass' }) {
    if (surface === 'sand') a.hiss(t, 0.09, 0.13, out, 'bandpass', 2600 + Math.random() * 500, 0, 0.6);
    else if (surface === 'water') {
      a.hiss(t, 0.14, 0.2, out, 'lowpass', 900, 300);
      a.tone('sine', 220, 130, t, 0.08, 0.05, out);
    } else a.hiss(t, 0.07, 0.2, out, 'bandpass', 900 + Math.random() * 500, 0, 0.8);
  },
  jump(a, out, t) {
    a.tone('triangle', 300, 640, t, 0.14, 0.12, out);
  },
  land(a, out, t, { strength = 1 }) {
    a.tone('sine', 140, 55, t, 0.14, 0.3 * strength, out);
    a.hiss(t, 0.08, 0.14 * strength, out, 'lowpass', 400);
  },
  splash(a, out, t) {
    a.hiss(t, 0.45, 0.32, out, 'lowpass', 2600, 300);
    a.tone('sine', 380, 160, t, 0.12, 0.05, out);
  },
  whoosh(a, out, t) {
    a.hiss(t, 0.2, 0.2, out, 'bandpass', 500, 2400, 1.3);
  },
  bonk(a, out, t) {
    a.tone('sine', 680, 150, t, 0.18, 0.4, out);
    a.tone('square', 1300, 700, t, 0.05, 0.05, out);
    a.tone('triangle', 260, 240, t + 0.02, 0.2, 0.1, out);
  },
  pew(a, out, t) {
    a.tone('sine', 1100, 340, t, 0.1, 0.12, out);
    a.hiss(t, 0.06, 0.07, out, 'highpass', 3000);
  },
  drip(a, out, t) {
    a.hiss(t, 0.14, 0.16, out, 'bandpass', 1400, 600, 1);
    a.tone('sine', 500, 1300, t, 0.07, 0.08, out);
  },
  pop(a, out, t) {
    a.tone('sine', 880, 0, t, 0.06, 0.09, out);
    a.tone('sine', 1320, 0, t + 0.07, 0.08, 0.08, out);
  },
  chime(a, out, t) {
    [1046.5, 1318.5, 1568].forEach((f, i) => a.tone('triangle', f, 0, t + i * 0.08, 0.5, 0.07, out));
  },
  leave(a, out, t) {
    [784, 659.3, 523.3].forEach((f, i) => a.tone('triangle', f, 0, t + i * 0.09, 0.45, 0.06, out));
  },
  place(a, out, t) {
    a.tone('sine', 340, 240, t, 0.07, 0.25, out);
    a.hiss(t, 0.03, 0.12, out, 'bandpass', 1800);
    a.tone('sine', 300, 210, t + 0.1, 0.07, 0.18, out);
  },
  pickup(a, out, t) {
    a.tone('sine', 480, 820, t, 0.11, 0.12, out);
  },
  sit(a, out, t) {
    a.tone('sine', 170, 90, t, 0.13, 0.22, out);
  },
  stand(a, out, t) {
    a.tone('sine', 120, 200, t, 0.1, 0.12, out);
  },
  wave(a, out, t) {
    a.tone('triangle', 660, 880, t, 0.12, 0.06, out);
    a.tone('triangle', 880, 1100, t + 0.13, 0.12, 0.05, out);
  },
  dash(a, out, t) {
    a.hiss(t, 0.22, 0.22, out, 'bandpass', 700, 2600, 1.1);
  },
  slide(a, out, t) {
    a.hiss(t, 0.5, 0.2, out, 'lowpass', 1800, 400);
  },
  kick(a, out, t, { strength = 1 }) {
    a.tone('sine', 160, 60, t, 0.12, 0.35 * strength + 0.1, out);
    a.hiss(t, 0.05, 0.15, out, 'bandpass', 1200);
  },
  hit(a, out, t, { strength = 1 }) {
    a.tone('triangle', 900, 500, t, 0.07, 0.15 + strength * 0.1, out);
    a.hiss(t, 0.04, 0.12, out, 'highpass', 2500);
  },
  whistle(a, out, t) {
    a.tone('sine', 2200, 2400, t, 0.18, 0.08, out);
    a.tone('sine', 2200, 2400, t + 0.24, 0.35, 0.08, out);
  },
  cheer(a, out, t) {
    a.hiss(t, 1.2, 0.18, out, 'bandpass', 1400, 900, 0.5);
    [523.3, 659.3, 784].forEach((f, i) => a.tone('triangle', f, 0, t + i * 0.08, 0.4, 0.06, out));
  },
  dice(a, out, t) {
    for (let i = 0; i < 5; i++) a.tone('sine', 700 + Math.random() * 500, 0, t + i * 0.06, 0.03, 0.08, out);
  },
  boom(a, out, t) {
    a.tone('sine', 120, 40, t, 0.5, 0.5, out);
    a.hiss(t, 0.6, 0.4, out, 'lowpass', 1500, 200);
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => a.tone('triangle', f, 0, t + 0.15 + i * 0.05, 0.3, 0.05, out));
  },
  click2(a, out, t) {
    a.tone('square', 300, 0, t, 0.03, 0.06, out);
  },
  card(a, out, t) {
    a.hiss(t, 0.06, 0.22, out, 'bandpass', 2600, 1200, 0.9);
    a.tone('sine', 420, 300, t, 0.05, 0.05, out);
  },
  shuffle(a, out, t) {
    for (let i = 0; i < 7; i++) a.hiss(t + i * 0.045, 0.05, 0.14, out, 'bandpass', 2200 + Math.random() * 800, 0, 1);
  },
  kilat(a, out, t) {
    [784, 1046.5, 1318.5, 1568].forEach((f, i) => a.tone('square', f, 0, t + i * 0.05, 0.18, 0.035, out));
    a.hiss(t, 0.25, 0.08, out, 'highpass', 4000);
  },
  win(a, out, t) {
    [523.3, 659.3, 784, 1046.5, 784, 1046.5].forEach((f, i) => a.tone('triangle', f, 0, t + i * 0.11, 0.4, 0.09, out));
  },
  turn(a, out, t) {
    a.tone('sine', 988, 0, t, 0.12, 0.08, out);
    a.tone('sine', 1318.5, 0, t + 0.09, 0.16, 0.07, out);
  },
  click(a, out, t) {
    a.tone('sine', 1500, 0, t, 0.025, 0.05, out);
  },
};
