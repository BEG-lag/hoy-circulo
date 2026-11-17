# Reglas y fuentes oficiales

Este documento explica cada regla que aplica **hoy·circulo**, de qué documento oficial sale, en qué numeral, y qué tan verificada está. Las reglas viven como datos en [`src/rules/rules.ts`](../src/rules/rules.ts) y las fuentes en [`src/rules/sources.ts`](../src/rules/sources.ts).

- **Fecha de consulta de todas las fuentes:** 17 de noviembre de 2026.
- **Advertencia:** herramienta no oficial. Este documento no constituye opinión legal ni asesoría fiscal; lo que diga un aviso oficial de la SEDEMA, del Gobierno del Estado de México o de la Comisión Ambiental de la Megalópolis (CAMe) prevalece sobre esta aplicación. Ante cualquier duda, valídalo con la autoridad competente.

## Índice y semáforo de verificación

- **VERDE:** leído directamente en el documento oficial vigente.
- **AMARILLO:** fuente oficial, pero con un matiz (texto condicional, dos documentos que no coinciden, o regla que depende de cada comunicado).
- **ROJO:** no verificado en fuente oficial primaria, o no modelado.

| # | Tema | Semáforo |
|---|------|----------|
| 1 | [Día entre semana por engomado y terminación](#1-día-entre-semana) | VERDE |
| 2 | [Horario](#2-horario) | VERDE |
| 3 | [Sábados por holograma](#3-sábados) | VERDE |
| 4 | [Quinto sábado](#4-quinto-sábado) | AMARILLO |
| 5 | [Exenciones](#5-exenciones) | VERDE |
| 6 | [Placas de otros estados, extranjeras y Pase Turístico](#6-placas-de-otros-estados-y-extranjeras) | VERDE |
| 7 | [Autos sin verificación vigente](#7-autos-sin-verificación-vigente) | VERDE |
| 8 | [Qué dígito de la placa cuenta](#8-qué-dígito-cuenta) | AMARILLO |
| 9 | [Días festivos](#9-días-festivos) | VERDE |
| 10 | [Dónde aplica (alcaldías y municipios)](#10-dónde-aplica) | AMARILLO |
| 11 | [Calendario de verificación CDMX 2026](#11-calendario-de-verificación) | VERDE |
| 12 | [Calendario de verificación 2027 y del Estado de México](#12-verificación-2027-y-estado-de-méxico) | ROJO |
| 13 | [Contingencias: medidas por holograma](#13-contingencias-ambientales) | AMARILLO |
| 14 | [Estado de contingencia en vivo](#14-estado-de-contingencia-en-vivo) | AMARILLO |
| 15 | [Lo que no se modela](#15-lo-que-no-se-modela) | ROJO |
| 16 | [Fuentes consultadas](#16-fuentes-consultadas) | |

## 1. Día entre semana

De lunes a viernes, cada auto descansa un día según el color del engomado o el último dígito numérico de su placa:

| Engomado | Terminación | Día |
|----------|-------------|-----|
| Amarillo | 5 y 6 | lunes |
| Rosa | 7 y 8 | martes |
| Rojo | 3 y 4 | miércoles |
| Verde | 1 y 2 | jueves |
| Azul | 9 y 0 | viernes |

Aplica a hologramas 1 y 2, a autos sin holograma vigente y a placas foráneas sin holograma reconocido.

- **Fuente:** Decreto por el que se expide el Programa Hoy No Circula en el Distrito Federal, Gaceta Oficial del Distrito Federal No. 1882, 19 de junio de 2014, numerales IV.3 y IV.4, tablas 1 y 2. [PDF en SEDEMA](https://www.sedema.cdmx.gob.mx/storage/app/media/programas/hoy-no-circula/decreto-programa-hoy-no-circula-segundo-semestre-2016.pdf).
- **Confirmado también en:** la guía de la CAMe ([PDF](https://www.gob.mx/cms/uploads/attachment/file/878737/Guia_del_Programa_HNC_02_enero_2024.pdf)) y el sitio oficial hoynocircula.cdmx.gob.mx, que el 17 de noviembre de 2026 (martes) mostraba "Placas 7,8".
- **Modelo:** `RULES.weekdays`.

## 2. Horario

De 5:00 a 22:00 horas, de lunes a sábado. Domingo no aplica el programa (sí pueden aplicar restricciones por contingencia).

- **Fuente:** Decreto HNC 2014, tablas 1 y 2 ("de las 05:00 a las 22:00 horas"); guía de la CAMe ("de 5:00 a 22:00 horas de lunes a sábado").
- **Modelo:** `RULES.hours`. La aplicación trata el intervalo como [5:00, 22:00): a las 4:59 se puede circular, a las 5:00 no, a las 21:59 no, a las 22:00 sí. La hora siempre es la de la Ciudad de México (UTC-6 todo el año desde 2022), sin importar la zona del dispositivo.

## 3. Sábados

- **Holograma 1:** terminación impar descansa el primer y el tercer sábado de cada mes; terminación par, el segundo y el cuarto.
- **Holograma 2:** descansa todos los sábados.
- **Holograma 0, 00 y Exento:** circulan.

"Primer sábado" es el que cae entre el día 1 y el 7 del mes; segundo, del 8 al 14; tercero, del 15 al 21; cuarto, del 22 al 28; quinto, del 29 al 31.

- **Fuente:** Decreto HNC 2014, tabla 1 (holograma 1) y tabla 2 (holograma 2); guía de la CAMe, inciso C.
- **Comprobación:** para el sábado 21 de noviembre de 2026 (tercer sábado), hoynocircula.cdmx.gob.mx y aire.cdmx.gob.mx indicaban "H1: impar, H2: todos", que es lo que calcula la aplicación.
- **Modelo:** `RULES.saturdays`.

## 4. Quinto sábado

Cuando un mes tiene quinto sábado, el holograma 1 circula. El texto oficial lo condiciona: el holograma 1 "podrá circular de acuerdo con las condiciones ambientales" que defina la SEDEMA o la CAMe. La aplicación lo muestra como día libre con una nota.

- **Fuente:** Programa de Verificación Vehicular Obligatoria (PVVO) para el segundo semestre de 2026, Gaceta Oficial de la Ciudad de México No. 1892, 1 de julio de 2026, numeral 14.2, fracción I ([PDF](https://proyectos.sedema.cdmx.gob.mx/datos/storage/app/media/gacetas/GOCDMX_26-07-01_DGCA.pdf)). El mismo texto está en el PVVO del primer semestre de 2026.
- **Semáforo AMARILLO** porque la regla es condicional.
- **Modelo:** `RULES.saturdays.hologram1.fifthSaturdayFree`.

## 5. Exenciones

No aplica el Hoy No Circula (en días normales) a:

- Holograma "Exento" (vehículos eléctricos, de celda de combustible e híbridos PHEV, REEV y HEV): PVVO 2026, numerales 4.7, 8.7.1 y 14.1 fracciones V, VI y X. También están exentos de las contingencias (numeral 4.7 y comunicados de la CAMe).
- Holograma "00" (hasta dos años) y "0" (seis meses), "salvo cuando exista contingencia ambiental atmosférica": PVVO 2026, numeral 14.1 fracciones XI y XII.
- Placas para personas con discapacidad, sin importar el holograma: PVVO 2026, numerales 4.38 y 14.1 fracción XV. También exentas de contingencias (numeral 4.38).
- Pase Turístico Metropolitano (dos veces por semestre por siete días o una vez por semestre por 14 días): PVVO 2026, numerales 4.22 y 14.1 fracción XVI. No exenta de contingencias: el comunicado de la CAMe del 12 de septiembre de 2026 trata a los autos con pase turístico como holograma 2.
- Otras exenciones que la aplicación no pregunta (motocicletas, autos antiguos con placa de la CDMX, placas de demostración, servicios de emergencia, transporte escolar, cortejos fúnebres): PVVO 2026, numeral 14.1, y Decreto HNC 2014, numeral VII.

## 6. Placas de otros estados y extranjeras

- Se reconocen los hologramas "E", "00", "0", "1" y "2" de los estados de la Megalópolis (Estado de México, Hidalgo, Morelos, Puebla, Querétaro y Tlaxcala) y de Guanajuato (convenio vigente): PVVO 2026, numeral 14.3. Con esas placas, la aplicación usa el holograma que indiques.
- Autos de cualquier otro estado o del extranjero sin holograma reconocido: se tratan como holograma 2 (un día entre semana y todos los sábados) **y además** no circulan de lunes a viernes de 5:00 a 11:00: Decreto HNC 2014, numeral V y tabla 3; PVVO 2026, numeral 14.2 fracción IV; guía de la CAMe, inciso D.
- Pueden obtener holograma por verificación voluntaria en la CDMX o el Estado de México: PVVO 2026, numerales 11.1 y 14.4. En ese caso se elige el holograma obtenido.
- **Discrepancia:** la guía de la CAMe (2024) menciona también a Michoacán entre los estados reconocidos; el PVVO 2026 solo menciona a Guanajuato con convenio y dice que no reconoce verificaciones voluntarias de Michoacán. La aplicación sigue el PVVO 2026, que es posterior y está publicado en la Gaceta.
- **Modelo:** `RULES.foreignMorning`; categoría `no-hologram-foreign` en `src/engine/hnc.ts`.

## 7. Autos sin verificación vigente

- Matriculados en la CDMX sin holograma vigente: como holograma 2, sin la restricción matutina. PVVO 2026, numeral 14.2 fracción V.
- Matriculados en otro estado (incluido el Estado de México) sin holograma reconocido: como placas foráneas (punto 6). PVVO 2026, numeral 14.2 fracción IV.
- **Modelo:** opción "Sin holograma vigente" + "Placas de".

## 8. Qué dígito cuenta

- Se usa el último dígito numérico de la placa. Si el dígito no coincide con el color del engomado, manda el dígito: PVVO 2026, numeral 5.1.3.
- Placas solo con letras: se tratan como engomado azul (9 o 0) y terminación par: Decreto HNC 2014, numeral X; PVVO 2026, numeral 5.1.3.
- **Discrepancia:** para placas con dos series de números, el Decreto HNC 2014 (numeral X) habla del último dígito de la **primera** serie, mientras que el PVVO 2026 (numeral 5.1.3) habla del último dígito numérico de la placa. Cuando la placa tiene dos series con dígitos finales distintos, la aplicación usa el último dígito por defecto y deja elegir el otro, pidiendo comparar con el color del engomado. **Semáforo AMARILLO.**
- **Modelo:** `src/engine/plate.ts`.

## 9. Días festivos

El programa **no** se suspende automáticamente en días festivos. La autoridad ambiental "emitirá el aviso" de suspensión cuando lo decida: Decreto HNC 2014, numeral XI. La aplicación avisa en los días de descanso obligatorio de la Ley Federal del Trabajo, artículo 74 (1 de enero, primer lunes de febrero, tercer lunes de marzo, 1 de mayo, 16 de septiembre, tercer lunes de noviembre y 25 de diciembre; [LFT, última reforma 14 de mayo de 2026](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf)) que el programa sigue aplicando, salvo aviso.

- Cuando se publique un aviso de suspensión, se agrega a `RULES.suspensions` (fecha y liga) y la aplicación y el calendario .ics (con EXDATE) lo respetan.
- Al 17 de noviembre de 2026 no se registró ningún aviso de suspensión vigente.
- No se modelan el 1 de octubre sexenal (fracción VII) ni las jornadas electorales (fracción IX).

## 10. Dónde aplica

Las 16 alcaldías de la Ciudad de México y 18 municipios del Estado de México: Atizapán de Zaragoza, Coacalco de Berriozábal, Cuautitlán, Cuautitlán Izcalli, Chalco, Chicoloapan, Chimalhuacán, Ecatepec de Morelos, Huixquilucan, Ixtapaluca, La Paz, Naucalpan de Juárez, Nezahualcóyotl, Nicolás Romero, Tecámac, Tlalnepantla de Baz, Tultitlán y Valle de Chalco Solidaridad.

- **Fuente:** guía de la CAMe ([página](https://www.gob.mx/comisionambiental/articulos/programa-hoy-no-circula-que-aplica-en-la-zmvm), [PDF](https://www.gob.mx/cms/uploads/attachment/file/878737/Guia_del_Programa_HNC_02_enero_2024.pdf)).
- **Discrepancia:** la página de la [Secretaría de Seguridad del Estado de México](https://sseguridad.edomex.gob.mx/hoy-no-circula) enumera 19 nombres para la ZMVM, incluido Tenango del Valle, que la misma página también coloca en la Zona Metropolitana del Valle de Toluca. Parece un error de esa página; la aplicación usa los 18 de la CAMe. **Semáforo AMARILLO.**
- La aplicación no pide el municipio: da la regla de la ZMVM.

## 11. Calendario de verificación

Dos meses por semestre según el color del engomado:

| Engomado | Terminación | 1.er semestre | 2.º semestre |
|----------|-------------|---------------|--------------|
| Amarillo | 5 y 6 | enero y febrero | julio y agosto |
| Rosa | 7 y 8 | febrero y marzo | agosto y septiembre |
| Rojo | 3 y 4 | marzo y abril | septiembre y octubre |
| Verde | 1 y 2 | abril y mayo | octubre y noviembre |
| Azul | 9 y 0 | mayo y junio | noviembre y diciembre |

- **Fuentes:** PVVO primer semestre 2026, Gaceta Oficial de la CDMX No. 1770, 2 de enero de 2026, numeral 5.1.1, tabla 1 ([PDF](https://proyectos.sedema.cdmx.gob.mx/datos/storage/app/media/gacetas/GOCDMX_26-01-02_DGCA.pdf)); PVVO segundo semestre 2026, numeral 5.1.1, tabla 1 ([PDF](https://proyectos.sedema.cdmx.gob.mx/datos/storage/app/media/gacetas/GOCDMX_26-07-01_DGCA.pdf)).
- Holograma "00": no verifica mientras esté vigente (numerales 4.8 y 5.1). Holograma "Exento": no verifica (numeral 4.7).
- No se modela la ampliación de 15 días (numeral 5.1.9) ni las reglas para autos nuevos (numeral 5.1.2).
- **Modelo:** `RULES.verification`.

## 12. Verificación 2027 y Estado de México

- **2027:** la SEDEMA publica un programa por semestre; el del primer semestre de 2027 aún no se publicaba al 17 de noviembre de 2026. La aplicación proyecta el mismo patrón y lo marca como "proyección" en la pantalla y en el .ics. **Semáforo ROJO** hasta que se publique; al publicarse, se agrega a `RULES.verification.publishedPrograms`.
- **Estado de México:** publica su propio programa en la Gaceta del Gobierno. Notas de prensa de julio de 2026 dicen que su calendario del segundo semestre de 2026 coincide con el de la CDMX, pero no se consultó el texto oficial. La aplicación muestra el calendario de la CDMX con esa advertencia. **Semáforo ROJO.**
- Placas de otros estados: no se calcula su calendario (cada estado tiene el suyo).

## 13. Contingencias ambientales

Cuando la CAMe activa la Fase I o la Fase II por ozono (o la Fase I en toda la ZMVM o la Fase II por partículas), se suman restricciones de 5:00 a 22:00 al Hoy No Circula:

- todos los autos con holograma 2;
- holograma 1 con terminación par o non, "de manera alternada, con base en la última activación";
- holograma 0 y 00 con la terminación que restringe el Hoy No Circula ese día; en sábado o domingo la CAMe rota los colores empezando por amarillo, luego rosa, rojo, verde y azul.

Las restricciones a vehículos aplican desde el día siguiente a la declaratoria.

- **Fuente:** Aviso por el que se da a conocer el Programa para Prevenir y Responder a Contingencias Ambientales Atmosféricas en la Ciudad de México, Gaceta Oficial de la CDMX No. 100 Bis, 28 de mayo de 2019, numerales VI, VII y X, tablas 2, 3 y 4 ([PDF](https://data.consejeria.cdmx.gob.mx/portal_old/uploads/gacetas/25a1ef7295458ade0faad3daebb31f05.pdf)). La página de la [SEDEMA sobre el Hoy No Circula](https://www.sedema.cdmx.gob.mx/programas/programa/hoy-no-circula) remite a este programa como el vigente.
- En la tabla 3 del programa, la misma fila de restricciones a vehículos aplica en Fase I y Fase II (la Fase II añade, por ejemplo, el 50 % de las motocicletas).
- Los comunicados de la CAMe añaden que los autos sin holograma (placas foráneas, pase turístico, permisos, placas solo con letras) se tratan como holograma 2, y que los eléctricos, híbridos, holograma Exento y placas para personas con discapacidad están exentos. Ejemplo: [comunicado del 12 de septiembre de 2026](https://www.gob.mx/comisionambiental/prensa/se-435677).
- **Semáforo AMARILLO:** qué terminaciones del holograma 1 (par o non) y qué color de los hologramas 0 y 00 se restringen lo decide cada comunicado; la aplicación no lo adivina, lo lee del comunicado (punto 14).

## 14. Estado de contingencia en vivo

No existe una API oficial ni un RSS que funcione (el RSS del archivo de prensa de gob.mx respondió error 500 al probarlo). La fuente más estable que se encontró es el [archivo de prensa de la CAMe en gob.mx](https://www.gob.mx/comisionambiental/es/archivo/prensa), donde la CAMe publica cada comunicado de activación, continuación y suspensión con fecha y hora, y con una plantilla fija para las restricciones.

Cómo se usa:

1. Una GitHub Action (`.github/workflows/deploy.yml`) corre cada 30 minutos todo el año (hubo contingencias en marzo, abril y septiembre de 2026, fuera y dentro de la temporada de ozono).
2. `scripts/fetch-status.ts` lee la primera página del archivo, toma el comunicado de contingencia más reciente y, si la contingencia sigue activa, lee los comunicados de ese episodio para extraer, por día: holograma 2, terminaciones del holograma 1, y color y terminaciones de los hologramas 0 y 00.
3. Escribe `status.json`, que se publica junto con la aplicación.

Salvaguardas:

- Si algo no se puede leer, el dato queda vacío y la aplicación dice "revisa el comunicado"; nunca supone que puedes circular.
- Si `status.json` tiene más de 3 horas, o la última lectura falló, la aplicación muestra "No pudimos confirmar si hay contingencia ambiental" con ligas a la CAMe y a [aire.cdmx.gob.mx](http://www.aire.cdmx.gob.mx/).
- Si una contingencia lleva más de 36 horas sin un comunicado nuevo, el estado pasa a "desconocido".
- Cada estado muestra la liga al comunicado oficial del que sale.
- La CAMe también publica en redes sociales, y el archivo de gob.mx puede tardar unos minutos más. En el episodio del 12 y 13 de septiembre de 2026, los boletines de las 15:00, 20:00 y 10:00 aparecieron en gob.mx a las 15:17, 19:55 y 9:47, y la suspensión (efectiva a las 15:00) a las 15:45.
- Las pruebas usan copias recortadas de comunicados reales (marzo, abril y septiembre de 2026) en `test/fixtures/`.

## 15. Lo que no se modela

- Taxis, transporte público de pasajeros, transporte de carga y motocicletas (tienen horarios y reglas propias en el PVVO y en el programa de contingencias).
- Autos nuevos (30 días de exención), permisos provisionales para circular, y la ampliación del periodo de verificación.
- El programa Hoy No Circula de las zonas metropolitanas del Valle de Toluca y de Santiago Tianguistenco (Estado de México).
- La Fase Preventiva se muestra, pero no tiene restricciones vehiculares.
- Avisos especiales que cambien reglas para un día (se agregan a mano en `RULES.suspensions`).

## 16. Fuentes consultadas

Todas consultadas el 17 de noviembre de 2026.

| Id en el código | Documento | Publicación | Liga |
|-----------------|-----------|-------------|------|
| `decretoHnc2014` | Decreto por el que se expide el Programa Hoy No Circula en el Distrito Federal (GODF No. 1882) | 19/06/2014 | [PDF](https://www.sedema.cdmx.gob.mx/storage/app/media/programas/hoy-no-circula/decreto-programa-hoy-no-circula-segundo-semestre-2016.pdf) |
| `pvvo2026s2` | Programa de verificación vehicular obligatoria, segundo semestre 2026 (GOCDMX No. 1892) | 01/07/2026 | [PDF](https://proyectos.sedema.cdmx.gob.mx/datos/storage/app/media/gacetas/GOCDMX_26-07-01_DGCA.pdf) |
| `pvvo2026s1` | Programa de verificación vehicular obligatoria, primer semestre 2026 (GOCDMX No. 1770) | 02/01/2026 | [PDF](https://proyectos.sedema.cdmx.gob.mx/datos/storage/app/media/gacetas/GOCDMX_26-01-02_DGCA.pdf) |
| `pcaa2019` | Programa para Prevenir y Responder a Contingencias Ambientales Atmosféricas en la CDMX (GOCDMX No. 100 Bis) | 28/05/2019 | [PDF](https://data.consejeria.cdmx.gob.mx/portal_old/uploads/gacetas/25a1ef7295458ade0faad3daebb31f05.pdf) |
| `cameGuiaHnc` | Programa Hoy No Circula que aplica en la ZMVM (guía de la CAMe) | 2024, página actualizada en 2026 | [PDF](https://www.gob.mx/cms/uploads/attachment/file/878737/Guia_del_Programa_HNC_02_enero_2024.pdf) |
| `cameComunicado20260912` | Comunicado de la CAMe: se activa contingencia por ozono | 12/09/2026 | [Comunicado](https://www.gob.mx/comisionambiental/prensa/se-435677) |
| `cameArchivoPrensa` | Archivo de prensa de la CAMe (fuente del estado en vivo) | continuo | [Archivo](https://www.gob.mx/comisionambiental/es/archivo/prensa) |
| `sedemaHnc` | SEDEMA: Programa Hoy No Circula | continuo | [Página](https://www.sedema.cdmx.gob.mx/programas/programa/hoy-no-circula) |
| `edomexSeguridadHnc` | Secretaría de Seguridad del Estado de México: Hoy no Circula | continuo | [Página](https://sseguridad.edomex.gob.mx/hoy-no-circula) |
| `lftArt74` | Ley Federal del Trabajo, artículo 74 (última reforma DOF 14/05/2026) | 14/05/2026 | [PDF](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf) |

Otras páginas oficiales consultadas para contrastar: [hoynocircula.cdmx.gob.mx](https://hoynocircula.cdmx.gob.mx/) y [aire.cdmx.gob.mx](http://www.aire.cdmx.gob.mx/) (ambas mostraban, el 17 de noviembre de 2026, "Hoy no circulan: 7 y 8" y "Próx. sábado: H1 impar, H2 todos").

## Cómo actualizar las reglas

1. Cada semestre, cuando la SEDEMA publique el nuevo PVVO en la Gaceta Oficial, agrega la fuente en `src/rules/sources.ts` y el periodo en `RULES.verification.publishedPrograms`; revisa si cambió la tabla 1 o el numeral 14.
2. Si se publica un aviso de suspensión del Hoy No Circula, agrégalo a `RULES.suspensions` con su liga.
3. Corre `npm test`: las pruebas comparan el motor contra las tablas oficiales escritas a mano y fallan si algo no cuadra.
4. Actualiza este documento y la fecha de consulta.
