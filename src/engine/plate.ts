import { RULES, type Color } from '../rules/rules.ts';

export interface PlateInfo {
  /** Uppercase, letters and digits only. */
  readonly normalized: string;
  /** Digit that drives Hoy No Circula and verification. */
  readonly digit: number;
  /** How `digit` was obtained. */
  readonly method: 'last-digit' | 'letters-only';
  /** Numeric series found in the plate, in order. */
  readonly series: readonly string[];
  /**
   * True when the plate has more than one numeric series. PVVO 2026 (5.1.3) uses
   * the last numeric digit of the plate; the 2014 decree (numeral X) mentions the
   * last digit of the first series. The UI asks the user to confirm.
   */
  readonly ambiguous: boolean;
  /** Last digit of the first numeric series, when the plate has several. */
  readonly firstSeriesDigit: number | null;
}

const MAX_LENGTH = 12;

/** Returns null for an empty or obviously invalid plate. */
export function parsePlate(raw: string): PlateInfo | null {
  const upper = raw.toUpperCase();
  const normalized = upper.replace(/[^A-Z0-9Ñ]/g, '');
  if (normalized.length === 0 || normalized.length > MAX_LENGTH) return null;
  const series = upper.match(/\d+/g) ?? [];
  if (series.length === 0) {
    return {
      normalized,
      digit: RULES.lettersOnlyPlate.digit,
      method: 'letters-only',
      series,
      ambiguous: false,
      firstSeriesDigit: null,
    };
  }
  const last = series[series.length - 1] ?? '';
  const first = series[0] ?? '';
  return {
    normalized,
    digit: Number(last[last.length - 1]),
    method: 'last-digit',
    series,
    ambiguous: series.length > 1,
    firstSeriesDigit: series.length > 1 ? Number(first[first.length - 1]) : null,
  };
}

export function colorForDigit(digit: number): Color {
  const row = RULES.weekdays.find((w) => (w.digits as readonly number[]).includes(digit));
  if (!row) throw new Error(`Invalid digit: ${digit}`);
  return row.color;
}

export function weekdayForDigit(digit: number): number {
  const row = RULES.weekdays.find((w) => (w.digits as readonly number[]).includes(digit));
  if (!row) throw new Error(`Invalid digit: ${digit}`);
  return row.weekday;
}

export function isValidDigit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9;
}
