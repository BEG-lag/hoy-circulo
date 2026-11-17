/**
 * Renders the PNG app icons and the social preview from SVG with a headless
 * browser, so the repo only keeps SVG sources plus their exports.
 *
 *   node scripts/icons.ts
 *
 * Uses the locally installed Google Chrome through playwright-core (no browser
 * download). Set CHROME_PATH to use another Chromium binary.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '..');
const ICONS = resolve(ROOT, 'public/icons');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const mark = (size: number, scale: number, rounded: boolean) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#0a0c10"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="256" cy="256" r="150" fill="none" stroke="#cfff45" stroke-width="44"/>
    <circle cx="256" cy="256" r="66" fill="#cfff45"/>
  </g>
</svg>`;

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const shots: [string, string, number, number][] = [
    ['icon-192.png', mark(192, 1, false), 192, 192],
    ['icon-512.png', mark(512, 1, false), 512, 512],
    ['maskable-512.png', mark(512, 0.72, false), 512, 512],
    ['apple-touch-icon.png', mark(180, 0.9, false), 180, 180],
  ];
  for (const [name, svg, w, h] of shots) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0;background:#0a0c10">${svg}</body></html>`);
    await writeFile(resolve(ICONS, name), await page.screenshot({ type: 'png', omitBackground: false }));
  }

  // Social preview: reuse the README banner (static frame).
  const banner = await readFile(resolve(ROOT, 'assets/banner.svg'), 'utf8');
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(
    `<html><head><style>*{animation:none!important}body{margin:0;background:#0a0c10;display:grid;place-items:center;height:630px}svg{width:1200px;height:auto}</style></head><body>${banner}</body></html>`,
  );
  await page.waitForTimeout(300);
  await writeFile(resolve(ICONS, 'og.png'), await page.screenshot({ type: 'png' }));
  await browser.close();
  console.log('icons written to public/icons');
}

await main();
