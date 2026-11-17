/**
 * Hoy No Circula, verification and contingency rules for the Zona Metropolitana
 * del Valle de México (ZMVM), modeled as data.
 *
 * Every block cites the official source ids from `sources.ts`. The engine in
 * `src/engine` only reads this file, so updating a rule (for example, a new
 * verification program each semester) should not require touching code.
 *
 * Reviewed against the official documents on 2026-11-17. See docs/reglas.md for
 * the article-by-article references.
 */
import type { SourceId } from './sources.ts';

export type Color = 'amarillo' | 'rosa' | 'rojo' | 'verde' | 'azul';
/** 1 = Monday ... 5 = Friday (same numbering as Date#getUTCDay). */
export type Weekday = 1 | 2 | 3 | 4 | 5;
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface TimeWindow {
  /** Local time in Mexico City, HH:MM, inclusive. */
  readonly from: string;
  /** Local time in Mexico City, HH:MM, exclusive. */
  readonly to: string;
}

export interface Suspension {
  /** YYYY-MM-DD (Mexico City). */
  readonly date: string;
  readonly reason: string;
  readonly url: string;
}

export interface VerificationProgram {
  readonly id: string;
  /** First day the program is in force (YYYY-MM-DD). */
  readonly from: string;
  /** Last day the program is in force (YYYY-MM-DD). */
  readonly to: string;
  readonly source: SourceId;
}

