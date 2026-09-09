import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReglasAscensoService } from './reglas-ascenso.service';
import { PrismaService } from '../../lib/prisma.service';
import { CreateReglaDto } from './dto/create-regla.dto';
import { ReglaRequisitoDto } from './dto/regla-requisito.dto';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeGrado = (overrides: Partial<any> = {}) => ({
  id: 3n,
  codigo: 'CBO_2DA',
  denominacion: 'Cbo. 2ª',
  orden: 2,
  ...overrides,
});

const makeRequisito = (overrides: Partial<any> = {}) => ({
  id: 70n,
  regla_id: 40n,
  tipo: 'CURSO_APROBADO',
  descripcion: 'Curso de pasaje de grado (M-02)',
  modo: 'TODOS',
  aplica_si: ['ES_MUTADO', 'NIVEL_LICEAL'],
  parametros: null,
  orden: 1,
  cursos: [
    { curso_id: 12n, curso: { id: 12n, nombre_curso: 'Curso M-02', institucion: 'ETA' } },
  ],
  ...overrides,
});

const makeRegla = (overrides: Partial<any> = {}) => ({
  id: 40n,
  nombre: 'Cbo. 2.ª → Cbo. 1.ª',
  grado_origen_id: 3n,
  grado_destino_id: 4n,
  dias_minimos: 730,
  edad_maxima: 47,
  notas: null,
  es_por_defecto: true,
  activo: true,
  vigente_desde: new Date('2026-09-01'),
  vigente_hasta: null,
  actualizado_por: null,
  actualizado_en: new Date('2026-09-01T12:00:00Z'),
  grado_origen: makeGrado(),
  grado_destino: makeGrado({ id: 4n, codigo: 'CBO_1RA', denominacion: 'Cbo. 1ª', orden: 3 }),
  usuario: null,
  requisitos: [makeRequisito()],
  ...overrides,
});

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const makePrismaMock = () => {
  const mock: any = {
    ascensos_reglas: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    ascensos_reglas_requisitos: { create: jest.fn().mockResolvedValue({ id: 71n }) },
    ascensos_reglas_requisito_cursos: { createMany: jest.fn() },
    grados: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    cursos: { findMany: jest.fn().mockResolvedValue([]) },
    relaciones_laborales: { groupBy: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation((cb: any) => cb(mock));
  return mock;
};

describe('ReglasAscensoService', () => {
  let service: ReglasAscensoService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReglasAscensoService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<ReglasAscensoService>(ReglasAscensoService);
  });

  // ─── Escalera ───────────────────────────────────────────────────────────────

  describe('listarEscalera', () => {
    const gradosDeLaEscala = [
      makeGrado({ id: 1n, codigo: 'SDO_2DA', denominacion: 'Sdo. 2ª', orden: 0 }),
      makeGrado({ id: 2n, codigo: 'SDO_1RA', denominacion: 'Sdo. 1ª', orden: 1 }),
      makeGrado({ id: 3n, codigo: 'CBO_2DA', denominacion: 'Cbo. 2ª', orden: 2 }),
      makeGrado({ id: 4n, codigo: 'CBO_1RA', denominacion: 'Cbo. 1ª', orden: 3 }),
    ];

    it('agrupa los tramos por escalafón y devuelve los que no tienen regla', async () => {
      prisma.grados.findMany.mockResolvedValue(gradosDeLaEscala);
      prisma.ascensos_reglas.findMany.mockResolvedValue([makeRegla()]);

      const res = await service.listarEscalera();

      const subalternos = res.grupos.find((g) => g.clave === 'SUBALTERNOS')!;
      expect(subalternos.nombre).toBe('Subalternos (SG y ST)');
      const conRegla = subalternos.escalones.filter((e) => e.regla !== null);
      const sinRegla = subalternos.escalones.filter((e) => e.regla === null);
      expect(conRegla).toHaveLength(1);
      expect(conRegla[0].regla!.nombre).toBe('Cbo. 2.ª → Cbo. 1.ª');
      expect(sinRegla.length).toBeGreaterThan(0);
    });

    it('no inventa un escalón para el tope de la escala', async () => {
      prisma.grados.findMany.mockResolvedValue(gradosDeLaEscala);

      const res = await service.listarEscalera();

      const subalternos = res.grupos.find((g) => g.clave === 'SUBALTERNOS')!;
      expect(subalternos.escalones.some((e) => e.grado_origen.codigo === 'CBO_1RA')).toBe(false);
    });

    it('cuenta cuántos funcionarios están hoy en cada grado de origen', async () => {
      prisma.grados.findMany.mockResolvedValue(gradosDeLaEscala);
      prisma.ascensos_reglas.findMany.mockResolvedValue([makeRegla()]);
      prisma.relaciones_laborales.groupBy.mockResolvedValue([
        { grado_id: 3n, _count: { _all: 12 } },
      ]);

      const res = await service.listarEscalera();

      const escalon = res.grupos
        .flatMap((g) => g.escalones)
        .find((e) => e.grado_origen.codigo === 'CBO_2DA')!;
      expect(escalon.funcionarios_en_grado).toBe(12);
    });

    it('agrupa aparte las reglas cargadas sobre grados fuera de la escala del Excel', async () => {
      prisma.grados.findMany.mockResolvedValue(gradosDeLaEscala);
      prisma.ascensos_reglas.findMany.mockResolvedValue([
        makeRegla({
          id: 99n,
          grado_origen_id: 500n,
          grado_origen: makeGrado({ id: 500n, codigo: 'CADETE_1RA', orden: 0 }),
        }),
      ]);

      const res = await service.listarEscalera();

      const otros = res.grupos.find((g) => g.clave === 'OTROS')!;
      expect(otros.escalones).toHaveLength(1);
    });

    it('cuenta cuántas reglas fueron modificadas respecto de las de la FAU', async () => {
      prisma.grados.findMany.mockResolvedValue(gradosDeLaEscala);
      prisma.ascensos_reglas.findMany.mockResolvedValue([
        makeRegla(),
        makeRegla({ id: 41n, grado_origen_id: 2n, es_por_defecto: false, activo: false }),
      ]);

      const res = await service.listarEscalera();

      expect(res.stats.tramos_con_regla).toBe(2);
      expect(res.stats.tramos_activos).toBe(1);
      expect(res.stats.reglas_modificadas).toBe(1);
    });
  });

  // ─── Crear ──────────────────────────────────────────────────────────────────

  describe('crear', () => {
    const dto: CreateReglaDto = {
      nombre: 'Cbo. 2.ª → Cbo. 1.ª',
      grado_origen_id: 3,
      grado_destino_id: 4,
      dias_minimos: 730,
      edad_maxima: 47,
    };

    const gradosOk = () => {
      prisma.grados.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === 3n ? makeGrado() : makeGrado({ id: 4n, codigo: 'CBO_1RA', orden: 3 }),
        ),
      );
    };

    it('rechaza un grado destino que no es superior al de origen', async () => {
      prisma.grados.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === 3n
            ? makeGrado({ orden: 5 })
            : makeGrado({ id: 4n, codigo: 'CBO_1RA', orden: 3 }),
        ),
      );

      await expect(service.crear(dto)).rejects.toThrow(BadRequestException);
    });

    it('rechaza un grado que no existe', async () => {
      prisma.grados.findUnique.mockResolvedValue(null);

      await expect(service.crear(dto)).rejects.toThrow(NotFoundException);
    });

    it('no deja dos reglas vigentes para el mismo grado de origen', async () => {
      gradosOk();
      prisma.ascensos_reglas.findFirst.mockResolvedValue({ id: 40n, nombre: 'La que ya está' });

      await expect(service.crear(dto)).rejects.toThrow(ConflictException);
    });

    it('crea la regla con sus requisitos y los cursos vinculados', async () => {
      gradosOk();
      prisma.ascensos_reglas.create.mockResolvedValue({ id: 40n });
      prisma.ascensos_reglas.findUnique.mockResolvedValue(makeRegla());
      prisma.cursos.findMany.mockResolvedValue([{ id: 12n }]);

      await service.crear({
        ...dto,
        requisitos: [
          {
            tipo: 'CURSO_APROBADO',
            descripcion: 'Curso de pasaje de grado (M-02)',
            aplica_si: ['ES_MUTADO'],
            cursos_ids: [12],
          },
        ],
      });

      expect(prisma.ascensos_reglas_requisitos.create).toHaveBeenCalledTimes(1);
      const reqData = prisma.ascensos_reglas_requisitos.create.mock.calls[0][0].data;
      expect(reqData.aplica_si).toEqual(['ES_MUTADO']);
      expect(reqData.modo).toBe('TODOS');
      expect(prisma.ascensos_reglas_requisito_cursos.createMany).toHaveBeenCalledWith({
        data: [{ requisito_id: 71n, curso_id: 12n }],
      });
    });

    it('rechaza un requisito de curso sin ningún curso vinculado', async () => {
      gradosOk();
      prisma.ascensos_reglas.create.mockResolvedValue({ id: 40n });

      await expect(
        service.crear({
          ...dto,
          requisitos: [{ tipo: 'CURSO_APROBADO', descripcion: 'Un curso cualquiera' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza un curso que no está en el catálogo', async () => {
      gradosOk();
      prisma.ascensos_reglas.create.mockResolvedValue({ id: 40n });
      prisma.cursos.findMany.mockResolvedValue([]);

      await expect(
        service.crear({
          ...dto,
          requisitos: [
            { tipo: 'CURSO_APROBADO', descripcion: 'Curso fantasma', cursos_ids: [999] },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Editar (versionado) ────────────────────────────────────────────────────

  describe('editar', () => {
    it('cierra la versión vigente y crea una nueva en lugar de sobreescribir', async () => {
      prisma.ascensos_reglas.findUnique
        .mockResolvedValueOnce(makeRegla())
        .mockResolvedValue(makeRegla({ id: 41n, dias_minimos: 1095, es_por_defecto: false }));
      prisma.ascensos_reglas.create.mockResolvedValue({ id: 41n });
      prisma.cursos.findMany.mockResolvedValue([{ id: 12n }]);
      prisma.ascensos_reglas.findMany.mockResolvedValue([]);

      await service.editar(40, { dias_minimos: 1095 }, 8n);

      const cierre = prisma.ascensos_reglas.update.mock.calls[0][0];
      expect(cierre.where).toEqual({ id: 40n });
      expect(cierre.data.vigente_hasta).toBeInstanceOf(Date);

      const nueva = prisma.ascensos_reglas.create.mock.calls[0][0].data;
      expect(nueva.dias_minimos).toBe(1095);
      expect(nueva.es_por_defecto).toBe(false);
      expect(nueva.actualizado_por).toBe(8n);
    });

    it('copia los requisitos de la versión anterior si el DTO no los trae', async () => {
      prisma.ascensos_reglas.findUnique
        .mockResolvedValueOnce(makeRegla())
        .mockResolvedValue(makeRegla({ id: 41n }));
      prisma.ascensos_reglas.create.mockResolvedValue({ id: 41n });
      prisma.cursos.findMany.mockResolvedValue([{ id: 12n }]);
      prisma.ascensos_reglas.findMany.mockResolvedValue([]);

      await service.editar(40, { dias_minimos: 1095 });

      const reqData = prisma.ascensos_reglas_requisitos.create.mock.calls[0][0].data;
      expect(reqData.descripcion).toBe('Curso de pasaje de grado (M-02)');
      expect(reqData.aplica_si).toEqual(['ES_MUTADO', 'NIVEL_LICEAL']);
    });

    it('conserva los campos que el DTO no menciona', async () => {
      prisma.ascensos_reglas.findUnique
        .mockResolvedValueOnce(makeRegla())
        .mockResolvedValue(makeRegla({ id: 41n }));
      prisma.ascensos_reglas.create.mockResolvedValue({ id: 41n });
      prisma.cursos.findMany.mockResolvedValue([{ id: 12n }]);
      prisma.ascensos_reglas.findMany.mockResolvedValue([]);

      await service.editar(40, { notas: 'A confirmar con la Dirección' });

      const nueva = prisma.ascensos_reglas.create.mock.calls[0][0].data;
      expect(nueva.dias_minimos).toBe(730);
      expect(nueva.edad_maxima).toBe(47);
      expect(nueva.notas).toBe('A confirmar con la Dirección');
    });

    it('no deja editar una versión ya cerrada', async () => {
      prisma.ascensos_reglas.findUnique.mockResolvedValue(
        makeRegla({ vigente_hasta: new Date('2026-08-01') }),
      );

      await expect(service.editar(40, { dias_minimos: 1095 })).rejects.toThrow(
        ConflictException,
      );
    });

    it('devuelve 404 si la regla no existe', async () => {
      prisma.ascensos_reglas.findUnique.mockResolvedValue(null);

      await expect(service.editar(40, {})).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Desactivar y activar ───────────────────────────────────────────────────

  describe('desactivar / activar', () => {
    it('desactiva sin cerrar la versión: el tramo sigue visible en la escalera', async () => {
      prisma.ascensos_reglas.findUnique
        .mockResolvedValueOnce({ id: 40n, activo: true, vigente_hasta: null })
        .mockResolvedValue(makeRegla({ activo: false }));
      prisma.ascensos_reglas.findMany.mockResolvedValue([]);

      await service.desactivar(40, 8n);

      const data = prisma.ascensos_reglas.update.mock.calls[0][0].data;
      expect(data.activo).toBe(false);
      expect(data.vigente_hasta).toBeUndefined();
    });

    it('no desactiva dos veces', async () => {
      prisma.ascensos_reglas.findUnique.mockResolvedValue({
        id: 40n,
        activo: false,
        vigente_hasta: null,
      });

      await expect(service.desactivar(40)).rejects.toThrow(ConflictException);
    });

    it('no activa una regla si el tramo ya tiene otra activa', async () => {
      prisma.ascensos_reglas.findUnique.mockResolvedValue({
        id: 40n,
        activo: false,
        vigente_hasta: null,
        grado_origen_id: 3n,
      });
      prisma.ascensos_reglas.findFirst.mockResolvedValue({ nombre: 'La otra' });

      await expect(service.activar(40)).rejects.toThrow(ConflictException);
    });
  });

  // ─── Restaurar reglas FAU (SCRUM-124) ───────────────────────────────────────

  describe('restaurarDefecto', () => {
    it('cierra la vigente editada y vuelve a abrir la versión de la FAU', async () => {
      const defecto = makeRegla({ id: 40n, es_por_defecto: true });
      prisma.ascensos_reglas.findMany
        .mockResolvedValueOnce([defecto]) // versiones por defecto
        .mockResolvedValueOnce([
          { id: 55n, nombre: 'Cbo. 2.ª → Cbo. 1.ª (editada)', grado_origen_id: 3n, es_por_defecto: false },
        ]); // vigentes
      prisma.ascensos_reglas.create.mockResolvedValue({ id: 60n });
      prisma.cursos.findMany.mockResolvedValue([{ id: 12n }]);

      const res = await service.restaurarDefecto(8n);

      expect(prisma.ascensos_reglas.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 55n } }),
      );
      const clon = prisma.ascensos_reglas.create.mock.calls[0][0].data;
      expect(clon.es_por_defecto).toBe(true);
      expect(clon.dias_minimos).toBe(730);
      expect(res.restauradas).toEqual(['Cbo. 2.ª → Cbo. 1.ª']);
    });

    it('no toca los tramos que ya están en la versión de la FAU', async () => {
      const defecto = makeRegla({ id: 40n });
      prisma.ascensos_reglas.findMany
        .mockResolvedValueOnce([defecto])
        .mockResolvedValueOnce([
          { id: 40n, nombre: 'Cbo. 2.ª → Cbo. 1.ª', grado_origen_id: 3n, es_por_defecto: true },
        ]);

      const res = await service.restaurarDefecto();

      expect(prisma.ascensos_reglas.create).not.toHaveBeenCalled();
      expect(res.sin_cambios).toEqual(['Cbo. 2.ª → Cbo. 1.ª']);
      expect(res.restauradas).toEqual([]);
    });

    it('conserva las reglas cargadas a mano que nunca tuvieron versión de la FAU', async () => {
      prisma.ascensos_reglas.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 77n, nombre: 'Tramo inventado', grado_origen_id: 900n, es_por_defecto: false },
        ]);

      const res = await service.restaurarDefecto();

      expect(prisma.ascensos_reglas.update).not.toHaveBeenCalled();
      expect(res.conservadas).toEqual(['Tramo inventado']);
    });
  });

  // ─── Mapeo ──────────────────────────────────────────────────────────────────

  describe('obtener', () => {
    it('traduce los días mínimos a años y meses para la pantalla', async () => {
      prisma.ascensos_reglas.findUnique.mockResolvedValue(makeRegla({ dias_minimos: 1095 }));
      prisma.ascensos_reglas.findMany.mockResolvedValue([]);

      const res = await service.obtener(40);

      expect(res.anios).toBe(3);
      expect(res.meses).toBe(0);
      expect(res.requisitos[0].cursos[0].nombre_curso).toBe('Curso M-02');
    });

    it('devuelve 404 si no existe', async () => {
      prisma.ascensos_reglas.findUnique.mockResolvedValue(null);

      await expect(service.obtener(40)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── DTOs ───────────────────────────────────────────────────────────────────

  describe('DTOs', () => {
    it('rechaza una condición de aplicación que no existe', async () => {
      const dto = plainToInstance(ReglaRequisitoDto, {
        tipo: 'CURSO_APROBADO',
        descripcion: 'x',
        aplica_si: ['ES_ZURDO'],
      });
      const errores = await validate(dto);
      expect(errores.map((e) => e.property)).toContain('aplica_si');
    });

    it('rechaza días mínimos en cero', async () => {
      const dto = plainToInstance(CreateReglaDto, {
        nombre: 'x',
        grado_origen_id: 1,
        grado_destino_id: 2,
        dias_minimos: 0,
      });
      const errores = await validate(dto);
      expect(errores.map((e) => e.property)).toContain('dias_minimos');
    });

    it('acepta una regla de oficiales sin edad máxima', async () => {
      const dto = plainToInstance(CreateReglaDto, {
        nombre: 'Cap. → May.',
        grado_origen_id: 10,
        grado_destino_id: 11,
        dias_minimos: 1460,
      });
      expect(await validate(dto)).toHaveLength(0);
    });
  });
});
