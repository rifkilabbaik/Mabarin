import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- Helper ----------
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${opts.side || 0}|${opts.emissive || ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
    matCache.set(key, m);
  }
  return m;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Gabungkan banyak geometri (dengan posisi/rotasi/skala) jadi satu mesh = 1 draw call. */
export function mergedMesh(pieces, material) {
  const geos = pieces.map(({ geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], quat }) => {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    if (quat) _q.copy(quat);
    else _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
    _m.compose(_p.set(...pos), _q, _s.set(...scale));
    g.applyMatrix4(_m);
    g.deleteAttribute('uv');
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  merged.computeVertexNormals();
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  return mesh;
}
