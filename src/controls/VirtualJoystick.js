// Joystick virtual dinamis: muncul di tempat jempol menyentuh (area kiri layar).
export class VirtualJoystick {
  constructor(container, { radius = 58 } = {}) {
    this.radius = radius;
    this.base = document.createElement('div');
    this.base.className = 'joy-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob);
    container.appendChild(this.base);

    this.pointerId = null;
    this.origin = { x: 0, y: 0 };
    this.value = { x: 0, y: 0 }; // x: kanan +, y: maju +
    this.magnitude = 0;
    this.resetPosition();
  }

  get active() {
    return this.pointerId !== null;
  }

  resetPosition() {
    this.base.classList.remove('active');
    this.base.style.left = '';
    this.base.style.top = '';
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  start(pointerId, x, y) {
    this.pointerId = pointerId;
    this.origin.x = x;
    this.origin.y = y;
    this.base.classList.add('active');
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
    this.move(x, y);
  }

  move(x, y) {
    let dx = x - this.origin.x;
    let dy = y - this.origin.y;
    const d = Math.hypot(dx, dy);
    const r = this.radius;
    if (d > r) {
      dx = (dx / d) * r;
      dy = (dy / d) * r;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // dead zone kecil supaya karakter tidak "merayap"
    const m = Math.min(d, r) / r;
    const dead = 0.12;
    const scaled = m < dead ? 0 : (m - dead) / (1 - dead);
    const nx = d > 0 ? dx / Math.min(d, r) : 0;
    const ny = d > 0 ? dy / Math.min(d, r) : 0;
    this.magnitude = scaled;
    this.value.x = nx * scaled;
    this.value.y = -ny * scaled;
  }

  end() {
    this.pointerId = null;
    this.value.x = this.value.y = 0;
    this.magnitude = 0;
    this.resetPosition();
  }
}
