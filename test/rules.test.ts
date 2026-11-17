import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RULES } from '../src/rules/rules.ts';
import { SOURCES } from '../src/rules/sources.ts';

describe('rules data integrity', () => {
  it('assigns each digit to exactly one weekday, Monday to Friday', () => {
    const digits = RULES.weekdays.flatMap((w) => [...w.digits]).sort();
    expect(digits).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(RULES.weekdays.map((w) => w.weekday)).toEqual([1, 2, 3, 4, 5]);
  });

  it('pairs digits so each color has one odd and one even ending', () => {
    for (const w of RULES.weekdays) {
      const parities = w.digits.map((d) => d % 2).sort();
      expect(parities).toEqual([0, 1]);
    }
  });

  it('splits holograma 1 Saturdays between odd and even endings', () => {
    const { oddRestOn, evenRestOn } = RULES.saturdays.hologram1;
    expect([...oddRestOn, ...evenRestOn].sort()).toEqual([1, 2, 3, 4]);
  });

  it('has consecutive two-month verification windows covering each month twice a year at most', () => {
    const count = new Map<number, number>();
    for (const pairs of Object.values(RULES.verification.windows)) {
      for (const [a, b] of pairs) {
        expect(b - a).toBe(1);
        count.set(a, (count.get(a) ?? 0) + 1);
        count.set(b, (count.get(b) ?? 0) + 1);
      }
    }
    // Jan, Jun, Jul and Dec belong to one color; the others to two.
    expect(count.get(1)).toBe(1);
    expect(count.get(6)).toBe(1);
    expect(count.get(7)).toBe(1);
    expect(count.get(12)).toBe(1);
    expect(count.get(3)).toBe(2);
  });

  it('lists 16 alcaldías and 18 municipios', () => {
    expect(RULES.area.cdmx).toHaveLength(16);
    expect(RULES.area.edomex).toHaveLength(18);
  });

  it('only points to official https sources that are cited in docs/reglas.md', () => {
    const doc = readFileSync(resolve(import.meta.dirname, '../docs/reglas.md'), 'utf8');
    for (const [id, s] of Object.entries(SOURCES)) {
      expect(s.url, id).toMatch(/^https:\/\/[^/]*\.gob\.mx\//);
      expect(doc, `docs/reglas.md should cite ${id}`).toContain(s.url);
      expect(s.consulted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
