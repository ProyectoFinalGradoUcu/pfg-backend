import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../lib/prisma.service.js';
import { assertFechaInicioPosteriorANacimiento } from './validaciones-fechas.js';

interface FilaCarga {
  // Personales
  cedula: string;
  primer_nombre: string;
  primer_apellido: string;
  segundo_nombre?: string;
  segundo_apellido?: string;
  fecha_nacimiento?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  genero?: string;
  estado_civil?: string;
  lugar_nacimiento?: string;
  es_civil: boolean;
  observaciones?: string;
  // Militar
  tipo_funcionario?: string;
  regimen_id?: number;
  unidad_id?: number;
  programa_id?: number;
  situacion_id?: number;
  escalafon_id?: number;
  grado_id?: number;
  fecha_inicio?: string;
  sub_unidad_id?: number;
  // Civil: "cedula1:tipo_relacion1|cedula2:tipo_relacion2"
  familiares?: string;
}

export interface ResultadoFila {
  fila: number;
  cedula: string;
  estado: 'ok' | 'error';
  id?: number;
  mensaje?: string;
}

const COLUMNAS = [
  'cedula',
  'primer_nombre',
  'primer_apellido',
  'segundo_nombre',
  'segundo_apellido',
  'fecha_nacimiento',
  'email',
  'telefono',
  'direccion',
  'genero',
  'estado_civil',
  'lugar_nacimiento',
  'es_civil',
  'observaciones',
  'tipo_funcionario',
  'regimen_id',
  'unidad_id',
  'programa_id',
  'situacion_id',
  'escalafon_id',
  'grado_id',
  'fecha_inicio',
  'sub_unidad_id',
  'familiares',
];

@Injectable()
export class PersonasCargaService {
  constructor(private readonly prisma: PrismaService) {}

