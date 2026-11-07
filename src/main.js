import './style.css';
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { World } from './world/World.js';
import { CapsuleCharacter } from './character/CapsuleCharacter.js';
import { InputManager } from './controls/InputManager.js';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera.js';
import { LocalPlayer } from './player/LocalPlayer.js';
import { RemotePlayer } from './player/RemotePlayer.js';
import { connectPlayroom, getInviteRoomFromUrl, readReloadReason } from './net/PlayroomNetwork.js';
import { createLocalNetwork } from './net/LocalNetwork.js';
import { UI } from './ui/UI.js';
import { MapView } from './ui/MapView.js';
import { registerPWA } from './pwa.js';

// ---------- Kualitas grafis ----------
const params = new URLSearchParams(location.search);
const isTouchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
const quality = params.get('q') || (isTouchDevice ? 'low' : 'high');

// ---------- Renderer / scene / kamera ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

const world = new World(scene, { quality });
const camRig = new ThirdPersonCamera(camera, world);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- UI & input ----------
let state = 'menu';
let net = null;
let local = null;
const remotes = new Map();

const ui = new UI({
  onStart: (mode, profile) => startGame(mode, profile),
  onColorChange: (c) => preview.setProfile(null, c),
  onChat: (text) => sendChat(text),
  onChatOpenChange: (open) => input.setEnabled(!open),
  onToggleMap: (force) => mapView.toggle(force),
});

const mapView = new MapView({
  world,
  minimapCanvas: document.getElementById('minimap'),
  fullCanvas: document.getElementById('map-full'),
  overlay: document.getElementById('map-overlay'),
  listEl: document.getElementById('player-list'),
  countEl: document.getElementById('map-count'),
});
ui.setInvite(getInviteRoomFromUrl());

const input = new InputManager({
  surface: document.getElementById('surface'),
  jumpButton: document.getElementById('btn-jump'),
  onModeChange: (mode) => {
    document.body.dataset.input = mode;
  },
  onPointerLockChange: (locked) => ui.setPointerLocked(locked),
});

// Karakter pratinjau di menu (warna mengikuti pilihan)
const preview = new CapsuleCharacter({ color: ui.color, showName: false });
preview.root.position.set(3.4, world.getHeight(3.4, 0), 0);
preview.root.rotation.y = Math.PI * 0.25;
scene.add(preview.root);

// ---------- Mulai game ----------
async function startGame(mode, profile) {
  ui.setBusy(true, mode === 'offline' ? 'Menyiapkan dunia…' : 'Menghubungkan ke server Playroom…');
  try {
    net = mode === 'offline' ? createLocalNetwork() : await connectPlayroom({ mode });
  } catch (err) {
    console.error(err);
    ui.setBusy(false);
    ui.setStartError(connectErrorMessage(err));
    return;
  }
  ui.setBusy(false);

  net.me.setState('profile', { name: profile.name, color: profile.color }, true);
  myProfile = profile;

  scene.remove(preview.root);
  local = new LocalPlayer({ world, scene, net, name: profile.name, color: profile.color });
  camRig.yaw = local.facing + Math.PI;
  camRig.pitch = 0.3;
  camRig.initialized = false;

  const joinedAt = performance.now();
  net.onPlayerJoin((handle, isMe) => {
    if (isMe || remotes.has(handle.id)) return;
    const rp = new RemotePlayer({ handle, scene });
    remotes.set(handle.id, rp);
    ui.setPlayerCount(remotes.size + 1);
    if (performance.now() - joinedAt > 2500) {
      setTimeout(() => remotes.has(handle.id) && ui.toastPlayer(rp.name, 'bergabung 👋'), 1200);
    }
    handle.onQuit(() => {
      const p = remotes.get(handle.id);
      if (!p) return;
      ui.toastPlayer(p.name, 'keluar');
      p.dispose();
      remotes.delete(handle.id);
      ui.setPlayerCount(remotes.size + 1);
    });
  });
  net.onDisconnect?.(() => {
    ui.setConnected(false);
    ui.toast('Koneksi ke server terputus. Muat ulang halaman untuk menyambung lagi.', 8000);
  });

  // Chat dikirim sebagai event (RPC); riwayat 50 pesan terakhir disimpan host di state room.
  net.onEvent('chat', (msg, senderId) => receiveChat(msg, senderId));

  ui.setNetwork(net);
  ui.setPlayerCount(remotes.size + 1);
  ui.setState('playing');
  state = 'playing';

  const where = net.kind === 'local' ? 'mode offline' : net.isPublic ? 'Dunia Publik' : `room ${net.roomCode}`;
  ui.toast(
    isTouchDevice
      ? `Kamu masuk ke ${where}. Ketuk 💬 untuk chat, ketuk peta kecil untuk peta pulau.`
      : `Kamu masuk ke ${where}. Tekan Enter untuk chat, M untuk peta.`
  );
  loadChatHistory();
  setTimeout(loadChatHistory, 2000); // state room kadang baru tiba sesaat setelah terhubung

  if (net.kind === 'playroom' && !net.isPublic) {
    ui.toast('Room privat dibuat. Tekan tombol 🔗 untuk mengundang teman.', 5000);
  }
  if (isTouchDevice && quality === 'low' && !document.fullscreenElement) {
    ui.toggleFullscreen();
  }
}

