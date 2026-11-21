import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';
import { L as PL, W as PW, POCKETS, CUSHIONS } from '../tablegames/pool/physics.js';
import { woodMaterial } from '../tablegames/boardKit.js';

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

// ---------- Meja pool 9 kaki (di area olahraga) ----------
// Ukuran & lubang sama persis dengan fisika (src/tablegames/pool/physics.js).
const POOL_H = 0.79; // tinggi kain
const CUSH_W = 0.05; // lebar bantalan
const RAIL_W = 0.12; // lebar pinggiran kayu
const OUT_X = PL / 2 + CUSH_W + RAIL_W;
const OUT_Z = PW / 2 + CUSH_W + RAIL_W;

function clothTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1f8a4c';
  g.fillRect(0, 0, 256, 256);
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 3);
  return t;
}

function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#2b1d12';
  g.lineWidth = 5;
  for (let k = -128; k <= 256; k += 24) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 128, 128);
    g.moveTo(k + 128, 0);
    g.lineTo(k, 128);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1.5);
  return t;
}

/** Bentuk 2D (bidang meja dilihat dari atas: x → x, y → -z) di-extrude ke atas setinggi h mulai dari y0. */
function extrudeTop(shape, h, y0, opts = {}) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 20, ...opts });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

const rectShape = (x0, z0, x1, z1) => {
  const sh = new THREE.Shape();
  sh.moveTo(x0, -z0);
  sh.lineTo(x1, -z0);
  sh.lineTo(x1, -z1);
  sh.lineTo(x0, -z1);
  sh.lineTo(x0, -z0);
  return sh;
};

/**
 * Tutup lubang: persegi panjang (dalam koordinat u = sx·x, v = sz·z) dikurangi lingkaran lubang
 * yang memotong tepi dalamnya. edges: 'corner' (memotong tepi u0 & v0) atau 'side' (memotong tepi v0).
 */
function capShape(kind, sx, sz, u0, v0, u1, v1, hu, hv, r) {
  const pts = [];
  const arc = (a0, a1) => {
    for (let k = 0; k <= 14; k++) {
      const a = a0 + ((a1 - a0) * k) / 14;
      pts.push([hu + Math.cos(a) * r, hv + Math.sin(a) * r]);
    }
  };
  if (kind === 'corner') {
    const vTop = hv + Math.sqrt(r * r - (u0 - hu) ** 2);
    const uRight = hu + Math.sqrt(r * r - (v0 - hv) ** 2);
    pts.push([uRight, v0], [u1, v0], [u1, v1], [u0, v1], [u0, vTop]);
    arc(Math.atan2(vTop - hv, u0 - hu), Math.atan2(v0 - hv, uRight - hu));
  } else {
    const uc = Math.sqrt(r * r - (v0 - hv) ** 2);
    pts.push([u0, v0], [-uc, v0]);
    arc(Math.atan2(v0 - hv, -uc), Math.atan2(v0 - hv, uc));
    pts.push([u1, v0], [u1, v1], [u0, v1]);
  }
  const sh = new THREE.Shape();
  pts.forEach(([u, v], k) => (k ? sh.lineTo(sx * u, -sz * v) : sh.moveTo(sx * u, -sz * v)));
  sh.closePath();
  return sh;
}

const holePath = (x, z, r) => {
  const h = new THREE.Path();
  h.absarc(x, -z, r, 0, Math.PI * 2, true);
  return h;
};

