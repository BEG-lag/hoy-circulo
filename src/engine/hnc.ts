/**
 * Hoy No Circula engine: given a vehicle and a day, which hours is it not
 * allowed to drive in the ZMVM, and why.
 */
import { RULES, type Suspension } from '../rules/rules.ts';
import type { SourceId } from '../rules/sources.ts';
import type { ContingencyRestriction, EffectiveStatus } from '../contingency/status.ts';
import {
  addDays,
  compareDates,
  nthWeekdayInMonth,
  parseDate,
  toLocal,
  toMinutes,
  weekdayOf,
  type LocalDate,
  type LocalInstant,
} from './dates.ts';
import { weekdayForDigit } from './plate.ts';

export type Hologram = 'E' | '00' | '0' | '1' | '2' | 'none';
/**
 * Where the plates are from:
 * - cdmx: Ciudad de México.
 * - edomex: Estado de México.
 * - megalopolis: Hidalgo, Morelos, Puebla, Querétaro, Tlaxcala, or Guanajuato
 *   (convenio de homologación), whose holograms are recognized (PVVO 2026, 14.3).
 * - other: any other state, or foreign plates.
 */
export type Origin = 'cdmx' | 'edomex' | 'megalopolis' | 'other';

export const HOLOGRAMS: readonly Hologram[] = ['00', '0', '1', '2', 'E', 'none'];
export const ORIGINS: readonly Origin[] = ['cdmx', 'edomex', 'megalopolis', 'other'];

export interface Vehicle {
  readonly hologram: Hologram;
  readonly origin: Origin;
  /** Last numeric digit of the plate (0 to 9). */
  readonly digit: number;
  /** Plates for people with disabilities. */
  readonly disabilityPlate: boolean;
  /** Valid Pase Turístico (only meaningful for `origin: 'other'`). */
  readonly touristPass: boolean;
}

export type Category =
  | 'exempt-electric'
  | 'exempt-hologram'
  | 'exempt-disability'
  | 'exempt-tourist-pass'
  | 'hologram1'
  | 'hologram2'
  | 'no-hologram-local'
  | 'no-hologram-foreign';

/** How the rules see a vehicle. Order matters: exemptions first. */
export function categorize(v: Vehicle): Category {
  if (v.disabilityPlate) return 'exempt-disability';
  if (v.hologram === 'E') return 'exempt-electric';
  if (v.origin === 'other' && v.touristPass) return 'exempt-tourist-pass';
  switch (v.hologram) {
    case '00':
    case '0':
      return 'exempt-hologram';
    case '1':
      return 'hologram1';
    case '2':
      return 'hologram2';
    case 'none':
      return v.origin === 'cdmx' ? 'no-hologram-local' : 'no-hologram-foreign';
  }
}

export type RestrictionCode = 'weekday' | 'saturday' | 'foreign-morning' | 'contingency';

export interface Restriction {
  readonly code: RestrictionCode;
  /** Minutes since local midnight, inclusive. */
  readonly from: number;
  /** Minutes since local midnight, exclusive. */
  readonly to: number;
  readonly sources: readonly SourceId[];
}

export type NoteCode =
  | 'sunday'
  | 'fifth-saturday-free'
  | 'holiday-applies'
  | 'suspended'
  | 'contingency-exempt'
  | 'contingency-free'
  | 'contingency-unknown-details'
  | 'contingency-pending'
  | 'contingency-unknown';

export interface Note {
  readonly code: NoteCode;
  readonly holiday?: string;
}

export type DayStatus = 'free' | 'restricted' | 'partial' | 'uncertain';

export interface Window {
  readonly from: number;
  readonly to: number;
}

export interface DayEvaluation {
  readonly date: LocalDate;
  /** 0 = Sunday ... 6 = Saturday. */
  readonly weekday: number;
  readonly category: Category;
  readonly restrictions: readonly Restriction[];
  /** Merged restricted windows, sorted. */
  readonly windows: readonly Window[];
  readonly status: DayStatus;
  readonly notes: readonly Note[];
  /** Holiday name (LFT art. 74) if the date is one. */
  readonly holiday: string | null;
  /** Contingency restriction that applies that day, if any. */
  readonly contingency: ContingencyRestriction | null;
}

