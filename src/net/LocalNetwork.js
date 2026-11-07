// Jaringan "offline": tanpa server. Memakai BroadcastChannel sehingga beberapa tab
// di browser yang sama saling melihat — berguna untuk main solo & menguji multiplayer lokal.
// API-nya meniru PlayerState Playroom (getState / setState / onQuit) agar kode game sama.

class LocalPlayerHandle {
  constructor(id, send) {
    this.id = id;
    this.state = {};
    this.quitCallbacks = [];
    this.lastSeen = performance.now();
    this.send = send; // hanya untuk pemain lokal
  }

  getState(key) {
    return this.state[key];
  }

  setState(key, value) {
    this.state[key] = value;
    this.send?.({ type: 's', id: this.id, k: key, v: value });
  }

  getProfile() {
    const p = this.state.profile || {};
    return { name: p.name || 'Pemain', color: { hexString: p.color || '#4dabf7' }, photo: '' };
  }

  onQuit(cb) {
    this.quitCallbacks.push(cb);
    return () => {
      this.quitCallbacks = this.quitCallbacks.filter((c) => c !== cb);
    };
  }
}

export function createLocalNetwork({ channel = 'lowpoly-world-local' } = {}) {
  const id = `L${Math.random().toString(36).slice(2, 10)}`;
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(channel) : null;
  const post = (msg) => {
    try { bc?.postMessage(msg); } catch { /* abaikan */ }
  };

  const me = new LocalPlayerHandle(id, post);
  const others = new Map();
  const joinCallbacks = [];
  const roomState = {};
  const eventListeners = new Map();
  const disconnectCallbacks = [];

  const ensure = (pid) => {
    let p = others.get(pid);
    if (!p) {
      p = new LocalPlayerHandle(pid, null);
      others.set(pid, p);
      joinCallbacks.forEach((cb) => cb(p, false));
    }
    p.lastSeen = performance.now();
    return p;
  };

  const remove = (pid) => {
    const p = others.get(pid);
    if (!p) return;
    others.delete(pid);
    p.quitCallbacks.forEach((cb) => cb(p));
  };

  if (bc) {
    bc.onmessage = (e) => {
      const msg = e.data;
      if (!msg || msg.id === id) return;
      switch (msg.type) {
        case 'hello':
          ensure(msg.id);
          post({ type: 'sync', id, state: me.state, room: roomState });
          break;
        case 'sync':
          Object.assign(ensure(msg.id).state, msg.state);
          // ambil riwayat chat dari tab lain bila lebih lengkap
          if ((msg.room?.chatlog?.length || 0) > (roomState.chatlog?.length || 0)) roomState.chatlog = msg.room.chatlog;
          break;
        case 'ev':
          ensure(msg.id);
          eventListeners.get(msg.name)?.forEach((cb) => cb(msg.payload, msg.id));
          break;
        case 's':
          ensure(msg.id).state[msg.k] = msg.v;
          break;
        case 'ping':
          ensure(msg.id);
          break;
        case 'bye':
          remove(msg.id);
          break;
        case 'kick':
          if (msg.to === id) {
            post({ type: 'bye', id });
            disconnectCallbacks.forEach((cb) => cb({ code: 4999, reason: 'PLAYER_KICKED' }));
          }
          break;
      }
    };
    setInterval(() => {
      post({ type: 'ping', id });
      const now = performance.now();
      for (const [pid, p] of others) if (now - p.lastSeen > 5000) remove(pid);
    }, 1000);
    window.addEventListener('pagehide', () => post({ type: 'bye', id }));
    setTimeout(() => post({ type: 'hello', id }), 0);
  }

  return {
    kind: 'local',
    isPublic: false,
    me,
    roomCode: 'OFFLINE',
    inviteUrl: () => null,
    onPlayerJoin(cb) {
      joinCallbacks.push(cb);
      cb(me, true);
      for (const p of others.values()) cb(p, false);
      return () => {};
    },
    onDisconnect(cb) {
      disconnectCallbacks.push(cb);
      return () => {};
    },
    kick(pid) {
      post({ type: 'kick', id, to: pid });
    },
    leave() {
      post({ type: 'bye', id });
    },
    isHost: () => true,
    getRoomState: (key) => roomState[key],
    setRoomState: (key, value) => {
      roomState[key] = value;
    },
    sendEvent(name, payload) {
      post({ type: 'ev', id, name, payload });
    },
    onEvent(name, cb) {
      if (!eventListeners.has(name)) eventListeners.set(name, new Set());
      eventListeners.get(name).add(cb);
      return () => eventListeners.get(name).delete(cb);
    },
  };
}
