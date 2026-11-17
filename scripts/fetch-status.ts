/**
 * Reads the CAMe press archive on gob.mx, finds the latest contingency
 * communiqué and writes public/status.json for the app.
 *
 *   node scripts/fetch-status.ts [--out public/status.json]
 *
 * Runs in GitHub Actions every 30 minutes (see .github/workflows/deploy.yml).
 * It never fails the build: when the source cannot be read it writes an
 * "unknown" status, and the app tells people to check the official
 * communiqué instead of guessing.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildStatus, communiquesToFetch, parseArchive } from '../src/contingency/parse.ts';
import { CAME_ARCHIVE_URL, type ContingencyStatus } from '../src/contingency/status.ts';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outArg = outIndex >= 0 ? args[outIndex + 1] : undefined;
const OUT = resolve(outArg ?? resolve(import.meta.dirname, '../public/status.json'));
const USER_AGENT = process.env.STATUS_USER_AGENT ?? 'Mozilla/5.0 (compatible; contingency-status-bot/1.0)';
const TIMEOUT_MS = 20_000;

async function get(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/javascript,*/*' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function main(): Promise<void> {
  const now = new Date();
  let status: ContingencyStatus;
  try {
    const archive = await get(`${CAME_ARCHIVE_URL}?idiom=es`);
    const items = parseArchive(archive);
    const pages = new Map<string, string>();
    for (const url of communiquesToFetch(items)) {
      try {
        pages.set(url, await get(`${url}?idiom=es`));
      } catch (error) {
        console.warn(`Could not read ${url}: ${String(error)}`);
      }
    }
    status = buildStatus(items, pages, now);
  } catch (error) {
    status = {
      schema: 1,
      checkedAt: now.toISOString(),
      state: 'unknown',
      phase: null,
      pollutant: null,
      communique: null,
      restrictions: [],
      sourceUrl: CAME_ARCHIVE_URL,
      error: `fetch-failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200),
    };
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(status, null, 2)}\n`);
  const summary = [
    `state=${status.state}`,
    status.phase ? `phase=${status.phase}` : null,
    status.communique ? `latest="${status.communique.title}" (${status.communique.date})` : null,
    `restrictions=${status.restrictions.length}`,
    status.error ? `error=${status.error}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  console.log(`status.json written: ${summary}`);
}

await main();
