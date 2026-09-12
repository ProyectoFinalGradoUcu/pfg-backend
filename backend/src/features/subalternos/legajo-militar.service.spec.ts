import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  LegajoMilitarService,
  guardarLegajoEnTransaccion,
} from './legajo-militar.service';
import { PrismaService } from '../../lib/prisma.service';
import { LegajoMilitarDto } from './dto/legajo-militar.dto';
import { esMutado, esNivelLiceal } from './legajo-militar.constants';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeLegajo = (overrides: Partial<any> = {}) => ({
  nivel_educativo: 'BACHILLERATO_TECNOLOGICO',
  fecha_ingreso_eta: new Date('2018-03-01'),
  fecha_egreso_eta: new Date('2020-12-15'),
  numero_orden_egreso_eta: 'O.C.G.F.A. N.º 12.345',
  actualizado_en: new Date('2026-09-01T10:00:00Z'),
  ...overrides,
});

const makeRelacion = (overrides: Partial<any> = {}) => ({
  mutaciones: null as string | null,
  ...overrides,
});

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const makePrismaMock = () => {
  const mock: any = {
    personas: { findUnique: jest.fn() },
    legajo_militar: { findUnique: jest.fn(), upsert: jest.fn() },
    relaciones_laborales: { findFirst: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  // La transacción corre el callback contra el mismo mock.
  mock.$transaction.mockImplementation((cb: any) => cb(mock));
  return mock;
};

describe('LegajoMilitarService', () => {
  let service: LegajoMilitarService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegajoMilitarService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<LegajoMilitarService>(LegajoMilitarService);
  });

  // ─── obtener ────────────────────────────────────────────────────────────────

  describe('obtener', () => {
    it('devuelve 404 si la persona no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      prisma.legajo_militar.findUnique.mockResolvedValue(null);
      prisma.relaciones_laborales.findFirst.mockResolvedValue(null);

      await expect(service.obtener(99)).rejects.toThrow(NotFoundException);
    });

    it('devuelve el legajo con la etiqueta del nivel educativo y las banderas derivadas', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 1n });
      prisma.legajo_militar.findUnique.mockResolvedValue(makeLegajo());
      prisma.relaciones_laborales.findFirst.mockResolvedValue(
        makeRelacion({ mutaciones: 'Mutado de SG a AT, O.D. 8.221' }),
      );

      const res = await service.obtener(1);

      expect(res.nivel_educativo).toBe('BACHILLERATO_TECNOLOGICO');
      expect(res.nivel_educativo_label).toBe('Bachillerato tecnológico (UTU)');
      expect(res.fecha_egreso_eta).toBe('2020-12-15');
      expect(res.egresado_eta).toBe(true);
      expect(res.es_mutado).toBe(true);
    });

    it('sin fila de legajo devuelve todo vacío y no marca egreso ni mutación', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 1n });
      prisma.legajo_militar.findUnique.mockResolvedValue(null);
      prisma.relaciones_laborales.findFirst.mockResolvedValue(makeRelacion());

      const res = await service.obtener(1);

      expect(res.nivel_educativo).toBeNull();
      expect(res.nivel_educativo_label).toBeNull();
      expect(res.egresado_eta).toBe(false);
      expect(res.es_mutado).toBe(false);
      expect(res.actualizado_en).toBeNull();
    });
  });

  // ─── guardar ────────────────────────────────────────────────────────────────

  describe('guardar', () => {
    it('devuelve 404 si la persona no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.guardar(99, { nivel_educativo: 'PRIMARIA' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.legajo_militar.upsert).not.toHaveBeenCalled();
    });

    it('hace upsert del legajo y no toca la relación laboral si no vino mutaciones', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 1n });
      prisma.legajo_militar.findUnique.mockResolvedValue(null);
      prisma.legajo_militar.upsert.mockResolvedValue(makeLegajo());
      prisma.relaciones_laborales.findFirst.mockResolvedValue(makeRelacion());

      await service.guardar(1, { nivel_educativo: 'CICLO_BASICO' });

      expect(prisma.legajo_militar.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.relaciones_laborales.updateMany).not.toHaveBeenCalled();
    });

    it('guarda la mutación en la relación vigente sin escribir el legajo', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 1n });
      prisma.legajo_militar.findUnique.mockResolvedValue(null);
      prisma.relaciones_laborales.findFirst.mockResolvedValue(
        makeRelacion({ mutaciones: 'Mutado a AT' }),
      );

      const res = await service.guardar(1, { mutaciones: 'Mutado a AT' });

      expect(prisma.legajo_militar.upsert).not.toHaveBeenCalled();
      expect(prisma.relaciones_laborales.updateMany).toHaveBeenCalledWith({
        where: { persona_id: 1n, fecha_fin: null },
        data: { mutaciones: 'Mutado a AT' },
      });
      expect(res.es_mutado).toBe(true);
    });

    it('un null explícito borra la mutación', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 1n });
      prisma.legajo_militar.findUnique.mockResolvedValue(null);
      prisma.relaciones_laborales.findFirst.mockResolvedValue(makeRelacion());

      const res = await service.guardar(1, { mutaciones: null });

      expect(prisma.relaciones_laborales.updateMany).toHaveBeenCalledWith({
        where: { persona_id: 1n, fecha_fin: null },
        data: { mutaciones: null },
      });
      expect(res.es_mutado).toBe(false);
    });
  });

  // ─── guardarLegajoEnTransaccion ─────────────────────────────────────────────

  describe('guardarLegajoEnTransaccion', () => {
    it('no escribe nada si el DTO no trae ningún campo del legajo', async () => {
      const tx: any = { legajo_militar: { upsert: jest.fn() } };

      await guardarLegajoEnTransaccion(tx, 1n, {});

      expect(tx.legajo_militar.upsert).not.toHaveBeenCalled();
    });

    it('hace upsert con las fechas convertidas a Date', async () => {
      const tx: any = { legajo_militar: { upsert: jest.fn() } };

      await guardarLegajoEnTransaccion(tx, 1n, { fecha_egreso_eta: '2020-12-15' });

      const args = tx.legajo_militar.upsert.mock.calls[0][0];
      expect(args.where).toEqual({ persona_id: 1n });
      expect(args.create.fecha_egreso_eta).toEqual(new Date('2020-12-15'));
    });
  });

  // ─── Reglas derivadas del legajo ────────────────────────────────────────────

  describe('condiciones que consultan las reglas de ascenso', () => {
    it('nivel liceal es ciclo básico completo o más', () => {
      expect(esNivelLiceal('CICLO_BASICO')).toBe(true);
      expect(esNivelLiceal('BACHILLERATO_TECNOLOGICO')).toBe(true);
      expect(esNivelLiceal('TERCIARIO')).toBe(true);
      expect(esNivelLiceal('CICLO_BASICO_INCOMPLETO')).toBe(false);
      expect(esNivelLiceal('PRIMARIA')).toBe(false);
      expect(esNivelLiceal(null)).toBe(false);
    });

    it('es mutado cualquiera con contenido en la columna mutaciones', () => {
      expect(esMutado('Mutado de SG a AT')).toBe(true);
      expect(esMutado('   ')).toBe(false);
      expect(esMutado('')).toBe(false);
      expect(esMutado(null)).toBe(false);
    });
  });

  // ─── DTO ────────────────────────────────────────────────────────────────────

  describe('LegajoMilitarDto', () => {
    it('rechaza un nivel educativo fuera del catálogo', async () => {
      const dto = plainToInstance(LegajoMilitarDto, { nivel_educativo: 'DOCTORADO' });
      const errores = await validate(dto);
      expect(errores).toHaveLength(1);
      expect(errores[0].property).toBe('nivel_educativo');
    });

    it('acepta un legajo vacío: los campos se cargan de a poco', async () => {
      const dto = plainToInstance(LegajoMilitarDto, {});
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rechaza una fecha de egreso que no es una fecha', async () => {
      const dto = plainToInstance(LegajoMilitarDto, { fecha_egreso_eta: 'ayer' });
      const errores = await validate(dto);
      expect(errores).toHaveLength(1);
      expect(errores[0].property).toBe('fecha_egreso_eta');
    });
  });
});
