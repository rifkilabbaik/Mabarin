import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';

// ---------- Helper geometri low poly ----------
function prep(geo, color) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Geser vertex secara acak tapi konsisten per posisi, supaya permukaan tidak retak.
function jitter(geo, amount, rand) {
  const pos = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let off = map.get(key);
    if (!off) {
      off = [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount];
      map.set(key, off);
    }
    pos.setXYZ(i, pos.getX(i) + off[0], pos.getY(i) + off[1], pos.getZ(i) + off[2]);
  }
  return geo;
}

function merge(parts) {
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const lambert = (opts = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts });

// ---------- Jenis-jenis prop ----------
function pineGeometry() {
  return merge([
    prep(new THREE.CylinderGeometry(0.16, 0.26, 1.4, 5).translate(0, 0.7, 0), '#7a4f2e'),
    prep(new THREE.ConeGeometry(1.45, 1.9, 7).translate(0, 1.95, 0), '#2f7d4f'),
    prep(new THREE.ConeGeometry(1.12, 1.6, 7).translate(0, 2.85, 0), '#3a8f58'),
    prep(new THREE.ConeGeometry(0.75, 1.3, 7).translate(0, 3.7, 0), '#46a263'),
  ]);
}

function roundTreeGeometry(rand) {
  const top = jitter(prep(new THREE.IcosahedronGeometry(1.35, 0), '#6fc04b'), 0.35, rand).translate(0, 2.7, 0);
  const side = jitter(prep(new THREE.IcosahedronGeometry(0.85, 0), '#82d258'), 0.25, rand).translate(0.65, 3.25, 0.25);
  return merge([
    prep(new THREE.CylinderGeometry(0.18, 0.3, 2, 6).translate(0, 1, 0), '#86593a'),
    top,
    side,
  ]);
}

function rockGeometry(rand, color) {
  const g = jitter(prep(new THREE.DodecahedronGeometry(1, 0), color), 0.45, rand);
  g.scale(1, 0.72, 1);
  return merge([g]);
}

function bushGeometry(rand) {
  return merge([
    jitter(prep(new THREE.IcosahedronGeometry(0.62, 0), '#4f9d43'), 0.2, rand).translate(0, 0.42, 0),
    jitter(prep(new THREE.IcosahedronGeometry(0.45, 0), '#5cae4c'), 0.15, rand).translate(0.45, 0.32, 0.15),
  ]);
}

function grassGeometry() {
  const blade = (x, z, h, rz) =>
    prep(new THREE.ConeGeometry(0.07, h, 3).translate(0, h / 2, 0).rotateZ(rz).translate(x, 0, z), '#6dbb4f');
  return merge([blade(0, 0, 0.5, 0), blade(0.09, 0.05, 0.38, -0.3), blade(-0.08, 0.04, 0.42, 0.3)]);
}

function flowerGeometry() {
  return merge([
    prep(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 3).translate(0, 0.16, 0), '#4c8f3a'),
    prep(new THREE.OctahedronGeometry(0.1, 0).translate(0, 0.36, 0), '#ffffff'),
  ]);
}

function cloudGeometry(rand) {
  const parts = [];
  const blobs = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < blobs; i++) {
    const r = 2.5 + rand() * 2.5;
    const g = jitter(prep(new THREE.IcosahedronGeometry(r, 0), '#ffffff'), 0.6, rand);
    g.scale(1, 0.65, 1);
    g.translate((i - blobs / 2) * 3.2 + rand() * 1.5, rand() * 1.2, (rand() - 0.5) * 3);
    parts.push(g);
  }
  return merge(parts);
}

// ---------- Penyebaran ----------
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

function scatter(world, rand, count, opts) {
  const { minH = 1.2, maxH = 11, maxSlope = 0.6, avoidSpawn = 8, collider = 0 } = opts;
  const result = [];
  const lim = world.half * 0.92;
  let tries = 0;
  while (result.length < count && tries < count * 25) {
    tries++;
    const x = (rand() * 2 - 1) * lim;
    const z = (rand() * 2 - 1) * lim;
    if (Math.hypot(x, z) < avoidSpawn) continue;
    if (world.inZone(x, z, 3)) continue; // area olahraga bebas pohon/batu
    const y = world.getHeight(x, z);
    if (y < minH || y > maxH) continue;
    if (world.getSlope(x, z) > maxSlope) continue;
    if (collider > 0 && !world.colliders.isFree(x, z, collider + 0.6)) continue;
    result.push({ x, y, z });
    if (collider > 0) world.colliders.add(x, z, collider);
  }
  return result;
}

function instanced(geo, mat, items, scene, { shadow = true, scale = [1, 1], tintRange = 0.12, sink = 0, rand, colors }) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    const s = scale[0] + rand() * (scale[1] - scale[0]);
    it.s = s;
    dummy.position.set(it.x, it.y - sink * s, it.z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (colors) tint.set(colors[Math.floor(rand() * colors.length)]);
    else tint.setScalar(1);
    tint.multiplyScalar(1 - tintRange / 2 + rand() * tintRange);
    mesh.setColorAt(i, tint);
  });
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}

