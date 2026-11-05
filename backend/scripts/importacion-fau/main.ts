/**
 * Importador de las bases Access de la FAU y del Excel de horas de vuelo.
 *
 * Uso (desde pfg-backend/backend):
 *   npx tsx scripts/importacion-fau/main.ts <archivos...> [--aplicar] [--crear-activos] [--crear-catalogos]
 *       [--informe <carpeta>] [--database-url <url>]
 *
 *   <archivos>: SUBALTERNO*.mdb, la base de personal superior (.accdb) y/o el Excel de horas
 *   de vuelo (.xlsx), en cualquier orden. El tipo se reconoce por el contenido.
 *
 * Sin --aplicar es una SIMULACIÓN: hace todo dentro de una transacción y la deshace al final.
 * Ver LEEME.md en esta carpeta.
 */
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { aplicar } from './aplicar.js';
import { Catalogos } from './catalogos.js';
import { escribirInforme } from './informe.js';
import { BaseAccess, HojaVuelo, leerAccess, leerExcelVuelo } from './leer.js';
import { armarPlan } from './plan.js';

function argumentos(argv: string[]) {
  const op = { aplicar: false, crearActivos: false, crearCatalogos: false, informe: '', databaseUrl: process.env.DATABASE_URL ?? '' };
  const archivos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--aplicar') op.aplicar = true;
    else if (a === '--crear-activos') op.crearActivos = true;
    else if (a === '--crear-catalogos') op.crearCatalogos = true;
    else if (a === '--informe') op.informe = argv[++i];
    else if (a === '--database-url') op.databaseUrl = argv[++i];
    else if (a.startsWith('--')) throw new Error(`Opción desconocida: ${a}`);
    else archivos.push(resolve(a));
  }
  if (!archivos.length) throw new Error('Falta indicar los archivos a importar.');
  if (!op.databaseUrl) throw new Error('Falta la base de datos: --database-url o la variable DATABASE_URL.');
  op.informe ||= resolve(`informe-importacion-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`);
  return { op, archivos };
}

/**
 * Las copias anonimizadas (para desarrollo) tienen cédulas falsas pero válidas: no hay forma de
 * distinguirlas por los datos. Por el nombre del archivo sí, y solo se aceptan contra una base cuyo
 * nombre diga que es de prueba. No alcanza con mirar el host: por un túnel SSH, producción también
 * se ve como localhost.
 */
function controlarAnonimizadas(archivos: string[], databaseUrl: string) {
  const anonimizadas = archivos.filter((a) => /anonimizad/i.test(a));
  if (!anonimizadas.length) return;
  const base = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!/test|prueba/i.test(base)) {
    throw new Error(`Se pasaron copias anonimizadas (${anonimizadas.length}) contra la base "${base}". ` +
      'Las copias anonimizadas solo se importan en una base de prueba (con "test" o "prueba" en el nombre).');
  }
}

async function main() {
  const { op, archivos } = argumentos(process.argv.slice(2));
  controlarAnonimizadas(archivos, op.databaseUrl);

  const bases: BaseAccess[] = [];
  let hojas: HojaVuelo[] = [];
  for (const a of archivos) {
    if (/\.xlsx$/i.test(a)) hojas = hojas.concat(await leerExcelVuelo(a));
    else bases.push(await leerAccess(a));
  }

  const pool = new Pool({ connectionString: op.databaseUrl });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const cat = await Catalogos.cargar(db);
    const faltan = cat.faltantesGenerales();
    if (faltan.length) throw new Error(`Faltan datos básicos en la base: ${faltan.join(', ')}.`);
    const plan = await armarPlan(db, cat, bases, hojas, op);
    const res = await aplicar(db, cat, plan, op);
    await db.query(op.aplicar ? 'COMMIT' : 'ROLLBACK');
    console.log(escribirInforme(op.informe, plan, cat, res, op, archivos.map((a) => a.split(/[\\/]/).pop()!)));
    console.log(`\nInforme completo en: ${op.informe}`);
    if (!op.aplicar) console.log('\nSIMULACIÓN: no se escribió nada. Para cargar, repetir con --aplicar.');
  } catch (e) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : e}\nNo se escribió nada en la base.`);
  process.exit(1);
});
