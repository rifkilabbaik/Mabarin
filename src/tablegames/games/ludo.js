import * as THREE from 'three';
import { HostBase } from '../HostBase.js';
import { boardFrame, boardGroup, canvasPlane, cellPos, pawnGeometry, pieceMaterial } from '../boardKit.js';

// ---------- Aturan ----------
// Lintasan 52 petak searah jarum jam pada grid 15×15 (x = kolom, y = baris).
const TRACK = [];
const seg = (pts) => TRACK.push(...pts);
const range = (a, b) => (a <= b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : Array.from({ length: a - b + 1 }, (_, i) => a - i));
seg(range(14, 9).map((y) => [6, y]));
seg(range(5, 0).map((x) => [x, 8]));
seg([[0, 7]]);
seg(range(0, 5).map((x) => [x, 6]));
seg(range(5, 0).map((y) => [6, y]));
seg([[7, 0]]);
seg(range(0, 5).map((y) => [8, y]));
seg(range(9, 14).map((x) => [x, 6]));
seg([[14, 7]]);
seg(range(14, 9).map((x) => [x, 8]));
seg(range(9, 14).map((y) => [8, y]));
seg([[7, 14]]);
// Tiap warna: indeks petak start, jalur rumah (5 petak), area kandang.
const SEATS = [
  { start: 1, home: range(13, 9).map((y) => [7, y]), base: [1.5, 10.5], color: '#e03131', name: 'Merah' },
  { start: 14, home: range(1, 5).map((x) => [x, 7]), base: [1.5, 1.5], color: '#2f9e44', name: 'Hijau' },
  { start: 27, home: range(1, 5).map((y) => [7, y]), base: [10.5, 1.5], color: '#f59f00', name: 'Kuning' },
  { start: 40, home: range(13, 9).map((x) => [x, 7]), base: [10.5, 10.5], color: '#1c7ed6', name: 'Biru' },
];
const SAFE = new Set([1, 14, 27, 40, 9, 22, 35, 48]);
const FINISH = 56; // 0..50 lintasan, 51..55 jalur rumah, 56 selesai
// Pemain ke-i memakai warna (2 pemain: merah & kuning berhadapan)
const colorsFor = (n) => (n === 2 ? [0, 2] : n === 3 ? [0, 1, 2] : [0, 1, 2, 3]);

const trackIndex = (seat, prog) => (SEATS[seat].start + prog) % 52;

function movable(tokens, die) {
  const out = [];
  tokens.forEach((p, i) => {
    if (p === FINISH) return;
    if (p < 0) {
      if (die === 6) out.push(i);
    } else if (p + die <= FINISH) out.push(i);
  });
  return out;
}

// ---------- Bandar ----------
class LudoHost extends HostBase {
  constructor(o) {
    super({ ...o, game: 'ludo', min: 2, max: 4, turnMs: 25000 });
    Object.assign(this.state, { tokens: {}, colors: {}, die: 0, rolled: false, movable: [], sixes: 0 });
    this.push();
  }

  setup() {
    const s = this.state;
    const cols = colorsFor(s.players.length);
    s.tokens = {};
    s.colors = {};
    s.players.forEach((p, i) => {
      s.tokens[p.id] = [-1, -1, -1, -1];
      s.colors[p.id] = cols[i];
    });
    s.die = 0;
    this.setTurn(0);
  }

  onTurn() {
    const s = this.state;
    s.rolled = false;
    s.movable = [];
  }

  roll(pid) {
    const s = this.state;
    if (!this.isTurn(pid) || s.rolled) return;
    s.die = 1 + Math.floor(Math.random() * 6);
    s.rolled = true;
    s.movable = movable(s.tokens[pid], s.die);
    this.push({ k: 'roll', p: pid, die: s.die });
    if (!s.movable.length) {
      setTimeout(() => {
        if (this.state.rolled && this.isTurn(pid)) this.finishTurn(pid, false);
      }, 900);
    }
  }