  generarPlantilla(): Buffer {
    const wb = XLSX.utils.book_new();

    // Hoja de datos
    const encabezados = [
      'cedula *',
      'primer_nombre *',
      'primer_apellido *',
      'segundo_nombre',
      'segundo_apellido',
      'fecha_nacimiento (AAAA-MM-DD)',
      'email',
      'telefono',
      'direccion',
      'genero',
      'estado_civil',
      'lugar_nacimiento',
      'es_civil * (SI/NO)',
      'observaciones',
      'tipo_funcionario (oficial/subalterno) — solo si NO civil',
      'regimen_id — solo si NO civil',
      'unidad_id — solo si NO civil',
      'programa_id — solo si NO civil',
      'situacion_id — solo si NO civil',
      'escalafon_id — solo si NO civil',
      'grado_id — solo si NO civil',
      'fecha_inicio (AAAA-MM-DD) — solo si NO civil',
      'sub_unidad_id — solo si NO civil (opcional)',
      'familiares — solo si civil (cedula1:tipo_relacion|cedula2:tipo_relacion)',
    ];

    const ejemploMilitar = [
      '12345678', 'Juan', 'Pérez', 'Carlos', 'García',
      '1990-05-15', 'juan@ejemplo.com', '099111222', 'Av. 18 de Julio 100',
      'M', 'Soltero', 'Montevideo', 'NO', '',
      'oficial', '1', '2', '1', '3', '1', '4', '2024-01-01', '', '',
    ];

    const ejemploCivil = [
      '98765432', 'Ana', 'López', '', '',
      '1995-03-20', 'ana@ejemplo.com', '099333444', '',
      'F', 'Casado', 'Montevideo', 'SI', 'Cónyuge de oficial',
      '', '', '', '', '', '', '', '', '',
      '12345678:Cónyuge|11223344:Padre',
    ];

    const ws = XLSX.utils.aoa_to_sheet([encabezados, ejemploMilitar, ejemploCivil]);
    ws['!cols'] = encabezados.map(() => ({ wch: 30 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Personal');

    // Hoja de instrucciones
    const instrucciones = [
      ['INSTRUCCIONES DE CARGA MASIVA'],
      [''],
      ['1. Complete una fila por persona.'],
      ['2. Los campos marcados con * son obligatorios para todos.'],
      ['3. Si es_civil = NO: complete los campos militares (tipo_funcionario, regimen_id, unidad_id, etc.)'],
      ['4. Si es_civil = SI: deje los campos militares en blanco y complete "familiares".'],
      ['5. Columna "familiares": una o más cédulas de militares ya registrados.'],
      ['   Formato: cedula1:tipo_relacion|cedula2:tipo_relacion'],
      ['   Ejemplo: 12345678:Cónyuge|87654321:Padre'],
      ['   Si no conoce el tipo de relación puede omitirlo: 12345678|87654321'],
      ['6. Los IDs (regimen_id, unidad_id, etc.) deben corresponder a registros existentes en el sistema.'],
      ['   Consulte al administrador si no conoce los IDs.'],
      ['7. Formato de fechas: AAAA-MM-DD (ej: 1990-05-15)'],
      ['8. No modifique los nombres de columnas de la hoja "Personal".'],
    ];

    const wsInstrucciones = XLSX.utils.aoa_to_sheet(instrucciones);
    wsInstrucciones['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsInstrucciones, 'Instrucciones');

    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  async procesarCarga(buffer: Buffer): Promise<{
    total: number;
    exitosos: number;
    errores: number;
    resultados: ResultadoFila[];
  }> {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets['Personal'];
    if (!ws) {
      throw new BadRequestException('El archivo no contiene la hoja "Personal". Usá la plantilla oficial.');
    }

    const filas: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (filas.length < 2) {
      throw new BadRequestException('El archivo no tiene datos. Completá al menos una fila debajo del encabezado.');
    }

    // Ignorar encabezado (fila 1), procesar desde fila 2
    const datos = filas.slice(1).filter((fila) => fila.some((celda) => String(celda).trim() !== ''));

    const settled = await Promise.allSettled(
      datos.map(async (fila, i) => {
        const numeroFila = i + 2;
        const cedula = String(fila[0] ?? '').trim();
        const parsed = this.parsearFila(fila, numeroFila);
        const id = parsed.es_civil ? await this.crearCivil(parsed) : await this.crearMilitar(parsed);
        return { fila: numeroFila, cedula, id };
      }),
    );

    const resultados: ResultadoFila[] = settled.map((r, i) => {
      const numeroFila = i + 2;
      const cedula = String(datos[i][0] ?? '').trim();
      if (r.status === 'fulfilled') {
        return { fila: r.value.fila, cedula: r.value.cedula, estado: 'ok' as const, id: r.value.id };
      }
      const mensaje = r.reason instanceof Error ? r.reason.message : 'Error desconocido';
      return { fila: numeroFila, cedula, estado: 'error' as const, mensaje };
    });

    const exitosos = resultados.filter((r) => r.estado === 'ok').length;
    return {
      total: resultados.length,
      exitosos,
      errores: resultados.length - exitosos,
      resultados,
    };
  }

  private parsearFila(fila: string[], numeroFila: number): FilaCarga {
    const col = (field: (typeof COLUMNAS)[number]) => String(fila[COLUMNAS.indexOf(field)] ?? '').trim();

    const cedula = col('cedula');
    const primer_nombre = col('primer_nombre');
    const primer_apellido = col('primer_apellido');

    if (!cedula) throw new Error('Cédula vacía');
    if (!primer_nombre) throw new Error('Primer nombre vacío');
    if (!primer_apellido) throw new Error('Primer apellido vacío');

    const esCivilRaw = col('es_civil').toUpperCase();
    if (!['SI', 'NO'].includes(esCivilRaw)) {
      throw new Error(`Columna "es_civil" inválida (fila ${numeroFila}): debe ser SI o NO`);
    }
    const es_civil = esCivilRaw === 'SI';

    const numCol = (field: (typeof COLUMNAS)[number]) => { const v = col(field); return v ? Number(v) : undefined; };

    return {
      cedula,
      primer_nombre,
      primer_apellido,
      segundo_nombre: col('segundo_nombre') || undefined,
      segundo_apellido: col('segundo_apellido') || undefined,
      fecha_nacimiento: col('fecha_nacimiento') || undefined,
      email: col('email') || undefined,
      telefono: col('telefono') || undefined,
      direccion: col('direccion') || undefined,
      genero: col('genero') || undefined,
      estado_civil: col('estado_civil') || undefined,
      lugar_nacimiento: col('lugar_nacimiento') || undefined,
      es_civil,
      observaciones: col('observaciones') || undefined,
      tipo_funcionario: col('tipo_funcionario') || undefined,
      regimen_id: numCol('regimen_id'),
      unidad_id: numCol('unidad_id'),
      programa_id: numCol('programa_id'),
      situacion_id: numCol('situacion_id'),
      escalafon_id: numCol('escalafon_id'),
      grado_id: numCol('grado_id'),
      fecha_inicio: col('fecha_inicio') || undefined,
      sub_unidad_id: numCol('sub_unidad_id'),
      familiares: col('familiares') || undefined,
    };
  }

  private async crearCivil(datos: FilaCarga): Promise<number> {
    if (!datos.familiares) {
      throw new Error('El civil debe tener al menos un familiar (columna "familiares" vacía)');
    }

    const familiaresParseados = datos.familiares.split('|').map((parte) => {
      const [cedula, tipo_relacion] = parte.split(':');
      return { cedula: cedula.trim(), tipo_relacion: tipo_relacion?.trim() || undefined };
    });

    const existente = await this.prisma.personas.findUnique({ where: { cedula: datos.cedula } });
    if (existente) throw new Error(`Ya existe una persona con cédula ${datos.cedula}`);

    type PersonaFamiliar = { id: bigint; cedula: string; es_civil: boolean | null };
    const cedulasFamiliares = familiaresParseados.map((f) => f.cedula);
    const personasEncontradas = (await this.prisma.personas.findMany({
      where: { cedula: { in: cedulasFamiliares } },
      select: { id: true, cedula: true, es_civil: true },
    })) as unknown as PersonaFamiliar[];
    const porCedula = new Map(personasEncontradas.map((p) => [p.cedula, p]));
    for (const f of familiaresParseados) {
      const persona = porCedula.get(f.cedula);
      if (!persona) throw new Error(`Familiar con cédula ${f.cedula} no encontrado en el sistema`);
      if (persona.es_civil) throw new Error(`El familiar con cédula ${f.cedula} es civil, debe ser militar`);
    }
    const familiaresResueltos = familiaresParseados.map((f) => ({
      id: porCedula.get(f.cedula)!.id,
      tipo_relacion: f.tipo_relacion,
    }));

    return this.prisma.$transaction(async (tx) => {
      const persona = await tx.personas.create({
        data: {
          cedula: datos.cedula,
          primer_nombre: datos.primer_nombre,
          primer_apellido: datos.primer_apellido,
          segundo_nombre: datos.segundo_nombre,
          segundo_apellido: datos.segundo_apellido,
          fecha_nacimiento: datos.fecha_nacimiento ? new Date(datos.fecha_nacimiento) : undefined,
          email: datos.email,
          telefono: datos.telefono,
          direccion: datos.direccion,
          genero: datos.genero,
          estado_civil: datos.estado_civil,
          lugar_nacimiento: datos.lugar_nacimiento,
          es_civil: true,
        },
      });

      await tx.relaciones_familiares.createMany({
        data: familiaresResueltos.map((f) => ({
          persona_id: persona.id,
          familiar_id: f.id,
          tipo_relacion: f.tipo_relacion ?? null,
        })),
      });

      return Number(persona.id);
    });
  }

  private async crearMilitar(datos: FilaCarga): Promise<number> {
    const requeridos = ['tipo_funcionario', 'regimen_id', 'unidad_id', 'programa_id', 'situacion_id', 'escalafon_id', 'grado_id', 'fecha_inicio'] as const;
    const faltantes = requeridos.filter((c) => datos[c] == null || datos[c] === '');
    if (faltantes.length > 0) {
      throw new Error(`Campos militares faltantes: ${faltantes.join(', ')}`);
    }

    assertFechaInicioPosteriorANacimiento(datos.fecha_inicio, datos.fecha_nacimiento);

    if (!['oficial', 'subalterno'].includes(datos.tipo_funcionario!)) {
      throw new Error(`tipo_funcionario inválido: "${datos.tipo_funcionario}". Debe ser "oficial" o "subalterno"`);
    }

    const existente = await this.prisma.personas.findUnique({ where: { cedula: datos.cedula } });
    if (existente) throw new Error(`Ya existe una persona con cédula ${datos.cedula}`);

    return this.prisma.$transaction(async (tx) => {
      const persona = await tx.personas.create({
        data: {
          cedula: datos.cedula,
          primer_nombre: datos.primer_nombre,
          primer_apellido: datos.primer_apellido,
          segundo_nombre: datos.segundo_nombre,
          segundo_apellido: datos.segundo_apellido,
          fecha_nacimiento: datos.fecha_nacimiento ? new Date(datos.fecha_nacimiento) : undefined,
          email: datos.email,
          telefono: datos.telefono,
          direccion: datos.direccion,
          genero: datos.genero,
          estado_civil: datos.estado_civil,
          lugar_nacimiento: datos.lugar_nacimiento,
          es_civil: false,
        },
      });

      await tx.relaciones_laborales.create({
        data: {
          persona_id: persona.id,
          regimen_id: BigInt(datos.regimen_id!),
          unidad_id: BigInt(datos.unidad_id!),
          programa_id: BigInt(datos.programa_id!),
          situacion_id: BigInt(datos.situacion_id!),
          escalafon_id: BigInt(datos.escalafon_id!),
          grado_id: BigInt(datos.grado_id!),
          fecha_inicio: new Date(datos.fecha_inicio!),
          estado: 'activo',
          tipo_funcionario: datos.tipo_funcionario,
          sub_unidad_id: datos.sub_unidad_id ? BigInt(datos.sub_unidad_id) : undefined,
          observaciones: datos.observaciones,
        },
      });

      return Number(persona.id);
    });
  }
}
