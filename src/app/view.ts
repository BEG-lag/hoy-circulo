/**
 * Rendering. Each region is rebuilt from the current view model; user text is
 * always inserted as text nodes.
 */
import { SOURCES } from '../rules/sources.ts';
import { RULES } from '../rules/rules.ts';
import { formatMinutes, type LocalDate } from '../engine/dates.ts';
import {
  categorize,
  evaluateDays,
  evaluateNow,
  HOLOGRAMS,
  ORIGINS,
  type DayStatus,
  type Hologram,
  type Origin,
} from '../engine/hnc.ts';
import { colorForDigit, parsePlate } from '../engine/plate.ts';
import { verificationFor } from '../engine/verification.ts';
import type { EffectiveStatus } from '../contingency/status.ts';
import {
  bannerView,
  dayLabel,
  formatDate,
  hoursLine,
  noteTexts,
  nowText,
  pillText,
  reasons,
  verdictOf,
  verificationView,
  type Verdict,
} from './describe.ts';
import { h, icon, replaceChildren } from './dom.ts';
import type { Dict, Lang } from './i18n.ts';
import { ICONS } from './icons.ts';
import { carLabel, type AppState, type Car } from './storage.ts';

export interface ViewModel {
  readonly state: AppState;
  readonly t: Dict;
  readonly lang: Lang;
  readonly now: Date;
  readonly today: LocalDate;
  readonly status: EffectiveStatus | null;
  readonly online: boolean;
}

export interface Handlers {
  select(id: string): void;
  add(): void;
  edit(id: string): void;
  remove(id: string): void;
  toggleLang(): void;
  setReminders(on: boolean): void;
  download(): void;
  saveCar(car: Car): void;
  cancelForm(): void;
}

const REPO = 'https://github.com/BEG-lag/hoy-circulo';
const REGLAS = `${REPO}/blob/main/docs/reglas.md`;

function extLink(href: string, label: string, className = 'link', title?: string): HTMLAnchorElement {
  return h(
    'a',
    { href, class: className, target: '_blank', rel: 'noopener noreferrer', title },
    label,
    icon(ICONS.external, 'icon icon-xs'),
  );
}

const VERDICT_ICON: Record<Verdict, string> = { yes: ICONS.check, no: ICONS.x, partial: ICONS.clock, uncertain: ICONS.question };
const STATUS_ICON: Record<DayStatus, string> = { free: ICONS.check, restricted: ICONS.x, partial: ICONS.clock, uncertain: ICONS.question };

/* ---------- header ---------- */

export function renderHeader(root: HTMLElement, vm: ViewModel, on: Handlers): void {
  const { t } = vm;
  replaceChildren(
    root,
    h('a', { class: 'skip', href: '#main' }, t.skip),
    h(
      'div',
      { class: 'wrap top' },
      h(
        'a',
        { class: 'brand', href: './', 'aria-label': 'hoy·circulo' },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
        h('span', { class: 'brand-word' }, h('em', {}, 'hoy'), '·circulo'),
      ),
      h(
        'div',
        { class: 'top-actions' },
        h('span', { class: 'badge' }, t.unofficial),
        h(
          'button',
          { type: 'button', class: 'btn btn-ghost btn-sm', lang: vm.lang === 'es' ? 'en' : 'es', 'aria-label': t.langButtonLabel, onclick: () => on.toggleLang() },
          icon(ICONS.globe, 'icon icon-sm'),
          t.langButton,
        ),
      ),
    ),
  );
}

/* ---------- contingency banner ---------- */

export function renderBanner(root: HTMLElement, vm: ViewModel): void {
  const { t } = vm;
  const view = bannerView(vm.status, vm.today, t, vm.lang);
  const loading = vm.status === null;
  const toneIcon = view.tone === 'ok' ? ICONS.leaf : view.tone === 'alert' ? ICONS.alert : view.tone === 'warn' ? ICONS.alert : ICONS.question;
  replaceChildren(
    root,
    h(
      'div',
      { class: 'wrap' },
      h(
        'section',
        { class: `banner banner-${loading ? 'muted' : view.tone}`, 'aria-label': t.contingencyArchive },
        icon(toneIcon, 'icon banner-icon'),
        h(
          'div',
          { class: 'banner-body' },
          h('p', { class: 'banner-title' }, loading ? '…' : view.title),
          loading ? null : view.lines.map((l) => h('p', { class: 'banner-line' }, l)),
          loading ? null : h('p', { class: 'banner-links' }, view.links.map((l) => extLink(l.href, l.label, 'link', l.title))),
          vm.online ? null : h('p', { class: 'banner-line' }, t.offline),
        ),
      ),
    ),
  );
}

