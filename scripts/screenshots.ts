/**
 * Serves the production build (dist/) and captures the README screenshots with
 * a headless browser, at a fixed date and with a fixed contingency status so the
 * images are reproducible. It also runs smoke checks: no console errors, no
 * horizontal scroll at 375 px, every form control labelled, the expected
 * verdicts, and a valid .ics download.
 *
 *   npm run build && npm run screenshots
 *
 * Uses the locally installed Google Chrome through playwright-core (no browser
 * download). Set CHROME_PATH to use another Chromium binary.
 */
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'assets/screenshots');
const BASE = '/hoy-circulo/';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
};

function serve(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (!pathname.startsWith(BASE)) {
      res.writeHead(404).end();
      return;
    }
    const rel = pathname.slice(BASE.length);
    const file = normalize(join(DIST, rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel));
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    readFile(file).then(
      (body) => res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body),
      () => res.writeHead(404).end(),
    );
  });
  return new Promise((ok) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      ok({ server, url: `http://127.0.0.1:${port}${BASE}` });
    });
  });
}

// Tuesday 17 Nov 2026, 9:30 in Mexico City (UTC-6).
const NOW = new Date('2026-11-17T09:30:00-06:00');

const CARS = [
  { id: 'car-a', name: 'Vocho', plate: 'ABC-127-D', digit: 7, hologram: '1', origin: 'cdmx', disabilityPlate: false, touristPass: false },
  { id: 'car-b', name: 'Camioneta', plate: 'NXT-4-03', digit: 3, hologram: '0', origin: 'edomex', disabilityPlate: false, touristPass: false },
];

function state(selectedId: string, lang: 'es' | 'en' = 'es') {
  return JSON.stringify({ version: 1, cars: CARS, selectedId, lang, reminders: true });
}

const STATUS_NONE = {
  schema: 1,
  checkedAt: new Date(NOW.getTime() - 12 * 60_000).toISOString(),
  sourceUrl: 'https://www.gob.mx/comisionambiental/es/archivo/prensa',
  state: 'none',
  phase: null,
  pollutant: null,
  communique: {
    title: 'SE SUSPENDE LA CONTINGENCIA AMBIENTAL ATMOSFÉRICA POR OZONO EN LA ZONA METROPOLITANA DEL VALLE DE MÉXICO (ZMVM)',
    url: 'https://www.gob.mx/comisionambiental/prensa/se-435707',
    date: '2026-09-13',
    kind: 'suspende',
  },
  restrictions: [],
  error: null,
};

/**
 * A real episode replayed: Sunday 13 Sep 2026, 9:30, with the status the script
 * built from the CAMe bulletins of 12 Sep (Fase I por ozono).
 */
const CONTINGENCY_NOW = new Date('2026-09-13T09:30:00-06:00');
const STATUS_ACTIVE = {
  ...STATUS_NONE,
  checkedAt: new Date(CONTINGENCY_NOW.getTime() - 9 * 60_000).toISOString(),
  state: 'active',
  phase: 'I',
  pollutant: 'ozono',
  communique: {
    title: 'SE MANTIENE LA FASE I DE CONTINGENCIA AMBIENTAL ATMOSFÉRICA POR OZONO EN LA ZONA METROPOLITANA DEL VALLE DE MÉXICO',
    url: 'https://www.gob.mx/comisionambiental/prensa/se-435687',
    date: '2026-09-12',
    kind: 'mantiene',
  },
  restrictions: [
    { date: '2026-09-13', from: '5:00', to: '22:00', hologram2: true, hologram1Digits: [1, 3, 5, 7, 9], hologram0Digits: [7, 8], hologram0Color: 'rosa' },
  ],
};

