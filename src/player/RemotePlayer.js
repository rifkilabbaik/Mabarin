import { CONFIG } from '../config.js';
import { CapsuleCharacter } from '../character/CapsuleCharacter.js';
import { damp, dampAngle, lerp, lerpAngle } from '../utils/math.js';
import { FLAG_GROUNDED, FLAG_SIT, FLAG_SWIM } from './LocalPlayer.js';
import { ITEM_IDS } from '../character/items.js';

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
      look: prof.look,
      showName: true,
    });
    this.character.root.visible = false;
    scene.add(this.character.root);

    this.buffer = [];
    this.lastT = null;
    this.offsetSamples = [];
    this.offset = null;
    this.profileSig = '';
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
    const sig = `${p.name}|${p.color}|${JSON.stringify(p.look || null)}`;
    if (sig === this.profileSig) return;
    this.profileSig = sig;
    this.character.setProfile(String(p.name || 'Pemain').slice(0, 16), normalizeColor(p.color));
    this.character.setLook(p.look); // divalidasi oleh sanitizeLook
  }

  readItem() {
    const id = this.handle.getState('item');
    if (ITEM_IDS.includes(id)) this.character.setItem(id);
  }

  get sitting() {
    return (this.render.flags & FLAG_SIT) !== 0;
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
    this.readItem();
    this.readMovement(now);
    if (!this.buffer.length) return;

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
      sitting: (r.flags & FLAG_SIT) !== 0,
      vy: this.vy,
    });
  }

  get color() {
    return this.character.color;
  }

  dispose() {
    this.character.dispose();
  }
}

function normalizeColor(c) {
  if (!c) return '#4dabf7';
  if (typeof c === 'string') return /^#[0-9a-f]{6}$/i.test(c) ? c : '#4dabf7';
  if (c.hexString) return c.hexString;
  return '#4dabf7';
}
