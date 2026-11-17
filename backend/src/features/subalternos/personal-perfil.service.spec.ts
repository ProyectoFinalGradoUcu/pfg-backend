import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { UpdatePersonalDto } from './dto/update-personal.dto';
import { PersonalPerfilService } from './personal-perfil.service';
import { PrismaService } from '../../lib/prisma.service';
import { CierreCarreraService } from '../retiros/cierre-carrera.service';
import { DerechaService } from '../derecha/derecha.service';

const makeAsignacion = (overrides: Partial<any> = {}) => ({
  id: 200n,
  persona_id: 100n,
  unidad_id: 5n,
  sub_unidad_id: 17n,
  fecha_inicio: new Date('2024-04-30'),
  fecha_fin: null,
  posicion_destino: 'Sub-Jefe de Personal A-1',
  numero_orden: 'O.D. 11007',
  boletin: null,
  observaciones: null,
  unidades: {
    id: 5n,
    codigo: 'CG',
    denominacion: 'C.G.',
  },
  sub_unidades: {
    id: 17n,
    codigo: 'DCG',
    denominacion: 'D.C.G.',
  },
  ...overrides,
});

const makePersonaFamiliar = (overrides: Partial<any> = {}) => ({
  id: 16n,
  cedula: '60000016',
  primer_nombre: 'Laura',
  segundo_nombre: 'Cecilia',
  primer_apellido: 'Acosta',
  segundo_apellido: 'Ferreira',
  genero: 'F',
  relaciones_laborales: [],
  ...overrides,
});

const makeRelacion = (overrides: Partial<any> = {}) => ({
  persona_id: 31n,
  tipo_relacion: 'Madre',
  personas_relaciones_familiares_persona_idTopersonas: makePersonaFamiliar({
    id: 31n, cedula: '12345678', primer_nombre: 'Sofía', segundo_nombre: null,
    primer_apellido: 'Guerrico', segundo_apellido: null, genero: 'F',
  }),
  personas_relaciones_familiares_familiar_idTopersonas: makePersonaFamiliar(),
  ...overrides,
});

const makePrismaMock = () => ({
  personas: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  grados: { findUnique: jest.fn() },
  motivos_baja: { findFirst: jest.fn() },
  destinos: { findMany: jest.fn() },
  funcionarios_convocatorias: { findMany: jest.fn() },
  funcionarios_cursos: { findMany: jest.fn() },
  relaciones_familiares: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  ascensos: { findMany: jest.fn() },
  relaciones_laborales: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
  retiros: { findMany: jest.fn() },
  legajo_militar: { findUnique: jest.fn(), upsert: jest.fn() },
  $transaction: jest.fn(),
});

