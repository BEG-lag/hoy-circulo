/**
 * Exits 0 when two status.json files differ in anything but `checkedAt`, 1 when
 * they are equivalent. Used by the scheduled workflow to commit only real changes.
 *
 *   node scripts/status-changed.ts old.json new.json
 */
import { readFileSync } from 'node:fs';

function load(path: string | undefined): unknown {
  if (!path) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    return { ...data, checkedAt: null };
  } catch {
    return null;
  }
}

const [a, b] = process.argv.slice(2);
const changed = JSON.stringify(load(a)) !== JSON.stringify(load(b));
console.log(changed ? 'status changed' : 'status unchanged');
process.exit(changed ? 0 : 1);
