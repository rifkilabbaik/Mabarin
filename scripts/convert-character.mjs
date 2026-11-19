// Mengubah model karakter dasar (assets/character-base.glb) menjadi modul data JS
// (src/character/baseMesh.js) supaya karakter bisa dibuat langsung tanpa memuat file.
// Jalankan: node scripts/convert-character.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = new URL('../assets/character-base.glb', import.meta.url);
const OUT = new URL('../src/character/baseMesh.js', import.meta.url);
const Z_CENTER = 0.06; // geser badan ke tengah sumbu z (model asli sedikit maju)

const buf = readFileSync(SRC);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const accessor = (i) => {
  const a = gltf.accessors[i];
  const bv = gltf.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
  const off = binStart + (bv.byteOffset || 0) + (a.byteOffset || 0);
  const T = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType];
  return new T(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + a.count * n * T.BYTES_PER_ELEMENT));
};

const prim = gltf.meshes[0].primitives[0];
const idx = accessor(prim.indices);
const pos = accessor(prim.attributes.POSITION);
const node = gltf.nodes.find((n) => n.mesh === 0);
const s = node.scale?.[0] ?? 1, t = node.translation || [0, 0, 0];

// terapkan transform node lalu normalisasi: kaki di y = 0, simetris di x
const P = [];
for (let i = 0; i < pos.length; i += 3) P.push([pos[i] * s + t[0], pos[i + 1] * s + t[1], pos[i + 2] * s + t[2]]);
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const p of P) for (let k = 0; k < 3; k++) {
  min[k] = Math.min(min[k], p[k]);
  max[k] = Math.max(max[k], p[k]);
}
const cx = (min[0] + max[0]) / 2;
for (const p of P) {
  p[0] -= cx;
  p[1] -= min[1];
  p[2] -= Z_CENTER;
}

// las vertex yang posisinya sama (pecahan dari ekspor FBX)
const map = new Map(), uniq = [], remap = [];
P.forEach((p, i) => {
  const key = p.map((v) => Math.round(v * 1e5)).join(',');
  if (!map.has(key)) {
    map.set(key, uniq.length);
    uniq.push(p);
  }
  remap[i] = map.get(key);
});
// Arah segitiga di model asli campur aduk (sebagian terbalik). Samakan dengan normal yang
// tersimpan di file: bila normal geometris berlawanan dengan normal vertex, balik urutannya.
const nrm = accessor(prim.attributes.NORMAL);
const tris = [];
let flipped = 0;
for (let i = 0; i < idx.length; i += 3) {
  const [i0, i1, i2] = [idx[i], idx[i + 1], idx[i + 2]];
  const p0 = P[i0], p1 = P[i1], p2 = P[i2];
  const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  let dot = 0;
  for (const v of [i0, i1, i2]) dot += g[0] * nrm[v * 3] + g[1] * nrm[v * 3 + 1] + g[2] * nrm[v * 3 + 2];
  const a = remap[i0], b = remap[i1], c = remap[i2];
  if (a === b || b === c || a === c) continue;
  if (dot < 0) {
    tris.push(a, c, b);
    flipped++;
  } else tris.push(a, b, c);
}
console.log(`segitiga dibalik: ${flipped}`);

const f32 = new Float32Array(uniq.flat());
const u16 = new Uint16Array(tris);
const b64 = (arr) => Buffer.from(arr.buffer).toString('base64');
writeFileSync(
  OUT,
  `// DIBUAT OTOMATIS oleh scripts/convert-character.mjs dari assets/character-base.glb — jangan diedit manual.
// Model: "Character Base" oleh madtrollstudio (lihat README, bagian Kredit).
// Satuan meter, kaki di y = 0, menghadap +z, pose A. ${uniq.length} vertex, ${tris.length / 3} segitiga.
const dec = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
export const BASE_HEIGHT = ${(max[1] - min[1]).toFixed(4)};
export const BASE_POSITIONS = new Float32Array(dec('${b64(f32)}'));
export const BASE_INDICES = new Uint16Array(dec('${b64(u16)}'));
`
);
console.log(`ok: ${uniq.length} vertex, ${tris.length / 3} segitiga, tinggi ${(max[1] - min[1]).toFixed(3)} m`);
