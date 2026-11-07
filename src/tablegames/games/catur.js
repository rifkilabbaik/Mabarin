import * as THREE from 'three';
import { HostBase } from '../HostBase.js';
import { Markers, boardFrame, boardGroup, canvasPlane, cellPos, chessGeometry, pickCell, pieceMaterial } from '../boardKit.js';
import { applyChess, chessBot, chessResult, inCheck, initialChess, legalChess } from './chessRules.js';

const SIZE = 0.6;
const COLORS = { w: '#f8f3e6', b: '#3b3f48' };

class CaturHost extends HostBase {
  constructor(o) {
    super({ ...o, game: 'catur', min: 2, max: 2, turnMs: 90000 });
    Object.assign(this.state, { chess: null, last: null });
    this.push();
  }

  setup() {
    this.state.chess = initialChess();
    this.state.last = null;
    this.setTurn(0); // putih jalan dulu
  }

  colorOf(pid) {
    return this.index(pid) === 0 ? 'w' : 'b';
  }

  move(pid, from, to) {
    const s = this.state;
    if (!this.isTurn(pid) || this.colorOf(pid) !== s.chess.turn) return;
    const mv = legalChess(s.chess).find((m) => m.from === from && m.to === to);
    if (!mv) return;
    const next = applyChess(s.chess, mv);
    const cap = !!next.captured;
    delete next.captured;
    s.chess = next;
    s.last = { from, to };
    const result = chessResult(next);
    if (result === 'mate') return this.end(pid, { why: 'mate', from, to });
    if (result) return this.end(null, { why: result, from, to });
    this.setTurn(this.next());
    this.push({ k: 'move', p: pid, from, to, cap, check: inCheck(next) });
  }

  onAction(a, from) {
    if (a.a === 'move') this.move(from, a.from | 0, a.to | 0);
    else if (a.a === 'resign') {
      const other = this.state.players.find((p) => p.id !== from);
      this.end(other?.id || null, { why: 'resign', by: from });
    }
  }

  onTimeout(p) {
    this.botMove(p); // waktu habis: langkah otomatis
  }

  botMove(p) {
    const mv = chessBot(this.state.chess);
    if (mv) this.move(p.id, mv.from, mv.to);
  }
}

class CaturRenderer {
  constructor(ctx, table) {
    this.ctx = ctx;
    this.table = table;
    this.group = boardGroup(ctx, table, table.seats[0]);
    this.plane = canvasPlane(SIZE, 512, (g, px) => {
      const c = px / 8;
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        g.fillStyle = (f + r) % 2 === 0 ? '#b07a4a' : '#f0d9b5';
        g.fillRect(f * c, (7 - r) * c, c, c);
      }
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.font = `600 ${c * 0.2}px system-ui, sans-serif`;
      for (let i = 0; i < 8; i++) {
        g.fillText('abcdefgh'[i], i * c + c * 0.06, px - c * 0.08);
        g.fillText(String(i + 1), c * 0.06, (7 - i) * c + c * 0.22);
      }
    });
    this.group.add(this.plane, boardFrame(SIZE));
    this.markers = new Markers(this.group, SIZE / 8);
    this.meshes = new Map();
    this.anims = [];
    this.lastEv = -1;
    this.boardSig = '';
  }

  pos(sq, out = new THREE.Vector3()) {
    return cellPos(sq % 8, (sq / 8) | 0, 8, SIZE, out);
  }

  syncPieces(m) {
    const board = m.chess?.board || [];
    const sig = board.join(',');
    if (sig === this.boardSig) return;
    this.boardSig = sig;
    const ev = m.ev;
    if (ev?.n !== this.lastEv && (ev?.k === 'move' || (ev?.k === 'win' && ev.from !== undefined)) && this.meshes.has(ev.from)) {
      const mesh = this.meshes.get(ev.from);
      this.meshes.get(ev.to)?.removeFromParent();
      this.meshes.delete(ev.from);
      this.meshes.set(ev.to, mesh);
      this.anims.push({ mesh, from: mesh.position.clone(), to: this.pos(ev.to), t: 0 });
    }
    this.lastEv = ev?.n;
    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      let mesh = this.meshes.get(sq);
      if (mesh && mesh.userData.piece !== p) {
        mesh.removeFromParent();
        this.meshes.delete(sq);
        mesh = null;
      }
      if (p && !mesh) {
        mesh = new THREE.Mesh(chessGeometry(p[1]), pieceMaterial(COLORS[p[0]]));
        mesh.scale.setScalar(1.35);
        mesh.castShadow = true;
        mesh.rotation.y = p[0] === 'b' ? Math.PI : 0;
        mesh.userData.piece = p;
        this.pos(sq, mesh.position);
        this.group.add(mesh);
        this.meshes.set(sq, mesh);
      }
    }
  }

  update(dt, m) {
    this.syncPieces(m);
    for (const a of this.anims) {
      a.t = Math.min(1, a.t + dt / 0.3);
      const k = a.t * a.t * (3 - 2 * a.t);
      a.mesh.position.lerpVectors(a.from, a.to, k);
      a.mesh.position.y = Math.sin(k * Math.PI) * 0.04;
    }
    this.anims = this.anims.filter((a) => a.t < 1);
    // sorot langkah terakhir & raja yang diskak (terlihat semua pemain)
    this.markers.begin();
    if (m.last) for (const sq of [m.last.from, m.last.to]) this.markers.add(this.pos(sq), '#ffd43b');
    if (m.phase === 'play' && m.chess && inCheck(m.chess)) this.markers.add(this.pos(m.chess.board.indexOf(m.chess.turn + 'K')), '#ff6b6b');
    for (const extra of this.extraMarks || []) this.markers.add(extra.pos, extra.color, extra.kind);
    this.markers.end();
  }

  dispose() {
    this.group.removeFromParent();
  }
}

