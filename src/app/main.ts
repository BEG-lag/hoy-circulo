import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import './styles.css';

import { effectiveStatus, type EffectiveStatus } from '../contingency/status.ts';
import { formatMinutes, toLocal } from '../engine/dates.ts';
import { evaluateNow } from '../engine/hnc.ts';
import { RULES } from '../rules/rules.ts';
import { buildIcs, icsFileName } from '../ics/ics.ts';
import { DICTS } from './i18n.ts';
import {
  browserStore,
  carLabel,
  loadState,
  newId,
  removeCar,
  saveState,
  upsertCar,
  type AppState,
  type Car,
} from './storage.ts';
import { buildCarForm, renderBanner, renderFooter, renderHeader, renderMain, type Handlers, type ViewModel } from './view.ts';

const store = browserStore();
let state: AppState = loadState(store);
let rawStatus: unknown = undefined;
let status: EffectiveStatus | null = null;

const headerRoot = document.getElementById('header-root');
const bannerRoot = document.getElementById('banner-root');
const mainRoot = document.getElementById('main');
const footerRoot = document.getElementById('footer-root');
const dialog = document.getElementById('car-dialog') as HTMLDialogElement | null;
if (!headerRoot || !bannerRoot || !mainRoot || !footerRoot || !dialog) throw new Error('Missing app roots');

function vm(): ViewModel {
  const now = new Date();
  return {
    state,
    t: DICTS[state.lang],
    lang: state.lang,
    now,
    today: toLocal(now, RULES.timezone).date,
    status,
    online: navigator.onLine,
  };
}

function setState(next: AppState): void {
  state = next;
  saveState(store, state);
}

/** Re-renders while keeping keyboard focus on the same control. */
function render(parts: { header?: boolean; banner?: boolean; main?: boolean; footer?: boolean } = {}): void {
  const all = Object.keys(parts).length === 0;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.key : undefined;
  const model = vm();
  document.documentElement.lang = model.lang === 'es' ? 'es-MX' : 'en';
  document.title = model.lang === 'es' ? 'hoy·circulo: ¿Hoy circulas?' : 'hoy·circulo: Can you drive today?';
  if (all || parts.header) renderHeader(headerRoot as HTMLElement, model, handlers);
  if (all || parts.banner) renderBanner(bannerRoot as HTMLElement, model);
  if (all || parts.main) {
    renderMain(mainRoot as HTMLElement, model, handlers);
    lastSignature = signature();
  }
  if (all || parts.footer) renderFooter(footerRoot as HTMLElement, model);
  if (active) document.querySelector<HTMLElement>(`[data-key="${CSS.escape(active)}"]`)?.focus();
}

let returnFocus: HTMLElement | null = null;

function openDialog(car: Car | null): void {
  if (!dialog) return;
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.replaceChildren(buildCarForm(vm(), car, handlers, false));
  dialog.showModal();
  dialog.querySelector<HTMLInputElement>('input[name="plate"]')?.focus();
}

function closeDialog(): void {
  if (dialog?.open) dialog.close();
}

dialog.addEventListener('close', () => {
  dialog.replaceChildren();
  returnFocus?.focus();
});

const handlers: Handlers = {
  select(id) {
    setState({ ...state, selectedId: id });
    render({ main: true });
  },
  add() {
    openDialog(null);
  },
  edit(id) {
    openDialog(state.cars.find((c) => c.id === id) ?? null);
  },
  remove(id) {
    const car = state.cars.find((c) => c.id === id);
    if (!car || !window.confirm(DICTS[state.lang].deleteConfirm(carLabel(car)))) return;
    setState(removeCar(state, id));
    render({ main: true });
    document.querySelector<HTMLElement>('.chip, #f1-plate')?.focus();
  },
  toggleLang() {
    setState({ ...state, lang: state.lang === 'es' ? 'en' : 'es' });
    render();
    document.querySelector<HTMLElement>('.top-actions button')?.focus();
  },
  setReminders(on) {
    setState({ ...state, reminders: on });
  },
  download() {
    const car = state.cars.find((c) => c.id === state.selectedId) ?? state.cars[0];
    if (!car) return;
    const model = vm();
    const ics = buildIcs({
      vehicle: car,
      vehicleId: car.id,
      label: carLabel(car),
      start: model.today,
      now: model.now,
      reminders: state.reminders,
      lang: state.lang,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = icsFileName(carLabel(car));
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
  saveCar(car) {
    const withId = car.id ? car : { ...car, id: newId() };
    const firstCar = state.cars.length === 0;
    setState(upsertCar(state, withId));
    closeDialog();
    render({ main: true });
    if (firstCar) document.getElementById('verdict-title')?.focus({ preventScroll: true });
  },
  cancelForm() {
    closeDialog();
  },
};

async function loadStatus(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}status.json`, { cache: 'no-store' });
    rawStatus = res.ok ? ((await res.json()) as unknown) : null;
  } catch {
    // Offline or blocked: the service worker may still have served a cached copy.
  }
  status = effectiveStatus(rawStatus ?? null, new Date());
  render({ banner: true, main: !document.querySelector('.car-form-inline') });
}

/** What the main view depends on, minute to minute. */
function signature(): string {
  const model = vm();
  const car = state.cars.find((c) => c.id === state.selectedId) ?? state.cars[0];
  if (!car) return 'no-car';
  const now = evaluateNow(car, model.now, { contingency: status, today: model.today });
  return [model.today, now.canDriveNow, now.until, now.nextFrom, now.day.status, status?.state].join('|');
}

let lastSignature = '';

function tick(): void {
  if (rawStatus !== undefined) status = effectiveStatus(rawStatus ?? null, new Date());
  render({ banner: true });
  const sig = signature();
  if (sig !== lastSignature && !document.querySelector('.car-form-inline')) {
    lastSignature = sig;
    render({ main: true });
    return;
  }
  // Same answer: only refresh the clock, without rebuilding (and re-announcing) the result.
  const clock = document.querySelector('[data-clock]');
  if (clock) clock.textContent = DICTS[state.lang].asOf(formatMinutes(toLocal(new Date(), RULES.timezone).minutes));
}

render();
void loadStatus();

// Keep "right now" and "checked X minutes ago" current.
const msToNextMinute = 60_000 - (Date.now() % 60_000);
setTimeout(() => {
  tick();
  setInterval(tick, 60_000);
}, msToNextMinute + 500);
setInterval(() => void loadStatus(), 10 * 60_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void loadStatus();
});
window.addEventListener('online', () => void loadStatus());
window.addEventListener('offline', () => render({ banner: true }));

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}
