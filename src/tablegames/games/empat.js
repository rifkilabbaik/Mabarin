import * as THREE from 'three';
import { HostBase } from '../HostBase.js';
import { boardGroup, outlineGeometry, pieceMaterial, woodMaterial } from '../boardKit.js';

// ---------- Aturan: papan tegak 7 kolom × 6 baris, susun 4 cakram sejajar ----------
const COLS = 7;
const ROWS = 6;
const at = (r, c) => r * COLS + c; // r = 0 baris paling bawah
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

function dropRow(grid, c) {
  for (let r = 0; r < ROWS; r++) if (!grid[at(r, c)]) return r;
  return -1;
}

/** Garis 4 (atau lebih) yang melewati (r, c), atau null. */
function lineAt(grid, r, c) {
  const v = grid[at(r, c)];
  if (!v) return null;
  for (const [dr, dc] of DIRS) {
    const cells = [at(r, c)];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && grid[at(rr, cc)] === v) {
        cells.push(at(rr, cc));
        rr += dr * s;
        cc += dc * s;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

// ---------- Bot: negamax alpha-beta ----------
const ORDER = [3, 2, 4, 1, 5, 0, 6];
function scoreWindow(a, b, c, d, me) {
  const opp = 3 - me;
  let mine = 0, theirs = 0;
  for (const x of [a, b, c, d]) {
    if (x === me) mine++;
    else if (x === opp) theirs++;
  }
  if (mine && theirs) return 0;
  if (mine === 3) return 5;
  if (mine === 2) return 2;
  if (theirs === 3) return -4;
  if (theirs === 2) return -1;
  return 0;
}

function evaluate(g, me) {
  let s = 0;
  for (let r = 0; r < ROWS; r++) if (g[at(r, 3)] === me) s += 3;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [dr, dc] of DIRS) {
        const r3 = r + dr * 3, c3 = c + dc * 3;
        if (r3 < 0 || r3 >= ROWS || c3 < 0 || c3 >= COLS) continue;
        s += scoreWindow(g[at(r, c)], g[at(r + dr, c + dc)], g[at(r + dr * 2, c + dc * 2)], g[at(r3, c3)], me);
      }
  return s;
}

function negamax(g, me, depth, alpha, beta) {
  let any = false;
  for (const c of ORDER) {
    const r = dropRow(g, c);
    if (r < 0) continue;
    any = true;
    g[at(r, c)] = me;
    const win = lineAt(g, r, c);
    g[at(r, c)] = 0;
    if (win) return 1000 + depth;
  }
  if (!any) return 0;
  if (depth === 0) return evaluate(g, me);
  let best = -Infinity;
  for (const c of ORDER) {
    const r = dropRow(g, c);
    if (r < 0) continue;
    g[at(r, c)] = me;
    const v = -negamax(g, 3 - me, depth - 1, -beta, -alpha);
    g[at(r, c)] = 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

export function empatBot(grid, me, depth = 5) {
  const g = grid.slice();
  let best = -Infinity, moves = [];
  for (const c of ORDER) {
    const r = dropRow(g, c);
    if (r < 0) continue;
    g[at(r, c)] = me;
    const v = lineAt(g, r, c) ? 10000 : -negamax(g, 3 - me, depth - 1, -Infinity, Infinity);
    g[at(r, c)] = 0;
    if (v > best + 0.5) {
      best = v;
      moves = [c];
    } else if (Math.abs(v - best) <= 0.5) moves.push(c);
  }
  return moves.length ? moves[Math.floor(Math.random() * moves.length)] : -1;
}

// ---------- Bandar ----------
class EmpatHost extends HostBase {
  constructor(o) {
    super({ ...o, game: 'empat', min: 2, max: 2, turnMs: 30000 });
    Object.assign(this.state, { grid: Array(COLS * ROWS).fill(0), last: null, line: null, starter: 1 });
    this.push();
  }

  setup() {
    const s = this.state;
    s.grid = Array(COLS * ROWS).fill(0);
    s.last = null;
    s.line = null;
    s.starter = s.starter ? 0 : 1; // bergantian yang mulai duluan
    this.setTurn(s.starter);
  }

  drop(pid, c) {
    const s = this.state;
    if (!this.isTurn(pid) || c < 0 || c >= COLS) return;
    const r = dropRow(s.grid, c);
    if (r < 0) return;
    s.grid[at(r, c)] = this.index(pid) + 1;
    s.last = { r, c };
    const line = lineAt(s.grid, r, c);
    if (line) {
      s.line = line;
      return this.end(pid, { why: 'line', p: pid, r, c, line });
    }
    if (s.grid.every(Boolean)) return this.end(null, { why: 'draw', p: pid, r, c });
    this.setTurn(this.next());
    this.push({ k: 'drop', p: pid, r, c });
  }

  onAction(a, from) {
    if (a.a === 'drop') this.drop(from, a.c | 0);
    else if (a.a === 'resign') {
      const other = this.state.players.find((p) => p.id !== from);
      this.end(other?.id || null, { why: 'resign', by: from });
    }
  }

  onTimeout(p) {
    this.botMove(p);
  }

  botMove(p) {
    const c = empatBot(this.state.grid, this.index(p.id) + 1);
    if (c >= 0) this.drop(p.id, c);
  }
}

// ---------- Tampilan ----------
const CELL = 0.075;
const W = COLS * CELL;
const H = ROWS * CELL;
const BASE = 0.05; // tinggi kaki papan
const DISC_R = 0.031;
const COLORS = ['#e03131', '#1c7ed6'];
const NAMES = ['Merah', 'Biru'];
const G = 3.4;

const HOLE_R = 0.0345;
const PANEL_T = 0.009; // tebal tiap panel kayu
const GAP = 0.0105; // setengah celah tempat cakram meluncur

/** Panel kayu tebal dengan 42 lubang tembus (bervolume, terlihat tebal dari atas). */
function panelGeometry() {
  const sh = new THREE.Shape();
  const w = W / 2 + 0.006, h = H + 0.012;
  sh.moveTo(-w, 0);
  sh.lineTo(w, 0);
  sh.lineTo(w, h);
  sh.lineTo(-w, h);
  sh.lineTo(-w, 0);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const hole = new THREE.Path();
      hole.absarc((c - (COLS - 1) / 2) * CELL, 0.006 + (r + 0.5) * CELL, HOLE_R, 0, Math.PI * 2, true);
      sh.holes.push(hole);
    }
  const g = new THREE.ExtrudeGeometry(sh, { depth: PANEL_T, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 18 });
  g.translate(0, 0, -PANEL_T / 2);
  return g;
}

let discGeo = null, ringGeo = null;
function makeDisc(v) {
  discGeo ||= new THREE.CylinderGeometry(DISC_R, DISC_R, 0.016, 24).rotateX(Math.PI / 2);
  ringGeo ||= new THREE.TorusGeometry(DISC_R * 0.62, 0.0035, 6, 20);
  const m = new THREE.Mesh(discGeo, pieceMaterial(COLORS[v - 1]));
  m.castShadow = true;
  // cincin timbul di kedua muka
  const ring = new THREE.Mesh(ringGeo, pieceMaterial(v === 1 ? '#c92a2a' : '#1864ab'));
  const ring2 = ring.clone();
  ring.position.z = 0.0085;
  ring2.position.z = -0.0085;
  m.add(ring, ring2);
  return m;
}

class EmpatRenderer {
  constructor(ctx, table) {
    this.ctx = ctx;
    this.table = table;
    this.group = boardGroup(ctx, table, table.seats[0]);
    const panelMat = woodMaterial({ base: '#b8773d', dark: '#7a4520', light: '#d69a5c', seed: 3 }, 0.35);
    const pgeo = panelGeometry();
    for (const z of [GAP + PANEL_T / 2, -GAP - PANEL_T / 2]) {
      const panel = new THREE.Mesh(pgeo, panelMat);
      panel.position.set(0, BASE - 0.006, z);
      panel.castShadow = panel.receiveShadow = true;
      this.group.add(panel);
    }
    // sekat antar kolom di dalam celah (terlihat dari atas sebagai lajur kolom)
    const sepMat = woodMaterial({ base: '#8f5a2b', dark: '#5e3815', light: '#a8713d', seed: 5 }, 0.3);
    for (let c = 0; c <= COLS; c++) {
      const x = (c - COLS / 2) * CELL;
      const sep = new THREE.Mesh(new THREE.BoxGeometry(c === 0 || c === COLS ? 0.012 : 0.006, H + 0.012, GAP * 2), sepMat);
      sep.position.set(x + (c === 0 ? -0.003 : c === COLS ? 0.003 : 0), BASE - 0.006 + (H + 0.012) / 2, 0);
      this.group.add(sep);
    }
    // tiang samping, kaki & alas
    const wood = woodMaterial({ base: '#7a4a22', dark: '#4f2d12', light: '#94602e', seed: 7 }, 0.3);
    for (const x of [-W / 2 - 0.018, W / 2 + 0.018]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.024, H + BASE + 0.02, GAP * 2 + PANEL_T * 2 + 0.012), wood);
      post.position.set(x, (H + BASE + 0.02) / 2, 0);
      post.castShadow = true;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.2), wood);
      foot.position.set(x, 0.01, 0);
      this.group.add(post, foot);
    }
    const sill = new THREE.Mesh(new THREE.BoxGeometry(W + 0.03, 0.012, GAP * 2 + PANEL_T * 2), wood);
    sill.position.set(0, BASE - 0.006, 0);
    this.group.add(sill);
    this.sill = sill;
    // bidang tak terlihat untuk memilih kolom
    this.pickPlane = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.04, H + 0.16), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    this.pickPlane.position.set(0, BASE + (H + 0.16) / 2, 0);
    this.group.add(this.pickPlane);
    // cakram bayangan di atas kolom (pratinjau)
    this.ghost = makeDisc(1);
    this.ghost.material = new THREE.MeshLambertMaterial({ color: COLORS[0], transparent: true, opacity: 0.55 });
    this.ghost.children.forEach((c) => (c.visible = false));
    this.ghost.visible = false;
    this.group.add(this.ghost);
    this.glow = new THREE.MeshBasicMaterial({ color: '#ffe066', side: THREE.BackSide, transparent: true, depthWrite: false });
    this.lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false });
    this.winLine = null;
    this.discs = new Map(); // sel → { mesh, anim }
    this.falling = [];
    this.lastEv = -1;
    this.time = 0;
  }

  cellPos(r, c, out = new THREE.Vector3()) {
    return out.set((c - (COLS - 1) / 2) * CELL, BASE + (r + 0.5) * CELL, 0);
  }

  columnAt(worldPoint) {
    const p = this.group.worldToLocal(worldPoint.clone());
    const c = Math.floor(p.x / CELL + COLS / 2);
    return c >= 0 && c < COLS ? c : -1;
  }

  sound(name, opts) {
    this.ctx.audio.playAt(name, this.table.x, this.table.z, opts);
  }

  sync(m) {
    const grid = m.phase === 'lobby' ? [] : m.grid || [];
    const ev = m.ev;
    const fresh = ev && ev.n !== this.lastEv;
    if (fresh && this.lastEv !== -1 && ev.k === 'start' && this.discs.size) {
      // permainan baru: kunci bawah dibuka, semua cakram berjatuhan keluar papan
      this.sound('rattle');
      for (const d of this.discs.values()) this.falling.push({ mesh: d.mesh, vy: -0.2 - Math.random() * 0.3, t: 0 });
      this.discs.clear();
    }
    if (m.phase !== 'end' && this.winLine) {
      for (const l of this.winLine.meshes) l.removeFromParent();
      this.winLine = null;
    }
    for (const [cell, d] of this.discs) {
      if (!grid[cell]) {
        d.mesh.removeFromParent();
        this.discs.delete(cell);
      }
    }
    grid.forEach((v, cell) => {
      if (!v || this.discs.has(cell)) return;
      const r = Math.floor(cell / COLS), c = cell % COLS;
      const mesh = makeDisc(v);
      const target = this.cellPos(r, c);
      const animate = fresh && this.lastEv !== -1 && (ev.k === 'drop' || ev.k === 'win') && ev.r === r && ev.c === c;
      let carry = null;
      if (animate) {
        mesh.position.set(target.x, BASE + H + 0.07, 0);
        // tangan pemain mengambil cakram lalu memasukkannya ke kolom
        const ch = this.ctx.characterOf(ev.p);
        if (ch?.root.visible) {
          const top = this.group.localToWorld(new THREE.Vector3(target.x, BASE + H + 0.07, 0));
          const hand = ch.arms[0].userData.hand.getWorldPosition(new THREE.Vector3());
          carry = { from: this.group.worldToLocal(hand), t: 0 };
          mesh.position.copy(carry.from);
          ch.reachTo(top, 0.75);
        } else this.sound('drop');
      } else mesh.position.copy(target);
      this.group.add(mesh);
      this.discs.set(cell, { mesh, anim: animate ? { y: BASE + H + 0.07, vy: 0, ty: target.y, bounces: 0, carry, x: target.x } : null });
    });
    // sorot garis kemenangan
    const line = new Set(m.phase === 'end' ? m.line || [] : []);
    for (const [cell, d] of this.discs) {
      if (line.has(cell) && !d.edge) {
        d.edge = new THREE.Mesh(outlineGeometry('empat', d.mesh.geometry, 0.004), this.glow);
        d.mesh.add(d.edge);
      }
    }
    if (fresh) this.lastEv = ev.n;
  }

  /** Garis menyala yang tumbuh melintasi cakram yang tersusun (di kedua muka papan). */
  makeWinLine(line) {
    const pts = line.map((cell) => this.cellPos(Math.floor(cell / COLS), cell % COLS));
    let a = pts[0], b = pts[0], best = -1;
    for (const p of pts) for (const q of pts) {
      const d = p.distanceTo(q);
      if (d > best) {
        best = d;
        a = p;
        b = q;
      }
    }
    const ext = (DISC_R * 0.9) / Math.max(best, 1e-6);
    const from = a.clone().lerp(b, -ext), to = b.clone().lerp(a, -ext);
    const meshes = [];
    for (const z of [GAP + PANEL_T + 0.004, -GAP - PANEL_T - 0.004]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.015, 0.003).translate(0.5, 0, 0), this.lineMat);
      m.position.set(from.x, from.y, z);
      m.rotation.z = Math.atan2(to.y - from.y, to.x - from.x);
      m.scale.x = 0.0001;
      m.renderOrder = 4;
      this.group.add(m);
      meshes.push(m);
    }
    return { meshes, len: from.distanceTo(to), t: 0 };
  }

  update(dt, m) {
    this.time += dt;
    this.sync(m);
    // cakram jatuh memantul di kolomnya
    for (const d of this.discs.values()) {
      const a = d.anim;
      if (!a) continue;
      if (a.carry) {
        // dibawa tangan ke atas kolom
        a.carry.t = Math.min(1, a.carry.t + dt / 0.34);
        const k = a.carry.t * a.carry.t * (3 - 2 * a.carry.t);
        d.mesh.position.set(a.carry.from.x + (a.x - a.carry.from.x) * k, a.carry.from.y + (a.y - a.carry.from.y) * k + Math.sin(k * Math.PI) * 0.05, a.carry.from.z * (1 - k));
        if (a.carry.t >= 1) {
          a.carry = null;
          this.sound('drop');
        }
        continue;
      }
      a.vy -= G * dt;
      a.y += a.vy * dt;
      if (a.y <= a.ty) {
        a.y = a.ty;
        if (a.bounces < 2 && a.vy < -0.25) {
          this.sound('clack', { strength: a.bounces ? 0.35 : 1 });
          a.vy = -a.vy * 0.28;
          a.bounces++;
        } else d.anim = null;
      }
      d.mesh.position.y = a.y;
    }
    // cakram yang dilepas dari papan
    for (const f of this.falling) {
      f.t += dt;
      f.vy -= G * dt;
      f.mesh.position.y += f.vy * dt;
      if (f.mesh.position.y < -0.9) f.mesh.removeFromParent();
    }
    this.falling = this.falling.filter((f) => f.mesh.parent);
    this.glow.opacity = 0.7 + Math.sin(this.time * 7) * 0.3;
    // garis kemenangan: tumbuh setelah cakram terakhir mendarat, lalu berdenyut
    const settled = [...this.discs.values()].every((d) => !d.anim);
    if (m.phase === 'end' && m.line && settled && !this.winLine) {
      this.winLine = this.makeWinLine(m.line);
      this.sound('kilat');
    }
    if (this.winLine) {
      const w = this.winLine;
      w.t = Math.min(1, w.t + dt / 0.5);
      const k = 1 - (1 - w.t) ** 3;
      for (const l of w.meshes) l.scale.x = Math.max(0.0001, w.len * k);
      this.lineMat.opacity = w.t < 1 ? 1 : 0.75 + Math.sin(this.time * 6) * 0.25;
    }
    // pratinjau kolom
    const hv = this.hover;
    this.ghost.visible = !!hv && hv.c >= 0;
    if (this.ghost.visible) {
      this.ghost.material.color.set(COLORS[hv.v - 1]);
      this.ghost.position.set((hv.c - (COLS - 1) / 2) * CELL, BASE + H + 0.045 + Math.sin(this.time * 5) * 0.005, 0);
    }
  }

  dispose() {
    this.group.removeFromParent();
  }
}

