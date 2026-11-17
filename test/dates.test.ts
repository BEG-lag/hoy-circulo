import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  formatMinutes,
  nthWeekdayInMonth,
  parseDate,
  toLocal,
  toMinutes,
  weekdayOf,
} from '../src/engine/dates.ts';

describe('dates', () => {
  it('parses and rejects dates', () => {
    expect(parseDate('2026-11-17')).toEqual({ year: 2026, month: 11, day: 17 });
    expect(() => parseDate('2026-02-30')).toThrow();
    expect(() => parseDate('17/11/2026')).toThrow();
  });

  it('computes weekdays', () => {
    expect(weekdayOf('2026-11-17')).toBe(2); // Tuesday
    expect(weekdayOf('2026-11-21')).toBe(6); // Saturday
    expect(weekdayOf('2027-01-03')).toBe(0); // Sunday
  });

  it('adds days and months across boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-17', 12)).toBe('2027-11-17');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
    expect(daysBetween('2026-11-17', '2027-11-17')).toBe(365);
  });

  it('numbers weekdays inside the month', () => {
    expect(nthWeekdayInMonth('2026-11-07')).toBe(1);
    expect(nthWeekdayInMonth('2026-11-08')).toBe(2);
    expect(nthWeekdayInMonth('2026-11-21')).toBe(3);
    expect(nthWeekdayInMonth('2026-11-28')).toBe(4);
    expect(nthWeekdayInMonth('2026-10-31')).toBe(5);
  });

  it('parses and formats times', () => {
    expect(toMinutes('05:00')).toBe(300);
    expect(toMinutes('5:00')).toBe(300);
    expect(toMinutes('22:00')).toBe(1320);
    expect(toMinutes('24:00')).toBe(1440);
    expect(() => toMinutes('25:00')).toThrow();
    expect(() => toMinutes('10:60')).toThrow();
    expect(formatMinutes(300)).toBe('5:00');
    expect(formatMinutes(1320)).toBe('22:00');
  });

  it('converts instants to Mexico City wall time (UTC-6 all year)', () => {
    expect(toLocal(new Date('2026-11-17T11:00:00Z'), 'America/Mexico_City')).toEqual({ date: '2026-11-17', minutes: 300 });
    // April used to be daylight saving time; since 2022 it is still UTC-6.
    expect(toLocal(new Date('2026-04-15T11:00:00Z'), 'America/Mexico_City')).toEqual({ date: '2026-04-15', minutes: 300 });
    expect(toLocal(new Date('2026-11-18T05:30:00Z'), 'America/Mexico_City')).toEqual({ date: '2026-11-17', minutes: 23 * 60 + 30 });
  });
});
