/** Informe de la corrida: resumen en pantalla y en resumen.md, y el detalle en incidencias.csv. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Catalogos } from './catalogos.js';
import { Resultado } from './aplicar.js';
import { Opciones, Plan } from './plan.js';

export function escribirInforme(
  carpeta: string, plan: Plan, cat: Catalogos, res: Resultado, op: Opciones & { aplicar: boolean }, archivos: string[],
): string {
  mkdirSync(carpeta, { recursive: true });
  const verbo = op.aplicar ? 'Se cargó' : 'Se cargaría';
  const lineas = [
    `# Importación FAU — ${op.aplicar ? 'APLICADA' : 'SIMULACIÓN (no se escribió nada)'}`,
    '',
    `Fecha: ${new Date().toISOString()}`,
    `Archivos: ${archivos.join(', ')}`,
    `Opciones: ${[op.crearActivos && '--crear-activos', op.crearCatalogos && '--crear-catalogos'].filter(Boolean).join(' ') || '(ninguna)'}`,
    '',
    `## ${verbo}`,
    '',
    `- Personas nuevas: ${res.personas}`,
    `- Personas existentes a las que se completaron datos vacíos: ${res.completadas}`,
    `- Relaciones laborales: ${res.relaciones}`,
    `- Destinos: ${res.destinos}`,
    `- Períodos de vuelo nuevos: ${res.periodosVuelo}`,
    `- Registros de horas de vuelo: ${res.vuelos}`,
    `- Misiones nuevas: ${res.misiones}`,
    `- Participaciones en misiones: ${res.participaciones}`,
    `- Derecha/Numor completados en períodos activos existentes: ${res.derechasCompletadas}`,
    `- Altas en el historial de Derecha/Numor: ${res.historialDerecha}`,
    `- Niveles educativos (legajo): ${res.legajos}`,
    `- Cursos aprobados (pasaje de grado, Nivel 7/9, especialidades): ${res.cursos}`,
    `- Ascensos (historial): ${res.ascensos}`,
    `- Retiros: ${res.retiros}`,
    `- Motivos de baja completados en períodos existentes: ${res.motivosCompletados}`,
    `- Conductas completadas en períodos existentes: ${res.conductasCompletadas}`,
    `- Vínculos familiares: ${res.familiares}`,
    ...Object.entries(res.catalogosCreados).map(([t, n]) => `- Catálogo ${t}: ${n} registros nuevos`),
    '',
    '## Conteos',
    '',
    ...Object.entries(plan.conteo).sort().map(([k, n]) => `- ${k}: ${n}`),
  ];

  const faltantes = [...cat.nuevos.values()].filter((n) => n.tabla !== 'unidades_vuelo');
  if (faltantes.length && !op.crearCatalogos) {
    lineas.push('', '## Catálogos que faltan en la base', '',
      'Las filas que los usan no se cargan. Se crean con --crear-catalogos (son tablas de liquidación: acordarlo antes).', '',
      ...faltantes.map((n) => `- ${n.tabla}: ${n.codigo} — ${n.denominacion}${n.vigente ? '' : ' (no vigente)'}`));
  }

  const porMotivo = new Map<string, number>();
  for (const i of plan.incidencias) {
    const k = `${i.nivel === 'error' ? 'ERROR' : 'aviso'}: ${i.motivo.replace(/"[^"]*"/g, '"…"')}`;
    porMotivo.set(k, (porMotivo.get(k) ?? 0) + 1);
  }
  lineas.push('', `## Incidencias (${plan.incidencias.length}; detalle en incidencias.csv)`, '',
    ...[...porMotivo.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${n} × ${k}`));

  const resumen = lineas.join('\n');
  writeFileSync(join(carpeta, 'resumen.md'), resumen, 'utf8');
  const csv = [['nivel', 'origen', 'cedula', 'nombre', 'motivo'],
    ...plan.incidencias.map((i) => [i.nivel, i.origen, i.cedula ?? '', i.nombre ?? '', i.motivo])]
    .map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  // BOM para que Excel abra bien los acentos.
  writeFileSync(join(carpeta, 'incidencias.csv'), '﻿' + csv, 'utf8');
  return resumen;
}
