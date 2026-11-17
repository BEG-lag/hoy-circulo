import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildStatus,
  classifyTitle,
  communiquesToFetch,
  decodeEntities,
  htmlToText,
  parseArchive,
  parseCommunique,
  type ArchiveItem,
} from '../src/contingency/parse.ts';
import { effectiveStatus, emptyStatus, parseStatus } from '../src/contingency/status.ts';

const fixture = (name: string) => readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

const archive = parseArchive(fixture('came-archivo-2026-11-17.js'));
const archive2 = parseArchive(fixture('came-archivo-pagina2-2026-11-17.js'));

const PAGES = new Map<string, string>([
  ['https://www.gob.mx/comisionambiental/prensa/se-435677', fixture('came-2026-09-12-activa.html')],
  ['https://www.gob.mx/comisionambiental/prensa/se-435687', fixture('came-2026-09-12-mantiene.html')],
  ['https://www.gob.mx/comisionambiental/prensa/se-435690', fixture('came-2026-09-13-continua.html')],
  ['https://www.gob.mx/comisionambiental/prensa/se-435707', fixture('came-2026-09-13-suspende.html')],
]);

/** The archive as it looked at a given moment (items published up to then). */
function archiveAt(local: string): ArchiveItem[] {
  return archive.filter((i) => i.published <= local);
}

describe('archive parsing', () => {
  it('reads date, time, title and absolute URL of each item', () => {
    expect(archive).toHaveLength(9);
    expect(archive[0]).toEqual({
      title: 'Presenta CAMe resultados del proyecto Análisis origen-destino de viajes y estimación de emisiones',
      url: 'https://www.gob.mx/comisionambiental/prensa/presenta-came-resultados-del-proyecto-analisis-origen-destino-de-viajes-y-estimacion-de-emisiones',
      published: '2026-10-09 17:50:00',
      date: '2026-10-09',
    });
    expect(archive.find((i) => i.url.endsWith('se-435677'))?.published).toBe('2026-09-12 15:17:00');
  });

  it('ignores links outside gob.mx', () => {
    const js = '$("#prensa").append("<time datetime=\\"2026-01-01 10:00:00\\">x</time><h2>SE ACTIVA CONTINGENCIA</h2><a href=\\"https://evil.example/x\\">y</a>");';
    expect(parseArchive(js)).toEqual([]);
  });

  it('classifies titles', () => {
    expect(classifyTitle('SE ACTIVA CONTINGENCIA AMBIENTAL ATMOSFÉRICA POR OZONO EN LA ZMVM')).toBe('activa');
    expect(classifyTitle('SE MANTIENE LA FASE I DE CONTINGENCIA AMBIENTAL')).toBe('mantiene');
    expect(classifyTitle('CONTINÚA LA FASE I DE CONTINGENCIA AMBIENTAL ATMOSFÉRICA POR OZONO')).toBe('mantiene');
    expect(classifyTitle('SE SUSPENDE LA FASE I DE CONTINGENCIA AMBIENTAL')).toBe('suspende');
    expect(classifyTitle('SE SUSPENDE LA CONTINGENCIA AMBIENTAL ATMOSFÉRICA POR OZONO')).toBe('suspende');
    expect(classifyTitle('Se activa la Fase Preventiva por ozono')).toBe('preventiva');
    expect(classifyTitle('Seminario virtual sobre ozono troposférico persistente en ciudades')).toBeNull();
    expect(classifyTitle('Balance de la contingencia del año')).toBe('otro');
  });
});