// ---------- Kontrol ----------
class EmpatControls {
  constructor(ctx) {
    this.ctx = ctx;
    this.hoverCol = -1;
  }

  enter() {
    this.btnResign = this.ctx.topButton('flag', 'Menyerah', () => {
      if (confirm('Menyerah?')) this.ctx.act({ a: 'resign' });
    }, 'cu-resign');
  }

  exit() {}

  myIndex(m) {
    return m.players.findIndex((p) => p.id === this.ctx.myId);
  }

  myTurn(m) {
    return m.phase === 'play' && m.players[m.turn]?.id === this.ctx.myId;
  }

  update(dt, m) {
    this.btnResign.hidden = m.phase !== 'play';
    const r = this.ctx.renderer(m);
    if (!r) return;
    const mine = this.myTurn(m);
    r.hover = mine && this.hoverCol >= 0 && m.grid && dropRow(m.grid, this.hoverCol) >= 0 ? { c: this.hoverCol, v: this.myIndex(m) + 1 } : null;
  }

  playerColor(m, p) {
    const i = m.players.findIndex((x) => x.id === p.id);
    return COLORS[i] || null;
  }

  chip(m) {
    if (m.phase !== 'play') return null;
    const i = this.myIndex(m);
    return { bg: COLORS[i], title: `Kamu ${NAMES[i]}` };
  }

