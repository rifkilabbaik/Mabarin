import * as THREE from 'three';
import { MatchHost } from './MatchHost.js';
import { TableView } from './TableView.js';
import { MAX_PLAYERS, SUITS, SUIT_INFO, TURN_MS, canPlay, faceKey, parse } from './rules.js';
import { makeCard, setCardFace, cardAtlas } from './cardArt.js';
import { icon, suitIcon } from '../ui/icons.js';
import { clamp, damp } from '../utils/math.js';

const $ = (id) => document.getElementById(id);
const HAND_W = 0.1;
const SUIT_ORDER = Object.fromEntries(SUITS.map((s, i) => [s, i]));
const VALUE_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', 'p2', 'wild', 'wild4'];

function sortHand(ids) {
  return [...ids].sort((a, b) => {
    const A = parse(a), B = parse(b);
    const sa = A.wild ? 9 : SUIT_ORDER[A.suit], sb = B.wild ? 9 : SUIT_ORDER[B.suit];
    return sa - sb || VALUE_ORDER.indexOf(A.value) - VALUE_ORDER.indexOf(B.value) || (a < b ? -1 : 1);
  });
}

/**
 * Kartu Kilat: undangan, meja, tampilan orang-pertama (ala VR) & interaksi kartu.
 * Alur: tombol Game → Kartu Kilat → Undang teman → teman menerima popup Terima/Abaikan.
 */