describe('communiqué parsing (real CAMe texts)', () => {
  it('reads the 12 Sep 2026 activation (restrictions for Sunday 13)', () => {
    const d = parseCommunique(fixture('came-2026-09-12-activa.html'), '2026-09-12');
    expect(d.phase).toBe('I');
    expect(d.pollutant).toBe('ozono');
    expect(d.restriction).toEqual({
      date: '2026-09-13',
      from: '5:00',
      to: '22:00',
      hologram2: true,
      hologram1Digits: [1, 3, 5, 7, 9],
      hologram0Digits: [7, 8],
      hologram0Color: 'rosa',
    });
  });

  it('reads "Hoy domingo" in the morning bulletin', () => {
    const d = parseCommunique(fixture('came-2026-09-13-continua.html'), '2026-09-13');
    expect(d.restriction?.date).toBe('2026-09-13');
    expect(d.restriction?.hologram0Digits).toEqual([7, 8]);
  });

  it('reads the "cuyo último dígito numérico sea" wording (25 Apr 2026)', () => {
    const d = parseCommunique(fixture('came-2026-04-25-activa.html'), '2026-04-25');
    expect(d.restriction).toMatchObject({
      date: '2026-04-26',
      hologram2: true,
      hologram1Digits: [0, 2, 4, 6, 8],
      hologram0Digits: [5, 6],
      hologram0Color: 'amarillo',
    });
  });

  it('keeps extra digits listed for holograma 1 (10 Mar 2026: 1, 3, 4, 5, 7 y 9)', () => {
    const d = parseCommunique(fixture('came-2026-03-10-mantiene.html'), '2026-03-10');
    expect(d.restriction).toMatchObject({
      date: '2026-03-11',
      hologram1Digits: [1, 3, 4, 5, 7, 9],
      hologram0Digits: [3, 4],
      hologram0Color: 'rojo',
    });
  });

  it('finds no restrictions in a suspension', () => {
    expect(parseCommunique(fixture('came-2026-09-13-suspende.html'), '2026-09-13').restriction).toBeNull();
  });

  it('falls back to the sticker color when the endings are missing, and to null otherwise', () => {
    const html = `<p>Restricciones a la circulación en el Sector Transporte</p>
      <p>Mañana lunes 14 de septiembre, deberán suspender su circulación, en horario de las 5:00 a las 22:00 horas:</p>
      <p>1. Los vehículos de uso particular con holograma de verificación 2.</p>
      <p>2. Los vehículos de uso particular con holograma de verificación 1, según se informe.</p>
      <p>3. Los vehículos de uso particular con holograma de verificación 0 y 00, engomado amarillo.</p>
      <p>Exenciones</p>`;
    const d = parseCommunique(html, '2026-09-13');
    expect(d.restriction).toMatchObject({ date: '2026-09-14', hologram1Digits: null, hologram0Digits: [5, 6] });
  });

  it('resolves the year across New Year', () => {
    const html = `<p>Restricciones a la circulación</p><p>Mañana viernes 1 de enero, deberán suspender su circulación:</p>
      <p>Los vehículos de uso particular con holograma de verificación 2.</p><p>Exenciones</p>`;
    expect(parseCommunique(html, '2026-12-31').restriction?.date).toBe('2027-01-01');
  });

  it('decodes entities and strips markup', () => {
    expect(decodeEntities('Ma&ntilde;ana &ldquo;00&rdquo; &#39;x&#39; &#x41; &unknown;')).toBe('Mañana "00" \'x\' A &unknown;');
    expect(htmlToText('<p>a <strong>b</strong></p><script>x</script><p>c</p>')).toBe('a b\nc');
  });
});

describe('status from the archive', () => {
  it('is "none" today (latest contingency communiqué is the 13 Sep 2026 suspension)', () => {
    const s = buildStatus(archive, PAGES, new Date('2026-11-17T19:00:00Z'));
    expect(s.state).toBe('none');
    expect(s.communique).toMatchObject({ kind: 'suspende', date: '2026-09-13' });
    expect(communiquesToFetch(archive)).toEqual([]);
  });

  it('is "active" with the restrictions for the next day after the 15:17 activation', () => {
    const items = archiveAt('2026-09-12 16:00:00');
    expect(communiquesToFetch(items)).toEqual(['https://www.gob.mx/comisionambiental/prensa/se-435677']);
    const s = buildStatus(items, PAGES, new Date('2026-09-12T16:00:00-06:00'));
    expect(s).toMatchObject({ state: 'active', phase: 'I', pollutant: 'ozono', error: null });
    expect(s.restrictions.map((r) => r.date)).toEqual(['2026-09-13']);
  });

  it('merges the run of bulletins, newest wins', () => {
    const items = archiveAt('2026-09-13 10:00:00');
    expect(communiquesToFetch(items)).toHaveLength(3);
    const s = buildStatus(items, PAGES, new Date('2026-09-13T10:00:00-06:00'));
    expect(s.state).toBe('active');
    expect(s.communique?.kind).toBe('mantiene');
    expect(s.restrictions).toHaveLength(1);
  });

  it('flags a communiqué that could not be fetched', () => {
    const items = archiveAt('2026-09-12 16:00:00');
    const s = buildStatus(items, new Map(), new Date('2026-09-12T16:00:00-06:00'));
    expect(s.state).toBe('active');
    expect(s.error).toBe('communique-not-fetched');
    expect(s.restrictions).toEqual([]);
  });

  it('flags restrictions that could not be read', () => {
    const items = archiveAt('2026-09-12 16:00:00');
    const pages = new Map([['https://www.gob.mx/comisionambiental/prensa/se-435677', '<p>texto distinto</p>']]);
    expect(buildStatus(items, pages, new Date('2026-09-12T16:00:00-06:00')).error).toBe('restrictions-not-parsed');
  });

  it('becomes "unknown" when an active contingency has had no bulletin for 36 hours', () => {
    const items = archiveAt('2026-09-12 16:00:00');
    const s = buildStatus(items, PAGES, new Date('2026-09-14T06:00:00-06:00'));
    expect(s.state).toBe('unknown');
    expect(s.error).toBe('active-but-silent');
  });

  it('is "unknown" for an empty archive and "none" when no item is about contingencies', () => {
    expect(buildStatus([], PAGES, new Date()).state).toBe('unknown');
    const unrelated = archive.filter((i) => classifyTitle(i.title) === null);
    expect(buildStatus(unrelated, PAGES, new Date()).state).toBe('none');
  });

  it('reads page 2 of the archive (April and March 2026 episodes)', () => {
    const april = archive2.filter((i) => i.published <= '2026-04-25 15:00:00');
    expect(communiquesToFetch(april)).toEqual([
      'https://www.gob.mx/comisionambiental/prensa/se-activa-contingencia-ambiental-atmosferica-por-ozono-en-la-zona-metropolitana-del-valle-de-mexico-zmvm-424526',
    ]);
  });
});