  move(pid, t) {
    const s = this.state;
    if (!this.isTurn(pid) || !s.rolled || !s.movable.includes(t)) return;
    const toks = s.tokens[pid];
    const seat = s.colors[pid];
    const from = toks[t];
    toks[t] = from < 0 ? 0 : from + s.die;
    let captured = null;
    if (toks[t] <= 50) {
      const idx = trackIndex(seat, toks[t]);
      if (!SAFE.has(idx)) {
        for (const p of s.players) {
          if (p.id === pid) continue;
          const other = s.tokens[p.id];
          other.forEach((op, j) => {
            if (op >= 0 && op <= 50 && trackIndex(s.colors[p.id], op) === idx) {
              other[j] = -1;
              captured = p.id;
            }
          });
        }
      }
    }
    const ev = { k: 'move', p: pid, t, from, to: toks[t], cap: captured };
    if (toks.every((x) => x === FINISH)) return this.end(pid, ev);
    this.push(ev);
    this.finishTurn(pid, s.die === 6 || !!captured || toks[t] === FINISH);
  }

  finishTurn(pid, again) {
    const s = this.state;
    if (again && s.sixes < 2) {
      s.sixes++;
      s.rolled = false;
      s.movable = [];
      s.turnAt = Date.now();
    } else {
      s.sixes = 0;
      this.setTurn(this.next());
    }
    this.push();
  }

  onAction(a, from) {
    if (a.a === 'roll') this.roll(from);
    else if (a.a === 'move') this.move(from, a.t | 0);
  }

  onLeave(pid, idx) {
    delete this.state.tokens[pid];
    super.onLeave(pid, idx);
  }

  onTimeout(p) {
    if (!this.state.rolled) this.roll(p.id);
    else if (this.state.movable.length) this.move(p.id, this.state.movable[0]);
  }

  botMove(p) {
    const s = this.state;
    if (!s.rolled) return this.roll(p.id);
    if (!s.movable.length) return;
    const toks = s.tokens[p.id];
    const score = (t) => {
      const cur = toks[t];
      const next = cur < 0 ? 0 : cur + s.die;
      let v = next * 0.05 + Math.random() * 0.3;
      if (cur < 0) v += 2;
      if (next === FINISH) v += 3;
      if (next <= 50) {
        const idx = trackIndex(s.colors[p.id], next);
        for (const o of s.players) if (o.id !== p.id && s.tokens[o.id].some((op) => op >= 0 && op <= 50 && trackIndex(s.colors[o.id], op) === idx) && !SAFE.has(idx)) v += 4;
        if (SAFE.has(idx)) v += 0.5;
      }
      return v;
    };
    this.move(p.id, s.movable.reduce((a, b) => (score(b) > score(a) ? b : a)));
  }
}

// ---------- Tampilan ----------
const SIZE = 0.72;
const N = 15;

function cellOf(seat, prog, tokenIndex) {
  const S = SEATS[seat];
  if (prog < 0) {
    const [bx, by] = S.base;
    return [bx + (tokenIndex % 2) * 2, by + ((tokenIndex / 2) | 0) * 2];
  }
  if (prog <= 50) return TRACK[(S.start + prog) % 52];
  if (prog < FINISH) return S.home[prog - 51];
  // selesai: berkumpul di tengah
  return [7 + ((tokenIndex % 2) - 0.5) * 0.6, 7 + (((tokenIndex / 2) | 0) - 0.5) * 0.6];
}