// ---------- Api unggun & tenda di titik spawn ----------
function buildCampfire(world, rand, markers) {
  const group = new THREE.Group();
  const y0 = world.getHeight(0, 0);
  group.position.set(0, y0, 0);

  const stones = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    stones.push(
      jitter(prep(new THREE.DodecahedronGeometry(0.24, 0), i % 2 ? '#8a8783' : '#a19d97'), 0.08, rand)
        .translate(Math.cos(a) * 0.85, 0.1, Math.sin(a) * 0.85)
    );
  }
  const logs = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const log = prep(new THREE.CylinderGeometry(0.1, 0.12, 1.1, 5), '#6b4226');
    log.rotateZ(Math.PI / 2 - 0.55).rotateY(a).translate(Math.cos(a) * 0.25, 0.3, -Math.sin(a) * 0.25);
    logs.push(log);
  }
  const base = new THREE.Mesh(merge([...stones, ...logs]), lambert());
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const flames = [];
  const flameColors = ['#ff6a1a', '#ffa43a', '#ffe066'];
  flameColors.forEach((c, i) => {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.42 - i * 0.11, 1.1 - i * 0.22, 5),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.92 - i * 0.05 })
    );
    f.position.y = 0.55 + i * 0.05;
    f.userData.phase = i * 1.7;
    group.add(f);
    flames.push(f);
  });

  const light = new THREE.PointLight('#ff9840', 28, 16, 1.8);
  light.position.y = 1.2;
  group.add(light);

  // Bangku kayu
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bench = new THREE.Mesh(
      merge([prep(new THREE.CylinderGeometry(0.26, 0.26, 2.1, 6), '#8b5a35').rotateZ(Math.PI / 2)]),
      lambert()
    );
    const r = 3.3;
    bench.position.set(Math.cos(a) * r, 0.24, Math.sin(a) * r);
    markers.benches.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, a, y: y0 + 0.5 });
    bench.rotation.y = -a + Math.PI / 2;
    bench.castShadow = bench.receiveShadow = true;
    group.add(bench);
  }

  world.scene.add(group);
  world.colliders.add(0, 0, 1.1, y0 + 0.5);

  // Tenda
  const tentColors = ['#e8590c', '#1c7ed6', '#f59f00', '#ae3ec9'];
  const tentGeo = (c) => merge([
    prep(new THREE.ConeGeometry(1.9, 2.3, 4).rotateY(Math.PI / 4).translate(0, 1.15, 0), c),
    prep(new THREE.ConeGeometry(0.55, 1.2, 3).rotateY(Math.PI).translate(0, 0.6, 1.25), '#3b2a1e'),
    prep(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 4).translate(0, 1.4, 0), '#5a3d28'),
  ]);
  tentColors.forEach((c, i) => {
    const a = i * (Math.PI / 2) + 0.35;
    const r = 10.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const tent = new THREE.Mesh(tentGeo(c), lambert());
    tent.position.set(x, world.getHeight(x, z), z);
    tent.lookAt(0, tent.position.y, 0);
    tent.castShadow = tent.receiveShadow = true;
    world.scene.add(tent);
    world.colliders.add(x, z, 1.55);
    markers.tents.push({ x, z, color: c });
  });

  return {
    update(t) {
      flames.forEach((f, i) => {
        const p = f.userData.phase;
        f.scale.set(1 + Math.sin(t * 9 + p) * 0.08, 1 + Math.sin(t * 13 + p) * 0.18, 1 + Math.cos(t * 10 + p) * 0.08);
        f.rotation.y = t * (1.5 + i);
      });
      light.intensity = 26 + Math.sin(t * 17) * 3 + Math.sin(t * 7.3) * 3;
    },
  };
}

// ---------- Meja Kartu Kilat (3 meja, masing-masing 4 bangku) ----------
function buildCardTables(world, markers) {
  const top = merge([
    prep(new THREE.CylinderGeometry(0.82, 0.82, 0.08, 12).translate(0, 0.74, 0), '#a0672f'),
    prep(new THREE.CylinderGeometry(0.66, 0.66, 0.012, 12).translate(0, 0.785, 0), '#2f9e44'),
    prep(new THREE.CylinderGeometry(0.09, 0.12, 0.7, 6).translate(0, 0.35, 0), '#6b4226'),
    prep(new THREE.CylinderGeometry(0.4, 0.45, 0.06, 8).translate(0, 0.03, 0), '#6b4226'),
  ]);
  const stool = merge([
    prep(new THREE.CylinderGeometry(0.24, 0.22, 0.08, 8).translate(0, 0.42, 0), '#c08552'),
    prep(new THREE.CylinderGeometry(0.06, 0.08, 0.4, 5).translate(0, 0.2, 0), '#6b4226'),
  ]);
  const mat = lambert();
  const spots = [1.14, 2.71, 4.28, 5.85].map((a) => [Math.cos(a) * 7.6, Math.sin(a) * 7.6, a]);
  for (const [x, z] of CONFIG.sports.plazaTables) spots.push([x, z, 0]);
  spots.forEach(([cx, cz, a], index) => {
    const y = world.getHeight(cx, cz);
    const t = new THREE.Mesh(top, mat);
    t.position.set(cx, y, cz);
    t.castShadow = t.receiveShadow = true;
    world.scene.add(t);
    world.colliders.add(cx, cz, 0.85, y + 0.8);
    const seats = [];
    for (let k = 0; k < 4; k++) {
      const sa = a + Math.PI / 4 + (k * Math.PI) / 2;
      const sx = cx + Math.cos(sa) * 1.18, sz = cz + Math.sin(sa) * 1.18;
      const sy = world.getHeight(sx, sz);
      const m = new THREE.Mesh(stool, mat);
      m.position.set(sx, sy, sz);
      m.castShadow = m.receiveShadow = true;
      world.scene.add(m);
      seats.push({ x: sx, z: sz, y: sy + 0.46, rot: Math.atan2(cx - sx, cz - sz), locked: true });
    }
    markers.cardTables.push({ index, x: cx, z: cz, y: y + 0.79, seats });
  });
}