describe('status.json validation', () => {
  const now = new Date('2026-11-17T19:00:00Z');
  const good = {
    schema: 1,
    checkedAt: '2026-11-17T18:45:00Z',
    state: 'none',
    phase: null,
    pollutant: null,
    communique: { title: 'SE SUSPENDE', url: 'https://www.gob.mx/comisionambiental/prensa/se-435707', date: '2026-09-13', kind: 'suspende' },
    restrictions: [],
    error: null,
  };

  it('accepts a fresh status', () => {
    const e = effectiveStatus(good, now);
    expect(e).toMatchObject({ state: 'none', unknownReason: null, ageMinutes: 15 });
  });

  it('treats missing, invalid, stale or future data as unknown', () => {
    expect(effectiveStatus(undefined, now).unknownReason).toBe('missing');
    expect(effectiveStatus({ schema: 2 }, now).unknownReason).toBe('invalid');
    expect(effectiveStatus({ ...good, state: 'maybe' }, now).unknownReason).toBe('invalid');
    expect(effectiveStatus({ ...good, checkedAt: null }, now).unknownReason).toBe('missing');
    expect(effectiveStatus({ ...good, checkedAt: '2026-11-17T10:00:00Z' }, now).unknownReason).toBe('stale');
    expect(effectiveStatus({ ...good, checkedAt: '2026-11-17T23:00:00Z' }, now).unknownReason).toBe('stale');
    expect(effectiveStatus({ ...good, state: 'unknown', error: 'fetch-failed' }, now).unknownReason).toBe('source-error');
    expect(effectiveStatus({ ...good, state: 'unknown' }, now).unknownReason).toBe('unparsed');
  });

  it('drops links outside gob.mx and malformed restrictions', () => {
    const s = parseStatus({
      ...good,
      state: 'active',
      communique: { ...good.communique, url: 'https://evil.example/' },
      restrictions: [
        { date: '2026-11-18', from: '5:00', to: '22:00', hologram2: true, hologram1Digits: [1, 3], hologram0Digits: null, hologram0Color: 'rosa' },
        { date: 'mañana', from: '5:00', to: '22:00', hologram2: true, hologram1Digits: [], hologram0Digits: [] },
        { date: '2026-11-18', from: '5:00', to: '22:00', hologram2: true, hologram1Digits: [12], hologram0Digits: [] },
        { date: '2026-11-18', from: '5:00', to: '22:00', hologram2: 'yes', hologram1Digits: [], hologram0Digits: [] },
      ],
    });
    expect(s?.communique).toBeNull();
    expect(s?.restrictions).toHaveLength(1);
  });

  it('builds an empty status', () => {
    expect(emptyStatus('x')).toMatchObject({ state: 'unknown', error: 'x', checkedAt: null });
  });
});
