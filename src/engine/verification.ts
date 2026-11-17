/**
 * Vehicle verification windows (Programa de Verificación Vehicular Obligatoria).
 */
import { RULES, type Color, type Month } from '../rules/rules.ts';
import type { SourceId } from '../rules/sources.ts';
import { addMonths, compareDates, daysInMonth, formatDate, parseDate, type LocalDate } from './dates.ts';
import { colorForDigit } from './plate.ts';
import type { Vehicle } from './hnc.ts';

export interface VerificationWindow {
  readonly color: Color;
  /** First day of the window (inclusive). */
  readonly start: LocalDate;
  /** Last day of the window (inclusive). */
  readonly end: LocalDate;
  readonly months: readonly [Month, Month];
  /** e.g. "2026-2" for the second semester of 2026. */
  readonly semester: string;
  /** True when no published program covers it yet (the pattern is assumed to repeat). */
  readonly projected: boolean;
  readonly source: SourceId | null;
}

function windowFor(color: Color, year: number, half: 0 | 1): VerificationWindow {
  const months = RULES.verification.windows[color][half];
  const start = formatDate(year, months[0], 1);
  const end = formatDate(year, months[1], daysInMonth(year, months[1]));
  const program = RULES.verification.publishedPrograms.find(
    (p) => compareDates(p.from, start) <= 0 && compareDates(end, p.to) <= 0,
  );
  return {
    color,
    start,
    end,
    months,
    semester: `${year}-${half + 1}`,
    projected: !program,
    source: program ? program.source : null,
  };
}

/** Windows for a plate digit that end on or after `from` and start before `from + months`. */
export function verificationWindows(digit: number, from: LocalDate, months = 12): VerificationWindow[] {
  const color = colorForDigit(digit);
  const until = addMonths(from, months);
  const { year } = parseDate(from);
  const out: VerificationWindow[] = [];
  for (let y = year - 1; y <= year + Math.ceil(months / 12) + 1; y++) {
    for (const half of [0, 1] as const) {
      const w = windowFor(color, y, half);
      if (compareDates(w.end, from) >= 0 && compareDates(w.start, until) < 0) out.push(w);
    }
  }
  return out;
}

export type VerificationInfo =
  | {
      readonly kind: 'window';
      readonly window: VerificationWindow;
      /** True when today falls inside `window`. */
      readonly current: boolean;
      /** Calendar published by CDMX; Edomex runs its own program (see docs/reglas.md). */
      readonly calendar: 'cdmx' | 'edomex';
    }
  | { readonly kind: 'exempt'; readonly reason: 'hologram-00' | 'electric' }
  | { readonly kind: 'not-applicable'; readonly reason: 'origin' };

export function verificationFor(v: Vehicle, today: LocalDate): VerificationInfo {
  if (v.hologram === 'E') return { kind: 'exempt', reason: 'electric' };
  if (v.hologram === '00') return { kind: 'exempt', reason: 'hologram-00' };
  if (v.origin === 'megalopolis' || v.origin === 'other') return { kind: 'not-applicable', reason: 'origin' };
  const [first] = verificationWindows(v.digit, today, 12);
  if (!first) throw new Error('No verification window found');
  return {
    kind: 'window',
    window: first,
    current: compareDates(first.start, today) <= 0 && compareDates(today, first.end) <= 0,
    calendar: v.origin,
  };
}
