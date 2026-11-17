import { describe, expect, it } from 'vitest';
import { verificationFor, verificationWindows } from '../src/engine/verification.ts';
import { vehicle } from './helpers.ts';

/** PVVO 2026, tabla 1 (both semesters), restated literally. */
const OFFICIAL: Record<number, [[number, number], [number, number]]> = {
  5: [[1, 2], [7, 8]], 6: [[1, 2], [7, 8]],
  7: [[2, 3], [8, 9]], 8: [[2, 3], [8, 9]],
  3: [[3, 4], [9, 10]], 4: [[3, 4], [9, 10]],
  1: [[4, 5], [10, 11]], 2: [[4, 5], [10, 11]],
  9: [[5, 6], [11, 12]], 0: [[5, 6], [11, 12]],
};

describe('verification windows', () => {
  it('matches the published 2026 calendar for every digit', () => {
    for (let digit = 0; digit <= 9; digit++) {
      const windows = verificationWindows(digit, '2026-01-01', 12);
      const months = windows.filter((w) => w.start.startsWith('2026')).map((w) => w.months);
      expect(months, `digit ${digit}`).toEqual(OFFICIAL[digit]);
      for (const w of windows.filter((x) => x.start.startsWith('2026'))) {
        expect(w.projected).toBe(false);
        expect(w.source).toMatch(/^pvvo2026s[12]$/);
      }
    }
  });

  it('marks 2027 windows as projections until SEDEMA publishes the program', () => {
    const windows = verificationWindows(5, '2026-11-17', 12);
    expect(windows.map((w) => [w.start, w.end, w.projected])).toEqual([
      ['2027-01-01', '2027-02-28', true],
      ['2027-07-01', '2027-08-31', true],
    ]);
  });

  it('includes the window in progress', () => {
    const windows = verificationWindows(9, '2026-11-17', 12);
    expect(windows[0]).toMatchObject({ start: '2026-11-01', end: '2026-12-31', color: 'azul', projected: false, semester: '2026-2' });
  });

  it('handles leap years', () => {
    const [w] = verificationWindows(5, '2028-01-10', 2);
    expect(w?.end).toBe('2028-02-29');
  });
});

describe('verificationFor', () => {
  it('returns the current window for a blue sticker in November 2026', () => {
    const info = verificationFor(vehicle({ digit: 0, hologram: '1' }), '2026-11-17');
    expect(info).toMatchObject({ kind: 'window', current: true, calendar: 'cdmx' });
  });

  it('returns the next window when none is open', () => {
    const info = verificationFor(vehicle({ digit: 5, hologram: '2', origin: 'edomex' }), '2026-11-17');
    expect(info).toMatchObject({ kind: 'window', current: false, calendar: 'edomex' });
    if (info.kind === 'window') expect(info.window.start).toBe('2027-01-01');
  });

  it('exempts holograma 00 and Exento, and skips plates from other states', () => {
    expect(verificationFor(vehicle({ hologram: '00' }), '2026-11-17')).toEqual({ kind: 'exempt', reason: 'hologram-00' });
    expect(verificationFor(vehicle({ hologram: 'E' }), '2026-11-17')).toEqual({ kind: 'exempt', reason: 'electric' });
    expect(verificationFor(vehicle({ origin: 'megalopolis' }), '2026-11-17')).toEqual({ kind: 'not-applicable', reason: 'origin' });
    expect(verificationFor(vehicle({ origin: 'other' }), '2026-11-17')).toEqual({ kind: 'not-applicable', reason: 'origin' });
  });
});
