import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween } from '../src/engine/dates.ts';
import { evaluateDay, type Vehicle } from '../src/engine/hnc.ts';
import { buildIcs, escapeText, foldLine, icsFileName, todayInMexicoCity } from '../src/ics/ics.ts';
import { ALL_HOLOGRAMS, ALL_ORIGINS, vehicle } from './helpers.ts';

const START = '2026-11-17';
const NOW = new Date('2026-11-17T18:00:00Z');

function parse(ics: string): ICAL.Component {
  const comp = new ICAL.Component(ICAL.parse(ics) as unknown[]);
  const vtz = comp.getFirstSubcomponent('vtimezone');
  if (vtz) ICAL.TimezoneService.register(vtz);
  return comp;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Expands every timed (no-drive) event into "YYYY-MM-DD from-to" strings. */
function expandNoDrive(ics: string): string[] {
  const comp = parse(ics);
  const out: string[] = [];
  for (const ve of comp.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(ve);
    if (event.startDate.isDate) continue;
    const durationMin = (event.endDate.toUnixTime() - event.startDate.toUnixTime()) / 60;
    const it = event.iterator();
    for (;;) {
      const next = it.next() as ICAL.Time | null;
      if (!next) break;
      const date = `${next.year}-${pad(next.month)}-${pad(next.day)}`;
      const from = next.hour * 60 + next.minute;
      out.push(`${date} ${from}-${from + durationMin}`);
    }
  }
  return out.sort();
}

function expectedNoDrive(v: Vehicle, start: string, months = 12): string[] {
  const days = daysBetween(start, addMonths(start, months));
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    for (const r of evaluateDay(v, date).restrictions) {
      if (r.code === 'foreign-morning' && evaluateDay(v, date).restrictions.some((x) => x.code === 'weekday')) continue;
      out.push(`${date} ${r.from}-${r.to}`);
    }
  }
  return out.sort();
}