function connectErrorMessage(err) {
  const reason = err?.message || String(err);
  switch (reason) {
    case 'ROOM_LIMIT_EXCEEDED':
      return `Room sudah penuh (maks. ${CONFIG.maxPlayersPerRoom} pemain). Coba "Buat Room Privat" lalu undang teman.`;
    case 'QUOTA_EXCEEDED':
      return 'Kuota gratis server Playroom sedang habis. Coba lagi nanti, atau pilih "Main Offline".';
    case 'PLAYER_KICKED':
      return 'Kamu dikeluarkan dari room.';
    default:
      return `Gagal terhubung ke server multiplayer: ${reason}. Coba lagi, atau pilih "Main Offline".`;
  }
}

// ---------- Chat & riwayat ----------
let myProfile = null;
let chatCounter = 0;
const CHAT_HISTORY_MAX = 50;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

function sanitizeChat(msg) {
  if (!msg || typeof msg.t !== 'string' || typeof msg.id !== 'string') return null;
  const t = msg.t.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!t) return null;
  return {
    id: msg.id.slice(0, 40),
    t,
    at: Number.isFinite(msg.at) ? msg.at : Date.now(),
    n: String(msg.n || 'Pemain').slice(0, 16),
    c: COLOR_RE.test(msg.c) ? msg.c : '#4dabf7',
  };
}

function showChatLine(m, history = false) {
  return ui.chatLog.add({ id: m.id, name: m.n, color: m.c, text: m.t, at: m.at, history });
}

// Host menyimpan pesan ke state room supaya pemain yang baru masuk bisa melihat riwayat.
function recordHistory(m) {
  if (!net?.isHost()) return;
  const log = (net.getRoomState('chatlog') || []).filter((x) => x.id !== m.id);
  log.push(m);
  while (log.length > CHAT_HISTORY_MAX) log.shift();
  net.setRoomState('chatlog', log);
}

function loadChatHistory() {
  const log = net?.getRoomState('chatlog');
  if (!Array.isArray(log)) return;
  let added = 0;
  for (const raw of log) {
    const m = sanitizeChat(raw);
    if (m && showChatLine(m, true)) added++;
  }
  if (added) ui.toast(`${added} pesan sebelumnya dimuat — buka chat untuk melihat riwayat.`);
}

function sendChat(text) {
  if (!local || !net || !myProfile) return;
  const m = sanitizeChat({
    id: `${net.me.id}-${Date.now()}-${chatCounter++}`,
    t: text,
    at: Date.now(),
    n: myProfile.name,
    c: myProfile.color,
  });
  if (!m) return;
  local.say(m.t);
  showChatLine(m);
  net.sendEvent('chat', m);
  recordHistory(m);
}

function receiveChat(raw, senderId) {
  const m = sanitizeChat(raw);
  if (!m) return;
  const rp = remotes.get(senderId);
  if (rp) {
    m.n = rp.name || m.n; // pakai nama dari profil pengirim
    rp.character.showChat(m.t);
  }
  showChatLine(m);
  recordHistory(m);
}

// ---------- Data untuk peta ----------
const mapState = { me: { x: 0, z: 0, facing: 0, name: '', color: '' }, yaw: 0, players: [] };
function updateMap(dt) {
  const me = mapState.me;
  me.x = local.position.x;
  me.z = local.position.z;
  me.facing = local.facing;
  me.name = myProfile.name;
  me.color = myProfile.color;
  mapState.yaw = camRig.yaw;
  const players = mapState.players;
  players.length = 0;
  for (const rp of remotes.values()) {
    if (!rp.hasPose) continue;
    players.push({ id: rp.id, x: rp.render.x, z: rp.render.z, name: rp.name, color: rp.color });
  }
  mapView.update(dt, mapState);
}

// ---------- Loop ----------
const timer = new THREE.Timer();
timer.connect(document); // abaikan waktu saat tab tersembunyi
let menuAngle = 0.8;
const menuFocus = new THREE.Vector3();

function frame(timestamp) {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.05);
  const now = performance.now();

  if (state === 'playing' && local) {
    input.update();
    camRig.applyInput(input.consumeLook());
    local.update(dt, input, camRig);
    camRig.update(dt, local.position);
    for (const rp of remotes.values()) rp.update(dt, now);
    world.update(dt, local.position, camera);
    updateMap(dt);
  } else {
    // Kamera orbit pelan di menu
    menuAngle += dt * 0.08;
    menuFocus.copy(preview.root.position);
    preview.animate(dt, { speed: 0, grounded: true, swimming: false, vy: 0 });
    preview.root.rotation.y += dt * 0.4;
    const r = 9;
    camera.position.set(menuFocus.x + Math.cos(menuAngle) * r, menuFocus.y + 3.2, menuFocus.z + Math.sin(menuAngle) * r);
    camera.lookAt(menuFocus.x, menuFocus.y + 1.2, menuFocus.z);
    world.update(dt, menuFocus, camera);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

registerPWA();

// Playroom me-reload halaman bila koneksi gagal / terputus — tangani di sini.
const reloadReason = readReloadReason();
if (reloadReason === 'connect-failed') {
  ui.setStartError('Tidak bisa terhubung ke server Playroom. Periksa koneksi internet lalu coba lagi, atau pilih "Main Offline".');
} else if (reloadReason === 'rejoin') {
  ui.start('invite'); // koneksi sempat terputus: sambung ulang otomatis ke room yang sama
}

// Untuk debugging di console
window.__game = { scene, world, camera, camRig, renderer, ui, mapView, get local() { return local; }, remotes, get net() { return net; } };
