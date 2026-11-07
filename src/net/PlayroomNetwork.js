import { CONFIG } from '../config.js';

/**
 * Terhubung ke Playroom Kit.
 * mode:
 *  - 'public'  : semua masuk room yang sama (CONFIG.publicRoomCode)
 *  - 'private' : buat room baru (kode acak), bagikan link undangan
 *  - 'invite'  : gabung room dari link (#r=XXXX di URL)
 */
export async function connectPlayroom({ mode }) {
  // Dimuat dinamis: mode offline tidak perlu mengunduh Playroom (+React).
  const pr = await import('playroomkit');

  if (mode !== 'invite') clearRoomHash();

  const options = {
    skipLobby: true,
    maxPlayersPerRoom: CONFIG.maxPlayersPerRoom,
    reconnectGracePeriod: 5000,
    defaultPlayerStates: {},
  };
  if (mode === 'public') options.roomCode = CONFIG.publicRoomCode;

  // Playroom me-reload halaman bila koneksi gagal/terputus. Simpan penanda di sessionStorage
  // supaya setelah reload kita tahu apa yang terjadi (lihat readReloadReason()).
  sessionSet(KEY_CONNECTING, { mode, at: Date.now() });
  try {
    await withTimeout(
      pr.insertCoin(options),
      CONFIG.connectTimeoutMs,
      'Server Playroom tidak merespons (timeout).'
    );
  } catch (err) {
    sessionStorage.removeItem(KEY_CONNECTING);
    // hentikan percobaan koneksi agar Playroom tidak me-reload halaman nanti
    try { pr.Multiplayer?.().leaveRoom(); } catch { /* belum ada koneksi */ }
    throw err;
  }
  sessionStorage.removeItem(KEY_CONNECTING);
  sessionSet(KEY_SESSION, { mode, at: Date.now() });

  const me = pr.myPlayer();
  const roomCode = pr.getRoomCode() || options.roomCode || '';

  return {
    kind: 'playroom',
    isPublic: mode === 'public' || roomCode === CONFIG.publicRoomCode,
    me,
    roomCode,
    inviteUrl() {
      const code = pr.getRoomCode() || roomCode;
      return `${location.origin}${location.pathname}#r=R${code}`;
    },
    onPlayerJoin(cb) {
      return pr.onPlayerJoin((player) => cb(player, player.id === me.id));
    },
    onDisconnect(cb) {
      return pr.onDisconnect(cb);
    },
    // State bersama room (hanya host yang boleh menulis di Playroom).
    isHost: () => pr.isHost(),
    getRoomState: (key) => pr.getState(key),
    setRoomState: (key, value) => pr.setState(key, value, true),
    // Event sekali kirim (RPC) ke pemain lain, mis. pesan chat.
    sendEvent(name, payload) {
      pr.RPC.call(name, payload, pr.RPC.Mode.OTHERS).catch?.(() => {});
    },
    onEvent(name, cb) {
      return pr.RPC.register(name, async (payload, sender) => {
        cb(payload, sender?.id);
      });
    },
  };
}

const KEY_CONNECTING = 'lpw-connecting';
const KEY_SESSION = 'lpw-session';
const KEY_REJOIN = 'lpw-rejoin';

function sessionSet(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* abaikan */ }
}
function sessionTake(key) {
  try {
    const v = JSON.parse(sessionStorage.getItem(key));
    sessionStorage.removeItem(key);
    return v;
  } catch {
    return null;
  }
}

/**
 * Dipanggil saat halaman dimuat. Mengembalikan:
 *  - 'connect-failed' : reload terjadi saat sedang mencoba terhubung
 *  - 'rejoin'         : reload karena koneksi terputus di tengah permainan (boleh sambung ulang otomatis)
 *  - null             : pemuatan normal
 */
export function readReloadReason() {
  const now = Date.now();
  const connecting = sessionTake(KEY_CONNECTING);
  const session = sessionTake(KEY_SESSION);
  if (connecting && now - connecting.at < 60000) return 'connect-failed';
  if (session && getInviteRoomFromUrl()) {
    const last = Number(sessionStorage.getItem(KEY_REJOIN) || 0);
    if (now - last < 30000) return 'connect-failed'; // cegah loop reload
    sessionStorage.setItem(KEY_REJOIN, String(now));
    return 'rejoin';
  }
  return null;
}

export function getInviteRoomFromUrl() {
  const m = location.hash.match(/[#&]r=R?([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function clearRoomHash() {
  if (location.hash.includes('r=')) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}