describe('PersonalPerfilService', () => {
  let service: PersonalPerfilService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let cierre: { cerrar: jest.Mock };
  let derecha: {
    ascenderEnTransaccion: jest.Mock;
    cambiarEscalafonEnTransaccion: jest.Mock;
    moverAValoresEnTransaccion: jest.Mock;
    bloquearEnTransaccion: jest.Mock;
  };

  beforeAll(async () => {
    prisma = makePrismaMock();
    cierre = { cerrar: jest.fn() };
    derecha = {
      ascenderEnTransaccion: jest.fn(),
      cambiarEscalafonEnTransaccion: jest.fn(),
      moverAValoresEnTransaccion: jest.fn(),
      bloquearEnTransaccion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonalPerfilService,
        { provide: PrismaService, useValue: prisma },
        { provide: CierreCarreraService, useValue: cierre },
        { provide: DerechaService, useValue: derecha },
      ],
    }).compile();

    service = module.get<PersonalPerfilService>(PersonalPerfilService);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    // update() guarda datos personales, relacion laboral y legajo en una sola
    // transaccion, asi que el mock tiene que ejecutar el callback.
    prisma.$transaction.mockImplementation((arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    );
  });

  describe('findDestinos', () => {
    beforeEach(() => {
      prisma.personas.findUnique.mockResolvedValue({ id: 100n });
      prisma.destinos.findMany.mockResolvedValue([]);
    });

    it('rechaza si la persona no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.findDestinos(999)).rejects.toThrow(NotFoundException);
    });

    it('con alcance de unidad rechaza con 404 a una persona fuera de sus bases (SCRUM-163)', async () => {
      prisma.personas.findFirst.mockResolvedValue(null);

      await expect(
        service.findDestinos(100, { tipo: 'unidad', subUnidadIds: ['1'], comandoIds: ['1'] }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.destinos.findMany).not.toHaveBeenCalled();
    });

    it('con alcance de unidad devuelve los destinos de una persona de sus bases (SCRUM-163)', async () => {
      prisma.personas.findFirst.mockResolvedValue({ id: 100n });
      prisma.destinos.findMany.mockResolvedValue([makeAsignacion()]);

      const result = await service.findDestinos(100, { tipo: 'unidad', subUnidadIds: ['17'], comandoIds: ['5'] });

      expect(result).toHaveLength(1);
      expect(prisma.personas.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            relaciones_laborales: { some: { fecha_fin: null, sub_unidad_id: { in: [17n] } } },
          }),
        }),
      );
    });

    it('devuelve el historial de destinos del funcionario', async () => {
      prisma.destinos.findMany.mockResolvedValue([makeAsignacion()]);

      const result = await service.findDestinos(100);

      expect(result).toEqual([
        {
          id: '200',
          unidad_id: '5',
          unidad: 'C.G.',
          codigo_unidad: 'CG',
          sub_unidad_id: '17',
          sub_unidad: 'D.C.G.',
          codigo_sub_unidad: 'DCG',
          posicion_destino: 'Sub-Jefe de Personal A-1',
          fecha_inicio: '2024-04-30',
          fecha_fin: null,
          numero_orden: 'O.D. 11007',
          boletin: null,
          observaciones: null,
          activo: true,
          documentos: { orden: null, boletin: null },
        },
      ]);
    });

    it('findDestinos devuelve documentos de cada asignación', async () => {
      const subido_en = new Date('2026-11-06T12:00:00Z');
      const orden = { nombre_original: 'orden.pdf', content_type: 'application/pdf', tamanio_bytes: 8n, subido_en };
      prisma.destinos.findMany.mockResolvedValue([makeAsignacion({ archivo_orden: orden, archivo_boletin: null })]);

      const result = await service.findDestinos(100);

      expect(result[0].documentos).toEqual({ orden, boletin: null });
      expect(prisma.destinos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({ archivo_orden: expect.anything(), archivo_boletin: expect.anything() }),
        }),
      );
    });

    it('marca como no activo el destino ya cerrado', async () => {
      prisma.destinos.findMany.mockResolvedValue([
        makeAsignacion({ fecha_fin: new Date('2026-08-31') }),
      ]);

      const result = await service.findDestinos(100);

      expect(result[0].activo).toBe(false);
      expect(result[0].fecha_fin).toBe('2026-08-31');
    });

    it('ordena del destino más reciente al más antiguo', async () => {
      await service.findDestinos(100);

      expect(prisma.destinos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { persona_id: 100n },
          orderBy: { fecha_inicio: 'desc' },
        }),
      );
    });
  });

  describe('findFamiliares', () => {
    beforeEach(() => {
      prisma.personas.findUnique.mockResolvedValue({ id: 31n });
      prisma.relaciones_familiares.findMany.mockResolvedValue([]);
    });

    it('rechaza si la persona no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.findFamiliares(999)).rejects.toThrow(NotFoundException);
    });

    it('consulta relaciones en ambos sentidos (persona_id o familiar_id)', async () => {
      await service.findFamiliares(31);

      expect(prisma.relaciones_familiares.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ persona_id: 31n }, { familiar_id: 31n }] },
        }),
      );
    });

    it('devuelve el familiar tal cual cuando la persona consultada dio de alta el vínculo', async () => {
      prisma.relaciones_familiares.findMany.mockResolvedValue([makeRelacion()]);

      const result = await service.findFamiliares(31);

      expect(result).toEqual([
        {
          id: 16,
          cedula: '60000016',
          nombre_completo: 'Laura Cecilia Acosta Ferreira',
          tipo_relacion: 'Madre',
          grado: null,
          unidad: null,
          sub_unidad: null,
        },
      ]);
    });

    it('invierte el vínculo cuando la persona consultada es la familiar del registro', async () => {
      prisma.relaciones_familiares.findMany.mockResolvedValue([makeRelacion()]);

      const result = await service.findFamiliares(16);

      expect(result).toEqual([
        expect.objectContaining({ id: 31, cedula: '12345678', tipo_relacion: 'Hijo/a' }),
      ]);
    });

    it('invierte "Hijo/a" según el género de la persona consultada', async () => {
      prisma.relaciones_familiares.findMany.mockResolvedValue([
        makeRelacion({
          tipo_relacion: 'Hijo/a',
          personas_relaciones_familiares_familiar_idTopersonas: makePersonaFamiliar({ genero: 'M' }),
        }),
      ]);

      const result = await service.findFamiliares(16);

      expect(result[0].tipo_relacion).toBe('Padre');
    });

    it('mantiene vínculos simétricos como Cónyuge y Hermano/a en ambos sentidos', async () => {
      prisma.relaciones_familiares.findMany.mockResolvedValue([
        makeRelacion({ tipo_relacion: 'Cónyuge' }),
      ]);

      const result = await service.findFamiliares(16);

      expect(result[0].tipo_relacion).toBe('Cónyuge');
    });
  });

  describe('findFamiliaresPorCedula', () => {
    it('rechaza si no existe ninguna persona con esa cédula', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.findFamiliaresPorCedula('00000000')).rejects.toThrow(NotFoundException);
    });

    it('resuelve la cédula al id interno y devuelve sus familiares', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 31n });
      prisma.relaciones_familiares.findMany.mockResolvedValue([makeRelacion()]);

      const result = await service.findFamiliaresPorCedula('12345678');

      expect(prisma.personas.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { cedula: '12345678' } }),
      );
      expect(result).toEqual([
        expect.objectContaining({ id: 16, cedula: '60000016', tipo_relacion: 'Madre' }),
      ]);
    });
  });

  describe('buscarCandidatosFamiliar', () => {
    const fila = (over: Record<string, unknown> = {}) => ({
      id: 16n, cedula: '60000016', primer_nombre: 'Laura', segundo_nombre: null, primer_apellido: 'Acosta',
      segundo_apellido: 'Ferreira', es_civil: false, relaciones_laborales: [{ grados: { denominacion: 'Sgto.' } }],
      ...over,
    });

    it('con alcance global trae militares en actividad y civiles, sin la persona misma', async () => {
      prisma.personas.findMany.mockResolvedValue([
        fila(),
        fila({ id: 17n, cedula: '50000017', primer_nombre: 'Ana', es_civil: true, relaciones_laborales: [] }),
      ]);

      const r = await service.buscarCandidatosFamiliar('acosta', 31);

      const { where, take } = prisma.personas.findMany.mock.calls[0][0];
      expect(take).toBe(10);
      expect(where.AND[0]).toEqual({
        OR: [{ relaciones_laborales: { some: expect.objectContaining({ fecha_fin: null }) } }, { es_civil: true }],
      });
      expect(where.AND[1]).toEqual({ id: { not: 31n } });
      expect(r).toEqual([
        { id: '16', cedula: '60000016', nombre: 'Laura Acosta Ferreira', es_civil: false, grado: 'Sgto.' },
        { id: '17', cedula: '50000017', nombre: 'Ana Acosta Ferreira', es_civil: true, grado: null },
      ]);
    });

    it('con alcance de unidad solo ofrece militares de sus bases, sin civiles', async () => {
      prisma.personas.findMany.mockResolvedValue([]);

      await service.buscarCandidatosFamiliar('acosta', undefined, {
        tipo: 'unidad', subUnidadIds: ['3'], comandoIds: ['1'],
      } as any);

      const { where } = prisma.personas.findMany.mock.calls[0][0];
      expect(where.AND[0]).not.toHaveProperty('OR');
      expect(where.AND[0].relaciones_laborales.some.sub_unidad_id).toEqual({ in: [3n] });
    });

    it('cada palabra tiene que aparecer en algún campo', async () => {
      prisma.personas.findMany.mockResolvedValue([]);
      await service.buscarCandidatosFamiliar('laura acosta');
      expect(prisma.personas.findMany.mock.calls[0][0].where.AND).toHaveLength(3);
    });
  });

  describe('addFamiliar', () => {
    const mockAncla = (familiar: any) => {
      prisma.personas.findUnique.mockImplementation(({ where }: any) =>
        where.id !== undefined
          ? Promise.resolve({ id: 31n })
          : Promise.resolve(familiar),
      );
    };

    beforeEach(() => {
      prisma.relaciones_familiares.findFirst.mockResolvedValue(null);
      prisma.relaciones_familiares.create.mockResolvedValue({});
    });

    it('rechaza si la persona anfitriona no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.addFamiliar(999, { cedula: '60000016' })).rejects.toThrow(NotFoundException);
    });

    it('rechaza si no existe ningún registrado con esa cédula', async () => {
      mockAncla(null);

      await expect(service.addFamiliar(31, { cedula: '00000000' })).rejects.toThrow(BadRequestException);
    });

    it('acepta un familiar civil', async () => {
      mockAncla({ id: 16n, cedula: '60000016', primer_nombre: 'Laura', primer_apellido: 'Acosta', es_civil: true });

      const r = await service.addFamiliar(31, { cedula: '60000016', tipo_relacion: 'Cónyuge' });

      expect(prisma.relaciones_familiares.create).toHaveBeenCalledWith({
        data: { persona_id: 31n, familiar_id: 16n, tipo_relacion: 'Cónyuge' },
      });
      expect(r).toMatchObject({ id: 16, cedula: '60000016' });
    });

    it('rechaza vincularse a sí mismo', async () => {
      mockAncla({ id: 31n, cedula: '12345678', primer_nombre: 'Sofía', primer_apellido: 'Guerrico', es_civil: false });

      await expect(service.addFamiliar(31, { cedula: '12345678' })).rejects.toThrow(BadRequestException);
    });

    it('rechaza un vínculo ya existente, sin importar la dirección en que se guardó', async () => {
      mockAncla({ id: 16n, cedula: '60000016', primer_nombre: 'Laura', primer_apellido: 'Acosta', es_civil: false });
      prisma.relaciones_familiares.findFirst.mockResolvedValue({ persona_id: 16n, familiar_id: 31n });

      await expect(service.addFamiliar(31, { cedula: '60000016' })).rejects.toThrow(ConflictException);
      expect(prisma.relaciones_familiares.create).not.toHaveBeenCalled();
    });

    it('crea el vínculo y devuelve el familiar agregado', async () => {
      mockAncla({ id: 16n, cedula: '60000016', primer_nombre: 'Laura', primer_apellido: 'Acosta', es_civil: false });

      const result = await service.addFamiliar(31, { cedula: '60000016', tipo_relacion: 'Madre' });

      expect(prisma.relaciones_familiares.create).toHaveBeenCalledWith({
        data: { persona_id: 31n, familiar_id: 16n, tipo_relacion: 'Madre' },
      });
      expect(result).toEqual({
        id: 16, cedula: '60000016', nombre_completo: 'Laura Acosta', tipo_relacion: 'Madre', grado: null, unidad: null,
      });
    });
  });

  describe('removeFamiliar', () => {
    it('rechaza si la persona no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.removeFamiliar(999, 16)).rejects.toThrow(NotFoundException);
    });

    it('rechaza si no existe ese vínculo', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 31n });
      prisma.relaciones_familiares.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.removeFamiliar(31, 16)).rejects.toThrow(NotFoundException);
    });

    it('elimina el vínculo sin importar en qué dirección quedó guardado', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 31n });
      prisma.relaciones_familiares.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeFamiliar(31, 16);

      expect(prisma.relaciones_familiares.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ persona_id: 31n, familiar_id: 16n }, { persona_id: 16n, familiar_id: 31n }] },
      });
    });
  });

  // ─── findHistorialMilitar: retiros pasa de 1:1 a historial ─────────────────

  describe('findHistorialMilitar — retiros', () => {
    beforeEach(() => {
      prisma.personas.findUnique.mockResolvedValue({ id: 100n });
      prisma.ascensos.findMany.mockResolvedValue([]);
      prisma.relaciones_laborales.findFirst.mockResolvedValue(null);
    });

    it('devuelve un array de retiros, mas reciente primero, sin anulados', async () => {
      prisma.retiros.findMany.mockResolvedValue([
        {
          id: 2n,
          fecha_retiro: new Date('2026-08-31'),
          hora_retiro: null,
          motivo: 'Segundo retiro',
          motivos_baja: { codigo: 'RETIRO_VOL', denominacion: 'Baja por retiro voluntario.' },
          relaciones_laborales: { estado: 'inactivo' },
        },
      ]);

      const result = await service.findHistorialMilitar(100);

      expect(prisma.retiros.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { persona_id: 100n, anulado: false },
          orderBy: { fecha_retiro: 'desc' },
        }),
      );
      expect(result.retiros).toHaveLength(1);
      expect(result.retiros[0]).toMatchObject({
        id: '2',
        fecha_retiro: '2026-08-31',
        motivo_baja: { codigo: 'RETIRO_VOL' },
      });
      expect(result).not.toHaveProperty('retiro');
    });

    const retiroSimple = (id: bigint, fecha: string) => ({
      id,
      fecha_retiro: new Date(fecha),
      hora_retiro: null,
      motivo: null,
      motivos_baja: null,
    });

    it('marca vigente el retiro si la persona no volvio al servicio', async () => {
      prisma.retiros.findMany.mockResolvedValue([retiroSimple(2n, '2026-08-31')]);
      prisma.relaciones_laborales.findFirst.mockResolvedValue(null);

      const result = await service.findHistorialMilitar(100);

      expect(result.retiros[0].vigente).toBe(true);
    });

    it('marca NO vigente el retiro de alguien que se reincorporo', async () => {
      prisma.retiros.findMany.mockResolvedValue([retiroSimple(1n, '2020-01-01')]);
      // findFirst se usa para la primera relación y para la activa de hoy.
      prisma.relaciones_laborales.findFirst.mockResolvedValue({ id: 46n });

      const result = await service.findHistorialMilitar(100);

      expect(result.retiros[0].vigente).toBe(false);
    });

    it('con varios retiros solo el mas reciente puede estar vigente', async () => {
      prisma.retiros.findMany.mockResolvedValue([
        retiroSimple(2n, '2026-08-31'),
        retiroSimple(1n, '2020-01-01'),
      ]);
      prisma.relaciones_laborales.findFirst.mockResolvedValue(null);

      const result = await service.findHistorialMilitar(100);

      expect(result.retiros.map((r: any) => r.vigente)).toEqual([true, false]);
    });

    it('devuelve un array vacio si la persona nunca se retiro', async () => {
      prisma.retiros.findMany.mockResolvedValue([]);

      const result = await service.findHistorialMilitar(100);

      expect(result.retiros).toEqual([]);
    });
  });
  // ─── PATCH /personas/:id: el fallecimiento cierra la carrera ───────────────

  describe('update — derecha y numor', () => {
    beforeEach(() => {
      prisma.personas.findUnique.mockResolvedValue({
        id: 100n,
        fecha_nacimiento: new Date('1980-01-01'),
        relaciones_laborales: [
          { id: 45n, fecha_inicio: new Date('2010-03-01'), grado_id: 4n, escalafon_id: 13n },
        ],
      });
      prisma.personas.update.mockResolvedValue({ id: 100n });
      prisma.relaciones_laborales.update.mockResolvedValue({ id: 45n });
      prisma.relaciones_laborales.count.mockResolvedValue(1);
    });

    it('un cambio de grado mueve la derecha al final del grado nuevo antes de tocar la relación', async () => {
      await service.update(100, { grado_id: 5 } as any, 7n);

      expect(derecha.ascenderEnTransaccion).toHaveBeenCalledWith(
        prisma,
        100n,
        5n,
        { escalafonDestinoId: null },
        { motivo: 'Edición del legajo', usuarioId: 7n },
      );
      expect(derecha.ascenderEnTransaccion.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.relaciones_laborales.update.mock.invocationCallOrder[0],
      );
    });

    it('si también cambia el escalafón, el numor entra en el grupo nuevo', async () => {
      await service.update(100, { grado_id: 5, escalafon_id: 14 } as any, 7n);

      expect(derecha.ascenderEnTransaccion.mock.calls[0][3]).toEqual({ escalafonDestinoId: 14n });
      expect(derecha.cambiarEscalafonEnTransaccion).not.toHaveBeenCalled();
    });

    it('un cambio solo de escalafón mueve el numor y deja la derecha', async () => {
      await service.update(100, { escalafon_id: 14 } as any, 7n);

      expect(derecha.cambiarEscalafonEnTransaccion).toHaveBeenCalledWith(
        prisma,
        100n,
        14n,
        null,
        { motivo: 'Edición del legajo', usuarioId: 7n },
      );
      expect(derecha.ascenderEnTransaccion).not.toHaveBeenCalled();
    });

    it('edita la derecha y el numor con el permiso, en la misma transacción', async () => {
      prisma.personas.findUnique.mockResolvedValue({
        id: 100n,
        fecha_nacimiento: new Date('1980-01-01'),
        relaciones_laborales: [
          { id: 45n, fecha_inicio: new Date('2010-03-01'), grado_id: 4n, escalafon_id: 13n, derecha: 8, numor: 3 },
        ],
      });

      await service.update(
        100,
        { derecha: 6, numor: 3, motivo_derecha: 'Boletín 12' } as any,
        7n,
        undefined,
        ['derecha.gestionar'],
      );

      expect(derecha.moverAValoresEnTransaccion).toHaveBeenCalledWith(
        prisma,
        100n,
        { derecha: 6, numor: null },
        { motivo: 'Boletín 12', usuarioId: 7n },
      );
    });

    it('sin derecha.gestionar no deja cambiar la derecha', async () => {
      prisma.personas.findUnique.mockResolvedValue({
        id: 100n,
        fecha_nacimiento: new Date('1980-01-01'),
        relaciones_laborales: [
          { id: 45n, fecha_inicio: new Date('2010-03-01'), grado_id: 4n, escalafon_id: 13n, derecha: 8, numor: 3 },
        ],
      });

      await expect(service.update(100, { derecha: 6 } as any, 7n)).rejects.toThrow(ForbiddenException);
      expect(prisma.personas.update).not.toHaveBeenCalled();
    });

    it('mandar la misma derecha y numor no es un cambio ni pide permiso', async () => {
      prisma.personas.findUnique.mockResolvedValue({
        id: 100n,
        fecha_nacimiento: new Date('1980-01-01'),
        relaciones_laborales: [
          { id: 45n, fecha_inicio: new Date('2010-03-01'), grado_id: 4n, escalafon_id: 13n, derecha: 8, numor: 3 },
        ],
      });

      await service.update(100, { derecha: 8, numor: 3, telefono: '099' } as any, 7n);

      expect(derecha.moverAValoresEnTransaccion).not.toHaveBeenCalled();
    });

    it('sin cambio de grado ni escalafón no toca la derecha', async () => {
      await service.update(100, { grado_id: 4, escalafon_id: 13, telefono: '099' } as any, 7n);

      expect(derecha.ascenderEnTransaccion).not.toHaveBeenCalled();
      expect(derecha.cambiarEscalafonEnTransaccion).not.toHaveBeenCalled();
    });
  });

  // La base y el comando se cambian solo con un traslado: el PATCH de la persona no los toca.
  describe('update — base y comando', () => {
    beforeEach(() => {
      prisma.personas.findUnique.mockResolvedValue({
        id: 100n,
        fecha_nacimiento: new Date('1980-01-01'),
        relaciones_laborales: [
          { id: 45n, fecha_inicio: new Date('2010-03-01'), grado_id: 4n, escalafon_id: 13n, situacion_id: 7n },
        ],
      });
      prisma.personas.update.mockResolvedValue({ id: 100n });
      prisma.relaciones_laborales.update.mockResolvedValue({ id: 45n });
    });

    it('editar grado y observaciones actualiza la relación activa sin escribir unidad ni base', async () => {
      await service.update(
        100,
        { grado_id: 4, situacion_id: 7, observaciones_laborales: 'Pase a comisión' } as any,
        7n,
      );

      const { where, data } = prisma.relaciones_laborales.update.mock.calls[0][0];
      expect(where).toEqual({ id: 45n });
      // La situación que ya tenía se acepta y no se escribe.
      expect(data).toEqual({ grado_id: 4n, observaciones: 'Pase a comisión' });
      expect(data).not.toHaveProperty('unidad_id');
      expect(data).not.toHaveProperty('sub_unidad_id');
      expect(prisma.personas.update.mock.calls[0][0].data).not.toHaveProperty('unidad_id');
    });

    it('una situación distinta no se edita en el lugar: se cambia con POST /personas/:id/situacion', async () => {
      await expect(service.update(100, { situacion_id: 3 } as any, 7n)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(prisma.personas.update).not.toHaveBeenCalled();
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
    });

    it('aunque llegue unidad_id o sub_unidad_id, no se guardan', async () => {
      await service.update(100, { grado_id: 4, unidad_id: 9, sub_unidad_id: 30 } as any, 7n);

      const { data } = prisma.relaciones_laborales.update.mock.calls[0][0];
      expect(data).not.toHaveProperty('unidad_id');
      expect(data).not.toHaveProperty('sub_unidad_id');
    });

    it('el DTO no acepta unidad_id ni sub_unidad_id', async () => {
      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
      const meta = { type: 'body' as const, metatype: UpdatePersonalDto };

      await expect(pipe.transform({ unidad_id: 9 }, meta)).rejects.toThrow(BadRequestException);
      await expect(pipe.transform({ sub_unidad_id: 30 }, meta)).rejects.toThrow(BadRequestException);
      await expect(pipe.transform({ telefono: '099' }, meta)).resolves.toBeDefined();
    });
  });

  describe('update — cédula y tipo de funcionario', () => {
    beforeEach(() => {
      prisma.personas.findUnique.mockResolvedValue({
        id: 100n,
        cedula: '12345678',
        es_civil: false,
        fecha_nacimiento: new Date('1980-01-01'),
        relaciones_laborales: [
          { id: 45n, fecha_inicio: new Date('2010-03-01'), grado_id: 4n, escalafon_id: 13n, tipo_funcionario: 'oficial' },
        ],
      });
      prisma.personas.findFirst.mockResolvedValue(null);
      prisma.personas.update.mockResolvedValue({ id: 100n });
      prisma.relaciones_laborales.update.mockResolvedValue({ id: 45n });
      prisma.relaciones_laborales.count.mockResolvedValue(0);
    });

    it('cambia la cédula si no la tiene otra persona', async () => {
      await service.update(100, { cedula: '87654321' } as any, 7n);

      expect(prisma.personas.findFirst).toHaveBeenCalledWith({
        where: { cedula: '87654321', id: { not: 100n } },
        select: { id: true },
      });
      expect(prisma.personas.update.mock.calls[0][0].data).toMatchObject({ cedula: '87654321' });
    });

    it('rechaza una cédula que ya tiene otra persona', async () => {
      prisma.personas.findFirst.mockResolvedValue({ id: 200n });

      await expect(service.update(100, { cedula: '87654321' } as any, 7n)).rejects.toThrow(ConflictException);
      expect(prisma.personas.update).not.toHaveBeenCalled();
    });

    it('la misma cédula no se vuelve a escribir ni se busca', async () => {
      await service.update(100, { cedula: '12345678', telefono: '099' } as any, 7n);

      expect(prisma.personas.findFirst).not.toHaveBeenCalled();
      expect(prisma.personas.update.mock.calls[0][0].data).not.toHaveProperty('cedula');
    });

    it('el DTO rechaza una cédula con puntos', async () => {
      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
      const meta = { type: 'body' as const, metatype: UpdatePersonalDto };
      await expect(pipe.transform({ cedula: '1.234.567-8' }, meta)).rejects.toThrow(BadRequestException);
      await expect(pipe.transform({ tipo_funcionario: 'civil' }, meta)).rejects.toThrow(BadRequestException);
    });

    it('pasar de oficial a subalterno con un grado subalterno actualiza la relación y borra los códigos', async () => {
      prisma.grados.findUnique.mockResolvedValue({ denominacion: 'Sgto.', es_oficial: false, es_subalterno: true });

      await service.update(100, { tipo_funcionario: 'subalterno', grado_id: 20, codigos_legajo: '-1-4-' } as any, 7n);

      const { data } = prisma.relaciones_laborales.update.mock.calls[0][0];
      expect(data).toMatchObject({ tipo_funcionario: 'subalterno', grado_id: 20n, codigos_legajo: null });
    });

    it('cambiar el tipo dejando un grado del tipo anterior se rechaza', async () => {
      prisma.grados.findUnique.mockResolvedValue({ denominacion: 'Cap.', es_oficial: true, es_subalterno: false });

      await expect(service.update(100, { tipo_funcionario: 'subalterno' } as any, 7n)).rejects.toThrow(BadRequestException);
      expect(prisma.grados.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 4n } }));
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
    });

    it('a un civil no se le puede poner tipo de funcionario', async () => {
      prisma.personas.findUnique.mockResolvedValue({
        id: 100n, cedula: '12345678', es_civil: true, fecha_nacimiento: null,
        relaciones_laborales: [{ id: 45n, fecha_inicio: new Date('2010-03-01'), grado_id: 4n, tipo_funcionario: null }],
      });

      await expect(service.update(100, { tipo_funcionario: 'oficial' } as any, 7n)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update — fallecimiento', () => {
    beforeEach(() => {
      prisma.personas.findUnique.mockResolvedValue({
        id: 100n,
        fecha_nacimiento: new Date('1980-01-01'),
        relaciones_laborales: [{ id: 45n, fecha_inicio: new Date('2010-03-01') }],
      });
      prisma.personas.update.mockResolvedValue({ id: 100n });
      prisma.relaciones_laborales.update.mockResolvedValue({ id: 45n });
      prisma.relaciones_laborales.findFirst.mockResolvedValue({ id: 45n });
      prisma.motivos_baja.findFirst.mockResolvedValue({ id: 4n });
      cierre.cerrar.mockResolvedValue({ retiroId: 90n, cerrado: {} });
    });

    it('al setear fecha_fallecimiento cierra la carrera con cascada forzada', async () => {
      await service.update(100, { fecha_fallecimiento: '2026-08-30' } as any, 7n);

      expect(cierre.cerrar).toHaveBeenCalledWith(
        expect.objectContaining({
          personaId: 100,
          fechaRetiro: new Date('2026-08-30'),
          motivoBajaId: 4,
          autorId: 7n,
          forzarCascada: true,
        }),
      );
    });

    it('escribe fecha_fallecimiento en la persona', async () => {
      await service.update(100, { fecha_fallecimiento: '2026-08-30' } as any, 7n);

      expect(prisma.personas.update.mock.calls[0][0].data).toMatchObject({
        fecha_fallecimiento: new Date('2026-08-30'),
      });
    });

    it('si la persona ya estaba retirada solo setea el campo', async () => {
      prisma.relaciones_laborales.findFirst.mockResolvedValue(null);

      await service.update(100, { fecha_fallecimiento: '2026-08-30' } as any, 7n);

      expect(cierre.cerrar).not.toHaveBeenCalled();
      expect(prisma.personas.update).toHaveBeenCalled();
    });

    it('no dispara nada si el PATCH no trae fecha_fallecimiento', async () => {
      await service.update(100, { telefono: '099123456' } as any, 7n);

      expect(cierre.cerrar).not.toHaveBeenCalled();
    });

    it('con fecha_fallecimiento null la borra, no guarda 1970-01-01', async () => {
      await service.update(100, { fecha_fallecimiento: null } as any, 7n);

      expect(prisma.personas.update.mock.calls[0][0].data.fecha_fallecimiento).toBeNull();
      expect(cierre.cerrar).not.toHaveBeenCalled();
    });

    it('400 si el fallecimiento es anterior al nacimiento', async () => {
      await expect(service.update(100, { fecha_fallecimiento: '1970-01-01' } as any, 7n)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.personas.update).not.toHaveBeenCalled();
    });

    it('400 si el fallecimiento es anterior al inicio de la relación vigente o futuro', async () => {
      await expect(service.update(100, { fecha_fallecimiento: '2005-01-01' } as any, 7n)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update(100, { fecha_fallecimiento: '2099-01-01' } as any, 7n)).rejects.toThrow(
        BadRequestException,
      );
      expect(cierre.cerrar).not.toHaveBeenCalled();
    });

    it('el DTO rechaza un primer nombre de solo espacios y recorta los demás', async () => {
      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
      const meta = { type: 'body' as const, metatype: UpdatePersonalDto };

      await expect(pipe.transform({ primer_nombre: '   ' }, meta)).rejects.toThrow(BadRequestException);
      await expect(pipe.transform({ primer_apellido: '' }, meta)).rejects.toThrow(BadRequestException);
      await expect(pipe.transform({ primer_nombre: '  Juan ' }, meta)).resolves.toMatchObject({ primer_nombre: 'Juan' });
    });
  });

  describe('findCursos', () => {
    beforeEach(() => {
      prisma.personas.findUnique.mockResolvedValue({ id: 100n });
    });

    it('devuelve el id de la inscripción y sus documentos', async () => {
      const boletin = { nombre_original: 'b.pdf', content_type: 'application/pdf', tamanio_bytes: 8n, subido_en: new Date() };
      prisma.funcionarios_cursos.findMany.mockResolvedValue([
        {
          id: 400n,
          numero_orden: null,
          boletin: 'B-1',
          fecha_inicio: null,
          fecha_fin: null,
          aprobado: null,
          calificacion: null,
          observacion_calificacion: null,
          archivo_orden: null,
          archivo_boletin: boletin,
          cursos: { id: 3n, nombre_curso: 'Supervivencia', institucion: 'EMA', es_obligatorio: false },
        },
      ]);

      const result = await service.findCursos(100);

      expect(result[0]).toMatchObject({
        id: '400',
        curso_id: 3,
        documentos: { orden: null, boletin },
      });
      const select = prisma.funcionarios_cursos.findMany.mock.calls[0][0].select;
      expect(select).toEqual(
        expect.objectContaining({ id: true, archivo_orden: expect.anything(), archivo_boletin: expect.anything() }),
      );
    });
  });

  describe('findMisiones', () => {
    beforeEach(() => {
      prisma.personas.findUnique.mockResolvedValue({ id: 100n });
    });

    it('devuelve id de la asignación, sus documentos y los de la convocatoria', async () => {
      const orden = { nombre_original: 'o.pdf', content_type: 'application/pdf', tamanio_bytes: 8n, subido_en: new Date() };
      const boletin = { nombre_original: 'b.pdf', content_type: 'application/pdf', tamanio_bytes: 8n, subido_en: new Date() };
      prisma.funcionarios_convocatorias.findMany.mockResolvedValue([
        {
          id: 300n,
          convocatoria_id: 10n,
          numero_orden: 'O-1',
          boletin: null,
          archivo_orden: orden,
          archivo_boletin: null,
          convocatorias: {
            fecha_salida: null,
            fecha_llegada: null,
            archivo_orden: null,
            archivo_boletin: boletin,
            misiones: { id: 1n, nombre_mision: 'Congo', pais: 'RDC' },
          },
        },
      ]);

      const result = await service.findMisiones(100);

      expect(result[0]).toMatchObject({
        id: '300',
        documentos: { orden, boletin: null },
        documentos_convocatoria: { orden: null, boletin },
      });
      const include = prisma.funcionarios_convocatorias.findMany.mock.calls[0][0].include;
      expect(include).toEqual(expect.objectContaining({ archivo_orden: expect.anything(), archivo_boletin: expect.anything() }));
      expect(include.convocatorias.include).toEqual(expect.objectContaining({ archivo_orden: expect.anything(), archivo_boletin: expect.anything() }));
    });
  });
  describe('findOne — códigos del legajo (SCRUM-159)', () => {
    it('devuelve los códigos del legajo de la relación vigente', async () => {
      prisma.personas.findUnique.mockResolvedValue({
        id: 71n, cedula: '12345678', primer_nombre: 'Ana', segundo_nombre: null,
        primer_apellido: 'Paz', segundo_apellido: null, es_civil: false, legajo_militar: null,
        relaciones_laborales: [{ id: 9n, tipo_funcionario: 'oficial', codigos_legajo: '-1-4-7-8-' }],
      });

      const r: any = await service.findOne(71);

      expect(r.relacion_laboral.codigos_legajo).toBe('-1-4-7-8-');
      const select = prisma.personas.findUnique.mock.calls[0][0].select;
      expect(select.relaciones_laborales.select.codigos_legajo).toBe(true);
    });
  });

  describe('update — campos según el tipo de funcionario (SCRUM-196, SCRUM-179)', () => {
    const conTipo = (tipo: string | null) =>
      prisma.personas.findUnique.mockResolvedValue({
        id: 100n,
        fecha_nacimiento: new Date('1980-01-01'),
        relaciones_laborales: tipo
          ? [{ id: 45n, fecha_inicio: new Date('2010-03-01'), grado_id: 4n, escalafon_id: 13n, tipo_funcionario: tipo }]
          : [],
      });

    beforeEach(() => {
      prisma.personas.update.mockResolvedValue({ id: 100n });
      prisma.relaciones_laborales.update.mockResolvedValue({ id: 45n });
    });

    it('rechaza el nivel de idoneidad a un oficial', async () => {
      conTipo('oficial');
      await expect(service.update(100, { nivel_idoneidad: 7 } as any, 7n)).rejects.toThrow(BadRequestException);
      expect(prisma.personas.update).not.toHaveBeenCalled();
    });

    it('rechaza el nivel de idoneidad a un civil', async () => {
      conTipo(null);
      await expect(service.update(100, { nivel_idoneidad: 7 } as any, 7n)).rejects.toThrow(BadRequestException);
    });

    it('rechaza los códigos del legajo a un subalterno', async () => {
      conTipo('subalterno');
      await expect(service.update(100, { codigos_legajo: '-1-' } as any, 7n)).rejects.toThrow(BadRequestException);
    });

    it('acepta null en los campos que no corresponden (borrar el dato)', async () => {
      conTipo('subalterno');
      await service.update(100, { nivel_idoneidad: 5, codigos_legajo: null } as any, 7n);
      expect(prisma.personas.update).toHaveBeenCalled();
    });

    it('el DTO rechaza un código postal de más de 10 caracteres (SCRUM-187)', async () => {
      const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
      const meta = { type: 'body' as const, metatype: UpdatePersonalDto };

      await expect(pipe.transform({ codigo_postal: '12345678901' }, meta)).rejects.toThrow(BadRequestException);
      await expect(pipe.transform({ codigo_postal: '1234567890' }, meta)).resolves.toBeDefined();
    });

    it('rechaza pasar a un oficial a un grado de subalterno', async () => {
      conTipo('oficial');
      prisma.grados.findUnique.mockResolvedValue({ denominacion: 'Sargento', es_oficial: false, es_subalterno: true });
      await expect(service.update(100, { grado_id: 5 } as any, 7n)).rejects.toThrow(BadRequestException);
      expect(derecha.ascenderEnTransaccion).not.toHaveBeenCalled();
    });
  });
});
