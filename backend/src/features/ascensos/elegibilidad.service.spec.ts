import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ElegibilidadService } from './elegibilidad.service';
import { PrismaService } from '../../lib/prisma.service';
import {
  DatosFuncionario,
  ReglaEvaluable,
  duracionLegible,
  edadA,
  estadoDelCurso,
  evaluarFuncionario,
  requisitoAplica,
} from './elegibilidad.evaluador';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const HOY = new Date('2026-09-06T00:00:00Z');

const OPCIONES = {
  fecha_referencia: HOY,
  situaciones_elegibles: ['SIT01', 'SIT07'],
  situaciones_bloqueantes: ['SIT03', 'SIT04', 'SIT06', 'SIT09', 'SIT10', 'SIT11'],
};

const makeDatos = (overrides: Partial<DatosFuncionario> = {}): DatosFuncionario => ({
  persona: {
    id: '100',
    cedula: '12345678',
    nombre: 'José',
    apellido: 'Pérez',
    fecha_nacimiento: new Date('1990-01-01'),
  },
  relacion: {
    id: '500',
    fecha_inicio: new Date('2015-02-01'),
    fecha_ultimo_ascenso: new Date('2022-02-01'),
    mutaciones: null,
    anios_servicio_anterior: 0,
  },
  grado: { id: '3', codigo: 'CBO_2DA', denominacion: 'Cbo. 2ª', orden: 2 },
  situacion: { id: '7', codigo: 'SIT07', denominacion: 'Actividad' },
  unidad: { id: '5', denominacion: 'Base Aérea Nº 1' },
  escalafon: { id: '14', denominacion: 'Aerotécnicos' },
  legajo: null,
  cursos: new Map(),
  retiro: null,
  ...overrides,
});

const makeRegla = (overrides: Partial<ReglaEvaluable> = {}): ReglaEvaluable => ({
  id: '40',
  nombre: 'Cbo. 2.ª → Cbo. 1.ª',
  grado_origen_id: '3',
  grado_destino: { id: '4', codigo: 'CBO_1RA', denominacion: 'Cbo. 1ª', orden: 3 },
  dias_minimos: 730,
  edad_maxima: 47,
  requisitos: [],
  ...overrides,
});

const requisitoCurso = (overrides: Partial<ReglaEvaluable['requisitos'][number]> = {}) => ({
  tipo: 'CURSO_APROBADO',
  descripcion: 'Curso de pasaje de grado (M-02)',
  modo: 'TODOS',
  aplica_si: ['SIEMPRE'],
  parametros: null,
  orden: 1,
  cursos: [{ id: '12', nombre: 'Curso M-02' }],
  ...overrides,
});

// ─── Evaluador ────────────────────────────────────────────────────────────────

