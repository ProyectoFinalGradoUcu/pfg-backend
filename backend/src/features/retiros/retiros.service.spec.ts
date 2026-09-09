import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { RetirosService } from './retiros.service';
import { PrismaService } from '../../lib/prisma.service';
import { CierreCarreraService } from './cierre-carrera.service';

import {
  makeMotivoBaja,
  makePersonaMin,
  makePrismaMock,
  makeRelacion,
  makeRetiro,
} from './retiros.factories';

describe('RetirosService', () => {
  let service: RetirosService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let cierre: { cerrar: jest.Mock };

  beforeAll(async () => {
    prisma = makePrismaMock();
    cierre = { cerrar: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetirosService,
        { provide: PrismaService, useValue: prisma },
        { provide: CierreCarreraService, useValue: cierre },
      ],
    }).compile();

    service = module.get<RetirosService>(RetirosService);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    );
  });

  // ─── listar ─────────────────────────────────────────────────────────────────

  describe('listar', () => {
    it('por defecto filtra los anulados y los ya reincorporados', async () => {
      prisma.retiros.findMany.mockResolvedValue([makeRetiro()]);
      prisma.retiros.count.mockResolvedValue(1);

      const result = await service.listar({});

      expect(prisma.retiros.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            anulado: false,
            personas: { relaciones_laborales: { none: { estado: 'activo' } } },
          }),
        }),
      );
      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        id: '88',
        fecha_retiro: '2026-08-28',
        motivo_baja: { codigo: 'RETIRO_OBL' },
        vigente: true,
      });
    });

    it('con vigentes=false devuelve todos los eventos de retiro', async () => {
      prisma.retiros.findMany.mockResolvedValue([]);
      prisma.retiros.count.mockResolvedValue(0);

      await service.listar({ vigentes: false });

      const where = prisma.retiros.findMany.mock.calls[0][0].where;
      expect(where.relaciones_laborales).toBeUndefined();
    });

    it('con incluir_anulados=true no filtra por anulado', async () => {
      prisma.retiros.findMany.mockResolvedValue([]);
      prisma.retiros.count.mockResolvedValue(0);

      await service.listar({ incluir_anulados: true });

      const where = prisma.retiros.findMany.mock.calls[0][0].where;
      expect(where.anulado).toBeUndefined();
    });

    it('filtra por rango de fechas y por unidad', async () => {
      prisma.retiros.findMany.mockResolvedValue([]);
      prisma.retiros.count.mockResolvedValue(0);

      await service.listar({ desde: '2026-01-01', hasta: '2026-12-31', unidad_id: 5 });

      const where = prisma.retiros.findMany.mock.calls[0][0].where;
      expect(where.fecha_retiro).toEqual({
        gte: new Date('2026-01-01'),
        lte: new Date('2026-12-31'),
      });
      expect(where.relaciones_laborales).toMatchObject({ unidad_id: 5n });
    });

    it('busca por cédula, nombre o apellido', async () => {
      prisma.retiros.findMany.mockResolvedValue([]);
      prisma.retiros.count.mockResolvedValue(0);

      await service.listar({ query: 'Pérez' });

      const where = prisma.retiros.findMany.mock.calls[0][0].where;
      expect(where.personas.OR).toHaveLength(3);
    });

    it('pagina con los valores por defecto', async () => {
      prisma.retiros.findMany.mockResolvedValue([]);
      prisma.retiros.count.mockResolvedValue(0);

      const result = await service.listar({});

      expect(prisma.retiros.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
      expect(result).toMatchObject({ page: 1, pageSize: 10 });
    });

    it('marca como no vigente el retiro de alguien que volvió al servicio', async () => {
      // La relación que el retiro cerró queda inactiva para siempre; lo que
      // define que el retiro ya no está en pie es que la persona tenga una
      // relación activa nueva.
      prisma.retiros.findMany.mockResolvedValue([
        makeRetiro({
          personas: makePersonaMin({ relaciones_laborales: [{ id: 46n }] }),
        }),
      ]);
      prisma.retiros.count.mockResolvedValue(1);

      const result = await service.listar({ vigentes: false });

      expect(result.items[0].vigente).toBe(false);
    });

    it('el filtro vigentes excluye a los reincorporados', async () => {
      prisma.retiros.findMany.mockResolvedValue([]);
      prisma.retiros.count.mockResolvedValue(0);

      await service.listar({ vigentes: true });

      const where = prisma.retiros.findMany.mock.calls[0][0].where;
      expect(where.personas).toMatchObject({
        relaciones_laborales: { none: { estado: 'activo' } },
      });
    });
  });
  // ─── previa ─────────────────────────────────────────────────────────────────

  describe('previa', () => {
    const prepararActivo = () => {
      prisma.personas.findUnique.mockResolvedValue(makePersonaMin());
      prisma.relaciones_laborales.findFirst.mockResolvedValue(makeRelacion());
      prisma.retiros.findFirst.mockResolvedValue(null);
      prisma.movimientos_laborales.findFirst.mockResolvedValue(null);
      prisma.destinos.findFirst.mockResolvedValue({
        id: 88n,
        unidad_id: 5n,
        fecha_inicio: new Date('2020-01-01'),
        fecha_fin: null,
        unidades: { id: 5n, codigo: 'CG', denominacion: 'Cuartel General' },
      });
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        { id: 301n, fecha_inicio: null, fecha_fin: null, cursos: { id: 9n, nombre_curso: 'Curso A' } },
      ]);
      prisma.usuarios.findFirst.mockResolvedValue({ id: 7n, username: 'jperez', estado: 'activo' });
      prisma.ocupaciones_vivienda.findFirst.mockResolvedValue(null);
    };

    it('devuelve los colaterales con cerrar_sugerido en true y sin bloqueos', async () => {
      prepararActivo();

      const result = await service.previa(100, '2026-08-28');

      expect(result.bloqueos).toEqual([]);
      expect(result.destino_vigente).toMatchObject({ id: '88', cerrar_sugerido: true });
      expect(result.inscripciones_activas).toHaveLength(1);
      expect(result.inscripciones_activas[0]).toMatchObject({ id: '301', cerrar_sugerido: true });
      expect(result.usuario).toMatchObject({ id: '7', cerrar_sugerido: true });
    });

    it('no escribe nada', async () => {
      prepararActivo();

      await service.previa(100, '2026-08-28');

      expect(prisma.retiros.create).not.toHaveBeenCalled();
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
      expect(prisma.movimientos_laborales.create).not.toHaveBeenCalled();
    });

    it('bloquea si el funcionario es civil', async () => {
      prepararActivo();
      prisma.personas.findUnique.mockResolvedValue(makePersonaMin({ es_civil: true }));

      const result = await service.previa(100, '2026-08-28');

      expect(result.bloqueos).toContainEqual(expect.stringMatching(/civil/i));
    });

    it('bloquea si no hay relacion laboral activa', async () => {
      prepararActivo();
      prisma.relaciones_laborales.findFirst.mockResolvedValue(null);

      const result = await service.previa(100, '2026-08-28');

      expect(result.bloqueos).toContainEqual(expect.stringMatching(/relación laboral activa/i));
      expect(result.relacion_laboral).toBeNull();
    });

    it('bloquea si la fecha es futura', async () => {
      prepararActivo();
      const manana = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      const result = await service.previa(100, manana);

      expect(result.bloqueos).toContainEqual(expect.stringMatching(/futura/i));
    });

    it('bloquea si la fecha es anterior al inicio de la relacion', async () => {
      prepararActivo();

      const result = await service.previa(100, '2009-01-01');

      expect(result.bloqueos).toContainEqual(expect.stringMatching(/anterior al inicio/i));
    });

    it('un reincorporado se puede volver a retirar', async () => {
      // Tiene relación activa nueva y un retiro anterior: es retirable.
      prepararActivo();
      prisma.retiros.findFirst.mockResolvedValue(makeRetiro());

      const result = await service.previa(100, '2026-08-28');

      expect(result.bloqueos).toEqual([]);
    });

    it('bloquea con "ya está retirado" si no tiene relacion activa pero tiene retiro', async () => {
      prepararActivo();
      prisma.relaciones_laborales.findFirst.mockResolvedValue(null);
      prisma.retiros.findFirst.mockResolvedValue(makeRetiro());

      const result = await service.previa(100, '2026-08-28');

      expect(result.bloqueos).toContainEqual(expect.stringMatching(/ya está retirado/i));
    });

    it('distingue al que nunca tuvo relacion laboral', async () => {
      prepararActivo();
      prisma.relaciones_laborales.findFirst.mockResolvedValue(null);
      prisma.retiros.findFirst.mockResolvedValue(null);

      const result = await service.previa(100, '2026-08-28');

      expect(result.bloqueos).toContainEqual(
        expect.stringMatching(/no tiene relación laboral activa/i),
      );
    });

    it('bloquea si la fecha es anterior al ultimo movimiento', async () => {
      prepararActivo();
      prisma.movimientos_laborales.findFirst.mockResolvedValue({
        fecha_movimiento: new Date('2026-09-01'),
      });

      const result = await service.previa(100, '2026-08-28');

      expect(result.bloqueos).toContainEqual(expect.stringMatching(/último movimiento/i));
    });

    it('la fecha decide que destino esta vigente', async () => {
      prepararActivo();

      await service.previa(100, '2026-08-28');

      expect(prisma.destinos.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            persona_id: 100n,
            OR: [{ fecha_fin: null }, { fecha_fin: { gte: new Date('2026-08-28') } }],
          }),
        }),
      );
    });

    it('la vivienda va informativa, no cerrable', async () => {
      prepararActivo();
      prisma.ocupaciones_vivienda.findFirst.mockResolvedValue({
        vivienda_id: 3n,
        fecha_inicio: new Date('2021-01-01'),
      });

      const result = await service.previa(100, '2026-08-28');

      expect(result.vivienda).toEqual({ vivienda_id: '3', informativo: true });
    });

    it('404 si la persona no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.previa(999, '2026-08-28')).rejects.toThrow(NotFoundException);
    });
  });
  // ─── registrar ──────────────────────────────────────────────────────────────

  describe('registrar', () => {
    const dtoBase = () => ({
      persona_id: 100,
      fecha_retiro: '2026-08-28',
      motivo_baja_id: 1,
    });

    beforeEach(() => {
      cierre.cerrar.mockResolvedValue({
        retiroId: 88n,
        cerrado: { destino: '88', inscripciones: ['301'], usuario: '7' },
      });
      prisma.retiros.findUnique.mockResolvedValue(makeRetiro());
    });

    it('sin `cerrar` explicito fuerza la cascada completa', async () => {
      await service.registrar(dtoBase(), 7n);

      expect(cierre.cerrar).toHaveBeenCalledWith(
        expect.objectContaining({
          personaId: 100,
          fechaRetiro: new Date('2026-08-28'),
          motivoBajaId: 1,
          autorId: 7n,
          forzarCascada: true,
        }),
      );
    });

    it('con `cerrar` explicito respeta lo elegido y no fuerza', async () => {
      await service.registrar(
        { ...dtoBase(), cerrar: { destino: false, inscripciones: [301], usuario: true } },
        7n,
      );

      expect(cierre.cerrar).toHaveBeenCalledWith(
        expect.objectContaining({
          cierres: { destino: false, inscripciones: [301], usuario: true },
          forzarCascada: false,
        }),
      );
    });

    it('un `cerrar` parcial completa los faltantes con el sugerido', async () => {
      await service.registrar({ ...dtoBase(), cerrar: { inscripciones: [301] } }, 7n);

      expect(cierre.cerrar).toHaveBeenCalledWith(
        expect.objectContaining({
          cierres: { destino: true, inscripciones: [301], usuario: true },
        }),
      );
    });

    it('devuelve el retiro con el bloque de lo que cerro', async () => {
      const result = await service.registrar(dtoBase(), 7n);

      expect(result).toMatchObject({
        id: '88',
        cerrado: { destino: '88', inscripciones: ['301'], usuario: '7' },
      });
    });
  });
  // ─── obtener ────────────────────────────────────────────────────────────────

  describe('obtener', () => {
    beforeEach(() => {
      prisma.relaciones_laborales.findFirst.mockResolvedValue(null);
    });

    it('trae el contexto completo del retiro', async () => {
      prisma.retiros.findUnique.mockResolvedValue(
        makeRetiro({
          cierres_aplicados: { destino_id: '88', inscripciones_ids: ['301'], usuario_id: '7' },
          movimientos_laborales: {
            id: 410n,
            fecha_movimiento: new Date('2026-08-28'),
            tipos_movimiento: { nombre: 'Retiro' },
          },
          usuarios_registro: { id: 7n, username: 'admin' },
          usuarios_anulacion: null,
        }),
      );

      const result = await service.obtener(88);

      expect(result).toMatchObject({
        id: '88',
        motivo_baja: { codigo: 'RETIRO_OBL' },
        movimiento: { id: '410', tipo: 'Retiro' },
        registrado_por: { id: '7', username: 'admin' },
        anulacion: null,
        reincorporacion: null,
      });
      expect(result.relacion_laboral_cerrada).toMatchObject({ fecha_inicio: '2010-03-01' });
      expect(result.cerrado_con_el_retiro).toEqual({
        destino_id: '88',
        inscripciones_ids: ['301'],
        usuario_id: '7',
      });
    });

    it('expone la anulacion cuando el retiro fue anulado', async () => {
      prisma.retiros.findUnique.mockResolvedValue(
        makeRetiro({
          anulado: true,
          motivo_anulacion: 'Error de carga',
          fecha_anulacion: new Date('2026-09-01T12:00:00Z'),
          usuarios_anulacion: { id: 9n, username: 'supervisor' },
          movimientos_laborales: null,
          usuarios_registro: null,
        }),
      );

      const result = await service.obtener(88);

      expect(result.anulacion).toMatchObject({
        motivo: 'Error de carga',
        por: { id: '9', username: 'supervisor' },
      });
      expect(result.movimiento).toBeNull();
    });

    it('expone la reincorporacion si la persona volvio', async () => {
      prisma.retiros.findUnique.mockResolvedValue(
        makeRetiro({ movimientos_laborales: null, usuarios_registro: null, usuarios_anulacion: null }),
      );
      prisma.relaciones_laborales.findFirst.mockResolvedValue({
        id: 46n,
        fecha_inicio: new Date('2027-01-15'),
        situaciones: { codigo: 'SIT17', denominacion: 'Personal Subalterno reincorporado.' },
      });

      const result = await service.obtener(88);

      expect(result.reincorporacion).toEqual({
        relacion_laboral_id: '46',
        fecha: '2027-01-15',
        situacion: { codigo: 'SIT17', denominacion: 'Personal Subalterno reincorporado.' },
      });
    });

    it('404 si el retiro no existe', async () => {
      prisma.retiros.findUnique.mockResolvedValue(null);

      await expect(service.obtener(999)).rejects.toThrow(NotFoundException);
    });
  });
  // ─── corregir ───────────────────────────────────────────────────────────────

  describe('corregir', () => {
    beforeEach(() => {
      prisma.retiros.findUnique.mockResolvedValue(makeRetiro());
      prisma.retiros.update.mockResolvedValue(makeRetiro());
      prisma.motivos_baja.findUnique.mockResolvedValue(makeMotivoBaja({ id: 2n, codigo: 'RETIRO_VOL' }));
      prisma.relaciones_laborales.update.mockResolvedValue(makeRelacion());
      prisma.relaciones_laborales.findFirst.mockResolvedValue(null);
    });

    it('actualiza solo los campos declarativos enviados', async () => {
      await service.corregir(88, { motivo: 'Corregido', boletin: 'B.P. 8892' });

      expect(prisma.retiros.update).toHaveBeenCalledWith({
        where: { id: 88n },
        data: { motivo: 'Corregido', boletin: 'B.P. 8892' },
      });
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
    });

    it('al cambiar la fecha la propaga a la relacion laboral', async () => {
      await service.corregir(88, { fecha_retiro: '2026-08-29' });

      expect(prisma.relaciones_laborales.update).toHaveBeenCalledWith({
        where: { id: 45n },
        data: { fecha_fin: new Date('2026-08-29'), fecha_actualizacion: expect.any(Date) },
      });
    });

    it('409 si el retiro esta anulado', async () => {
      prisma.retiros.findUnique.mockResolvedValue(makeRetiro({ anulado: true }));

      await expect(service.corregir(88, { motivo: 'x' })).rejects.toThrow(ConflictException);
    });

    it('422 si el motivo de baja nuevo no es valido', async () => {
      prisma.motivos_baja.findUnique.mockResolvedValue(null);

      await expect(service.corregir(88, { motivo_baja_id: 99 })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('404 si el retiro no existe', async () => {
      prisma.retiros.findUnique.mockResolvedValue(null);

      await expect(service.corregir(999, { motivo: 'x' })).rejects.toThrow(NotFoundException);
    });
  });
  // ─── anular ─────────────────────────────────────────────────────────────────

  describe('anular', () => {
    const retiroConCierres = (o: Partial<any> = {}) =>
      makeRetiro({
        movimiento_laboral_id: 410n,
        cierres_aplicados: { destino_id: '88', inscripciones_ids: ['301'], usuario_id: '7' },
        ...o,
      });

    beforeEach(() => {
      prisma.retiros.findUnique.mockResolvedValue(retiroConCierres());
      prisma.retiros.update.mockResolvedValue(retiroConCierres({ anulado: true }));
      prisma.relaciones_laborales.update.mockResolvedValue(makeRelacion());
      prisma.movimientos_laborales.delete.mockResolvedValue({ id: 410n });
      prisma.destinos.update.mockResolvedValue({ id: 88n });
      prisma.funcionarios_cursos.updateMany.mockResolvedValue({ count: 1 });
      prisma.usuarios.update.mockResolvedValue({ id: 7n });
    });

    it('reabre la relacion laboral sin tocar situacion_id', async () => {
      await service.anular(88, { motivo_anulacion: 'Error de carga' }, 9n);

      expect(prisma.relaciones_laborales.update).toHaveBeenCalledWith({
        where: { id: 45n },
        data: expect.objectContaining({ estado: 'activo', fecha_fin: null, motivo_baja_id: null }),
      });
      expect(prisma.relaciones_laborales.update.mock.calls[0][0].data).not.toHaveProperty(
        'situacion_id',
      );
    });

    it('desvincula el movimiento ANTES de borrarlo, o la FK lo impide', async () => {
      await service.anular(88, { motivo_anulacion: 'Error de carga' }, 9n);

      const desvinculo = prisma.retiros.update.mock.invocationCallOrder[0];
      const borrado = prisma.movimientos_laborales.delete.mock.invocationCallOrder[0];

      expect(prisma.retiros.update.mock.calls[0][0].data).toMatchObject({
        movimiento_laboral_id: null,
      });
      expect(desvinculo).toBeLessThan(borrado);
    });

    it('borra SOLO el movimiento que creo el retiro', async () => {
      await service.anular(88, { motivo_anulacion: 'Error de carga' }, 9n);

      expect(prisma.movimientos_laborales.delete).toHaveBeenCalledWith({ where: { id: 410n } });
      expect(prisma.movimientos_laborales.delete).toHaveBeenCalledTimes(1);
    });

    it('deshace los cierres registrados en cierres_aplicados', async () => {
      await service.anular(88, { motivo_anulacion: 'Error de carga' }, 9n);

      expect(prisma.destinos.update).toHaveBeenCalledWith({
        where: { id: 88n },
        data: { fecha_fin: null },
      });
      expect(prisma.funcionarios_cursos.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [301n] } },
        data: { dado_de_baja: false, motivo_baja: null, fecha_baja: null, dado_de_baja_por: null },
      });
      expect(prisma.usuarios.update).toHaveBeenCalledWith({
        where: { id: 7n },
        data: { estado: 'activo' },
      });
    });

    it('no deshace nada que no este en cierres_aplicados', async () => {
      prisma.retiros.findUnique.mockResolvedValue(
        makeRetiro({
          movimiento_laboral_id: 410n,
          cierres_aplicados: { destino_id: null, inscripciones_ids: [], usuario_id: null },
        }),
      );

      await service.anular(88, { motivo_anulacion: 'Error' }, 9n);

      expect(prisma.destinos.update).not.toHaveBeenCalled();
      expect(prisma.funcionarios_cursos.updateMany).not.toHaveBeenCalled();
      expect(prisma.usuarios.update).not.toHaveBeenCalled();
    });

    it('no borra ningun movimiento si el retiro no tenia', async () => {
      prisma.retiros.findUnique.mockResolvedValue(retiroConCierres({ movimiento_laboral_id: null }));

      await service.anular(88, { motivo_anulacion: 'Error' }, 9n);

      expect(prisma.movimientos_laborales.delete).not.toHaveBeenCalled();
    });

    it('marca el retiro como anulado con autor, fecha y motivo', async () => {
      await service.anular(88, { motivo_anulacion: 'Error de carga' }, 9n);

      expect(prisma.retiros.update.mock.calls[0][0].data).toMatchObject({
        anulado: true,
        motivo_anulacion: 'Error de carga',
        anulado_por: 9n,
      });
    });

    it('informa que revirtio', async () => {
      const result = await service.anular(88, { motivo_anulacion: 'Error' }, 9n);

      expect(result).toEqual({
        id: '88',
        revertido: {
          relacion_laboral: '45',
          movimiento_borrado: '410',
          destino: '88',
          inscripciones: ['301'],
          usuario: '7',
        },
      });
    });

    it('409 si ya estaba anulado', async () => {
      prisma.retiros.findUnique.mockResolvedValue(makeRetiro({ anulado: true }));

      await expect(service.anular(88, { motivo_anulacion: 'x' }, 9n)).rejects.toThrow(
        ConflictException,
      );
    });

    it('404 si no existe', async () => {
      prisma.retiros.findUnique.mockResolvedValue(null);

      await expect(service.anular(999, { motivo_anulacion: 'x' }, 9n)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
