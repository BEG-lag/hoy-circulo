/**
 * iCalendar (RFC 5545) export: no-drive days as recurring events (RRULE) for
 * the next N months, plus the verification windows as all-day events.
 *
 * Mexico City has used a fixed UTC-6 offset all year since the 2022 Ley de los
 * Husos Horarios abolished daylight saving time, so the VTIMEZONE below has a
 * single STANDARD component.
 */
import { RULES, type Color, type Suspension } from '../rules/rules.ts';
import { addDays, addMonths, compareDates, parseDate, toLocal, toMinutes, weekdayOf, type LocalDate } from '../engine/dates.ts';
import { categorize, type Vehicle } from '../engine/hnc.ts';
import { weekdayForDigit } from '../engine/plate.ts';
import { verificationFor, verificationWindows } from '../engine/verification.ts';

export type Lang = 'es' | 'en';

export interface IcsOptions {
  readonly vehicle: Vehicle;
  /** Stable id used to build event UIDs. */
  readonly vehicleId: string;
  /** Human label, e.g. "Mi auto (ABC-123)". */
  readonly label: string;
  /** First day to cover (Mexico City date). */
  readonly start: LocalDate;
  readonly months?: number;
  /** Generation instant (DTSTAMP). */
  readonly now: Date;
  readonly reminders?: boolean;
  readonly lang?: Lang;
  /** Official suspension notices (defaults to RULES.suspensions). */
  readonly suspensions?: readonly Suspension[];
}

const TZID = RULES.timezone;
const UTC_OFFSET_HOURS = 6;
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

const TEXT = {
  es: {
    calName: (label: string) => `Hoy No Circula: ${label}`,
    noDrive: (label: string) => `No circula: ${label}`,
    morning: (label: string) => `No circula de 5:00 a 11:00: ${label}`,
    verify: (label: string, color: string) => `Verificación vehicular: ${label} (engomado ${color})`,
    weekdayWhy: (color: string, digits: string) => `Día de restricción por engomado ${color} (terminación ${digits}).`,
    saturdayH1: (parity: string, which: string) => `Holograma 1, terminación ${parity}: no circula el ${which} sábado de cada mes.`,
    saturdayAll: 'No circula ningún sábado (holograma 2 o sin holograma reconocido).',
    morningWhy: 'Placas foráneas sin holograma reconocido: además, de lunes a viernes de 5:00 a 11:00.',
    hours: 'Horario: de 5:00 a 22:00.',
    odd: 'impar',
    even: 'par',
    firstThird: '1.er y 3.er',
    secondFourth: '2.º y 4.º',
    verifyWhy: (months: string) => `Periodo para verificar: ${months}.`,
    projected: 'Proyección: el programa de ese semestre aún no se publica; confirma las fechas en SEDEMA.',
    edomex: 'Calendario publicado por la CDMX; el Estado de México publica su propio programa. Confírmalo con la SMA del Edomex.',
    footer: (date: string) =>
      `Generado con hoy-circulo (no oficial) el ${date}. Las reglas pueden cambiar y las contingencias ambientales agregan restricciones que no aparecen aquí. Consulta los avisos oficiales de SEDEMA y de la CAMe.`,
    alarmNoDrive: (label: string) => `Mañana no circula ${label} (de 5:00 a 22:00).`,
    alarmVerify: (label: string) => `Recuerda verificar ${label}.`,
    colors: { amarillo: 'amarillo', rosa: 'rosa', rojo: 'rojo', verde: 'verde', azul: 'azul' } as Record<Color, string>,
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    and: 'y',
  },
  en: {
    calName: (label: string) => `Hoy No Circula: ${label}`,
    noDrive: (label: string) => `No driving: ${label}`,
    morning: (label: string) => `No driving 5:00 to 11:00: ${label}`,
    verify: (label: string, color: string) => `Emissions check: ${label} (${color} sticker)`,
    weekdayWhy: (color: string, digits: string) => `Restricted weekday for the ${color} sticker (plates ending in ${digits}).`,
    saturdayH1: (parity: string, which: string) => `Hologram 1, ${parity} plate ending: no driving on the ${which} Saturday of each month.`,
    saturdayAll: 'No driving on any Saturday (hologram 2 or no recognized hologram).',
    morningWhy: 'Out-of-area plates without a recognized hologram: also Monday to Friday, 5:00 to 11:00.',
    hours: 'Hours: 5:00 to 22:00.',
    odd: 'odd',
    even: 'even',
    firstThird: '1st and 3rd',
    secondFourth: '2nd and 4th',
    verifyWhy: (months: string) => `Verification window: ${months}.`,
    projected: 'Projection: the program for that semester is not published yet; confirm the dates with SEDEMA.',
    edomex: 'Calendar published by Mexico City; the State of Mexico publishes its own program. Confirm it with the Edomex SMA.',
    footer: (date: string) =>
      `Generated with hoy-circulo (unofficial) on ${date}. Rules can change, and environmental contingencies add restrictions that are not shown here. Check the official announcements of SEDEMA and CAMe.`,
    alarmNoDrive: (label: string) => `Tomorrow ${label} cannot be driven (5:00 to 22:00).`,
    alarmVerify: (label: string) => `Remember the emissions check for ${label}.`,
    colors: { amarillo: 'yellow', rosa: 'pink', rojo: 'red', verde: 'green', azul: 'blue' } as Record<Color, string>,
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    and: 'and',
  },
} as const;