/* ---------- car form ---------- */

export function buildCarForm(vm: ViewModel, existing: Car | null, on: Handlers, inline: boolean): HTMLFormElement {
  const { t } = vm;
  const id = existing?.id ?? '';
  const uid = inline ? 'f1' : 'f2';
  const nameInput = h('input', {
    id: `${uid}-name`,
    name: 'name',
    type: 'text',
    maxlength: 40,
    autocomplete: 'off',
    placeholder: t.namePlaceholder,
    value: existing?.name ?? '',
  });
  const plateInput = h('input', {
    id: `${uid}-plate`,
    name: 'plate',
    type: 'text',
    required: true,
    maxlength: 14,
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    inputmode: 'text',
    placeholder: t.platePlaceholder,
    'aria-describedby': `${uid}-plate-help ${uid}-plate-detect`,
    value: existing?.plate ?? '',
  });
  const plateDetect = h('p', { id: `${uid}-plate-detect`, class: 'field-detect', 'aria-live': 'polite' });
  const plateError = h('p', { id: `${uid}-plate-error`, class: 'field-error', hidden: true }, t.plateInvalid);
  const digitBox = h('div', { class: 'digit-choice', hidden: true });

  let chosenDigit: number | null = existing?.digit ?? null;

  const updatePlate = () => {
    const info = parsePlate(plateInput.value);
    plateDetect.replaceChildren();
    digitBox.replaceChildren();
    digitBox.hidden = true;
    if (!info) return;
    plateError.hidden = true;
    plateInput.removeAttribute('aria-invalid');
    if (info.method === 'letters-only') {
      chosenDigit = info.digit;
      plateDetect.append(t.plateLetters);
      return;
    }
    if (info.ambiguous && info.firstSeriesDigit !== null && info.firstSeriesDigit !== info.digit) {
      const options = [info.digit, info.firstSeriesDigit];
      if (chosenDigit === null || !options.includes(chosenDigit)) chosenDigit = info.digit;
      digitBox.hidden = false;
      const select = h(
        'select',
        { id: `${uid}-digit`, name: 'digit', onchange: (e: Event) => (chosenDigit = Number((e.target as HTMLSelectElement).value)) },
        options.map((d) =>
          h('option', { value: d, selected: d === chosenDigit }, t.digitOption(d, t.colors[colorForDigit(d)])),
        ),
      );
      digitBox.append(h('p', { class: 'field-help' }, t.plateAmbiguous), h('label', { for: `${uid}-digit` }, t.digitChoiceLabel), select);
      plateDetect.append(t.plateDetected(chosenDigit, t.colors[colorForDigit(chosenDigit)]));
      return;
    }
    chosenDigit = info.digit;
    const swatch = h('span', { class: `swatch swatch-${colorForDigit(info.digit)}`, 'aria-hidden': 'true' });
    plateDetect.append(swatch, t.plateDetected(info.digit, t.colors[colorForDigit(info.digit)]));
  };
  plateInput.addEventListener('input', updatePlate);

  const holo = existing?.hologram ?? null;
  const holoFieldset = h(
    'fieldset',
    { class: 'field holograms', 'aria-describedby': `${uid}-holo-error` },
    h('legend', {}, t.hologramLegend),
    h(
      'div',
      { class: 'choice-grid' },
      HOLOGRAMS.map((value) => {
        const [title, desc] = t.holograms[value];
        return h(
          'label',
          { class: 'choice' },
          h('input', { type: 'radio', name: 'hologram', value, required: true, checked: holo === value }),
          h('span', { class: 'choice-body' }, h('span', { class: 'choice-title' }, title), h('span', { class: 'choice-desc' }, desc)),
        );
      }),
    ),
    h('p', { id: `${uid}-holo-error`, class: 'field-error', hidden: true }, t.hologramLegend),
  );

  const originSelect = h(
    'select',
    { id: `${uid}-origin`, name: 'origin' },
    ORIGINS.map((o) => h('option', { value: o, selected: (existing?.origin ?? 'cdmx') === o }, t.origins[o])),
  );
  const tourist = h('input', { id: `${uid}-tourist`, name: 'touristPass', type: 'checkbox', checked: existing?.touristPass ?? false });
  const touristRow = h(
    'div',
    { class: 'check-row', hidden: (existing?.origin ?? 'cdmx') !== 'other' },
    tourist,
    h('label', { for: `${uid}-tourist` }, t.touristPassLabel, h('span', { class: 'field-help' }, t.touristPassHelp)),
  );
  originSelect.addEventListener('change', () => {
    touristRow.hidden = originSelect.value !== 'other';
  });
  const disability = h('input', { id: `${uid}-disability`, name: 'disabilityPlate', type: 'checkbox', checked: existing?.disabilityPlate ?? false });

  const form = h(
    'form',
    { class: `car-form${inline ? ' car-form-inline' : ''}`, novalidate: true, 'aria-labelledby': `${uid}-title` },
    h('h2', { id: `${uid}-title`, class: 'form-title' }, existing ? t.formTitleEdit : t.formTitleNew),
    h(
      'div',
      { class: 'field-row' },
      h(
        'div',
        { class: 'field' },
        h('label', { for: `${uid}-plate` }, t.plateLabel),
        plateInput,
        h('p', { id: `${uid}-plate-help`, class: 'field-help' }, t.plateHelp),
        plateDetect,
        plateError,
        digitBox,
      ),
      h('div', { class: 'field' }, h('label', { for: `${uid}-name` }, t.nameLabel), nameInput),
    ),
    holoFieldset,
    h('div', { class: 'field' }, h('label', { for: `${uid}-origin` }, t.originLabel), originSelect),
    touristRow,
    h('div', { class: 'check-row' }, disability, h('label', { for: `${uid}-disability` }, t.disabilityLabel)),
    h(
      'div',
      { class: 'form-actions' },
      h('button', { type: 'submit', class: 'btn btn-primary' }, icon(ICONS.check, 'icon icon-sm'), t.save),
      inline && !existing ? null : h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => on.cancelForm() }, t.cancel),
    ),
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const info = parsePlate(plateInput.value);
    const holoInput = form.querySelector<HTMLInputElement>('input[name="hologram"]:checked');
    const holoError = form.querySelector<HTMLElement>(`#${uid}-holo-error`);
    let firstInvalid: HTMLElement | null = null;
    if (!info) {
      plateError.hidden = false;
      plateInput.setAttribute('aria-invalid', 'true');
      plateInput.setAttribute('aria-describedby', `${uid}-plate-error ${uid}-plate-help`);
      firstInvalid = plateInput;
    }
    if (!holoInput) {
      if (holoError) {
        holoError.hidden = false;
        holoError.textContent = `${t.hologramLegend}: ${vm.lang === 'es' ? 'elige una opción.' : 'choose one.'}`;
      }
      firstInvalid ??= form.querySelector<HTMLInputElement>('input[name="hologram"]');
    }
    if (firstInvalid || !info || !holoInput) {
      firstInvalid?.focus();
      return;
    }
    const origin = originSelect.value as Origin;
    on.saveCar({
      id,
      name: nameInput.value.trim().slice(0, 40),
      plate: plateInput.value.trim().toUpperCase().slice(0, 14),
      digit: chosenDigit ?? info.digit,
      hologram: holoInput.value as Hologram,
      origin,
      disabilityPlate: disability.checked,
      touristPass: origin === 'other' && tourist.checked,
    });
  });

  updatePlate();
  return form;
}

