// Musik latar lofi yang dibuat secara prosedural (orisinal) dengan Web Audio:
// progresi akor jazzy, bass lembut, drum swing, melodi pentatonik acak, & desis vinyl.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const PROGRESSIONS = [
  { chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], bass: [41, 40, 38, 36] }, // Fmaj7 Em7 Dm7 Cmaj7
  { chords: [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [45, 48, 52, 55]], bass: [38, 43, 36, 45] }, // Dm7 G7 Cmaj7 Am7
];
const MELODY = [72, 74, 76, 79, 81, 84, 86];

export class LofiMusic {
  constructor(ctx, dest, noise) {
    this.ctx = ctx;
    this.noise = noise;
    this.bpm = 74;
    this.playing = false;

    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    const tape = ctx.createBiquadFilter();
    tape.type = 'lowpass';
    tape.frequency.value = 3400;
    this.out.connect(tape).connect(dest);

    this.keysBus = ctx.createBiquadFilter();
    this.keysBus.type = 'lowpass';
    this.keysBus.frequency.value = 1700;
    this.keysBus.connect(this.out);

    // gema untuk keys & melodi
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.out);

    this.crackleBuf = this.makeCrackle();
  }

  makeCrackle() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * 0.012;
      if (Math.random() < 0.0004) d[i] += (Math.random() * 2 - 1) * 0.5;
    }
    return buf;
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.prog = PROGRESSIONS[0];
    this.nextTime = this.ctx.currentTime + 0.15;
    this.timer = setInterval(() => this.tick(), 50);
    this.crackle = this.ctx.createBufferSource();
    this.crackle.buffer = this.crackleBuf;
    this.crackle.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    this.crackle.connect(g).connect(this.out);
    this.crackle.start();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    try { this.crackle.stop(); } catch { /* sudah berhenti */ }
  }

  tick() {
    const sp16 = 60 / this.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      this.schedule(this.step, this.nextTime, sp16);
      this.nextTime += sp16;
      this.step++;
    }
  }

  schedule(step, t, sp16) {
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const section = Math.floor(step / 64);
    if (s === 0 && bar === 0) this.prog = PROGRESSIONS[section % 2];
    const swing = s % 4 === 2 ? sp16 * 0.3 : 0;
    const tt = t + swing;
    const r = Math.random();
    const drums = section % 4 !== 3 || bar > 1; // jeda drum sesekali

    if (drums) {
      if (s === 0 || s === 10 || (s === 7 && r < 0.3)) this.kick(tt);
      if (s === 4 || s === 12) this.snare(tt);
      if (s % 2 === 0 && Math.random() > 0.12) this.hat(tt, s % 4 === 0 ? 0.5 : 0.3);
    }
    const chord = this.prog.chords[bar];
    if (s === 0) this.chord(chord, tt, 0.55);
    if (s === 10 && r < 0.35) this.chord(chord, tt, 0.28);
    if (s === 0) this.bass(this.prog.bass[bar], tt, sp16 * 7);
    if (s === 8) this.bass(this.prog.bass[bar] + (r < 0.5 ? 7 : 0), tt, sp16 * 5);
    if (s % 2 === 0 && s !== 0 && Math.random() < 0.17) {
      const pool = Math.random() < 0.6 ? chord.map((n) => n + 12) : MELODY;
      this.lead(pool[Math.floor(Math.random() * pool.length)], tt);
    }
  }

  env(t, attack, decay, peak, dest) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }

  osc(type, freq, t, dur, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(t + dur);
    return o;
  }

  chord(notes, t, vel) {
    notes.forEach((n, i) => {
      const tn = t + i * 0.018;
      const g = this.env(tn, 0.01, 2.2, 0.07 * vel, this.keysBus);
      this.osc('sine', mtof(n), tn, 2.4, g);
      this.osc('triangle', mtof(n) * 2, tn, 2.4, this.env(tn, 0.01, 0.9, 0.012 * vel, this.keysBus), 4);
      if (i === notes.length - 1) {
        const send = this.env(tn, 0.01, 1.5, 0.03 * vel, this.delay);
        this.osc('sine', mtof(n), tn, 1.6, send);
      }
    });
  }

  bass(note, t, dur) {
    const g = this.env(t, 0.02, dur, 0.22, this.out);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    f.connect(g);
    this.osc('triangle', mtof(note), t, dur + 0.1, f);
    this.osc('sine', mtof(note), t, dur + 0.1, f);
  }

  lead(note, t) {
    const g = this.env(t, 0.03, 0.9, 0.05, this.keysBus);
    this.osc('triangle', mtof(note), t, 1.0, g);
    const send = this.env(t, 0.03, 0.8, 0.035, this.delay);
    this.osc('sine', mtof(note), t, 0.9, send);
  }

  kick(t) {
    const g = this.env(t, 0.004, 0.32, 0.55, this.out);
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.4);
  }

  noiseHit(t, dur, peak, type, freq, q = 0.8) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(this.env(t, 0.003, dur, peak, this.out));
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  snare(t) {
    this.noiseHit(t, 0.16, 0.16, 'bandpass', 1600, 0.7);
    this.osc('triangle', 185, t, 0.1, this.env(t, 0.003, 0.08, 0.08, this.out));
  }

  hat(t, vel) {
    this.noiseHit(t, 0.045, 0.06 * vel, 'highpass', 7500, 0.5);
  }
}
