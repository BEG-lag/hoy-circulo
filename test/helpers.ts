/**
 * Independent oracle for the tests. It restates the official tables literally
 * (Decreto HNC 2014, tablas 1 a 3; PVVO 2026 2.º sem., numerales 14.1 y 14.2)
 * instead of reading src/rules, so a mistake in the data file shows up here.
 */
import type { Hologram, Origin, Vehicle } from '../src/engine/hnc.ts';
import { effectiveStatus, type ContingencyRestriction, type EffectiveStatus } from '../src/contingency/status.ts';

/** Engomado / last digit -> weekday (1 = Monday). */
export const OFFICIAL_WEEKDAY: Record<number, number> = { 5: 1, 6: 1, 7: 2, 8: 2, 3: 3, 4: 3, 1: 4, 2: 4, 9: 5, 0: 5 };

export const FULL: [number, number] = [300, 1320]; // 05:00 to 22:00
export const MORNING: [number, number] = [300, 660]; // 05:00 to 11:00

export function utcDay(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** Expected restricted windows on a normal day (no contingency, no suspension). */
export function oracle(v: Vehicle, date: string): [number, number][] {
  if (v.disabilityPlate) return [];
  if (v.hologram === 'E') return [];
  if (v.origin === 'other' && v.touristPass) return [];
  if (v.hologram === '00' || v.hologram === '0') return [];
  const d = utcDay(date);
  const weekday = d.getUTCDay();
  if (weekday === 0) return [];
  if (weekday >= 1 && weekday <= 5) {
    if (OFFICIAL_WEEKDAY[v.digit] === weekday) return [FULL];
    if (v.hologram === 'none' && v.origin !== 'cdmx') return [MORNING];
    return [];
  }
  // Saturday
  if (v.hologram === '1') {
    const nth = Math.ceil(d.getUTCDate() / 7);
    const odd = v.digit % 2 === 1;
    if ((odd && (nth === 1 || nth === 3)) || (!odd && (nth === 2 || nth === 4))) return [FULL];
    return [];
  }
  return [FULL];
}

export const ALL_HOLOGRAMS: Hologram[] = ['00', '0', '1', '2', 'E', 'none'];
export const ALL_ORIGINS: Origin[] = ['cdmx', 'edomex', 'megalopolis', 'other'];

export function vehicle(partial: Partial<Vehicle> = {}): Vehicle {
  return { hologram: '2', origin: 'cdmx', digit: 5, disabilityPlate: false, touristPass: false, ...partial };
}

export function* allVehicles(): Generator<Vehicle> {
  for (const hologram of ALL_HOLOGRAMS) {
    for (const origin of ALL_ORIGINS) {
      for (let digit = 0; digit <= 9; digit++) {
        for (const disabilityPlate of [false, true]) {
          for (const touristPass of origin === 'other' ? [false, true] : [false]) {
            yield { hologram, origin, digit, disabilityPlate, touristPass };
          }
        }
      }
    }
  }
}

export function restriction(partial: Partial<ContingencyRestriction> & { date: string }): ContingencyRestriction {
  return {
    from: '5:00',
    to: '22:00',
    hologram2: true,
    hologram1Digits: [1, 3, 5, 7, 9],
    hologram0Digits: [7, 8],
    hologram0Color: 'rosa',
    ...partial,
  };
}

export function activeStatus(now: Date, restrictions: ContingencyRestriction[]): EffectiveStatus {
  return effectiveStatus(
    {
      schema: 1,
      checkedAt: now.toISOString(),
      state: 'active',
      phase: 'I',
      pollutant: 'ozono',
      communique: {
        title: 'SE ACTIVA CONTINGENCIA AMBIENTAL ATMOSFÉRICA POR OZONO',
        url: 'https://www.gob.mx/comisionambiental/prensa/se-435677',
        date: '2026-09-12',
        kind: 'activa',
      },
      restrictions,
      error: null,
    },
    now,
  );
}
