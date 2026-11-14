import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { CambioSituacionService } from './cambio-situacion.service';
import { PrismaService } from '../../lib/prisma.service';
import { DerechaService } from '../derecha/derecha.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const SITUACIONES: Record<string, { id: bigint; codigo: string; denominacion: string }> = {
  SIT01: { id: 1n, codigo: 'SIT01', denominacion: 'Personal Superior en actividad.' },
  SIT03: { id: 3n, codigo: 'SIT03', denominacion: 'Licencia sin goce de sueldo.' },
  SIT04: { id: 4n, codigo: 'SIT04', denominacion: 'Personal Superior no disponible.' },
  SIT07: { id: 7n, codigo: 'SIT07', denominacion: 'Personal Subalterno en actividad.' },
  SIT09: { id: 9n, codigo: 'SIT09', denominacion: 'Personal Subalterno con licencia s/goce de sueldo.' },
  SIT12: { id: 12n, codigo: 'SIT12', denominacion: 'Aspirantes y cadetes.' },
  SIT16: { id: 16n, codigo: 'SIT16', denominacion: 'Personal Superior reincorporado.' },
  SIT17: { id: 17n, codigo: 'SIT17', denominacion: 'Personal Subalterno reincorporado.' },
};

const makeRelacion = (overrides: Partial<any> = {}) => {
  const codigo = overrides.codigo ?? 'SIT07';
  const { codigo: _c, ...resto } = overrides;
  return {
    id: 500n,
    persona_id: 100n,
    regimen_id: 1n,
    unidad_id: 2n,
    sub_unidad_id: 8n,
    programa_id: 3n,
    situacion_id: SITUACIONES[codigo].id,
    escalafon_id: 14n,
    grado_id: 3n,
    fecha_inicio: new Date('2015-02-01'),
    fecha_fin: null,
    estado: 'activo',
    prima_tecnica: 'A',
    prima_solidaria_familiar: null,
    riesgo_vuelo: null,
    anios_inactivos: null,
    observaciones: 'Importado',
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
    codigos_legajo: 'AB',
    derecha: 12,
    numor: 3,
    escala_derecha: 'SUBALTERNOS',
    situaciones: SITUACIONES[codigo],
    grados: { es_oficial: false, es_subalterno: true },
    ...resto,
  };
};

const dto = (overrides: Partial<any> = {}) => ({
  cambio: 'LICENCIA_SIN_GOCE' as const,
  fecha: '2026-11-01',
  numero_orden: 'O.C.G.F.A. 13001',
  ...overrides,
});

const anterior = (codigo: string, overrides: Partial<any> = {}) => ({
  motivo_baja_id: null,
  situaciones: { codigo },
  ...overrides,
});

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const makePrismaMock = () => {
  const mock: any = {
    relaciones_laborales: {
      // Primera llamada: las activas. Segunda: las anteriores (solo al volver a actividad).
      findMany: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 501n }),
      update: jest.fn().mockResolvedValue({}),
    },
    situaciones: {
      findFirst: jest.fn(({ where }: any) => Promise.resolve(SITUACIONES[where.codigo] ?? null)),
    },
    tipos_movimiento: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve({ 'Cambio de Situacion': { id: 11n }, 'Licencia Sin Goce': { id: 12n }, Reintegro: { id: 6n } }[
          where.nombre as string
        ] ?? null),
      ),
    },
    movimientos_laborales: {
      findFirst: jest.fn().mockResolvedValue(null),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(0),
  };
  mock.$transaction.mockImplementation((cb: any) => cb(mock));
  return mock;
};

