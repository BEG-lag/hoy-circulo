/**
 * Fails if any tracked text file contains the em dash character (U+2014).
 * The project style uses commas, colons, parentheses or periods instead.
 *
 *   node scripts/check-dashes.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DASH = String.fromCodePoint(0x2014);
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.pdf']);

function files(): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const offenders: string[] = [];
for (const file of files()) {
  if (BINARY.has(extname(file).toLowerCase())) continue;
  let text: string;
  try {
    text = readFileSync(resolve(ROOT, file), 'utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, i) => {
    if (line.includes(DASH)) offenders.push(`${file}:${i + 1}`);
  });
}

if (offenders.length > 0) {
  console.error(`Em dash (U+2014) found in:\n${offenders.join('\n')}`);
  process.exit(1);
}
console.log('No em dashes found.');