  targets(m) {
    const r = this.ctx.renderer(m);
    return r ? [r.pickPlane] : [];
  }

  setHover(obj, m) {
    const r = this.ctx.renderer(m);
    this.hoverCol = obj && r && this.ctx.lastHitPoint ? r.columnAt(this.ctx.lastHitPoint) : -1;
  }

  click(obj, m) {
    if (!obj || m.phase !== 'play') return;
    if (!this.myTurn(m)) return this.ctx.flash('Bukan giliranmu');
    const r = this.ctx.renderer(m);
    const c = this.ctx.lastHitPoint ? r.columnAt(this.ctx.lastHitPoint) : -1;
    if (c < 0) return;
    if (dropRow(m.grid, c) < 0) return this.ctx.flash('Kolom sudah penuh');
    this.hoverCol = -1;
    this.ctx.act({ a: 'drop', c });
  }

  onEvent(ev) {
    if (ev.k === 'win' && ev.why === 'draw') this.ctx.flash('Papan penuh — seri');
  }

  endText(m) {
    const ev = m.ev;
    if (ev.why === 'resign') return `${this.ctx.playerName(ev.by)} menyerah`;
    if (ev.why === 'draw') return 'Seri — papan penuh';
    if (ev.why === 'line') return m.winner === this.ctx.myId ? 'Empat sejajar! Kamu menang!' : `${this.ctx.playerName(m.winner)} menyusun empat sejajar`;
    return null;
  }
}

export default {
  id: 'empat',
  name: 'Empat Sejajar',
  icon: 'grid4',
  art: 'radial-gradient(circle at 30% 35%, #e03131 0 18%, transparent 19%), radial-gradient(circle at 70% 65%, #1c7ed6 0 18%, transparent 19%), #b0703a',
  min: 2,
  max: 2,
  seatOrder: [0, 2],
  topView: false,
  cam: { el: 0.42, dist: 1.25 },
  camTargetY: 0.27,
  headPitch: -0.32,
  Host: EmpatHost,
  Renderer: EmpatRenderer,
  Controls: EmpatControls,
};
