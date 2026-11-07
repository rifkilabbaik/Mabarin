import { CONFIG } from '../config.js';
import { VirtualJoystick } from './VirtualJoystick.js';

const KEY_MAP = {
  ArrowUp: 'f', KeyW: 'f',
  ArrowDown: 'b', KeyS: 'b',
  ArrowLeft: 'l', KeyA: 'l',
  ArrowRight: 'r', KeyD: 'r',
};

/**
 * Menggabungkan semua input:
 *  - PC/Laptop : Arrow keys (atau WASD) untuk bergerak, Pointer Lock + mouse untuk kamera,
 *                Shift lari, Spasi lompat, scroll untuk zoom.
 *  - HP/Tablet : joystick virtual (kiri), geser area kanan untuk kamera, pinch untuk zoom, tombol lompat.
 */
export class InputManager {
  constructor({ surface, jumpButton, onModeChange, onPointerLockChange }) {
    this.surface = surface;
    this.enabled = true;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.run = false;
    this.look = { yaw: 0, pitch: 0 };
    this.zoom = 0;
    this.jumpQueued = false;
    this.pointerLocked = false;
    this.mouseDrag = null;
    this.onModeChange = onModeChange;
    this.onPointerLockChange = onPointerLockChange;

    this.joystick = new VirtualJoystick(surface);
    this.lookPointers = new Map();
    this.pinchDist = 0;

    this.mode = window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop';

    this.bindKeyboard();
    this.bindPointer();
    this.bindJump(jumpButton);
    this.bindPointerLock();
    queueMicrotask(() => this.onModeChange?.(this.mode));
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.onModeChange?.(mode);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.keys.clear();
      this.joystick.end();
      this.lookPointers.clear();
    }
  }

  // ---------- Keyboard ----------
  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || isTyping(e)) return;
      if (KEY_MAP[e.code] || e.code === 'Space') e.preventDefault();
      if (e.code === 'Space' && !e.repeat) this.jumpQueued = true;
      this.keys.add(e.code);
      if (KEY_MAP[e.code]) this.setMode('desktop');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // ---------- Pointer (mouse / touch / pen) ----------
  bindPointer() {
    const s = this.surface;
    const sensMouse = CONFIG.camera.mouseSensitivity;
    const sensTouch = CONFIG.camera.touchSensitivity;

    s.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse') {
        this.setMode('desktop');
        if (!this.pointerLocked) {
          this.requestLock();
          // fallback: drag-to-look bila Pointer Lock tidak tersedia
          this.mouseDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }
        return;
      }
      e.preventDefault();
      this.setMode('touch');
      s.setPointerCapture(e.pointerId);
      const leftZone = e.clientX < window.innerWidth * 0.45;
      if (leftZone && !this.joystick.active) {
        this.joystick.start(e.pointerId, e.clientX, e.clientY);
      } else if (this.lookPointers.size < 2) {
        this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.lookPointers.size === 2) this.pinchDist = this.currentPinch();
      }
    });

    s.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse') {
        if (this.pointerLocked) {
          this.look.yaw -= clampDelta(e.movementX) * sensMouse;
          this.look.pitch += clampDelta(e.movementY) * sensMouse;
        } else if (this.mouseDrag && this.mouseDrag.id === e.pointerId) {
          this.look.yaw -= (e.clientX - this.mouseDrag.x) * sensMouse * 1.6;
          this.look.pitch += (e.clientY - this.mouseDrag.y) * sensMouse * 1.6;
          this.mouseDrag.x = e.clientX;
          this.mouseDrag.y = e.clientY;
        }
        return;
      }
      if (e.pointerId === this.joystick.pointerId) {
        this.joystick.move(e.clientX, e.clientY);
        return;
      }
      const p = this.lookPointers.get(e.pointerId);
      if (!p) return;
      if (this.lookPointers.size === 1) {
        this.look.yaw -= (e.clientX - p.x) * sensTouch;
        this.look.pitch += (e.clientY - p.y) * sensTouch;
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.lookPointers.size === 2) {
        const d = this.currentPinch();
        this.zoom -= (d - this.pinchDist) * 0.03;
        this.pinchDist = d;
      }
    });

    const end = (e) => {
      if (this.mouseDrag && this.mouseDrag.id === e.pointerId) this.mouseDrag = null;
      if (e.pointerId === this.joystick.pointerId) this.joystick.end();
      this.lookPointers.delete(e.pointerId);
    };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener('lostpointercapture', end);

    s.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom += Math.sign(e.deltaY) * 0.8;
    }, { passive: false });

    s.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  currentPinch() {
    const [a, b] = [...this.lookPointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  bindJump(btn) {
    if (!btn) return;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.enabled) this.jumpQueued = true;
      btn.classList.add('pressed');
    });
    const up = () => btn.classList.remove('pressed');
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }

  // ---------- Pointer Lock ----------
  bindPointerLock() {
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.surface;
      if (this.pointerLocked) this.mouseDrag = null;
      this.onPointerLockChange?.(this.pointerLocked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.pointerLocked = false;
      this.onPointerLockChange?.(false);
    });
  }

  get pointerLockSupported() {
    return 'requestPointerLock' in Element.prototype;
  }

  requestLock() {
    if (!this.pointerLockSupported || this.pointerLocked) return;
    try {
      const p = this.surface.requestPointerLock({ unadjustedMovement: true });
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // beberapa platform tidak mendukung unadjustedMovement
          try { this.surface.requestPointerLock()?.catch?.(() => {}); } catch { /* abaikan */ }
        });
      }
    } catch {
      try { this.surface.requestPointerLock(); } catch { /* abaikan */ }
    }
  }

  exitLock() {
    if (this.pointerLocked) document.exitPointerLock();
  }

  // ---------- Dibaca setiap frame ----------
  update() {
    let x = 0, y = 0;
    if (this.enabled) {
      for (const code of this.keys) {
        const k = KEY_MAP[code];
        if (k === 'f') y += 1;
        else if (k === 'b') y -= 1;
        else if (k === 'l') x -= 1;
        else if (k === 'r') x += 1;
      }
    }
    const len = Math.hypot(x, y);
    if (len > 0) {
      this.move.x = x / len;
      this.move.y = y / len;
      this.run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    } else if (this.joystick.active) {
      this.move.x = this.joystick.value.x;
      this.move.y = this.joystick.value.y;
      this.run = this.joystick.magnitude > 0.9;
    } else {
      this.move.x = this.move.y = 0;
      this.run = false;
    }
  }

  consumeLook() {
    const l = { yaw: this.look.yaw, pitch: this.look.pitch, zoom: this.zoom };
    this.look.yaw = this.look.pitch = this.zoom = 0;
    return l;
  }

  consumeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

function clampDelta(v) {
  // Chrome kadang mengirim lonjakan movementX yang besar saat lock dimulai.
  return Math.max(-120, Math.min(120, v));
}
