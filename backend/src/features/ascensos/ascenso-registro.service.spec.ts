import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AscensoRegistroService } from './ascenso-registro.service';
import { PrismaService } from '../../lib/prisma.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeGrado = (overrides: Partial<any> = {}) => ({
  id: 4n,
  codigo: 'CBO_1RA',
  denominacion: 'Cabo de 1.ª',
  orden: 4,
  vigente: true,
  ...overrides,
});

const makeRelacion = (overrides: Partial<any> = {}) => ({
  id: 500n,
  persona_id: 100n,
  regimen_id: 1n,
  unidad_id: 2n,
  programa_id: 3n,
  situacion_id: 7n,
  escalafon_id: 14n,
  grado_id: 3n,
  fecha_inicio: new Date('2015-02-01'),
  fecha_fin: null,
  estado: 'activo',
  prima_tecnica: 'A',
  prima_solidaria_familiar: null,
  riesgo_vuelo: null,
  anios_inactivos: null,
  observaciones: null,
  sub_unidad_id: null,
  motivo_baja_id: null,
  fecha_ultimo_ascenso: new Date('2023-02-01'),
  grado_reincorporacion_id: null,
  haber_retiro: null,
  porcentaje_progresivo: null,
  fecha_ascenso_oficial: null,
  superprima: false,
  tipo_funcionario: 'subalterno',
  tiene_mando: false,
  mutaciones: null,
  conducta: null,
  anios_servicio_anterior: 0,
  categoria_viatico: 0,
  usa_fonasa: false,
  ...overrides,
});

const makeAscenso = (overrides: Partial<any> = {}) => ({
  id: 900n,
  persona_id: 100n,
  grado_id: 4n,
  grado_anterior_id: 3n,
  fecha_ascenso: new Date('2026-02-01'),
  relacion_laboral_anterior_id: 500n,
  relacion_laboral_nueva_id: 501n,
  anulado_en: null,
  ...overrides,
});

