import * as THREE from 'three';
import { HostBase } from '../HostBase.js';
import { Markers, boardFrame, boardGroup, canvasPlane, cellPos, checkerGeometry, pickCell, pieceMaterial } from '../boardKit.js';
import { applyDam, colorOf, damBot, initialDam, legalDam } from './damRules.js';

const SIZE = 0.6;
const COLORS = { w: '#f1f3f5', b: '#e03131' };
const opp = (c) => (c === 'w' ? 'b' : 'w');

class DamHost extends HostBase {
  constructor(o) {
    super({ ...o, game: 'dam', min: 2, max: 2, turnMs: 60000 });
    Object.assign(this.state, { board: null, chain: -1, last: null, quiet: 0 });
    this.push();
  }

  setup() {
    Object.assign(this.state, { board: initialDam(), chain: -1, last: null, quiet: 0 });
    this.setTurn(0);
  }

  colorOf(pid) {
    return this.index(pid) === 0 ? 'w' : 'b';
  }

  move(pid, from, to) {
    const s = this.state;
    const c = this.colorOf(pid);
    if (!this.isTurn(pid)) return;
    const mv = legalDam(s.board, c, s.chain).find((m) => m.from === from && m.to === to);
    if (!mv) return;
    const res = applyDam(s.board, mv);
    s.board = res.board;
    s.chain = res.chain;
    s.last = { from, to };
    s.quiet = mv.cap !== undefined ? 0 : s.quiet + 1;
    const ev = { k: 'move', p: pid, from, to, cap: mv.cap, king: res.promoted };
    if (res.chain >= 0) {
      s.turnAt = Date.now(); // lanjut makan beruntun
      this.push(ev);
      return;
    }
    if (!legalDam(s.board, opp(c)).length) return this.end(pid, { ...ev, why: 'win' });
    if (s.quiet >= 50) return this.end(null, { ...ev, why: 'draw' });
    this.setTurn(this.next());
    this.push(ev);
  }

  onAction(a, from) {
    if (a.a === 'move') this.move(from, a.from | 0, a.to | 0);
    else if (a.a === 'resign') {
      const other = this.state.players.find((p) => p.id !== from);
      this.end(other?.id || null, { why: 'resign', by: from });
    }
  }

  onTimeout(p) {
    this.botMove(p);
  }

  botMove(p) {
    const s = this.state;
    const mv = damBot(s.board, this.colorOf(p.id), s.chain);
    if (mv) this.move(p.id, mv.from, mv.to);
  }
}

class DamRenderer {
  constructor(ctx, table) {
    this.ctx = ctx;
    this.group = boardGroup(ctx, table, table.seats[0]);
    this.plane = canvasPlane(SIZE, 512, (g, px) => {
      const c = px / 8;
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        g.fillStyle = (f + r) % 2 === 0 ? '#2f6f4f' : '#e9e2c8';
        g.fillRect(f * c, (7 - r) * c, c, c);
      }
    });
    this.group.add(this.plane, boardFrame(SIZE, '#4a2f1b'));
    this.markers = new Markers(this.group, SIZE / 8);
    this.meshes = new Map();
    this.anims = [];
    this.sig = '';
    this.lastEv = -1;
  }

  pos(sq, out = new THREE.Vector3()) {
    return cellPos(sq % 8, (sq / 8) | 0, 8, SIZE, out);
  }

  sync(m) {
    const board = m.board || [];
    const sig = board.join(',');
    if (sig === this.sig) return;
    this.sig = sig;
    const ev = m.ev;
    if (ev?.n !== this.lastEv && ev?.from !== undefined && this.meshes.has(ev.from)) {
      const mesh = this.meshes.get(ev.from);
      this.meshes.delete(ev.from);
      this.meshes.set(ev.to, mesh);
      this.anims.push({ mesh, from: mesh.position.clone(), to: this.pos(ev.to), t: 0 });
    }
    this.lastEv = ev?.n;
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      let mesh = this.meshes.get(sq);
      if (mesh && mesh.userData.piece !== p) {
        if (p && colorOf(p) === colorOf(mesh.userData.piece) && mesh.userData.piece !== p) {
          mesh.geometry = checkerGeometry(true); // naik jadi raja
          mesh.userData.piece = p;
        } else {
          mesh.removeFromParent();
          this.meshes.delete(sq);
          mesh = null;
        }
      }
      if (p && !mesh) {
        mesh = new THREE.Mesh(checkerGeometry(p === 'W' || p === 'B'), pieceMaterial(COLORS[colorOf(p)]));
        mesh.scale.setScalar(1.35);
        mesh.castShadow = true;
        mesh.userData.piece = p;
        this.pos(sq, mesh.position);
        this.group.add(mesh);
        this.meshes.set(sq, mesh);
      }
    }
  }

  update(dt, m) {
    this.sync(m);
    for (const a of this.anims) {
      a.t = Math.min(1, a.t + dt / 0.28);
      const k = a.t * a.t * (3 - 2 * a.t);
      a.mesh.position.lerpVectors(a.from, a.to, k);
      a.mesh.position.y = Math.sin(k * Math.PI) * 0.03;
    }
    this.anims = this.anims.filter((a) => a.t < 1);
    this.markers.begin();
    if (m.last) for (const sq of [m.last.from, m.last.to]) this.markers.add(this.pos(sq), '#ffd43b');
    for (const x of this.extraMarks || []) this.markers.add(x.pos, x.color, x.kind);
    this.markers.end();
  }

  dispose() {
    this.group.removeFromParent();
  }
}