export function buildProps(world, rand) {
  const cfg = CONFIG.world;
  const scene = world.scene;
  const shadows = world.quality !== 'low';

  // Penanda untuk peta (src/ui/MapView.js)
  const markers = { pines: [], rounds: [], rocks: [], tents: [], benches: [], cardTables: [], campfire: { x: 0, z: 0 } };
  const campfire = buildCampfire(world, rand, markers);
  buildCardTables(world, markers);

  // Pohon (punya collider batang)
  const pines = scatter(world, rand, cfg.trees.pine, { minH: 2, maxH: 14, maxSlope: 0.75, avoidSpawn: 14, collider: 0.45 });
  instanced(pineGeometry(), lambert(), pines, scene, { scale: [0.8, 1.5], rand, shadow: true });

  const rounds = scatter(world, rand, cfg.trees.round, { minH: 1.4, maxH: 9, maxSlope: 0.55, avoidSpawn: 14, collider: 0.45 });
  instanced(roundTreeGeometry(rand), lambert(), rounds, scene, { scale: [0.8, 1.4], rand, shadow: true });
  markers.pines = pines;
  markers.rounds = rounds;

  // Batu (collider sesuai skala)
  const rockMat = lambert();
  const rockGeos = [rockGeometry(rand, '#9c9a96'), rockGeometry(rand, '#8a8580'), rockGeometry(rand, '#a8a49c')];
  const rocks = scatter(world, rand, cfg.rocks, { minH: -1.5, maxH: 30, maxSlope: 2, avoidSpawn: 13 });
  markers.rocks = rocks;
  const rockGroups = [[], [], []];
  rocks.forEach((r, i) => rockGroups[i % 3].push(r));
  rockGroups.forEach((items, k) => {
    instanced(rockGeos[k], rockMat, items, scene, { scale: [0.4, 1.7], rand, sink: 0.25, tintRange: 0.15, shadow: true });
    items.forEach((it) => {
      if (it.s > 0.55) world.colliders.add(it.x, it.z, it.s * 0.85, it.y + it.s * 0.45);
    });
  });

  // Semak, rumput, bunga (tanpa collider)
  const bushes = scatter(world, rand, cfg.bushes, { minH: 1.3, maxH: 10, maxSlope: 0.7, avoidSpawn: 6 });
  instanced(bushGeometry(rand), lambert(), bushes, scene, { scale: [0.7, 1.4], rand, shadow: shadows });

  const grass = scatter(world, rand, Math.floor(cfg.flowers * 0.9), { minH: 1.2, maxH: 9, maxSlope: 0.8, avoidSpawn: 2.5 });
  instanced(grassGeometry(), lambert(), grass, scene, { scale: [0.8, 1.6], rand, shadow: false, tintRange: 0.25 });

  const flowers = scatter(world, rand, cfg.flowers, { minH: 1.3, maxH: 8, maxSlope: 0.6, avoidSpawn: 3 });
  instanced(flowerGeometry(), lambert(), flowers, scene, {
    scale: [0.8, 1.3], rand, shadow: false, tintRange: 0.1,
    colors: ['#ffffff', '#ffe066', '#ff8fab', '#b197fc', '#ff6b6b', '#ffa94d'],
  });

  // Awan yang bergerak pelan
  const cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#c9dcea', emissiveIntensity: 0.35, fog: false });
  const clouds = [];
  for (let i = 0; i < cfg.clouds; i++) {
    const m = new THREE.Mesh(cloudGeometry(rand), cloudMat);
    m.position.set((rand() * 2 - 1) * 230, 42 + rand() * 18, (rand() * 2 - 1) * 230);
    m.rotation.y = rand() * Math.PI;
    m.scale.setScalar(0.8 + rand() * 0.8);
    m.castShadow = shadows;
    m.userData.speed = 1 + rand() * 1.5;
    scene.add(m);
    clouds.push(m);
  }

  return {
    markers,
    update(dt, t) {
      campfire.update(t);
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 240) c.position.x = -240;
      }
    },
  };
}
