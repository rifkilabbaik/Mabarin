import './style.css';
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { World } from './world/World.js';
import { Seats } from './world/Seats.js';
import { Projectiles } from './world/Projectiles.js';
import { CapsuleCharacter } from './character/CapsuleCharacter.js';
import { InputManager } from './controls/InputManager.js';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera.js';
import { LocalPlayer } from './player/LocalPlayer.js';
import { RemotePlayer } from './player/RemotePlayer.js';
import { ItemController } from './player/ItemController.js';
import { connectPlayroom, getInviteRoomFromUrl, readReloadReason, clearSessionFlags } from './net/PlayroomNetwork.js';
import { createLocalNetwork } from './net/LocalNetwork.js';
import { UI } from './ui/UI.js';
import { MapView } from './ui/MapView.js';
import { Hotbar } from './ui/Hotbar.js';
import { CustomizePanel } from './ui/CustomizePanel.js';
import { AudioManager } from './audio/AudioManager.js';
import { registerPWA } from './pwa.js';

const $ = (id) => document.getElementById(id);

// ---------- Kualitas grafis ----------
const params = new URLSearchParams(location.search);
const isTouchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
const quality = params.get('q') || (isTouchDevice ? 'low' : 'high');

// ---------- Renderer / scene / kamera ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

const world = new World(scene, { quality });
const camRig = new ThirdPersonCamera(camera, world);
const seats = new Seats(world);
const projectiles = new Projectiles(scene, world);
const audio = new AudioManager();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- State ----------
let state = 'menu';
let net = null;
let local = null;
let myProfile = null;
const remotes = new Map();
const blockers = { chat: false, menu: false, customize: false };

function refreshInputEnabled() {
  const on = !blockers.chat && !blockers.menu && !blockers.customize;
  input.setEnabled(on);
  items.enabled = on;
}

// ---------- UI ----------
const ui = new UI({
  onStart: (mode, profile) => startGame(mode, profile),
  onChat: (text) => sendChat(text),
  onChatOpenChange: (open) => {
    blockers.chat = open;
    refreshInputEnabled();
  },
  onToggleMap: (force) => mapView.toggle(force),
  onCustomize: () => openCustomize(),
  onExit: () => exitToMenu(),
  onVolume: (kind, v) => audio.setVolume(kind, v),
  getVolume: (kind) => audio.settings[kind],
  onMenuOpenChange: (open) => {
    blockers.menu = open;
    refreshInputEnabled();
  },
});
ui.setInvite(getInviteRoomFromUrl());

const mapView = new MapView({
  world,
  minimapCanvas: $('minimap'),
  fullCanvas: $('map-full'),
  overlay: $('map-overlay'),
  listEl: $('player-list'),
  countEl: $('map-count'),
});

const hotbar = new Hotbar({
  onSelect: (i) => items.select(i),
  onUse: () => items.use(),
  onInteract: () => items.interact(),
});
const items = new ItemController({ scene, world, camera, camRig, audio, projectiles, seats, hotbar });

const input = new InputManager({
  surface: $('surface'),
  jumpButton: $('btn-jump'),
  onModeChange: (mode) => {
    document.body.dataset.input = mode;
  },
  onPointerLockChange: (locked) => ui.setPointerLocked(locked),
  onSlot: (i) => state === 'playing' && items.select(i),
  onUse: () => state === 'playing' && items.use(),
  onInteract: () => state === 'playing' && items.interact(),
});

// Karakter pratinjau di menu
const preview = new CapsuleCharacter({ color: ui.color, look: ui.look, showName: false });
preview.root.position.set(3.4, world.getHeight(3.4, 0), 0);
preview.root.rotation.y = Math.PI * 0.25;
scene.add(preview.root);

// ---------- Kustomisasi karakter ----------
let profileSendTimer = null;
const customize = new CustomizePanel({
  root: $('customize'),
  onChange: ({ color, look }) => applyAppearance(color, look),
  onClose: () => {
    blockers.customize = false;
    refreshInputEnabled();
    if (camera.view?.enabled) camera.clearViewOffset();
  },
});

function openCustomize() {
  input.exitLock();
  customize.open({ color: ui.color, look: ui.look });
  blockers.customize = true;
  refreshInputEnabled();
}

function applyAppearance(color, look) {
  ui.setAppearance({ color, look });
  preview.setProfile(null, color);
  preview.setLook(look);
  if (local && net) {
    local.character.setProfile(null, color);
    local.character.setLook(look);
    myProfile = { ...myProfile, color, look: ui.look };
    clearTimeout(profileSendTimer);
    profileSendTimer = setTimeout(() => net.me.setState('profile', myProfile, true), 250);
  }
}

// Geser proyeksi kamera supaya karakter tidak tertutup panel kustomisasi.
function applyViewOffset() {
  const cov = customize.coverage();
  const w = window.innerWidth, h = window.innerHeight;
  if (cov.right || cov.bottom) camera.setViewOffset(w, h, cov.right / 2, cov.bottom / 2, w, h);
}