export interface EvalContext {
  readonly contingency?: EffectiveStatus | null;
  /** Mexico City date of "today"; a pending contingency only matters for today and tomorrow. */
  readonly today?: LocalDate;
  /** Override the official suspension notices (tests). */
  readonly suspensions?: readonly Suspension[];
}

const HNC_FROM = toMinutes(RULES.hours.from);
const HNC_TO = toMinutes(RULES.hours.to);
const MORNING_FROM = toMinutes(RULES.foreignMorning.from);
const MORNING_TO = toMinutes(RULES.foreignMorning.to);

function isHnCSubject(c: Category): boolean {
  return c === 'hologram1' || c === 'hologram2' || c === 'no-hologram-local' || c === 'no-hologram-foreign';
}

/** Holiday name for a date under LFT art. 74, or null. */
export function holidayName(date: LocalDate): string | null {
  const { month, day } = parseDate(date);
  for (const h of RULES.holidays.fixed) {
    if (h.month === month && h.day === day) return h.name;
  }
  if (weekdayOf(date) === 1) {
    const nth = nthWeekdayInMonth(date);
    for (const h of RULES.holidays.mondays) {
      if (h.month === month && h.nth === nth) return h.name;
    }
  }
  return null;
}

function hncRestrictions(v: Vehicle, category: Category, date: LocalDate, notes: Note[]): Restriction[] {
  const weekday = weekdayOf(date);
  const out: Restriction[] = [];
  if (weekday === 0) {
    notes.push({ code: 'sunday' });
    return out;
  }
  if (!isHnCSubject(category)) return out;

  if (weekday >= 1 && weekday <= 5) {
    const restrictedWeekday = weekdayForDigit(v.digit);
    if (weekday === restrictedWeekday) {
      out.push({ code: 'weekday', from: HNC_FROM, to: HNC_TO, sources: RULES.weekdaySources });
    } else if (category === 'no-hologram-foreign' && (RULES.foreignMorning.weekdays as number[]).includes(weekday)) {
      out.push({ code: 'foreign-morning', from: MORNING_FROM, to: MORNING_TO, sources: RULES.foreignMorning.sources });
    }
    return out;
  }

  // Saturday
  if (category === 'hologram1') {
    const nth = nthWeekdayInMonth(date);
    const odd = v.digit % 2 === 1;
    const restOn: readonly number[] = odd ? RULES.saturdays.hologram1.oddRestOn : RULES.saturdays.hologram1.evenRestOn;
    if (restOn.includes(nth)) {
      out.push({ code: 'saturday', from: HNC_FROM, to: HNC_TO, sources: RULES.saturdays.hologram1.sources });
    } else if (nth === 5) {
      notes.push({ code: 'fifth-saturday-free' });
    }
    return out;
  }
  out.push({ code: 'saturday', from: HNC_FROM, to: HNC_TO, sources: RULES.saturdays.hologram2.sources });
  return out;
}

type ContingencyOutcome = 'restricted' | 'free' | 'exempt' | 'unknown';

function contingencyOutcome(v: Vehicle, category: Category, r: ContingencyRestriction): ContingencyOutcome {
  switch (category) {
    case 'exempt-electric':
    case 'exempt-disability':
      return 'exempt';
    case 'exempt-hologram':
      if (r.hologram0Digits === null) return 'unknown';
      return r.hologram0Digits.includes(v.digit) ? 'restricted' : 'free';
    case 'hologram1':
      if (r.hologram1Digits === null) return 'unknown';
      return r.hologram1Digits.includes(v.digit) ? 'restricted' : 'free';
    case 'hologram2':
    case 'no-hologram-local':
    case 'no-hologram-foreign':
    case 'exempt-tourist-pass':
      return r.hologram2 ? 'restricted' : 'free';
  }
}

export function mergeWindows(restrictions: readonly { from: number; to: number }[]): Window[] {
  const sorted = [...restrictions].sort((a, b) => a.from - b.from || a.to - b.to);
  const out: { from: number; to: number }[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to);
    else out.push({ from: r.from, to: r.to });
  }
  return out;
}