class CaturControls {
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

  update(dt, m) {
    const r = this.ctx.renderer(m);
    this.btnResign.hidden = m.phase !== 'play';
    if (!r) return;
    const marks = [];
    if (this.myTurn(m) && this.sel >= 0 && m.chess) {
      marks.push({ pos: r.pos(this.sel), color: '#4dabf7' });
      for (const mv of legalChess(m.chess).filter((x) => x.from === this.sel)) marks.push({ pos: r.pos(mv.to), color: '#51cf66', kind: 'dot' });
    } else if (!this.myTurn(m)) this.sel = -1;
    r.extraMarks = marks;
  }

  chip(m) {
    if (m.phase !== 'play') return null;
    const c = this.myColor(m);
    return { bg: c === 'w' ? '#f8f3e6' : '#3b3f48', title: c === 'w' ? 'Kamu putih' : 'Kamu hitam' };
  }

  targets(m) {
    const r = this.ctx.renderer(m);
    return r ? [r.plane] : [];
  }

  click(obj, m) {
    if (!obj || m.phase !== 'play') return;
    if (!this.myTurn(m)) return this.ctx.flash('Bukan giliranmu');
    const r = this.ctx.renderer(m);
    const hitPoint = this.ctx.lastHitPoint;
    const cell = hitPoint && pickCell(hitPoint, r.group, 8, SIZE);
    if (!cell) return;
    const sq = cell.r * 8 + cell.f;
    const p = m.chess.board[sq];
    if (p && p[0] === this.myColor(m)) {
      this.sel = sq;
      this.ctx.audio.play('click');
      return;
    }
    if (this.sel >= 0 && legalChess(m.chess).some((x) => x.from === this.sel && x.to === sq)) {
      this.ctx.act({ a: 'move', from: this.sel, to: sq });
      this.sel = -1;
      return;
    }
    this.sel = -1;
  }

  onEvent(ev, m) {
    if (ev.k === 'move' || (ev.k === 'win' && ev.from !== undefined)) this.ctx.playAtTable(ev.cap ? 'kick' : 'click2', m);
    if (ev.k === 'move' && ev.check) this.ctx.flash('Skak!');
  }

  endText(m) {
    const ev = m.ev;
    const name = this.ctx.playerName;
    if (ev.why === 'mate') return `Skakmat! ${m.winner === this.ctx.myId ? 'Kamu menang!' : `${name(m.winner)} menang`}`;
    if (ev.why === 'resign') return `${name(ev.by)} menyerah`;
    if (ev.why === 'stalemate') return 'Remis (buntu)';
    if (ev.why === 'draw') return 'Remis';
    return null;
  }
}

export default {
  id: 'catur',
  name: 'Catur',
  icon: 'chess',
  art: 'linear-gradient(135deg, #3b3f48 50%, #f0d9b5 50%)',
  min: 2,
  max: 2,
  seatOrder: [0, 2],
  topView: true,
  Host: CaturHost,
  Renderer: CaturRenderer,
  Controls: CaturControls,
};
