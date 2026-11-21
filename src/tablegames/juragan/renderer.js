import * as THREE from 'three';
import { boardGroup } from '../boardKit.js';
import { SPACES, TOKENS, OWNABLE, JAIL, groupOf } from './rules.js';
import { HOP_MS } from './host.js';
import {
  BOARD_H, DECK_SPOTS, spaceRect, spacePoint, spaceAt, unitToLocal, makeBoard, makeToken, makeDie, DICE_UP, makeHouse,
  makeCardMesh, deedTexture, freeCardTexture, deckTexture, makeDeck, makePhone, CARD_W,
} from './art.js';

const HOP = HOP_MS / 1000;
const EDGE_D = 0.79; // jarak deret HP & kartu hak milik dari tengah meja
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const GROUP_ORDER = ['cokelat', 'biruMuda', 'pink', 'oranye', 'merah', 'kuning', 'hijau', 'biruTua', 'rail', 'util'];

/** Tampilan meja Juragan untuk semua pemain & penonton. Semua objek di grup papan (koordinat lokal meja). */
export class JuraganRenderer {
  constructor(ctx, table) {
    this.ctx = ctx;
    this.table = table;
    this.group = boardGroup(ctx, table, table.seats[0]);
    this.board = makeBoard();
    this.group.add(this.board);
    this.tokens = new Map(); // pid → { mesh, idx, path, hop }
    this.houses = new Map(); // `${i}:${k}` → mesh
    this.chips = new Map();
    this.cards = new Map(); // kunci → { mesh, fly }
    this.phones = new Map(); // pid → mesh
    this.dice = [makeDie(), makeDie()];
    this.dice.forEach((d, k) => {
      d.position.set(k ? 0.03 : -0.03, BOARD_H + 0.016, 0);
      this.group.add(d);
    });
    this.diceAnim = null;
    this.decks = {};
    for (const [deck, spot] of Object.entries(DECK_SPOTS)) {
      const d = makeDeck(deck);
      unitToLocal(spot.x, spot.y, d.position);
      d.rotation.y = -spot.rot;
      this.group.add(d);
      this.decks[deck] = d;
    }
    this.flip = null; // kartu instruksi yang sedang dibalik di atas tumpukan
    this.mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.45, depthWrite: false }));
    this.mark.visible = false;
    this.group.add(this.mark);
    this.lastRoll = -1;
    this.lastMv = -1;
    this.lastEv = -1;
    this.lastCard = -1;
    this.time = 0;
    this.buzz = {};
    // diisi kontrol pemain lokal: petak disorot, HP sedang dibuka
    this.view = { sel: -1, phoneOpen: false };
    this.lift = 0; // 0 = HP di meja, 1 = di depan wajah
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

  edgePos(axes, along, out) {
    return out.set(axes.u.x * EDGE_D + axes.r.x * along, 0.002, axes.u.z * EDGE_D + axes.r.z * along);
  }

  /** Posisi bidak di petak (beberapa bidak di petak sama digeser; penjara: di sel atau jalur luar). */
  tokenSpot(i, k, n, jailed, out) {
    if (i === JAIL) {
      // sel penjara di bagian dalam sudut; "cuma mampir" di jalur luar
      if (jailed) return spacePoint(i, -0.24 + (k % 2) * 0.22, 0.28 + Math.floor(k / 2) * 0.26, out);
      return spacePoint(i, 0.43, 0.14 + k * 0.2, out);
    }
    const r = spaceRect(i);
    const spread = r.corner ? 0.18 : 0.22;
    if (n <= 1) return spacePoint(i, 0, r.corner ? 0.5 : 0.62, out);
    return spacePoint(i, (k % 2 ? 1 : -1) * spread, (r.corner ? 0.38 : 0.5) + Math.floor(k / 2) * (r.corner ? 0.24 : 0.28), out);
  }

  update(dt, m, viewerId) {
    this.time += dt;
    const live = m.phase !== 'lobby';
    const fresh = m.ev && m.ev.n !== this.lastEv && this.lastEv !== -1 ? m.ev : null;
    if (m.ev) this.lastEv = m.ev.n;
    if (fresh) this.onEvent(fresh, m);
    this.updateTokens(dt, m, live);
    this.updateDice(dt, m, live);
    this.updateBuildings(m, live);
    this.updateCards(dt, m, live);
    this.updatePhones(dt, m, viewerId, live);
    this.updateFlip(dt, m);
    // sorot petak (ketuk petak / petak tempat berhenti)
    const sel = this.view.sel;
    this.mark.visible = sel >= 0;
    if (this.mark.visible) {
      const r = spaceRect(sel);
      unitToLocal(r.x + r.w / 2, r.y + r.h / 2, this.mark.position).y += 0.0015;
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
      // kelompokkan bidak per petak tujuan akhir untuk pergeseran
      const byIdx = new Map();
      for (const p of m.players) {
        if (m.out?.includes(p.id) || m.pos?.[p.id] === undefined) continue;
        const jailed = m.jail?.[p.id] !== undefined;
        const key = `${m.pos[p.id]}${jailed ? 'j' : ''}`;
        if (!byIdx.has(key)) byIdx.set(key, []);
        byIdx.get(key).push(p.id);
      }
      m.players.forEach((p) => {
        if (m.out?.includes(p.id) || m.pos?.[p.id] === undefined) return;
        seen.add(p.id);
        let t = this.tokens.get(p.id);
        const tokId = TOKENS[m.tok?.[p.id] ?? 0]?.id;
        if (!t || t.tokId !== tokId) {
          if (t) t.mesh.removeFromParent();
          t = { mesh: makeToken(tokId, p.color), tokId, idx: m.pos[p.id], path: [], hop: null };
          this.group.add(t.mesh);
          this.tokens.set(p.id, t);
          this.tokenSpot(t.idx, 0, 1, m.jail?.[p.id] !== undefined, t.mesh.position);
        }
        const jailed = m.jail?.[p.id] !== undefined;
        const group = byIdx.get(`${m.pos[p.id]}${jailed ? 'j' : ''}`) || [p.id];
        // mulai lompatan berikutnya
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
          const k = ease(h.t);
          t.mesh.position.lerpVectors(h.from, dest, k);
          t.mesh.position.y += Math.sin(h.t * Math.PI) * (h.jump ? 0.16 : 0.035);
          if (h.jump) t.mesh.rotation.y += dt * 9;
          if (h.t >= 1) {
            t.idx = h.to;
            t.hop = null;
          }
        } else {
          if (!t.path.length && t.idx !== m.pos[p.id]) t.idx = m.pos[p.id]; // bergabung di tengah permainan
          const dest = this.tokenSpot(t.idx, group.indexOf(p.id), group.length, jailed, _w);
          t.mesh.position.lerp(dest, 1 - Math.exp(-dt * 10));
        }
        // bidak menghadap arah jalan (ke petak berikutnya)
        const a = spacePoint((t.idx + 1) % 40, 0, 0.6, _v).sub(spacePoint(t.idx, 0, 0.6, _w));
        const want = Math.atan2(a.x, a.z);
        const d = Math.atan2(Math.sin(want - t.mesh.rotation.y), Math.cos(want - t.mesh.rotation.y));
        t.mesh.rotation.y += d * Math.min(1, dt * 6);
      });
    }
    for (const [pid, t] of this.tokens) {
      if (!seen.has(pid)) {
        t.mesh.removeFromParent();
        this.tokens.delete(pid);
      }
    }
  }

  // ---------- Dadu ----------
  updateDice(dt, m, live) {
    this.dice.forEach((d) => (d.visible = live));
    if (!live) return;
    if (m.rollN !== this.lastRoll) {
      if (this.lastRoll !== -1 && m.rollN > 0) {
        // dilempar dari sisi pemain yang mendapat giliran, berguling ke tengah papan
        const i = m.turn;
        const ax = this.seatAxes(m, i);
        this.diceAnim = {
          t: 0,
          d: m.dice,
          from: [0, 1].map((k) => new THREE.Vector3(ax.u.x * 0.42 + ax.r.x * (k ? 0.04 : -0.04), BOARD_H + 0.14, ax.u.z * 0.42 + ax.r.z * (k ? 0.04 : -0.04))),
          to: [0, 1].map((k) => new THREE.Vector3((k ? 0.035 : -0.035) + (Math.random() - 0.5) * 0.04, BOARD_H + 0.016, (Math.random() - 0.5) * 0.06)),
          spin: [0, 1].map(() => new THREE.Vector3(6 + Math.random() * 6, 4 + Math.random() * 5, 5 + Math.random() * 6)),
          yaw: [0, 1].map(() => Math.random() * Math.PI * 2),
        };
        this.sound('dice');
        this.ctx.characterOf(m.players[i]?.id)?.reachTo?.(this.group.localToWorld(this.diceAnim.from[0].clone()), 0.5);
      } else this.setDiceRest(m.dice);
      this.lastRoll = m.rollN;
    }
    const a = this.diceAnim;
    if (!a) return;
    a.t = Math.min(1, a.t + dt / 1.0);
    this.dice.forEach((d, k) => {
      const e = 1 - (1 - a.t) ** 2;
      d.position.lerpVectors(a.from[k], a.to[k], e);
      d.position.y = a.to[k].y + Math.abs(Math.sin(a.t * Math.PI * 2.5)) * 0.08 * (1 - a.t);
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
      this.setDiceRest(a.d, a);
    }
  }

  setDiceRest(vals, a) {
    this.dice.forEach((d, k) => {
      const [rx, rz] = DICE_UP[vals?.[k] || 1];
      d.quaternion.setFromEuler(_e.set(rx, a ? a.yaw[k] : k * 0.6, rz, 'YXZ'));
      if (a) d.position.copy(a.to[k]);
    });
  }

  // ---------- Rumah, hotel, penanda pemilik ----------
  updateBuildings(m, live) {
    const wantH = new Set(), wantC = new Set();
    if (live) {
      for (const i of OWNABLE) {
        const o = m.own?.[i];
        if (!o) continue;
        const r = spaceRect(i);
        // penanda pemilik di tepi luar petak (abu-abu bila digadai)
        const ck = `${i}`;
        wantC.add(ck);
        let chip = this.chips.get(ck);
        if (!chip) {
          chip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.003, 0.012), new THREE.MeshLambertMaterial());
          this.group.add(chip);
          this.chips.set(ck, chip);
        }
        const p = m.players.find((x) => x.id === o.by);
        chip.material.color.set(o.m ? '#868e96' : p?.color || '#fff');
        spacePoint(i, 0, 0.955, chip.position).y += 0.0015;
        chip.rotation.y = -r.rot;
        chip.scale.x = o.m ? 0.6 : 1;
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
            mesh.scale.setScalar(0.01); // muncul membesar
          }
          spacePoint(i, hotel ? 0 : -0.33 + k * 0.22, 0.12, mesh.position);
          mesh.rotation.y = -r.rot;
          mesh.scale.setScalar(Math.min(1, mesh.scale.x + 0.06));
        }
      }
    }
    for (const [map, want] of [[this.houses, wantH], [this.chips, wantC]]) {
      for (const [key, mesh] of map) {
        if (want.has(key)) continue;
        mesh.removeFromParent();
        map.delete(key);
      }
    }
  }

  // ---------- Kartu hak milik & bebas penjara di depan pemiliknya ----------
  updateCards(dt, m, live) {
    const want = new Map();
    if (live) {
      m.players.forEach((p, idx) => {
        if (m.out?.includes(p.id)) return;
        const ax = this.seatAxes(m, idx);
        let col = 0;
        for (const g of GROUP_ORDER) {
          const mine = OWNABLE.filter((i) => groupOf(i) === g && m.own?.[i]?.by === p.id);
          if (!mine.length) continue;
          mine.forEach((i, k) => {
            const pos = this.edgePos(ax, -0.56 + col * (CARD_W + 0.014) + k * 0.011, new THREE.Vector3());
            pos.addScaledVector(ax.u, -k * 0.016);
            pos.y = 0.002 + k * 0.0012;
            // digadai: kartu dibalik
            const quat = new THREE.Quaternion().setFromEuler(_e.set(0, ax.yaw, m.own[i].m ? Math.PI : 0));
            want.set(`d${i}`, { pos, quat, tex: deedTexture(i), from: () => spacePoint(i, 0, 0.5, new THREE.Vector3()).setY(BOARD_H + 0.01) });
          });
          col++;
        }
        for (let k = 0; k < (m.jfree?.[p.id] || 0); k++) {
          const pos = this.edgePos(ax, 0.29 + k * 0.012, new THREE.Vector3());
          pos.y = 0.002 + k * 0.0012;
          const quat = new THREE.Quaternion().setFromEuler(_e.set(0, ax.yaw + 0.12, 0));
          want.set(`f${p.id}:${k}`, { pos, quat, tex: freeCardTexture(), from: () => this.decks.kas.position.clone().setY(BOARD_H + 0.02) });
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
        const mesh = makeCardMesh(w.tex);
        mesh.material.side = THREE.DoubleSide;
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
  /** Pose HP di depan wajah (lokal papan), dipakai saat pemain lokal membuka HP. */
  facePose(pos, quat) {
    const cam = this.ctx.camera;
    cam.getWorldDirection(_v);
    const right = _w.crossVectors(_v, cam.up).normalize();
    const world = cam.position.clone().addScaledVector(_v, 0.3).addScaledVector(right, 0.07);
    pos.copy(this.group.worldToLocal(world));
    // layar (+y lokal HP) menghadap kamera, sisi atas HP ke atas layar
    const camQ = cam.getWorldQuaternion(new THREE.Quaternion());
    const groupQ = this.group.getWorldQuaternion(new THREE.Quaternion()).invert();
    quat.copy(groupQ.multiply(camQ)).multiply(_q.setFromEuler(_e.set(Math.PI / 2, 0, 0)));
  }

  updatePhones(dt, m, viewerId, live) {
    const seen = new Set();
    this.lift = Math.max(0, Math.min(1, this.lift + (this.view.phoneOpen ? dt : -dt) / 0.35));
    if (live) {
      m.players.forEach((p, idx) => {
        if (m.out?.includes(p.id)) return;
        seen.add(p.id);
        let ph = this.phones.get(p.id);
        if (!ph) {
          ph = makePhone(p.color);
          ph.userData.owner = p.id;
          ph.userData.body.userData.phoneOf = p.id;
          this.group.add(ph);
          this.phones.set(p.id, ph);
        }
        const ax = this.seatAxes(m, idx);
        const pos = this.edgePos(ax, 0.42, _v).setY(0.006);
        const quat = _q.setFromEuler(_e.set(0, ax.yaw, 0));
        // HP bergetar saat ada tawaran / lelang
        const buzz = (this.buzz[p.id] || 0) > this.time;
        if (buzz) {
          pos.x += Math.sin(this.time * 90) * 0.0025;
          pos.z += Math.cos(this.time * 80) * 0.0025;
        }
        ph.userData.screen.material.opacity = buzz ? 0.75 + Math.sin(this.time * 30) * 0.25 : 1;
        if (p.id === viewerId && this.lift > 0) {
          // HP kita melayang ke depan wajah; setelah sampai, layar HP (HTML) yang tampil
          const fp = new THREE.Vector3(), fq = new THREE.Quaternion();
          this.facePose(fp, fq);
          const k = ease(this.lift);
          ph.position.lerpVectors(pos, fp, k);
          ph.quaternion.slerpQuaternions(quat, fq, k);
          ph.visible = this.lift < 0.98;
        } else {
          // pemain lain yang membuka HP: HP-nya terangkat ke tangan (lihat pose karakter)
          ph.visible = !(m.phone?.[p.id] && p.id !== viewerId);
          ph.position.copy(pos);
          ph.quaternion.copy(quat);
        }
      });
    }
    for (const [pid, ph] of this.phones) {
      if (!seen.has(pid)) {
        ph.removeFromParent();
        this.phones.delete(pid);
      }
    }
  }

  // ---------- Kartu instruksi dibalik di atas tumpukan ----------
  updateFlip(dt, m) {
    if (m.card && m.card.n !== this.lastCard) {
      this.lastCard = m.card.n;
      const deck = this.decks[m.card.deck];
      if (!this.flip) {
        const mesh = makeCardMesh(deckTexture(m.card.deck));
        mesh.material.side = THREE.DoubleSide;
        mesh.scale.set(1.45, 1, 1.45);
        this.group.add(mesh);
        this.flip = { mesh };
      }
      Object.assign(this.flip, { t: 0, from: deck.position.clone().setY(BOARD_H + 0.02), yaw: deck.rotation.y });
      this.flip.mesh.material.map = deckTexture(m.card.deck);
      this.flip.mesh.visible = true;
      this.sound('card');
    }
    const f = this.flip;
    if (!f || !f.mesh.visible) return;
    f.t += dt;
    const up = ease(f.t / 0.5);
    f.mesh.position.copy(f.from).setY(f.from.y + up * 0.1);
    f.mesh.rotation.set(0, f.yaw + Math.PI / 2, Math.min(1, f.t / 0.6) * Math.PI);
    if (f.t > 2.8) f.mesh.visible = false;
  }

  /** Objek yang bisa diketuk: papan (lihat info petak) & HP kita. */
  pickables(viewerId) {
    const list = [this.board.userData.top];
    const ph = this.phones.get(viewerId);
    if (ph?.visible) list.push(ph.userData.body);
    return list;
  }

  spaceFromPoint(world) {
    return spaceAt(this.group.worldToLocal(world.clone()));
  }

  dispose() {
    this.group.removeFromParent();
  }
}

