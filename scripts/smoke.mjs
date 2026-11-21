// Smoke test di browser sungguhan: buka tiap game meja dengan bot, biarkan berjalan beberapa detik,
// gagal bila ada error di konsol / halaman atau permainan tidak bergerak.
// Jalankan: npm run smoke            (semua game)
//           npm run smoke -- pool ludo   (sebagian)
// Butuh Playwright + Chromium (tidak ikut dependensi proyek). Pasang sekali bila belum ada:
//   npm i -D playwright && npx playwright install chromium
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const GAMES = [
  // id, nama di menu, jumlah bot (meja penuh supaya jalur 3–4 pemain ikut teruji)
  ['kilat', 'Kartu Kilat', 3],
  ['catur', 'Catur', 1],
  ['dam', 'Dam', 1],
  ['ludo', 'Ludo', 3],
  ['empat', 'Empat Sejajar', 1],
  ['mancala', 'Mancala', 1],
  ['pool', 'Pool', 3],
];
const RUN_MS = Number(process.env.SMOKE_MS) || 8000; // lama tiap game berjalan

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.log('Playwright tidak ditemukan — smoke test dilewati.');
  console.log('Pasang: npm i -D playwright && npx playwright install chromium');
  process.exit(0);
}

const pick = process.argv.slice(2);
const games = pick.length ? GAMES.filter(([id]) => pick.includes(id)) : GAMES;
const shots = join(tmpdir(), 'mabarin-smoke');
mkdirSync(shots, { recursive: true });

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 5199 } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

let failed = 0;
for (const [id, name, bots] of games) {
  const t0 = Date.now();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  try {
    await page.goto(`${url}?q=low`);
    await page.fill('#name-input', 'Penguji');
    await page.click('#btn-offline');
    await page.waitForFunction(() => window.__game?.local, null, { timeout: 30000 });
    await page.keyboard.press('KeyG');
    await page.click(`#games-list .game-tile:has-text("${name}")`);
    // modal undang terbuka setelah duduk di meja → tambah bot pertama lewat tombolnya, sisanya lewat host
    await page.click('#invite-bot', { timeout: 15000 });
    await page.waitForSelector('#invite-modal', { state: 'hidden' });
    await page.evaluate((n) => {
      for (let i = 1; i < n; i++) window.__game.cards.host.addBot();
    }, bots);
    await page.click('#cu-start');
    await page.waitForFunction(() => window.__game.cards.host.state.phase === 'play', null, { timeout: 5000 });
    // semua pemain (termasuk kita) dimainkan bot, dengan jeda singkat supaya banyak langkah teruji
    const v0 = await page.evaluate(() => {
      const h = window.__game.cards.host;
      for (const p of h.state.players) p.bot = true;
      Object.defineProperty(h, 'botDelay', { get: () => 150, set() {} });
      return h.state.v;
    });
    await page.waitForTimeout(RUN_MS);
    const st = await page.evaluate(() => {
      const s = window.__game.cards.host.state;
      return { v: s.v, phase: s.phase, ranks: s.ranks.length };
    });
    if (st.v <= v0 + 2) errors.push(`permainan tidak bergerak (versi state ${v0} → ${st.v})`);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    if (errors.length) throw new Error(errors.join('\n    '));
    console.log(`✓ ${name.padEnd(14)} ${bots + 1} pemain, ${st.v - v0} pembaruan, fase ${st.phase} (${sec} dtk)`);
  } catch (e) {
    failed++;
    const file = join(shots, `${id}.png`);
    await page.screenshot({ path: file }).catch(() => {});
    console.log(`✗ ${name}\n    ${e.message.split('\n').slice(0, 8).join('\n    ')}\n    tangkapan layar: ${file}`);
  }
  await page.close();
}

await browser.close();
await server.close();
console.log(failed ? `\n${failed} game gagal.` : `\nSemua ${games.length} game lolos.`);
process.exit(failed ? 1 : 0);
