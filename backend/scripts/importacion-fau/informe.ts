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
    ...estadoDerecha(res, op.aplicar),
    '',
    `## ${verbo}`,
    '',
    `- Personas nuevas: ${res.personas}`,
    `- Personas existentes a las que se completaron datos vacíos: ${res.completadas}`,
    `- Relaciones laborales: ${res.relaciones}`,
    `- Destinos: ${res.destinos}`,
    `- Períodos de vuelo nuevos: ${res.periodosVuelo} (${res.periodosVueloCerrados} cerrados: tienen otro posterior)`,
    `- Registros de horas de vuelo: ${res.vuelos}`,
    `- Misiones nuevas: ${res.misiones}`,
    `- Participaciones en misiones: ${res.participaciones}`,
    `- Oficiales con la Derecha/Numor de la carga inicial, vaciados para cargar los del Access: ${res.derechasLiberadas}`,
    `- Derecha/Numor completados en períodos activos existentes: ${res.derechasCompletadas}`,
    `- Tipo de funcionario completado en períodos activos existentes: ${res.tiposCompletados}`,
    `- Comisiones importadas (--comisiones): ${res.comisiones}`,
    `- Registros en el historial de Derecha/Numor: ${res.historialDerecha}`,
    `- Activos ordenados por precedencia en escalas sin Derecha (subalternos): ${res.derechasPorPrecedencia}`,
    `- Activos que siguen sin Derecha (ubicarlos desde Configuración de derecha): ${res.activosSinDerecha}`,
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

  if (plan.destinosSinEquivalente.size) {
    lineas.push('', '## Destinos sin equivalente en liquidación', '',
      'Sus filas no se cargan y no se crea ninguna unidad ni sub-unidad: resolverlos a mano.', '',
      '| Destino en el Access | Activos | Filas |', '|---|---|---|',
      ...[...plan.destinosSinEquivalente.entries()]
        .sort((a, b) => b[1].activos - a[1].activos || b[1].filas - a[1].filas)
        .map(([d, n]) => `| ${d} | ${n.activos} | ${n.filas} |`));
  }

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

/**
 * La aplicación numera la Derecha y el Numor sin huecos: si la importación los deja, la primera
 * operación que los toca (alta, ascenso, retiro o un cambio en Configuración de derecha) renumera
 * a todos los que siguen. Por eso se importa todo antes de empezar a usarla.
 */
function estadoDerecha(res: Resultado, aplicada: boolean): string[] {
  const huecos = (escala: string) => res.huecosDerecha[escala] ?? 0;
  const pendiente = res.activosSinDerecha + huecos('OFICIALES') + huecos('SUBALTERNOS')
    + res.numorConHuecos.length + res.activosSinNumor;
  if (!pendiente) {
    return ['## Derecha y Numor completos', '',
      `No ${aplicada ? 'quedan' : 'quedarían'} activos sin Derecha ni huecos: se puede empezar a usar la aplicación.`];
  }
  return [
    '## Derecha y Numor: todavía no empezar a usar la aplicación', '',
    `- Activos sin Derecha: ${res.activosSinDerecha}`,
    `- Huecos en la Derecha: Oficiales ${huecos('OFICIALES')}, Subalternos ${huecos('SUBALTERNOS')}`,
    `- Grupos con huecos en el Numor: ${res.numorConHuecos.length}`
      + (res.numorConHuecos.length ? ` (${res.numorConHuecos.map((g) => `${g.grado} ${g.escalafon}: ${g.huecos}`).join('; ')})` : ''),
    `- Activos con Derecha y sin Numor: ${res.activosSinNumor}`,
    '',
    'La aplicación numera sin huecos. Mientras queden, la primera operación que toque la Derecha o el Numor (un alta, '
      + 'un ascenso, un retiro o un cambio en Configuración de derecha) renumera a todos los que están después de cada hueco: '
      + 'el orden se mantiene, cambian los números. Revisar las incidencias, corregir el Access y volver a correr el importador '
      + 'hasta que esto quede en cero. A los activos sin Derecha que el Access no trae se les asigna desde Configuración de derecha '
      + 'cuando ya no queden huecos.',
  ];
}
