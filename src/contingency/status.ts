/**
 * Shape of `public/status.json`, written by scripts/fetch-status.ts from the
 * CAMe communiqués and read by the app. Everything here is defensive: the file
 * comes over the network and may be stale, missing or malformed.
 */
import type { Color } from '../rules/rules.ts';
import type { LocalDate } from '../engine/dates.ts';

export type ContingencyState = 'none' | 'preventive' | 'active' | 'unknown';
export type CommuniqueKind = 'activa' | 'mantiene' | 'suspende' | 'preventiva' | 'otro';
export type Pollutant = 'ozono' | 'particulas' | 'combinada';

export interface ContingencyRestriction {
  /** Day the vehicle restrictions apply (Mexico City). */
  readonly date: LocalDate;
  readonly from: string;
  readonly to: string;
  /** Holograma 2 (and cars treated like it) cannot drive. */
  readonly hologram2: boolean;
  /** Plate endings of holograma 1 that cannot drive; null if the text could not be read. */
  readonly hologram1Digits: readonly number[] | null;
  /** Plate endings of holograma 0 and 00 that cannot drive; null if unknown. */
  readonly hologram0Digits: readonly number[] | null;
  readonly hologram0Color: Color | null;
}

export interface Communique {
  readonly title: string;
  readonly url: string;
  readonly date: LocalDate;
  readonly kind: CommuniqueKind;
}

export interface ContingencyStatus {
  readonly schema: 1;
  /** Last successful read of the official source (ISO 8601). */
  readonly checkedAt: string | null;
  readonly state: ContingencyState;
  readonly phase: 'I' | 'II' | null;
  readonly pollutant: Pollutant | null;
  readonly communique: Communique | null;
  readonly restrictions: readonly ContingencyRestriction[];
  readonly sourceUrl: string;
  readonly error: string | null;
}

export const CAME_ARCHIVE_URL = 'https://www.gob.mx/comisionambiental/es/archivo/prensa';

/** A status older than this is not trusted. */
export const MAX_STATUS_AGE_MINUTES = 180;

export type UnknownReason = 'missing' | 'invalid' | 'stale' | 'source-error' | 'unparsed';

export interface EffectiveStatus {
  readonly status: ContingencyStatus;
  readonly state: ContingencyState;
  readonly unknownReason: UnknownReason | null;
  readonly ageMinutes: number | null;
}

export function emptyStatus(error: string | null = null): ContingencyStatus {
  return {
    schema: 1,
    checkedAt: null,
    state: 'unknown',
    phase: null,
    pollutant: null,
    communique: null,
    restrictions: [],
    sourceUrl: CAME_ARCHIVE_URL,
    error,
  };
}

const COLORS: readonly Color[] = ['amarillo', 'rosa', 'rojo', 'verde', 'azul'];
const STATES: readonly ContingencyState[] = ['none', 'preventive', 'active', 'unknown'];
const KINDS: readonly CommuniqueKind[] = ['activa', 'mantiene', 'suspende', 'preventiva', 'otro'];
const POLLUTANTS: readonly Pollutant[] = ['ozono', 'particulas', 'combinada'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function digits(v: unknown): readonly number[] | null | undefined {
  if (v === null) return null;
  if (!Array.isArray(v)) return undefined;
  if (!v.every((d) => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 9)) return undefined;
  return v as number[];
}

function parseRestriction(v: unknown): ContingencyRestriction | null {
  if (!isRecord(v)) return null;
  const { date, from, to, hologram2, hologram0Color } = v;
  if (typeof date !== 'string' || !DATE_RE.test(date)) return null;
  if (typeof from !== 'string' || !TIME_RE.test(from)) return null;
  if (typeof to !== 'string' || !TIME_RE.test(to)) return null;
  if (typeof hologram2 !== 'boolean') return null;
  const h1 = digits(v.hologram1Digits);
  const h0 = digits(v.hologram0Digits);
  if (h1 === undefined || h0 === undefined) return null;
  const color = typeof hologram0Color === 'string' && (COLORS as string[]).includes(hologram0Color)
    ? (hologram0Color as Color)
    : null;
  return { date, from, to, hologram2, hologram1Digits: h1, hologram0Digits: h0, hologram0Color: color };
}

/** Validates untrusted JSON. Returns null when it is not a usable status. */
export function parseStatus(raw: unknown): ContingencyStatus | null {
  if (!isRecord(raw) || raw.schema !== 1) return null;
  const state = raw.state;
  if (typeof state !== 'string' || !(STATES as string[]).includes(state)) return null;
  const checkedAt = typeof raw.checkedAt === 'string' && !Number.isNaN(Date.parse(raw.checkedAt)) ? raw.checkedAt : null;
  const phase = raw.phase === 'I' || raw.phase === 'II' ? raw.phase : null;
  const pollutant =
    typeof raw.pollutant === 'string' && (POLLUTANTS as string[]).includes(raw.pollutant)
      ? (raw.pollutant as Pollutant)
      : null;
  let communique: Communique | null = null;
  if (isRecord(raw.communique)) {
    const c = raw.communique;
    if (
      typeof c.title === 'string' &&
      typeof c.url === 'string' &&
      c.url.startsWith('https://www.gob.mx/') &&
      typeof c.date === 'string' &&
      DATE_RE.test(c.date) &&
      typeof c.kind === 'string' &&
      (KINDS as string[]).includes(c.kind)
    ) {
      communique = { title: c.title, url: c.url, date: c.date, kind: c.kind as CommuniqueKind };
    }
  }
  const restrictions = Array.isArray(raw.restrictions)
    ? raw.restrictions.map(parseRestriction).filter((r): r is ContingencyRestriction => r !== null)
    : [];
  return {
    schema: 1,
    checkedAt,
    state: state as ContingencyState,
    phase,
    pollutant,
    communique,
    restrictions,
    sourceUrl: CAME_ARCHIVE_URL,
    error: typeof raw.error === 'string' ? raw.error : null,
  };
}

/**
 * Decides what the app may say. A stale, missing or failed status is "unknown":
 * the app then tells the user to check the official CAMe announcement.
 */
export function effectiveStatus(
  raw: unknown,
  now: Date,
  maxAgeMinutes: number = MAX_STATUS_AGE_MINUTES,
): EffectiveStatus {
  if (raw === undefined || raw === null) {
    return { status: emptyStatus(), state: 'unknown', unknownReason: 'missing', ageMinutes: null };
  }
  const status = parseStatus(raw);
  if (!status) return { status: emptyStatus(), state: 'unknown', unknownReason: 'invalid', ageMinutes: null };
  if (!status.checkedAt) return { status, state: 'unknown', unknownReason: 'missing', ageMinutes: null };
  const ageMinutes = Math.floor((now.getTime() - Date.parse(status.checkedAt)) / 60_000);
  if (ageMinutes > maxAgeMinutes || ageMinutes < -10) {
    return { status, state: 'unknown', unknownReason: 'stale', ageMinutes };
  }
  if (status.state === 'unknown') {
    return { status, state: 'unknown', unknownReason: status.error ? 'source-error' : 'unparsed', ageMinutes };
  }
  return { status, state: status.state, unknownReason: null, ageMinutes };
}
