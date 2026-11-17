import { CONFIG } from '../config.js';

// Multiplayer peer-to-peer tanpa server sendiri dan tanpa kuota, memakai Trystero:
// - Perkenalan awal antar pemain (signaling) lewat relay Nostr publik yang gratis (terenkripsi).
// - Setelah tersambung, semua data game mengalir langsung antar browser (WebRTC).
// API-nya sama dengan LocalNetwork (me.getState/setState, onPlayerJoin, sendEvent, room state, kick),
// jadi kode game tidak perlu tahu jaringan apa yang dipakai.

const P = CONFIG.p2p;

/**
 * mode:
 *  - 'public'  : dunia publik (room "publik-1"; bila penuh pindah ke "publik-2", dst.)
 *  - 'private' : room baru dengan kode acak, bagikan link undangan
 *  - 'invite'  : gabung room dari link (#r=KODE)
 */
export async function connectP2P({ mode }) {
  const T = await import('trystero');
  if (mode !== 'invite') clearRoomHash();
  if (mode === 'public') {
    for (let shard = 1; shard <= P.publicShards; shard++) {
      const net = await join(T, `publik-${shard}`, { isPublic: true, roomCode: shard === 1 ? 'PUBLIK' : `PUBLIK-${shard}` });
      if (!net.full) return net;
      net.leave();
    }
    throw new Error('ROOM_LIMIT_EXCEEDED');
  }
  const code = mode === 'invite' ? getInviteRoomFromUrl() : randomCode();
  if (!code) throw new Error('NO_ROOM_CODE');
  const net = await join(T, `room-${code.toUpperCase()}`, { isPublic: false, roomCode: code.toUpperCase() });
  if (net.full) {
    net.leave();
    throw new Error('ROOM_LIMIT_EXCEEDED');
  }
  if (mode === 'private') history.replaceState(null, '', `${location.pathname}${location.search}#r=R${net.roomCode}`);
  return net;
}

async function join(T, roomId, info) {
  const relayUrls = testRelayUrls();
  const room = T.joinRoom(
    {
      appId: P.appId,
      identity: 'none', // tiap tab = pemain sendiri
      maxUsers: CONFIG.maxPlayersPerRoom,
      use: [T.scale()], // room ramai: otomatis jaringan bertingkat agar HP tidak kewalahan
      ...(relayUrls ? { relayConfig: { urls: relayUrls, redundancy: relayUrls.length } } : {}),
    },
    roomId
  );
  const net = createMeshNetwork(room, info);
  await withTimeout(room.ready, 15000, 'IDENTITY_FAILED');
  const self = await room.getSelf();
  net.me.id = self.peerId;
  net.me.setState('_t', Date.now()); // urutan masuk (untuk memilih host)

  // Tunggu minimal satu relay tersambung
  const relayDeadline = Date.now() + P.relayTimeoutMs;
  while (openRelays(T) === 0) {
    if (Date.now() > relayDeadline) {
      net.leave();
      throw new Error('RELAY_FAILED');
    }
    await sleep(200);
  }
  // Cek sebentar apakah room penuh (pemain yang ada menolak kita); selesai cepat bila ada yang menerima
  const probeEnd = Date.now() + P.probeMs;
  while (Date.now() < probeEnd && !net.full && net.peerCount() === 0) await sleep(150);
  if (net.full && net.peerCount() > 0) net.full = false; // ada yang menerima: berarti masih muat
  net.relays = () => openRelays(T);
  return net;
}

