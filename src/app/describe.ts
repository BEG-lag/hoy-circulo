/**
 * Turns engine results into user-facing sentences. Pure functions (no DOM), so
 * they are unit-tested in both languages.
 */
import { SOURCES } from '../rules/sources.ts';
import { addDays, daysBetween, formatMinutes, parseDate, type LocalDate } from '../engine/dates.ts';
import type { DayEvaluation, NowEvaluation, Vehicle } from '../engine/hnc.ts';
import { colorForDigit, weekdayForDigit } from '../engine/plate.ts';
import type { VerificationInfo } from '../engine/verification.ts';
import type { EffectiveStatus } from '../contingency/status.ts';
import type { Dict, Lang } from './i18n.ts';

export type Verdict = 'yes' | 'no' | 'partial' | 'uncertain';

export function verdictOf(day: DayEvaluation): Verdict {
  switch (day.status) {
    case 'free':
      return 'yes';
    case 'restricted':
      return 'no';
    case 'partial':
      return 'partial';
    case 'uncertain':
      return 'uncertain';
  }
}

function utc(date: LocalDate): Date {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function formatDate(date: LocalDate, t: Dict, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(t.locale, { ...opts, timeZone: 'UTC' }).format(utc(date));
}

/** Weekday name (0 = Sunday), lowercase in Spanish as Intl writes it. */
export function weekdayName(weekday: number, t: Dict): string {
  // 2026-11-15 is a Sunday.
  return formatDate(addDays('2026-11-15', weekday), t, { weekday: 'long' });
}

export function listOf(items: readonly (string | number)[], lang: Lang): string {
  return new Intl.ListFormat(lang === 'es' ? 'es' : 'en', { style: 'long', type: 'conjunction' }).format(items.map(String));
}

function restrictedWeekdayName(v: Vehicle, t: Dict): string {
  return weekdayName(weekdayForDigit(v.digit), t);
}

/** Why the vehicle can or cannot drive that day (one sentence per reason). */
export function reasons(day: DayEvaluation, v: Vehicle, t: Dict): string[] {
  const out: string[] = [];
  const color = t.colors[colorForDigit(v.digit)];
  for (const r of day.restrictions) {
    switch (r.code) {
      case 'weekday':
        out.push(t.reasonWeekday(v.digit, color, restrictedWeekdayName(v, t)));
        break;
      case 'saturday': {
        if (day.category === 'hologram1') {
          const nth = Math.floor((parseDate(day.date).day - 1) / 7);
          out.push(t.reasonSaturdayH1(t.nth[nth] ?? '', v.digit % 2 === 1 ? t.odd : t.even));
        } else if (day.category === 'hologram2') out.push(t.reasonSaturdayAll);
        else out.push(t.reasonSaturdayNoHologram);
        break;
      }
      case 'foreign-morning':
        out.push(t.reasonForeignMorning);
        break;
      case 'contingency':
        out.push(t.reasonContingency);
        break;
    }
  }
  if (out.length > 0) return out;

  switch (day.category) {
    case 'exempt-hologram':
      return [t.freeExemptHologram(v.hologram)];
    case 'exempt-electric':
      return [t.freeElectric];
    case 'exempt-disability':
      return [t.freeDisability];
    case 'exempt-tourist-pass':
      return [t.freeTouristPass];
    default:
      break;
  }
  if (day.weekday === 0) return [t.freeSunday];
  if (day.weekday === 6) {
    if (day.notes.some((n) => n.code === 'fifth-saturday-free')) return [];
    const odd = v.digit % 2 === 1;
    return [t.freeSaturdayH1(odd ? t.odd : t.even, odd ? t.firstThird : t.secondFourth)];
  }
  return [t.freeNotYourDay(restrictedWeekdayName(v, t))];
}

export function noteTexts(day: DayEvaluation, t: Dict): string[] {
  return day.notes.flatMap((n) => {
    if (n.code === 'sunday') return [];
    if (n.code === 'holiday-applies') return [t.notes['holiday-applies'](n.holiday ?? '')];
    return [t.notes[n.code]];
  });
}

function ranges(day: DayEvaluation): string[] {
  return day.windows.map((w) => `${formatMinutes(w.from)}-${formatMinutes(w.to)}`);
}

export function pillText(day: DayEvaluation, t: Dict, lang: Lang): string {
  switch (day.status) {
    case 'free':
      return t.pillFree;
    case 'restricted': {
      const w = day.windows.find((x) => x.to - x.from >= 17 * 60) ?? day.windows[0];
      return w ? t.pillRestricted(formatMinutes(w.from), formatMinutes(w.to)) : t.pillFree;
    }
    case 'partial':
      return t.pillPartial(listOf(ranges(day), lang));
    case 'uncertain':
      return day.windows.length > 0 ? `${t.pillPartial(listOf(ranges(day), lang))} · ${t.pillUncertain}` : t.pillUncertain;
  }
}

export function hoursLine(day: DayEvaluation, t: Dict, lang: Lang): string | null {
  if (day.windows.length === 0) return null;
  if (day.status === 'restricted' && day.windows.length === 1) {
    const w = day.windows[0];
    return w ? t.hoursRange(formatMinutes(w.from), formatMinutes(w.to)) : null;
  }
  return listOf(
    day.windows.map((w) => t.hoursRange(formatMinutes(w.from), formatMinutes(w.to))),
    lang,
  );
}

export function nowText(now: NowEvaluation, t: Dict): string {
  if (now.canDriveNow === 'no') return t.nowNo(formatMinutes(now.until ?? 0));
  if (now.canDriveNow === 'uncertain') return t.nowUncertain;
  if (now.nextFrom !== null) return t.nowYesUntil(formatMinutes(now.nextFrom));
  return t.nowYes;
}

export function dayLabel(date: LocalDate, today: LocalDate, t: Dict): string {
  const full = formatDate(date, t, { weekday: 'short', day: 'numeric', month: 'short' });
  const diff = daysBetween(today, date);
  if (diff === 0) return `${t.today} · ${full}`;
  if (diff === 1) return `${t.tomorrow} · ${full}`;
  return full;
}

export interface VerificationView {
  readonly headline: string;
  readonly details: readonly string[];
  readonly tone: 'now' | 'later' | 'none';
  readonly sourceUrl: string | null;
}

export function verificationView(info: VerificationInfo, today: LocalDate, t: Dict): VerificationView {
  if (info.kind === 'exempt') {
    return {
      headline: info.reason === 'hologram-00' ? t.verifyExempt00 : t.verifyExemptE,
      details: [],
      tone: 'none',
      sourceUrl: SOURCES.pvvo2026s2.url,
    };
  }
  if (info.kind === 'not-applicable') {
    return { headline: t.verifyOtherState, details: [], tone: 'none', sourceUrl: SOURCES.pvvo2026s2.url };
  }
  const w = info.window;
  const monthName = (m: number) => formatDate(`2026-${String(m).padStart(2, '0')}-01`, t, { month: 'long' });
  const months = t.monthsRange(monthName(w.months[0]), monthName(w.months[1]), w.end.slice(0, 4));
  const details: string[] = [];
  if (info.current) details.push(t.verifyDaysLeft(daysBetween(today, w.end) + 1));
  else details.push(t.verifyDaysUntil(daysBetween(today, w.start)));
  if (w.projected) details.push(t.verifyProjected);
  if (info.calendar === 'edomex') details.push(t.verifyEdomex);
  return {
    headline: info.current ? t.verifyCurrent(months) : t.verifyNext(months),
    details,
    tone: info.current ? 'now' : 'later',
    sourceUrl: w.source ? SOURCES[w.source].url : SOURCES.pvvo2026s2.url,
  };
}

export interface BannerView {
  readonly tone: 'ok' | 'warn' | 'alert' | 'muted';
  readonly title: string;
  readonly lines: readonly string[];
  readonly links: readonly { readonly href: string; readonly label: string; readonly title?: string }[];
}

const AIRE_URL = 'http://www.aire.cdmx.gob.mx/';

export function bannerView(eff: EffectiveStatus | null, today: LocalDate, t: Dict, lang: Lang): BannerView {
  const archive = { href: SOURCES.cameArchivoPrensa.url, label: t.contingencyArchive };
  const aire = { href: AIRE_URL, label: t.contingencyAire };
  if (!eff || eff.state === 'unknown') {
    return { tone: 'muted', title: t.contingencyUnknown, lines: [t.contingencyUnknownHelp], links: [archive, aire] };
  }
  const s = eff.status;
  const lines: string[] = [];
  const links: { href: string; label: string; title?: string }[] = [];
  if (s.communique) {
    const date = formatDate(s.communique.date, t, { day: 'numeric', month: 'short', year: 'numeric' });
    lines.push(t.contingencyLatest(date, t.communiqueKinds[s.communique.kind]));
    links.push({ href: s.communique.url, label: t.contingencyOfficial, title: s.communique.title });
  }
  links.push(archive, aire);
  const checked = eff.ageMinutes !== null ? t.contingencyChecked(Math.max(0, eff.ageMinutes)) : null;

  if (eff.state === 'none') {
    return { tone: 'ok', title: t.contingencyNone, lines: [...lines, ...(checked ? [checked] : [])], links };
  }
  if (eff.state === 'preventive') {
    return { tone: 'warn', title: t.contingencyPreventive, lines: [...lines, ...(checked ? [checked] : [])], links };
  }
  const title = s.phase ? t.contingencyActive(s.phase, s.pollutant ? t.pollutants[s.pollutant] : '') : t.contingencyActiveNoPhase;
  const detail: string[] = [];
  for (const r of s.restrictions.filter((x) => x.date >= today)) {
    const day = formatDate(r.date, t, { weekday: 'long', day: 'numeric', month: 'long' });
    const parts: string[] = [];
    if (r.hologram2) parts.push(t.contingencyH2);
    if (r.hologram1Digits) parts.push(t.contingencyH1(listOf(r.hologram1Digits, lang)));
    if (r.hologram0Digits) {
      const color = r.hologram0Color ? t.colors[r.hologram0Color] : '';
      parts.push(t.contingencyH0(color, listOf(r.hologram0Digits, lang)));
    }
    if (!r.hologram1Digits || !r.hologram0Digits) parts.push(t.contingencyUnreadable);
    detail.push(`${t.contingencyRestrictionsFor(day)} ${parts.join('; ')}.`);
  }
  return { tone: 'alert', title, lines: [...detail, ...lines, ...(checked ? [checked] : [])], links };
}
