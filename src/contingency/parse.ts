/**
 * Reads the official CAMe communiqués published on gob.mx and turns them into a
 * `ContingencyStatus`. There is no API: the press archive is an HTML fragment
 * wrapped in JavaScript, and each communiqué is a page with a fixed template.
 * Every step is conservative; anything that cannot be read becomes `null`, and
 * the app then tells the user to check the communiqué.
 *
 * Runs in Node (scripts/fetch-status.ts) and in tests; no DOM APIs.
 */
import { RULES, type Color } from '../rules/rules.ts';
import { addDays, formatDate, parseDate, type LocalDate } from '../engine/dates.ts';
import {
  CAME_ARCHIVE_URL,
  type Communique,
  type CommuniqueKind,
  type ContingencyRestriction,
  type ContingencyStatus,
  type Pollutant,
} from './status.ts';

export const GOB_MX = 'https://www.gob.mx';

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
  ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", laquo: '"', raquo: '"',
  iexcl: '¡', iquest: '¿', ndash: '-', mdash: '-', hellip: '...', deg: '°', ordm: 'º', ordf: 'ª',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(parseInt(name.slice(1), 10));
    return ENTITIES[name] ?? match;
  });
}

/** HTML to plain text, one paragraph per line. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|li|h\d|div|section|tr)>|<br\s*\/?>/gi, '\n');
  const text = decodeEntities(withBreaks.replace(/<[^>]+>/g, ' '));
  return text
    .split('\n')
    .map((l) => l.replace(/[\s\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Lowercase, no accents, single spaces: for matching only. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[“”"]/g, '"')
    .replace(/[ \t\u00a0]+/g, ' ');
}

export interface ArchiveItem {
  readonly title: string;
  /** Absolute URL of the communiqué. */
  readonly url: string;
  /** Publication time as written by gob.mx (Mexico City local time), "YYYY-MM-DD HH:MM:SS". */
  readonly published: string;
  readonly date: LocalDate;
}

/** Unwraps the `$("#prensa").append("...")` JavaScript returned by the archive. */
function unescapeJs(js: string): string {
  return js
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\(["'/\\])/g, '$1');
}

export function parseArchive(js: string): ArchiveItem[] {
  const html = unescapeJs(js);
  const items: ArchiveItem[] = [];
  const re = /<time datetime="(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?::\d{2})?"[\s\S]*?<h2>([\s\S]*?)<\/h2>[\s\S]*?href="([^"]+)"/g;
  for (const m of html.matchAll(re)) {
    const [, date = '', time = '', rawTitle = '', href = ''] = m;
    const path = href.startsWith('http') ? href : `${GOB_MX}${href.startsWith('/') ? '' : '/'}${href}`;
    let url: URL;
    try {
      url = new URL(path);
    } catch {
      continue;
    }
    if (url.origin !== GOB_MX) continue;
    url.searchParams.delete('idiom');
    items.push({
      title: htmlToText(rawTitle).replace(/\n/g, ' '),
      url: url.toString(),
      published: `${date} ${time}:00`,
      date,
    });
  }
  return items;
}

/** Classifies a communiqué title; null when it is not about a contingency. */
export function classifyTitle(title: string): CommuniqueKind | null {
  const t = fold(title);
  if (!/contingencia|fase preventiva/.test(t)) return null;
  if (/suspende|se levanta|concluye/.test(t)) return 'suspende';
  if (/preventiva/.test(t)) return 'preventiva';
  if (/se activa|activa la|se activo/.test(t)) return 'activa';
  if (/se mantiene|continua|permanece|persiste/.test(t)) return 'mantiene';
  return 'otro';
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function digitsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\b(\d)\b/g)) {
    const d = Number(m[1]);
    if (!out.includes(d)) out.push(d);
  }
  return out.sort((a, b) => a - b);
}

export interface CommuniqueDetails {
  readonly phase: 'I' | 'II' | null;
  readonly pollutant: Pollutant | null;
  readonly restriction: ContingencyRestriction | null;
}