describe('evaluarFuncionario', () => {
  describe('antigüedad en el grado', () => {
    it('es pasible cuando cumple el tiempo y no hay más requisitos', () => {
      const res = evaluarFuncionario(makeDatos(), makeRegla(), OPCIONES);

      expect(res.estado).toBe('PASIBLE');
      expect(res.grado_destino?.codigo).toBe('CBO_1RA');
      expect(res.fecha_cumpliria).toBeNull();
    });

    it('es próximo cuando lo único que falta es tiempo, y dice cuándo lo cumple', () => {
      const datos = makeDatos({
        relacion: { ...makeDatos().relacion, fecha_ultimo_ascenso: new Date('2026-01-01') },
      });

      const res = evaluarFuncionario(datos, makeRegla(), OPCIONES);

      expect(res.estado).toBe('PROXIMO');
      expect(res.fecha_cumpliria).toBe('2028-01-01');
    });

    it('el día exacto en que cumple los días mínimos ya es pasible', () => {
      const datos = makeDatos({
        relacion: { ...makeDatos().relacion, fecha_ultimo_ascenso: new Date('2024-09-06') },
      });

      const res = evaluarFuncionario(datos, makeRegla(), OPCIONES);

      expect(res.requisitos[0].valor).toBe(730);
      expect(res.estado).toBe('PASIBLE');
    });

    it('un día antes todavía no', () => {
      const datos = makeDatos({
        relacion: { ...makeDatos().relacion, fecha_ultimo_ascenso: new Date('2024-09-07') },
      });

      expect(evaluarFuncionario(datos, makeRegla(), OPCIONES).estado).toBe('PROXIMO');
    });

    it('sin fecha de último ascenso cuenta desde el inicio de la relación', () => {
      const datos = makeDatos({
        relacion: { ...makeDatos().relacion, fecha_ultimo_ascenso: null },
      });

      const res = evaluarFuncionario(datos, makeRegla(), OPCIONES);

      expect(res.estado).toBe('PASIBLE');
      expect(res.antiguedad_dias).toBeGreaterThan(4000);
    });
  });

  describe('edad', () => {
    it('queda fuera de edad cuando llegó al máximo de la regla', () => {
      const datos = makeDatos({
        persona: { ...makeDatos().persona, fecha_nacimiento: new Date('1979-01-01') },
      });

      const res = evaluarFuncionario(datos, makeRegla({ edad_maxima: 47 }), OPCIONES);

      expect(res.estado).toBe('FUERA_DE_EDAD');
      expect(res.edad).toBe(47);
    });

    it('con un año menos que el máximo todavía puede', () => {
      const datos = makeDatos({
        persona: { ...makeDatos().persona, fecha_nacimiento: new Date('1980-01-01') },
      });

      const res = evaluarFuncionario(datos, makeRegla({ edad_maxima: 47 }), OPCIONES);

      expect(res.edad).toBe(46);
      expect(res.estado).toBe('PASIBLE');
    });

    it('una regla de oficiales no tiene tope de edad y no agrega el requisito', () => {
      const datos = makeDatos({
        persona: { ...makeDatos().persona, fecha_nacimiento: new Date('1960-01-01') },
      });

      const res = evaluarFuncionario(datos, makeRegla({ edad_maxima: null }), OPCIONES);

      expect(res.estado).toBe('PASIBLE');
      expect(res.requisitos.some((r) => r.tipo === 'EDAD')).toBe(false);
    });

    it('sin fecha de nacimiento el requisito de edad no se cumple y se avisa', () => {
      const datos = makeDatos({
        persona: { ...makeDatos().persona, fecha_nacimiento: null },
      });

      const res = evaluarFuncionario(datos, makeRegla({ edad_maxima: 47 }), OPCIONES);

      const edad = res.requisitos.find((r) => r.tipo === 'EDAD')!;
      expect(edad.cumple).toBe(false);
      expect(edad.detalle).toContain('sin fecha de nacimiento');
      expect(res.estado).toBe('BLOQUEADO');
      expect(res.edad).toBeNull();
    });
  });

  describe('cursos', () => {
    it('un curso aprobado cumple el requisito', () => {
      const datos = makeDatos({
        cursos: new Map([['12', { aprobado: true, dado_de_baja: false }]]),
      });

      const res = evaluarFuncionario(
        datos,
        makeRegla({ requisitos: [requisitoCurso()] }),
        OPCIONES,
      );

      expect(res.estado).toBe('PASIBLE');
    });

    it('un curso en curso no cumple, y se reporta distinto de no realizado', () => {
      const datos = makeDatos({
        cursos: new Map([['12', { aprobado: null, dado_de_baja: false }]]),
      });

      const res = evaluarFuncionario(
        datos,
        makeRegla({ requisitos: [requisitoCurso()] }),
        OPCIONES,
      );

      expect(res.estado).toBe('BLOQUEADO');
      expect(res.requisitos[2].cursos![0].estado).toBe('EN_CURSO');
    });

    it('un curso dado de baja no cuenta como aprobado', () => {
      const datos = makeDatos({
        cursos: new Map([['12', { aprobado: true, dado_de_baja: true }]]),
      });

      const res = evaluarFuncionario(
        datos,
        makeRegla({ requisitos: [requisitoCurso()] }),
        OPCIONES,
      );

      expect(res.estado).toBe('BLOQUEADO');
      expect(res.requisitos[2].cursos![0].estado).toBe('DADO_DE_BAJA');
    });

    it('con modo ALGUNO alcanza con uno de los cursos', () => {
      const datos = makeDatos({
        cursos: new Map([['13', { aprobado: true, dado_de_baja: false }]]),
      });

      const res = evaluarFuncionario(
        datos,
        makeRegla({
          requisitos: [
            requisitoCurso({
              modo: 'ALGUNO',
              cursos: [
                { id: '12', nombre: 'M-02' },
                { id: '13', nombre: 'M-02 equivalente' },
              ],
            }),
          ],
        }),
        OPCIONES,
      );

      expect(res.estado).toBe('PASIBLE');
    });

    it('con modo TODOS hacen falta los dos', () => {
      const datos = makeDatos({
        cursos: new Map([['13', { aprobado: true, dado_de_baja: false }]]),
      });

      const res = evaluarFuncionario(
        datos,
        makeRegla({
          requisitos: [
            requisitoCurso({
              cursos: [
                { id: '12', nombre: 'M-02' },
                { id: '13', nombre: 'Nivel 7' },
              ],
            }),
          ],
        }),
        OPCIONES,
      );

      expect(res.estado).toBe('BLOQUEADO');
    });

    it('un requisito de curso sin cursos vinculados no se puede cumplir y lo dice', () => {
      const res = evaluarFuncionario(
        makeDatos(),
        makeRegla({ requisitos: [requisitoCurso({ cursos: [] })] }),
        OPCIONES,
      );

      expect(res.estado).toBe('BLOQUEADO');
      expect(res.requisitos[2].detalle).toContain('no tiene ningún curso vinculado');
    });
  });

  describe('condiciones de aplicación', () => {
    it('el curso de Cbo. 2.ª no aplica a quien no es mutado ni tiene nivel liceal', () => {
      const res = evaluarFuncionario(
        makeDatos(),
        makeRegla({
          requisitos: [requisitoCurso({ aplica_si: ['ES_MUTADO', 'NIVEL_LICEAL'] })],
        }),
        OPCIONES,
      );

      expect(res.requisitos[2].aplica).toBe(false);
      expect(res.requisitos[2].detalle).toBe('No aplica a este funcionario');
      expect(res.estado).toBe('PASIBLE');
    });

    it('al mutado sí le aplica, y sin el curso queda bloqueado', () => {
      const datos = makeDatos({
        relacion: { ...makeDatos().relacion, mutaciones: 'Mutado de SG a AT, O.D. 8.221' },
      });

      const res = evaluarFuncionario(
        datos,
        makeRegla({
          requisitos: [requisitoCurso({ aplica_si: ['ES_MUTADO', 'NIVEL_LICEAL'] })],
        }),
        OPCIONES,
      );

      expect(res.requisitos[2].aplica).toBe(true);
      expect(res.estado).toBe('BLOQUEADO');
    });

    it('a quien tiene nivel liceal también le aplica', () => {
      const datos = makeDatos({
        legajo: { nivel_educativo: 'BACHILLERATO_TECNOLOGICO', fecha_egreso_eta: null },
      });

      const res = evaluarFuncionario(
        datos,
        makeRegla({
          requisitos: [requisitoCurso({ aplica_si: ['ES_MUTADO', 'NIVEL_LICEAL'] })],
        }),
        OPCIONES,
      );

      expect(res.requisitos[2].aplica).toBe(true);
    });

    it('al egresado de la ETA no se le exige el curso de pasaje del tramo AT', () => {
      const datos = makeDatos({
        legajo: { nivel_educativo: null, fecha_egreso_eta: new Date('2020-12-15') },
      });

      const res = evaluarFuncionario(
        datos,
        makeRegla({
          edad_maxima: null,
          requisitos: [requisitoCurso({ aplica_si: ['ES_MUTADO'] })],
        }),
        OPCIONES,
      );

      expect(res.requisitos[1].aplica).toBe(false);
      expect(res.estado).toBe('PASIBLE');
    });

    it('una condición desconocida no habilita el requisito', () => {
      expect(requisitoAplica(['ES_ZURDO'], makeDatos())).toBe(false);
    });
  });

  describe('bloqueos', () => {
    it('una situación fuera de la lista elegible bloquea antes de mirar las reglas', () => {
      const datos = makeDatos({
        situacion: { id: '3', codigo: 'SIT03', denominacion: 'Licencia sin goce de sueldo' },
      });

      const res = evaluarFuncionario(datos, makeRegla(), OPCIONES);

      expect(res.estado).toBe('BLOQUEADO');
      expect(res.motivo).toContain('Licencia sin goce de sueldo');
      expect(res.requisitos).toEqual([]);
    });

    it('sin situación de revista también bloquea, y lo explica', () => {
      const res = evaluarFuncionario(makeDatos({ situacion: null }), makeRegla(), OPCIONES);

      expect(res.estado).toBe('BLOQUEADO');
      expect(res.motivo).toContain('situación de revista');
    });

    it('un retiro registrado bloquea', () => {
      const datos = makeDatos({ retiro: { fecha_retiro: new Date('2026-03-01') } });

      const res = evaluarFuncionario(datos, makeRegla(), OPCIONES);

      expect(res.estado).toBe('BLOQUEADO');
      expect(res.motivo).toContain('2026-03-01');
    });
  });

  describe('sin regla', () => {
    it('el último grado de la escala es tope, no un pendiente', () => {
      const datos = makeDatos({
        grado: { id: '6', codigo: 'SOM', denominacion: 'S.O.M.', orden: 6 },
      });

      const res = evaluarFuncionario(datos, null, OPCIONES);

      expect(res.estado).toBe('TOPE_DE_ESCALA');
    });

    it('un grado intermedio sin regla queda como pendiente de cargar', () => {
      const res = evaluarFuncionario(makeDatos(), null, OPCIONES);

      expect(res.estado).toBe('SIN_REGLA');
      expect(res.motivo).toContain('No hay una regla');
    });
  });

  describe('utilidades', () => {
    it('la edad se cuenta en años cumplidos', () => {
      expect(edadA(new Date('1990-09-07'), new Date('2026-09-06'))).toBe(35);
      expect(edadA(new Date('1990-09-06'), new Date('2026-09-06'))).toBe(36);
    });

    it('la duración se lee en años y meses', () => {
      expect(duracionLegible(730)).toBe('2 años');
      expect(duracionLegible(487)).toBe('1 año 4 meses');
      expect(duracionLegible(15)).toBe('15 días');
    });

    it('el estado del curso distingue los cuatro casos', () => {
      expect(estadoDelCurso(undefined)).toBe('NO_REALIZADO');
      expect(estadoDelCurso({ aprobado: true, dado_de_baja: false })).toBe('APROBADO');
      expect(estadoDelCurso({ aprobado: null, dado_de_baja: false })).toBe('EN_CURSO');
      expect(estadoDelCurso({ aprobado: false, dado_de_baja: false })).toBe('NO_APROBADO');
      expect(estadoDelCurso({ aprobado: true, dado_de_baja: true })).toBe('DADO_DE_BAJA');
    });
  });
});

