import * as THREE from 'three';
import { boardGroup } from '../boardKit.js';
import { SPACES, TOKENS, OWNABLE, JAIL, CARDS, groupOf } from './rules.js';
import { HOP_MS } from './host.js';
import {
  BOARD_H, DECK_SPOTS, SPACE_M, spaceRect, spacePoint, spaceAt, unitToLocal, makeBoard, makeToken, makeDie, DIE, DICE_UP, makeHouse,
  makeCardMesh, deedTexture, deedBackTexture, instructionTexture, freeCardTexture, makeDeck, makeGlow, makeOwnerMark, makeJailBars, makePhone,
  CARD_W,
} from './art.js';

const HOP = HOP_MS / 1000;
const EDGE_D = 0.8; // jarak deret kartu hak milik & HP dari tengah meja
const DICE_D = 0.655; // dadu menunggu di depan pemain yang giliran (antara tepi papan & kartu)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const GROUP_ORDER = ['cokelat', 'biruMuda', 'pink', 'oranye', 'merah', 'kuning', 'hijau', 'biruTua', 'util', 'rail'];

/** Tampilan meja Juragan untuk semua pemain & penonton (semua objek di grup papan, koordinat lokal meja). */
export class JuraganRenderer {
  constructor(ctx, table) {
    this.ctx = ctx;
    this.table = table;
    this.group = boardGroup(ctx, table, table.seats[0]);
    this.board = makeBoard();
    this.group.add(this.board);
    this.tokens = new Map(); // pid → { mesh, idx, path, hop }
    this.houses = new Map();
    this.marks = new Map(); // penanda pemilik per petak
    this.cards = new Map(); // kartu di meja
    this.phones = new Map();
    // dadu: menunggu di depan pemain, dilempar ke tengah
    this.dice = [makeDie(), makeDie()];
    for (const d of this.dice) this.group.add(d);
    this.diceGlow = makeGlow(DIE * 2 + 0.06, DIE + 0.05);
    this.diceHit = new THREE.Mesh(new THREE.BoxGeometry(DIE * 2 + 0.08, DIE + 0.04, DIE + 0.07), new THREE.MeshBasicMaterial({ visible: false }));
    this.diceHit.userData.dice = true;
    this.group.add(this.diceGlow, this.diceHit);
    this.diceAnim = null;
    this.diceSlide = null;
    this.diceAt = null; // posisi pasangan dadu saat diam
    // tumpukan Takdir (atas logo) & Kebijakan (bawah logo)
    this.decks = {};
    this.deckGlow = {};
    for (const [deck, spot] of Object.entries(DECK_SPOTS)) {
      const d = makeDeck(deck);
      unitToLocal(spot.x, spot.y, d.position);
      d.rotation.y = -spot.rot;
      d.userData.box.userData.deck = deck;
      this.group.add(d);
      this.decks[deck] = d;
      const glow = makeGlow(SPACE_M * 2.35, SPACE_M * 1.4);
      glow.position.copy(d.position).setY(BOARD_H + 0.003);
      glow.rotation.y = -spot.rot;
      glow.visible = false;
      this.group.add(glow);
      this.deckGlow[deck] = glow;
    }
    this.flip = null;
    this.bars = makeJailBars(SPACE_M * 1.55);
    spacePoint(JAIL, -0.075, 0.425, this.bars.position);
    this.bars.rotation.y = -spaceRect(JAIL).rot;
    this.bars.scale.y = 0.01;
    this.bars.visible = false;
    this.group.add(this.bars);
    this.mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.45, depthWrite: false }));
    this.mark.visible = false;
    this.group.add(this.mark);
    this.lastRoll = -1;
    this.lastMv = -1;
    this.lastEv = -1;
    this.lastCard = -1;
    this.time = 0;
    this.buzz = {};
    this.viewer = null;
    // diisi kontrol pemain lokal: petak disorot
    this.view = { sel: -1 };
  }

  sound(name, opts) {
    this.ctx.audio.playAt(name, this.table.x, this.table.z, opts);
  }

  /** Arah kursi pemain ke-i (lokal papan): u = dari tengah ke kursi, r = kanan pemain. */
  seatAxes(m, i) {
    const s = this.ctx.seatOf(m, i);
    const p = this.group.worldToLocal(_v.set(s.x, s.y, s.z));
    const u = new THREE.Vector3(p.x, 0, p.z).normalize();
    return { u, r: new THREE.Vector3(u.z, 0, -u.x), yaw: Math.atan2(u.x, u.z) };
  }

  edgePos(axes, along, out, d = EDGE_D) {
    return out.set(axes.u.x * d + axes.r.x * along, 0.002, axes.u.z * d + axes.r.z * along);
  }

  /** Posisi bidak di petak (beberapa bidak di petak sama digeser; penjara: di sel atau jalur luar). */
  tokenSpot(i, k, n, jailed, out) {
    if (i === JAIL) {
      // sel penjara di bagian dalam sudut; "cuma mampir" di jalur luar
      if (jailed) return spacePoint(i, -0.2 + (k % 2) * 0.22, 0.3 + Math.floor(k / 2) * 0.24, out);
      return spacePoint(i, 0.43, 0.14 + k * 0.2, out);
    }
    const r = spaceRect(i);
    const spread = r.corner ? 0.18 : 0.22;
    if (n <= 1) return spacePoint(i, 0, r.corner ? 0.5 : 0.62, out);
    return spacePoint(i, (k % 2 ? 1 : -1) * spread, (r.corner ? 0.38 : 0.5) + Math.floor(k / 2) * (r.corner ? 0.24 : 0.28), out);
  }

  update(dt, m, viewerId) {
    this.time += dt;
    this.viewer = viewerId;
    const live = m.phase !== 'lobby';
    const fresh = m.ev && m.ev.n !== this.lastEv && this.lastEv !== -1 ? m.ev : null;
    if (m.ev) this.lastEv = m.ev.n;
    if (fresh) this.onEvent(fresh, m);
    this.updateTokens(dt, m, live);
    this.updateDice(dt, m, live, viewerId);
    this.updateDecks(dt, m, viewerId);
    this.updateBuildings(dt, m, live);
    this.updateCards(dt, m, live);
    this.updatePhones(dt, m, live);
    // sorot petak yang sedang dilihat di HP
    const sel = this.view.sel;
    this.mark.visible = sel >= 0;
    if (this.mark.visible) {
      const r = spaceRect(sel);
      unitToLocal(r.x + r.w / 2, r.y + r.h / 2, this.mark.position).y += 0.002;
      this.mark.scale.set((r.w / 13) * 1.2, 1, (r.h / 13) * 1.2);
      this.mark.material.opacity = 0.32 + Math.sin(this.time * 5) * 0.12;
    }
  }

  onEvent(ev, m) {
    if (ev.k === 'offer' && ev.to) this.buzz[ev.to] = this.time + 1.2;
    if (ev.k === 'auction') for (const p of m.players) this.buzz[p.id] = this.time + 1;
    if (ev.k === 'buy' || ev.k === 'sold' || ev.k === 'build') this.sound('place');
    if (ev.k === 'jail') this.sound('bonk');
  }

  // ---------- Bidak ----------
  updateTokens(dt, m, live) {
    const seen = new Set();
    if (live) {
      // gerakan baru: lompat petak demi petak (atau melayang langsung ke penjara)
      if (m.mv && m.mv.n !== this.lastMv) {
        const t = this.tokens.get(m.mv.pid);
        if (t && this.lastMv !== -1) {
          const { from, to, kind, steps } = m.mv;
          const dur = (m.mv.hop || HOP_MS) / 1000;
          if (kind === 'jump') t.path.push({ to, jump: true });
          else {
            const dir = steps < 0 ? -1 : 1;
            for (let k = 1; k <= Math.abs(steps); k++) t.path.push({ to: (((from + dir * k) % 40) + 40) % 40, dur });
          }
        }
        this.lastMv = m.mv.n;
      }
      const byIdx = new Map();
      for (const p of m.players) {
        if (m.out?.includes(p.id) || m.pos?.[p.id] === undefined) continue;
        const key = `${m.pos[p.id]}${m.jail?.[p.id] !== undefined ? 'j' : ''}`;
        if (!byIdx.has(key)) byIdx.set(key, []);
        byIdx.get(key).push(p.id);
      }
      for (const p of m.players) {
        if (m.out?.includes(p.id) || m.pos?.[p.id] === undefined) continue;
        seen.add(p.id);
        let t = this.tokens.get(p.id);
        const tokId = TOKENS[m.tok?.[p.id] ?? 0]?.id;
        if (!t || t.tokId !== tokId || t.color !== p.color) {
          if (t) t.mesh.removeFromParent();
          t = { mesh: makeToken(tokId, p.color), tokId, color: p.color, idx: m.pos[p.id], path: [], hop: null };
          this.group.add(t.mesh);
          this.tokens.set(p.id, t);
          this.tokenSpot(t.idx, 0, 1, m.jail?.[p.id] !== undefined, t.mesh.position);
        }
        const jailed = m.jail?.[p.id] !== undefined;
        const group = byIdx.get(`${m.pos[p.id]}${jailed ? 'j' : ''}`) || [p.id];
        if (!t.hop && t.path.length) {
          const step = t.path.shift();
          t.hop = { from: t.mesh.position.clone(), to: step.to, jump: step.jump, t: 0, dur: step.jump ? 0.7 : step.dur || HOP };
          if (!step.jump && (step.dur || HOP) > 0.15) this.sound('hop', { volume: 0.5 });
        }
        if (t.hop) {
          const h = t.hop;
          h.t = Math.min(1, h.t + dt / h.dur);
          const last = !t.path.length;
          const dest = last ? this.tokenSpot(h.to, group.indexOf(p.id), group.length, jailed && h.to === JAIL, _w) : this.tokenSpot(h.to, 0, 1, false, _w);
          t.mesh.position.lerpVectors(h.from, dest, ease(h.t));
          t.mesh.position.y += Math.sin(h.t * Math.PI) * (h.jump ? 0.16 : 0.035);
          if (h.jump) t.mesh.rotation.y += dt * 9;
          if (h.t >= 1) {
            t.idx = h.to;
            t.hop = null;
          }
        } else {
          if (!t.path.length && t.idx !== m.pos[p.id]) t.idx = m.pos[p.id];
          const dest = this.tokenSpot(t.idx, group.indexOf(p.id), group.length, jailed, _w);
          t.mesh.position.lerp(dest, 1 - Math.exp(-dt * 10));
        }
        const a = spacePoint((t.idx + 1) % 40, 0, 0.6, _v).sub(spacePoint(t.idx, 0, 0.6, _w));
        const want = Math.atan2(a.x, a.z);
        const d = Math.atan2(Math.sin(want - t.mesh.rotation.y), Math.cos(want - t.mesh.rotation.y));
        t.mesh.rotation.y += d * Math.min(1, dt * 6);
      }
    }
    for (const [pid, t] of this.tokens) {
      if (!seen.has(pid)) {
        t.mesh.removeFromParent();
        this.tokens.delete(pid);
      }
    }
  }

  // ---------- Dadu ----------
  /** Posisi pasangan dadu di depan pemain yang giliran. */
  diceHome(m, out) {
    const ax = this.seatAxes(m, m.turn);
    this.diceYaw = ax.yaw;
    return out.set(ax.u.x * DICE_D, DIE / 2, ax.u.z * DICE_D);
  }

  placePair(center, yaw) {
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    this.dice.forEach((d, k) => {
      const s = k ? 1 : -1;
      d.position.set(center.x + rx * s * DIE * 0.68, center.y, center.z + rz * s * DIE * 0.68);
    });
  }

  updateDice(dt, m, live, viewerId) {
    const show = live && m.phase === 'play';
    for (const d of this.dice) d.visible = live;
    const myRoll = show && m.stage === 'roll' && m.players[m.turn]?.id === viewerId && !this.diceAnim && !this.diceSlide;
    this.diceGlow.visible = myRoll;
    this.diceHit.visible = myRoll;
    if (!live) return;
    // dilempar: dari depan pemain ke tengah papan, hasil keluar baru bidak jalan
    if (m.rollN !== this.lastRoll) {
      if (this.lastRoll !== -1 && m.rollN > 0) {
        const from = this.dice.map((d) => d.position.clone());
        this.diceAnim = {
          t: 0,
          d: m.dice,
          from,
          to: [0, 1].map((k) => new THREE.Vector3((k ? 0.045 : -0.045) + (Math.random() - 0.5) * 0.03, BOARD_H + DIE / 2, (Math.random() - 0.5) * 0.05)),
          spin: [0, 1].map(() => new THREE.Vector3(6 + Math.random() * 6, 4 + Math.random() * 5, 5 + Math.random() * 6)),
          yaw: [0, 1].map(() => Math.random() * Math.PI * 2),
        };
        this.diceSlide = null;
        this.sound('dice');
        this.ctx.characterOf(m.players[m.turn]?.id)?.reachTo?.(this.group.localToWorld(from[0].clone()), 0.45);
      } else this.restDice(m);
      this.lastRoll = m.rollN;
    }
    const a = this.diceAnim;
    if (a) {
      a.t = Math.min(1, a.t + dt / 1.0);
      this.dice.forEach((d, k) => {
        const e = 1 - (1 - a.t) ** 2;
        d.position.lerpVectors(a.from[k], a.to[k], e);
        d.position.y = a.to[k].y + Math.abs(Math.sin(a.t * Math.PI * 2.5)) * 0.09 * (1 - a.t) + (1 - e) * (a.from[k].y - a.to[k].y);
        if (a.t < 0.85) {
          d.rotation.x += a.spin[k].x * dt;
          d.rotation.y += a.spin[k].y * dt;
          d.rotation.z += a.spin[k].z * dt;
        } else {
          const [rx, rz] = DICE_UP[a.d[k]];
          _q.setFromEuler(_e.set(rx, a.yaw[k], rz, 'YXZ'));
          d.quaternion.slerp(_q, Math.min(1, dt * 18));
        }
      });
      if (a.t >= 1) {
        this.diceAnim = null;
        this.dice.forEach((d, k) => {
          const [rx, rz] = DICE_UP[a.d[k]];
          d.quaternion.setFromEuler(_e.set(rx, a.yaw[k], rz, 'YXZ'));
          d.position.copy(a.to[k]);
        });
      }
      return;
    }
    // menunggu lemparan: dadu pindah ke depan pemain yang giliran (memutari tepi papan)
    if (show && m.stage === 'roll') {
      const home = this.diceHome(m, new THREE.Vector3());
      const cur = this.dice[0].position.clone().add(this.dice[1].position).multiplyScalar(0.5);
      if (!this.diceSlide && cur.distanceTo(home) > 0.01) {
        this.diceSlide = { t: 0, from: this.dice.map((d) => d.position.clone()), home };
        this.sound('diceSlide', { volume: 0.6 });
      }
      if (this.diceSlide) {
        const sl = this.diceSlide;
        sl.t = Math.min(1, sl.t + dt / 0.6);
        const tmp = new THREE.Vector3();
        this.placePair(sl.home, this.diceYaw);
        this.dice.forEach((d, k) => {
          tmp.copy(d.position);
          d.position.lerpVectors(sl.from[k], tmp, ease(sl.t));
          d.position.y += Math.sin(sl.t * Math.PI) * 0.05;
          d.rotation.y += dt * 6 * (1 - sl.t);
        });
        if (sl.t >= 1) this.diceSlide = null;
      }
      const c = this.diceHome(m, _v);
      this.diceGlow.position.set(c.x, 0.004, c.z);
      this.diceGlow.rotation.y = this.diceYaw;
      this.diceGlow.material.opacity = 0.7 + Math.sin(this.time * 5) * 0.3;
      this.diceHit.position.copy(c);
      this.diceHit.rotation.y = this.diceYaw;
    }
  }

  restDice(m) {
    if (m.phase === 'play' && m.stage === 'roll') {
      this.placePair(this.diceHome(m, _v), this.diceYaw);
    } else this.dice.forEach((d, k) => d.position.set(k ? 0.045 : -0.045, BOARD_H + DIE / 2, 0));
    this.dice.forEach((d, k) => {
      const [rx, rz] = DICE_UP[m.dice?.[k] || 1];
      d.quaternion.setFromEuler(_e.set(rx, k * 0.5, rz, 'YXZ'));
    });
  }

  // ---------- Tumpukan kartu & kartu yang dibalik ----------
  updateDecks(dt, m, viewerId) {
    for (const [deck, glow] of Object.entries(this.deckGlow)) {
      glow.visible = m.phase === 'play' && m.stage === 'draw' && m.drawDeck === deck;
      if (glow.visible) glow.material.opacity = 0.65 + Math.sin(this.time * 5) * 0.35;
    }
    if (m.card && m.card.n !== this.lastCard) {
      if (this.lastCard !== -1 || m.stage === 'card') {
        const deck = m.card.deck;
        const text = CARDS[deck][m.card.id].text;
        if (this.flip) this.flip.mesh.removeFromParent();
        const mesh = makeCardMesh(instructionTexture(deck, text), instructionTexture(deck));
        this.group.add(mesh);
        const d = this.decks[deck];
        this.flip = { mesh, t: 0, from: d.position.clone().setY(BOARD_H + 0.02), yaw: d.rotation.y };
        this.sound('card');
        this.ctx.characterOf(m.card.p)?.reachTo?.(this.group.localToWorld(d.position.clone()), 0.5);
      }
      this.lastCard = m.card.n;
    }
    const f = this.flip;
    if (!f) return;
    f.t += dt;
    const up = ease(f.t / 0.45);
    f.mesh.position.copy(f.from).setY(f.from.y + up * 0.09);
    // kartu dibalik (mulai tertutup), memanjang sejajar tumpukan
    f.mesh.rotation.set(0, f.yaw + Math.PI / 2, Math.PI * (1 - ease(f.t / 0.6)));
    if (f.t > 2.8) {
      f.mesh.removeFromParent();
      this.flip = null;
    }
  }

  // ---------- Rumah, hotel, penanda pemilik, jeruji ----------
  updateBuildings(dt, m, live) {
    const wantH = new Set(), wantM = new Set();
    if (live) {
      for (const i of OWNABLE) {
        const o = m.own?.[i];
        if (!o) continue;
        const r = spaceRect(i);
        // penanda pemilik: bingkai + warna tipis pemilik (abu-abu bila digadai)
        wantM.add(i);
        let mk = this.marks.get(i);
        if (!mk) {
          mk = makeOwnerMark();
          unitToLocal(r.x + r.w / 2, r.y + r.h / 2, mk.position).y += 0.0012;
          mk.rotation.y = -r.rot;
          this.group.add(mk);
          this.marks.set(i, mk);
        }
        const p = m.players.find((x) => x.id === o.by);
        mk.material.color.set(o.m ? '#6c737d' : p?.color || '#ffffff');
        if (SPACES[i].type !== 'prop' || !o.h) continue;
        const hotel = o.h === 5;
        for (let k = 0; k < (hotel ? 1 : o.h); k++) {
          const key = `${i}:${k}:${hotel ? 'H' : 'h'}`;
          wantH.add(key);
          let mesh = this.houses.get(key);
          if (!mesh) {
            mesh = makeHouse(hotel);
            this.group.add(mesh);
            this.houses.set(key, mesh);
            mesh.scale.setScalar(0.01);
          }
          spacePoint(i, hotel ? 0 : -0.33 + k * 0.22, 0.12, mesh.position);
          mesh.rotation.y = -r.rot;
          mesh.scale.setScalar(Math.min(1, mesh.scale.x + 0.06));
        }
      }
    }
    for (const [map, want] of [[this.houses, wantH], [this.marks, wantM]]) {
      for (const [key, mesh] of map) {
        if (want.has(key)) continue;
        mesh.removeFromParent();
        map.delete(key);
      }
    }
    // jeruji besi muncul selama ada pemain di penjara
    const jailed = live && m.players.some((p) => m.jail?.[p.id] !== undefined && !m.out?.includes(p.id));
    const sy = this.bars.scale.y + ((jailed ? 1 : 0.01) - this.bars.scale.y) * Math.min(1, dt * 6);
    this.bars.scale.y = sy;
    this.bars.visible = sy > 0.03;
  }

  // ---------- Kartu hak milik & bebas penjara di depan pemiliknya ----------
  updateCards(dt, m, live) {
    const want = new Map();
    if (live) {
      m.players.forEach((p, idx) => {
        if (m.out?.includes(p.id)) return;
        const ax = this.seatAxes(m, idx);
        let x = -0.88;
        for (const g of GROUP_ORDER) {
          const mine = OWNABLE.filter((i) => groupOf(i) === g && m.own?.[i]?.by === p.id);
          if (!mine.length) continue;
          mine.forEach((i, k) => {
            const pos = this.edgePos(ax, x + CARD_W / 2 + k * 0.018, new THREE.Vector3());
            pos.y = 0.003 + k * 0.0016;
            // digadai: kartu ditelungkupkan
            const quat = new THREE.Quaternion().setFromEuler(_e.set(0, ax.yaw, m.own[i].m ? Math.PI : 0));
            want.set(`d${i}`, { pos, quat, front: () => deedTexture(i), back: () => deedBackTexture(), from: () => spacePoint(i, 0, 0.5, new THREE.Vector3()).setY(BOARD_H + 0.01) });
          });
          x += CARD_W + (mine.length - 1) * 0.018 + 0.012;
        }
        // kartu bebas penjara di samping HP
        let k = 0;
        for (const deck of ['takdir', 'kebijakan']) {
          if (m.jhold?.[deck] !== p.id) continue;
          const pos = this.edgePos(ax, 0.27 + k * 0.022, new THREE.Vector3());
          pos.y = 0.003 + k * 0.0016;
          const quat = new THREE.Quaternion().setFromEuler(_e.set(0, ax.yaw + 0.1, 0));
          want.set(`f${deck}`, { pos, quat, front: () => freeCardTexture(deck), back: () => instructionTexture(deck), from: () => this.decks[deck].position.clone().setY(BOARD_H + 0.03) });
          k++;
        }
      });
    }
    for (const [key, c] of this.cards) {
      if (!want.has(key)) {
        c.mesh.removeFromParent();
        this.cards.delete(key);
      }
    }
    const k = 1 - Math.exp(-dt * 7);
    for (const [key, w] of want) {
      let c = this.cards.get(key);
      if (!c) {
        const mesh = makeCardMesh(w.front(), w.back());
        mesh.position.copy(w.from());
        mesh.quaternion.copy(w.quat);
        this.group.add(mesh);
        c = { mesh };
        this.cards.set(key, c);
      }
      // melayang melengkung ke tempatnya
      const dist = c.mesh.position.distanceTo(w.pos);
      c.mesh.position.lerp(w.pos, k);
      if (dist > 0.02) c.mesh.position.y = Math.max(c.mesh.position.y, w.pos.y + Math.min(0.12, dist * 0.35));
      c.mesh.quaternion.slerp(w.quat, k);
    }
  }

  // ---------- HP ----------
  updatePhones(dt, m, live) {
    const seen = new Set();
    if (live) {
      m.players.forEach((p, idx) => {
        if (m.out?.includes(p.id)) return;
        seen.add(p.id);
        let ph = this.phones.get(p.id);
        if (!ph) {
          ph = makePhone(p.color);
          ph.userData.body.userData.phoneOf = p.id;
          this.group.add(ph);
          this.phones.set(p.id, ph);
        }
        const ax = this.seatAxes(m, idx);
        const pos = this.edgePos(ax, 0.48, _v).setY(0.006);
        const buzz = (this.buzz[p.id] || 0) > this.time;
        if (buzz) {
          pos.x += Math.sin(this.time * 90) * 0.0025;
          pos.z += Math.cos(this.time * 80) * 0.0025;
        }
        ph.userData.screen.material.opacity = buzz ? 0.75 + Math.sin(this.time * 30) * 0.25 : 1;
        // HP yang sedang dipakai berpindah ke tangan pemiliknya (pose selfie)
        ph.visible = !m.phone?.[p.id];
        ph.position.copy(pos);
        ph.quaternion.setFromEuler(_e.set(0, ax.yaw, 0));
      });
    }
    for (const [pid, ph] of this.phones) {
      if (!seen.has(pid)) {
        ph.removeFromParent();
        this.phones.delete(pid);
      }
    }
  }

  /** Objek yang bisa diketuk: papan (info petak), HP kita, dadu (giliran melempar), tumpukan kartu (harus diambil). */
  pickables(viewerId, m) {
    const list = [this.board.userData.top];
    const ph = this.phones.get(viewerId);
    if (ph?.visible) list.push(ph.userData.body);
    if (this.diceHit.visible) list.push(this.diceHit);
    if (m?.stage === 'draw' && m.drawDeck && m.players[m.turn]?.id === viewerId) list.push(this.decks[m.drawDeck].userData.box);
    return list;
  }

  spaceFromPoint(world) {
    return spaceAt(this.group.worldToLocal(world.clone()));
  }

  dispose() {
    this.group.removeFromParent();
  }
}