/* ---------- main ---------- */

function selectedCar(state: AppState): Car | null {
  return state.cars.find((c) => c.id === state.selectedId) ?? state.cars[0] ?? null;
}

function carsStrip(vm: ViewModel, on: Handlers, car: Car): HTMLElement {
  const { t } = vm;
  return h(
    'section',
    { class: 'cars', 'aria-label': t.carsTitle },
    h(
      'div',
      { class: 'chips' },
      vm.state.cars.map((c) =>
        h(
          'button',
          {
            type: 'button',
            class: `chip${c.id === car.id ? ' chip-on' : ''}`,
            'aria-pressed': c.id === car.id ? 'true' : 'false',
            'data-key': `chip-${c.id}`,
            onclick: () => on.select(c.id),
          },
          icon(ICONS.car, 'icon icon-sm'),
          h('span', { class: 'chip-label' }, carLabel(c)),
          h('span', { class: 'chip-holo' }, c.hologram === 'none' ? 's/h' : c.hologram),
        ),
      ),
      h('button', { type: 'button', class: 'chip chip-add', 'data-key': 'add', onclick: () => on.add() }, icon(ICONS.plus, 'icon icon-sm'), t.addCar),
    ),
    h(
      'div',
      { class: 'car-tools' },
      h(
        'button',
        { type: 'button', class: 'btn btn-ghost btn-sm', 'data-key': 'edit', 'aria-label': t.editCarLabel(carLabel(car)), onclick: () => on.edit(car.id) },
        icon(ICONS.pencil, 'icon icon-sm'),
        t.edit,
      ),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-danger', 'data-key': 'delete', onclick: () => on.remove(car.id) }, t.delete),
    ),
  );
}

