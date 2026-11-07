import * as THREE from 'three';
import { mat, mergedMesh } from './parts.js';

/**
 * Item di hotbar. Senjata bersifat "bonk": lawan terpental & pusing, tanpa nyawa.
 *  action : label tombol pakai
 *  reach  : jangkauan pukulan (unit)
 *  power  : kekuatan dorongan
 */
export const ITEMS = [
  { id: 'hand', name: 'Tangan', icon: 'hand', action: 'Melambai', cooldown: 1.2 },
  { id: 'hammer', name: 'Palu Bonk', icon: 'hammer', action: 'Pukul', cooldown: 0.65, reach: 2.0, power: 11, arc: 1.2 },
  { id: 'sword', name: 'Pedang Kayu', icon: 'sword', action: 'Tebas', cooldown: 0.42, reach: 2.3, power: 7.5, arc: 1.0 },
  { id: 'watergun', name: 'Pistol Air', icon: 'drop', action: 'Tembak', cooldown: 0.32, power: 5.5 },
  { id: 'chair', name: 'Kursi', icon: 'chair', action: 'Taruh', cooldown: 0.4 },
  { id: 'guitar', name: 'Gitar', icon: 'guitar', action: 'Petik', cooldown: 0.35 },
];
export const ITEM_IDS = ITEMS.map((i) => i.id);
export const getItem = (id) => ITEMS.find((i) => i.id === id) || ITEMS[0];

// ---------- Model item yang dipegang (pegangan di titik 0, mengarah ke +Y) ----------
export function buildHeldItem(id) {
  const g = new THREE.Group();
  if (id === 'hammer') {
    g.add(mergedMesh([{ geo: new THREE.CylinderGeometry(0.035, 0.04, 0.7, 6), pos: [0, 0.25, 0] }], mat('#9c6b3c')));
    g.add(mergedMesh([
      { geo: new THREE.CylinderGeometry(0.15, 0.15, 0.34, 8), pos: [0, 0.62, 0], rot: [Math.PI / 2, 0, 0] },
    ], mat('#ff6b6b')));
    g.add(mergedMesh([
      { geo: new THREE.CylinderGeometry(0.155, 0.155, 0.06, 8), pos: [0, 0.62, 0.15], rot: [Math.PI / 2, 0, 0] },
      { geo: new THREE.CylinderGeometry(0.155, 0.155, 0.06, 8), pos: [0, 0.62, -0.15], rot: [Math.PI / 2, 0, 0] },
    ], mat('#ffe066')));
  } else if (id === 'sword') {
    g.add(mergedMesh([
      { geo: new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6), pos: [0, 0.02, 0] },
      { geo: new THREE.BoxGeometry(0.26, 0.05, 0.07), pos: [0, 0.14, 0] },
    ], mat('#6b4226')));
    g.add(mergedMesh([
      { geo: new THREE.BoxGeometry(0.1, 0.62, 0.035), pos: [0, 0.47, 0] },
      { geo: new THREE.ConeGeometry(0.07, 0.14, 4), pos: [0, 0.85, 0], rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.35] },
    ], mat('#e9c58f')));
  } else if (id === 'watergun') {
    g.add(mergedMesh([
      { geo: new THREE.BoxGeometry(0.1, 0.22, 0.1), pos: [0, 0.04, -0.04], rot: [-0.25, 0, 0] },
      { geo: new THREE.BoxGeometry(0.14, 0.14, 0.38), pos: [0, 0.17, 0.08] },
    ], mat('#ff922b')));
    g.add(mergedMesh([
      { geo: new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6), pos: [0, 0.18, 0.34], rot: [Math.PI / 2, 0, 0] },
      { geo: new THREE.CylinderGeometry(0.08, 0.08, 0.16, 8), pos: [0, 0.32, 0.02] },
    ], mat('#3bc9db')));
  } else if (id === 'guitar') {
    // dipegang melintang di depan badan (diposisikan oleh CapsuleCharacter)
    g.add(mergedMesh([
      { geo: new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 1.25] },
      { geo: new THREE.CylinderGeometry(0.15, 0.15, 0.08, 10), pos: [0, 0.22, 0], rot: [Math.PI / 2, 0, 0] },
    ], mat('#d9480f')));
    g.add(mergedMesh([
      { geo: new THREE.BoxGeometry(0.07, 0.55, 0.04), pos: [0, 0.55, 0.01] },
      { geo: new THREE.BoxGeometry(0.1, 0.12, 0.05), pos: [0, 0.86, 0.01] },
      { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8), pos: [0, 0.06, 0.05], rot: [Math.PI / 2, 0, 0] },
    ], mat('#4a2f1b')));
  }
  return g;
}

// ---------- Kursi (ditaruh di dunia) ----------
let chairGeo = null;
export function chairMesh(color = '#b07a4a') {
  if (!chairGeo) {
    const legs = [];
    for (const [x, z] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) {
      legs.push({ geo: new THREE.BoxGeometry(0.07, 0.46, 0.07), pos: [x, 0.23, z] });
    }
    const m = mergedMesh([
      ...legs,
      { geo: new THREE.BoxGeometry(0.62, 0.08, 0.6), pos: [0, 0.5, 0] },
      { geo: new THREE.BoxGeometry(0.07, 0.55, 0.07), pos: [-0.26, 0.8, -0.26] },
      { geo: new THREE.BoxGeometry(0.07, 0.55, 0.07), pos: [0.26, 0.8, -0.26] },
      { geo: new THREE.BoxGeometry(0.6, 0.2, 0.06), pos: [0, 0.95, -0.27] },
    ], mat('#ffffff'));
    chairGeo = m.geometry;
  }
  const mesh = new THREE.Mesh(chairGeo, mat(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
export const CHAIR_SEAT_HEIGHT = 0.54;