class DamControls {
  constructor(ctx) {
    this.ctx = ctx;
    this.sel = -1;
  }

  enter() {
    this.btnResign = this.ctx.button('flag', 'Menyerah', () => {
      if (confirm('Menyerah?')) this.ctx.act({ a: 'resign' });
    }, '', 'cu-resign');
  }

  exit() {}

  myColor(m) {
    return m.players.findIndex((p) => p.id === this.ctx.myId) === 0 ? 'w' : 'b';
  }

  myTurn(m) {
    return m.phase === 'play' && m.players[m.turn]?.id === this.ctx.myId;
  }

  moves(m) {
    return m.board ? legalDam(m.board, this.myColor(m), m.chain) : [];
  }

  update(dt, m) {
    this.btnResign.hidden = m.phase !== 'play';
    const r = this.ctx.renderer(m);
    if (!r) return;
    const marks = [];
    if (this.myTurn(m)) {
      const moves = this.moves(m);
      if (m.chain >= 0) this.sel = m.chain;
      const movable = new Set(moves.map((x) => x.from));
      for (const sq of movable) if (sq !== this.sel) marks.push({ pos: r.pos(sq), color: '#74c0fc' });
      if (this.sel >= 0) {
        marks.push({ pos: r.pos(this.sel), color: '#4dabf7' });
        for (const mv of moves.filter((x) => x.from === this.sel)) marks.push({ pos: r.pos(mv.to), color: mv.cap !== undefined ? '#ff6b6b' : '#51cf66', kind: 'dot' });
      }
    } else this.sel = -1;
    r.extraMarks = marks;
  }

  chip(m) {
    if (m.phase !== 'play') return null;
    const c = this.myColor(m);
    return { bg: COLORS[c], title: c === 'w' ? 'Kamu putih' : 'Kamu merah' };
  }

  targets(m) {
    const r = this.ctx.renderer(m);
    return r ? [r.plane] : [];
  }

  click(obj, m) {
    if (!obj || m.phase !== 'play') return;
    if (!this.myTurn(m)) return this.ctx.flash('Bukan giliranmu');
    const r = this.ctx.renderer(m);
    const cell = this.ctx.lastHitPoint && pickCell(this.ctx.lastHitPoint, r.group, 8, SIZE);
    if (!cell) return;
    const sq = cell.r * 8 + cell.f;
    const moves = this.moves(m);
    if (this.sel >= 0) {
      const mv = moves.find((x) => x.from === this.sel && x.to === sq);
      if (mv) {
        this.ctx.act({ a: 'move', from: mv.from, to: mv.to });
        return;
      }
    }
    if (moves.some((x) => x.from === sq)) {
      this.sel = sq;
      this.ctx.audio.play('click');
    } else if (colorOf(m.board[sq]) === this.myColor(m) && moves.some((x) => x.cap !== undefined)) this.ctx.flash('Wajib makan!');
  }

  onEvent(ev, m) {
    if (ev.from !== undefined) this.ctx.playAtTable(ev.cap !== undefined ? 'kick' : 'click2', m);
    if (ev.king) this.ctx.flash('Jadi raja!');
  }

  endText(m) {
    const ev = m.ev;
    if (ev.why === 'resign') return `${this.ctx.playerName(ev.by)} menyerah`;
    if (ev.why === 'draw') return 'Remis';
    return null;
  }
}

export default {
  id: 'dam',
  name: 'Dam',
  icon: 'dam',
  art: 'linear-gradient(135deg, #e03131 50%, #f1f3f5 50%)',
  min: 2,
  max: 2,
  seatOrder: [0, 2],
  topView: true,
  Host: DamHost,
  Renderer: DamRenderer,
  Controls: DamControls,
};
