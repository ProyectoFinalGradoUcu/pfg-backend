import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service';
import { AlcanceResuelto } from '../../lib/alcance/alcance.types';
import { whereCursosVisiblesPorAlcance } from '../../lib/alcance/alcance.where';
import {
  Catalogo,
  ColumnaPlantilla,
  DefinicionPlantilla,
  PadronDeCarga,
  ResultadoCarga,
  construirPlantilla,
  elegirOpcion,
  leerHoja,
  parsearFecha,
  procesarEnSerie,
  resumir,
  separarRepetidas,
} from '../../lib/carga-masiva';

const RESULTADOS = { Aprobado: true, Desaprobado: false, 'En curso': null } as const;

const COLUMNAS: ColumnaPlantilla[] = [
  { clave: 'cedula', titulo: 'Cédula', requerida: true, ayuda: 'Funcionario ya registrado en Personal. Sin puntos ni guión.' },
  { clave: 'curso', titulo: 'Curso', requerida: true, tipo: 'lista', lista: 'cursos', ancho: 50,
    ayuda: 'Curso del catálogo. Si no está en la lista, crealo antes en Cursos > Catálogo.' },
  { clave: 'resultado', titulo: 'Resultado', requerida: true, tipo: 'lista', lista: 'resultados',
    ayuda: 'Solo los cursos Aprobados cuentan para los requisitos de ascenso.' },
  { clave: 'fecha_inicio', titulo: 'Fecha de inicio', tipo: 'fecha' },
  { clave: 'fecha_fin', titulo: 'Fecha de fin', tipo: 'fecha' },
  { clave: 'calificacion', titulo: 'Calificación', ayuda: 'Nota o concepto, tal como figura en el acta.' },
  { clave: 'observacion', titulo: 'Observación de la calificación', ancho: 40 },
  { clave: 'numero_orden', titulo: 'N.º de orden' },
  { clave: 'boletin', titulo: 'Boletín' },
];

type CursoCatalogo = { id: bigint; nombre: string; codigo: null };

@Injectable()
export class CursosCargaService {
  constructor(private readonly prisma: PrismaService) {}

  async generarPlantilla(alcance?: AlcanceResuelto): Promise<Buffer> {
    return construirPlantilla(this.definicion(await this.cargarCursos(alcance)));
  }

  /** Si la persona ya tiene ese curso se actualiza la inscripción (es única por persona y curso). */
  async procesarCarga(buffer: Buffer, alcance?: AlcanceResuelto): Promise<ResultadoCarga> {
    const cursos = await this.cargarCursos(alcance);
    const filas = await leerHoja(buffer, this.definicion(cursos));
    const padron = await PadronDeCarga.cargar(this.prisma, filas, alcance);

    const { unicas, repetidas } = separarRepetidas(
      filas,
      (f) => (f.valores['cedula'] && f.valores['curso'] ? `${f.valores['cedula']}|${f.valores['curso'].toLowerCase()}` : ''),
      (previa) => `El mismo funcionario y curso ya aparecen en la fila ${previa}.`,
    );

    const resultados = await procesarEnSerie(unicas, async ({ valores: v }) => {
      const persona = padron.militar(v['cedula']);
      if (!v['curso']) throw new Error('Falta el curso.');
      const curso = cursos.resolver(v['curso']);
      if (!v['resultado']) throw new Error('Falta el resultado (Aprobado, Desaprobado o En curso).');
      const aprobado = elegirOpcion(v['resultado'], 'Resultado', RESULTADOS);

      const fechaInicio = parsearFecha(v['fecha_inicio'], 'Fecha de inicio');
      const fechaFin = parsearFecha(v['fecha_fin'], 'Fecha de fin');
      if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
        throw new Error('La fecha de fin es anterior a la fecha de inicio.');
      }

      const datos = {
        aprobado: aprobado ?? null,
        ...(fechaInicio ? { fecha_inicio: new Date(fechaInicio) } : {}),
        ...(fechaFin ? { fecha_fin: new Date(fechaFin) } : {}),
        ...(v['calificacion'] ? { calificacion: v['calificacion'] } : {}),
        ...(v['observacion'] ? { observacion_calificacion: v['observacion'] } : {}),
        ...(v['numero_orden'] ? { numero_orden: v['numero_orden'] } : {}),
        ...(v['boletin'] ? { boletin: v['boletin'] } : {}),
      };

      const existente = await this.prisma.funcionarios_cursos.findUnique({
        where: { persona_id_curso_id: { persona_id: persona.id, curso_id: curso.id } },
        select: { id: true },
      });
      const registro = await this.prisma.funcionarios_cursos.upsert({
        where: { persona_id_curso_id: { persona_id: persona.id, curso_id: curso.id } },
        create: { persona_id: persona.id, curso_id: curso.id, ...datos },
        // Si estaba dado de baja, el historial lo vuelve a dejar vigente.
        update: { ...datos, dado_de_baja: false, motivo_baja: null, fecha_baja: null, dado_de_baja_por: null },
      });
      return {
        id: registro.id,
        mensaje: existente ? `${persona.nombre}: inscripción existente actualizada` : persona.nombre,
      };
    });

    return resumir([...resultados, ...repetidas]);
  }

  private async cargarCursos(alcance?: AlcanceResuelto): Promise<Catalogo<CursoCatalogo>> {
    const cursos = await this.prisma.cursos.findMany({
      where: alcance ? whereCursosVisiblesPorAlcance(alcance) : {},
      orderBy: { nombre_curso: 'asc' },
      select: { id: true, nombre_curso: true },
    });
    return new Catalogo(
      'Curso',
      cursos
        .filter((c) => c.nombre_curso)
        .map((c) => ({ id: c.id, nombre: c.nombre_curso!, codigo: null })),
    );
  }

  private definicion(cursos: Catalogo<CursoCatalogo>): DefinicionPlantilla {
    return {
      hoja: 'Historial de cursos',
      titulo: 'Carga masiva de historial de cursos',
      columnas: COLUMNAS,
      listas: [
        { nombre: 'cursos', titulo: 'Curso', valores: cursos.etiquetas },
        { nombre: 'resultados', titulo: 'Resultado', valores: Object.keys(RESULTADOS) },
      ],
      instrucciones: [
        'Una fila por funcionario y curso. Si el funcionario ya tenía ese curso registrado, se actualizan sus datos.',
        'Los cursos se eligen del catálogo para que cuenten en los requisitos de ascenso. Un curso que no figura hay que crearlo antes en Cursos > Catálogo.',
        'El registro es a nivel de curso completo: los módulos no se cargan desde esta planilla.',
      ],
      ejemplos: [
        {
          cedula: '12345678',
          curso: cursos.etiquetas[0] ?? 'Curso de Comando y Estado Mayor Aéreo',
          resultado: 'Aprobado',
          fecha_inicio: new Date('2019-03-01T00:00:00Z'),
          fecha_fin: new Date('2019-11-30T00:00:00Z'),
          calificacion: '8.5',
          numero_orden: 'O.C.G.F.A. N.º 12.345',
        },
      ],
    };
  }
}