/** Escapes a TEXT value (RFC 5545, 3.3.11). */
export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets without splitting UTF-8 sequences (RFC 5545, 3.1). */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (size + n > limit) {
      parts.push(current);
      current = '';
      size = 0;
      limit = 74; // continuation lines start with a space
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function compactDate(date: LocalDate): string {
  return date.replace(/-/g, '');
}

function localDateTime(date: LocalDate, hhmm: string): string {
  const minutes = toMinutes(hhmm);
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${compactDate(date)}T${h}${m}00`;
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** UNTIL in UTC for the end of a local day (RFC 5545 requires UTC when DTSTART has a TZID). */
function untilUtc(lastLocalDay: LocalDate): string {
  const { year, month, day } = parseDate(lastLocalDay);
  const d = new Date(Date.UTC(year, month - 1, day, 23 + UTC_OFFSET_HOURS, 59, 59));
  return utcStamp(d);
}

function firstMatching(start: LocalDate, predicate: (d: LocalDate) => boolean, limitDays = 62): LocalDate | null {
  for (let i = 0; i < limitDays; i++) {
    const d = addDays(start, i);
    if (predicate(d)) return d;
  }
  return null;
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function icsFileName(label: string): string {
  return `hoy-circulo-${slug(label) || 'auto'}.ics`;
}

interface EventSpec {
  uid: string;
  summary: string;
  description: string;
  lines: string[];
  alarm?: { trigger: string; text: string } | undefined;
}

export function buildIcs(opts: IcsOptions): string {
  const lang: Lang = opts.lang ?? 'es';
  const t = TEXT[lang];
  const months = opts.months ?? 12;
  const reminders = opts.reminders ?? true;
  const v = opts.vehicle;
  const category = categorize(v);
  const end = addDays(addMonths(opts.start, months), -1);
  const until = untilUtc(end);
  const stamp = utcStamp(opts.now);
  const generatedOn = opts.now.toISOString().slice(0, 10);
  const footer = t.footer(generatedOn);
  const uidBase = slug(opts.vehicleId) || 'auto';
  const events: EventSpec[] = [];
  const hncSubject =
    category === 'hologram1' || category === 'hologram2' || category === 'no-hologram-local' || category === 'no-hologram-foreign';

  const suspensions = opts.suspensions ?? RULES.suspensions;
  const exdates = (time: string, weekdays: readonly number[]) =>
    suspensions
      .filter((s) => compareDates(s.date, opts.start) >= 0 && compareDates(s.date, end) <= 0)
      .filter((s) => weekdays.includes(weekdayOf(s.date)))
      .map((s) => `EXDATE;TZID=${TZID}:${localDateTime(s.date, time)}`);

  const alarm = reminders ? { trigger: '-PT8H', text: t.alarmNoDrive(opts.label) } : undefined;

  if (hncSubject) {
    // Weekday
    const weekday = weekdayForDigit(v.digit);
    const first = firstMatching(opts.start, (d) => weekdayOf(d) === weekday);
    const row = RULES.weekdays.find((w) => w.weekday === weekday);
    if (first && row && compareDates(first, end) <= 0) {
      events.push({
        uid: `${uidBase}-weekday-${compactDate(first)}@hoy-circulo`,
        summary: t.noDrive(opts.label),
        description: [t.weekdayWhy(t.colors[row.color], row.digits.join(` ${t.and} `)), t.hours, footer].join('\n'),
        lines: [
          `DTSTART;TZID=${TZID}:${localDateTime(first, RULES.hours.from)}`,
          `DTEND;TZID=${TZID}:${localDateTime(first, RULES.hours.to)}`,
          `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[weekday] ?? ''};UNTIL=${until}`,
          ...exdates(RULES.hours.from, [weekday]),
        ],
        alarm,
      });
    }

    // Saturdays
    if (category === 'hologram1') {
      const odd = v.digit % 2 === 1;
      const nths: readonly number[] = odd ? RULES.saturdays.hologram1.oddRestOn : RULES.saturdays.hologram1.evenRestOn;
      const firstSat = firstMatching(
        opts.start,
        (d) => weekdayOf(d) === 6 && nths.includes(Math.floor((parseDate(d).day - 1) / 7) + 1),
      );
      if (firstSat && compareDates(firstSat, end) <= 0) {
        events.push({
          uid: `${uidBase}-saturday-${compactDate(firstSat)}@hoy-circulo`,
          summary: t.noDrive(opts.label),
          description: [t.saturdayH1(odd ? t.odd : t.even, odd ? t.firstThird : t.secondFourth), t.hours, footer].join('\n'),
          lines: [
            `DTSTART;TZID=${TZID}:${localDateTime(firstSat, RULES.hours.from)}`,
            `DTEND;TZID=${TZID}:${localDateTime(firstSat, RULES.hours.to)}`,
            `RRULE:FREQ=MONTHLY;BYDAY=${nths.map((n) => `${n}SA`).join(',')};UNTIL=${until}`,
            ...exdates(RULES.hours.from, [6]),
          ],
          alarm,
        });
      }
    } else {
      const firstSat = firstMatching(opts.start, (d) => weekdayOf(d) === 6);
      if (firstSat && compareDates(firstSat, end) <= 0) {
        events.push({
          uid: `${uidBase}-saturday-${compactDate(firstSat)}@hoy-circulo`,
          summary: t.noDrive(opts.label),
          description: [t.saturdayAll, t.hours, footer].join('\n'),
          lines: [
            `DTSTART;TZID=${TZID}:${localDateTime(firstSat, RULES.hours.from)}`,
            `DTEND;TZID=${TZID}:${localDateTime(firstSat, RULES.hours.to)}`,
            `RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=${until}`,
            ...exdates(RULES.hours.from, [6]),
          ],
          alarm,
        });
      }
    }

    // Morning restriction for out-of-area plates without a recognized hologram
    if (category === 'no-hologram-foreign') {
      const days = (RULES.foreignMorning.weekdays as readonly number[]).filter((d) => d !== weekday);
      const firstMorning = firstMatching(opts.start, (d) => days.includes(weekdayOf(d)));
      if (firstMorning && compareDates(firstMorning, end) <= 0) {
        events.push({
          uid: `${uidBase}-morning-${compactDate(firstMorning)}@hoy-circulo`,
          summary: t.morning(opts.label),
          description: [t.morningWhy, footer].join('\n'),
          lines: [
            `DTSTART;TZID=${TZID}:${localDateTime(firstMorning, RULES.foreignMorning.from)}`,
            `DTEND;TZID=${TZID}:${localDateTime(firstMorning, RULES.foreignMorning.to)}`,
            `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => BYDAY[d] ?? '').join(',')};UNTIL=${until}`,
            ...exdates(RULES.foreignMorning.from, days),
          ],
          alarm: undefined,
        });
      }
    }
  }

  // Verification windows
  const info = verificationFor(v, opts.start);
  if (info.kind === 'window') {
    for (const w of verificationWindows(v.digit, opts.start, months)) {
      const monthsText = `${t.months[w.months[0] - 1] ?? ''} ${t.and} ${t.months[w.months[1] - 1] ?? ''} ${w.end.slice(0, 4)}`;
      const notes = [t.verifyWhy(monthsText)];
      if (w.projected) notes.push(t.projected);
      if (info.calendar === 'edomex') notes.push(t.edomex);
      notes.push(footer);
      events.push({
        uid: `${uidBase}-verificacion-${compactDate(w.start)}@hoy-circulo`,
        summary: t.verify(opts.label, t.colors[w.color]),
        description: notes.join('\n'),
        lines: [`DTSTART;VALUE=DATE:${compactDate(w.start)}`, `DTEND;VALUE=DATE:${compactDate(addDays(w.end, 1))}`, 'TRANSP:TRANSPARENT'],
        alarm: reminders ? { trigger: 'PT9H', text: t.alarmVerify(opts.label) } : undefined,
      });
    }
  }

  const out: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//hoy-circulo//Hoy No Circula ZMVM//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(t.calName(opts.label))}`,
    `X-WR-TIMEZONE:${TZID}`,
    'BEGIN:VTIMEZONE',
    `TZID:${TZID}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    `TZOFFSETFROM:-0${UTC_OFFSET_HOURS}00`,
    `TZOFFSETTO:-0${UTC_OFFSET_HOURS}00`,
    'TZNAME:CST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
  for (const e of events) {
    out.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, ...e.lines);
    out.push(`SUMMARY:${escapeText(e.summary)}`, `DESCRIPTION:${escapeText(e.description)}`);
    if (e.alarm) {
      out.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${e.alarm.trigger}`, `DESCRIPTION:${escapeText(e.alarm.text)}`, 'END:VALARM');
    }
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.map(foldLine).join('\r\n') + '\r\n';
}

/** Mexico City date for an instant. */
export function todayInMexicoCity(now: Date): LocalDate {
  return toLocal(now, TZID).date;
}
