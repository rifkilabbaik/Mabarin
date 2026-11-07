import { CONFIG } from '../config.js';
import { CapsuleCharacter } from '../character/CapsuleCharacter.js';
import { damp, dampAngle, lerp, lerpAngle } from '../utils/math.js';
import { FLAG_GROUNDED, FLAG_SWIM } from './LocalPlayer.js';

// Pemain lain. Posisi di-interpolasi dari snapshot (dengan jeda kecil) supaya gerakan mulus
// walau paket datang tidak teratur.
export class RemotePlayer {
  constructor({ handle, scene }) {
    this.handle = handle;
    this.id = handle.id;
    const prof = handle.getState('profile') || handle.getProfile?.() || {};
    this.character = new CapsuleCharacter({
      name: prof.name || 'Pemain',
      color: normalizeColor(prof.color),
      showName: true,
    });
    this.character.root.visible = false;
    scene.add(this.character.root);

    this.buffer = [];
    this.lastT = null;
    this.offsetSamples = [];
    this.offset = null;
    this.profileSig = '';
    this.lastChatId = null;
    this.prevY = 0;
    this.vy = 0;
    this.render = { x: 0, y: 0, z: 0, ry: 0, spd: 0, flags: FLAG_GROUNDED };
    this.hasPose = false;
  }

  get name() {
    return this.character.name;
  }

  readProfile() {
    const p = this.handle.getState('profile');
    if (!p) return;
    const sig = `${p.name}|${p.color}`;
    if (sig === this.profileSig) return;
    this.profileSig = sig;
    this.character.setProfile(p.name, normalizeColor(p.color));
  }

  readChat() {
    const c = this.handle.getState('chat');
    if (!c || c.id === this.lastChatId) return;
    const first = this.lastChatId === null;
    this.lastChatId = c.id;
    // jangan tampilkan chat lama saat baru bergabung
    if (first && Date.now() - (c.at || 0) > 8000) return;
    this.character.showChat(String(c.text).slice(0, 120));
    return c.text;
  }

  readMovement(now) {
    const m = this.handle.getState('m');
    if (!Array.isArray(m) || m.length < 7) return;
    const t = m[6];
    if (t === this.lastT) return;
    this.lastT = t;
    this.buffer.push({ t, x: m[0], y: m[1], z: m[2], ry: m[3], spd: m[4], flags: m[5] });
    if (this.buffer.length > 40) this.buffer.shift();
    // Pastikan urut (paket unreliable bisa datang tak berurutan)
    if (this.buffer.length > 1 && this.buffer[this.buffer.length - 2].t > t) this.buffer.sort((a, b) => a.t - b.t);

    // Estimasi selisih jam lokal - jam pengirim (pakai nilai minimum 4 detik terakhir).
    const sample = now - t;
    this.offsetSamples.push({ at: now, v: sample });
    while (this.offsetSamples.length && now - this.offsetSamples[0].at > 4000) this.offsetSamples.shift();
    const min = Math.min(...this.offsetSamples.map((s) => s.v));
    this.offset = this.offset === null || Math.abs(min - this.offset) > 1000 ? min : lerp(this.offset, min, 0.1);
  }

  update(dt, now) {
    this.readProfile();
    const chat = this.readChat();
    this.readMovement(now);
    if (!this.buffer.length) return chat;

    const renderT = now - this.offset - CONFIG.net.interpolationDelay;
    const buf = this.buffer;
    let target;
    if (renderT <= buf[0].t) {
      target = buf[0];
    } else if (renderT >= buf[buf.length - 1].t) {
      const last = buf[buf.length - 1];
      const prev = buf[buf.length - 2];
      const ahead = Math.min(renderT - last.t, 200);
      if (prev && ahead > 0 && last.t > prev.t) {
        const k = ahead / (last.t - prev.t);
        target = {
          x: last.x + (last.x - prev.x) * k,
          y: last.y,
          z: last.z + (last.z - prev.z) * k,
          ry: last.ry,
          spd: last.spd,
          flags: last.flags,
        };
      } else target = last;
    } else {
      let i = buf.length - 2;
      while (i > 0 && buf[i].t > renderT) i--;
      const a = buf[i], b = buf[i + 1];
      const k = (renderT - a.t) / Math.max(1, b.t - a.t);
      target = {
        x: lerp(a.x, b.x, k),
        y: lerp(a.y, b.y, k),
        z: lerp(a.z, b.z, k),
        ry: lerpAngle(a.ry, b.ry, k),
        spd: lerp(a.spd, b.spd, k),
        flags: k < 0.5 ? a.flags : b.flags,
      };
      // buang snapshot yang sudah terlalu lama
      if (i > 2) buf.splice(0, i - 2);
    }

    const r = this.render;
    const far = Math.hypot(target.x - r.x, target.z - r.z) > 12;
    if (!this.hasPose || far) {
      Object.assign(r, target);
      this.hasPose = true;
      this.prevY = r.y;
    } else {
      r.x = damp(r.x, target.x, 25, dt);
      r.y = damp(r.y, target.y, 25, dt);
      r.z = damp(r.z, target.z, 25, dt);
      r.ry = dampAngle(r.ry, target.ry, 20, dt);
      r.spd = target.spd;
      r.flags = target.flags;
    }

    this.vy = dt > 0 ? damp(this.vy, (r.y - this.prevY) / dt, 12, dt) : 0;
    this.prevY = r.y;

    const root = this.character.root;
    root.visible = true;
    root.position.set(r.x, r.y, r.z);
    root.rotation.y = r.ry;
    this.character.animate(dt, {
      speed: r.spd,
      grounded: (r.flags & FLAG_GROUNDED) !== 0,
      swimming: (r.flags & FLAG_SWIM) !== 0,
      vy: this.vy,
    });
    return chat;
  }

  dispose() {
    this.character.dispose();
  }
}

function normalizeColor(c) {
  if (!c) return '#4dabf7';
  if (typeof c === 'string') return c;
  if (c.hexString) return c.hexString;
  return '#4dabf7';
}