function drawBoard(g, px) {
  const c = px / N;
  g.fillStyle = '#fdf6e3';
  g.fillRect(0, 0, px, px);
  const cell = (x, y, col) => {
    g.fillStyle = col;
    g.fillRect(x * c, y * c, c, c);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1.5;
    g.strokeRect(x * c, y * c, c, c);
  };
  SEATS.forEach((S) => {
    const [bx, by] = S.base;
    const x0 = bx - 1.5, y0 = by - 1.5;
    g.fillStyle = S.color;
    g.fillRect(x0 * c, y0 * c, 6 * c, 6 * c);
    g.fillStyle = '#fff';
    g.fillRect((x0 + 1) * c, (y0 + 1) * c, 4 * c, 4 * c);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = S.color;
      g.beginPath();
      g.arc((bx + (i % 2) * 2 + 0.5) * c, (by + ((i / 2) | 0) * 2 + 0.5) * c, c * 0.38, 0, Math.PI * 2);
      g.fill();
    }
  });
  TRACK.forEach(([x, y], i) => cell(x, y, '#ffffff'));
  SEATS.forEach((S) => {
    S.home.forEach(([x, y]) => cell(x, y, S.color));
    const [sx, sy] = TRACK[S.start];
    cell(sx, sy, S.color);
  });
  for (const i of [9, 22, 35, 48]) {
    const [x, y] = TRACK[i];
    g.fillStyle = '#adb5bd';
    g.font = `${c * 0.7}px system-ui`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('★', (x + 0.5) * c, (y + 0.55) * c);
  }
  // segitiga tengah
  const cx = 7.5 * c, cy = 7.5 * c;
  const tri = (ax, ay, bx2, by2, col) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(ax * c, ay * c);
    g.lineTo(bx2 * c, by2 * c);
    g.closePath();
    g.fill();
  };
  tri(6, 9, 9, 9, SEATS[0].color);
  tri(6, 6, 6, 9, SEATS[1].color);
  tri(6, 6, 9, 6, SEATS[2].color);
  tri(9, 6, 9, 9, SEATS[3].color);
}

function diceTexture(n) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#1d2333';
  const P = { 1: [[32, 32]], 2: [[18, 18], [46, 46]], 3: [[16, 16], [32, 32], [48, 48]], 4: [[18, 18], [46, 18], [18, 46], [46, 46]], 5: [[16, 16], [48, 16], [32, 32], [16, 48], [48, 48]], 6: [[18, 14], [46, 14], [18, 32], [46, 32], [18, 50], [46, 50]] }[n];
  for (const [x, y] of P) {
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// sisi kubus: +x,-x,+y,-y,+z,-z  → angka 3,4,1,6,2,5 (sisi berseberangan berjumlah 7)
const FACE_NUM = [3, 4, 1, 6, 2, 5];
const UP_ROT = { 1: [0, 0], 6: [Math.PI, 0], 2: [-Math.PI / 2, 0], 5: [Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2] };

class LudoRenderer {
  constructor(ctx, table) {
    this.ctx = ctx;
    this.group = boardGroup(ctx, table, table.seats[0]);
    this.plane = canvasPlane(SIZE, 1024, drawBoard);
    this.group.add(this.plane, boardFrame(SIZE, '#8b5a2b'));
    this.tokens = new Map();
    this.die = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), FACE_NUM.map((n) => new THREE.MeshLambertMaterial({ map: diceTexture(n) })));
    this.die.castShadow = true;
    this.die.position.set(0.42, 0.03, 0.3);
    this.die.userData.isDie = true;
    this.group.add(this.die);
    this.rollT = 0;
    this.lastEv = -1;
    this.time = 0;
  }

  pos(cx, cy, out = new THREE.Vector3()) {
    return cellPos(cx, 14 - cy, N, SIZE, out);
  }

  update(dt, m) {
    this.time += dt;
    const live = m.phase !== 'lobby';
    const seen = new Set();
    if (live) {
      for (const p of m.players) {
        const seat = m.colors?.[p.id];
        const toks = m.tokens?.[p.id];
        if (seat === undefined || !toks) continue;
        toks.forEach((prog, i) => {
          const key = `${p.id}:${i}`;
          seen.add(key);
          let mesh = this.tokens.get(key);
          if (!mesh) {
            mesh = new THREE.Mesh(pawnGeometry(), pieceMaterial(SEATS[seat].color));
            mesh.scale.setScalar(1.25);
            mesh.castShadow = true;
            mesh.userData = { owner: p.id, index: i };
            this.group.add(mesh);
            this.tokens.set(key, mesh);
          }
          const [cx, cy] = cellOf(seat, prog, i);
          const target = this.pos(cx, cy);
          // pion bertumpuk: geser sedikit
          const stackOff = (i - 1.5) * 0.004;
          mesh.position.x += (target.x + stackOff - mesh.position.x) * Math.min(1, dt * 10);
          mesh.position.z += (target.z - mesh.position.z) * Math.min(1, dt * 10);
          const moving = Math.hypot(target.x - mesh.position.x, target.z - mesh.position.z) > 0.004;
          mesh.position.y = moving ? 0.015 : 0;
          const hi = this.highlight?.has(i) && p.id === this.ctx.myId;
          mesh.scale.setScalar(hi ? 1.25 + Math.sin(this.time * 8) * 0.12 : 1.25);
        });
      }
    }
    for (const [k, mesh] of this.tokens) {
      if (!seen.has(k)) {
        mesh.removeFromParent();
        this.tokens.delete(k);
      }
    }
    // dadu
    this.die.visible = live;
    if (m.ev && m.ev.n !== this.lastEv) {
      if (m.ev.k === 'roll') this.rollT = 0.6;
      this.lastEv = m.ev.n;
    }
    if (this.rollT > 0) {
      this.rollT -= dt;
      this.die.rotation.x += dt * 17;
      this.die.rotation.z += dt * 13;
      this.die.position.y = 0.03 + Math.abs(Math.sin(this.rollT * 12)) * 0.05;
    } else if (m.die) {
      const [rx, rz] = UP_ROT[m.die];
      this.die.rotation.set(rx, 0, rz);
      this.die.position.y = 0.03;
    }
  }

  dispose() {
    this.group.removeFromParent();
  }
}

