// Membuat ikon PNG PWA dari public/favicon.svg memakai Playwright (Chromium).
// Jalankan sekali: node scripts/generate-icons.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');
const maskable = readFileSync(path.join(root, 'scripts/maskable.svg'), 'utf8');

const jobs = [
  { svg, size: 192, out: 'public/icons/icon-192.png' },
  { svg, size: 512, out: 'public/icons/icon-512.png' },
  { svg: maskable, size: 512, out: 'public/icons/icon-maskable-512.png' },
  { svg: maskable, size: 180, out: 'public/icons/apple-touch-icon.png' },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const j of jobs) {
  await page.setViewportSize({ width: j.size, height: j.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${j.svg.replace('<svg ', `<svg width="${j.size}" height="${j.size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(root, j.out), omitBackground: true });
  console.log('✓', j.out);
}
await browser.close();