/**
 * Reads phase, pollutant and the private-car restrictions from a communiqué page.
 * `publishedDate` resolves "hoy" / "mañana" and the year.
 */
export function parseCommunique(html: string, publishedDate: LocalDate): CommuniqueDetails {
  const text = htmlToText(html);
  const folded = fold(text);

  let phase: 'I' | 'II' | null = null;
  const phaseMatch = /\bfase (ii|i|2|1)\b/.exec(folded);
  if (phaseMatch) phase = phaseMatch[1] === 'ii' || phaseMatch[1] === '2' ? 'II' : 'I';

  let pollutant: Pollutant | null = null;
  if (/combinada/.test(folded)) pollutant = 'combinada';
  else if (/por ozono/.test(folded)) pollutant = 'ozono';
  else if (/por particulas|pm ?10|pm ?2\.?5/.test(folded)) pollutant = 'particulas';

  return { phase, pollutant, restriction: parseRestriction(folded, publishedDate) };
}

function parseRestriction(folded: string, publishedDate: LocalDate): ContingencyRestriction | null {
  const start = folded.indexOf('restricciones a la circulacion');
  if (start < 0) return null;
  const endIdx = folded.indexOf('exenciones', start);
  const block = folded.slice(start, endIdx > start ? endIdx : undefined);
  const lines = block.split('\n');

  const dateRe =
    /\b(hoy|manana)\s+(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)?\s*(\d{1,2})\s+de\s+([a-z]+)/;
  const dateMatch = dateRe.exec(block);
  if (!dateMatch) return null;
  const [, rel = '', dayText = '', monthName = ''] = dateMatch;
  const month = MONTHS.indexOf(monthName) + 1;
  if (month === 0) return null;
  const day = Number(dayText);
  const expected = rel === 'hoy' ? publishedDate : addDays(publishedDate, 1);
  const exp = parseDate(expected);
  let date: LocalDate;
  if (exp.month === month && exp.day === day) date = expected;
  else {
    const pub = parseDate(publishedDate);
    const year = month < pub.month - 6 ? pub.year + 1 : pub.year;
    try {
      date = formatDate(year, month, day);
      parseDate(date);
    } catch {
      return null;
    }
  }

  const hours = /de las (\d{1,2}:\d{2}) a las (\d{1,2}:\d{2})/.exec(block);
  const from = hours?.[1] ?? '5:00';
  const to = hours?.[2] ?? '22:00';

  let hologram2 = false;
  let hologram1Digits: number[] | null = null;
  let hologram0Digits: number[] | null = null;
  let hologram0Color: Color | null = null;

  for (const line of lines) {
    if (!line.includes('holograma')) continue;
    const isTaxi = /\btaxis?\b/.test(line);
    if (isTaxi) continue;
    const h00 = /holograma de verificacion "?0"? y "?00"?/.exec(line);
    if (h00) {
      const after = line.slice(h00.index + h00[0].length);
      const colorMatch = /engomado (amarillo|rosa|rojo|verde|azul)/.exec(after);
      hologram0Color = colorMatch ? (colorMatch[1] as Color) : null;
      const term = after.search(/terminacion|digito/);
      const digits = term >= 0 ? digitsIn(after.slice(term)) : [];
      hologram0Digits = digits.length > 0 ? digits : null;
      if (hologram0Digits === null && hologram0Color) {
        const color = hologram0Color;
        const row = RULES.weekdays.find((w) => w.color === color);
        hologram0Digits = row ? [...row.digits].sort((a, b) => a - b) : null;
      }
      continue;
    }
    const h1 = /holograma de verificacion "?1"?(?![\d"])/.exec(line);
    if (h1 && /uso particular/.test(line)) {
      const digits = digitsIn(line.slice(h1.index + h1[0].length));
      hologram1Digits = digits.length > 0 ? digits : null;
      continue;
    }
    if (/holograma de verificacion "?2"?(?![\d"])/.test(line) && /uso particular/.test(line)) hologram2 = true;
  }

  return { date, from, to, hologram2, hologram1Digits, hologram0Digits, hologram0Color };
}

/** Time-ordered key ("YYYY-MM-DD HH:MM:SS" sorts as a string). */
function newestFirst(a: ArchiveItem, b: ArchiveItem): number {
  return a.published < b.published ? 1 : a.published > b.published ? -1 : 0;
}

/** An active contingency without a new communiqué for this long is treated as unknown. */
export const MAX_SILENCE_HOURS = 36;

function hoursBetween(published: string, now: Date): number {
  // gob.mx prints Mexico City local time; Mexico City is UTC-6 all year since 2022.
  const t = Date.parse(`${published.replace(' ', 'T')}-06:00`);
  return (now.getTime() - t) / 3_600_000;
}

/** Contingency communiqués only, newest first. */
export function contingencyItems(items: readonly ArchiveItem[]): (ArchiveItem & { kind: CommuniqueKind })[] {
  return items
    .map((i) => ({ ...i, kind: classifyTitle(i.title) }))
    .filter((i): i is ArchiveItem & { kind: CommuniqueKind } => i.kind !== null && i.kind !== 'otro')
    .sort(newestFirst);
}

/** URLs of the communiqués whose details are needed: the current run of activa/mantiene. */
export function communiquesToFetch(items: readonly ArchiveItem[]): string[] {
  const list = contingencyItems(items);
  const out: string[] = [];
  for (const item of list) {
    if (item.kind === 'activa' || item.kind === 'mantiene') {
      out.push(item.url);
      if (item.kind === 'activa' || out.length >= 4) break;
    } else break;
  }
  return out;
}

/**
 * Builds the status from the archive items and the HTML of the communiqués that
 * were fetched (keyed by URL). `communiquesToFetch` lists the URLs it needs.
 */
export function buildStatus(
  items: readonly ArchiveItem[],
  pages: ReadonlyMap<string, string>,
  now: Date,
): ContingencyStatus {
  const base = {
    schema: 1 as const,
    checkedAt: now.toISOString(),
    sourceUrl: CAME_ARCHIVE_URL,
  };
  if (items.length === 0) {
    return { ...base, state: 'unknown', phase: null, pollutant: null, communique: null, restrictions: [], error: 'archive-empty' };
  }
  const list = contingencyItems(items);
  const latest = list[0];
  if (!latest) {
    return { ...base, state: 'none', phase: null, pollutant: null, communique: null, restrictions: [], error: null };
  }
  const communique: Communique = { title: latest.title, url: latest.url, date: latest.date, kind: latest.kind };
  if (latest.kind === 'suspende') {
    return { ...base, state: 'none', phase: null, pollutant: null, communique, restrictions: [], error: null };
  }
  if (latest.kind === 'preventiva') {
    return { ...base, state: 'preventive', phase: null, pollutant: null, communique, restrictions: [], error: null };
  }

  if (hoursBetween(latest.published, now) > MAX_SILENCE_HOURS) {
    return { ...base, state: 'unknown', phase: null, pollutant: null, communique, restrictions: [], error: 'active-but-silent' };
  }

  const byDate = new Map<LocalDate, ContingencyRestriction>();
  let phase: 'I' | 'II' | null = null;
  let pollutant: Pollutant | null = null;
  let error: string | null = null;
  // Oldest first, so newer communiqués overwrite the same date.
  const run = communiquesToFetch(items);
  for (const url of [...run].reverse()) {
    const item = list.find((i) => i.url === url);
    const html = pages.get(url);
    if (!item || html === undefined) {
      error = 'communique-not-fetched';
      continue;
    }
    const details = parseCommunique(html, item.date);
    phase = details.phase ?? phase;
    pollutant = details.pollutant ?? pollutant;
    if (details.restriction) byDate.set(details.restriction.date, details.restriction);
    else if (url === latest.url) error = 'restrictions-not-parsed';
  }
  const restrictions = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { ...base, state: 'active', phase, pollutant, communique, restrictions, error };
}
