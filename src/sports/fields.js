import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Visual kompleks olahraga: lapangan bola, tenis, bulu tangkis (garis digambar di canvas).

function courtPlane(w, d, ppu, draw) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * ppu);
  c.height = Math.round(d * ppu);
  const g = c.getContext('2d');
  draw(g, ppu, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: tex }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

const white = new THREE.MeshLambertMaterial({ color: '#f8f9fa', flatShading: true });
const netMat = new THREE.MeshBasicMaterial({ color: '#f8f9fa', transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
const darkNet = new THREE.MeshBasicMaterial({ color: '#1d2333', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
const boardMat = new THREE.MeshLambertMaterial({ color: '#1c7ed6', flatShading: true });
const postMat = new THREE.MeshLambertMaterial({ color: '#495057', flatShading: true });

function cyl(r, h, mat, x, y, z, rot) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  return m;
}

function football(f, y) {
  const g = new THREE.Group();
  g.position.set(f.x, y, f.z);
  const run = 2.5;
  const W = f.L + run * 2, D = f.W + run * 2;
  g.add(courtPlane(W, D, 24, (c, s, pw, ph) => {
    for (let i = 0; i < 12; i++) {
      c.fillStyle = i % 2 ? '#3fa34d' : '#4cb75a';
      c.fillRect((i * pw) / 12, 0, pw / 12 + 1, ph);
    }
    const X = (x) => (x + W / 2) * s, Z = (z) => (z + D / 2) * s;
    c.strokeStyle = '#ffffff';
    c.lineWidth = 0.14 * s;
    const L2 = f.L / 2, W2 = f.W / 2;
    c.strokeRect(X(-L2), Z(-W2), f.L * s, f.W * s);
    c.beginPath(); c.moveTo(X(0), Z(-W2)); c.lineTo(X(0), Z(W2)); c.stroke();
    c.beginPath(); c.arc(X(0), Z(0), 3 * s, 0, Math.PI * 2); c.stroke();
    for (const sgn of [-1, 1]) {
      const ex = sgn * L2;
      c.strokeRect(Math.min(X(ex), X(ex - sgn * 5)), Z(-5.5), 5 * s, 11 * s);
      c.strokeRect(Math.min(X(ex), X(ex - sgn * 2)), Z(-3.5), 2 * s, 7 * s);
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(X(sgn * (L2 - 6)), Z(0), 0.18 * s, 0, Math.PI * 2); c.fill();
    }
    c.beginPath(); c.arc(X(0), Z(0), 0.18 * s, 0, Math.PI * 2); c.fill();
  }));
  // papan pembatas rendah
  const bx = f.L / 2 + 1.5, bz = f.W / 2 + 1.5;
  for (const [w, d, x, z] of [[bx * 2 + 0.2, 0.15, 0, bz], [bx * 2 + 0.2, 0.15, 0, -bz], [0.15, bz * 2, bx, 0], [0.15, bz * 2, -bx, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.45, d), boardMat);
    b.position.set(x, 0.225, z);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
  }
  // gawang
  for (const sgn of [-1, 1]) {
    const gx = sgn * f.L / 2;
    const gw = f.goalW / 2, gh = f.goalH, depth = 1.2;
    g.add(cyl(0.07, gh, white, gx, gh / 2, -gw), cyl(0.07, gh, white, gx, gh / 2, gw), cyl(0.07, f.goalW + 0.14, white, gx, gh, 0, [Math.PI / 2, 0, 0]));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(f.goalW, gh), netMat);
    back.position.set(gx + sgn * depth, gh / 2, 0);
    back.rotation.y = Math.PI / 2;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(depth, f.goalW), netMat);
    top.position.set(gx + sgn * depth / 2, gh, 0);
    top.rotation.x = -Math.PI / 2;
    g.add(back, top);
    for (const zs of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(depth, gh), netMat);
      side.position.set(gx + sgn * depth / 2, gh / 2, zs * gw);
      g.add(side);
    }
  }
  return g;
}

function court(f, y, kind) {
  const g = new THREE.Group();
  g.position.set(f.x, y, f.z);
  const tennis = kind === 'tenis';
  const run = tennis ? 3 : 2;
  const W = f.L + run * 2, D = f.W + run * 2;
  g.add(courtPlane(W, D, 32, (c, s) => {
    c.fillStyle = tennis ? '#2f8f5b' : '#2b6f45';
    c.fillRect(0, 0, W * s, D * s);
    const X = (x) => (x + W / 2) * s, Z = (z) => (z + D / 2) * s;
    c.fillStyle = tennis ? '#3b6fb6' : '#2b8a3e';
    c.fillRect(X(-f.L / 2), Z(-f.W / 2), f.L * s, f.W * s);
    c.strokeStyle = '#fff';
    c.lineWidth = 0.08 * s;
    c.strokeRect(X(-f.L / 2), Z(-f.W / 2), f.L * s, f.W * s);
    const line = (x1, z1, x2, z2) => { c.beginPath(); c.moveTo(X(x1), Z(z1)); c.lineTo(X(x2), Z(z2)); c.stroke(); };
    if (tennis) {
      const sv = 6;
      line(-sv, -f.W / 2 + 1.2, -sv, f.W / 2 - 1.2);
      line(sv, -f.W / 2 + 1.2, sv, f.W / 2 - 1.2);
      line(-sv, 0, sv, 0);
      line(-f.L / 2, -f.W / 2 + 1.2, f.L / 2, -f.W / 2 + 1.2);
      line(-f.L / 2, f.W / 2 - 1.2, f.L / 2, f.W / 2 - 1.2);
    } else {
      line(-2, -f.W / 2, -2, f.W / 2);
      line(2, -f.W / 2, 2, f.W / 2);
      line(-f.L / 2, 0, -2, 0);
      line(2, 0, f.L / 2, 0);
      line(-f.L / 2 + 0.8, -f.W / 2, -f.L / 2 + 0.8, f.W / 2);
      line(f.L / 2 - 0.8, -f.W / 2, f.L / 2 - 0.8, f.W / 2);
      line(-f.L / 2, -f.W / 2 + 0.5, f.L / 2, -f.W / 2 + 0.5);
      line(-f.L / 2, f.W / 2 - 0.5, f.L / 2, f.W / 2 - 0.5);
    }
  }));
  // net
  const span = f.W + 1;
  const bottom = tennis ? 0 : 0.8;
  const net = new THREE.Mesh(new THREE.PlaneGeometry(span, f.net - bottom), darkNet);
  net.rotation.y = Math.PI / 2;
  net.position.set(0, bottom + (f.net - bottom) / 2, 0);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, span), white);
  tape.position.set(0, f.net, 0);
  g.add(net, tape, cyl(0.05, f.net + 0.05, postMat, 0, (f.net + 0.05) / 2, -span / 2), cyl(0.05, f.net + 0.05, postMat, 0, (f.net + 0.05) / 2, span / 2));
  return g;
}

export function buildFields(world) {
  const S = CONFIG.sports;
  const y = S.zone.h + 0.02;
  const out = {};
  out.bola = { ...S.fields.bola, y, group: football(S.fields.bola, y) };
  out.tenis = { ...S.fields.tenis, y, group: court(S.fields.tenis, y, 'tenis') };
  out.badminton = { ...S.fields.badminton, y, group: court(S.fields.badminton, y, 'badminton') };
  for (const f of Object.values(out)) world.scene.add(f.group);
  return out;
}
