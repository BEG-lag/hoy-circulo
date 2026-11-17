import { describe, expect, it } from 'vitest';
import { evaluateDay, evaluateNow } from '../src/engine/hnc.ts';
import { verificationFor } from '../src/engine/verification.ts';
import { effectiveStatus } from '../src/contingency/status.ts';
import {
  bannerView,
  dayLabel,
  hoursLine,
  listOf,
  noteTexts,
  nowText,
  pillText,
  reasons,
  verdictOf,
  verificationView,
  weekdayName,
} from '../src/app/describe.ts';
import { DICTS } from '../src/app/i18n.ts';
import {
  carLabel,
  defaultState,
  loadState,
  newId,
  parseState,
  removeCar,
  saveState,
  STORAGE_KEY,
  upsertCar,
  type Car,
  type KeyValueStore,
} from '../src/app/storage.ts';
import { activeStatus, restriction, vehicle } from './helpers.ts';

const es = DICTS.es;
const en = DICTS.en;

describe('describe (Spanish and English sentences)', () => {
  it('names weekdays and lists digits', () => {
    expect(weekdayName(2, es)).toBe('martes');
    expect(weekdayName(2, en)).toBe('Tuesday');
    expect(listOf([1, 3, 5, 7, 9], 'es')).toBe('1, 3, 5, 7 y 9');
    expect(listOf([7, 8], 'en')).toBe('7 and 8');
  });

  it('explains a restricted weekday', () => {
    const v = vehicle({ hologram: '2', digit: 7 });
    const day = evaluateDay(v, '2026-11-17');
    expect(verdictOf(day)).toBe('no');
    expect(reasons(day, v, es)).toEqual(['Terminación 7 (engomado rosa): descansa los martes.']);
    expect(reasons(day, v, en)).toEqual(['Ending 7 (pink sticker): rests on Tuesdays.']);
    expect(hoursLine(day, es, 'es')).toBe('de 5:00 a 22:00');
    expect(pillText(day, es, 'es')).toBe('No circula, 5:00 a 22:00');
  });

  it('explains free days and exemptions', () => {
    expect(reasons(evaluateDay(vehicle({ digit: 7 }), '2026-11-18'), vehicle({ digit: 7 }), es)[0]).toContain('martes');
    expect(reasons(evaluateDay(vehicle({ hologram: '0' }), '2026-11-17'), vehicle({ hologram: '0' }), es)[0]).toContain('holograma 0');
    expect(reasons(evaluateDay(vehicle({ hologram: 'E' }), '2026-11-17'), vehicle({ hologram: 'E' }), es)[0]).toContain('Exento');
    const sunday = evaluateDay(vehicle(), '2026-11-22');
    expect(reasons(sunday, vehicle(), es)).toEqual(['Domingo: el Hoy No Circula no aplica.']);
    expect(noteTexts(sunday, es)).toEqual([]);
    const h1 = vehicle({ hologram: '1', digit: 4 });
    expect(reasons(evaluateDay(h1, '2026-11-21'), h1, es)[0]).toContain('2.º y 4.º');
    const fifth = evaluateDay(h1, '2026-10-31');
    expect(reasons(fifth, h1, es)).toEqual([]);
    expect(noteTexts(fifth, es)[0]).toContain('Quinto sábado');
  });

  it('explains Saturdays and the morning restriction', () => {
    const h1 = vehicle({ hologram: '1', digit: 3 });
    expect(reasons(evaluateDay(h1, '2026-11-21'), h1, es)).toEqual(['Holograma 1, terminación impar: descansa el 3.er sábado del mes.']);
    const foreign = vehicle({ hologram: 'none', origin: 'other', digit: 7 });
    const monday = evaluateDay(foreign, '2026-11-16');
    expect(verdictOf(monday)).toBe('partial');
    expect(pillText(monday, es, 'es')).toBe('No circula 5:00-11:00');
    expect(reasons(evaluateDay(foreign, '2026-11-21'), foreign, es)[0]).toContain('Sin holograma vigente');
  });

  it('describes "right now"', () => {
    const v = vehicle({ digit: 3 });
    expect(nowText(evaluateNow(v, new Date('2026-11-18T12:00:00-06:00')), es)).toBe(
      'Ahora mismo no puedes circular. Podrás a partir de las 22:00.',
    );
    expect(nowText(evaluateNow(v, new Date('2026-11-18T04:00:00-06:00')), es)).toContain('empieza a las 5:00');
    expect(nowText(evaluateNow(v, new Date('2026-11-19T12:00:00-06:00')), en)).toBe('Right now you can drive.');
  });

  it('labels days relative to today', () => {
    expect(dayLabel('2026-11-17', '2026-11-17', es)).toMatch(/^Hoy · /);
    expect(dayLabel('2026-11-18', '2026-11-17', en)).toMatch(/^Tomorrow · /);
  });

  it('describes verification', () => {
    const now = verificationView(verificationFor(vehicle({ digit: 9 }), '2026-11-17'), '2026-11-17', es);
    expect(now.headline).toBe('Te toca verificar ahora: noviembre y diciembre de 2026.');
    expect(now.details).toContain('Quedan 45 días.');
    const later = verificationView(verificationFor(vehicle({ digit: 5, origin: 'edomex' }), '2026-11-17'), '2026-11-17', es);
    expect(later.headline).toContain('enero y febrero de 2027');
    expect(later.details.join(' ')).toContain('proyectadas');
    expect(later.details.join(' ')).toContain('Estado de México');
    expect(verificationView(verificationFor(vehicle({ hologram: '00' }), '2026-11-17'), '2026-11-17', es).headline).toContain('00');
  });

  it('builds the contingency banner for each state', () => {
    const now = new Date('2026-09-12T20:00:00-06:00');
    expect(bannerView(null, '2026-09-12', es, 'es').tone).toBe('muted');
    const active = bannerView(activeStatus(now, [restriction({ date: '2026-09-13' })]), '2026-09-12', es, 'es');
    expect(active.tone).toBe('alert');
    expect(active.title).toBe('Contingencia ambiental activa: Fase I por ozono');
    expect(active.lines[0]).toContain('holograma 1 con terminación 1, 3, 5, 7 y 9');
    expect(active.lines[0]).toContain('engomado rosa (7 y 8)');
    expect(active.links[0]?.href).toBe('https://www.gob.mx/comisionambiental/prensa/se-435677');
    const none = effectiveStatus({ ...activeStatus(now, []).status, state: 'none', restrictions: [] }, now);
    expect(bannerView(none, '2026-09-12', en, 'en').title).toBe('No active environmental contingency');
  });
});

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

