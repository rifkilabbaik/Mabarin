import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createNoise2D, fbm, mulberry32 } from './noise.js';
import { clamp, lerp, smoothstep } from '../utils/math.js';
import { Colliders } from './Colliders.js';
import { buildProps } from './props.js';

const SKY_TOP = new THREE.Color('#3d8fe0');
const SKY_HORIZON = new THREE.Color('#bfe3f7');
const SUN_DIR = new THREE.Vector3(0.55, 0.75, 0.35).normalize();

export class World {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.quality = quality;
    const cfg = CONFIG.world;
    this.size = cfg.size;
    this.half = cfg.size / 2;
    this.segments = cfg.segments;
    this.cell = cfg.size / cfg.segments;
    this.waterLevel = cfg.waterLevel;
    this.noise = createNoise2D(cfg.seed);
    this.colliders = new Colliders(4);
    this.time = 0;

    this.buildHeightfield();
    this.buildTerrainMesh();
    this.buildWater();
    this.buildSky();
    this.buildLights();
    this.props = buildProps(this, mulberry32(cfg.seed + 7));

    scene.fog = new THREE.Fog(SKY_HORIZON.clone(), 70, 260);
  }

  // ---------- Heightfield ----------
  sampleNoiseHeight(x, z) {
    const n = this.noise;
    const r = Math.hypot(x, z);
    const coast = r / this.half + n(x * 0.02 + 100, z * 0.02 - 40) * 0.12;

    let h = fbm(n, x * 0.011, z * 0.011, 4) * 5 + 3.5;
    const ridge = 1 - Math.abs(n(x * 0.008 + 50, z * 0.008 - 30));
    const mountainMask = smoothstep(0.05, 0.55, n(x * 0.0055 - 70, z * 0.0055 + 20));
    h += ridge * ridge * ridge * 19 * mountainMask;

    // area spawn (api unggun) dibuat datar
    h = lerp(2.2, h, smoothstep(11, 24, r));

    const island = smoothstep(0.98, 0.62, coast);
    return lerp(-7, h, island);
  }

  buildHeightfield() {
    const n = this.segments + 1;
    this.heights = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -this.half + i * this.cell;
        const z = -this.half + j * this.cell;
        this.heights[j * n + i] = this.sampleNoiseHeight(x, z);
      }
    }
  }

  h(i, j) {
    const n = this.segments + 1;
    i = clamp(i, 0, this.segments);
    j = clamp(j, 0, this.segments);
    return this.heights[j * n + i];
  }

  // Tinggi tanah persis mengikuti segitiga mesh (agar kaki karakter tidak melayang/tenggelam).
  getHeight(x, z) {
    const fx = (x + this.half) / this.cell;
    const fz = (z + this.half) / this.cell;
    if (fx < 0 || fz < 0 || fx >= this.segments || fz >= this.segments) return -7;
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const h00 = this.h(i, j), h10 = this.h(i + 1, j), h01 = this.h(i, j + 1), h11 = this.h(i + 1, j + 1);
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  getSlope(x, z) {
    const dx = this.getHeight(x + 0.7, z) - this.getHeight(x - 0.7, z);
    const dz = this.getHeight(x, z + 0.7) - this.getHeight(x, z - 0.7);
    return Math.hypot(dx, dz) / 1.4;
  }

  // ---------- Terrain ----------
  terrainColor(h, ny, x, z, out) {
    const n = this.noise;
    if (h < -1.2) out.set('#b89f6a');
    else if (h < 1.1) out.set('#ecd9a0');
    else if (ny < 0.7 && h > 3) out.set('#8f8a82');
    else if (h < 8) {
      const t = smoothstep(-0.4, 0.5, n(x * 0.045 + 12, z * 0.045 - 8));
      out.set('#86cf62').lerp(_tmpC.set('#5fae4e'), t);
    } else if (h < 12.5) out.set('#55964a');
    else if (h < 16.5) out.set('#9a948b');
    else out.set('#f3f6f8');
    return out;
  }

  buildTerrainMesh() {
    const seg = this.segments;
    const tris = seg * seg * 2;
    const pos = new Float32Array(tris * 9);
    const col = new Float32Array(tris * 9);
    const rand = mulberry32(CONFIG.world.seed + 3);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
    const color = new THREE.Color();
    let p = 0;

    const pushTri = (ax, az, bx, bz, cx, cz) => {
      a.set(ax, this.getHeightAtGrid(ax, az), az);
      b.set(bx, this.getHeightAtGrid(bx, bz), bz);
      c.set(cx, this.getHeightAtGrid(cx, cz), cz);
      e1.subVectors(b, a); e2.subVectors(c, a);
      nrm.crossVectors(e1, e2).normalize();
      const avgH = (a.y + b.y + c.y) / 3;
      this.terrainColor(avgH, nrm.y, (ax + bx + cx) / 3, (az + bz + cz) / 3, color);
      const jitter = 0.94 + rand() * 0.1;
      color.multiplyScalar(jitter);
      for (const v of [a, b, c]) {
        pos[p] = v.x; pos[p + 1] = v.y; pos[p + 2] = v.z;
        col[p] = color.r; col[p + 1] = color.g; col[p + 2] = color.b;
        p += 3;
      }
    };

    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const x0 = -this.half + i * this.cell, x1 = x0 + this.cell;
        const z0 = -this.half + j * this.cell, z1 = z0 + this.cell;
        pushTri(x0, z0, x0, z1, x1, z0); // segitiga 1 (tx + tz <= 1)
        pushTri(x0, z1, x1, z1, x1, z0); // segitiga 2
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals(); // non-indexed => normal per face (flat)
    geo.computeBoundingSphere();

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.terrain.name = 'terrain';
    this.scene.add(this.terrain);

    // Dasar laut di luar pulau supaya air tidak "tembus" ke langit.
    const seabed = new THREE.Mesh(
      new THREE.PlaneGeometry(this.size * 4, this.size * 4),
      new THREE.MeshLambertMaterial({ color: '#2f7f96' })
    );
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.y = -7.2;
    this.scene.add(seabed);
  }

  getHeightAtGrid(x, z) {
    const i = Math.round((x + this.half) / this.cell);
    const j = Math.round((z + this.half) / this.cell);
    return this.h(i, j);
  }

  // ---------- Air ----------
  buildWater() {
    const size = this.size * 3;
    const seg = this.quality === 'low' ? 60 : 100;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    const mat = new THREE.MeshPhongMaterial({
      color: '#3aa7d8',
      specular: '#bfe9ff',
      shininess: 60,
      flatShading: true,
      transparent: true,
      opacity: 0.78,
    });
    this.waterUniforms = { uTime: { value: 0 } };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.waterUniforms.uTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
         float w = sin(position.x * 0.16 + uTime * 1.1) * 0.22
                 + cos(position.y * 0.19 + uTime * 0.8) * 0.22
                 + sin((position.x + position.y) * 0.07 + uTime * 0.5) * 0.18;
         transformed.z += w;`
      );
    };
    this.water = new THREE.Mesh(geo, mat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = this.waterLevel;
    this.water.name = 'water';
    this.scene.add(this.water);
  }

  // ---------- Langit ----------
  buildSky() {
    const geo = new THREE.SphereGeometry(450, 24, 12);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: SKY_TOP },
        horizonColor: { value: SKY_HORIZON },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        varying vec3 vDir;
        void main() {
          float h = max(vDir.y, 0.0);
          vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    this.sun = new THREE.Mesh(
      new THREE.IcosahedronGeometry(14, 1),
      new THREE.MeshBasicMaterial({ color: '#fff6d6', fog: false })
    );
    this.scene.add(this.sun);
  }

  // ---------- Cahaya ----------
  buildLights() {
    const hemi = new THREE.HemisphereLight('#d7efff', '#7a9a5a', 1.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff1d6', 2.7);
    sun.castShadow = true;
    const mapSize = this.quality === 'low' ? 1024 : 2048;
    sun.shadow.mapSize.set(mapSize, mapSize);
    const s = 38;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 260 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    this.sunLight = sun;
    this.shadowTexel = (2 * s) / mapSize;
  }

  spawnPoint(rand = Math.random) {
    const a = rand() * Math.PI * 2;
    const r = 4.5 + rand() * 2.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    return new THREE.Vector3(x, this.getHeight(x, z), z);
  }

  update(dt, focus, camera) {
    this.time += dt;
    this.waterUniforms.uTime.value = this.time;

    // Bayangan mengikuti pemain, di-snap ke texel agar tidak berkedip.
    const t = this.shadowTexel;
    const fx = Math.round(focus.x / t) * t, fz = Math.round(focus.z / t) * t;
    this.sunLight.target.position.set(fx, focus.y, fz);
    this.sunLight.position.set(fx + SUN_DIR.x * 120, focus.y + SUN_DIR.y * 120, fz + SUN_DIR.z * 120);

    this.sky.position.copy(camera.position);
    this.sun.position.copy(camera.position).addScaledVector(SUN_DIR, 380);

    this.props.update(dt, this.time);
  }
}

const _tmpC = new THREE.Color();
