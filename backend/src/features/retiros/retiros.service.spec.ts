import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { RetirosService } from './retiros.service';
import { PrismaService } from '../../lib/prisma.service';
import { CierreCarreraService } from './cierre-carrera.service';
import { DerechaService } from '../derecha/derecha.service';

import {
  makeGrado,
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
  let derecha: { asignarEnAltaEnTransaccion: jest.Mock };

  beforeAll(async () => {
    prisma = makePrismaMock();
    cierre = { cerrar: jest.fn() };
    derecha = { asignarEnAltaEnTransaccion: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetirosService,
        { provide: PrismaService, useValue: prisma },
        { provide: CierreCarreraService, useValue: cierre },
        { provide: DerechaService, useValue: derecha },
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
    beforeEach(() => {
      prisma.$queryRaw.mockResolvedValue([]);
    });

    it('por defecto se queda con los retiros vigentes que resuelve la consulta SQL', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 88n }]);
      prisma.retiros.findMany.mockResolvedValue([makeRetiro()]);
      prisma.retiros.count.mockResolvedValue(1);

      const result = await service.listar({});

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.retiros.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ anulado: false, id: { in: [88n] } }),
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
      expect(where.id).toBeUndefined();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
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
          personas: makePersonaMin({
            relaciones_laborales: [{ estado: 'activo', fecha_inicio: new Date('2027-01-15') }],
          }),
        }),
      ]);
      prisma.retiros.count.mockResolvedValue(1);

      const result = await service.listar({ vigentes: false });

      expect(result.items[0].vigente).toBe(false);
    });

    it('un retiro viejo no queda vigente si la persona volvió y se volvió a retirar', async () => {
      // Hoy no tiene relación activa, pero después de este retiro empezó otra.
      prisma.retiros.findMany.mockResolvedValue([
        makeRetiro({
          personas: makePersonaMin({
            relaciones_laborales: [
              { estado: 'inactivo', fecha_inicio: new Date('2010-03-01') },
              { estado: 'inactivo', fecha_inicio: new Date('2027-01-15') },
            ],
          }),
        }),
      ]);
      prisma.retiros.count.mockResolvedValue(1);

      const result = await service.listar({ vigentes: false });

      expect(result.items[0].vigente).toBe(false);
    });

    it('el último retiro de alguien que no volvió sigue vigente', async () => {
      prisma.retiros.findMany.mockResolvedValue([
        makeRetiro({
          personas: makePersonaMin({
            relaciones_laborales: [{ estado: 'inactivo', fecha_inicio: new Date('2010-03-01') }],
          }),
        }),
      ]);
      prisma.retiros.count.mockResolvedValue(1);

      const result = await service.listar({ vigentes: false });

      expect(result.items[0].vigente).toBe(true);
    });

    it('el filtro de vigentes descarta los retiros con una relación posterior o activa', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.retiros.findMany.mockResolvedValue([]);
      prisma.retiros.count.mockResolvedValue(0);

      await service.listar({ vigentes: true });

      const sql = prisma.$queryRaw.mock.calls[0][0].join(' ');
      expect(sql).toMatch(/NOT r\.anulado/);
      expect(sql).toMatch(/rl\.estado = 'activo' OR rl\.fecha_inicio > r\.fecha_retiro/);
      expect(prisma.retiros.findMany.mock.calls[0][0].where.id).toEqual({ in: [] });
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
      prisma.relaciones_laborales.findMany.mockResolvedValue([]);
      prisma.retiros.findFirst.mockResolvedValue(null);
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

    const retiroSinDetalle = () =>
      makeRetiro({ movimientos_laborales: null, usuarios_registro: null, usuarios_anulacion: null });

    const posterior = (o: Partial<any> = {}) => ({
      id: 46n,
      estado: 'activo',
      fecha_inicio: new Date('2027-01-15'),
      fecha_fin: null,
      haber_retiro: 42000.5,
      porcentaje_progresivo: 0.3,
      situaciones: { codigo: 'SIT17', denominacion: 'Personal Subalterno reincorporado.' },
      grados_relaciones_laborales_grado_reincorporacion_idTogrados: { id: 3n, denominacion: 'Sargento' },
      ...o,
    });

    it('expone la reincorporacion si la persona volvio', async () => {
      prisma.retiros.findUnique.mockResolvedValue(retiroSinDetalle());
      prisma.relaciones_laborales.findMany.mockResolvedValue([posterior()]);

      const result = await service.obtener(88);

      expect(result.reincorporacion).toEqual({
        relacion_laboral_id: '46',
        fecha: '2027-01-15',
        situacion: { codigo: 'SIT17', denominacion: 'Personal Subalterno reincorporado.' },
        activa: true,
        grado_reincorporacion: { id: '3', denominacion: 'Sargento' },
        haber_retiro: 42000.5,
        porcentaje_progresivo: 0.3,
        faltan_datos_de_calculo: false,
      });
    });

    it('avisa si a la reincorporacion activa le faltan haber y porcentaje', async () => {
      prisma.retiros.findUnique.mockResolvedValue(retiroSinDetalle());
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        posterior({ haber_retiro: null, porcentaje_progresivo: null }),
      ]);

      const result = await service.obtener(88);

      expect(result.reincorporacion).toMatchObject({
        haber_retiro: null,
        porcentaje_progresivo: null,
        faltan_datos_de_calculo: true,
      });
    });

    it('no avisa si la relacion posterior ya se cerro', async () => {
      prisma.retiros.findUnique.mockResolvedValue(retiroSinDetalle());
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        posterior({ estado: 'inactivo', fecha_fin: new Date('2027-06-30'), haber_retiro: null, porcentaje_progresivo: null }),
      ]);

      const result = await service.obtener(88);

      expect(result.reincorporacion).toMatchObject({ activa: false, faltan_datos_de_calculo: false });
    });

    it('despues de un ascenso informa la relacion activa con la fecha de la reincorporacion', async () => {
      // Nuestro ascenso abre la relación nueva con la misma fecha de inicio.
      prisma.retiros.findUnique.mockResolvedValue(retiroSinDetalle());
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        posterior({ estado: 'inactivo', fecha_fin: new Date('2027-06-01') }),
        posterior({
          id: 47n,
          grados_relaciones_laborales_grado_reincorporacion_idTogrados: { id: 2n, denominacion: 'Sargento Primero' },
        }),
      ]);

      const result = await service.obtener(88);

      expect(result.reincorporacion).toMatchObject({
        relacion_laboral_id: '47',
        fecha: '2027-01-15',
        activa: true,
        grado_reincorporacion: { id: '2', denominacion: 'Sargento Primero' },
      });
    });

    it('con un ascenso que abrio la relacion en otra fecha tambien toma la activa', async () => {
      prisma.retiros.findUnique.mockResolvedValue(retiroSinDetalle());
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        posterior({ estado: 'inactivo', fecha_fin: new Date('2027-06-01') }),
        posterior({ id: 47n, fecha_inicio: new Date('2027-06-01') }),
      ]);

      const result = await service.obtener(88);

      expect(result.reincorporacion).toMatchObject({ relacion_laboral_id: '47', fecha: '2027-01-15', activa: true });
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
      prisma.relaciones_laborales.findMany.mockResolvedValue([]);
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
      prisma.relaciones_laborales.findFirst.mockResolvedValue(null);
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

    it('lo reintegra a la derecha al final de su grado, como un alta', async () => {
      await service.anular(88, { motivo_anulacion: 'Error de carga' }, 9n);

      expect(derecha.asignarEnAltaEnTransaccion).toHaveBeenCalledWith(
        prisma,
        retiroConCierres().persona_id,
        null,
        null,
        { motivo: 'Anulación de retiro: Error de carga', usuarioId: 9n },
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

    it('409 sin tocar nada si el retiro no tiene movimiento: es importado o previo al módulo', async () => {
      prisma.retiros.findUnique.mockResolvedValue(retiroConCierres({ movimiento_laboral_id: null }));

      await expect(service.anular(88, { motivo_anulacion: 'Error' }, 9n)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('409 sin tocar nada si la persona tiene fecha de fallecimiento', async () => {
      prisma.retiros.findUnique.mockResolvedValue(
        retiroConCierres({
          personas: makePersonaMin({ fecha_fallecimiento: new Date('2026-08-28') }),
        }),
      );

      await expect(service.anular(88, { motivo_anulacion: 'Error' }, 9n)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('anula un retiro por fallecimiento cuando la persona ya no tiene la fecha cargada', async () => {
      prisma.retiros.findUnique.mockResolvedValue(
        retiroConCierres({ motivos_baja: makeMotivoBaja({ codigo: 'FALLECIMIENTO' }) }),
      );

      await service.anular(88, { motivo_anulacion: 'La muerte se cargó por error' }, 9n);

      expect(prisma.relaciones_laborales.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estado: 'activo' }) }),
      );
    });

    it('409 sin tocar nada si la persona ya tiene una relacion activa', async () => {
      prisma.retiros.findUnique.mockResolvedValue(
        retiroConCierres({ personas: makePersonaMin({ relaciones_laborales: [{ id: 46n }] }) }),
      );

      await expect(service.anular(88, { motivo_anulacion: 'Error' }, 9n)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('409 sin tocar nada si la relacion del retiro no es la mas reciente', async () => {
      prisma.relaciones_laborales.findFirst.mockResolvedValue({ id: 50n });

      await expect(service.anular(88, { motivo_anulacion: 'Error' }, 9n)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('a igual fecha de inicio, la mas reciente es la que termina despues', async () => {
      // El ascenso abre la relación nueva conservando fecha_inicio.
      await service.anular(88, { motivo_anulacion: 'Error' }, 9n);

      expect(prisma.relaciones_laborales.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            persona_id: 100n,
            id: { not: 45n },
            OR: [
              { fecha_inicio: { gt: new Date('2010-03-01') } },
              {
                fecha_inicio: new Date('2010-03-01'),
                OR: [{ fecha_fin: null }, { fecha_fin: { gt: new Date('2026-08-28') } }],
              },
            ],
          },
        }),
      );
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
  // ─── reincorporación ────────────────────────────────────────────────────────

  const retiroOficial = () =>
    makeRetiro({
      relaciones_laborales: makeRelacion({
        estado: 'inactivo',
        fecha_fin: new Date('2026-08-28'),
        tipo_funcionario: 'oficial',
        grados: { id: 9n, codigo: 'CAP', denominacion: 'Capitán', es_oficial: true, es_subalterno: false },
      }),
    });

  const prepararReincorporable = () => {
    prisma.retiros.findUnique.mockResolvedValue(makeRetiro());
    prisma.relaciones_laborales.findFirst.mockResolvedValue(null);
    prisma.situaciones.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.codigo === 'SIT16'
          ? { id: 16n, codigo: 'SIT16', denominacion: 'Personal Superior reincorporado.' }
          : { id: 17n, codigo: 'SIT17', denominacion: 'Personal Subalterno reincorporado.' },
      ),
    );
    prisma.tipos_movimiento.findFirst.mockResolvedValue({ id: 5n, nombre: 'Reincorporacion', es_alta: true });
    prisma.destinos.findFirst.mockResolvedValue(null);
  };

  describe('previaReincorporacion', () => {
    beforeEach(prepararReincorporable);

    it('informa la situacion que se usaria y lo que se copia de la relacion cerrada', async () => {
      const result = await service.previaReincorporacion(88);

      expect(result.bloqueos).toEqual([]);
      expect(result.situacion).toEqual({
        id: '17',
        codigo: 'SIT17',
        denominacion: 'Personal Subalterno reincorporado.',
      });
      expect(result.se_copia).toMatchObject({
        grado: { id: '3', denominacion: 'Sargento' },
        escalafon: { id: '2', denominacion: '(S.G.)' },
        tipo_funcionario: 'subalterno',
        fecha_ascenso_oficial: '2015-06-01',
        anios_servicio_anterior: 7,
        riesgo_vuelo: 1500,
        superprima: true,
      });
      expect(result.unidad_anterior).toEqual({ id: '5', denominacion: 'Cuartel General' });
    });

    it('usa SIT16 para un oficial', async () => {
      prisma.retiros.findUnique.mockResolvedValue(retiroOficial());

      const result = await service.previaReincorporacion(88);

      expect(result.situacion?.codigo).toBe('SIT16');
    });

    it('muestra el destino que quedo abierto', async () => {
      prisma.destinos.findFirst.mockResolvedValue({
        id: 88n,
        unidad_id: 5n,
        fecha_inicio: new Date('2020-01-01'),
        unidades: { id: 5n, denominacion: 'Cuartel General' },
      });

      const result = await service.previaReincorporacion(88);

      expect(result.destino_abierto).toEqual({
        id: '88',
        unidad: { id: '5', denominacion: 'Cuartel General' },
        fecha_inicio: '2020-01-01',
      });
    });

    it.each([
      ['anulado', () => makeRetiro({ anulado: true }), /anulado/i],
      [
        'con relacion activa',
        () => makeRetiro({ personas: makePersonaMin({ relaciones_laborales: [{ id: 46n }] }) }),
        /relación laboral activa/i,
      ],
      [
        'fallecido',
        () => makeRetiro({ personas: makePersonaMin({ fecha_fallecimiento: new Date('2026-08-28') }) }),
        /falleci/i,
      ],
    ])('bloquea un retiro %s', async (_caso, retiro, mensaje) => {
      prisma.retiros.findUnique.mockResolvedValue(retiro());

      const result = await service.previaReincorporacion(88);

      expect(result.bloqueos).toContainEqual(expect.stringMatching(mensaje));
    });

    it('bloquea si el retiro no es el de la relacion mas reciente', async () => {
      prisma.relaciones_laborales.findFirst.mockResolvedValue({ id: 50n });

      const result = await service.previaReincorporacion(88);

      expect(result.bloqueos).toContainEqual(expect.stringMatching(/más reciente/i));
    });

    it('bloquea si el grado no corresponde a la categoria del funcionario', async () => {
      prisma.retiros.findUnique.mockResolvedValue(
        makeRetiro({
          relaciones_laborales: makeRelacion({
            tipo_funcionario: 'oficial',
            grados: { id: 3n, denominacion: 'Sargento', es_oficial: false, es_subalterno: true },
          }),
        }),
      );

      const result = await service.previaReincorporacion(88);

      expect(result.bloqueos).toContainEqual(expect.stringMatching(/no corresponde/i));
    });

    it('bloquea si falta la situacion en el catalogo', async () => {
      prisma.situaciones.findFirst.mockResolvedValue(null);

      const result = await service.previaReincorporacion(88);

      expect(result.bloqueos).toContainEqual(expect.stringMatching(/SIT17/));
    });

    it('no escribe nada', async () => {
      await service.previaReincorporacion(88);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.relaciones_laborales.create).not.toHaveBeenCalled();
    });

    it('404 si el retiro no existe', async () => {
      prisma.retiros.findUnique.mockResolvedValue(null);

      await expect(service.previaReincorporacion(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('reincorporar', () => {
    const dtoBase = (o: Partial<any> = {}) => ({
      fecha_reincorporacion: '2026-10-01',
      grado_reincorporacion_id: 3,
      haber_retiro: 45000.5,
      porcentaje_progresivo: 0.3,
      unidad_id: 5,
      numero_orden: 'O.D. 13001',
      ...o,
    });

    const dataRelacionNueva = () => prisma.relaciones_laborales.create.mock.calls[0][0].data;

    beforeEach(() => {
      prepararReincorporable();
      prisma.grados.findUnique.mockResolvedValue(makeGrado());
      prisma.unidades.findUnique.mockResolvedValue({ id: 5n, vigente: true });
      prisma.relaciones_laborales.create.mockResolvedValue({ id: 46n });
      prisma.movimientos_laborales.create.mockResolvedValue({ id: 411n });
      prisma.destinos.create.mockResolvedValue({ id: 90n });
    });

    it('crea una relacion laboral nueva y no toca la cerrada', async () => {
      await service.reincorporar(88, dtoBase(), 7n);

      expect(prisma.relaciones_laborales.create).toHaveBeenCalledTimes(1);
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
    });

    it('copia de la relacion cerrada los datos de carrera y de calculo', async () => {
      await service.reincorporar(88, dtoBase(), 7n);

      expect(dataRelacionNueva()).toMatchObject({
        persona_id: 100n,
        regimen_id: 1n,
        programa_id: 1n,
        escalafon_id: 2n,
        grado_id: 3n,
        tipo_funcionario: 'subalterno',
        fecha_ascenso_oficial: new Date('2015-06-01'),
        fecha_ultimo_ascenso: new Date('2022-01-15'),
        anios_servicio_anterior: 7,
        anios_inactivos: 2,
        riesgo_vuelo: 1500,
        categoria_viatico: 3,
        usa_fonasa: true,
        superprima: true,
        prima_tecnica: 'A',
        prima_solidaria_familiar: 'SI',
        observaciones: 'Observaciones de carrera',
      });
    });

    it('toma del DTO la fecha, la unidad y los tres campos de calculo', async () => {
      await service.reincorporar(88, dtoBase(), 7n);

      expect(dataRelacionNueva()).toMatchObject({
        estado: 'activo',
        fecha_inicio: new Date('2026-10-01'),
        unidad_id: 5n,
        grado_reincorporacion_id: 3n,
        haber_retiro: 45000.5,
        porcentaje_progresivo: 0.3,
      });
    });

    it('sin haber ni porcentaje crea la relacion con esos campos vacios', async () => {
      const { haber_retiro, porcentaje_progresivo, ...sinCalculo } = dtoBase();

      await service.reincorporar(88, sinCalculo, 7n);

      expect(dataRelacionNueva()).toMatchObject({ haber_retiro: null, porcentaje_progresivo: null });
    });

    it.each([
      ['solo el haber', { porcentaje_progresivo: undefined }],
      ['solo el porcentaje', { haber_retiro: undefined }],
    ])('422 sin escribir si viene %s', async (_caso, faltante) => {
      await expect(service.reincorporar(88, dtoBase(faltante), 7n)).rejects.toThrow(
        /van juntos/,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('no arrastra la derecha ni el motivo de baja', async () => {
      await service.reincorporar(88, dtoBase(), 7n);

      const data = dataRelacionNueva();
      for (const campo of ['derecha', 'numor', 'escala_derecha', 'motivo_baja_id', 'fecha_fin']) {
        expect(data).not.toHaveProperty(campo);
      }
    });

    it('usa SIT17 para un subalterno', async () => {
      await service.reincorporar(88, dtoBase(), 7n);

      expect(prisma.situaciones.findFirst).toHaveBeenCalledWith({ where: { codigo: 'SIT17' } });
      expect(dataRelacionNueva().situacion_id).toBe(17n);
    });

    it('usa SIT16 para un oficial', async () => {
      prisma.retiros.findUnique.mockResolvedValue(retiroOficial());
      prisma.grados.findUnique.mockResolvedValue(
        makeGrado({ id: 9n, denominacion: 'Capitán', es_oficial: true, es_subalterno: false }),
      );

      await service.reincorporar(88, dtoBase({ grado_reincorporacion_id: 9 }), 7n);

      expect(dataRelacionNueva().situacion_id).toBe(16n);
    });

    it('sin tipo_funcionario deduce la categoria del grado', async () => {
      prisma.retiros.findUnique.mockResolvedValue(
        makeRetiro({ relaciones_laborales: makeRelacion({ tipo_funcionario: null }) }),
      );

      await service.reincorporar(88, dtoBase(), 7n);

      expect(dataRelacionNueva()).toMatchObject({ situacion_id: 17n, tipo_funcionario: 'subalterno' });
    });

    it('conserva la sub-unidad solo si no cambia la unidad', async () => {
      prisma.retiros.findUnique.mockResolvedValue(
        makeRetiro({ relaciones_laborales: makeRelacion({ sub_unidad_id: 12n }) }),
      );
      prisma.unidades.findUnique.mockResolvedValue({ id: 6n, vigente: true });

      await service.reincorporar(88, dtoBase({ unidad_id: 6 }), 7n);

      expect(dataRelacionNueva()).toMatchObject({ unidad_id: 6n, sub_unidad_id: null });
    });

    it('registra el movimiento Reincorporacion sobre la relacion nueva', async () => {
      await service.reincorporar(88, dtoBase({ observaciones: 'O.C.G.F.A. 445' }), 7n);

      expect(prisma.tipos_movimiento.findFirst).toHaveBeenCalledWith({
        where: { nombre: 'Reincorporacion', es_alta: true },
      });
      expect(prisma.movimientos_laborales.create).toHaveBeenCalledWith({
        data: {
          relacion_laboral_id: 46n,
          tipo_movimiento_id: 5n,
          fecha_movimiento: new Date('2026-10-01'),
          usuario_id: 7n,
          observaciones: 'O.C.G.F.A. 445',
        },
      });
    });

    it('lo pone al final de su grado en la derecha, despues de abrir la relacion', async () => {
      await service.reincorporar(88, dtoBase(), 7n);

      expect(derecha.asignarEnAltaEnTransaccion).toHaveBeenCalledWith(prisma, 100n, null, null, {
        motivo: 'Reincorporación',
        usuarioId: 7n,
      });
      expect(prisma.relaciones_laborales.create.mock.invocationCallOrder[0]).toBeLessThan(
        derecha.asignarEnAltaEnTransaccion.mock.invocationCallOrder[0],
      );
    });

    it('le asigna destino en la unidad pedida con la orden del acto', async () => {
      await service.reincorporar(88, dtoBase({ posicion_destino: 'Jefe de Sección' }), 7n);

      expect(prisma.destinos.create).toHaveBeenCalledWith({
        data: {
          persona_id: 100n,
          unidad_id: 5n,
          fecha_inicio: new Date('2026-10-01'),
          posicion_destino: 'Jefe de Sección',
          numero_orden: 'O.D. 13001',
          boletin: null,
          observaciones: null,
        },
      });
    });

    it.each([
      ['en la misma unidad', 5n],
      ['en otra unidad', 4n],
    ])('si conservo un destino abierto %s, lo cierra el dia anterior y abre otro con la orden del acto', async (_caso, unidad) => {
      prisma.destinos.findFirst.mockResolvedValue({
        id: 88n,
        unidad_id: unidad,
        fecha_inicio: new Date('2020-01-01'),
      });

      const result = await service.reincorporar(88, dtoBase(), 7n);

      expect(prisma.destinos.update).toHaveBeenCalledWith({
        where: { id: 88n },
        data: { fecha_fin: new Date('2026-09-30') },
      });
      expect(prisma.destinos.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ unidad_id: 5n, numero_orden: 'O.D. 13001' }),
      });
      expect(result.destino).toEqual({ id: '90', anterior_cerrado: '88' });
    });

    it('422 sin escribir si el destino abierto empieza despues de la reincorporacion', async () => {
      prisma.destinos.findFirst.mockResolvedValue({
        id: 88n,
        unidad_id: 5n,
        fecha_inicio: new Date('2026-10-15'),
      });

      await expect(service.reincorporar(88, dtoBase(), 7n)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('no escribe en la tabla retiros', async () => {
      await service.reincorporar(88, dtoBase(), 7n);

      expect(prisma.retiros.update).not.toHaveBeenCalled();
      expect(prisma.retiros.create).not.toHaveBeenCalled();
    });

    it('devuelve lo que creo', async () => {
      const result = await service.reincorporar(88, dtoBase(), 7n);

      expect(result).toEqual({
        retiro_id: '88',
        relacion_laboral: {
          id: '46',
          fecha_inicio: '2026-10-01',
          situacion: { codigo: 'SIT17', denominacion: 'Personal Subalterno reincorporado.' },
        },
        movimiento_id: '411',
        destino: { id: '90', anterior_cerrado: null },
      });
    });

    it.each([
      ['anulado', () => makeRetiro({ anulado: true })],
      [
        'de una persona con relacion activa',
        () => makeRetiro({ personas: makePersonaMin({ relaciones_laborales: [{ id: 46n }] }) }),
      ],
    ])('409 sin escribir si el retiro esta %s', async (_caso, retiro) => {
      prisma.retiros.findUnique.mockResolvedValue(retiro());

      await expect(service.reincorporar(88, dtoBase(), 7n)).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('409 sin escribir si no es el retiro mas reciente', async () => {
      prisma.relaciones_laborales.findFirst.mockResolvedValue({ id: 50n });

      await expect(service.reincorporar(88, dtoBase(), 7n)).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('422 si la persona fallecio', async () => {
      prisma.retiros.findUnique.mockResolvedValue(
        makeRetiro({ motivos_baja: makeMotivoBaja({ codigo: 'FALLECIMIENTO' }) }),
      );

      await expect(service.reincorporar(88, dtoBase(), 7n)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it.each([
      ['el mismo dia del retiro', '2026-08-28'],
      ['antes del retiro', '2026-01-01'],
      ['en el futuro', new Date(Date.now() + 86400000).toISOString().split('T')[0]],
    ])('422 sin escribir si la fecha es %s', async (_caso, fecha) => {
      await expect(
        service.reincorporar(88, dtoBase({ fecha_reincorporacion: fecha }), 7n),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['no existe', null],
      ['no esta vigente', makeGrado({ vigente: false })],
      ['es de oficial y el funcionario es subalterno', makeGrado({ es_oficial: true, es_subalterno: false })],
    ])('422 si el grado de reincorporacion %s', async (_caso, grado) => {
      prisma.grados.findUnique.mockResolvedValue(grado);

      await expect(service.reincorporar(88, dtoBase(), 7n)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it.each([
      ['no existe', null],
      ['no esta vigente', { id: 5n, vigente: false }],
    ])('422 si la unidad %s', async (_caso, unidad) => {
      prisma.unidades.findUnique.mockResolvedValue(unidad);

      await expect(service.reincorporar(88, dtoBase(), 7n)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('422 si falta el tipo de movimiento en el catalogo', async () => {
      prisma.tipos_movimiento.findFirst.mockResolvedValue(null);

      await expect(service.reincorporar(88, dtoBase(), 7n)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('404 si el retiro no existe', async () => {
      prisma.retiros.findUnique.mockResolvedValue(null);

      await expect(service.reincorporar(999, dtoBase(), 7n)).rejects.toThrow(NotFoundException);
    });
  });

  describe('actualizarReincorporacion', () => {
    const relacionReincorporada = (o: Partial<any> = {}) => ({
      id: 46n,
      estado: 'activo',
      fecha_inicio: new Date('2026-10-01'),
      fecha_fin: null,
      situaciones: { codigo: 'SIT17' },
      ...o,
    });

    beforeEach(() => {
      prisma.retiros.findUnique.mockResolvedValue(makeRetiro());
      prisma.relaciones_laborales.findMany.mockResolvedValue([relacionReincorporada()]);
      prisma.retiros.findFirst.mockResolvedValue(null);
      prisma.relaciones_laborales.update.mockResolvedValue({ id: 46n });
      prisma.grados.findUnique.mockResolvedValue(makeGrado());
    });

    it('carga haber y porcentaje en la relacion de la reincorporacion', async () => {
      await service.actualizarReincorporacion(88, { haber_retiro: 42000.5, porcentaje_progresivo: 0.3 });

      expect(prisma.relaciones_laborales.update).toHaveBeenCalledWith({
        where: { id: 46n },
        data: { haber_retiro: 42000.5, porcentaje_progresivo: 0.3, fecha_actualizacion: expect.any(Date) },
      });
    });

    it('despues de un ascenso actualiza la relacion activa, no la que cerro el ascenso', async () => {
      // El ascenso abre la relación nueva con la misma fecha de inicio.
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        relacionReincorporada({ estado: 'inactivo', fecha_fin: new Date('2027-03-01') }),
        relacionReincorporada({ id: 47n }),
      ]);

      await service.actualizarReincorporacion(88, { haber_retiro: 42000.5, porcentaje_progresivo: 0.3 });

      expect(prisma.relaciones_laborales.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 47n } }),
      );
    });

    it('no toma relaciones de una reincorporacion posterior a otro retiro', async () => {
      prisma.retiros.findFirst.mockResolvedValue({ fecha_retiro: new Date('2027-06-30') });

      await service.actualizarReincorporacion(88, { haber_retiro: 42000.5, porcentaje_progresivo: 0.3 });

      expect(prisma.retiros.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { persona_id: 100n, anulado: false, fecha_retiro: { gt: new Date('2026-08-28') } },
          orderBy: { fecha_retiro: 'asc' },
        }),
      );
      expect(prisma.relaciones_laborales.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            persona_id: 100n,
            fecha_inicio: { gt: new Date('2026-08-28'), lte: new Date('2027-06-30') },
          },
        }),
      );
    });

    it('corrige el grado de reincorporacion validando la categoria', async () => {
      await service.actualizarReincorporacion(88, { grado_reincorporacion_id: 3 });

      expect(prisma.relaciones_laborales.update).toHaveBeenCalledWith({
        where: { id: 46n },
        data: { grado_reincorporacion_id: 3n, fecha_actualizacion: expect.any(Date) },
      });
    });

    it('422 si el grado no corresponde a la situacion de la relacion', async () => {
      prisma.grados.findUnique.mockResolvedValue(makeGrado({ es_oficial: true, es_subalterno: false }));

      await expect(
        service.actualizarReincorporacion(88, { grado_reincorporacion_id: 9 }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it.each([
      ['solo el haber', { haber_retiro: 42000.5 }],
      ['solo el porcentaje', { porcentaje_progresivo: 0.3 }],
    ])('422 sin escribir si viene %s', async (_caso, dto) => {
      await expect(service.actualizarReincorporacion(88, dto)).rejects.toThrow(/van juntos/);
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
    });

    it('422 si no viene nada para actualizar', async () => {
      await expect(service.actualizarReincorporacion(88, {})).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('409 si el funcionario no se reincorporo despues de este retiro', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValue([]);

      await expect(
        service.actualizarReincorporacion(88, { haber_retiro: 1, porcentaje_progresivo: 0.1 }),
      ).rejects.toThrow(ConflictException);
    });

    it('409 si la relacion de la reincorporacion ya se cerro', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        relacionReincorporada({ estado: 'inactivo', fecha_fin: new Date('2026-11-02') }),
      ]);

      await expect(
        service.actualizarReincorporacion(88, { haber_retiro: 1, porcentaje_progresivo: 0.1 }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
    });

    it('422 si la relacion posterior no es de reincorporado', async () => {
      prisma.relaciones_laborales.findMany.mockResolvedValue([
        relacionReincorporada({ situaciones: { codigo: 'SIT07' } }),
      ]);

      await expect(
        service.actualizarReincorporacion(88, { haber_retiro: 1, porcentaje_progresivo: 0.1 }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('409 si el retiro esta anulado', async () => {
      prisma.retiros.findUnique.mockResolvedValue(makeRetiro({ anulado: true }));

      await expect(
        service.actualizarReincorporacion(88, { haber_retiro: 1, porcentaje_progresivo: 0.1 }),
      ).rejects.toThrow(ConflictException);
    });

    it('404 si el retiro no existe', async () => {
      prisma.retiros.findUnique.mockResolvedValue(null);

      await expect(
        service.actualizarReincorporacion(999, { haber_retiro: 1, porcentaje_progresivo: 0.1 }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
