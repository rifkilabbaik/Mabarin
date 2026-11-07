import * as THREE from 'three';
import { icon, iconPath } from '../ui/icons.js';
import { clamp } from '../utils/math.js';

// Voice chat berbasis jarak: WebRTC peer-to-peer antar pemain yang berdekatan.
// Sinyal (offer/answer) dikirim lewat event Playroom; audio mengalir langsung antar perangkat.
// Hanya memakai server STUN publik untuk menemukan alamat (tanpa TURN, jadi sebagian jaringan
// seluler/kantor dengan NAT ketat mungkin tidak bisa tersambung).
const RANGE = 26; // mulai tersambung
const RANGE_OUT = 32; // putus bila menjauh
const MAX_PEERS = 8;
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export class VoiceChat {
  constructor({ audio, ui, button }) {
    this.audio = audio;
    this.ui = ui;
    this.button = button;
    this.peers = new Map();
    this.failed = new Map();
    this.track = null;
    this.mic = null;
    this.talking = false;
    this.busy = false;
    this.timer = 0;
    this.meterT = 0;
    this.supported = !!(window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia && window.isSecureContext);
    this.icons = new Map();
    button.hidden = !this.supported;
    button.addEventListener('click', () => this.toggle());
    this.renderButton();
  }

  attach({ net, local, remotes }) {
    this.net = net;
    this.local = local;
    this.remotes = remotes;
    net.me.setState('vc', this.myVc, true);
    net.onEvent('vs', (p, from) => {
      this.onSignal(p, from).catch((e) => console.warn('voice', e));
    });
  }

  /** 0 = tidak ikut, 1 = mendengar saja, 2 = mikrofon menyala. */
  get myVc() {
    return !this.supported ? 0 : this.talking ? 2 : 1;
  }

  renderButton() {
    const b = this.button;
    b.innerHTML = icon(this.talking ? 'mic' : 'micOff');
    b.classList.toggle('on', this.talking);
    b.title = this.talking ? 'Matikan mikrofon (V)' : 'Nyalakan mikrofon (V)';
  }

  async toggle() {
    if (!this.supported || this.busy || !this.net) return;
    if (this.talking) {
      this.stopMic();
      return;
    }
    this.busy = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      this.mic = stream;
      this.track = stream.getAudioTracks()[0];
      this.talking = true;
      for (const p of this.peers.values()) p.sender?.replaceTrack(this.track).catch(() => {});
      this.setupMeter();
      this.net.me.setState('vc', 2, true);
      this.ui.toast('Mikrofon menyala — pemain di dekatmu bisa mendengar.');
    } catch (e) {
      this.ui.toast(e?.name === 'NotAllowedError' ? 'Izin mikrofon ditolak.' : 'Mikrofon tidak tersedia.');
    }
    this.busy = false;
    this.renderButton();
  }

  stopMic() {
    for (const p of this.peers.values()) p.sender?.replaceTrack(null).catch(() => {});
    this.mic?.getTracks().forEach((t) => t.stop());
    this.meter?.src.disconnect();
    this.meter = null;
    this.mic = null;
    this.track = null;
    this.talking = false;
    this.net.me.setState('vc', 1, true);
    this.button.classList.remove('speaking');
    this.renderButton();
  }

  setupMeter() {
    const ctx = this.audio.ctx;
    if (!ctx || !this.mic) return;
    const src = ctx.createMediaStreamSource(this.mic);
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    this.meter = { src, an, buf: new Uint8Array(an.fftSize) };
  }

  send(to, payload) {
    this.net.sendEvent('vs', { ...payload, to });
  }

  // ---------- Koneksi ----------
  createPeer(id) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const peer = { id, pc, sender: null, at: performance.now(), level: 0, nodes: null, el: null };
    pc.ontrack = (e) => this.attachStream(peer, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this.failed.set(id, performance.now() + 20000);
        this.close(id, false);
      }
    };
    this.peers.set(id, peer);
    return peer;
  }

  async call(id) {
    const peer = this.createPeer(id);
    const pc = peer.pc;
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    peer.sender = tr.sender;
    if (this.track) await tr.sender.replaceTrack(this.track);
    await pc.setLocalDescription(await pc.createOffer());
    await iceDone(pc);
    if (this.peers.get(id) !== peer) return;
    this.send(id, { t: 'offer', sdp: pc.localDescription.sdp });
  }

  async onSignal(p, from) {
    if (!p || p.to !== this.net.me.id || typeof p.t !== 'string' || !from) return;
    if (p.t === 'bye') return this.close(from, false);
    if (typeof p.sdp !== 'string' || p.sdp.length > 30000) return;
    if (p.t === 'offer') {
      if (this.myVc < 1) return this.send(from, { t: 'bye' });
      this.close(from, false);
      const peer = this.createPeer(from);
      const pc = peer.pc;
      await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
      const tr = pc.getTransceivers()[0];
      if (tr) {
        tr.direction = 'sendrecv';
        peer.sender = tr.sender;
        if (this.track) await tr.sender.replaceTrack(this.track);
      }
      await pc.setLocalDescription(await pc.createAnswer());
      await iceDone(pc);
      if (this.peers.get(from) !== peer) return;
      this.send(from, { t: 'answer', sdp: pc.localDescription.sdp });
    } else if (p.t === 'answer') {
      const peer = this.peers.get(from);
      if (peer && peer.pc.signalingState === 'have-local-offer') await peer.pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
    }
  }

  attachStream(peer, stream) {
    // Chrome hanya mengalirkan audio WebRTC ke Web Audio bila stream juga terpasang di elemen media.
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    el.play().catch(() => {});
    peer.el = el;
    const ctx = this.audio.ctx;
    if (!ctx) {
      el.muted = false; // tanpa efek jarak
      return;
    }
    const src = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    src.connect(gain).connect(pan).connect(ctx.destination);
    peer.nodes = { src, gain, pan, an, buf: new Uint8Array(an.fftSize) };
  }

  close(id, notify) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    try { peer.pc.close(); } catch { /* sudah tertutup */ }
    if (peer.nodes) {
      peer.nodes.src.disconnect();
      peer.nodes.pan.disconnect();
    }
    if (peer.el) peer.el.srcObject = null;
    this.setSpeaking(id, false);
    if (notify) this.send(id, { t: 'bye' });
  }

  onPlayerQuit(id) {
    this.close(id, false);
    this.icons.delete(id);
  }

  manage(now) {
    const me = this.local.position;
    const myVc = this.myVc;
    const want = [];
    if (myVc >= 1) {
      for (const rp of this.remotes.values()) {
        const vc = rp.handle.getState('vc') | 0;
        if (vc < 1 || (vc < 2 && myVc < 2) || !rp.hasPose) continue;
        const d = Math.hypot(rp.render.x - me.x, rp.render.z - me.z);
        if (d > (this.peers.has(rp.id) ? RANGE_OUT : RANGE)) continue;
        want.push({ id: rp.id, d });
      }
    }
    want.sort((a, b) => a.d - b.d);
    const keep = new Set(want.slice(0, MAX_PEERS).map((w) => w.id));
    for (const [id, peer] of [...this.peers]) {
      const stuck = peer.pc.connectionState !== 'connected' && now - peer.at > 20000;
      if (stuck) this.failed.set(id, now + 20000);
      if (!keep.has(id) || stuck) this.close(id, true);
    }
    for (const id of keep) {
      if (this.peers.has(id) || this.net.me.id > id || (this.failed.get(id) || 0) > now) continue;
      this.call(id).catch((e) => {
        console.warn('voice', e);
        this.close(id, false);
      });
    }
  }

  // ---------- Tiap frame ----------
  update(dt) {
    if (!this.net || !this.supported) return;
    const now = performance.now();
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.5;
      this.manage(now);
    }
    const ctx = this.audio.ctx;
    const me = this.local.position;
    const yaw = this.audio.listener.yaw;
    this.meterT -= dt;
    const measure = this.meterT <= 0;
    if (measure) this.meterT = 0.1;
    for (const peer of this.peers.values()) {
      const rp = this.remotes.get(peer.id);
      if (!peer.nodes || !rp || !ctx) continue;
      const dx = rp.render.x - me.x, dz = rp.render.z - me.z;
      const d = Math.hypot(dx, dz);
      const vol = clamp(1 - (d - 3) / (RANGE_OUT - 3), 0, 1) ** 1.5;
      const pan = d > 0.5 ? clamp(((dx / d) * Math.cos(yaw) - (dz / d) * Math.sin(yaw)) * 0.8, -1, 1) : 0;
      peer.nodes.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.08);
      peer.nodes.pan.pan.setTargetAtTime(pan, ctx.currentTime, 0.08);
      if (measure) {
        peer.level = Math.max(rms(peer.nodes.an, peer.nodes.buf), peer.level * 0.6);
        this.setSpeaking(peer.id, peer.level > 0.035 && vol > 0.02);
      }
    }
    if (measure && this.meter) this.button.classList.toggle('speaking', rms(this.meter.an, this.meter.buf) > 0.035);
  }

  /** Ikon mikrofon di atas kepala pemain yang sedang bicara. */
  setSpeaking(id, on) {
    const rp = this.remotes.get(id);
    if (!rp) return;
    let s = this.icons.get(id);
    if (!s && !on) return;
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: micTexture(), transparent: true, depthWrite: false, fog: false }));
      s.scale.set(0.32, 0.32, 1);
      s.center.set(0.5, 0);
      s.renderOrder = 11;
      this.icons.set(id, s);
    }
    if (s.parent !== rp.character.root) rp.character.root.add(s);
    s.position.y = (rp.character.topY || 1.4) + 0.62;
    s.visible = on;
  }
}

function rms(an, buf) {
  an.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

function iceDone(pc, ms = 2500) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const t = setTimeout(resolve, ms);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

let micTex = null;
function micTexture() {
  if (micTex) return micTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#2f9e44';
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.translate(12, 12);
  g.scale(40 / 24, 40 / 24);
  g.strokeStyle = '#fff';
  g.lineWidth = 2.2;
  g.lineCap = g.lineJoin = 'round';
  g.stroke(new Path2D(iconPath('mic')));
  micTex = new THREE.CanvasTexture(c);
  micTex.colorSpace = THREE.SRGBColorSpace;
  return micTex;
}
