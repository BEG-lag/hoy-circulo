/**
 * Official sources behind every rule in `rules.ts`.
 *
 * Each rule in the data file points to one or more of these ids. When a source is
 * replaced (for example, a new verification program every semester), add the new
 * entry here, point the rule at it and update `consulted`.
 */

export interface Source {
  /** Short label for the UI and docs. */
  readonly label: string;
  /** Full official title. */
  readonly title: string;
  readonly publisher: string;
  /** Publication date (YYYY-MM-DD), when the document has one. */
  readonly published?: string;
  readonly url: string;
  /** Date the URL was last read to confirm the rule (YYYY-MM-DD). */
  readonly consulted: string;
}

export const SOURCES = {
  decretoHnc2014: {
    label: 'Decreto Hoy No Circula (GODF 19/06/2014)',
    title: 'Decreto por el que se expide el Programa Hoy No Circula en el Distrito Federal',
    publisher: 'Jefatura de Gobierno del Distrito Federal, Gaceta Oficial del Distrito Federal No. 1882',
    published: '2014-06-19',
    url: 'https://www.sedema.cdmx.gob.mx/storage/app/media/programas/hoy-no-circula/decreto-programa-hoy-no-circula-segundo-semestre-2016.pdf',
    consulted: '2026-11-17',
  },
  pvvo2026s2: {
    label: 'PVVO 2.º semestre 2026 (GOCDMX 01/07/2026)',
    title:
      'Aviso por el que se da a conocer el Programa de verificación vehicular obligatoria para el segundo semestre del año 2026',
    publisher: 'Secretaría del Medio Ambiente de la Ciudad de México (SEDEMA), Gaceta Oficial de la CDMX No. 1892',
    published: '2026-07-01',
    url: 'https://proyectos.sedema.cdmx.gob.mx/datos/storage/app/media/gacetas/GOCDMX_26-07-01_DGCA.pdf',
    consulted: '2026-11-17',
  },
  pvvo2026s1: {
    label: 'PVVO 1.er semestre 2026 (GOCDMX 02/01/2026)',
    title:
      'Aviso por el que se da a conocer el programa de verificación vehicular obligatoria para el primer semestre del año 2026',
    publisher: 'Secretaría del Medio Ambiente de la Ciudad de México (SEDEMA), Gaceta Oficial de la CDMX No. 1770',
    published: '2026-01-02',
    url: 'https://proyectos.sedema.cdmx.gob.mx/datos/storage/app/media/gacetas/GOCDMX_26-01-02_DGCA.pdf',
    consulted: '2026-11-17',
  },
  pcaa2019: {
    label: 'Programa de Contingencias CDMX (GOCDMX 28/05/2019)',
    title:
      'Aviso por el que se da a conocer el Programa para Prevenir y Responder a Contingencias Ambientales Atmosféricas en la Ciudad de México',
    publisher: 'SEDEMA, Gaceta Oficial de la CDMX No. 100 Bis',
    published: '2019-05-28',
    url: 'https://data.consejeria.cdmx.gob.mx/portal_old/uploads/gacetas/25a1ef7295458ade0faad3daebb31f05.pdf',
    consulted: '2026-11-17',
  },
  cameGuiaHnc: {
    label: 'Guía HNC en la ZMVM (CAMe)',
    title: 'Programa Hoy No Circula que aplica en la Zona Metropolitana del Valle de México (guía)',
    publisher: 'Comisión Ambiental de la Megalópolis (CAMe)',
    url: 'https://www.gob.mx/cms/uploads/attachment/file/878737/Guia_del_Programa_HNC_02_enero_2024.pdf',
    consulted: '2026-11-17',
  },
  cameComunicado20260912: {
    label: 'Comunicado CAMe 12/09/2026 (Fase I por ozono)',
    title: 'Se activa contingencia ambiental atmosférica por ozono en la Zona Metropolitana del Valle de México',
    publisher: 'Comisión Ambiental de la Megalópolis (CAMe)',
    published: '2026-09-12',
    url: 'https://www.gob.mx/comisionambiental/prensa/se-435677',
    consulted: '2026-11-17',
  },
  cameArchivoPrensa: {
    label: 'Comunicados de la CAMe',
    title: 'Archivo de prensa de la Comisión Ambiental de la Megalópolis',
    publisher: 'Comisión Ambiental de la Megalópolis (CAMe)',
    url: 'https://www.gob.mx/comisionambiental/es/archivo/prensa',
    consulted: '2026-11-17',
  },
  sedemaHnc: {
    label: 'SEDEMA: Hoy No Circula',
    title: 'Programa Hoy No Circula',
    publisher: 'Secretaría del Medio Ambiente de la Ciudad de México (SEDEMA)',
    url: 'https://www.sedema.cdmx.gob.mx/programas/programa/hoy-no-circula',
    consulted: '2026-11-17',
  },
  edomexSeguridadHnc: {
    label: 'Edomex: Hoy No Circula',
    title: 'Hoy no Circula (estado de contingencias y municipios)',
    publisher: 'Secretaría de Seguridad del Estado de México',
    url: 'https://sseguridad.edomex.gob.mx/hoy-no-circula',
    consulted: '2026-11-17',
  },
  lftArt74: {
    label: 'LFT, art. 74',
    title: 'Ley Federal del Trabajo, artículo 74 (días de descanso obligatorio)',
    publisher: 'Cámara de Diputados del H. Congreso de la Unión',
    url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf',
    consulted: '2026-11-17',
  },
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;
