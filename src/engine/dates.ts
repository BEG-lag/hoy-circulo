/**
 * Calendar helpers. Dates are plain `YYYY-MM-DD` strings in Mexico City local
 * time; all arithmetic happens on UTC midnights so the device time zone never
 * leaks in.
 */

export type LocalDate = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function parseDate(date: LocalDate): DateParts {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  const parts = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (check.getUTCMonth() !== parts.month - 1 || check.getUTCDate() !== parts.day) {
    throw new Error(`Invalid date: ${date}`);
  }
  return parts;
}

export function formatDate(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toUtc(date: LocalDate): Date {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtc(d: Date): LocalDate {
  return formatDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(date: LocalDate): number {
  return toUtc(date).getUTCDay();
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Adds calendar months, clamping the day to the end of the target month. */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const { year, month, day } = parseDate(date);
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return formatDate(y, m, Math.min(day, daysInMonth(y, m)));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Which occurrence of its weekday the date is inside its month (1 to 5). */
export function nthWeekdayInMonth(date: LocalDate): number {
  return Math.floor((parseDate(date).day - 1) / 7) + 1;
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

/** "05:00" -> 300. */
export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Invalid time: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) throw new Error(`Invalid time: ${hhmm}`);
  return h * 60 + min;
}

/** 300 -> "5:00" (no leading zero, as written in the official notices). */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export interface LocalInstant {
  readonly date: LocalDate;
  /** Minutes since local midnight. */
  readonly minutes: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** Converts an instant to wall-clock date and time in the given IANA zone. */
export function toLocal(instant: Date, timeZone: string): LocalInstant {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, fmt);
  }
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) parts[p.type] = p.value;
  const date = formatDate(Number(parts.year), Number(parts.month), Number(parts.day));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return { date, minutes };
}