describe('CambioSituacionService', () => {
  let service: CambioSituacionService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let derecha: { trasladarARelacionEnTransaccion: jest.Mock };

  beforeEach(async () => {
    prisma = makePrismaMock();
    derecha = { trasladarARelacionEnTransaccion: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CambioSituacionService,
        { provide: PrismaService, useValue: prisma },
        { provide: DerechaService, useValue: derecha },
      ],
    }).compile();
    service = module.get(CambioSituacionService);
  });

  const conActiva = (relacion: any, anteriores: any[] = []) => {
    prisma.relaciones_laborales.findMany.mockResolvedValueOnce([relacion]).mockResolvedValueOnce(anteriores);
  };

  describe('licencia sin goce', () => {
    it('subalterno: cierra la relación y abre otra en SIT09 con todo lo demás igual', async () => {
      const actual = makeRelacion();
      conActiva(actual);

      const res = await service.cambiar(100, dto(), 7n);

      expect(prisma.relaciones_laborales.update).toHaveBeenCalledWith({
        where: { id: 500n },
        data: expect.objectContaining({ fecha_fin: new Date('2026-11-01'), estado: 'inactivo' }),
      });
      const data = prisma.relaciones_laborales.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        situacion_id: 9n,
        estado: 'activo',
        fecha_fin: null,
        // La fecha de ingreso no cambia: liquidación calcula la antigüedad con ella.
        fecha_inicio: new Date('2015-02-01'),
        grado_id: 3n,
        unidad_id: 2n,
        sub_unidad_id: 8n,
        prima_tecnica: 'A',
        codigos_legajo: 'AB',
        fecha_ultimo_ascenso: new Date('2023-02-01'),
      });
      // La derecha no se copia a mano: la pasa DerechaService.
      expect(data).not.toHaveProperty('derecha');
      expect(derecha.trasladarARelacionEnTransaccion).toHaveBeenCalledWith(prisma, 500n, 501n);
      expect(res.situacion.codigo).toBe('SIT09');
    });

    it('oficial: SIT03', async () => {
      conActiva(makeRelacion({ codigo: 'SIT01', tipo_funcionario: 'oficial' }));
      const res = await service.cambiar(100, dto(), 7n);
      expect(res.situacion.codigo).toBe('SIT03');
    });

    it('la categoría sale del grado si la relación no tiene tipo de funcionario', async () => {
      conActiva(makeRelacion({ codigo: 'SIT01', tipo_funcionario: null, grados: { es_oficial: true, es_subalterno: false } }));
      const res = await service.cambiar(100, dto(), 7n);
      expect(res.situacion.codigo).toBe('SIT03');
    });

    it('registra el cierre en la relación vieja y la licencia en la nueva, con la orden', async () => {
      conActiva(makeRelacion());
      await service.cambiar(100, dto({ boletin: 'B.M.D.N. 9', observaciones: 'Estudios' }), 7n);
      expect(prisma.movimientos_laborales.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ relacion_laboral_id: 500n, tipo_movimiento_id: 11n, usuario_id: 7n,
            observaciones: 'Orden O.C.G.F.A. 13001 · Boletín B.M.D.N. 9 · Estudios' }),
          expect.objectContaining({ relacion_laboral_id: 501n, tipo_movimiento_id: 12n }),
        ],
      });
    });

    it('un reincorporado también puede pedir licencia', async () => {
      conActiva(makeRelacion({ codigo: 'SIT17' }));
      const res = await service.cambiar(100, dto(), 7n);
      expect(res.situacion.codigo).toBe('SIT09');
    });

    it('quien ya está de licencia no puede volver a pedirla', async () => {
      conActiva(makeRelacion({ codigo: 'SIT09' }));
      await expect(service.cambiar(100, dto(), 7n)).rejects.toThrow(/primero tiene que volver a actividad/);
      expect(prisma.relaciones_laborales.create).not.toHaveBeenCalled();
    });

    it('un cadete no puede: no está en actividad', async () => {
      conActiva(makeRelacion({ codigo: 'SIT12' }));
      await expect(service.cambiar(100, dto(), 7n)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('No Disponible', () => {
    it('oficial: SIT04 y movimiento de cambio de situación', async () => {
      conActiva(makeRelacion({ codigo: 'SIT01', tipo_funcionario: 'oficial' }));
      const res = await service.cambiar(100, dto({ cambio: 'NO_DISPONIBLE' }), 7n);
      expect(res.situacion.codigo).toBe('SIT04');
      const movs = prisma.movimientos_laborales.createMany.mock.calls[0][0].data;
      expect(movs[1].tipo_movimiento_id).toBe(11n);
    });

    it('subalterno: liquidación no tiene la situación', async () => {
      conActiva(makeRelacion());
      await expect(service.cambiar(100, dto({ cambio: 'NO_DISPONIBLE' }), 7n)).rejects.toThrow(
        /no tiene la situación No Disponible para personal subalterno/,
      );
    });
  });

  describe('volver a actividad', () => {
    it('vuelve a la situación que tenía antes, con movimiento Reintegro', async () => {
      conActiva(makeRelacion({ codigo: 'SIT09' }), [anterior('SIT17')]);
      const res = await service.cambiar(100, dto({ cambio: 'VOLVER_A_ACTIVIDAD' }), 7n);
      expect(res.situacion.codigo).toBe('SIT17');
      const movs = prisma.movimientos_laborales.createMany.mock.calls[0][0].data;
      expect(movs[1].tipo_movimiento_id).toBe(6n);
    });

    it('saltea las relaciones que también estaban fuera de actividad (por ejemplo, un ascenso durante la licencia)', async () => {
      conActiva(makeRelacion({ codigo: 'SIT03', tipo_funcionario: 'oficial' }), [anterior('SIT03'), anterior('SIT16')]);
      const res = await service.cambiar(100, dto({ cambio: 'VOLVER_A_ACTIVIDAD' }), 7n);
      expect(res.situacion.codigo).toBe('SIT16');
    });

    it('sin relación anterior (importado con licencia), la de actividad de su escala', async () => {
      conActiva(makeRelacion({ codigo: 'SIT04', tipo_funcionario: 'oficial' }), []);
      const res = await service.cambiar(100, dto({ cambio: 'VOLVER_A_ACTIVIDAD' }), 7n);
      expect(res.situacion.codigo).toBe('SIT01');
    });

    it('no cruza un retiro: la relación anterior a una baja es de otra carrera', async () => {
      conActiva(makeRelacion({ codigo: 'SIT09' }), [anterior('SIT17', { motivo_baja_id: 4n })]);
      const res = await service.cambiar(100, dto({ cambio: 'VOLVER_A_ACTIVIDAD' }), 7n);
      expect(res.situacion.codigo).toBe('SIT07');
    });

    it('quien está en actividad no tiene de dónde volver', async () => {
      conActiva(makeRelacion());
      await expect(service.cambiar(100, dto({ cambio: 'VOLVER_A_ACTIVIDAD' }), 7n)).rejects.toThrow(/no hay de dónde volver/);
    });
  });

  describe('validaciones', () => {
    it('rechaza una fecha futura: liquidación no mira fechas, lo aplicaría ya', async () => {
      await expect(service.cambiar(100, dto({ fecha: '2999-01-01' }), 7n)).rejects.toThrow(/no puede ser futura/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rechaza una fecha anterior al último movimiento', async () => {
      conActiva(makeRelacion());
      prisma.movimientos_laborales.findFirst.mockResolvedValue({ fecha_movimiento: new Date('2026-11-05') });
      await expect(service.cambiar(100, dto(), 7n)).rejects.toThrow(/anterior al último movimiento/);
    });

    it('sin relación activa', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValueOnce([]);
      await expect(service.cambiar(100, dto(), 7n)).rejects.toThrow(/no tiene una relación laboral activa/);
    });

    it('con dos relaciones activas no toca nada: liquidación le pagaría dos veces', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValueOnce([makeRelacion(), makeRelacion({ id: 499n })]);
      await expect(service.cambiar(100, dto(), 7n)).rejects.toThrow(ConflictException);
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
    });

    it('si falta el tipo de movimiento en el catálogo, no cierra la relación', async () => {
      conActiva(makeRelacion());
      prisma.tipos_movimiento.findUnique.mockResolvedValue(null);
      await expect(service.cambiar(100, dto(), 7n)).rejects.toThrow(BadRequestException);
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
    });

    it('toma el mismo lock por persona que el ascenso', async () => {
      conActiva(makeRelacion());
      await service.cambiar(100, dto(), 7n);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });
});
