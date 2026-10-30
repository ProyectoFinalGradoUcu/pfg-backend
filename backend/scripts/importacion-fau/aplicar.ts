/**
 * Escribe el plan en la base. Todo va en una transacción: en simulación se deshace al final
 * (así las restricciones de la base se prueban de verdad), y con --aplicar se confirma.
 */
import { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { Catalogos, Ref } from './catalogos.js';
import { MOTIVOS_NUEVOS } from './motivos.js';
import { Opciones, Plan } from './plan.js';

const TABLAS_LIQUIDACION = new Set(['unidades', 'sub_unidades', 'grados', 'escalafones']);

export interface Resultado {
  catalogosCreados: Record<string, number>;
  personas: number;
  completadas: number;
  relaciones: number;
  destinos: number;
  periodosVuelo: number;
  vuelos: number;
  derechasCompletadas: number;
  historialDerecha: number;
  legajos: number;
  cursos: number;
  ascensos: number;
  motivosCompletados: number;
  conductasCompletadas: number;
  retiros: number;
  familiares: number;
  misiones: number;
  participaciones: number;
}

export async function aplicar(db: PoolClient, cat: Catalogos, plan: Plan, op: Opciones): Promise<Resultado> {
  const ids = new Map<Ref, string>();
  const id = (ref: Ref | null | undefined): string | null => {
    if (!ref) return null;
    if (!ref.startsWith('nuevo:') && !ref.startsWith('nueva:')) return ref;
    const v = ids.get(ref);
    if (!v) throw new Error(`Referencia sin crear: ${ref}`);
    return v;
  };
  const res: Resultado = { catalogosCreados: {}, personas: 0, completadas: 0, relaciones: 0, destinos: 0, periodosVuelo: 0,
    vuelos: 0, derechasCompletadas: 0, historialDerecha: 0, legajos: 0, cursos: 0, ascensos: 0, motivosCompletados: 0, conductasCompletadas: 0, retiros: 0, familiares: 0, misiones: 0,
    participaciones: 0 };

  // Catálogos, en orden de dependencia ──────────────────────────────────────
  const orden = ['unidades', 'sub_unidades', 'grados', 'escalafones', 'unidades_vuelo'];
  const nuevos = [...cat.nuevos.entries()].sort(([, a], [, b]) => orden.indexOf(a.tabla) - orden.indexOf(b.tabla));
  for (const [ref, n] of nuevos) {
    if (TABLAS_LIQUIDACION.has(n.tabla) && !op.crearCatalogos) continue;
    let nuevoId: string;
    if (n.tabla === 'unidades') {
      nuevoId = await insertarOBuscar(db,
        'INSERT INTO unidades (codigo, denominacion, vigente) VALUES ($1, $2, $3) ON CONFLICT (codigo) DO NOTHING RETURNING id::text',
        'SELECT id::text FROM unidades WHERE codigo = $1', [n.codigo, n.denominacion, n.vigente]);
    } else if (n.tabla === 'sub_unidades') {
      const unidad = id(n.unidad);
      nuevoId = await insertarOBuscar(db,
        `INSERT INTO sub_unidades (unidad_id, codigo, denominacion, vigente) VALUES ($4, $1, $2, $3)
         ON CONFLICT (unidad_id, codigo) DO NOTHING RETURNING id::text`,
        'SELECT id::text FROM sub_unidades WHERE codigo = $1 AND unidad_id = $4', [n.codigo, n.denominacion, n.vigente, unidad]);
    } else if (n.tabla === 'grados') {
      nuevoId = await insertarOBuscar(db,
        `INSERT INTO grados (codigo, denominacion, orden, vigente, es_oficial, es_subalterno)
         VALUES ($1, $2, $4, $3, false, $5) ON CONFLICT (codigo) DO NOTHING RETURNING id::text`,
        'SELECT id::text FROM grados WHERE codigo = $1', [n.codigo, n.denominacion, n.vigente, n.orden ?? 0, n.esSubalterno ?? false]);
    } else if (n.tabla === 'escalafones') {
      nuevoId = await insertarOBuscar(db,
        'INSERT INTO escalafones (codigo, denominacion, vigente) VALUES ($1, $2, $3) ON CONFLICT (codigo) DO NOTHING RETURNING id::text',
        'SELECT id::text FROM escalafones WHERE codigo = $1', [n.codigo, n.denominacion, n.vigente]);
    } else {
      nuevoId = (await db.query('INSERT INTO unidades_vuelo (denominacion, vigente) VALUES ($1, $2) RETURNING id::text',
        [n.denominacion, n.vigente])).rows[0].id;
    }
    ids.set(ref, nuevoId);
    res.catalogosCreados[n.tabla] = (res.catalogosCreados[n.tabla] ?? 0) + 1;
  }
  // Motivos de baja que faltan: vigentes, porque se siguen usando (ver motivos.ts).
  for (const codigo of plan.motivosNuevos) {
    ids.set(`nuevo:motivos_baja:${codigo}`, await insertarOBuscar(db,
      `INSERT INTO motivos_baja (codigo, denominacion, vigente) VALUES ($1, $2, true)
       ON CONFLICT (codigo) DO NOTHING RETURNING id::text`,
      'SELECT id::text FROM motivos_baja WHERE codigo = $1', [codigo, MOTIVOS_NUEVOS[codigo]]));
    res.catalogosCreados.motivos_baja = (res.catalogosCreados.motivos_baja ?? 0) + 1;
  }

  // Personas ─────────────────────────────────────────────────────────────────
  for (const p of plan.personasNuevas.values()) {
    const campos = { cedula: p.cedula, es_civil: false, ...p.datos };
    const cols = Object.keys(campos);
    const r = await db.query(
      `INSERT INTO personas (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id::text`,
      Object.values(campos),
    );
    ids.set(p.ref, r.rows[0].id);
    res.personas++;
  }
  for (const c of plan.completar) {
    // COALESCE: si alguien lo completó entre la simulación y la aplicación, se respeta.
    const cols = Object.keys(c.campos);
    await db.query(
      `UPDATE personas SET ${cols.map((k, i) => `${k} = COALESCE(${k}, $${i + 2})`).join(', ')} WHERE id = $1`,
      [c.personaId, ...Object.values(c.campos)],
    );
    res.completadas++;
  }

  // Relaciones laborales y destinos ─────────────────────────────────────────
  const relaciones: string[] = []; // id de cada relación del plan, en orden ("rel:N")
  for (const r of plan.relaciones) {
    const campos: Record<string, unknown> = { persona_id: id(r.persona), ...r.campos };
    for (const k of ['grado_id', 'escalafon_id', 'unidad_id', 'sub_unidad_id', 'motivo_baja_id']) {
      if (k in campos) campos[k] = id(campos[k] as Ref | null);
    }
    const cols = Object.keys(campos);
    relaciones.push((await db.query(
      `INSERT INTO relaciones_laborales (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id::text`,
      Object.values(campos),
    )).rows[0].id);
    res.relaciones++;
  }
  const relacion = (ref: string) => (ref.startsWith('rel:') ? relaciones[Number(ref.slice(4))] : ref);

  // Motivo de baja y retiro de cada período de baja ─────────────────────────
  for (const c of plan.conductasRelacion) {
    // Igual que el motivo: solo períodos de baja que siguen sin conducta.
    const r = await db.query(
      "UPDATE relaciones_laborales SET conducta = $2 WHERE id = $1 AND conducta IS NULL AND estado <> 'activo'",
      [c.relacionId, c.conducta],
    );
    res.conductasCompletadas += r.rowCount ?? 0;
  }
  for (const m of plan.motivosRelacion) {
    // Solo períodos de baja que siguen sin motivo: un período activo es de liquidación.
    const r = await db.query(
      "UPDATE relaciones_laborales SET motivo_baja_id = $2 WHERE id = $1 AND motivo_baja_id IS NULL AND estado <> 'activo'",
      [m.relacionId, id(m.motivo)],
    );
    res.motivosCompletados += r.rowCount ?? 0;
  }
  for (const r of plan.retiros) {
    await db.query(
      `INSERT INTO retiros (persona_id, relacion_laboral_id, fecha_retiro, motivo_baja_id, motivo, numero_orden, boletin, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id(r.persona), relacion(r.relacion), r.fecha, id(r.motivoBaja), r.motivo, r.numeroOrden, r.boletin, r.observaciones],
    );
    res.retiros++;
  }

  // Familiares ───────────────────────────────────────────────────────────────
  for (const f of plan.familiares) {
    const r = await db.query(
      `INSERT INTO relaciones_familiares (persona_id, familiar_id, tipo_relacion, observaciones) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [id(f.persona), id(f.familiar), f.tipo, f.observaciones],
    );
    res.familiares += r.rowCount ?? 0;
  }
  for (const d of plan.destinos) {
    await db.query(
      `INSERT INTO destinos (persona_id, unidad_id, fecha_inicio, fecha_fin, numero_orden, posicion_destino, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id(d.persona), id(d.unidad), d.fechaInicio, d.fechaFin, d.numeroOrden, d.posicion, d.observaciones],
    );
    res.destinos++;
  }

  // Horas de vuelo ───────────────────────────────────────────────────────────
  const periodos = new Map<string, string>();
  for (const v of plan.vuelos) {
    const k = `${v.periodo.anio}-${v.periodo.numero}`;
    if (!periodos.has(k)) {
      const creado = await db.query(
        `INSERT INTO periodos_vuelo (anio, numero) VALUES ($1, $2) ON CONFLICT (anio, numero) DO NOTHING RETURNING id::text`,
        [v.periodo.anio, v.periodo.numero],
      );
      if (creado.rows.length) res.periodosVuelo++;
      periodos.set(k, creado.rows[0]?.id ??
        (await db.query('SELECT id::text FROM periodos_vuelo WHERE anio = $1 AND numero = $2', [v.periodo.anio, v.periodo.numero])).rows[0].id);
    }
    const campos: Record<string, unknown> = { periodo_id: periodos.get(k), persona_id: id(v.persona), ...v.campos };
    for (const c of ['grado_id', 'escalafon_id', 'unidad_vuelo_id']) campos[c] = id(campos[c] as Ref | null);
    const cols = Object.keys(campos);
    const r = await db.query(
      `INSERT INTO registros_vuelo (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (periodo_id, persona_id) DO NOTHING`,
      Object.values(campos),
    );
    res.vuelos += r.rowCount ?? 0;
  }

  // Derecha y Numor ──────────────────────────────────────────────────────────
  for (const d of plan.derechas) {
    // El WHERE re-chequea que sigan vacías, por si alguien las cargó entre la simulación y la aplicación.
    const r = await db.query(
      `UPDATE relaciones_laborales SET derecha = $2, numor = $3, escala_derecha = CASE WHEN $2::int IS NULL THEN NULL ELSE 'OFICIALES' END
        WHERE id = $1 AND derecha IS NULL AND numor IS NULL`,
      [d.relacionId, d.derecha, d.numor],
    );
    res.derechasCompletadas += r.rowCount ?? 0;
  }
  // Un lote por corrida, como agrupa la aplicación sus cambios en historial_derecha_numor.
  const lote = randomUUID();
  for (const h of plan.historial) {
    await db.query(
      `INSERT INTO historial_derecha_numor (persona_id, tipo, valor_anterior, valor_nuevo, operacion, motivo, lote_id)
       VALUES ($1, $2, NULL, $3, 'ALTA', $4, $5)`,
      [id(h.persona), h.tipo, h.valor, `Importación de bases FAU (${h.origen})`, lote],
    );
    res.historialDerecha++;
  }

  // Legajo: nivel educativo ─────────────────────────────────────────────────
  for (const l of plan.legajos) {
    const r = await db.query(
      `INSERT INTO legajo_militar (persona_id, nivel_educativo) VALUES ($1, $2)
       ON CONFLICT (persona_id) DO UPDATE SET nivel_educativo = EXCLUDED.nivel_educativo, actualizado_en = now()
       WHERE legajo_militar.nivel_educativo IS NULL`,
      [id(l.persona), l.nivel],
    );
    res.legajos += r.rowCount ?? 0;
  }

  // Cursos aprobados (pasaje de grado y Nivel 7/9) ────────────────────────
  // El curso se busca por nombre (el de seed_ascensos.sql); si la base no lo tiene, se crea
  // igual que en el seed: sin unidad, porque es requisito de ascenso para toda la fuerza.
  const cursos = new Map<string, string>();
  for (const c of plan.cursos) {
    let cursoId = cursos.get(c.curso);
    if (!cursoId) {
      cursoId = (await db.query('SELECT id::text FROM cursos WHERE nombre_curso = $1 ORDER BY id LIMIT 1', [c.curso])).rows[0]?.id;
      if (!cursoId) {
        cursoId = (await db.query(
          'INSERT INTO cursos (nombre_curso, institucion, es_obligatorio, unidad_id) VALUES ($1, $2, true, NULL) RETURNING id::text',
          [c.curso, c.institucion],
        )).rows[0].id as string;
        res.catalogosCreados.cursos = (res.catalogosCreados.cursos ?? 0) + 1;
      }
      cursos.set(c.curso, cursoId);
    }
    const r = await db.query(
      `INSERT INTO funcionarios_cursos (persona_id, curso_id, numero_orden, fecha_fin, aprobado, observacion_calificacion)
       VALUES ($1, $2, $3, $4, true, $5) ON CONFLICT (persona_id, curso_id) DO NOTHING`,
      [id(c.persona), cursoId, c.numeroOrden, c.fecha, c.observacion],
    );
    res.cursos += r.rowCount ?? 0;
  }

  // Historial de ascensos ───────────────────────────────────────────────────
  // Sin relaciones laborales ni orden: la aplicación los muestra como historial y no deja anularlos.
  for (const a of plan.ascensos) {
    await db.query(
      `INSERT INTO ascensos (persona_id, grado_id, grado_anterior_id, fecha_ascenso, observaciones)
       VALUES ($1, $2, $3, $4, $5)`,
      [id(a.persona), id(a.grado), id(a.gradoAnterior), a.fecha, a.observaciones],
    );
    res.ascensos++;
  }

  // Misiones ─────────────────────────────────────────────────────────────────
  for (const m of plan.misiones.values()) {
    if (!m.participantes.size) continue;
    let misionId = m.existenteId;
    if (!misionId) {
      const c = m.campos;
      misionId = (await db.query(
        `INSERT INTO misiones (nombre_mision, pais, tipo_mision, fecha_salida, fecha_llegada, numero_orden, boletin, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id::text`,
        [c.nombre_mision, c.pais, c.tipo_mision, c.fecha_salida, c.fecha_llegada, c.numero_orden, c.boletin, c.observaciones],
      )).rows[0].id;
      res.misiones++;
    }
    for (const p of m.participantes) {
      const r = await db.query(
        'INSERT INTO funcionarios_misiones (persona_id, mision_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id(p), misionId],
      );
      res.participaciones += r.rowCount ?? 0;
    }
  }
  return res;
}

async function insertarOBuscar(db: PoolClient, insertar: string, buscar: string, params: unknown[]): Promise<string> {
  const r = await db.query(insertar, params);
  if (r.rows.length) return r.rows[0].id;
  const usados = [...buscar.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  const mapa = new Map(usados.map((n, i) => [n, i + 1]));
  const sql = buscar.replace(/\$(\d+)/g, (_, n) => `$${mapa.get(Number(n))}`);
  return (await db.query(sql, usados.map((n) => params[n - 1]))).rows[0].id;
}