class BrokenStore implements KeyValueStore {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

const car = (over: Partial<Car> = {}): Car => ({
  id: 'a',
  name: 'Vocho',
  plate: 'ABC-127',
  digit: 7,
  hologram: '1',
  origin: 'cdmx',
  disabilityPlate: false,
  touristPass: false,
  ...over,
});

describe('storage', () => {
  it('round-trips the state', () => {
    const store = new MemoryStore();
    const state = upsertCar(defaultState(), car());
    expect(saveState(store, state)).toBe(true);
    expect(loadState(store)).toEqual(state);
    expect(store.data.has(STORAGE_KEY)).toBe(true);
  });

  it('survives blocked or broken storage', () => {
    expect(loadState(new BrokenStore())).toEqual(defaultState());
    expect(saveState(new BrokenStore(), defaultState())).toBe(false);
    expect(loadState(null)).toEqual(defaultState());
    expect(saveState(null, defaultState())).toBe(false);
  });

  it('ignores corrupt or hostile data', () => {
    expect(parseState('not json')).toEqual(defaultState());
    expect(parseState('{"version":2}')).toEqual(defaultState());
    const parsed = parseState(
      JSON.stringify({
        version: 1,
        cars: [car(), car(), car({ id: 'b', digit: 12 }), car({ id: 'c', hologram: '3' as never }), { id: 'd' }, null],
        selectedId: 'missing',
        lang: 'fr',
      }),
    );
    expect(parsed.cars.map((c) => c.id)).toEqual(['a']);
    expect(parsed.selectedId).toBe('a');
    expect(parsed.lang).toBe('es');
  });

  it('adds, updates and removes cars', () => {
    let s = upsertCar(defaultState(), car());
    s = upsertCar(s, car({ id: 'b', name: 'Otro' }));
    expect(s.selectedId).toBe('b');
    s = upsertCar(s, car({ id: 'a', name: 'Renombrado' }));
    expect(s.cars.map((c) => c.name)).toEqual(['Renombrado', 'Otro']);
    s = removeCar(s, 'a');
    expect(s.cars.map((c) => c.id)).toEqual(['b']);
    s = removeCar(s, 'b');
    expect(s.selectedId).toBeNull();
  });

  it('labels cars and creates ids', () => {
    expect(carLabel({ name: 'Vocho', plate: 'abc-127' })).toBe('Vocho (ABC-127)');
    expect(carLabel({ name: '', plate: 'abc-127' })).toBe('ABC-127');
    expect(carLabel({ name: '', plate: '' })).toBe('Auto');
    expect(newId(() => 0.5)).toMatch(/^car-[a-z0-9]+-[a-z0-9]+$/);
  });
});