export class CardGame {
  constructor({ scene, camera, world, audio, ui, input, onEnter, onExit }) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.ui = ui;
    this.input = input;
    this.onEnter = onEnter;
    this.onExit = onExit;
    this.tables = world.props.markers.cardTables;
    this.views = this.tables.map((t) => new TableView(scene, t));
    this.host = null;
    this.active = null; // state match yang sedang kita ikuti
    this.seatIndex = -1;
    this.look = { yaw: 0, pitch: -0.62 };
    this.handGroup = new THREE.Group();
    this.handGroup.rotation.order = 'YXZ';
    scene.add(this.handGroup);
    this.handCards = new Map(); // id kartu -> mesh
    this.hover = null;
    this.raycaster = new THREE.Raycaster();
    this.pendingWild = null;
    this.invite = null; // undangan masuk
    this.joining = null;
    this.lastEvN = -1;
    this.lastTurnMine = false;
    this.uiTimer = 0;
    this.lastUiSig = '';
    cardAtlas();
    this.bindDom();
  }

  attach({ net, local, remotes, profile }) {
    this.net = net;
    this.local = local;
    this.remotes = remotes;
    this.profile = profile; // () => {name,color,look}
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

  // ---------- Daftar permainan aktif di room ----------
  allMatches() {
    const list = [];
    if (this.host) list.push(this.host.state);
    if (this.remotes) {
      for (const rp of this.remotes.values()) {
        const s = rp.handle.getState('cg');
        if (s && s.dealer === rp.id && Array.isArray(s.players) && Number.isInteger(s.table) && this.tables[s.table]) list.push(s);
      }
    }
    return list;
  }

  freeTable() {
    const used = new Set(this.allMatches().map((m) => m.table));
    return this.tables.findIndex((t, i) => !used.has(i));
  }

  playerName(id) {
    if (id === this.myId) return 'Kamu';
    const p = this.active?.players.find((x) => x.id === id);
    return p?.name || this.remotes?.get(id)?.name || 'Pemain';
  }

  // ---------- DOM ----------
  bindDom() {
    $('game-kilat').addEventListener('click', () => {
      this.ui.closeModal('games');
      this.createMatch();
    });
    $('invite-send').addEventListener('click', () => this.sendInvites());
    $('invite-bot').addEventListener('click', () => {
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
    $('cu-draw').addEventListener('click', () => this.act({ a: 'draw' }));
    $('cu-pass').addEventListener('click', () => this.act({ a: 'pass' }));
    $('cu-kilat').addEventListener('click', () => this.act({ a: 'kilat' }));

    const grid = $('cu-colors').querySelector('.cu-color-grid');
    for (const s of SUITS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = SUIT_INFO[s].color;
      b.setAttribute('aria-label', SUIT_INFO[s].name);
      b.innerHTML = suitIcon(s);
      b.addEventListener('click', () => this.chooseColor(s));
      grid.appendChild(b);
    }

    // Ketuk / klik kartu (bedakan dari geser untuk melihat sekeliling)
    const surface = $('surface');
    let down = null;
    surface.addEventListener('pointerdown', (e) => {
      if (this.active) down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    });
    surface.addEventListener('pointerup', (e) => {
      if (!this.active || !down || down.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved < 10 && performance.now() - down.t < 500) this.click(e.clientX, e.clientY);
      down = null;
    });
    surface.addEventListener('pointermove', (e) => {
      if (!this.active || e.pointerType !== 'mouse' || e.buttons) return;
      this.hover = this.pick(e.clientX, e.clientY);
      surface.style.cursor = this.hover ? 'pointer' : '';
    });
  }

  // ---------- Membuat meja & mengundang ----------
  openGames() {
    if (!this.net) return;
    if (this.active) {
      this.ui.toast('Kamu sedang di meja kartu.');
      return;
    }
    this.ui.openModal('games');
  }

  createMatch() {
    if (this.active || this.host) return;
    const table = this.freeTable();
    if (table < 0) {
      this.ui.toast('Semua meja sedang dipakai.');
      return;
    }
    const p = this.profile();
    this.host = new MatchHost({
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
    const list = $('invite-list');
    const rows = [...this.remotes.values()].filter((rp) => rp.hasPose && !inMatch.has(rp.id));
    list.replaceChildren(
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
    $('invite-bot').hidden = this.host.state.players.length >= MAX_PLAYERS;
    this.ui.openModal('invite-modal');
  }

  sendInvites() {
    const ids = [...$('invite-list').querySelectorAll('input:checked')].map((i) => i.value);
    this.ui.closeModal('invite-modal');
    if (!ids.length || !this.host) return;
    const room = MAX_PLAYERS - this.host.state.players.length;
    const to = ids.slice(0, Math.max(0, room));
    if (!to.length) return;
    this.host.invite(to);
    this.net.sendEvent('cg-inv', { m: this.host.state.id, to, t: this.host.state.table });
    this.ui.toast(`Undangan terkirim ke ${to.length} pemain.`);
  }

  receiveInvite(p, from) {
    if (!p || !Array.isArray(p.to) || !p.to.includes(this.myId)) return;
    if (this.active || this.host) {
      this.net.sendEvent('cg', { m: p.m, a: 'decline' });
      return;
    }
    this.invite = { m: p.m, from, until: Date.now() + 30000 };
    $('ip-from').textContent = this.remotes.get(from)?.name || 'Teman';
    $('invite-pop').hidden = false;
    this.audio.play('chime');
  }

  answerInvite(yes) {
    const inv = this.invite;
    $('invite-pop').hidden = true;
    this.invite = null;
    if (!inv) return;
    if (yes) {
      const p = this.profile();
      this.net.sendEvent('cg', { m: inv.m, a: 'join', n: p.name, c: p.color, look: p.look });
      this.joining = { m: inv.m, until: Date.now() + 6000 };
    } else {
      this.net.sendEvent('cg', { m: inv.m, a: 'decline' });
    }
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

  /** Pemain keluar dari room: bandar mengeluarkannya dari meja. */
  onPlayerQuit(id) {
    this.host?.removePlayer(id);
  }

  // ---------- Masuk / keluar meja ----------
  enter(match) {
    this.active = match;
    this.lastEvN = match.ev?.n ?? -1;
    this.look = { yaw: 0, pitch: -0.62 };
    this.camera.rotation.order = 'YXZ';
    this.baseFov = this.camera.fov;
    this.input.setCardMode(true);
    this.input.exitLock();
    this.local.character.root.visible = false;
    document.body.classList.add('in-cards');
    $('cards-ui').hidden = false;
    $('invite-pop').hidden = true;
    this.onEnter?.();
  }

  sitAt(index) {
    this.seatIndex = index;
    const seat = this.tables[this.active.table].seats[index];
    this.local.sit(seat);
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
    this.camera.rotation.order = 'XYZ';
    if (this.baseFov) {
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
    this.input.setCardMode(false);
    document.body.classList.remove('in-cards');
    $('cards-ui').hidden = true;
    for (const id of ['cu-lobby', 'cu-colors', 'cu-end']) $(id).hidden = true;
    for (const c of this.handCards.values()) c.removeFromParent();
    this.handCards.clear();
    this.pendingWild = null;
    this.onExit?.();
    if (reason) this.ui.toast(reason);
  }

  // ---------- Kamera orang-pertama ----------
  applyLook({ yaw, pitch }) {
    this.look.yaw = clamp(this.look.yaw + yaw, -1.9, 1.9);
    this.look.pitch = clamp(this.look.pitch - pitch, -1.25, 0.45);
  }

  eye(out) {
    const seat = this.local.seat;
    return out.set(seat.x, seat.y + this.local.character.dims.faceY + 0.04, seat.z);
  }

  updateCamera() {
    if (!this.active || !this.local.seat) return;
    const seat = this.local.seat;
    // layar portrait: perlebar pandangan supaya kartu di tangan muat
    const fov = this.camera.aspect < 1 ? 76 : this.baseFov || 60;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.eye(this.camera.position);
    this.camera.rotation.set(this.look.pitch, seat.rot + Math.PI + this.look.yaw, 0, 'YXZ');
  }

  // ---------- Kartu di tangan ----------
  updateHand(dt, match) {
    const seat = this.local.seat;
    const hand = match.phase === 'lobby' ? [] : sortHand(match.hands?.[this.myId] || []);
    const myTurn = match.phase === 'play' && match.players[match.turn]?.id === this.myId;
    const top = match.discard?.[match.discard.length - 1];
    const { material, dimMaterial } = cardAtlas();

    const e = this.eye(new THREE.Vector3());
    const fx = Math.sin(seat.rot), fz = Math.cos(seat.rot);
    // tangan lebih rendah dari arah pandang ke tengah meja, supaya tumpukan kartu tetap terlihat
    this.handGroup.position.set(e.x + fx * 0.3, e.y - 0.42, e.z + fz * 0.3);
    this.handGroup.rotation.set(-0.92, seat.rot + Math.PI, 0, 'YXZ');

    const keep = new Set(hand);
    for (const [id, c] of this.handCards) {
      if (!keep.has(id)) {
        c.removeFromParent();
        this.handCards.delete(id);
      }
    }
    const n = hand.length;
    // jarak antarkartu menyesuaikan lebar pandangan pada jarak tangan
    const halfW = 0.52 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
    const spacing = Math.min(0.062, 0.56 / Math.max(n, 1), (halfW * 1.8 - HAND_W) / Math.max(n - 1, 1));
    hand.forEach((id, i) => {
      let c = this.handCards.get(id);
      if (!c) {
        c = makeCard(faceKey(id));
        c.scale.setScalar(HAND_W);
        c.position.set(0, -0.25, 0);
        c.userData.cardId = id;
        c.userData.front.userData.cardId = id;
        this.handGroup.add(c);
        this.handCards.set(id, c);
      }
      const off = i - (n - 1) / 2;
      const x = off * spacing;
      const playable = myTurn && canPlay(id, top, match.color);
      const lift = (this.hover === id ? 0.045 : 0) + (playable ? 0.015 : 0);
      const tx = x, ty = -Math.abs(x) * 0.2 + lift, tz = i * 0.002 + (this.hover === id ? 0.01 : 0);
      c.position.x = damp(c.position.x, tx, 14, dt);
      c.position.y = damp(c.position.y, ty, 14, dt);
      c.position.z = damp(c.position.z, tz, 14, dt);
      c.rotation.z = damp(c.rotation.z, -x * 0.9, 14, dt);
      c.userData.front.material = myTurn && !playable ? dimMaterial : material;
    });
  }

  pick(x, y) {
    if (!this.active) return null;
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = [...this.handCards.values()].map((c) => c.userData.front);
    const view = this.views[this.active.table];
    if (view.drawTop.visible) targets.push(view.drawTop.userData.front);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    if (hit.object.userData.isDrawPile) return 'draw';
    return hit.object.userData.cardId || null;
  }

  click(x, y) {
    const m = this.active;
    if (!m || m.phase !== 'play') return;
    const target = this.pick(x, y);
    if (!target) return;
    const myTurn = m.players[m.turn]?.id === this.myId;
    if (!myTurn) {
      this.flash('Bukan giliranmu');
      return;
    }
    if (target === 'draw') {
      if (!m.drew) this.act({ a: 'draw' });
      return;
    }
    const top = m.discard?.[m.discard.length - 1];
    if (!canPlay(target, top, m.color)) {
      this.flash('Kartu tidak cocok');
      this.audio.play('click');
      return;
    }
    if (parse(target).wild) {
      this.pendingWild = target;
      $('cu-colors').hidden = false;
      return;
    }
    this.act({ a: 'play', c: target });
  }

  chooseColor(suit) {
    $('cu-colors').hidden = true;
    if (!this.pendingWild) return;
    this.act({ a: 'play', c: this.pendingWild, col: suit });
    this.pendingWild = null;
  }

  flash(text) {
    const el = $('cu-msg');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  // ---------- Efek dari event permainan ----------
  handleEvent(m) {
    const ev = m.ev;
    if (!ev || ev.n === this.lastEvN) return;
    this.lastEvN = ev.n;
    const name = (id) => this.playerName(id);
    const t = this.tables[m.table];
    const at = (n) => this.audio.playAt(n, t.x, t.z);
    switch (ev.k) {
      case 'start':
        at('shuffle');
        this.flash('Mulai!');
        break;
      case 'play': {
        at('card');
        const c = parse(ev.c);
        if (ev.pen) this.flash(`${name(ev.p)} lupa Kilat! +2`);
        else if (ev.draw) this.flash(`${name(ev.draw.p)} +${ev.draw.n}`);
        else if (ev.skip) this.flash(`${name(ev.skip)} dilewati`);
        else if (c.value === 'rev') this.flash('Arah dibalik');
        else if (c.wild) this.flash(`Warna ${SUIT_INFO[ev.col]?.name || ''}`);
        break;
      }
      case 'draw':
        at('card');
        break;
      case 'kilat':
        at('kilat');
        this.flash(`${name(ev.p)}: Kilat!`);
        break;
      case 'win':
        at('card');
        setTimeout(() => this.audio.play('win'), 250);
        break;
      case 'join':
        this.ui.toast(`${name(ev.p)} duduk di meja kartu`);
        break;
      case 'decline':
        this.ui.toast(`${name(ev.p)} menolak undangan`);
        break;
      case 'leave':
        if (ev.p !== this.myId) this.ui.toast(`${name(ev.p)} meninggalkan meja`);
        break;
    }
  }

  // ---------- UI di layar ----------
  updateUi(dt, m, now) {
    const isHost = this.host && this.host.state.id === m.id;
    const myTurn = m.phase === 'play' && m.players[m.turn]?.id === this.myId;
    const myHand = m.hands?.[this.myId] || [];

    // timer berjalan mulus tiap frame
    const left = m.phase === 'play' ? clamp(1 - (now - m.turnAt) / TURN_MS, 0, 1) : 0;
    $('cu-timer-bar').style.transform = `scaleX(${left})`;
    $('cu-timer-bar').style.background = left < 0.25 ? '#ff6b6b' : '#fff';

    this.uiTimer -= dt;
    const sig = `${m.v}|${m.phase}|${myTurn}|${this.pendingWild}`;
    if (sig === this.lastUiSig && this.uiTimer > 0) return;
    this.lastUiSig = sig;
    this.uiTimer = 0.5;

    $('cu-lobby').hidden = m.phase !== 'lobby';
    $('cu-end').hidden = m.phase !== 'end';
    $('cards-ui').querySelector('.cu-top').style.visibility = m.phase === 'play' ? 'visible' : 'hidden';
    $('cards-ui').querySelector('.cu-timer').style.visibility = m.phase === 'play' ? 'visible' : 'hidden';

    if (m.phase === 'lobby') {
      const rows = [];
      for (let i = 0; i < MAX_PLAYERS; i++) {
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
      $('cu-invite').hidden = !isHost || m.players.length >= MAX_PLAYERS;
      $('cu-start').hidden = !isHost;
      $('cu-start').disabled = m.players.length < 2;
      $('cu-wait').hidden = !!isHost;
    }

    if (m.phase === 'end') {
      const w = m.players.find((p) => p.id === m.winner);
      $('cu-winner').textContent = m.winner === this.myId ? 'Kamu menang!' : w ? `${w.name} menang!` : 'Permainan selesai';
      $('cu-again').hidden = !isHost || m.players.length < 2;
    }

    if (m.phase === 'play') {
      const cur = m.players[m.turn];
      const turnEl = $('cu-turn');
      turnEl.textContent = myTurn ? 'Giliranmu' : `Giliran ${cur?.name || ''}`;
      turnEl.classList.toggle('mine', myTurn);
      const col = $('cu-color');
      col.style.background = SUIT_INFO[m.color]?.color || '';
      col.innerHTML = suitIcon(m.color);
      col.title = SUIT_INFO[m.color]?.name || '';
      const dir = $('cu-dir');
      dir.innerHTML = icon('refresh');
      dir.style.transform = m.dir === 1 ? '' : 'scaleX(-1)';
      $('cu-draw').hidden = !myTurn || m.drew;
      $('cu-pass').hidden = !myTurn || !m.drew;
      $('cu-kilat').hidden = !myTurn || myHand.length !== 2 || m.kilat?.includes(this.myId);
    } else {
      for (const id of ['cu-draw', 'cu-pass', 'cu-kilat']) $(id).hidden = true;
    }
    if (m.phase !== 'play') {
      $('cu-colors').hidden = true;
      this.pendingWild = null;
    }
  }

  // ---------- Tiap frame ----------
  update(dt, now) {
    if (!this.net) return;
    this.host?.tick(now);
    const matches = this.allMatches();

    // meja yang dilihat semua pemain
    const byTable = new Map(matches.map((m) => [m.table, m]));
    this.views.forEach((v, i) => v.update(dt, byTable.get(i) || null, this.active ? this.myId : null));

    // undangan masuk kedaluwarsa
    if (this.invite) {
      const left = (this.invite.until - now) / 30000;
      $('ip-bar').style.transform = `scaleX(${clamp(left, 0, 1)})`;
      if (left <= 0) this.answerInvite(false);
    }

    let mine = matches.find((m) => m.players.some((p) => p.id === this.myId) && m.id !== this.leftMatch);
    // setelah keluar, abaikan meja itu sampai bandar selesai mengeluarkan kita
    if (this.leftMatch && !matches.some((m) => m.id === this.leftMatch && m.players.some((p) => p.id === this.myId))) this.leftMatch = null;
    if (mine && !this.active) this.enter(mine);
    if (!mine && this.active) {
      const wasHost = this.active.dealer === this.myId;
      this.exit(wasHost ? '' : 'Meja kartu dibubarkan.');
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

    this.updateHand(dt, mine);
    this.updateUi(dt, mine, now);
  }
}