export const RULES = {
  /** Date of the last full review of this file against the sources. */
  reviewed: '2026-11-17',
  timezone: 'America/Mexico_City',

  /**
   * Restricted hours for the weekday and Saturday restrictions.
   * Decreto HNC 2014, tablas 1 y 2: "de las 05:00 a las 22:00 horas".
   */
  hours: { from: '05:00', to: '22:00', sources: ['decretoHnc2014', 'cameGuiaHnc'] },

  /**
   * One weekday per engomado color / last numeric plate digit.
   * Decreto HNC 2014, tablas 1 y 2; CAMe guía HNC; confirmed on hoynocircula.cdmx.gob.mx.
   */
  weekdays: [
    { weekday: 1, color: 'amarillo', digits: [5, 6] },
    { weekday: 2, color: 'rosa', digits: [7, 8] },
    { weekday: 3, color: 'rojo', digits: [3, 4] },
    { weekday: 4, color: 'verde', digits: [1, 2] },
    { weekday: 5, color: 'azul', digits: [9, 0] },
  ] as const satisfies readonly { weekday: Weekday; color: Color; digits: readonly [number, number] }[],
  weekdaySources: ['decretoHnc2014', 'cameGuiaHnc'] satisfies SourceId[],

  saturdays: {
    /**
     * Holograma 1: two Saturdays a month by parity of the last digit.
     * Decreto HNC 2014, tabla 1: odd digits rest on the 1st and 3rd Saturday,
     * even digits on the 2nd and 4th. PVVO 2026 (2.º sem.), numeral 14.2 fr. I:
     * on a 5th Saturday they "podrán circular de acuerdo con las condiciones
     * ambientales" announced by SEDEMA or CAMe.
     */
    hologram1: {
      oddRestOn: [1, 3],
      evenRestOn: [2, 4],
      fifthSaturdayFree: true,
      sources: ['decretoHnc2014', 'pvvo2026s2', 'cameGuiaHnc'] satisfies SourceId[],
    },
    /** Holograma 2 and vehicles treated like it: every Saturday. Decreto HNC 2014, tabla 2. */
    hologram2: { sources: ['decretoHnc2014', 'pvvo2026s2'] satisfies SourceId[] },
  },

  /**
   * Plates from outside the Megalópolis (and Guanajuato) or from abroad without a
   * recognized hologram: treated like holograma 2 plus Monday to Friday from
   * 05:00 to 11:00. Decreto HNC 2014, numeral V y tabla 3; PVVO 2026 (2.º sem.),
   * numeral 14.2 fr. IV. The same numeral applies to cars registered in a
   * Megalópolis state (Edomex included) that have no valid hologram.
   */
  foreignMorning: {
    from: '05:00',
    to: '11:00',
    weekdays: [1, 2, 3, 4, 5] satisfies Weekday[],
    sources: ['decretoHnc2014', 'pvvo2026s2', 'cameGuiaHnc'] satisfies SourceId[],
  },

  /**
   * Cars registered in Mexico City without a valid verification: like holograma 2
   * (weekday and every Saturday), without the morning restriction.
   * PVVO 2026 (2.º sem.), numeral 14.2 fr. V.
   */
  noHologramLocalSources: ['pvvo2026s2'] satisfies SourceId[],

  /**
   * Holograms and conditions exempt from Hoy No Circula on normal days.
   * PVVO 2026 (2.º sem.), numeral 14.1: fr. V y VI (eléctricos, híbridos),
   * X ("Exento"), XI ("00"), XII ("0"), XV (placas para personas con
   * discapacidad), XVI (Pase Turístico).
   */
  exemptions: {
    holograms: ['E', '00', '0'],
    disabilityPlate: true,
    touristPass: true,
    sources: ['pvvo2026s2', 'decretoHnc2014', 'cameGuiaHnc'] satisfies SourceId[],
  },

  /**
   * Plates made only of letters follow the blue (9 or 0) day and count as even.
   * Decreto HNC 2014, numeral X; PVVO 2026 (2.º sem.), numeral 5.1.3.
   */
  lettersOnlyPlate: { digit: 0, sources: ['decretoHnc2014', 'pvvo2026s2'] satisfies SourceId[] },

  /**
   * The program is NOT suspended automatically on holidays. Decreto HNC 2014,
   * numeral XI: the environmental authority "emitirá el aviso" when it suspends
   * it. Add each official suspension notice here (date + link).
   */
  suspensions: [] as readonly Suspension[],
  suspensionSources: ['decretoHnc2014'] satisfies SourceId[],

  /**
   * Holidays under Ley Federal del Trabajo, art. 74 (fr. I a VI y VIII). Used
   * only to warn that the program still applies on these days. Fr. VII
   * (October 1st every six years) and fr. IX (election days) are not modeled.
   */
  holidays: {
    fixed: [
      { month: 1, day: 1, name: 'Año Nuevo' },
      { month: 5, day: 1, name: 'Día del Trabajo' },
      { month: 9, day: 16, name: 'Día de la Independencia' },
      { month: 12, day: 25, name: 'Navidad' },
    ],
    /** nth Monday of a month. */
    mondays: [
      { month: 2, nth: 1, name: 'Día de la Constitución' },
      { month: 3, nth: 3, name: 'Natalicio de Benito Juárez' },
      { month: 11, nth: 3, name: 'Día de la Revolución' },
    ],
    sources: ['lftArt74'] satisfies SourceId[],
  },

  verification: {
    /**
     * Two-month windows per engomado color. Same pattern in both 2026 programs.
     * PVVO 2026 1.er sem., tabla 1; PVVO 2026 2.º sem., tabla 1.
     */
    windows: {
      amarillo: [[1, 2], [7, 8]],
      rosa: [[2, 3], [8, 9]],
      rojo: [[3, 4], [9, 10]],
      verde: [[4, 5], [10, 11]],
      azul: [[5, 6], [11, 12]],
    } as const satisfies Record<Color, readonly [readonly [Month, Month], readonly [Month, Month]]>,
    /**
     * Programs actually published. Windows that fall outside these dates are
     * shown as projections, because SEDEMA publishes each semester separately.
     */
    publishedPrograms: [
      { id: '2026-1', from: '2026-01-01', to: '2026-06-30', source: 'pvvo2026s1' },
      { id: '2026-2', from: '2026-07-01', to: '2026-12-31', source: 'pvvo2026s2' },
    ] as readonly VerificationProgram[],
    /** Holograma "00" does not need to verify while it is valid (up to two years). PVVO 2026, numerales 4.8 y 5.1. */
    hologram00Exempt: true,
    sources: ['pvvo2026s1', 'pvvo2026s2'] satisfies SourceId[],
  },

  contingency: {
    /**
     * Vehicle restrictions in Fase I and Fase II for ozone (and Fase I in the
     * whole ZMVM or Fase II for particles): same row in both phases.
     * Programa de Contingencias CDMX 2019, tablas 3 y 4 (rows shaded for Fase I
     * and Fase II). Applies from 05:00 to 22:00, in addition to Hoy No Circula:
     * - holograma 2: all;
     * - holograma 1: odd or even plate endings, alternating "con base en la
     *   última activación" (so only the CAMe communiqué says which);
     * - holograma 0 y 00: the plate endings restricted that day by Hoy No
     *   Circula; on Saturdays and Sundays CAMe rotates colors starting with
     *   amarillo, then rosa, rojo, verde, azul.
     * The CAMe communiqués add that cars without a hologram (foreign plates,
     * tourist pass, permits, letters-only plates) are treated like holograma 2,
     * and that electric and hybrid cars, Exento holograms and disability plates
     * are exempt (comunicado CAMe 12/09/2026).
     */
    hours: { from: '05:00', to: '22:00' },
    weekendColorRotation: ['amarillo', 'rosa', 'rojo', 'verde', 'azul'] satisfies Color[],
    sources: ['pcaa2019', 'cameComunicado20260912'] satisfies SourceId[],
  },

  /** Where the program applies. CAMe guía HNC (16 alcaldías + 18 municipios). */
  area: {
    cdmx: [
      'Álvaro Obregón', 'Azcapotzalco', 'Benito Juárez', 'Coyoacán', 'Cuajimalpa de Morelos', 'Cuauhtémoc',
      'Gustavo A. Madero', 'Iztacalco', 'Iztapalapa', 'La Magdalena Contreras', 'Miguel Hidalgo', 'Milpa Alta',
      'Tláhuac', 'Tlalpan', 'Venustiano Carranza', 'Xochimilco',
    ],
    edomex: [
      'Atizapán de Zaragoza', 'Coacalco de Berriozábal', 'Cuautitlán', 'Cuautitlán Izcalli', 'Chalco', 'Chicoloapan',
      'Chimalhuacán', 'Ecatepec de Morelos', 'Huixquilucan', 'Ixtapaluca', 'La Paz', 'Naucalpan de Juárez',
      'Nezahualcóyotl', 'Nicolás Romero', 'Tecámac', 'Tlalnepantla de Baz', 'Tultitlán', 'Valle de Chalco Solidaridad',
    ],
    sources: ['cameGuiaHnc', 'edomexSeguridadHnc'] satisfies SourceId[],
  },
} as const;

export type Rules = typeof RULES;
