import * as THREE from 'three';
import { HostBase } from '../HostBase.js';
import { icon } from '../../ui/icons.js';
import { BLUE, FOOT_X, HEAD_X, L, MAX_SPEED, POCKETS, R, RED, ShotSim, W, clampCuePos, colorOfBall, rack, round, traceAim, validCuePos } from '../pool/physics.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GROUP_NAME = { [RED]: 'Merah', [BLUE]: 'Biru' };
const GROUP_COLOR = { [RED]: '#e03131', [BLUE]: '#1c7ed6' };
const round6 = (v) => Math.round(v * 1e6) / 1e6;

// ======================================================================
// Bandar: aturan sederhana 8-ball (dua warna + bola 8)
// ======================================================================
class PoolHost extends HostBase {
  constructor(o) {
    super({ ...o, game: 'pool', min: 2, max: 2, turnMs: 45000 });
    Object.assign(this.state, { opts: { balls: 15 }, balls: rack(15), stage: 'lobby', groups: {}, shot: null, kitchen: true, brk: true, botAim: null, starter: 1 });
    this.forfeitOnLeave = true;
    this.push();
  }

  setBallCount(n) {
    const s = this.state;
    if (s.phase === 'play') return;
    s.opts.balls = n === 9 ? 9 : 15;
    s.balls = rack(s.opts.balls);
    this.push();
  }

  setup() {
    const s = this.state;
    s.balls = rack(s.opts.balls === 9 ? 9 : 15);
    s.groups = {};
    s.shot = null;
    s.stage = 'place'; // pukulan pembuka: bola putih boleh digeser di daerah kepala
    s.kitchen = true;
    s.brk = true;
    s.botAim = null;
    s.starter = s.starter ? 0 : 1;
    this.pending = null;
    this.botPlan = null;
    this.setTurn(s.starter);
    this.push({ k: 'rack' });
  }

  remaining(group, balls = this.state.balls) {
    return balls.filter((b) => !b.in && colorOfBall(b.id) === group).length;
  }

  place(pid, x, z) {
    const s = this.state;
    if (!this.isTurn(pid) || s.stage !== 'place') return;
    const p = clampCuePos(round(+x || 0), round(+z || 0), s.kitchen);
    if (!validCuePos(s.balls, p.x, p.z, s.kitchen)) return;
    const cue = s.balls.find((b) => b.id === 0);
    cue.x = round(p.x);
    cue.z = round(p.z);
    cue.in = false;
    this.push();
  }

  shoot(pid, a) {
    const s = this.state;
    if (!this.isTurn(pid) || (s.stage !== 'aim' && s.stage !== 'place')) return;
    let dx = +a.dx, dz = +a.dz;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (!(len > 0.2)) return;
    dx /= len;
    dz /= len;
    const power = clamp(+a.power || 0, 0.03, 1);
    const cue = s.balls.find((b) => b.id === 0);
    if (cue.in) this.respotCue();
    s.shot = { n: (s.shot?.n || 0) + 1, dx: round6(dx), dz: round6(dz), v: round(power * MAX_SPEED), top: round(clamp(+a.top || 0, -1, 1)), side: round(clamp(+a.side || 0, -1, 1)) };
    const g = s.groups[pid];
    const onEight = !!g && this.remaining(g) === 0;
    const sim = new ShotSim(s.balls, s.shot).run();
    this.pending = { sim, by: pid, onEight, until: Date.now() + sim.time * 1000 + 700 };
    s.stage = 'roll';
    s.botAim = null;
    s.turnAt = Date.now() + 600000; // jam giliran berhenti selama bola bergulir
    this.push({ k: 'shot', p: pid, power });
  }

  respotCue() {
    const s = this.state;
    const cue = s.balls.find((b) => b.id === 0);
    for (let k = 0; k < 40; k++) {
      const x = HEAD_X - (k % 5) * 0.08, z = (Math.floor(k / 5) % 2 ? -1 : 1) * Math.floor(k / 10) * 0.08;
      if (validCuePos(s.balls, x, z)) {
        cue.x = round(x);
        cue.z = round(z);
        break;
      }
    }
    cue.in = false;
  }

  onTick(now) {
    if (this.pending && now >= this.pending.until) this.resolve();
    const s = this.state;
    if (this.botPlan && now >= this.botPlan.at && s.phase === 'play') {
      const { pid, plan } = this.botPlan;
      this.botPlan = null;
      if (plan.cx !== undefined && s.stage === 'place') this.place(pid, plan.cx, plan.cz);
      this.shoot(pid, plan);
    }
  }

  resolve() {
    const { sim, by, onEight } = this.pending;
    this.pending = null;
    const s = this.state;
    if (s.phase !== 'play') return;
    s.balls = sim.final();
    const g = s.groups[by] || null;
    const opp = s.players.find((p) => p.id !== by);
    const first = sim.first;
    const cuePot = sim.pots.includes(0);
    let foul = null;
    if (cuePot) foul = 'Bola putih masuk';
    else if (first === null) foul = 'Tidak kena bola';
    else if (g && onEight && first !== 8) foul = 'Harus kena bola 8 duluan';
    else if (g && !onEight && colorOfBall(first) !== g) foul = first === 8 ? 'Kena bola 8 duluan' : 'Kena bola lawan duluan';
    else if (!g && first === 8 && !s.brk) foul = 'Kena bola 8 duluan';
    const brk = s.brk;
    s.brk = false;
    s.kitchen = false;
    // bola 8 masuk
    if (sim.pots.includes(8)) {
      if (brk) {
        // masuk saat pukulan pembuka: bola 8 dikembalikan ke titik kaki
        const e = s.balls.find((b) => b.id === 8);
        e.in = false;
        e.x = FOOT_X;
        e.z = 0;
        for (let k = 0; k < 20 && !validCuePos(s.balls.filter((b) => b.id !== 8), e.x, e.z); k++) e.x = round(e.x + 0.065);
      } else if (g && onEight && !foul) return this.end(by, { why: 'eight', p: by, pots: sim.pots });
      else return this.end(opp?.id || null, { why: 'eightLose', p: by, foul, pots: sim.pots });
    }
    // meja terbuka: pemain yang pertama memasukkan bola mengunci warnanya
    const colored = sim.pots.filter((id) => id !== 0 && id !== 8);
    let assigned = null;
    if (!g && colored.length && !foul && opp) {
      assigned = colorOfBall(colored[0]);
      s.groups[by] = assigned;
      s.groups[opp.id] = assigned === RED ? BLUE : RED;
    }
    const mine = s.groups[by];
    const ownPot = mine ? colored.some((id) => colorOfBall(id) === mine) : false;
    if (foul) {
      if (cuePot) this.respotCue();
      this.setTurn(this.index(opp.id));
      s.stage = 'place'; // bola di tangan untuk lawan
      this.push({ k: 'foul', p: by, why: foul, to: opp.id, pots: sim.pots });
    } else if (ownPot || assigned) {
      s.stage = 'aim';
      s.turnAt = Date.now();
      this.push({ k: 'again', p: by, pots: sim.pots, assigned });
    } else {
      this.setTurn(this.index(opp.id));
      s.stage = 'aim';
      this.push({ k: 'switch', p: by, pots: sim.pots });
    }
  }

