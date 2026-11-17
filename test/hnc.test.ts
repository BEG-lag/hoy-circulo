import { describe, expect, it } from 'vitest';
import { addDays } from '../src/engine/dates.ts';
import { categorize, evaluateDay, evaluateDays, evaluateNow, holidayName, mergeWindows } from '../src/engine/hnc.ts';
import { effectiveStatus } from '../src/contingency/status.ts';
import { activeStatus, allVehicles, oracle, restriction, vehicle } from './helpers.ts';

const START = '2026-01-01';
const DAYS = 731; // all of 2026 and 2027

describe('Hoy No Circula: exhaustive matrix', () => {
  it('matches the official tables for every hologram x origin x digit x day of 2026-2027', () => {
    let checked = 0;
    const mismatches: string[] = [];
    for (const v of allVehicles()) {
      for (let i = 0; i < DAYS; i++) {
        const date = addDays(START, i);
        const got = evaluateDay(v, date).windows.map((w) => [w.from, w.to]);
        const want = oracle(v, date);
        if (JSON.stringify(got) !== JSON.stringify(want)) {
          mismatches.push(`${JSON.stringify(v)} ${date}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
        }
        checked++;
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(300_000);
  });

  it('reports full-day, partial and free statuses consistently', () => {
    for (const v of allVehicles()) {
      for (let i = 0; i < 14; i++) {
        const day = evaluateDay(v, addDays('2026-11-16', i));
        if (day.windows.length === 0) expect(day.status).toBe('free');
        else if (day.windows.some((w) => w.from === 300 && w.to === 1320)) expect(day.status).toBe('restricted');
        else expect(day.status).toBe('partial');
      }
    }
  });
});

describe('weekdays', () => {
  it('matches hoynocircula.cdmx.gob.mx on Tuesday 17 Nov 2026 (plates 7 and 8)', () => {
    for (let digit = 0; digit <= 9; digit++) {
      const day = evaluateDay(vehicle({ hologram: '1', digit }), '2026-11-17');
      expect(day.status === 'restricted', `digit ${digit}`).toBe(digit === 7 || digit === 8);
    }
  });

  it('restricts every weekday by sticker color for holograma 2', () => {
    const week = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
    const digitsByDay = [[5, 6], [7, 8], [3, 4], [1, 2], [9, 0]];
    week.forEach((date, i) => {
      for (let digit = 0; digit <= 9; digit++) {
        const restricted = evaluateDay(vehicle({ digit }), date).status === 'restricted';
        expect(restricted, `${date} digit ${digit}`).toBe(digitsByDay[i]?.includes(digit));
      }
    });
  });

  it('never restricts on Sunday without a contingency', () => {
    const day = evaluateDay(vehicle({ hologram: 'none', origin: 'other' }), '2026-11-22');
    expect(day.status).toBe('free');
    expect(day.notes.map((n) => n.code)).toContain('sunday');
  });
});

describe('Saturdays', () => {
  it('matches the official site for Saturday 21 Nov 2026 (3rd Saturday: H1 odd, H2 all)', () => {
    for (let digit = 0; digit <= 9; digit++) {
      expect(evaluateDay(vehicle({ hologram: '1', digit }), '2026-11-21').status).toBe(digit % 2 === 1 ? 'restricted' : 'free');
      expect(evaluateDay(vehicle({ hologram: '2', digit }), '2026-11-21').status).toBe('restricted');
    }
  });

  it('rests odd endings on the 1st and 3rd Saturday and even endings on the 2nd and 4th', () => {
    const saturdays = ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28'];
    const odd = saturdays.map((d) => evaluateDay(vehicle({ hologram: '1', digit: 3 }), d).status);
    const even = saturdays.map((d) => evaluateDay(vehicle({ hologram: '1', digit: 4 }), d).status);
    expect(odd).toEqual(['restricted', 'free', 'restricted', 'free']);
    expect(even).toEqual(['free', 'restricted', 'free', 'restricted']);
  });

  it('lets holograma 1 drive on a 5th Saturday (PVVO 2026, 14.2 fr. I) but not holograma 2', () => {
    for (const fifth of ['2026-05-30', '2026-08-29', '2026-10-31', '2027-01-30']) {
      for (let digit = 0; digit <= 9; digit++) {
        const h1 = evaluateDay(vehicle({ hologram: '1', digit }), fifth);
        expect(h1.status, fifth).toBe('free');
        expect(h1.notes.map((n) => n.code)).toContain('fifth-saturday-free');
        expect(evaluateDay(vehicle({ hologram: '2', digit }), fifth).status).toBe('restricted');
        expect(evaluateDay(vehicle({ hologram: 'none', origin: 'other', digit }), fifth).status).toBe('restricted');
      }
    }
  });
});

describe('exemptions and categories', () => {
  it('categorizes vehicles', () => {
    expect(categorize(vehicle({ disabilityPlate: true, hologram: '2' }))).toBe('exempt-disability');
    expect(categorize(vehicle({ hologram: 'E' }))).toBe('exempt-electric');
    expect(categorize(vehicle({ hologram: '00' }))).toBe('exempt-hologram');
    expect(categorize(vehicle({ hologram: '0' }))).toBe('exempt-hologram');
    expect(categorize(vehicle({ hologram: 'none', origin: 'cdmx' }))).toBe('no-hologram-local');
    expect(categorize(vehicle({ hologram: 'none', origin: 'edomex' }))).toBe('no-hologram-foreign');
    expect(categorize(vehicle({ hologram: 'none', origin: 'other' }))).toBe('no-hologram-foreign');
    expect(categorize(vehicle({ hologram: 'none', origin: 'other', touristPass: true }))).toBe('exempt-tourist-pass');
    // A tourist pass only exists for plates from outside the Megalópolis.
    expect(categorize(vehicle({ hologram: 'none', origin: 'edomex', touristPass: true }))).toBe('no-hologram-foreign');
  });

  it('adds 5:00 to 11:00 on the other weekdays for out-of-area plates without a hologram', () => {
    const v = vehicle({ hologram: 'none', origin: 'other', digit: 7 }); // Tuesday
    expect(evaluateDay(v, '2026-11-16').windows).toEqual([{ from: 300, to: 660 }]);
    expect(evaluateDay(v, '2026-11-16').status).toBe('partial');
    expect(evaluateDay(v, '2026-11-17').windows).toEqual([{ from: 300, to: 1320 }]);
    // Cars registered in Mexico City without verification: no morning restriction.
    expect(evaluateDay(vehicle({ hologram: 'none', origin: 'cdmx', digit: 7 }), '2026-11-16').status).toBe('free');
  });
});

describe('holidays and suspensions', () => {
  it('knows the LFT art. 74 holidays', () => {
    expect(holidayName('2026-01-01')).toBe('Año Nuevo');
    expect(holidayName('2026-02-02')).toBe('Día de la Constitución');
    expect(holidayName('2026-03-16')).toBe('Natalicio de Benito Juárez');
    expect(holidayName('2026-05-01')).toBe('Día del Trabajo');
    expect(holidayName('2026-09-16')).toBe('Día de la Independencia');
    expect(holidayName('2026-11-16')).toBe('Día de la Revolución');
    expect(holidayName('2026-12-25')).toBe('Navidad');
    expect(holidayName('2026-11-20')).toBeNull(); // the date is not the holiday; the third Monday is
    expect(holidayName('2026-11-23')).toBeNull();
  });

  it('still applies the program on holidays (decreto 2014, numeral XI: only an official notice suspends it)', () => {
    const revolucion = evaluateDay(vehicle({ digit: 5 }), '2026-11-16');
    expect(revolucion.status).toBe('restricted');
    expect(revolucion.notes).toContainEqual({ code: 'holiday-applies', holiday: 'Día de la Revolución' });
    expect(evaluateDay(vehicle({ digit: 9 }), '2026-12-25').status).toBe('restricted');
    expect(evaluateDay(vehicle({ digit: 0 }), '2027-01-01').status).toBe('restricted');
  });

  it('lifts the restriction when an official suspension notice is listed', () => {
    const suspensions = [{ date: '2026-12-25', reason: 'Aviso de suspensión', url: 'https://www.sedema.cdmx.gob.mx/' }];
    const day = evaluateDay(vehicle({ digit: 9 }), '2026-12-25', { suspensions });
    expect(day.status).toBe('free');
    expect(day.notes.map((n) => n.code)).toContain('suspended');
    expect(evaluateDay(vehicle({ digit: 9 }), '2026-12-18', { suspensions }).status).toBe('restricted');
  });
});

describe('time of day', () => {
  // Wednesday 18 Nov 2026, Mexico City is UTC-6.
  const at = (hhmm: string) => new Date(`2026-11-18T${hhmm}:00-06:00`);
  const red = vehicle({ hologram: '2', digit: 3 });

  it('restricts from 5:00 (inclusive) to 22:00 (exclusive)', () => {
    expect(evaluateNow(red, at('04:59')).canDriveNow).toBe('yes');
    expect(evaluateNow(red, at('04:59')).nextFrom).toBe(300);
    expect(evaluateNow(red, at('05:00')).canDriveNow).toBe('no');
    expect(evaluateNow(red, at('05:00')).until).toBe(1320);
    expect(evaluateNow(red, at('21:59')).canDriveNow).toBe('no');
    expect(evaluateNow(red, at('22:00')).canDriveNow).toBe('yes');
    expect(evaluateNow(red, at('23:59')).canDriveNow).toBe('yes');
  });

  it('uses Mexico City time whatever the instant zone', () => {
    // 2026-11-18T11:00Z is 05:00 in Mexico City.
    expect(evaluateNow(red, new Date('2026-11-18T11:00:00Z')).canDriveNow).toBe('no');
    expect(evaluateNow(red, new Date('2026-11-18T10:59:00Z')).canDriveNow).toBe('yes');
    // 2026-11-19T03:59Z is still Wednesday 21:59 in Mexico City.
    expect(evaluateNow(red, new Date('2026-11-19T03:59:00Z')).local.date).toBe('2026-11-18');
    expect(evaluateNow(red, new Date('2026-11-19T03:59:00Z')).canDriveNow).toBe('no');
  });

  it('ends the morning restriction for foreign plates at 11:00', () => {
    const foreign = vehicle({ hologram: 'none', origin: 'other', digit: 7 });
    expect(evaluateNow(foreign, at('10:59')).canDriveNow).toBe('no');
    expect(evaluateNow(foreign, at('10:59')).until).toBe(660);
    expect(evaluateNow(foreign, at('11:00')).canDriveNow).toBe('yes');
  });
});

describe('contingency overrides', () => {
  const now = new Date('2026-09-12T20:00:00-06:00');
  const sunday = '2026-09-13';
  const status = activeStatus(now, [restriction({ date: sunday })]);
  const ctx = { contingency: status, today: '2026-09-12' };

  it('restricts holograma 0 and 00 only for the announced endings', () => {
    for (const hologram of ['0', '00'] as const) {
      for (let digit = 0; digit <= 9; digit++) {
        const day = evaluateDay(vehicle({ hologram, digit }), sunday, ctx);
        expect(day.status, `${hologram} ${digit}`).toBe(digit === 7 || digit === 8 ? 'restricted' : 'free');
        if (digit !== 7 && digit !== 8) expect(day.notes.map((n) => n.code)).toContain('contingency-free');
      }
    }
  });

  it('restricts holograma 1 by the announced parity and every holograma 2', () => {
    for (let digit = 0; digit <= 9; digit++) {
      expect(evaluateDay(vehicle({ hologram: '1', digit }), sunday, ctx).status).toBe(digit % 2 === 1 ? 'restricted' : 'free');
      expect(evaluateDay(vehicle({ hologram: '2', digit }), sunday, ctx).status).toBe('restricted');
    }
  });

  it('treats tourist passes and cars without hologram like holograma 2', () => {
    expect(evaluateDay(vehicle({ hologram: 'none', origin: 'other', touristPass: true }), sunday, ctx).status).toBe('restricted');
    expect(evaluateDay(vehicle({ hologram: 'none', origin: 'cdmx' }), sunday, ctx).status).toBe('restricted');
  });

  it('exempts electric/hybrid (Exento) and disability plates', () => {
    const e = evaluateDay(vehicle({ hologram: 'E' }), sunday, ctx);
    expect(e.status).toBe('free');
    expect(e.notes.map((n) => n.code)).toContain('contingency-exempt');
    expect(evaluateDay(vehicle({ hologram: '2', disabilityPlate: true }), sunday, ctx).status).toBe('free');
  });

  it('does not touch days without an announced restriction, except to flag today/tomorrow as pending', () => {
    // Saturday 12 Sep: the activation came at 15:00; vehicle measures start the next day.
    const today = evaluateDay(vehicle({ hologram: '0', digit: 7 }), '2026-09-12', ctx);
    expect(today.status).toBe('uncertain');
    expect(today.notes.map((n) => n.code)).toContain('contingency-pending');
    const later = evaluateDay(vehicle({ hologram: '0', digit: 7 }), '2026-09-15', ctx);
    expect(later.status).toBe('free');
    expect(later.notes).toEqual([]);
    // Exempt cars are never pending.
    expect(evaluateDay(vehicle({ hologram: 'E' }), '2026-09-12', ctx).status).toBe('free');
  });

  it('is uncertain when the communiqué could not be read for that hologram', () => {
    const unread = activeStatus(now, [restriction({ date: sunday, hologram1Digits: null, hologram0Digits: null })]);
    const day = evaluateDay(vehicle({ hologram: '1', digit: 2 }), sunday, { contingency: unread, today: '2026-09-12' });
    expect(day.status).toBe('uncertain');
    expect(day.notes.map((n) => n.code)).toContain('contingency-unknown-details');
    // Already restricted all day by Hoy No Circula: stays restricted.
    const sat = activeStatus(now, [restriction({ date: '2026-09-19', hologram1Digits: null })]);
    expect(evaluateDay(vehicle({ hologram: '1', digit: 3 }), '2026-09-19', { contingency: sat }).status).toBe('restricted');
  });

  it('ignores a stale status and only warns for today', () => {
    const stale = effectiveStatus(
      { ...activeStatus(now, [restriction({ date: sunday })]).status },
      new Date('2026-09-13T12:00:00-06:00'),
    );
    expect(stale.state).toBe('unknown');
    const day = evaluateDay(vehicle({ hologram: '0', digit: 7 }), sunday, { contingency: stale, today: sunday });
    expect(day.status).toBe('free');
    expect(day.notes.map((n) => n.code)).toContain('contingency-unknown');
  });

  it('combines contingency hours with Hoy No Circula', () => {
    const monday = '2026-09-14';
    const s = activeStatus(now, [restriction({ date: monday, hologram0Digits: [5, 6], hologram0Color: 'amarillo' })]);
    const foreign = evaluateDay(vehicle({ hologram: 'none', origin: 'other', digit: 7 }), monday, { contingency: s });
    expect(foreign.windows).toEqual([{ from: 300, to: 1320 }]);
    expect(foreign.restrictions.map((r) => r.code).sort()).toEqual(['contingency', 'foreign-morning']);
    const nowAnswer = evaluateNow(vehicle({ hologram: '0', digit: 5 }), new Date('2026-09-14T12:00:00-06:00'), { contingency: s });
    expect(nowAnswer.canDriveNow).toBe('no');
  });

  it('reports uncertain "now" only inside restricted hours', () => {
    const pending = activeStatus(now, []);
    const v = vehicle({ hologram: '0', digit: 1 });
    expect(evaluateNow(v, new Date('2026-09-12T21:00:00-06:00'), { contingency: pending }).canDriveNow).toBe('uncertain');
    expect(evaluateNow(v, new Date('2026-09-12T23:00:00-06:00'), { contingency: pending }).canDriveNow).toBe('yes');
  });
});

describe('helpers', () => {
  it('merges overlapping windows', () => {
    expect(mergeWindows([{ from: 300, to: 660 }, { from: 300, to: 1320 }])).toEqual([{ from: 300, to: 1320 }]);
    expect(mergeWindows([{ from: 600, to: 700 }, { from: 300, to: 400 }])).toEqual([
      { from: 300, to: 400 },
      { from: 600, to: 700 },
    ]);
  });

  it('evaluates consecutive days', () => {
    const days = evaluateDays(vehicle({ digit: 3 }), '2026-11-16', 7);
    expect(days.map((d) => d.status)).toEqual(['free', 'free', 'restricted', 'free', 'free', 'restricted', 'free']);
  });
});