function poolTableModel() {
  const g = new THREE.Group();
  const H = POOL_H;
  const oak = woodMaterial({ base: '#c4914f', dark: '#8a5a26', light: '#e2b77a', seed: 21 }, 0.6);
  const oakDark = woodMaterial({ base: '#a87536', dark: '#6e4519', light: '#c99558', seed: 23 }, 0.6);
  const black = new THREE.MeshLambertMaterial({ color: '#141414' });
  const cloth = new THREE.MeshLambertMaterial({ map: clothTexture() });
  const cushionMat = new THREE.MeshLambertMaterial({ color: '#1a7a42' });
  const chrome = new THREE.MeshStandardMaterial({ color: '#d9dde3', metalness: 1, roughness: 0.22 });
  const add = (geo, mat, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // kain (slate) dengan lubang tembus di keenam lubang
  const bed = rectShape(-OUT_X + 0.01, -OUT_Z + 0.01, OUT_X - 0.01, OUT_Z - 0.01);
  for (const p of POCKETS) bed.holes.push(holePath(p.hx, p.hz, p.r));
  add(extrudeTop(bed, 0.035, H - 0.035), cloth, false);
  // bantalan hijau: hidung bantalan = garis fisika, ujungnya mengikuti sudut jaw
  const jawDir = new Map();
  for (const p of POCKETS) {
    jawDir.set(`${p.ax.toFixed(4)},${p.az.toFixed(4)}`, p.jawA);
    jawDir.set(`${p.bx.toFixed(4)},${p.bz.toFixed(4)}`, p.jawB);
  }
  for (const c of CUSHIONS) {
    if (!c.rail) continue;
    const ax = c.ax, az = c.az, bx = c.ax + c.ux * c.len, bz = c.az + c.uz * c.len;
    const nx = c.uz, nz = -c.ux; // arah keluar (menjauhi meja)
    const out = (ax * nx + az * nz) > 0 ? 1 : -1;
    const ox = nx * out, oz = nz * out;
    const back = (x, z) => {
      const d = jawDir.get(`${x.toFixed(4)},${z.toFixed(4)}`) || [ox, oz];
      const k = CUSH_W / Math.max(0.2, d[0] * ox + d[1] * oz);
      return [x + d[0] * k, z + d[1] * k];
    };
    const [a2x, a2z] = back(ax, az), [b2x, b2z] = back(bx, bz);
    const sh = new THREE.Shape();
    sh.moveTo(ax, -az);
    sh.lineTo(bx, -bz);
    sh.lineTo(b2x, -b2z);
    sh.lineTo(a2x, -a2z);
    sh.lineTo(ax, -az);
    add(extrudeTop(sh, 0.045, H - 0.005), cushionMat);
  }
  // pinggiran kayu (di antara tutup lubang)
  const capIn = 0.02, capS = 0.11;
  const railY = H - 0.035, railH = 0.08;
  for (const sz of [-1, 1]) {
    for (const [x0, x1] of [[-(PL / 2 - capIn), -capS], [capS, PL / 2 - capIn]]) {
      const z0 = sz > 0 ? PW / 2 + CUSH_W : -OUT_Z, z1 = sz > 0 ? OUT_Z : -PW / 2 - CUSH_W;
      add(extrudeTop(rectShape(x0, z0, x1, z1), railH, railY), oak);
    }
  }
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? PL / 2 + CUSH_W : -OUT_X, x1 = sx > 0 ? OUT_X : -PL / 2 - CUSH_W;
    add(extrudeTop(rectShape(x0, -(PW / 2 - capIn), x1, PW / 2 - capIn), railH, railY), oak);
  }
  // tutup lubang hitam (sudut & tengah) dengan lubang bundar
  for (const p of POCKETS) {
    const sx = Math.sign(p.nx) || 1, sz = Math.sign(p.nz);
    const sh = p.corner
      ? capShape('corner', sx, sz, PL / 2 - capIn, PW / 2 - capIn, OUT_X, OUT_Z, sx * p.hx, sz * p.hz, p.r + 0.004)
      : capShape('side', 1, sz, -capS, PW / 2 + CUSH_W, capS, OUT_Z, p.hx, sz * p.hz, p.r + 0.004);
    add(extrudeTop(sh, railH + 0.006, railY), black);
  }
  // badan meja (apron) dengan lekukan di bawah lubang untuk keranjang bola
  const ap = new THREE.Shape();
  const ax = OUT_X - 0.012, az = OUT_Z - 0.012, n = 0.23, sw = 0.12, sd = 0.2;
  const pts = [
    [-ax + n, -az], [-sw, -az], [-sw, -az + sd], [sw, -az + sd], [sw, -az], [ax - n, -az], [ax - n, -az + n], [ax, -az + n],
    [ax, az - n], [ax - n, az - n], [ax - n, az], [sw, az], [sw, az - sd], [-sw, az - sd], [-sw, az], [-ax + n, az],
    [-ax + n, az - n], [-ax, az - n], [-ax, -az + n], [-ax + n, -az + n],
  ];
  pts.forEach(([x, z], k) => (k ? ap.lineTo(x, -z) : ap.moveTo(x, -z)));
  ap.lineTo(pts[0][0], -pts[0][1]);
  add(extrudeTop(ap, 0.2, H - 0.245), oakDark);
  // kaki meruncing berujung krom
  const legH = H - 0.245 - 0.04;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = add(new THREE.CylinderGeometry(0.11, 0.07, legH, 4, 1).rotateY(Math.PI / 4), oak);
    leg.position.set(sx * (PL / 2 - 0.28), 0.04 + legH / 2, sz * (PW / 2 - 0.14));
    const foot = add(new THREE.CylinderGeometry(0.045, 0.052, 0.04, 18), chrome);
    foot.position.set(sx * (PL / 2 - 0.28), 0.02, sz * (PW / 2 - 0.14));
  }
  // lubang berongga + keranjang jaring tempat bola terkumpul
  const net = new THREE.MeshLambertMaterial({ map: netTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const cupMat = new THREE.MeshLambertMaterial({ color: '#0d0d0d', side: THREE.DoubleSide });
  for (const p of POCKETS) {
    const cup = add(new THREE.CylinderGeometry(p.r, p.r * 0.95, 0.1, 20, 1, true), cupMat, false);
    cup.position.set(p.hx, H - 0.035 - 0.05, p.hz);
    const basket = add(new THREE.SphereGeometry(p.r + 0.012, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), net, false);
    basket.position.set(p.hx, H - 0.135, p.hz);
    const rim = add(new THREE.TorusGeometry(p.r + 0.012, 0.006, 6, 20).rotateX(Math.PI / 2), black, false);
    rim.position.set(p.hx, H - 0.135, p.hz);
  }
  return g;
}

function buildPoolTables(world, markers) {
  const model = poolTableModel();
  for (const [cx, cz] of CONFIG.sports.poolTables || []) {
    const y = world.getHeight(cx, cz);
    const m = model.clone();
    m.position.set(cx, y, cz);
    world.scene.add(m);
    for (const dx of [-1.0, 0, 1.0]) world.colliders.add(cx + dx, cz, 0.84, y + POOL_H + 0.05);
    const index = markers.cardTables.length + markers.poolTables.length;
    markers.poolTables.push({
      index,
      kind: 'pool',
      x: cx,
      z: cz,
      y: y + POOL_H, // tinggi kain
      ground: y,
      // tempat berdiri saat menunggu giliran (di samping meja, di luar garis bidik)
      seats: [
        { x: cx - 0.3, z: cz + (OUT_Z + 1.5), y, rot: Math.PI },
        { x: cx + 0.3, z: cz - (OUT_Z + 1.5), y, rot: 0 },
        { x: cx - (OUT_X + 1.3), z: cz - 0.45, y, rot: Math.PI / 2 },
        { x: cx + (OUT_X + 1.3), z: cz + 0.45, y, rot: -Math.PI / 2 },
      ],
    });
  }
}

// ---------- Meja persegi besar (Juragan): papan 1,2 m, HP & kartu hak milik di tepi meja ----------
export const SQUARE_HALF = 0.95; // setengah sisi daun meja
function buildSquareTables(world, markers) {
  const H = SQUARE_HALF;
  const top = merge([
    prep(new THREE.BoxGeometry(H * 2, 0.07, H * 2).translate(0, 0.755, 0), '#9a6331'),
    prep(new THREE.BoxGeometry(H * 2 - 0.12, 0.006, H * 2 - 0.12).translate(0, 0.791, 0), '#2d5e46'),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => prep(new THREE.BoxGeometry(0.09, 0.72, 0.09).translate(sx * (H - 0.12), 0.36, sz * (H - 0.12)), '#6b4226')),
    prep(new THREE.BoxGeometry(H * 2 - 0.2, 0.06, 0.05).translate(0, 0.66, H - 0.12), '#6b4226'),
    prep(new THREE.BoxGeometry(H * 2 - 0.2, 0.06, 0.05).translate(0, 0.66, -H + 0.12), '#6b4226'),
  ]);
  const stool = merge([
    prep(new THREE.CylinderGeometry(0.24, 0.22, 0.08, 8).translate(0, 0.42, 0), '#c08552'),
    prep(new THREE.CylinderGeometry(0.06, 0.08, 0.4, 5).translate(0, 0.2, 0), '#6b4226'),
  ]);
  const mat = lambert();
  for (const [cx, cz] of CONFIG.sports.squareTables || []) {
    const y = world.getHeight(cx, cz);
    const t = new THREE.Mesh(top, mat);
    t.position.set(cx, y, cz);
    t.castShadow = t.receiveShadow = true;
    world.scene.add(t);
    world.colliders.add(cx, cz, H + 0.05, y + 0.8);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) world.colliders.add(cx + sx * (H - 0.3), cz + sz * (H - 0.3), 0.42, y + 0.8);
    const seats = [];
    // kursi di tengah tiap sisi; urutan memutar (kursi 0 & 2 berhadapan)
    for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const sx = cx + dx * (H + 0.38), sz = cz + dz * (H + 0.38);
      const sy = world.getHeight(sx, sz);
      const m = new THREE.Mesh(stool, mat);
      m.position.set(sx, sy, sz);
      m.castShadow = m.receiveShadow = true;
      world.scene.add(m);
      seats.push({ x: sx, z: sz, y: sy + 0.46, rot: Math.atan2(cx - sx, cz - sz), locked: true });
    }
    const index = markers.cardTables.length + markers.poolTables.length + markers.squareTables.length;
    markers.squareTables.push({ index, kind: 'square', x: cx, z: cz, y: y + 0.794, half: H, seats });
  }
}

export function buildProps(world, rand) {
  const cfg = CONFIG.world;
  const scene = world.scene;
  const shadows = world.quality !== 'low';

  // Penanda untuk peta (src/ui/MapView.js)
  const markers = { pines: [], rounds: [], rocks: [], tents: [], benches: [], cardTables: [], poolTables: [], squareTables: [], campfire: { x: 0, z: 0 } };
  const campfire = buildCampfire(world, rand, markers);
  buildCardTables(world, markers);
  buildPoolTables(world, markers);
  buildSquareTables(world, markers);

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