export function evaluateDay(v: Vehicle, date: LocalDate, ctx: EvalContext = {}): DayEvaluation {
  const category = categorize(v);
  const notes: Note[] = [];
  const holiday = holidayName(date);
  const suspensions = ctx.suspensions ?? RULES.suspensions;
  const suspended = suspensions.some((s) => s.date === date);

  let restrictions: Restriction[] = hncRestrictions(v, category, date, notes);
  if (suspended) {
    if (restrictions.length > 0 || isHnCSubject(category)) notes.push({ code: 'suspended' });
    restrictions = [];
  } else if (holiday && restrictions.length > 0) {
    notes.push({ code: 'holiday-applies', holiday });
  }

  let uncertain = false;
  let contingency: ContingencyRestriction | null = null;
  const eff = ctx.contingency;
  if (eff?.state === 'active') {
    const entry = eff.status.restrictions.find((r) => r.date === date) ?? null;
    if (entry) {
      contingency = entry;
      const outcome = contingencyOutcome(v, category, entry);
      if (outcome === 'restricted') {
        restrictions.push({
          code: 'contingency',
          from: toMinutes(entry.from),
          to: toMinutes(entry.to),
          sources: RULES.contingency.sources,
        });
      } else if (outcome === 'exempt') notes.push({ code: 'contingency-exempt' });
      else if (outcome === 'free') notes.push({ code: 'contingency-free' });
      else {
        notes.push({ code: 'contingency-unknown-details' });
        uncertain = true;
      }
    } else if (ctx.today && compareDates(date, ctx.today) >= 0 && compareDates(date, addDays(ctx.today, 1)) <= 0) {
      if (category !== 'exempt-electric' && category !== 'exempt-disability') {
        notes.push({ code: 'contingency-pending' });
        uncertain = true;
      }
    }
  } else if (eff?.state === 'unknown' && ctx.today === date) {
    notes.push({ code: 'contingency-unknown' });
  }

  const windows = mergeWindows(restrictions);
  let status: DayStatus;
  if (windows.length === 0) status = 'free';
  else {
    const full = windows.some((w) => w.from <= HNC_FROM && w.to >= HNC_TO);
    status = full ? 'restricted' : 'partial';
  }
  if (uncertain && status !== 'restricted') status = 'uncertain';

  return {
    date,
    weekday: weekdayOf(date),
    category,
    restrictions,
    windows,
    status,
    notes,
    holiday,
    contingency,
  };
}

export function evaluateDays(v: Vehicle, start: LocalDate, count: number, ctx: EvalContext = {}): DayEvaluation[] {
  return Array.from({ length: count }, (_, i) => evaluateDay(v, addDays(start, i), ctx));
}

export type NowAnswer = 'yes' | 'no' | 'uncertain';

export interface NowEvaluation {
  readonly local: LocalInstant;
  readonly day: DayEvaluation;
  readonly canDriveNow: NowAnswer;
  /** When the current window ends (minutes), if the car cannot drive now. */
  readonly until: number | null;
  /** When the next restricted window starts later today, if the car can drive now. */
  readonly nextFrom: number | null;
}

/** Can the vehicle drive at this exact instant? */
export function evaluateNow(v: Vehicle, instant: Date, ctx: EvalContext = {}): NowEvaluation {
  const local = toLocal(instant, RULES.timezone);
  const day = evaluateDay(v, local.date, { ...ctx, today: ctx.today ?? local.date });
  const current = day.windows.find((w) => local.minutes >= w.from && local.minutes < w.to);
  if (current) return { local, day, canDriveNow: 'no', until: current.to, nextFrom: null };
  const next = day.windows.find((w) => w.from > local.minutes);
  const inHours = local.minutes >= HNC_FROM && local.minutes < HNC_TO;
  const pendingToday = day.status === 'uncertain' && inHours;
  return {
    local,
    day,
    canDriveNow: pendingToday ? 'uncertain' : 'yes',
    until: null,
    nextFrom: next ? next.from : null,
  };
}