// ─── Servicio ─────────────────────────────────────────────────────────────────

const makeRelacionFila = (overrides: Partial<any> = {}) => ({
  id: 500n,
  fecha_inicio: new Date('2015-02-01'),
  fecha_ultimo_ascenso: new Date('2022-02-01'),
  mutaciones: null,
  anios_servicio_anterior: 0,
  personas: {
    id: 100n,
    cedula: '12345678',
    primer_nombre: 'José',
    primer_apellido: 'Pérez',
    fecha_nacimiento: new Date('1990-01-01'),
  },
  grados: { id: 3n, codigo: 'CBO_2DA', denominacion: 'Cbo. 2ª', orden: 2 },
  situaciones: { id: 7n, codigo: 'SIT07', denominacion: 'Actividad' },
  unidades: { id: 5n, denominacion: 'Base Aérea Nº 1' },
  escalafones: { id: 14n, denominacion: 'Aerotécnicos' },
  ...overrides,
});

const makeReglaFila = (overrides: Partial<any> = {}) => ({
  id: 40n,
  nombre: 'Cbo. 2.ª → Cbo. 1.ª',
  grado_origen_id: 3n,
  dias_minimos: 730,
  edad_maxima: 47,
  grado_destino: { id: 4n, codigo: 'CBO_1RA', denominacion: 'Cbo. 1ª', orden: 3 },
  requisitos: [],
  ...overrides,
});