async function newContext(
  browser: Browser,
  url: string,
  opts: { mobile: boolean; storage: string | null; status: object | null; now?: Date; serviceWorker?: boolean },
): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  // Service workers are blocked by default so page.route can serve the fixed status.json.
  const serviceWorkers = opts.serviceWorker ? 'allow' : 'block';
  const context = await browser.newContext(
    opts.mobile
      ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', acceptDownloads: true, serviceWorkers }
      : { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, colorScheme: 'dark', acceptDownloads: true, serviceWorkers },
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(opts.now ?? NOW);
  await page.route('**/status.json', (route) =>
    opts.status ? route.fulfill({ json: opts.status }) : route.fulfill({ status: 404, body: '' }),
  );
  if (opts.storage) {
    const value = opts.storage;
    await page.addInitScript((v) => localStorage.setItem('hoy-circulo:v1', v), value);
  }
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Smoke check failed: ${message}`);
  console.log(`  ok  ${message}`);
}

async function smoke(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `${label}: no horizontal scroll (${overflow}px)`);
  const unlabelled = await page.evaluate(() =>
    [...document.querySelectorAll('input, select, button, textarea')]
      .filter((el) => {
        const e = el as HTMLInputElement;
        if (e.type === 'hidden' || e.closest('[hidden]')) return false;
        const hasLabel = e.labels && e.labels.length > 0;
        const aria = e.getAttribute('aria-label') ?? e.getAttribute('aria-labelledby');
        const text = (e.textContent as string | null)?.trim() ?? '';
        return !hasLabel && !aria && !text;
      })
      .map((e) => e.outerHTML.slice(0, 80)),
  );
  check(unlabelled.length === 0, `${label}: every control labelled ${unlabelled.join(' ')}`);
}

async function main(): Promise<void> {
  const { server, url } = await serve();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    // 1. Desktop, holograma 1 ending 7 on a Tuesday: cannot drive.
    console.log('desktop');
    {
      const { context, page, errors } = await newContext(browser, url, { mobile: false, storage: state('car-a'), status: STATUS_NONE });
      check((await page.locator('#verdict-title').innerText()).includes('NO'), 'desktop verdict says NO for ending 7 on Tuesday');
      check((await page.locator('.banner-title').innerText()).includes('Sin contingencia'), 'banner shows no contingency');
      await smoke(page, 'desktop');
      await page.screenshot({ path: join(OUT, 'desktop.png') });

      // The .ics download parses and has events.
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /calendario/i }).click()]);
      const path = await download.path();
      const ics = await readFile(path, 'utf8');
      check(ics.startsWith('BEGIN:VCALENDAR') && ics.includes('RRULE:FREQ=WEEKLY;BYDAY=TU'), 'ics download has the Tuesday rule');
      check(download.suggestedFilename() === 'hoy-circulo-vocho-abc-127-d.ics', `ics file name (${download.suggestedFilename()})`);
      check(errors.length === 0, `desktop: no console errors ${errors.join(' | ')}`);
      await context.close();
    }

    // 2. Mobile, holograma 0: can drive.
    console.log('mobile');
    {
      const { context, page, errors } = await newContext(browser, url, { mobile: true, storage: state('car-b'), status: STATUS_NONE });
      check((await page.locator('#verdict-title').innerText()).includes('SÍ'), 'mobile verdict says SÍ for holograma 0');
      await smoke(page, 'mobile');
      await page.screenshot({ path: join(OUT, 'mobile.png') });
      check(errors.length === 0, `mobile: no console errors ${errors.join(' | ')}`);
      await context.close();
    }

    // 3. Mobile, the 13 Sep 2026 Fase I contingency replayed.
    console.log('contingency');
    {
      const { context, page, errors } = await newContext(browser, url, {
        mobile: true,
        storage: state('car-a'),
        status: STATUS_ACTIVE,
        now: CONTINGENCY_NOW,
      });
      check((await page.locator('.banner-title').innerText()).includes('Fase I'), 'banner shows Fase I');
      check((await page.locator('#verdict-title').innerText()).includes('NO'), 'Sunday contingency: holograma 1 ending 7 cannot drive');
      await smoke(page, 'contingency');
      await page.screenshot({ path: join(OUT, 'contingency.png') });
      await page.getByRole('button', { name: /Camioneta/ }).click();
      check((await page.locator('#verdict-title').innerText()).includes('SÍ'), 'Sunday contingency: holograma 0 ending 3 (not rosa) can drive');
      check(errors.length === 0, `contingency: no console errors ${errors.join(' | ')}`);
      await context.close();
    }

    // 4. First visit (empty storage), mobile, form partly filled.
    console.log('first visit');
    {
      const { context, page, errors } = await newContext(browser, url, { mobile: true, storage: null, status: STATUS_NONE });
      check(await page.locator('#f1-plate').isVisible(), 'first visit shows the form');
      await page.locator('#f1-plate').fill('MXA-458-B');
      check((await page.locator('#f1-plate-detect').innerText()).includes('8'), 'plate detection shows ending 8');
      await smoke(page, 'first visit');
      await page.screenshot({ path: join(OUT, 'first-visit.png') });
      await page.getByRole('button', { name: 'Guardar' }).click();
      check(await page.locator('#f1-holo-error').isVisible(), 'saving without hologram shows an error');
      await page.locator('label.choice', { hasText: 'Dos (2)' }).click();
      await page.getByRole('button', { name: 'Guardar' }).click();
      check((await page.locator('#verdict-title').innerText()).includes('NO'), 'after saving: ending 8 on Tuesday cannot drive');
      check(errors.length === 0, `first visit: no console errors ${errors.join(' | ')}`);
      await context.close();
    }

    // 5. Offline: after the first visit the service worker serves the app.
    console.log('offline');
    {
      const { context, page, errors } = await newContext(browser, url, {
        mobile: true,
        storage: state('car-a'),
        status: STATUS_NONE,
        serviceWorker: true,
      });
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.reload();
      await page.waitForLoadState('networkidle');
      check(await page.evaluate(() => navigator.serviceWorker.controller !== null), 'service worker controls the page');
      await context.setOffline(true);
      await page.reload();
      check((await page.locator('#verdict-title').innerText()).includes('NO'), 'offline reload still answers from cache');
      check((await page.locator('#banner-root').innerText()).includes('Sin conexión'), 'offline banner says so');
      check(errors.filter((e) => !e.includes('ERR_INTERNET_DISCONNECTED')).length === 0, `offline: no console errors ${errors.join(' | ')}`);
      await context.close();
    }

    // 6. English.
    console.log('english');
    {
      const { context, page } = await newContext(browser, url, { mobile: false, storage: state('car-a', 'en'), status: null });
      check((await page.locator('#verdict-title').innerText()).includes('CANNOT'), 'English verdict');
      check((await page.locator('.banner-title').innerText()).includes('could not confirm'), 'missing status.json shows the unknown banner');
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log('screenshots written to assets/screenshots');
}

await main();
