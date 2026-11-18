import * as THREE from 'three';
import { Character } from '../character/Character.js';
import { cardAtlas } from './cardArt.js';
import { icon } from '../ui/icons.js';
import { avatarUrl } from '../ui/avatar.js';
import { clamp, damp } from '../utils/math.js';

const $ = (id) => document.getElementById(id);
const INVITE_MS = 30000;

/**
 * Pengelola semua game meja (Kartu Kilat, Gertak, Catur, Dam, Ludo):
 * daftar meja aktif, undangan, duduk di kursi, kamera orang-pertama / tampak atas,
 * panel lobi & hasil, bot, serta meneruskan klik ke modul game.
 */
export class TableGames {
  constructor({ scene, camera, world, audio, ui, input, games, onEnter, onExit }) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.ui = ui;
    this.input = input;
    this.games = Object.fromEntries(games.map((g) => [g.id, g]));
    this.onEnter = onEnter;
    this.onExit = onExit;
    this.tables = world.props.markers.cardTables;
    this.tableState = this.tables.map(() => ({ game: null, renderer: null, bots: new Map(), marker: null }));
    this.host = null;
    this.active = null;
    this.controls = null;
    this.seatIndex = -1;
    this.look = { yaw: 0, pitch: -0.62 };
    this.topBlend = 0;
    this.viewTop = false;
    // kamera game papan: bebas (orbit, tinggi, zoom) atau tampak atas
    this.boardCam = { yaw: 0, el: 0.9, dist: 1.05, topH: 1.0 };
    this.camHintShown = false;
    this.raycaster = new THREE.Raycaster();
    this.invite = null;
    this.joining = null;
    this.leftMatch = null;
    this.lastEvN = -1;
    this.lastTurnMine = false;
    this.uiTimer = 0;
    this.lastUiSig = '';
    this.topButtons = [];
    this._pa = new THREE.Vector3();
    this._pb = new THREE.Vector3();
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    cardAtlas();
    this.ctx = this.makeContext();
    this.bindDom();
  }

  attach({ net, local, remotes, profile }) {
    this.net = net;
    this.local = local;
    this.remotes = remotes;
    this.profile = profile;
    net.onEvent('cg', (p, from) => {
      if (this.host && p?.m === this.host.state.id) this.host.handle(p, from);
    });
    net.onEvent('cg-inv', (p, from) => this.receiveInvite(p, from));
  }

  get myId() {
    return this.net?.me.id;
  }

  get inTable() {
    return !!this.active;
  }

  module(m) {
    return this.games[m?.game];
  }

  // ---------- Konteks untuk modul game ----------
  makeContext() {
    const self = this;
    return {
      scene: this.scene,
      camera: this.camera,
      audio: this.audio,
      ui: this.ui,
      get myId() {
        return self.myId;
      },
      act: (a) => this.act(a),
      flash: (t) => this.flash(t),
      playerName: (id) => this.playerName(id),
      seatOf: (m, i) => this.seatOf(m, i),
      eye: (out) => this.eye(out),
      seatRot: () => this.local?.seat?.rot || 0,
      renderer: (m) => this.tableState[m.table]?.renderer,
      playAtTable: (name, m) => {
        const t = this.tables[m.table];
        this.audio.playAt(name, t.x, t.z);
      },
      button: (ic, label, onClick, cls = '', id = '') => {
        const b = document.createElement('button');
        b.type = 'button';
        if (id) b.id = id;
        b.className = `btn ${cls}`;
        b.innerHTML = `${icon(ic)}<span></span>`;
        b.querySelector('span').textContent = label;
        b.hidden = true;
        b.addEventListener('click', onClick);
        $('cu-actions').appendChild(b);
        return b;
      },
      /** Tombol kecil di bar atas (mis. Menyerah) — tidak menutupi papan di layar potret. */
      topButton: (ic, label, onClick, id = '') => {
        const b = document.createElement('button');
        b.type = 'button';
        if (id) b.id = id;
        b.className = 'icon-btn cu-topbtn';
        b.title = label;
        b.setAttribute('aria-label', label);
        b.innerHTML = `${icon(ic)}<span></span>`;
        b.querySelector('span').textContent = label;
        b.hidden = true;
        b.addEventListener('click', onClick);
        $('cu-view').before(b);
        this.topButtons.push(b);
        return b;
      },
      setTopView: (on) => {
        this.viewTop = on;
      },
    };
  }

  seatOf(m, i) {
    const mod = this.module(m);
    const order = typeof mod.seatOrder === 'function' ? mod.seatOrder(m.players.length) : mod.seatOrder;
    return this.tables[m.table].seats[order[i] ?? i];
  }

  eye(out) {
    const seat = this.local.seat;
    return out.set(seat.x, seat.y + this.local.character.dims.seatedEye, seat.z);
  }

  // ---------- Meja aktif di room ----------
  allMatches() {
    const list = [];
    if (this.host) list.push(this.host.state);
    if (this.remotes) {
      for (const rp of this.remotes.values()) {
        const s = rp.handle.getState('cg');
        if (s && s.dealer === rp.id && this.games[s.game] && Array.isArray(s.players) && Number.isInteger(s.table) && this.tables[s.table]) list.push(s);
      }
    }
    return list;
  }

  freeTable(minSeats = 4) {
    const used = new Set(this.allMatches().map((m) => m.table));
    // utamakan meja terdekat
    const p = this.local?.position;
    const order = this.tables.map((t, i) => i).filter((i) => !used.has(i) && this.tables[i].seats.length >= minSeats);
    if (p) order.sort((a, b) => Math.hypot(this.tables[a].x - p.x, this.tables[a].z - p.z) - Math.hypot(this.tables[b].x - p.x, this.tables[b].z - p.z));
    return order.length ? order[0] : -1;
  }

  playerName(id) {
    if (id === this.myId) return 'Kamu';
    const p = this.active?.players.find((x) => x.id === id);
    return p?.name || this.remotes?.get(id)?.name || 'Pemain';
  }

  // ---------- DOM ----------
  bindDom() {
    $('invite-send').addEventListener('click', () => this.sendInvites());
    $('invite-bot').addEventListener('click', () => {
      if ($('invite-modal').dataset.kind !== 'table') return;
      if (this.host?.addBot()) this.audio.play('click');
      this.ui.closeModal('invite-modal');
    });
    $('ip-yes').addEventListener('click', () => this.answerInvite(true));
    $('ip-no').addEventListener('click', () => this.answerInvite(false));
    $('cu-invite').addEventListener('click', () => this.openInvite());
    $('cu-start').addEventListener('click', () => this.host?.start());
    $('cu-again').addEventListener('click', () => this.host?.start());
    $('cu-exit').addEventListener('click', () => this.leave());
    $('cu-leave').addEventListener('click', () => this.leave());
    $('cu-gear').addEventListener('click', () => {
      this.setTray(!$('cards-ui').classList.contains('tray-open'));
      this.audio.play('click');
    });
    $('cu-view').addEventListener('click', () => {
      this.viewTop = !this.viewTop;
      this.renderViewButton();
      this.audio.play('click');
    });

    const surface = $('surface');
    let down = null;
    surface.addEventListener('pointerdown', (e) => {
      if (this.active) down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      if (this.active) this.setTray(false); // ketuk area game menutup tombol
    });
    surface.addEventListener('pointerup', (e) => {
      if (!this.active || !down || down.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && performance.now() - down.t < 500) {
        this.controls?.click(this.pick(e.clientX, e.clientY), this.active);
      }
      down = null;
    });
    surface.addEventListener('pointermove', (e) => {
      if (!this.active || e.pointerType !== 'mouse' || e.buttons) return;
      const hit = this.pick(e.clientX, e.clientY);
      this.controls?.setHover?.(hit, this.active);
      surface.style.cursor = hit ? 'pointer' : '';
    });
  }

  setTray(open) {
    $('cards-ui').classList.toggle('tray-open', open);
    $('cu-gear').classList.toggle('on', open);
  }

  /** Tombol chat, mikrofon & menu ikut masuk ke baki tombol meja (di samping tombol keluar). */
  borrowSysButtons(on) {
    const ids = ['btn-chat', 'btn-mic', 'btn-menu'];
    if (on) for (const id of ids) $('cu-tray').insertBefore($(id), $('cu-leave'));
    else for (const id of ['btn-mic', 'btn-chat', 'btn-games', 'btn-menu']) $('sys-btns').appendChild($(id));
  }

  renderViewButton() {
    const b = $('cu-view');
    const top = this.viewTop;
    b.innerHTML = icon(top ? 'orbit' : 'topView');
    b.title = top ? 'Kamera bebas' : 'Tampak atas';
    b.setAttribute('aria-label', b.title);
  }

  /** Game papan: kamera bebas penuh + tampak atas. Game kartu: kamera bebas tanpa putar kiri/kanan. */
  isBoardGame(m = this.active) {
    return !!this.module(m)?.topView;
  }

  defaultCam(m = this.active) {
    return this.isBoardGame(m) ? { yaw: 0, el: 0.9, dist: 1.05, topH: 1.0 } : { yaw: 0, el: 0.78, dist: 1.3, topH: 1.0 };
  }

  pick(x, y) {
    if (!this.active || !this.controls) return null;
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.controls.targets(this.active), false)[0];
    this.ctx.lastHitPoint = hit ? hit.point.clone() : null;
    return hit ? hit.object : null;
  }

  // ---------- Membuat meja & undangan ----------
  createMatch(gameId) {
    if (!this.net) return;
    if (this.active || this.host) {
      this.ui.toast('Kamu sedang di meja game.');
      return;
    }
    const mod = this.games[gameId];
    const table = this.freeTable();
    if (table < 0) {
      this.ui.toast('Semua meja sedang dipakai.');
      return;
    }
    const p = this.profile();
    this.host = new mod.Host({
      table,
      me: { id: this.myId, name: p.name, color: p.color, look: p.look },
      publish: (s) => this.net.me.setState('cg', s ? JSON.parse(JSON.stringify(s)) : null, true),
    });
    this.audio.play('shuffle');
    setTimeout(() => this.openInvite(), 400);
  }

  openInvite() {
    if (!this.host || this.host.state.phase !== 'lobby') return;
    const inMatch = new Set(this.allMatches().flatMap((m) => m.players.map((p) => p.id)));
    const rows = [...this.remotes.values()].filter((rp) => rp.hasPose && !inMatch.has(rp.id) && !rp.busy);
    $('invite-list').replaceChildren(
      ...rows.map((rp) => {
        const li = document.createElement('li');
        li.innerHTML = '<label style="display:contents"><input type="checkbox" /><span class="dot"></span><span class="name"></span></label>';
        li.querySelector('input').value = rp.id;
        li.querySelector('.dot').style.background = rp.color;
        li.querySelector('.name').textContent = rp.name;
        return li;
      })
    );
    $('invite-empty').hidden = rows.length > 0;
    $('invite-bot').hidden = this.host.state.players.length >= this.host.max;
    $('invite-modal').dataset.kind = 'table';
    this.ui.openModal('invite-modal');
  }

  sendInvites() {
    if ($('invite-modal').dataset.kind !== 'table') return;
    const ids = [...$('invite-list').querySelectorAll('input:checked')].map((i) => i.value);
    this.ui.closeModal('invite-modal');
    if (!ids.length || !this.host) return;
    const to = ids.slice(0, Math.max(0, this.host.max - this.host.state.players.length));
    if (!to.length) return;
    this.host.invite(to);
    this.net.sendEvent('cg-inv', { m: this.host.state.id, g: this.host.state.game, to, t: this.host.state.table });
    this.ui.toast(`Undangan terkirim ke ${to.length} pemain.`);
  }

  receiveInvite(p, from) {
    if (!p || !Array.isArray(p.to) || !p.to.includes(this.myId) || !this.games[p.g]) return;
    if (this.active || this.host || this.busy?.() || !$('invite-pop').hidden) {
      this.net.sendEvent('cg', { m: p.m, a: 'decline' });
      return;
    }
    this.invite = { m: p.m, from, until: Date.now() + INVITE_MS };
    $('ip-from').textContent = this.remotes.get(from)?.name || 'Teman';
    $('ip-what').textContent = `ngajak main ${this.games[p.g].name}`;
    $('invite-pop').dataset.owner = 'table';
    $('invite-pop').hidden = false;
    this.audio.play('chime');
  }

  answerInvite(yes) {
    if ($('invite-pop').dataset.owner !== 'table') return;
    const inv = this.invite;
    $('invite-pop').dataset.owner = '';
    $('invite-pop').hidden = true;
    this.invite = null;
    if (!inv) return;
    if (yes) {
      const p = this.profile();
      this.net.sendEvent('cg', { m: inv.m, a: 'join', n: p.name, c: p.color, look: p.look });
      this.joining = { m: inv.m, until: Date.now() + 6000 };
    } else this.net.sendEvent('cg', { m: inv.m, a: 'decline' });
  }

  // ---------- Aksi ----------
  act(a) {
    if (!this.active) return;
    if (this.host && this.host.state.id === this.active.id) this.host.handle(a, this.myId);
    else this.net.sendEvent('cg', { ...a, m: this.active.id });
  }

  leave() {
    if (this.host) {
      this.host = null;
      this.net.me.setState('cg', null, true);
    } else if (this.active) {
      this.act({ a: 'leave' });
      this.leftMatch = this.active.id;
    }
    this.exit();
  }

  onPlayerQuit(id) {
    this.host?.removePlayer(id);
  }

  flash(text) {
    const el = $('cu-msg');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  // ---------- Masuk / keluar meja ----------
  enter(match) {
    const mod = this.module(match);
    this.active = match;
    this.lastEvN = match.ev?.n ?? -1;
    this.look = { yaw: 0, pitch: -0.62 };
    this.viewTop = false;
    this.topBlend = 0;
    this.boardCam = this.defaultCam(match);
    this.baseFov = this.camera.fov;
    this.input.setCardMode(true);
    this.input.exitLock();
    this.local.character.root.visible = false;
    this.local.immune = true;
    document.body.classList.add('in-cards');
    $('cards-ui').hidden = false;
    $('cards-ui').dataset.game = mod.id;
    $('cu-view').hidden = !mod.topView;
    this.renderViewButton();
    if (!this.camHintShown) {
      this.camHintShown = true;
      setTimeout(() => this.ui.toast(mod.topView ? 'Geser kiri/kanan: putar · atas/bawah: tinggi kamera · cubit/scroll: zoom' : 'Geser atas/bawah: tinggi kamera · cubit/scroll: zoom'), 900);
    }
    $('cu-actions').replaceChildren();
    this.clearTopButtons();
    this.borrowSysButtons(true);
    this.setTray(false);
    $('invite-pop').hidden = true;
    this.controls = new mod.Controls(this.ctx);
    this.controls.enter?.(match);
    this.onEnter?.();
  }

  clearTopButtons() {
    for (const b of this.topButtons) b.remove();
    this.topButtons = [];
  }

  sitAt(index) {
    this.seatIndex = index;
    this.local.sit(this.seatOf(this.active, index));
  }

  exit(reason) {
    if (!this.active) return;
    const seat = this.local.seat;
    this.active = null;
    this.seatIndex = -1;
    this.local.seat = null;
    if (seat) {
      this.local.position.set(seat.x - Math.sin(seat.rot) * 0.7, seat.y - 0.46, seat.z - Math.cos(seat.rot) * 0.7);
      this.local.facing = seat.rot + Math.PI;
    }
    this.local.character.root.visible = true;
    this.local.immune = false;
    this.local.gaze.yaw = this.local.gaze.pitch = 0;
    this.camera.up.set(0, 1, 0);
    this.camera.rotation.order = 'XYZ';
    if (this.baseFov) {
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
    this.input.setCardMode(false);
    document.body.classList.remove('in-cards');
    $('cards-ui').hidden = true;
    for (const id of ['cu-lobby', 'cu-colors', 'cu-end']) $(id).hidden = true;
    $('cu-actions').replaceChildren();
    this.clearTopButtons();
    this.borrowSysButtons(false);
    this.setTray(false);
    this.controls?.exit?.();
    this.controls = null;
    this.onExit?.();
    if (reason) this.ui.toast(reason);
  }

  // ---------- Kamera ----------
  applyLook({ yaw, pitch, zoom = 0 }) {
    const c = this.boardCam;
    if (this.viewTop) {
      c.topH = clamp(c.topH * Math.exp(zoom * 0.08), 0.45, 1.9);
      return;
    }
    const board = this.isBoardGame();
    if (board) c.yaw += yaw * 1.3; // geser kiri/kanan: memutari papan (game kartu: tidak)
    c.el = clamp(c.el - pitch * 1.3, board ? 0.18 : 0.3, board ? 1.45 : 1.3); // geser atas = kamera lebih tinggi
    c.dist = clamp(c.dist * Math.exp(zoom * 0.08), board ? 0.42 : 0.6, board ? 2.4 : 2.1);
  }

  updateCamera(dt) {
    if (!this.active || !this.local.seat) return;
    const seat = this.local.seat;
    const cam = this.camera;
    const fov = 70; // pandangan di meja
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    this.updateBoardCamera(dt, seat);
    // kartu di tangan menempel di bawah layar mengikuti kamera
    this.controls?.hand?.anchor(cam);
  }

  /** Kamera bebas (orbit di sekitar papan) dipadukan halus dengan tampak atas. */
  updateBoardCamera(dt, seat) {
    const cam = this.camera;
    const t = this.tables[this.active.table];
    const c = this.boardCam;
    const target = this._tg || (this._tg = new THREE.Vector3());
    target.set(t.x, t.y + 0.02, t.z);
    const up = this._up || (this._up = new THREE.Vector3(0, 1, 0));
    const m4 = this._m4 || (this._m4 = new THREE.Matrix4());
    // bebas: dari sisi kursi kita (+ putaran), ketinggian & jarak bisa diatur
    const th = seat.rot + Math.PI + c.yaw;
    const h = c.dist * Math.cos(c.el);
    this._pa.set(t.x + Math.sin(th) * h, t.y + c.dist * Math.sin(c.el), t.z + Math.cos(th) * h);
    this._qa.setFromRotationMatrix(m4.lookAt(this._pa, target, up));
    // tampak atas: menunduk ke papan, bagian atas layar = arah depan kursi kita
    this.topBlend = damp(this.topBlend, this.viewTop ? 1 : 0, 6, dt);
    if (this.topBlend > 0.001) {
      const fx = Math.sin(seat.rot), fz = Math.cos(seat.rot);
      this._pb.set(t.x - fx * 0.3 * c.topH, t.y + c.topH, t.z - fz * 0.3 * c.topH);
      const fwd = this._fw || (this._fw = new THREE.Vector3());
      fwd.set(fx, 0, fz);
      const look = this._lk || (this._lk = new THREE.Vector3());
      look.set(t.x + fx * 0.04, t.y, t.z + fz * 0.04);
      this._qb.setFromRotationMatrix(m4.lookAt(this._pb, look, fwd));
      cam.position.lerpVectors(this._pa, this._pb, this.topBlend);
      cam.quaternion.slerpQuaternions(this._qa, this._qb, this.topBlend);
    } else {
      cam.position.copy(this._pa);
      cam.quaternion.copy(this._qa);
    }
    // tampilkan karakter sendiri kecuali kamera terlalu dekat dengan kepalanya
    const ch = this.local.character;
    const hx = seat.x - cam.position.x, hy = seat.y + ch.dims.seatedEye - cam.position.y, hz = seat.z - cam.position.z;
    ch.root.visible = Math.hypot(hx, hy, hz) > 0.6;
    this.local.gaze.yaw = 0;
    this.local.gaze.pitch = -0.6;
  }

  // ---------- UI ----------
  updateUi(dt, m, now) {
    const mod = this.module(m);
    const isHost = this.host && this.host.state.id === m.id;
    const myTurn = m.phase === 'play' && m.players[m.turn]?.id === this.myId;
    this.updateTurnClock(m, now);

    this.uiTimer -= dt;
    const sig = `${m.v}|${m.phase}|${myTurn}`;
    if (sig === this.lastUiSig && this.uiTimer > 0) return;
    this.lastUiSig = sig;
    this.uiTimer = 0.5;

    $('cu-lobby').hidden = m.phase !== 'lobby';
    $('cu-end').hidden = m.phase !== 'end';
    const top = $('cards-ui').querySelector('.cu-top');
    top.classList.toggle('lobby', m.phase !== 'play');
    this.renderPlayers(m);
    $('cu-lobby').querySelector('h3 span').textContent = mod.name;

    if (m.phase === 'lobby') {
      const rows = [];
      for (let i = 0; i < (this.host?.max ?? mod.max); i++) {
        const p = m.players[i];
        const li = document.createElement('li');
        if (p) {
          li.innerHTML = `<span class="dot"></span><span class="name"></span>${p.bot ? `<span class="tag">${icon('bot')}Bot</span>` : p.id === m.dealer ? `<span class="tag">${icon('crown')}Bandar</span>` : ''}`;
          li.querySelector('.dot').style.background = p.color;
          li.querySelector('.name').textContent = p.id === this.myId ? `${p.name} (kamu)` : p.name;
        } else {
          const inv = m.invited?.[i - m.players.length];
          li.className = 'empty-seat';
          if (inv) {
            li.innerHTML = `${icon('hourglass')}<span class="name"></span>`;
            li.querySelector('.name').textContent = this.remotes.get(inv.id)?.name || 'Diundang';
          } else li.innerHTML = `${icon('plus')}<span class="name">Kursi kosong</span>`;
        }
        rows.push(li);
      }
      $('cu-seats').replaceChildren(...rows);
      $('cu-invite').hidden = !isHost || m.players.length >= mod.max;
      $('cu-start').hidden = !isHost;
      $('cu-start').disabled = m.players.length < mod.min;
      $('cu-wait').hidden = !!isHost;
    }
    if (m.phase === 'end') {
      const w = m.players.find((p) => p.id === m.winner);
      $('cu-winner').textContent = this.controls?.endText?.(m) || (m.winner === this.myId ? 'Kamu menang!' : w ? `${w.name} menang!` : 'Permainan selesai');
      $('cu-again').hidden = !isHost || m.players.length < mod.min;
    }
  }

  /** Daftar pemain: ikon karakter, nama, jumlah kartu, hitung mundur di pemain yang sedang giliran. */
  renderPlayers(m) {
    const list = $('cu-players');
    list.hidden = m.phase !== 'play';
    if (m.phase !== 'play') return;
    const chip = this.controls?.chip?.(m);
    const rows = m.players.map((p, i) => {
      const row = document.createElement('div');
      const out = m.alive && m.alive[p.id] === false;
      row.className = `cp-row${i === m.turn ? ' cur' : ''}${p.id === this.myId ? ' me' : ''}${out ? ' out' : ''}`;
      row.innerHTML = `<img class="cp-av" alt=""><span class="cp-name"></span>${
        i === m.turn && m.turnMs ? '<span class="cp-time"><svg viewBox="0 0 28 28"><circle class="trk" cx="14" cy="14" r="12"/><circle class="bar" cx="14" cy="14" r="12"/></svg><b></b></span>' : ''
      }`;
      const img = row.querySelector('img');
      img.src = avatarUrl(p.look, p.color);
      img.style.setProperty('--c', this.controls?.playerColor?.(m, p) || p.color);
      row.querySelector('.cp-name').textContent = p.id === this.myId ? 'Kamu' : p.name;
      return row;
    });
    if (chip?.dir) {
      // arah urutan giliran (Kartu Kilat bisa berbalik)
      const d = document.createElement('div');
      d.className = 'cp-order';
      d.title = chip.dir === 1 ? 'Giliran ke bawah' : 'Giliran ke atas';
      d.innerHTML = icon('arrowRight');
      d.style.transform = `rotate(${chip.dir === 1 ? 90 : -90}deg)`;
      rows.push(d);
    }
    list.replaceChildren(...rows);
    this.turnClock = list.querySelector('.cp-time');
    this.updateTurnClock(m, Date.now());
  }

  updateTurnClock(m, now) {
    const el = this.turnClock;
    if (!el || !el.isConnected || m.phase !== 'play' || !m.turnMs) return;
    const left = clamp(1 - (now - m.turnAt) / m.turnMs, 0, 1);
    const secs = Math.ceil((left * m.turnMs) / 1000);
    const b = el.querySelector('b');
    if (b.textContent !== String(secs)) b.textContent = String(secs);
    const bar = el.querySelector('.bar');
    bar.style.strokeDashoffset = String(75.4 * (1 - left));
    el.classList.toggle('low', left < 0.25);
  }

  handleEvent(m) {
    const ev = m.ev;
    if (!ev || ev.n === this.lastEvN) return;
    this.lastEvN = ev.n;
    const name = (id) => this.playerName(id);
    switch (ev.k) {
      case 'start':
        this.ctx.playAtTable('shuffle', m);
        this.flash('Mulai!');
        break;
      case 'win':
        setTimeout(() => this.audio.play('win'), 250);
        break;
      case 'join':
        this.ui.toast(`${name(ev.p)} duduk di meja ${this.module(m).name}`);
        break;
      case 'decline':
        this.ui.toast(`${name(ev.p)} menolak undangan`);
        break;
      case 'leave':
        if (ev.p !== this.myId) this.ui.toast(`${name(ev.p)} meninggalkan meja`);
        break;
    }
    this.controls?.onEvent?.(ev, m);
  }

  // ---------- Tampilan meja untuk semua pemain (termasuk penonton) ----------
  updateTables(dt, matches) {
    const byTable = new Map(matches.map((m) => [m.table, m]));
    this.tables.forEach((t, i) => {
      const ts = this.tableState[i];
      const m = byTable.get(i) || null;
      const mod = this.module(m);
      if (ts.game !== (mod?.id || null)) {
        ts.renderer?.dispose();
        ts.renderer = mod ? new mod.Renderer(this.ctx, t) : null;
        ts.game = mod?.id || null;
      }
      ts.renderer?.update(dt, m, this.active?.id === m?.id ? this.myId : null);
      // bot
      const bots = new Set();
      m?.players.forEach((p, idx) => {
        if (!p.bot) return;
        bots.add(p.id);
        let b = ts.bots.get(p.id);
        if (!b) {
          b = new Character({ name: p.name, color: p.color, look: p.look, showName: true });
          this.scene.add(b.root);
          ts.bots.set(p.id, b);
        }
        const s = this.seatOf(m, idx);
        b.root.position.set(s.x, s.y, s.z);
        b.root.rotation.y = s.rot;
        b.setGaze(0, -0.5);
        b.animate(dt, { speed: 0, grounded: true, swimming: false, vy: 0, sitting: true });
      });
      for (const [id, b] of ts.bots) {
        if (!bots.has(id)) {
          b.dispose();
          ts.bots.delete(id);
        }
      }
      // penanda giliran
      if (!ts.marker) {
        ts.marker = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), new THREE.MeshBasicMaterial({ color: '#ffe066' }));
        ts.marker.rotation.x = -Math.PI / 2;
        this.scene.add(ts.marker);
      }
      const show = m?.phase === 'play';
      ts.marker.visible = show;
      if (show) {
        const s = this.seatOf(m, m.turn);
        ts.marker.position.set(t.x + (s.x - t.x) * 0.6, t.y + 0.004, t.z + (s.z - t.z) * 0.6);
        ts.marker.scale.setScalar(1 + Math.sin(performance.now() / 160) * 0.15);
      }
    });
  }

  // ---------- Tiap frame ----------
  update(dt, now) {
    if (!this.net) return;
    this.host?.tick(now);
    const matches = this.allMatches();
    this.updateTables(dt, matches);

    if (this.invite) {
      const left = (this.invite.until - now) / INVITE_MS;
      $('ip-bar').style.transform = `scaleX(${clamp(left, 0, 1)})`;
      if (left <= 0) this.answerInvite(false);
    }

    let mine = matches.find((m) => m.players.some((p) => p.id === this.myId) && m.id !== this.leftMatch);
    if (this.leftMatch && !matches.some((m) => m.id === this.leftMatch && m.players.some((p) => p.id === this.myId))) this.leftMatch = null;
    if (mine && !this.active) this.enter(mine);
    if (!mine && this.active) {
      const wasHost = this.active.dealer === this.myId;
      this.exit(wasHost ? '' : 'Meja game dibubarkan.');
      return;
    }
    if (this.joining) {
      if (mine) this.joining = null;
      else if (now > this.joining.until) {
        this.joining = null;
        this.ui.toast('Undangan sudah tidak berlaku.');
      }
    }
    if (!this.active) return;
    this.active = mine;
    const idx = mine.players.findIndex((p) => p.id === this.myId);
    if (idx !== this.seatIndex) this.sitAt(idx);
    this.handleEvent(mine);
    const myTurn = mine.phase === 'play' && mine.players[mine.turn]?.id === this.myId;
    if (myTurn && !this.lastTurnMine) this.audio.play('turn');
    this.lastTurnMine = myTurn;
    this.controls.update(dt, mine, now);
    this.updateUi(dt, mine, now);
  }
}