describe('ICS export', () => {
  it('expands to exactly the no-drive days of the engine, for every hologram x origin x digit', () => {
    let calendars = 0;
    for (const hologram of ALL_HOLOGRAMS) {
      for (const origin of ALL_ORIGINS) {
        for (let digit = 0; digit <= 9; digit++) {
          const v = vehicle({ hologram, origin, digit });
          const ics = buildIcs({ vehicle: v, vehicleId: 'car-1', label: 'Mi auto', start: START, now: NOW });
          expect(expandNoDrive(ics), `${hologram} ${origin} ${digit}`).toEqual(expectedNoDrive(v, START));
          calendars++;
        }
      }
    }
    expect(calendars).toBe(240);
  });

  it('also matches when starting on a Saturday or at a month end', () => {
    for (const start of ['2026-11-21', '2027-01-31', '2026-12-31']) {
      for (const digit of [3, 4]) {
        const v = vehicle({ hologram: '1', digit });
        const ics = buildIcs({ vehicle: v, vehicleId: 'x', label: 'x', start, now: NOW });
        expect(expandNoDrive(ics)).toEqual(expectedNoDrive(v, start));
      }
    }
  });

  it('produces a valid, well-formed calendar', () => {
    const ics = buildIcs({
      vehicle: vehicle({ hologram: 'none', origin: 'other', digit: 7 }),
      vehicleId: 'Auto de Ana',
      label: 'Auto de Ana (ABC-123)',
      start: START,
      now: NOW,
    });
    expect(ics.endsWith('\r\n')).toBe(true);
    const lines = ics.split('\r\n').slice(0, -1);
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      expect(line.includes('\n')).toBe(false);
    }
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.at(-1)).toBe('END:VCALENDAR');
    const comp = parse(ics);
    expect(comp.getFirstPropertyValue('version')).toBe('2.0');
    expect(String(comp.getFirstPropertyValue('prodid'))).toContain('hoy-circulo');
    const events = comp.getAllSubcomponents('vevent');
    expect(events.length).toBe(3); // weekday, Saturdays, mornings (no verification for out-of-area plates)
    const uids = new Set<string>();
    for (const e of events) {
      const uid = String(e.getFirstPropertyValue('uid'));
      expect(uid).toMatch(/@hoy-circulo$/);
      uids.add(uid);
      expect(e.getFirstPropertyValue('dtstamp')).toBeTruthy();
      expect(e.getFirstPropertyValue('summary')).toBeTruthy();
      const rrule = e.getFirstPropertyValue('rrule') as ICAL.Recur | null;
      expect(rrule?.until?.zone).toBe(ICAL.Timezone.utcTimezone);
    }
    expect(uids.size).toBe(events.length);
  });

  it('adds verification windows as all-day events and flags projections', () => {
    const ics = buildIcs({ vehicle: vehicle({ hologram: '1', digit: 5 }), vehicleId: 'a', label: 'Auto', start: START, now: NOW });
    const comp = parse(ics);
    const allDay = comp
      .getAllSubcomponents('vevent')
      .map((e) => new ICAL.Event(e))
      .filter((e) => e.startDate.isDate);
    expect(allDay.map((e) => [e.startDate.toString(), e.endDate.toString()])).toEqual([
      ['2027-01-01', '2027-03-01'],
      ['2027-07-01', '2027-09-01'],
    ]);
    expect(allDay[0]?.description).toContain('Proyección');
    expect(allDay[0]?.summary).toContain('engomado amarillo');
  });

  it('notes the Edomex calendar caveat', () => {
    const ics = buildIcs({ vehicle: vehicle({ origin: 'edomex', digit: 9 }), vehicleId: 'a', label: 'Auto', start: START, now: NOW });
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('Estado de México publica su propio programa');
  });

  it('omits verification for holograma 00 and Exento, and no-drive events for exempt cars', () => {
    for (const hologram of ['00', 'E'] as const) {
      const ics = buildIcs({ vehicle: vehicle({ hologram }), vehicleId: 'a', label: 'Auto', start: START, now: NOW });
      expect(parse(ics).getAllSubcomponents('vevent')).toHaveLength(0);
    }
    const zero = buildIcs({ vehicle: vehicle({ hologram: '0', digit: 9 }), vehicleId: 'a', label: 'Auto', start: START, now: NOW });
    const events = parse(zero).getAllSubcomponents('vevent').map((e) => new ICAL.Event(e));
    expect(events.every((e) => e.startDate.isDate)).toBe(true);
    // Nov-Dec 2026 (in progress), May-Jun 2027 and Nov-Dec 2027 (starts inside the 12 months).
    expect(events.map((e) => e.startDate.toString())).toEqual(['2026-11-01', '2027-05-01', '2027-11-01']);
  });

  it('adds reminders unless disabled', () => {
    const v = vehicle({ hologram: '2', digit: 1 });
    const withAlarms = parse(buildIcs({ vehicle: v, vehicleId: 'a', label: 'A', start: START, now: NOW }));
    const without = parse(buildIcs({ vehicle: v, vehicleId: 'a', label: 'A', start: START, now: NOW, reminders: false }));
    const count = (c: ICAL.Component) =>
      c.getAllSubcomponents('vevent').reduce((n, e) => n + e.getAllSubcomponents('valarm').length, 0);
    expect(count(withAlarms)).toBe(5); // weekday, Saturdays and three verification windows
    expect(count(without)).toBe(0);
    const alarm = withAlarms.getAllSubcomponents('vevent')[0]?.getFirstSubcomponent('valarm');
    expect(String(alarm?.getFirstPropertyValue('trigger'))).toBe('-PT8H');
  });

  it('excludes officially suspended days with EXDATE', () => {
    const v = vehicle({ hologram: '2', digit: 9 });
    const suspensions = [{ date: '2026-12-25', reason: 'test', url: 'https://www.sedema.cdmx.gob.mx/' }];
    const ics = buildIcs({ vehicle: v, vehicleId: 'a', label: 'A', start: START, now: NOW, suspensions });
    expect(ics).toContain('EXDATE;TZID=America/Mexico_City:20261225T050000');
    const days = expandNoDrive(ics);
    expect(days).not.toContain('2026-12-25 300-1320');
    expect(days).toContain('2026-12-18 300-1320');
  });

  it('writes English text when asked', () => {
    const ics = buildIcs({ vehicle: vehicle(), vehicleId: 'a', label: 'My car', start: START, now: NOW, lang: 'en' });
    expect(ics).toContain('SUMMARY:No driving: My car');
  });
});

describe('ICS helpers', () => {
  it('escapes text values', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('folds long lines at 75 octets without splitting UTF-8 characters', () => {
    const long = `DESCRIPTION:${'verificación '.repeat(20)}`;
    const folded = foldLine(long);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const [i, p] of parts.entries()) {
      expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
      if (i > 0) expect(p.startsWith(' ')).toBe(true);
    }
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(long);
    expect(foldLine('SHORT:1')).toBe('SHORT:1');
  });

  it('builds safe file names and today in Mexico City', () => {
    expect(icsFileName('Auto de Ána (ABC-123)')).toBe('hoy-circulo-auto-de-ana-abc-123.ics');
    expect(icsFileName('***')).toBe('hoy-circulo-auto.ics');
    expect(todayInMexicoCity(new Date('2026-11-18T05:59:00Z'))).toBe('2026-11-17');
  });
});