class LudoControls {
  constructor(ctx) {
    this.ctx = ctx;
  }

  enter() {
    this.btnRoll = this.ctx.button('dice', 'Lempar dadu', () => this.ctx.act({ a: 'roll' }), 'primary', 'cu-roll');
  }

  exit() {}

  myTurn(m) {
    return m.phase === 'play' && m.players[m.turn]?.id === this.ctx.myId;
  }

  update(dt, m) {
    const mine = this.myTurn(m);
    this.btnRoll.hidden = !mine || m.rolled;
    const r = this.ctx.renderer(m);
    if (r) r.highlight = mine && m.rolled ? new Set(m.movable) : null;
  }

  chip(m) {
    const seat = m.colors?.[this.ctx.myId];
    if (m.phase !== 'play' || seat === undefined) return null;
    return { bg: SEATS[seat].color, title: `Kamu ${SEATS[seat].name}`, html: m.die ? `<b style="font-size:16px">${m.die}</b>` : '' };
  }

  targets(m) {
    const r = this.ctx.renderer(m);
    if (!r) return [];
    return [...r.tokens.values()].filter((t) => t.userData.owner === this.ctx.myId).concat([r.die]);
  }

  click(obj, m) {
    if (!obj || m.phase !== 'play') return;
    if (!this.myTurn(m)) return this.ctx.flash('Bukan giliranmu');
    if (obj.userData.isDie) {
      if (!m.rolled) this.ctx.act({ a: 'roll' });
      return;
    }
    if (!m.rolled) return this.ctx.flash('Lempar dadu dulu');
    const t = obj.userData.index;
    if (m.movable.includes(t)) this.ctx.act({ a: 'move', t });
    else this.ctx.flash('Pion itu tidak bisa jalan');
  }

  onEvent(ev, m) {
    if (ev.k === 'roll') {
      this.ctx.playAtTable('dice', m);
      if (ev.p === this.ctx.myId && !m.movable.length) this.ctx.flash(`Dadu ${ev.die} — tidak ada langkah`);
    } else if (ev.k === 'move') {
      this.ctx.playAtTable('click2', m);
      if (ev.cap) this.ctx.flash(`${this.ctx.playerName(ev.p)} memakan pion ${this.ctx.playerName(ev.cap)}!`);
    }
  }
}

export default {
  id: 'ludo',
  name: 'Ludo',
  icon: 'dice',
  art: 'conic-gradient(#e03131 0 25%, #2f9e44 0 50%, #f59f00 0 75%, #1c7ed6 0)',
  min: 2,
  max: 4,
  seatOrder: (n) => (n === 2 ? [0, 2] : [0, 1, 2, 3]),
  topView: true,
  Host: LudoHost,
  Renderer: LudoRenderer,
  Controls: LudoControls,
};