const makePrismaMock = () => ({
  relaciones_laborales: { findMany: jest.fn().mockResolvedValue([]) },
  ascensos_reglas: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
  funcionarios_cursos: { findMany: jest.fn().mockResolvedValue([]) },
  legajo_militar: { findMany: jest.fn().mockResolvedValue([]) },
  retiros: { findMany: jest.fn().mockResolvedValue([]) },
  cursos: { findMany: jest.fn().mockResolvedValue([]) },
});

describe('ElegibilidadService', () => {
  let service: ElegibilidadService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ElegibilidadService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<ElegibilidadService>(ElegibilidadService);
  });

  describe('listarPasibles', () => {
    it('devuelve pasibles y próximos por defecto, no los bloqueados', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        makeRelacionFila(),
        makeRelacionFila({
          id: 501n,
          personas: { ...makeRelacionFila().personas, id: 101n, primer_apellido: 'Álvarez' },
          situaciones: { id: 3n, codigo: 'SIT03', denominacion: 'Licencia sin goce' },
        }),
      ]);
      prisma.ascensos_reglas.findMany.mockResolvedValue([makeReglaFila()]);

      const res = await service.listarPasibles();

      expect(res.items).toHaveLength(1);
      expect(res.items[0].persona.apellido).toBe('Pérez');
      expect(res.stats.PASIBLE).toBe(1);
      expect(res.stats.BLOQUEADO).toBe(1);
    });

    it('con el filtro de estado devuelve también los bloqueados', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        makeRelacionFila({ situaciones: { id: 3n, codigo: 'SIT03', denominacion: 'Licencia' } }),
      ]);
      prisma.ascensos_reglas.findMany.mockResolvedValue([makeReglaFila()]);

      const res = await service.listarPasibles({ estado: ['BLOQUEADO'] });

      expect(res.items).toHaveLength(1);
    });

    it('ordena por apellido: sin orden de precedencia, como pidió la FAU', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        makeRelacionFila(),
        makeRelacionFila({
          id: 501n,
          personas: {
            ...makeRelacionFila().personas,
            id: 101n,
            primer_apellido: 'Acosta',
          },
        }),
      ]);
      prisma.ascensos_reglas.findMany.mockResolvedValue([makeReglaFila()]);

      const res = await service.listarPasibles();

      expect(res.items.map((i) => i.persona.apellido)).toEqual(['Acosta', 'Pérez']);
    });

    it('el horizonte deja fuera a los próximos que cumplen demasiado lejos', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        makeRelacionFila({ fecha_ultimo_ascenso: new Date('2026-08-01') }),
      ]);
      prisma.ascensos_reglas.findMany.mockResolvedValue([makeReglaFila()]);

      const cerca = await service.listarPasibles({ horizonte_meses: 120 });
      const lejos = await service.listarPasibles({ horizonte_meses: 6 });

      expect(cerca.items).toHaveLength(1);
      expect(lejos.items).toHaveLength(0);
    });

    it('excluye a los civiles y a las relaciones ya cerradas', async () => {
      await service.listarPasibles();

      const where = prisma.relaciones_laborales.findMany.mock.calls[0][0].where;
      expect(where.fecha_fin).toBeNull();
      expect(where.personas).toEqual({ es_civil: false });
    });

    it('no cuenta los retiros anulados: un reincorporado no queda bloqueado', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValue([makeRelacionFila()]);
      prisma.ascensos_reglas.findMany.mockResolvedValue([makeReglaFila()]);

      await service.listarPasibles();

      const where = prisma.retiros.findMany.mock.calls[0][0].where;
      expect(where.anulado).toBe(false);
    });

    it('con alcance de unidad filtra por las unidades del usuario', async () => {
      await service.listarPasibles({}, { tipo: 'unidad', unidadIds: ['5', '7'] });

      const where = prisma.relaciones_laborales.findMany.mock.calls[0][0].where;
      expect(where.unidad_id).toEqual({ in: [5n, 7n] });
    });

    it('no consulta los cursos si no hay nadie en la nómina', async () => {
      const res = await service.listarPasibles();

      expect(prisma.funcionarios_cursos.findMany).not.toHaveBeenCalled();
      expect(res.items).toEqual([]);
    });

    it('carga los cursos de todos en una sola consulta, sin N+1', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        makeRelacionFila(),
        makeRelacionFila({ id: 501n, personas: { ...makeRelacionFila().personas, id: 101n } }),
      ]);

      await service.listarPasibles();

      expect(prisma.funcionarios_cursos.findMany).toHaveBeenCalledTimes(1);
      expect(
        prisma.funcionarios_cursos.findMany.mock.calls[0][0].where.persona_id.in,
      ).toEqual([100n, 101n]);
    });
  });

  describe('evaluarPersona', () => {
    it('devuelve la evaluación completa del funcionario', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValue([makeRelacionFila()]);
      prisma.ascensos_reglas.findMany.mockResolvedValue([makeReglaFila()]);

      const res = await service.evaluarPersona(100);

      expect(res.persona.cedula).toBe('12345678');
      expect(res.estado).toBe('PASIBLE');
    });

    it('devuelve 404 si no tiene relación laboral vigente', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValue([]);

      await expect(service.evaluarPersona(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('resumen', () => {
    it('cuenta por estado, por escalafón y avisa a quién le falta la fecha de nacimiento', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        makeRelacionFila(),
        makeRelacionFila({
          id: 501n,
          personas: {
            ...makeRelacionFila().personas,
            id: 101n,
            fecha_nacimiento: null,
          },
        }),
      ]);
      prisma.ascensos_reglas.findMany.mockResolvedValue([makeReglaFila()]);

      const res = await service.resumen();

      expect(res.total_evaluados).toBe(2);
      expect(res.por_estado.PASIBLE).toBe(1);
      expect(res.sin_fecha_nacimiento).toBe(1);
      expect(res.por_escalafon[0].escalafon).toBe('Aerotécnicos');
    });

    it('rankea los cursos que más bloquean', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValue([makeRelacionFila()]);
      prisma.ascensos_reglas.findMany.mockResolvedValue([
        makeReglaFila({
          requisitos: [
            {
              tipo: 'CURSO_APROBADO',
              descripcion: 'Curso de pasaje',
              modo: 'TODOS',
              aplica_si: ['SIEMPRE'],
              parametros: null,
              orden: 1,
              cursos: [{ curso: { id: 12n, nombre_curso: 'Curso M-02' } }],
            },
          ],
        }),
      ]);

      const res = await service.resumen();

      expect(res.cursos_que_bloquean).toEqual([{ curso: 'Curso M-02', funcionarios: 1 }]);
    });
  });

  describe('simularImpacto', () => {
    it('compara la regla vigente con la simulada y dice a quién le cambia', async () => {
      prisma.ascensos_reglas.findUnique.mockResolvedValue(makeReglaFila());
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        makeRelacionFila({ fecha_ultimo_ascenso: new Date('2023-01-01') }),
      ]);

      const res = await service.simularImpacto(40, { dias_minimos: 5000 });

      expect(res.evaluados).toBe(1);
      expect(res.dejan_de_ser_pasibles).toBe(1);
      expect(res.pasan_a_pasibles).toBe(0);
      expect(res.pierden[0].persona.cedula).toBe('12345678');
    });

    it('bajar el tiempo mínimo suma pasibles', async () => {
      prisma.ascensos_reglas.findUnique.mockResolvedValue(
        makeReglaFila({ dias_minimos: 5000 }),
      );
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        makeRelacionFila({ fecha_ultimo_ascenso: new Date('2023-01-01') }),
      ]);

      const res = await service.simularImpacto(40, { dias_minimos: 730 });

      expect(res.pasan_a_pasibles).toBe(1);
    });

    it('devuelve 404 si la regla no existe', async () => {
      prisma.ascensos_reglas.findUnique.mockResolvedValue(null);

      await expect(service.simularImpacto(40, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('situaciones configurables', () => {
    it('salen de las constantes cuando no hay variable de entorno', () => {
      expect(service.situacionesElegibles).toEqual(['SIT01', 'SIT07']);
      expect(service.situacionesBloqueantes).toContain('SIT03');
    });

    it('la variable de entorno las reemplaza', () => {
      process.env.ASCENSOS_SITUACIONES_ELEGIBLES = 'SIT01, SIT02';
      expect(service.situacionesElegibles).toEqual(['SIT01', 'SIT02']);
      delete process.env.ASCENSOS_SITUACIONES_ELEGIBLES;
    });
  });
});
