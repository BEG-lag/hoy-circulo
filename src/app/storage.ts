/**
 * Local persistence. Everything lives in this browser's localStorage; nothing is
 * sent anywhere. Every access is wrapped in try/catch because storage can be
 * blocked (private mode, disabled cookies) and the app must still work.
 */
import { HOLOGRAMS, ORIGINS, type Hologram, type Origin, type Vehicle } from '../engine/hnc.ts';
import { isValidDigit } from '../engine/plate.ts';
import type { Lang } from './i18n.ts';

export interface Car extends Vehicle {
  readonly id: string;
  readonly name: string;
  readonly plate: string;
}

export interface AppState {
  readonly version: 1;
  readonly cars: readonly Car[];
  readonly selectedId: string | null;
  readonly lang: Lang;
  readonly reminders: boolean;
}

export const STORAGE_KEY = 'hoy-circulo:v1';
const MAX_CARS = 20;

export function defaultState(): AppState {
  return { version: 1, cars: [], selectedId: null, lang: 'es', reminders: true };
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseCar(v: unknown): Car | null {
  if (!isRecord(v)) return null;
  const { id, name, plate, digit, hologram, origin, disabilityPlate, touristPass } = v;
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
  if (typeof plate !== 'string' || plate.length > 20) return null;
  if (typeof name !== 'string' || name.length > 60) return null;
  if (!isValidDigit(digit)) return null;
  if (typeof hologram !== 'string' || !(HOLOGRAMS as string[]).includes(hologram)) return null;
  if (typeof origin !== 'string' || !(ORIGINS as string[]).includes(origin)) return null;
  return {
    id,
    name,
    plate,
    digit,
    hologram: hologram as Hologram,
    origin: origin as Origin,
    disabilityPlate: disabilityPlate === true,
    touristPass: touristPass === true,
  };
}

/** Parses stored JSON; anything unexpected falls back to defaults. */
export function parseState(raw: string | null): AppState {
  const base = defaultState();
  if (!raw) return base;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!isRecord(data) || data.version !== 1) return base;
  const cars = Array.isArray(data.cars)
    ? data.cars.map(parseCar).filter((c): c is Car => c !== null).slice(0, MAX_CARS)
    : [];
  const unique = cars.filter((c, i) => cars.findIndex((x) => x.id === c.id) === i);
  const selectedId =
    typeof data.selectedId === 'string' && unique.some((c) => c.id === data.selectedId)
      ? data.selectedId
      : (unique[0]?.id ?? null);
  return {
    version: 1,
    cars: unique,
    selectedId,
    lang: data.lang === 'en' ? 'en' : 'es',
    reminders: data.reminders !== false,
  };
}

export function loadState(store: KeyValueStore | null): AppState {
  if (!store) return defaultState();
  try {
    return parseState(store.getItem(STORAGE_KEY));
  } catch {
    return defaultState();
  }
}

/** Returns false when the browser refused to store the data. */
export function saveState(store: KeyValueStore | null, state: AppState): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** localStorage, or null when the browser blocks it. */
export function browserStore(): KeyValueStore | null {
  try {
    const s = globalThis.localStorage;
    const probe = '__hoy-circulo-probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function upsertCar(state: AppState, car: Car): AppState {
  const exists = state.cars.some((c) => c.id === car.id);
  const cars = exists ? state.cars.map((c) => (c.id === car.id ? car : c)) : [...state.cars, car].slice(0, MAX_CARS);
  return { ...state, cars, selectedId: car.id };
}

export function removeCar(state: AppState, id: string): AppState {
  const cars = state.cars.filter((c) => c.id !== id);
  const selectedId = state.selectedId === id ? (cars[0]?.id ?? null) : state.selectedId;
  return { ...state, cars, selectedId };
}

export function newId(random: () => number = Math.random): string {
  return `car-${Date.now().toString(36)}-${Math.floor(random() * 1e8).toString(36)}`;
}

export function carLabel(car: Pick<Car, 'name' | 'plate'>): string {
  const name = car.name.trim();
  const plate = car.plate.trim().toUpperCase();
  if (name && plate) return `${name} (${plate})`;
  return name || plate || 'Auto';
}