// ---------- Mulai & keluar ----------
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

  myProfile = { name: profile.name, color: profile.color, look: profile.look };
  net.me.setState('profile', myProfile, true);

  scene.remove(preview.root);
  local = new LocalPlayer({
    world, scene, net,
    name: profile.name, color: profile.color, look: profile.look,
    onSfx: (name, opts) => audio.play(name, opts),
  });
  camRig.yaw = local.facing + Math.PI;
  camRig.pitch = 0.3;
  camRig.initialized = false;
  items.attach(local, net, remotes);

  const joinedAt = performance.now();
  net.onPlayerJoin((handle, isMe) => {
    if (isMe || remotes.has(handle.id)) return;
    const rp = new RemotePlayer({ handle, scene });
    remotes.set(handle.id, rp);
    ui.setPlayerCount(remotes.size + 1);
    if (performance.now() - joinedAt > 2500) {
      setTimeout(() => {
        if (!remotes.has(handle.id)) return;
        ui.toastPlayer(rp.name, 'bergabung 👋');
        audio.play('chime', { volume: 0.7 });
      }, 1200);
    }
    handle.onQuit(() => {
      const p = remotes.get(handle.id);
      if (!p) return;
      ui.toastPlayer(p.name, 'keluar');
      audio.play('leave', { volume: 0.6 });
      p.dispose();
      remotes.delete(handle.id);
      ui.setPlayerCount(remotes.size + 1);
    });
  });
  net.onDisconnect?.(() => {
    ui.setConnected(false);
    ui.toast('Koneksi ke server terputus. Muat ulang halaman untuk menyambung lagi.');
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
      ? `Kamu masuk ke ${where}. Ketuk tombol item untuk ganti properti, 💬 untuk chat, peta kecil untuk peta pulau.`
      : `Kamu masuk ke ${where}. 1–6 ganti item, klik/F pakai, E duduk, Enter chat, M peta.`
  );
  loadChatHistory();
  setTimeout(loadChatHistory, 2000); // state room kadang baru tiba sesaat setelah terhubung

  if (net.kind === 'playroom' && !net.isPublic) {
    ui.toast('Room privat dibuat. Buka menu ☰ → Undang teman untuk membagikan link.');
  }
  if (isTouchDevice && quality === 'low' && !document.fullscreenElement) {
    ui.toggleFullscreen();
  }
}

function exitToMenu() {
  clearSessionFlags();
  try { net?.leave?.(); } catch { /* abaikan */ }
  // muat ulang tanpa kode room di URL => kembali ke layar awal
  location.replace(location.pathname + location.search);
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
  audio.play('pop', { volume: 0.6 });
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
  audio.play('pop');
}

// ---------- Data untuk peta & kursi ----------
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

let chairTimer = 0;
function updateChairs(dt) {
  chairTimer -= dt;
  if (chairTimer > 0) return;
  chairTimer = 0.25;
  const lists = [{ owner: net.me.id, chairs: items.myChairs }];
  for (const rp of remotes.values()) lists.push({ owner: rp.id, chairs: rp.handle.getState('chairs') });
  seats.syncChairs(lists);
}

// ---------- Loop ----------
const timer = new THREE.Timer();
timer.connect(document); // abaikan waktu saat tab tersembunyi
let menuAngle = 0.8;
let elapsed = 0;
const menuFocus = new THREE.Vector3();

function frame(timestamp) {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.05);
  const now = performance.now();
  elapsed += dt;

  if (state === 'playing' && local) {
    input.update();
    camRig.applyInput(input.consumeLook());
    if (customize.isOpen && !local.sitting) local.facing = camRig.yaw; // hadap kamera saat ganti baju
    local.update(dt, input, camRig);
    camRig.update(dt, local.position);
    for (const rp of remotes.values()) rp.update(dt, now);
    items.update(dt, input.mode === 'touch');
    updateChairs(dt);
    world.update(dt, local.position, camera);
    updateMap(dt);
    const p = local.position;
    audio.setListener(p.x, p.z, camRig.yaw);
    audio.updateAmbient(dt, p.x, p.z, world.getHeight(p.x, p.z), elapsed);
    document.body.classList.toggle('aiming', items.item.id === 'watergun' && !customize.isOpen);
  } else {
    menuFocus.copy(preview.root.position);
    preview.animate(dt, { speed: 0, grounded: true, swimming: false, vy: 0 });
    if (customize.isOpen) {
      // close-up karakter saat kustomisasi
      const a = 0.6 + Math.sin(elapsed * 0.3) * 0.25;
      const dist = 4.4 * Math.pow(Math.max(1, 1 / camera.aspect), 0.75); // layar portrait = mundur
      preview.root.rotation.y = a;
      camera.position.set(menuFocus.x + Math.sin(a) * dist, menuFocus.y + 1.7, menuFocus.z + Math.cos(a) * dist);
      camera.lookAt(menuFocus.x, menuFocus.y + 0.95, menuFocus.z);
    } else {
      menuAngle += dt * 0.08;
      preview.root.rotation.y += dt * 0.4;
      const r = 9;
      camera.position.set(menuFocus.x + Math.cos(menuAngle) * r, menuFocus.y + 3.2, menuFocus.z + Math.sin(menuAngle) * r);
      camera.lookAt(menuFocus.x, menuFocus.y + 1.2, menuFocus.z);
    }
    world.update(dt, menuFocus, camera);
    audio.setListener(menuFocus.x, menuFocus.z, 0);
    audio.updateAmbient(dt, menuFocus.x, menuFocus.z, menuFocus.y, elapsed);
  }
  if (customize.isOpen) applyViewOffset();

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
window.__game = {
  scene, world, camera, camRig, renderer, ui, mapView, items, seats, audio, customize,
  get local() { return local; }, remotes, get net() { return net; },
};