function createMeshNetwork(room, { isPublic, roomCode }) {
  const others = new Map();
  const joinCallbacks = [];
  const disconnectCallbacks = [];
  const eventListeners = new Map();
  const roomState = {};
  let left = false;

  const actState = room.makeAction('st');
  const actEvent = room.makeAction('ev');
  const actRoom = room.makeAction('rs');
  const actKick = room.makeAction('kk');
  const send = (action, data, target) => {
    if (left) return;
    action.send(data, target ? { target } : undefined).catch(() => {});
  };

  const me = {
    id: '',
    state: {},
    getState: (k) => me.state[k],
    setState(k, v) {
      me.state[k] = v;
      if (others.size) send(actState, { k, v: v ?? null });
    },
    getProfile() {
      const p = me.state.profile || {};
      return { name: p.name || 'Pemain', color: { hexString: p.color || '#4dabf7' }, photo: '' };
    },
    onQuit: () => () => {},
  };

  const makeHandle = (id) => {
    const h = {
      id,
      state: {},
      quit: [],
      getState: (k) => h.state[k],
      setState: () => {}, // hanya pemiliknya yang boleh mengubah
      getProfile() {
        const p = h.state.profile || {};
        return { name: p.name || 'Pemain', color: { hexString: p.color || '#4dabf7' }, photo: '' };
      },
      onQuit(cb) {
        h.quit.push(cb);
        return () => (h.quit = h.quit.filter((c) => c !== cb));
      },
      kick: async () => net.kick(id),
    };
    return h;
  };

  const ensure = (id) => {
    if (!id || id === me.id || left) return null;
    let h = others.get(id);
    if (!h) {
      h = makeHandle(id);
      others.set(id, h);
      joinCallbacks.forEach((cb) => cb(h, false));
    }
    return h;
  };

  const remove = (id) => {
    const h = others.get(id);
    if (!h) return;
    others.delete(id);
    h.quit.forEach((cb) => cb(h));
  };

  /** Host = pemain yang paling dulu masuk (dipilih sama oleh semua pemain, tanpa server). */
  const hostId = () => {
    let best = me.id, bestT = me.state._t ?? Infinity;
    for (const h of others.values()) {
      const t = h.state._t;
      if (t === undefined) continue;
      if (t < bestT || (t === bestT && h.id < best)) {
        best = h.id;
        bestT = t;
      }
    }
    return best;
  };

  room.onPeerJoin(({ peerId }) => {
    if (!ensure(peerId)) return;
    // kirim seluruh state kita ke pemain baru (+ state room bila kita host)
    send(actState, { all: me.state }, peerId);
    if (hostId() === me.id && Object.keys(roomState).length) send(actRoom, { all: roomState }, peerId);
  });
  room.onPeerLeave(({ peerId }) => remove(peerId));
  room.onError((e) => {
    if (e.code === 'room-full') net.full = true;
    else console.warn('[p2p]', e.code, e.message);
  });

  actState.onMessage((d, { peerId }) => {
    const h = ensure(peerId);
    if (!h || !d || typeof d !== 'object') return;
    if (d.all && typeof d.all === 'object') Object.assign(h.state, d.all);
    else if (typeof d.k === 'string') h.state[d.k] = d.v;
  });
  actEvent.onMessage((d, { peerId }) => {
    if (!ensure(peerId) || !d || typeof d.n !== 'string') return;
    eventListeners.get(d.n)?.forEach((cb) => cb(d.p, peerId));
  });
  actRoom.onMessage((d, { peerId }) => {
    if (!ensure(peerId) || !d || typeof d !== 'object') return;
    if (d.all && typeof d.all === 'object') {
      // ambil riwayat yang lebih lengkap
      for (const [k, v] of Object.entries(d.all)) {
        if (Array.isArray(v) && Array.isArray(roomState[k]) && roomState[k].length > v.length) continue;
        roomState[k] = v;
      }
    } else if (typeof d.k === 'string') roomState[d.k] = d.v;
  });
  actKick.onMessage((d, { peerId }) => {
    if (peerId !== hostId()) return; // hanya host yang boleh mengeluarkan
    disconnectCallbacks.forEach((cb) => cb({ code: 4999, reason: 'PLAYER_KICKED' }));
    net.leave();
  });

  const net = {
    kind: 'p2p',
    isPublic,
    roomCode,
    full: false,
    me,
    relays: () => 0,
    peerCount: () => others.size,
    inviteUrl: () => `${location.origin}${location.pathname}#r=R${roomCode}`,
    onPlayerJoin(cb) {
      joinCallbacks.push(cb);
      cb(me, true);
      for (const h of others.values()) cb(h, false);
      return () => {};
    },
    onDisconnect(cb) {
      disconnectCallbacks.push(cb);
      return () => {};
    },
    isHost: () => hostId() === me.id,
    getRoomState: (k) => roomState[k],
    setRoomState(k, v) {
      roomState[k] = v;
      if (hostId() === me.id) send(actRoom, { k, v: v ?? null });
    },
    sendEvent(name, payload) {
      send(actEvent, { n: name, p: payload ?? null });
    },
    onEvent(name, cb) {
      if (!eventListeners.has(name)) eventListeners.set(name, new Set());
      eventListeners.get(name).add(cb);
      return () => eventListeners.get(name).delete(cb);
    },
    kick(pid) {
      if (hostId() === me.id) send(actKick, {}, pid);
    },
    leave() {
      if (left) return;
      left = true;
      room.leave().catch(() => {});
    },
  };
  window.addEventListener('pagehide', () => net.leave());
  return net;
}

function openRelays(T) {
  try {
    return Object.values(T.getRelaySockets()).filter((s) => s.readyState === 1).length;
  } catch {
    return 0;
  }
}

// Untuk pengujian lokal: ?relay=ws://127.0.0.1:7777 (bisa beberapa, dipisah koma)
function testRelayUrls() {
  const v = new URLSearchParams(location.search).get('relay');
  if (!v) return null;
  const urls = v.split(',').filter((u) => /^wss?:\/\//.test(u));
  return urls.length ? urls : null;
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const r = crypto.getRandomValues(new Uint8Array(6));
  for (const b of r) s += chars[b % chars.length];
  return s;
}

export function getInviteRoomFromUrl() {
  const m = location.hash.match(/[#&]r=R?([A-Za-z0-9-]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function clearRoomHash() {
  if (location.hash.includes('r=')) history.replaceState(null, '', location.pathname + location.search);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}
