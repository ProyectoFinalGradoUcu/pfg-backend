import { ForbiddenException } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { REPORTES } from './definiciones';
import { primaTecnicaReporte } from './definiciones/prima-tecnica.reporte';
import { porcentajeMujeresReporte } from './definiciones/porcentaje-mujeres.reporte';
import { pasiblesAscensoReporte } from './definiciones/pasibles-ascenso.reporte';
import { ElegibilidadService } from '../ascensos/elegibilidad.service';
import {
  FILTRO_ALCANCE_BASES,
  REPORTES_CON_ALCANCE_UNIDAD,
  whereRelacionPorAlcance,
} from './alcance-reportes';

const UNIDAD: any = { tipo: 'unidad', subUnidadIds: ['30', '31'], comandoIds: ['4'] };
const GLOBAL: any = { tipo: 'global' };
const SIN_PASIBLES: any = { items: [], total: 0, fecha_referencia: '2026-11-06', stats: {} };

const makePrismaMock = () => ({
  relaciones_laborales: { findMany: jest.fn().mockResolvedValue([]) },
  destinos: { findMany: jest.fn().mockResolvedValue([]) },
  movimientos_laborales: { findMany: jest.fn().mockResolvedValue([]) },
});

describe('Reportes · alcance por bases', () => {
  let service: ReportesService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new ReportesService(prisma as any);
  });

  afterEach(() => jest.restoreAllMocks());

  const filtrosQueLlegan = () => {
    const spy = jest.spyOn(primaTecnicaReporte, 'ejecutar').mockResolvedValue({ columnas: [], filas: [] });
    return () => spy.mock.calls[0][0].filtros;
  };

  describe('ReportesService.ejecutar', () => {
    it('con alcance de unidad agrega las bases y respeta la base que eligió el usuario', async () => {
      const filtros = filtrosQueLlegan();

      await service.ejecutar('prima-tecnica', { sub_unidad_id: '9', prima: 'A' }, UNIDAD);

      expect(filtros()).toEqual({ sub_unidad_id: '9', prima: 'A', [FILTRO_ALCANCE_BASES]: '30,31' });
    });

    it('descarta las bases que mande el cliente y pone las del usuario', async () => {
      const filtros = filtrosQueLlegan();

      await service.ejecutar('prima-tecnica', { [FILTRO_ALCANCE_BASES]: '99' }, UNIDAD);

      expect(filtros()[FILTRO_ALCANCE_BASES]).toBe('30,31');
    });

    it('con alcance global también descarta el filtro de bases del cliente', async () => {
      const filtros = filtrosQueLlegan();

      await service.ejecutar('prima-tecnica', { [FILTRO_ALCANCE_BASES]: '99', unidad_id: '9' }, GLOBAL);

      expect(filtros()).toEqual({ unidad_id: '9' });
    });

    it('sin alcance no agrega nada', async () => {
      const filtros = filtrosQueLlegan();

      await service.ejecutar('prima-tecnica', { prima: 'B' });

      expect(filtros()).toEqual({ prima: 'B' });
    });

    it('un reporte que no se sabe acotar responde 403 con alcance de unidad', async () => {
      const ajeno = REPORTES[0];
      REPORTES_CON_ALCANCE_UNIDAD.delete(ajeno.clave);
      const ejecutar = jest.spyOn(ajeno, 'ejecutar');
      try {
      await expect(service.ejecutar(ajeno.clave, {}, UNIDAD)).rejects.toThrow(ForbiddenException);
      await expect(service.exportarXlsx(ajeno.clave, {}, UNIDAD)).rejects.toThrow(ForbiddenException);
      expect(ejecutar).not.toHaveBeenCalled();
      } finally { REPORTES_CON_ALCANCE_UNIDAD.add(ajeno.clave); }
    });

    it('prima técnica: la base elegida dentro del alcance filtra por esa base', async () => {
      await service.ejecutar('prima-tecnica', { sub_unidad_id: '31' }, UNIDAD);

      expect(prisma.relaciones_laborales.findMany.mock.calls[0][0].where).toMatchObject({
        estado: 'activo',
        sub_unidad_id: 31n,
      });
    });

    it('prima técnica: una base ajena al alcance no trae a nadie', async () => {
      await service.ejecutar('prima-tecnica', { sub_unidad_id: '4' }, UNIDAD);

      expect(prisma.relaciones_laborales.findMany.mock.calls[0][0].where).toMatchObject({
        sub_unidad_id: { in: [] },
      });
    });

    it('movimientos por unidad filtra por la base de la relación, no por el comando', async () => {
      await service.ejecutar('movimientos-unidad', { sub_unidad_id: '7' }, GLOBAL);

      const where = prisma.movimientos_laborales.findMany.mock.calls[0][0].where;
      expect(where.relaciones_laborales).toEqual({ sub_unidad_id: 7n });
    });
  });

  describe('ReportesService.previewCustom', () => {
    it('la fuente personal se acota a las bases del usuario', async () => {
      await service.previewCustom({ fuente: 'personal', filtros: { [FILTRO_ALCANCE_BASES]: '99' } } as any, UNIDAD);

      expect(prisma.relaciones_laborales.findMany.mock.calls[0][0].where).toMatchObject({
        sub_unidad_id: { in: [30n, 31n] },
      });
    });

    it('con alcance global la fuente personal no filtra por base aunque el cliente lo pida', async () => {
      await service.previewCustom({ fuente: 'personal', filtros: { [FILTRO_ALCANCE_BASES]: '99' } } as any, GLOBAL);

      expect(prisma.relaciones_laborales.findMany.mock.calls[0][0].where).not.toHaveProperty('sub_unidad_id');
    });

    it('la fuente destinos aplica alcance por la base actual de la persona', async () => {
      await service.previewCustom({ fuente: 'destinos' } as any, UNIDAD);
      expect(prisma.destinos.findMany.mock.calls[0][0].where.personas).toEqual({ relaciones_laborales: { some: { fecha_fin: null, sub_unidad_id: { in: [30n, 31n] } } } });
    });
  });

  describe('definiciones', () => {
    it('whereRelacionPorAlcance arma el `in` de bases o nada', () => {
      expect(whereRelacionPorAlcance({ [FILTRO_ALCANCE_BASES]: '30,31' })).toEqual({
        sub_unidad_id: { in: [30n, 31n] },
      });
      expect(whereRelacionPorAlcance({ unidad_id: '4' })).toEqual({});
    });

    it('porcentaje de mujeres filtra la relación por las bases', async () => {
      await porcentajeMujeresReporte.ejecutar({
        prisma: prisma as any,
        filtros: { [FILTRO_ALCANCE_BASES]: '30' },
      });

      expect(prisma.relaciones_laborales.findMany.mock.calls[0][0].where).toMatchObject({
        sub_unidad_id: { in: [30n] },
      });
    });

    it('pasibles de ascenso le pasa el alcance de bases al motor de elegibilidad', async () => {
      const listar = jest
        .spyOn(ElegibilidadService.prototype, 'listarPasibles')
        .mockResolvedValue(SIN_PASIBLES);

      await pasiblesAscensoReporte.ejecutar({
        prisma: prisma as any,
        filtros: { [FILTRO_ALCANCE_BASES]: '30,31', sub_unidad_id: '31' },
      });

      expect(listar.mock.calls[0][0]).toMatchObject({ sub_unidad_id: 31 });
      expect(listar.mock.calls[0][1]).toEqual({ tipo: 'unidad', subUnidadIds: ['30', '31'], comandoIds: [] });
    });

    it('pasibles de ascenso sin filtro de bases no pasa alcance', async () => {
      const listar = jest
        .spyOn(ElegibilidadService.prototype, 'listarPasibles')
        .mockResolvedValue(SIN_PASIBLES);

      await pasiblesAscensoReporte.ejecutar({ prisma: prisma as any, filtros: {} });

      expect(listar.mock.calls[0][1]).toBeUndefined();
    });
  });
});