function answerCard(vm: ViewModel, car: Car): HTMLElement {
  const { t } = vm;
  const now = evaluateNow(car, vm.now, { contingency: vm.status, today: vm.today });
  const day = now.day;
  const verdict = verdictOf(day);
  const words =
    verdict === 'yes' ? t.verdictYes : verdict === 'no' ? t.verdictNo : verdict === 'partial' ? t.verdictPartial : t.verdictUncertain;
  const hours = hoursLine(day, t, vm.lang);
  const time = formatMinutes(now.local.minutes);
  const notes = noteTexts(day, t);
  return h(
    'section',
    { class: `card answer verdict-${verdict}`, 'aria-labelledby': 'verdict-title' },
    h('p', { class: 'eyebrow' }, `${carLabel(car)} · ${t.hologramShort(car.hologram)}`),
    h('p', { class: 'eyebrow eyebrow-date' }, formatDate(day.date, t, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
    h(
      'div',
      { class: 'verdict-row', role: 'status', 'aria-live': 'polite' },
      icon(VERDICT_ICON[verdict], 'icon verdict-icon'),
      h(
        'h1',
        { id: 'verdict-title', class: 'verdict', tabindex: -1 },
        words[0],
        h('strong', {}, words[1]),
        words[2],
        hours ? ',' : null,
        hours ? h('span', { class: 'verdict-hours' }, ` ${hours}`) : null,
      ),
    ),
    h('ul', { class: 'reasons' }, reasons(day, car, t).map((r) => h('li', {}, r))),
    h('p', { class: 'now' }, icon(ICONS.clock, 'icon icon-sm'), h('span', {}, nowText(now, t), ' ', h('span', { class: 'muted', 'data-clock': true }, t.asOf(time)))),
    notes.length > 0 ? h('ul', { class: 'notes' }, notes.map((n) => h('li', {}, n))) : null,
  );
}

function weekCard(vm: ViewModel, car: Car): HTMLElement {
  const { t } = vm;
  const days = evaluateDays(car, vm.today, 7, { contingency: vm.status, today: vm.today });
  return h(
    'section',
    { class: 'card week', 'aria-labelledby': 'week-title' },
    h('h2', { id: 'week-title' }, t.weekTitle),
    h(
      'ol',
      { class: 'days' },
      days.map((d) => {
        const notes = noteTexts(d, t);
        return h(
          'li',
          { class: `day day-${d.status}` },
          h('span', { class: 'day-label' }, dayLabel(d.date, vm.today, t)),
          h('span', { class: `pill pill-${d.status}` }, icon(STATUS_ICON[d.status], 'icon icon-xs'), pillText(d, t, vm.lang)),
          notes.length > 0 ? h('span', { class: 'day-notes' }, notes.join(' ')) : null,
        );
      }),
    ),
  );
}

function verifyCard(vm: ViewModel, car: Car): HTMLElement {
  const { t } = vm;
  const view = verificationView(verificationFor(car, vm.today), vm.today, t);
  return h(
    'section',
    { class: `card verify verify-${view.tone}`, 'aria-labelledby': 'verify-title' },
    h('h2', { id: 'verify-title' }, t.verifyTitle),
    h('p', { class: 'verify-headline' }, view.headline),
    view.details.map((d) => h('p', { class: 'muted small' }, d)),
    view.sourceUrl ? h('p', { class: 'small' }, extLink(view.sourceUrl, SOURCES.pvvo2026s2.label)) : null,
  );
}

function calendarCard(vm: ViewModel, car: Car, on: Handlers): HTMLElement {
  const { t } = vm;
  const category = categorize(car);
  const hasNoDriveDays = category === 'hologram1' || category === 'hologram2' || category.startsWith('no-hologram');
  const nothing = !hasNoDriveDays && verificationFor(car, vm.today).kind !== 'window';
  const checkbox = h('input', {
    id: 'reminders',
    type: 'checkbox',
    'data-key': 'reminders',
    checked: vm.state.reminders,
    onchange: (e: Event) => on.setReminders((e.target as HTMLInputElement).checked),
  });
  return h(
    'section',
    { class: 'card calendar', 'aria-labelledby': 'calendar-title' },
    h('h2', { id: 'calendar-title' }, t.calendarTitle),
    nothing
      ? h('p', { class: 'muted' }, t.calendarNothing)
      : [
          h('p', { class: 'small' }, t.calendarLead),
          h('div', { class: 'check-row' }, checkbox, h('label', { for: 'reminders' }, t.calendarReminders)),
          h(
            'button',
            { type: 'button', class: 'btn btn-primary btn-block', 'data-key': 'download', onclick: () => on.download() },
            icon(ICONS.calendar, 'icon icon-sm'),
            t.calendarButton,
          ),
          h('p', { class: 'muted small' }, t.calendarCaveat),
        ],
  );
}

function rulesCard(vm: ViewModel): HTMLElement {
  const { t } = vm;
  const sourceIds = ['decretoHnc2014', 'pvvo2026s2', 'pvvo2026s1', 'pcaa2019', 'cameGuiaHnc', 'cameArchivoPrensa', 'sedemaHnc', 'edomexSeguridadHnc'] as const;
  return h(
    'section',
    { class: 'card rules', 'aria-labelledby': 'rules-title' },
    h('h2', { id: 'rules-title' }, t.rulesTitle),
    h('ul', { class: 'rules-list' }, t.rulesItems.map((r) => h('li', {}, r))),
    h(
      'details',
      {},
      h('summary', {}, t.municipalitiesTitle),
      h('p', { class: 'small muted' }, RULES.area.edomex.join(', ')),
    ),
    h('h3', {}, t.sourcesTitle),
    h('ul', { class: 'sources' }, sourceIds.map((id) => h('li', {}, extLink(SOURCES[id].url, SOURCES[id].label)))),
    h('p', { class: 'small' }, extLink(REGLAS, t.sourcesMore)),
  );
}

export function renderMain(root: HTMLElement, vm: ViewModel, on: Handlers): void {
  const car = selectedCar(vm.state);
  if (!car) {
    replaceChildren(
      root,
      h(
        'div',
        { class: 'wrap hero-layout' },
        h(
          'section',
          { class: 'hero', 'aria-labelledby': 'hero-title' },
          h('h1', { id: 'hero-title', class: 'hero-title' }, vm.t.heroTitle),
          h('p', { class: 'hero-lead' }, vm.t.heroLead),
          h('p', { class: 'hero-privacy' }, icon(ICONS.shield, 'icon icon-sm'), vm.t.privacy),
        ),
        h('section', { class: 'card' }, buildCarForm(vm, null, on, true)),
        rulesCard(vm),
      ),
    );
    return;
  }
  replaceChildren(
    root,
    h(
      'div',
      { class: 'wrap layout' },
      h('div', { class: 'col-main' }, carsStrip(vm, on, car), answerCard(vm, car), weekCard(vm, car)),
      h('div', { class: 'col-side' }, verifyCard(vm, car), calendarCard(vm, car, on), rulesCard(vm)),
    ),
  );
}

/* ---------- footer ---------- */

export function renderFooter(root: HTMLElement, vm: ViewModel): void {
  const { t } = vm;
  replaceChildren(
    root,
    h(
      'div',
      { class: 'wrap foot' },
      h('p', { class: 'disclaimer' }, icon(ICONS.alert, 'icon icon-sm'), h('strong', {}, t.footerDisclaimer)),
      h('p', { class: 'small muted' }, t.footerLegal, ' ', t.privacy),
      h(
        'p',
        { class: 'small' },
        `${t.footerMadeBy} `,
        h('a', { href: 'https://pivotek.mx', class: 'link', rel: 'noopener' }, 'Benjamín Esponda García'),
        ' · ',
        h('a', { href: REPO, class: 'link', rel: 'noopener' }, t.footerCode),
        ' · MIT',
      ),
    ),
  );
}