const params = (overrides: Partial<any> = {}) => ({
  persona_id: 100n,
  grado_destino_id: 4n,
  fecha_ascenso: new Date('2026-02-01'),
  ...overrides,
});

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const makePrismaMock = () => {
  const mock: any = {
    relaciones_laborales: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    grados: { findUnique: jest.fn() },
    tipos_movimiento: { findUnique: jest.fn() },
    movimientos_laborales: { createMany: jest.fn(), deleteMany: jest.fn() },
    items_liquidacion: { count: jest.fn().mockResolvedValue(0) },
    ascensos: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation((cb: any) => cb(mock));
  return mock;
};

/** Cbo. 2.ª → Cbo. 1.ª de un subalterno en actividad. */
const escenarioOk = (prisma: any, overrides: { relacion?: any; destino?: any } = {}) => {
  const relacion = overrides.relacion ?? makeRelacion();
  const destino = overrides.destino ?? makeGrado();
  prisma.relaciones_laborales.findFirst.mockResolvedValue(relacion);
  prisma.grados.findUnique.mockImplementation(({ where }: any) =>
    Promise.resolve(
      where.id === relacion.grado_id
        ? makeGrado({ id: relacion.grado_id, codigo: 'CBO_2DA', denominacion: 'Cabo de 2.ª', orden: 3 })
        : destino,
    ),
  );
  prisma.tipos_movimiento.findUnique.mockImplementation(({ where }: any) =>
    Promise.resolve({ id: where.nombre === 'Ascenso' ? 10n : 11n, nombre: where.nombre }),
  );
  prisma.relaciones_laborales.create.mockImplementation(({ data }: any) =>
    Promise.resolve({ id: 501n, ...data }),
  );
  prisma.ascensos.create.mockImplementation(({ data }: any) =>
    Promise.resolve({ id: 900n, ...data }),
  );
  return { relacion, destino };
};

describe('AscensoRegistroService', () => {
  let service: AscensoRegistroService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AscensoRegistroService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<AscensoRegistroService>(AscensoRegistroService);
  });

  // ─── Registrar ──────────────────────────────────────────────────────────────

  describe('registrar', () => {
    it('cierra la relación vigente con la fecha del ascenso y la deja inactiva', async () => {
      escenarioOk(prisma);

      await service.registrar(params());

      expect(prisma.relaciones_laborales.update).toHaveBeenCalledWith({
        where: { id: 500n },
        data: { fecha_fin: new Date('2026-02-01'), estado: 'inactivo' },
      });
    });

    it('abre la relación nueva preservando fecha_inicio y sellando fecha_ultimo_ascenso', async () => {
      escenarioOk(prisma);

      await service.registrar(params());

      const data = prisma.relaciones_laborales.create.mock.calls[0][0].data;
      expect(data.fecha_inicio).toEqual(new Date('2015-02-01'));
      expect(data.fecha_ultimo_ascenso).toEqual(new Date('2026-02-01'));
      expect(data.grado_id).toBe(4n);
      expect(data.estado).toBe('activo');
      expect(data.fecha_fin).toBeNull();
    });

    it('copia el resto de los campos de la relación anterior', async () => {
      escenarioOk(prisma, {
        relacion: makeRelacion({
          sub_unidad_id: 9n,
          superprima: true,
          mutaciones: 'Mutado de SG a AT',
          categoria_viatico: 3,
        }),
      });

      await service.registrar(params());

      const data = prisma.relaciones_laborales.create.mock.calls[0][0].data;
      expect(data.unidad_id).toBe(2n);
      expect(data.situacion_id).toBe(7n);
      expect(data.escalafon_id).toBe(14n);
      expect(data.sub_unidad_id).toBe(9n);
      expect(data.superprima).toBe(true);
      expect(data.mutaciones).toBe('Mutado de SG a AT');
      expect(data.categoria_viatico).toBe(3);
    });

    it('vacía la prima técnica solo si el destino es Sgto. 1.º', async () => {
      escenarioOk(prisma, {
        destino: makeGrado({ id: 6n, codigo: 'SGTO_1RO', denominacion: 'Sargento 1.º', orden: 6 }),
      });

      await service.registrar(params({ grado_destino_id: 6n }));

      expect(prisma.relaciones_laborales.create.mock.calls[0][0].data.prima_tecnica).toBe('VACIO');
    });

    it('conserva la prima técnica en cualquier otro destino', async () => {
      escenarioOk(prisma);

      await service.registrar(params());

      expect(prisma.relaciones_laborales.create.mock.calls[0][0].data.prima_tecnica).toBe('A');
    });

    it('sella fecha_ascenso_oficial al llegar a Alférez', async () => {
      escenarioOk(prisma, {
        destino: makeGrado({ id: 7n, codigo: 'ALF', denominacion: 'Alférez', orden: 7 }),
      });

      await service.registrar(params({ grado_destino_id: 7n }));

      expect(prisma.relaciones_laborales.create.mock.calls[0][0].data.fecha_ascenso_oficial).toEqual(
        new Date('2026-02-01'),
      );
    });

    it('no pisa fecha_ascenso_oficial si ya estaba cargada', async () => {
      escenarioOk(prisma, {
        relacion: makeRelacion({ fecha_ascenso_oficial: new Date('2010-02-01') }),
        destino: makeGrado({ id: 7n, codigo: 'ALF', denominacion: 'Alférez', orden: 7 }),
      });

      await service.registrar(params({ grado_destino_id: 7n }));

      expect(prisma.relaciones_laborales.create.mock.calls[0][0].data.fecha_ascenso_oficial).toEqual(
        new Date('2010-02-01'),
      );
    });

    it('no sella fecha_ascenso_oficial en un ascenso de subalterno', async () => {
      escenarioOk(prisma);

      await service.registrar(params());

      expect(prisma.relaciones_laborales.create.mock.calls[0][0].data.fecha_ascenso_oficial).toBeNull();
    });

    it('registra los dos movimientos: el cierre sobre la vieja y el ascenso sobre la nueva', async () => {
      escenarioOk(prisma);

      await service.registrar(params());

      const movimientos = prisma.movimientos_laborales.createMany.mock.calls[0][0].data;
      expect(movimientos).toHaveLength(2);
      expect(movimientos[0]).toMatchObject({ relacion_laboral_id: 500n, tipo_movimiento_id: 11n });
      expect(movimientos[1]).toMatchObject({ relacion_laboral_id: 501n, tipo_movimiento_id: 10n });
      expect(movimientos[0].fecha_movimiento).toEqual(new Date('2026-02-01'));
    });

    it('busca los tipos de movimiento por nombre, nunca por id', async () => {
      escenarioOk(prisma);

      await service.registrar(params());

      const nombres = prisma.tipos_movimiento.findUnique.mock.calls.map((c: any) => c[0].where.nombre);
      expect(nombres).toEqual(expect.arrayContaining(['Cambio de Situacion', 'Ascenso']));
    });

    it('deja la fila del historial con ambas relaciones y el grado anterior', async () => {
      escenarioOk(prisma);

      await service.registrar(params({ numero_orden: 'O.C.G.F.A. N.º 12.345', usuario_id: 8n }));

      const data = prisma.ascensos.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        persona_id: 100n,
        grado_id: 4n,
        grado_anterior_id: 3n,
        relacion_laboral_anterior_id: 500n,
        relacion_laboral_nueva_id: 501n,
        numero_orden: 'O.C.G.F.A. N.º 12.345',
        registrado_por: 8n,
      });
    });

    it('falla si el funcionario no tiene relación laboral vigente', async () => {
      prisma.relaciones_laborales.findFirst.mockResolvedValue(null);

      await expect(service.registrar(params())).rejects.toThrow(BadRequestException);
      expect(prisma.relaciones_laborales.create).not.toHaveBeenCalled();
    });

    it('falla si el grado destino no existe', async () => {
      prisma.relaciones_laborales.findFirst.mockResolvedValue(makeRelacion());
      prisma.grados.findUnique.mockResolvedValue(null);

      await expect(service.registrar(params())).rejects.toThrow(NotFoundException);
    });

    it('falla si el grado destino no es superior al actual', async () => {
      escenarioOk(prisma, {
        destino: makeGrado({ id: 2n, codigo: 'SDO_1RA', denominacion: 'Soldado de 1.ª', orden: 1 }),
      });

      await expect(service.registrar(params({ grado_destino_id: 2n }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('falla si la fecha del ascenso es anterior al inicio de la relación', async () => {
      escenarioOk(prisma);

      await expect(
        service.registrar(params({ fecha_ascenso: new Date('2010-01-01') })),
      ).rejects.toThrow(BadRequestException);
    });

    it('falla si falta el tipo de movimiento en el catálogo', async () => {
      escenarioOk(prisma);
      prisma.tipos_movimiento.findUnique.mockResolvedValue(null);

      await expect(service.registrar(params())).rejects.toThrow(BadRequestException);
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
    });

    it('exige motivo cuando el ascenso es por excepción', async () => {
      escenarioOk(prisma);

      await expect(
        service.registrar(params({ cumplia_requisitos: false })),
      ).rejects.toThrow(BadRequestException);
    });

    it('acepta la excepción cuando viene con motivo', async () => {
      escenarioOk(prisma);

      await service.registrar(
        params({ cumplia_requisitos: false, motivo_excepcion: 'Vacante urgente en la unidad' }),
      );

      const data = prisma.ascensos.create.mock.calls[0][0].data;
      expect(data.cumplia_requisitos).toBe(false);
      expect(data.motivo_excepcion).toBe('Vacante urgente en la unidad');
    });
  });

  // ─── Anular ─────────────────────────────────────────────────────────────────

  describe('anular', () => {
    const prepararAnulacion = (p: any, ascenso = makeAscenso()) => {
      p.ascensos.findUnique.mockResolvedValue(ascenso);
      p.relaciones_laborales.findUnique.mockResolvedValue({
        id: 501n,
        persona_id: 100n,
        fecha_fin: null,
      });
      p.ascensos.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...ascenso, ...data }),
      );
    };

    it('borra los movimientos, elimina la relación nueva y reactiva la anterior', async () => {
      prepararAnulacion(prisma);

      await service.anular(900n, { motivo: 'Orden dejada sin efecto', usuario_id: 8n });

      expect(prisma.movimientos_laborales.deleteMany).toHaveBeenCalled();
      // Sin soltar la foreign key, Postgres no deja borrar la relación.
      expect(prisma.ascensos.updateMany).toHaveBeenCalledWith({
        where: { relacion_laboral_nueva_id: 501n },
        data: { relacion_laboral_nueva_id: null },
      });
      expect(prisma.relaciones_laborales.delete).toHaveBeenCalledWith({ where: { id: 501n } });
      expect(prisma.relaciones_laborales.update).toHaveBeenCalledWith({
        where: { id: 500n },
        data: { fecha_fin: null, estado: 'activo' },
      });
      expect(prisma.ascensos.update.mock.calls[0][0].data).toMatchObject({
        anulado_por: 8n,
        motivo_anulacion: 'Orden dejada sin efecto',
      });
    });

    it('exige motivo', async () => {
      prepararAnulacion(prisma);

      await expect(service.anular(900n, { motivo: '  ' })).rejects.toThrow(BadRequestException);
    });

    it('falla si el ascenso no existe', async () => {
      prisma.ascensos.findUnique.mockResolvedValue(null);

      await expect(service.anular(900n, { motivo: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('no anula dos veces', async () => {
      prepararAnulacion(prisma, makeAscenso({ anulado_en: new Date('2026-03-01') }));

      await expect(service.anular(900n, { motivo: 'x' })).rejects.toThrow(ConflictException);
    });

    it('no revierte un ascenso histórico sin relaciones asociadas', async () => {
      prisma.ascensos.findUnique.mockResolvedValue(
        makeAscenso({ relacion_laboral_nueva_id: null, relacion_laboral_anterior_id: null }),
      );

      await expect(service.anular(900n, { motivo: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('no revierte si la relación que abrió el ascenso ya fue cerrada', async () => {
      prisma.ascensos.findUnique.mockResolvedValue(makeAscenso());
      prisma.relaciones_laborales.findUnique.mockResolvedValue({
        id: 501n,
        persona_id: 100n,
        fecha_fin: new Date('2026-06-01'),
      });

      await expect(service.anular(900n, { motivo: 'x' })).rejects.toThrow(ConflictException);
      expect(prisma.relaciones_laborales.delete).not.toHaveBeenCalled();
    });

    it('no revierte si el ascenso ya fue liquidado', async () => {
      prepararAnulacion(prisma);
      prisma.items_liquidacion.count.mockResolvedValue(4);

      await expect(service.anular(900n, { motivo: 'x' })).rejects.toThrow(ConflictException);
      expect(prisma.relaciones_laborales.delete).not.toHaveBeenCalled();
    });
  });
});