  onAction(a, from) {
    if (a.a === 'shoot') this.shoot(from, a);
    else if (a.a === 'place') this.place(from, a.x, a.z);
    else if (a.a === 'resign') {
      const other = this.state.players.find((p) => p.id !== from);
      this.end(other?.id || null, { why: 'resign', by: from });
    }
  }

  onTimeout(p) {
    // diam terlalu lama: dipukulkan otomatis (seperti bot)
    if (this.state.stage === 'aim' || this.state.stage === 'place') {
      const plan = planShot(this.state, p.id);
      if (plan.cx !== undefined && this.state.stage === 'place') this.place(p.id, plan.cx, plan.cz);
      this.shoot(p.id, plan);
    }
  }

  botMove(p) {
    const s = this.state;
    if (s.stage === 'roll' || this.botPlan || this.pending) return;
    const plan = planShot(s, p.id);
    s.botAim = { dx: round6(plan.dx), dz: round6(plan.dz), cx: plan.cx, cz: plan.cz };
    this.botPlan = { pid: p.id, plan, at: Date.now() + 1500 };
    this.push();
  }
}

// ---------- Bot: pilih bola & lubang (bola hantu), uji dengan simulasi ----------
function planShot(s, pid) {
  const g = s.groups[pid] || null;
  const onEight = !!g && s.balls.filter((b) => !b.in && colorOfBall(b.id) === g).length === 0;
  const targets = s.balls.filter((b) => !b.in && b.id !== 0 && (onEight ? b.id === 8 : g ? colorOfBall(b.id) === g : b.id !== 8));
  const cue0 = s.balls.find((b) => b.id === 0);
  if (s.brk) {
    const z = (Math.random() - 0.5) * 0.2;
    const apex = s.balls.filter((b) => b.id !== 0).reduce((a, b) => (b.x < a.x ? b : a));
    const dx = apex.x - HEAD_X, dz = apex.z - z, d = Math.sqrt(dx * dx + dz * dz);
    return { cx: HEAD_X, cz: round(z), dx: dx / d, dz: dz / d, power: 0.92 + Math.random() * 0.08, top: 0, side: 0 };
  }
  const placing = s.stage === 'place';
  const cues = placing ? [] : [{ x: cue0.x, z: cue0.z }];
  if (placing) {
    for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) {
      const x = -L / 2 + 0.12 + (i * (L - 0.24)) / 8, z = -W / 2 + 0.1 + (j * (W - 0.2)) / 4;
      if (validCuePos(s.balls, x, z, s.kitchen)) cues.push({ x, z });
    }
  }
  const legal = (id) => (onEight ? id === 8 : g ? colorOfBall(id) === g : id !== 8);
  const cands = [];
  for (const c of cues) {
    const balls = s.balls.map((b) => (b.id === 0 ? { ...b, x: c.x, z: c.z, in: false } : b));
    for (const t of targets) {
      for (const p of POCKETS) {
        let ux = p.x - t.x, uz = p.z - t.z;
        const d2 = Math.sqrt(ux * ux + uz * uz);
        ux /= d2;
        uz /= d2;
        const gx = t.x - ux * 2 * R, gz = t.z - uz * 2 * R;
        let ax = gx - c.x, az = gz - c.z;
        const d1 = Math.sqrt(ax * ax + az * az);
        if (d1 < 0.01) continue;
        ax /= d1;
        az /= d1;
        const cut = ax * ux + az * uz;
        if (cut < 0.3) continue;
        const tr = traceAim(balls, c.x, c.z, ax, az);
        if (tr.ball !== t.id) continue;
        // jalur bola ke lubang bersih
        let clear = true;
        for (const b of balls) {
          if (b.in || b.id === t.id || b.id === 0) continue;
          const wx = b.x - t.x, wz = b.z - t.z;
          const proj = wx * ux + wz * uz;
          if (proj < 0 || proj > d2) continue;
          const px = wx - ux * proj, pz = wz - uz * proj;
          if (px * px + pz * pz < 4 * R * R) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;
        const score = (cut * cut) / (0.4 + d1 + d2 * 1.3) * (p.corner ? 1 : 0.8);
        const power = clamp(0.22 + (d1 + d2 * 1.4) / 3.4 + (1 - cut) * 0.3, 0.2, 0.9);
        cands.push({ score, c, dx: ax, dz: az, power, target: t.id, balls });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  let best = null, bestV = -Infinity;
  for (const k of cands.slice(0, 8)) {
    const sim = new ShotSim(k.balls, { dx: k.dx, dz: k.dz, v: k.power * MAX_SPEED, top: 0, side: 0 }).run();
    let v = k.score;
    if (sim.pots.includes(0) || sim.first === null || !legal(sim.first)) v -= 10;
    if (sim.pots.includes(8) && !onEight) v -= 20;
    if (sim.pots.some((id) => legal(id) && id !== 0)) v += 5;
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  if (!best) {
    // tidak ada pukulan bersih: pukul bola sah terdekat
    const c = cues[0] || { x: cue0.x, z: cue0.z };
    const t = targets.reduce((a, b) => ((b.x - c.x) ** 2 + (b.z - c.z) ** 2 < (a.x - c.x) ** 2 + (a.z - c.z) ** 2 ? b : a), targets[0] || s.balls[1]);
    const dx = t.x - c.x, dz = t.z - c.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    best = { c, dx: dx / d, dz: dz / d, power: 0.38 };
  }
  // sedikit meleset seperti manusia
  const n = (Math.random() + Math.random() - 1) * 0.012;
  const cs = Math.cos(n), sn = Math.sin(n);
  const dx = best.dx * cs - best.dz * sn, dz = best.dx * sn + best.dz * cs;
  const out = { dx, dz, power: best.power, top: 0, side: 0 };
  if (placing) {
    out.cx = round(best.c.x);
    out.cz = round(best.c.z);
  }
  return out;
}

// ======================================================================
// Tampilan meja (semua pemain & penonton)
// ======================================================================
function ballTexture(base, spot, label) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 64);
  for (const cx of [32, 96]) {
    g.fillStyle = spot;
    g.beginPath();
    g.ellipse(cx, 32, label ? 12 : 6, label ? 13 : 6.5, 0, 0, Math.PI * 2);
    g.fill();
    if (label) {
      g.fillStyle = '#111';
      g.font = '800 17px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, cx, 33);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let ballMats = null;
function ballMaterial(id) {
  ballMats ||= {
    cue: new THREE.MeshPhongMaterial({ map: ballTexture('#f8f6ef', '#e03131'), shininess: 90, specular: '#666' }),
    [RED]: new THREE.MeshPhongMaterial({ map: ballTexture('#e03131', '#ffe3e3'), shininess: 90, specular: '#555' }),
    [BLUE]: new THREE.MeshPhongMaterial({ map: ballTexture('#1c7ed6', '#d0ebff'), shininess: 90, specular: '#555' }),
    eight: new THREE.MeshPhongMaterial({ map: ballTexture('#141414', '#ffffff', '8'), shininess: 90, specular: '#777' }),
  };
  return ballMats[colorOfBall(id)];
}

function cueStick() {
  const g = new THREE.Group();
  const LEN = 1.3;
  const mk = (r1, r2, len, z0, color) => {
    const geo = new THREE.CylinderGeometry(r2, r1, len, 12).rotateX(-Math.PI / 2).translate(0, 0, z0 - len / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    m.castShadow = true;
    g.add(m);
  };
  mk(0.0062, 0.0064, 0.008, 0, '#3b82c4'); // ujung berkapur
  mk(0.0064, 0.0066, 0.02, -0.008, '#f1f3f5'); // ferrule
  mk(0.0066, 0.0095, 0.82, -0.028, '#e2c08d'); // batang
  mk(0.0095, 0.0135, LEN - 0.848, -0.848, '#3b2414'); // pangkal
  return g;
}

/** Garis bantu: kumpulan segmen pipih di atas kain. */
class Guides {
  constructor(parent) {
    this.max = 8;
    this.pos = new Float32Array(this.max * 6 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.renderOrder = 3;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(R * 0.86, R, 28), this.mesh.material);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 3;
    parent.add(this.ring);
  }

  set(segs, ring) {
    this.pos.fill(0);
    segs.slice(0, this.max).forEach(([x1, z1, x2, z2, w], i) => {
      let dx = x2 - x1, dz = z2 - z1;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const nx = (-dz / d) * w, nz = (dx / d) * w;
      const y = 0.002;
      const v = [x1 + nx, y, z1 + nz, x1 - nx, y, z1 - nz, x2 + nx, y, z2 + nz, x2 + nx, y, z2 + nz, x1 - nx, y, z1 - nz, x2 - nx, y, z2 - nz];
      this.pos.set(v, i * 18);
    });
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.visible = segs.length > 0;
    this.ring.visible = !!ring;
    if (ring) this.ring.position.set(ring.x, 0.0025, ring.z);
  }
}

class PoolRenderer {
  constructor(ctx, table) {
    this.ctx = ctx;
    this.table = table;
    this.group = new THREE.Group();
    this.group.position.set(table.x, table.y, table.z);
    ctx.scene.add(this.group);
    // bidang kain tak terlihat untuk ketukan (bidik / taruh bola putih)
    this.cloth = new THREE.Mesh(new THREE.PlaneGeometry(L + 0.1, W + 0.1), new THREE.MeshBasicMaterial({ visible: false }));
    this.cloth.rotation.x = -Math.PI / 2;
    this.cloth.userData.isCloth = true;
    this.group.add(this.cloth);
    this.ballGeo = new THREE.SphereGeometry(R, 22, 16);
    this.meshes = new Map();
    this.stick = cueStick();
    this.stick.visible = false;
    this.group.add(this.stick);
    this.guides = new Guides(this.group);
    this.guides.set([]);
    this.sim = null;
    this.simN = -1;
    this.evIdx = 0;
    this.lastEv = -1;
    this.strike = 0;
    this.aimView = null; // diisi kontrol pemain lokal
    this.time = 0;
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._ax = new THREE.Vector3();
  }

  sound(name, opts) {
    this.ctx.audio.playAt(name, this.table.x, this.table.z, opts);
  }

  ball(id) {
    let m = this.meshes.get(id);
    if (!m) {
      m = new THREE.Mesh(this.ballGeo, ballMaterial(id));
      m.castShadow = true;
      m.userData.ballId = id;
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.group.add(m);
      this.meshes.set(id, m);
    }
    return m;
  }

  /** Posisi bola yang sedang ditampilkan (simulasi berjalan atau state). */
  shown(m) {
    return this.sim ? this.sim.balls : m.balls || [];
  }

  update(dt, m, viewerId) {
    this.time += dt;
    const ev = m.ev;
    if (ev && ev.n !== this.lastEv) {
      if (this.lastEv !== -1) {
        if (ev.k === 'rack' || ev.k === 'start') this.sound('rack');
        if (ev.k === 'foul') this.sound('foul');
      }
      this.lastEv = ev.n;
    }
    // pukulan baru: semua perangkat mensimulasikan pukulan yang sama dari posisi yang sama
    if (m.stage === 'roll' && m.shot && m.shot.n !== this.simN && m.phase === 'play') {
      this.simN = m.shot.n;
      this.sim = new ShotSim(m.balls, m.shot);
      this.sim.n = m.shot.n;
      this.evIdx = 0;
      this.strike = 0.001;
      this.sound('cue', { strength: m.shot.v / MAX_SPEED });
    }
    if (this.sim) {
      // perangkat lambat: bila hasil resmi sudah datang, kejar animasi lebih cepat (hasilnya sama persis)
      this.sim.step(m.stage === 'roll' ? dt : dt * 3);
      const evs = this.sim.events;
      for (; this.evIdx < evs.length; this.evIdx++) {
        const e = evs[this.evIdx];
        if (e.k === 'hit') this.sound('ballHit', { strength: clamp(e.s / 3, 0.05, 1) });
        else if (e.k === 'rail' && e.s > 0.15) this.sound('cushion', { strength: clamp(e.s / 3, 0.1, 1) });
        else if (e.k === 'pot') this.sound('pocket');
      }
      if (m.stage !== 'roll' && this.sim.done) {
        this.lastSim = this.sim;
        this.sim = null; // animasi selesai & hasil resmi sudah datang
      }
    }
    const balls = this.shown(m);
    const seen = new Set();
    for (const b of balls) {
      seen.add(b.id);
      const mesh = this.ball(b.id);
      let x = b.x, z = b.z;
      if (b.id === 0 && this.aimView?.place) {
        x = this.aimView.place.x;
        z = this.aimView.place.z;
      }
      const dx = x - mesh.position.x, dz = z - mesh.position.z;
      const moved = Math.sqrt(dx * dx + dz * dz);
      if (b.in) {
        // jatuh ke lubang lalu hilang
        if (mesh.visible) {
          mesh.position.x += dx * Math.min(1, dt * 14);
          mesh.position.z += dz * Math.min(1, dt * 14);
          mesh.position.y -= dt * 0.25;
          if (mesh.position.y < -0.05) mesh.visible = false;
        }
        continue;
      }
      if (!mesh.visible || moved > 0.5) {
        mesh.visible = true;
        mesh.position.set(x, R, z);
        continue;
      }
      // gulir: putar sesuai jarak tempuh
      if (moved > 1e-5) {
        this._ax.set(dz, 0, -dx).normalize();
        this._q.setFromAxisAngle(this._ax, moved / R);
        mesh.quaternion.premultiply(this._q);
      }
      mesh.position.set(x, R, z);
    }
    for (const [id, mesh] of this.meshes) if (!seen.has(id)) mesh.visible = false;
    this.updateStick(dt, m, viewerId);
  }

  /** Stik & garis bantu untuk pemain yang sedang giliran. */
  updateStick(dt, m, viewerId) {
    const shooter = m.players?.[m.turn];
    const cueB = (m.balls || []).find((b) => b.id === 0);
    let aim = null;
    if (m.phase === 'play' && (m.stage === 'aim' || m.stage === 'place') && shooter && cueB && !cueB.in) {
      if (shooter.id === viewerId) aim = this.aimView;
      else if (shooter.bot && m.botAim) aim = { cx: m.botAim.cx ?? cueB.x, cz: m.botAim.cz ?? cueB.z, dx: m.botAim.dx, dz: m.botAim.dz, pull: 0.15 + Math.sin(this.time * 3) * 0.1 };
      else if (!shooter.bot) {
        const ch = this.ctx.characterOf(shooter.id);
        if (ch && m.stage === 'aim') {
          const f = ch.root.rotation.y;
          aim = { cx: cueB.x, cz: cueB.z, dx: Math.sin(f), dz: Math.cos(f), pull: 0.1 };
        }
      }
      // pemain lain yang sedang membidik tampil membungkuk memegang stik
      for (const p of m.players) {
        if (p.id === viewerId) continue;
        const ch = this.ctx.characterOf(p.id);
        if (ch && !p.bot) ch.cuePose = p.id === shooter.id && m.stage === 'aim' ? 1 : 0;
      }
    } else if (m.players) {
      for (const p of m.players) {
        const ch = p.id !== viewerId && !p.bot && this.ctx.characterOf(p.id);
        if (ch) ch.cuePose = 0;
      }
    }
    if (this.strike > 0) {
      // hentakan stik saat memukul
      this.strike += dt;
      if (this.strike > 0.35) this.strike = 0;
    }
    const show = aim && !(aim.place && aim.placing);
    if (show) {
      this.lastAim = aim;
      const cx = aim.cx ?? cueB.x, cz = aim.cz ?? cueB.z;
      const back = R + 0.012 + (aim.pull || 0) * 0.28;
      this.stick.position.set(cx - aim.dx * back, R + 0.004, cz - aim.dz * back);
      this.stick.lookAt(this._v.set(this.group.position.x + cx + aim.dx, this.group.position.y + R + 0.004, this.group.position.z + cz + aim.dz));
      this.stick.rotateX(0.07);
      this.stick.visible = true;
    } else if (this.strike > 0 && this.lastAim) {
      const t = this.strike;
      const a = this.lastAim;
      const cx = a.cx ?? cueB?.x ?? 0, cz = a.cz ?? cueB?.z ?? 0;
      const back = t < 0.08 ? R + 0.012 + (a.pull || 0.3) * 0.28 * (1 - t / 0.08) : R + 0.012 - 0.04 * Math.min(1, (t - 0.08) / 0.05);
      this.stick.position.set(cx - a.dx * back, R + 0.004, cz - a.dz * back);
      this.stick.visible = t < 0.3;
    } else this.stick.visible = false;
    // garis lintasan hanya untuk pemain yang membidik
    if (aim && aim.guides) this.guides.set(aim.guides.segs, aim.guides.ring);
    else this.guides.set([]);
  }

  dispose() {
    this.group.removeFromParent();
  }

  /** Posisi bot: berdiri di belakang bola putih saat membidik, selain itu di ujung meja. */
  botPose(m, idx, pid) {
    const t = this.table;
    const cueB = (m.balls || []).find((b) => b.id === 0);
    if (m.phase === 'play' && m.players[m.turn]?.id === pid && m.botAim && cueB && m.stage !== 'roll') {
      const cx = m.botAim.cx ?? cueB.x, cz = m.botAim.cz ?? cueB.z;
      const p = standSpot(cx, cz, m.botAim.dx, m.botAim.dz);
      return { x: t.x + p.x, z: t.z + p.z, y: t.ground, rot: Math.atan2(m.botAim.dx, m.botAim.dz), cue: 1 };
    }
    const s = t.seats[idx] || t.seats[0];
    return { x: s.x, z: s.z, y: t.ground, rot: Math.atan2(t.x - s.x, t.z - s.z), cue: 0 };
  }
}

/** Titik berdiri di luar meja, di belakang bola putih searah garis bidik. */
const STAND = 0.42;
function standSpot(cx, cz, dx, dz) {
  const ex = L / 2 + STAND, ez = W / 2 + STAND;
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (cx + ex) / dx);
  if (dx < -1e-6) t = Math.min(t, (cx - ex) / dx);
  if (dz > 1e-6) t = Math.min(t, (cz + ez) / dz);
  if (dz < -1e-6) t = Math.min(t, (cz - ez) / dz);
  if (!Number.isFinite(t)) t = 1;
  return { x: cx - dx * t, z: cz - dz * t };
}

// ======================================================================
// Kontrol pemain: POV, bidik 2 lapis, garis lintasan, spin, power tarik-lepas, bola di tangan
// ======================================================================
const $ = (id) => document.getElementById(id);

class PoolControls {
  constructor(ctx) {
    this.ctx = ctx;
    this.aim = 0;
    this.zoom = 0.5;
    this.power = 0;
    this.pulling = null;
    this.spin = { top: 0, side: 0 };
    this.place = null;
    this.placing = false;
    this.topHold = false;
    this.topK = 0;
    this.fov = 62;
    this.aimInit = -1;
    this.dragCue = null;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._up = new THREE.Vector3(0, 1, 0);
    this.ray = new THREE.Raycaster();
  }

  // ---------- HUD ----------
  enter() {
    this.btnResign = this.ctx.topButton('flag', 'Menyerah', () => {
      if (confirm('Menyerah?')) this.ctx.act({ a: 'resign' });
    }, 'cu-resign');
    const ui = document.createElement('div');
    ui.id = 'pool-ui';
    ui.innerHTML = `
      <div class="pl-status" id="pl-status"></div>
      <div class="pl-power" id="pl-power" title="Tarik ke bawah lalu lepas untuk memukul">
        <div class="pl-track"><div class="pl-fill" id="pl-fill"></div><div class="pl-handle" id="pl-handle"></div></div>
        <span class="pl-cap" id="pl-cap">Tarik</span>
      </div>
      <div class="pl-fine" id="pl-fine" title="Geser untuk bidik halus"><div class="pl-ticks" id="pl-ticks"></div></div>
      <button type="button" class="pl-spin" id="pl-spin" title="Efek bola putih" aria-label="Efek bola putih"><span class="pl-ball"><i id="pl-dot"></i></span></button>
      <button type="button" class="pl-top icon-btn" id="pl-top" title="Tahan untuk melihat dari atas" aria-label="Lihat atas">${icon('topView')}</button>
      <button type="button" class="btn primary pl-done" id="pl-done" hidden>${icon('check')}<span>Selesai</span></button>
      <div class="pl-spinpanel" id="pl-spinpanel" hidden>
        <div class="pl-bigball" id="pl-bigball"><i id="pl-bigdot"></i></div>
        <div class="pl-spinrow"><span>Efek bola putih</span><button type="button" class="btn" id="pl-spinreset">Tengah</button></div>
      </div>`;
    $('cards-ui').appendChild(ui);
    this.ui = ui;
    this.bindHud();
  }

  exit() {
    this.ui?.remove();
    const local = this.ctx.local();
    if (local) local.character.cuePose = 0;
  }

  bindHud() {
    const power = $('pl-power');
    const track = power.querySelector('.pl-track');
    power.addEventListener('pointerdown', (e) => {
      if (!this.canShoot) return;
      e.preventDefault();
      power.setPointerCapture(e.pointerId);
      this.pulling = { id: e.pointerId, y0: e.clientY, h: track.getBoundingClientRect().height };
    });
    power.addEventListener('pointermove', (e) => {
      if (!this.pulling || this.pulling.id !== e.pointerId) return;
      this.power = clamp((e.clientY - this.pulling.y0) / (this.pulling.h * 0.92), 0, 1);
    });
    const release = (e) => {
      if (!this.pulling || this.pulling.id !== e.pointerId) return;
      this.pulling = null;
      if (this.power > 0.04 && this.canShoot) this.shoot();
      this.power = 0;
    };
    power.addEventListener('pointerup', release);
    power.addEventListener('pointercancel', (e) => {
      this.pulling = null;
      this.power = 0;
    });
    // bidik halus: geser strip vertikal
    const fine = $('pl-fine');
    fine.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fine.setPointerCapture(e.pointerId);
      this.fineDrag = { id: e.pointerId, y: e.clientY };
    });
    fine.addEventListener('pointermove', (e) => {
      if (!this.fineDrag || this.fineDrag.id !== e.pointerId) return;
      const dy = e.clientY - this.fineDrag.y;
      this.fineDrag.y = e.clientY;
      if (this.canAim) this.aim += dy * 0.0011;
      this.fineOffset = (this.fineOffset || 0) + dy;
      $('pl-ticks').style.backgroundPositionY = `${this.fineOffset}px`;
    });
    const fineEnd = () => (this.fineDrag = null);
    fine.addEventListener('pointerup', fineEnd);
    fine.addEventListener('pointercancel', fineEnd);
    // pemilih efek (spin)
    $('pl-spin').addEventListener('click', () => {
      $('pl-spinpanel').hidden = !$('pl-spinpanel').hidden;
      this.ctx.audio.play('click');
    });
    const big = $('pl-bigball');
    const setSpin = (e) => {
      const r = big.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const d = Math.sqrt(x * x + y * y);
      if (d > 0.8) {
        x *= 0.8 / d;
        y *= 0.8 / d;
      }
      this.spin = { side: x / 0.8, top: -y / 0.8 };
      this.renderSpin();
    };
    big.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      big.setPointerCapture(e.pointerId);
      this.spinDrag = e.pointerId;
      setSpin(e);
    });
    big.addEventListener('pointermove', (e) => this.spinDrag === e.pointerId && setSpin(e));
    big.addEventListener('pointerup', () => {
      this.spinDrag = null;
      setTimeout(() => ($('pl-spinpanel').hidden = true), 250);
    });
    $('pl-spinreset').addEventListener('click', () => {
      this.spin = { top: 0, side: 0 };
      this.renderSpin();
    });
    // lihat dari atas (tahan)
    const top = $('pl-top');
    top.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      top.setPointerCapture(e.pointerId);
      this.topHold = true;
      top.classList.add('on');
    });
    const topEnd = () => {
      this.topHold = false;
      top.classList.remove('on');
    };
    top.addEventListener('pointerup', topEnd);
    top.addEventListener('pointercancel', topEnd);
    // selesai menaruh bola putih
    $('pl-done').addEventListener('click', () => {
      if (!this.place) return;
      this.ctx.act({ a: 'place', x: this.place.x, z: this.place.z });
      this.placing = false;
      this.ctx.audio.play('click');
    });
    // geser bola putih (bola di tangan) di layar
    const surface = $('surface');
    this.onDown = (e) => {
      if (!this.placing || !this.place) return;
      const p = this.clothPoint(e.clientX, e.clientY);
      if (p && Math.hypot(p.x - this.place.x, p.z - this.place.z) < R * 4) this.dragCue = e.pointerId;
    };
    this.onMove = (e) => {
      if (this.dragCue !== e.pointerId) return;
      const p = this.clothPoint(e.clientX, e.clientY);
      if (!p) return;
      const c = clampCuePos(p.x, p.z, this.kitchen);
      if (validCuePos(this.balls || [], c.x, c.z, this.kitchen)) this.place = { x: round(c.x), z: round(c.z) };
    };
    this.onUp = (e) => {
      if (this.dragCue === e.pointerId) this.dragCue = null;
    };
    surface.addEventListener('pointerdown', this.onDown, true);
    surface.addEventListener('pointermove', this.onMove, true);
    surface.addEventListener('pointerup', this.onUp, true);
    this.cleanup = () => {
      surface.removeEventListener('pointerdown', this.onDown, true);
      surface.removeEventListener('pointermove', this.onMove, true);
      surface.removeEventListener('pointerup', this.onUp, true);
    };
    const exit = this.exit.bind(this);
    this.exit = () => {
      this.cleanup();
      exit();
    };
  }

  renderSpin() {
    const s = this.spin;
    const pos = (el, k) => {
      el.style.left = `${50 + s.side * 40 * k}%`;
      el.style.top = `${50 - s.top * 40 * k}%`;
    };
    pos($('pl-dot'), 1);
    pos($('pl-bigdot'), 1);
  }

  clothPoint(x, y) {
    const r = this.ctx.renderer(this.m);
    if (!r) return null;
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.ctx.camera);
    const hit = this.ray.intersectObject(r.cloth, false)[0];
    if (!hit) return null;
    return r.group.worldToLocal(hit.point.clone());
  }

  // ---------- Logika per frame ----------
  myTurn(m) {
    return m.phase === 'play' && m.players[m.turn]?.id === this.ctx.myId;
  }

  cueBall(m) {
    return (m.balls || []).find((b) => b.id === 0);
  }

  update(dt, m) {
    this.m = m;
    this.btnResign.hidden = m.phase !== 'play';
    const r = this.ctx.renderer(m);
    const mine = this.myTurn(m);
    const cue = this.cueBall(m);
    this.balls = m.balls;
    this.kitchen = !!m.kitchen;
    // giliran baru: bidik awal ke arah bola sah terdekat / susunan bola
    const turnKey = `${m.ev?.n}|${m.turn}|${m.stage}`;
    if (mine && (m.stage === 'aim' || m.stage === 'place') && this.aimInit !== turnKey && cue) {
      this.aimInit = turnKey;
      this.initAim(m);
      if (m.stage === 'place') {
        this.placing = true;
        this.place = { x: cue.x, z: cue.z };
        this.ctx.flash(m.brk ? 'Taruh bola putih, lalu Selesai' : 'Bola di tangan');
      } else {
        this.placing = false;
        this.place = null;
      }
    }
    if (!mine || m.stage === 'roll') {
      this.placing = false;
      if (m.stage === 'roll') this.place = null;
    }
    this.canAim = mine && (m.stage === 'aim' || (m.stage === 'place' && !this.placing));
    this.canShoot = this.canAim && !!cue;
    // HUD
    this.ui.hidden = m.phase !== 'play';
    $('pl-power').classList.toggle('off', !this.canShoot);
    $('pl-fine').classList.toggle('off', !this.canAim);
    $('pl-spin').hidden = !mine || m.stage === 'roll';
    $('pl-done').hidden = !(mine && this.placing);
    $('pl-fill').style.height = `${this.power * 100}%`;
    $('pl-handle').style.top = `${this.power * 92}%`;
    $('pl-cap').textContent = this.power > 0.04 ? `${Math.round(this.power * 100)}%` : 'Tarik';
    this.renderStatus(m);
    // bidikan untuk tampilan (stik & garis bantu)
    const local = this.ctx.local();
    const c = this.place || cue;
    if (r) {
      r.aimView = mine && c && (m.stage === 'aim' || m.stage === 'place')
        ? { cx: c.x, cz: c.z, dx: Math.cos(this.aim), dz: Math.sin(this.aim), pull: this.power, place: this.place, placing: this.placing, guides: this.canAim ? this.guides(m, c) : null }
        : null;
    }
    // berdiri: di belakang bola putih saat membidik (berjalan memutari meja), selain itu di ujung meja
    const t = this.ctx.tableOf(m);
    if (local && t) {
      if (mine && c && m.stage !== 'roll' && !this.placing) {
        const p = standSpot(c.x, c.z, Math.cos(this.aim), Math.sin(this.aim));
        local.pin = { x: t.x + p.x, z: t.z + p.z, facing: Math.atan2(Math.cos(this.aim), Math.sin(this.aim)) };
        local.character.cuePose = 1;
      } else if (!(mine && m.stage === 'roll')) {
        const idx = m.players.findIndex((p) => p.id === this.ctx.myId);
        const s = t.seats[idx] || t.seats[0];
        local.pin = { x: s.x, z: s.z, facing: Math.atan2(t.x - s.x, t.z - s.z) };
        local.character.cuePose = 0;
      } else local.character.cuePose = 0;
    }
  }

  initAim(m) {
    const cue = this.place || this.cueBall(m);
    const g = m.groups?.[this.ctx.myId];
    const onEight = g && !(m.balls || []).some((b) => !b.in && colorOfBall(b.id) === g);
    let best = null, bd = Infinity;
    for (const b of m.balls || []) {
      if (b.in || b.id === 0) continue;
      const ok = onEight ? b.id === 8 : g ? colorOfBall(b.id) === g : b.id !== 8;
      if (!ok) continue;
      const d = (b.x - cue.x) ** 2 + (b.z - cue.z) ** 2;
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (m.brk) best = (m.balls || []).filter((b) => b.id !== 0).reduce((a, b) => (b.x < a.x ? b : a));
    if (best) this.aim = Math.atan2(best.z - cue.z, best.x - cue.x);
  }

  /** Garis lintasan: bola putih → sentuhan pertama; arah bola sasaran & pantulan bola putih. */
  guides(m, c) {
    const dx = Math.cos(this.aim), dz = Math.sin(this.aim);
    const balls = (m.balls || []).map((b) => (b.id === 0 ? { ...b, x: c.x, z: c.z } : b));
    const tr = traceAim(balls, c.x, c.z, dx, dz);
    const segs = [[c.x + dx * R, c.z + dz * R, tr.x - dx * R * 0.9, tr.z - dz * R * 0.9, 0.0028]];
    if (tr.ball !== null) {
      // arah bola sasaran (sepanjang garis pusat ke pusat)
      const bx = tr.x + tr.nx * 2 * R, bz = tr.z + tr.nz * 2 * R;
      const along = dx * tr.nx + dz * tr.nz; // makin lurus makin panjang
      const lenB = 0.12 + 0.45 * along;
      segs.push([bx + tr.nx * R, bz + tr.nz * R, bx + tr.nx * (R + lenB), bz + tr.nz * (R + lenB), 0.0028]);
      // bola putih setelah benturan: tegak lurus, dibengkokkan oleh efek atas/bawah
      let tx = dx - tr.nx * along, tz = dz - tr.nz * along;
      const tl = Math.sqrt(tx * tx + tz * tz);
      if (tl > 1e-3) {
        tx /= tl;
        tz /= tl;
      }
      const k = this.spin.top * 0.6;
      let qx = tx * (1 - Math.abs(k)) + dx * k, qz = tz * (1 - Math.abs(k)) + dz * k;
      const ql = Math.sqrt(qx * qx + qz * qz) || 1;
      qx /= ql;
      qz /= ql;
      const lenC = 0.08 + 0.2 * (1 - along) + Math.abs(k) * 0.15;
      segs.push([tr.x + qx * R, tr.z + qz * R, tr.x + qx * (R + lenC), tr.z + qz * (R + lenC), 0.0018]);
      this.targetLegal = this.isLegal(m, tr.ball);
    } else {
      // memantul di bantalan
      const rx = tr.nx ? -dx : dx, rz = tr.nz ? -dz : dz;
      segs.push([tr.x, tr.z, tr.x + rx * 0.3, tr.z + rz * 0.3, 0.0018]);
      this.targetLegal = true;
    }
    return { segs, ring: { x: tr.x, z: tr.z } };
  }

  isLegal(m, id) {
    const g = m.groups?.[this.ctx.myId];
    const onEight = g && !(m.balls || []).some((b) => !b.in && colorOfBall(b.id) === g);
    if (m.brk) return true;
    return onEight ? id === 8 : g ? colorOfBall(id) === g : id !== 8;
  }

  renderStatus(m) {
    const el = $('pl-status');
    if (m.phase !== 'play') return (el.innerHTML = '');
    const g = m.groups?.[this.ctx.myId];
    const left = (grp) => (m.balls || []).filter((b) => !b.in && colorOfBall(b.id) === grp).length;
    const dot = (grp) => `<i style="background:${GROUP_COLOR[grp]}"></i>`;
    let html;
    if (!g) html = `<span>Meja terbuka</span><span>${dot(RED)}${left(RED)} ${dot(BLUE)}${left(BLUE)}</span>`;
    else {
      const other = g === RED ? BLUE : RED;
      html = `<span>Kamu ${dot(g)}${left(g) || '<b>bola 8</b>'}</span><span>Lawan ${dot(other)}${left(other) || '<b>bola 8</b>'}</span>`;
    }
    if (this.canAim && this.targetLegal === false) html += '<span class="pl-warn">Bola lawan!</span>';
    if (el.dataset.sig !== html) {
      el.dataset.sig = html;
      el.innerHTML = html;
    }
  }

  shoot() {
    const m = this.m;
    this.ctx.act({ a: 'shoot', dx: Math.cos(this.aim), dz: Math.sin(this.aim), power: this.power, top: this.spin.top, side: this.spin.side });
    this.spin = { top: 0, side: 0 };
    this.renderSpin();
    $('pl-spinpanel').hidden = true;
  }

  // ---------- Kamera: POV di belakang stik, tahan untuk lihat dari atas ----------
  cameraPose(dt, pos, quat) {
    const m = this.m;
    const t = m && this.ctx.tableOf(m);
    if (!t) return;
    const mine = this.myTurn(m);
    const cue = this.place || this.cueBall(m);
    const wantTop = this.topHold || (mine && this.placing);
    this.topK += ((wantTop ? 1 : 0) - this.topK) * Math.min(1, dt * 7);
    // POV
    if (mine && cue && m.stage !== 'roll' || (mine && m.stage === 'roll' && this.lastPov)) {
      if (m.stage !== 'roll') {
        const dx = Math.cos(this.aim), dz = Math.sin(this.aim);
        const p = standSpot(cue.x, cue.z, dx, dz);
        const k = this.zoom;
        const ex = p.x + (cue.x - dx * 0.55 - p.x) * k, ez = p.z + (cue.z - dz * 0.55 - p.z) * k;
        const ey = 0.48 + (0.2 - 0.48) * k;
        this.lastPov = { ex, ey, ez, lx: cue.x + dx * 0.6, lz: cue.z + dz * 0.6 };
      }
    } else {
      // menunggu: dari tempat berdiri, melihat ke tengah meja
      const idx = m.players.findIndex((p) => p.id === this.ctx.myId);
      const s = t.seats[idx] || t.seats[0];
      this.lastPov = { ex: s.x - t.x, ey: t.ground + 1.3 - t.y, ez: s.z - t.z, lx: 0, lz: 0 };
    }
    const P = this.lastPov;
    this._a.set(t.x + P.ex, t.y + P.ey, t.z + P.ez);
    this._b.set(t.x + P.lx, t.y, t.z + P.lz);
    pos.copy(this._a);
    quat.setFromRotationMatrix(this._m.lookAt(this._a, this._b, this._up));
    if (this.topK > 0.001) {
      // tampak atas: seluruh meja terlihat (memanjang mengikuti orientasi layar)
      const cam = this.ctx.camera;
      const aspect = cam.aspect || 1;
      const tan = Math.tan(THREE.MathUtils.degToRad(this.fov / 2));
      const landscape = aspect >= 1;
      const halfV = landscape ? W / 2 + 0.22 : L / 2 + 0.22;
      const halfH = landscape ? L / 2 + 0.22 : W / 2 + 0.22;
      const h = Math.max(halfV, halfH / aspect) / tan;
      const topPos = new THREE.Vector3(t.x, t.y + h, t.z);
      const up = landscape ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(1, 0, 0);
      const q2 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(topPos, new THREE.Vector3(t.x, t.y, t.z), up));
      pos.lerp(topPos, this.topK);
      quat.slerp(q2, this.topK);
    }
  }

  applyLook({ yaw, pitch, zoom = 0 }) {
    if (this.dragCue !== null && this.dragCue !== undefined) return;
    if (this.canAim && !this.topHold) this.aim -= yaw * 1.1; // bidik kasar: geser layar
    this.zoom = clamp(this.zoom + pitch * 0.9 - zoom * 0.05, 0, 0.92);
  }

  targets(m) {
    const r = this.ctx.renderer(m);
    if (!r) return [];
    return [...r.meshes.values()].filter((x) => x.visible && x.userData.ballId !== 0).concat([r.cloth]);
  }

  click(obj, m) {
    if (!obj || m.phase !== 'play') return;
    if (!this.myTurn(m)) return;
    if (this.placing) return;
    // ketuk bola: bidikan langsung mengarah ke bola itu (bidik kasar)
    const id = obj.userData.ballId;
    const c = this.place || this.cueBall(m);
    if (id !== undefined && c && this.canAim) {
      const b = m.balls.find((x) => x.id === id);
      if (b) {
        this.aim = Math.atan2(b.z - c.z, b.x - c.x);
        this.ctx.audio.play('click');
      }
    }
  }

  lobby(el, m, isHost) {
    if (m.phase !== 'lobby') {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const n = m.opts?.balls === 9 ? 9 : 15;
    const sig = `${n}|${isHost}`;
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    el.innerHTML = `<span class="cu-opt-label">Jumlah bola</span><div class="cu-seg">
      <button type="button" data-n="15" class="${n === 15 ? 'on' : ''}" ${isHost ? '' : 'disabled'}>15 bola</button>
      <button type="button" data-n="9" class="${n === 9 ? 'on' : ''}" ${isHost ? '' : 'disabled'}>9 bola</button></div>`;
    el.querySelectorAll('[data-n]').forEach((b) =>
      b.addEventListener('click', () => {
        this.ctx.ownHost()?.setBallCount(+b.dataset.n);
        this.ctx.audio.play('click');
      })
    );
  }

  playerColor(m, p) {
    const g = m.groups?.[p.id];
    return g ? GROUP_COLOR[g] : '#f8f9fa';
  }

  onEvent(ev, m) {
    const name = this.ctx.playerName;
    if (ev.k === 'foul') this.ctx.flash(`Foul: ${ev.why}. ${ev.to === this.ctx.myId ? 'Bola di tangan untukmu' : `${name(ev.to)} dapat bola di tangan`}`);
    else if (ev.k === 'again') this.ctx.flash(ev.assigned ? `${name(ev.p)} memakai bola ${GROUP_NAME[ev.assigned]}` : ev.p === this.ctx.myId ? 'Masuk! Pukul lagi' : `${name(ev.p)} lanjut`);
    else if (ev.k === 'switch' && m.players[m.turn]?.id === this.ctx.myId) this.ctx.flash('Giliranmu');
  }

  endText(m) {
    const ev = m.ev;
    const name = this.ctx.playerName;
    if (ev.why === 'resign') return `${name(ev.by)} menyerah`;
    if (ev.why === 'eight') return m.winner === this.ctx.myId ? 'Bola 8 masuk — kamu menang!' : `${name(m.winner)} memasukkan bola 8 dan menang`;
    if (ev.why === 'eightLose') return `${name(ev.p)} memasukkan bola 8 ${ev.foul ? 'sambil foul' : 'terlalu cepat'} — ${m.winner === this.ctx.myId ? 'kamu menang!' : `${name(m.winner)} menang`}`;
    return null;
  }
}

export default {
  id: 'pool',
  name: 'Pool',
  icon: 'pool',
  art: 'radial-gradient(circle at 35% 40%, #f8f6ef 0 12%, transparent 13%), radial-gradient(circle at 62% 55%, #141414 0 12%, transparent 13%), radial-gradient(circle at 50% 30%, #e03131 0 10%, transparent 11%), radial-gradient(circle at 70% 30%, #1c7ed6 0 10%, transparent 11%), #1f8a4c',
  min: 2,
  max: 2,
  venue: 'pool',
  stand: true,
  cams: [],
  seatOrder: [0, 1],
  topView: false,
  Host: PoolHost,
  Renderer: PoolRenderer,
  Controls: PoolControls,
};
