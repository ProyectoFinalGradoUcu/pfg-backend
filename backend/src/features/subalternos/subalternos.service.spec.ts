import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SubalternosService } from './subalternos.service';

describe('SubalternosService', () => {
  let service: SubalternosService;
  let prisma: any;
  let derecha: { asignarEnAltaEnTransaccion: jest.Mock };

  beforeEach(() => {
    derecha = { asignarEnAltaEnTransaccion: jest.fn() };
    prisma = {
      personas: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 1n, cedula: '12345678' }),
        update: jest.fn().mockResolvedValue({
          id: 1n,
          cedula: '12345678',
          direccion: 'Av. Italia 1234',
          telefono: '099123456',
        }),
        delete: jest.fn(),
      },
      relaciones_laborales: {
        // Con los catálogos incluidos, como los devuelve el `include` del create.
        create: jest.fn().mockResolvedValue({
          id: 10n,
          estado: 'activo',
          tipo_funcionario: 'subalterno',
          escalafones: { denominacion: 'Comando y Aire' },
          grados: { denominacion: 'Sargento' },
          unidades: { denominacion: 'Brigada Aérea I' },
          programas: { denominacion: 'Programa 001' },
          situaciones: { denominacion: 'Actividad' },
          regimenes: { denominacion: 'Militar' },
          sub_unidades: null,
        }),
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ derecha: 7, numor: 2 }),
      },
      destinos: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      legajo_militar: { deleteMany: jest.fn() },
      registros_vuelo: { deleteMany: jest.fn() },
      relaciones_familiares: { count: jest.fn().mockResolvedValue(0) },
      personas_documentos: { deleteMany: jest.fn() },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    service = new SubalternosService(prisma, derecha as any);
  });

  const dto = {
    cedula: '12345678',
    primer_nombre: 'Juan',
    primer_apellido: 'Perez',
    fecha_inicio: '2024-01-15',
    regimen_id: 1,
    unidad_id: 1,
    programa_id: 1,
    situacion_id: 1,
    escalafon_id: 1,
    grado_id: 6,
  };

  // ─── findAllPersonas ────────────────────────────────────────────────────────
  // El campo `destino` sale del módulo de destinos (la fila vigente de la tabla
  // `destinos`), no de la unidad de la relación laboral: esa última la escribe
  // liquidación y el seed, y no refleja dónde revista el funcionario.

  describe('findAllPersonas · destino', () => {
    const makePersona = (overrides: any = {}) => ({
      id: 1n,
      cedula: '41234567',
      primer_nombre: 'Martín',
      segundo_nombre: null,
      primer_apellido: 'González',
      segundo_apellido: null,
      relaciones_laborales: [
        {
          grados: { denominacion: 'Sargento' },
          situaciones: { denominacion: 'Actividad' },
        },
      ],
      destinos: [{ unidades: { denominacion: 'E.M.G.F.A.' } }],
      ...overrides,
    });

    beforeEach(() => {
      prisma.personas.count = jest.fn().mockResolvedValue(1);
      prisma.personas.findMany = jest.fn().mockResolvedValue([makePersona()]);
    });

    it('toma el destino de la tabla destinos', async () => {
      const result = await service.findAllPersonas({});

      expect(result.items[0].destino).toBe('E.M.G.F.A.');
    });

    it('devuelve null cuando el funcionario no tiene destino cargado', async () => {
      prisma.personas.findMany.mockResolvedValue([makePersona({ destinos: [] })]);

      const result = await service.findAllPersonas({});

      expect(result.items[0].destino).toBeNull();
    });

    it('no cae a la unidad de la relación laboral cuando no hay destino', async () => {
      prisma.personas.findMany.mockResolvedValue([
        makePersona({
          destinos: [],
          relaciones_laborales: [
            {
              grados: { denominacion: 'Sargento' },
              situaciones: { denominacion: 'Actividad' },
              unidades: { denominacion: 'Cuartel General' },
            },
          ],
        }),
      ]);

      const result = await service.findAllPersonas({});

      expect(result.items[0].destino).toBeNull();
    });

    it('pide solo el destino vigente y el más reciente', async () => {
      await service.findAllPersonas({});

      const { select } = prisma.personas.findMany.mock.calls.at(-1)[0];

      expect(select.destinos).toEqual(
        expect.objectContaining({
          where: { fecha_fin: null },
          orderBy: { fecha_inicio: 'desc' },
          take: 1,
        }),
      );
    });

    it('rango y estado siguen saliendo de la relación laboral', async () => {
      const result = await service.findAllPersonas({});

      expect(result.items[0].rango).toBe('Sargento');
      expect(result.items[0].estado).toBe('Actividad');
    });
  });

  describe('findAllPersonas · derecha y numor', () => {
    const persona = (id: bigint, derecha: number | null) => ({
      id,
      cedula: String(id),
      primer_nombre: 'N',
      segundo_nombre: null,
      primer_apellido: `A${id}`,
      segundo_apellido: null,
      relaciones_laborales: [{ estado: 'activo', derecha, numor: 1, escala_derecha: 'OFICIALES', escalafones: { codigo: 'AV' } }],
      destinos: [],
    });

    beforeEach(() => {
      prisma.personas.count = jest.fn().mockResolvedValue(3);
      prisma.personas.findMany = jest.fn(({ where }: any) =>
        Promise.resolve(where?.id?.in ? where.id.in.map((id: bigint) => persona(id, Number(id))) : [{ id: 3n }, { id: 1n }, { id: 2n }]),
      );
      prisma.relaciones_laborales.findMany = jest.fn().mockResolvedValue([
        { persona_id: 1n },
        { persona_id: 2n },
        { persona_id: 3n },
      ]);
    });

    it('por defecto ordena por derecha y pagina después de ordenar', async () => {
      const result = await service.findAllPersonas({ page: 1, pageSize: 2 });

      expect(result.items.map((i: any) => i.id)).toEqual(['1', '2']);
      expect(result.items[0]).toMatchObject({ derecha: 1, numor: 1, escalafon: 'AV' });
      expect(prisma.relaciones_laborales.findMany.mock.calls[0][0].orderBy).toEqual([
        { escala_derecha: { sort: 'asc', nulls: 'last' } },
        { derecha: { sort: 'asc', nulls: 'last' } },
        { persona_id: 'asc' },
      ]);
    });

    it('por numor ordena antes por jerarquía de grado y escalafón', async () => {
      await service.findAllPersonas({ ordenarPor: 'numor', direccion: 'DESC' });

      expect(prisma.relaciones_laborales.findMany.mock.calls[0][0].orderBy).toEqual([
        { escala_derecha: { sort: 'desc', nulls: 'last' } },
        { grados: { derecha_jerarquia: { posicion: 'desc' } } },
        { escalafones: { codigo: 'desc' } },
        { numor: { sort: 'desc', nulls: 'last' } },
        { persona_id: 'asc' },
      ]);
    });

    it('filtra por rango de derecha y numor sobre la relación vigente', async () => {
      await service.findAllPersonas({ derechaDesde: 1, derechaHasta: 10, numorDesde: 1, numorHasta: 1, escala: 'OFICIALES' });

      expect(prisma.personas.count.mock.calls[0][0].where.relaciones_laborales.some).toEqual(
        expect.objectContaining({
          fecha_fin: null,
          derecha: { gte: 1, lte: 10 },
          numor: { gte: 1, lte: 1 },
          escala_derecha: 'OFICIALES',
        }),
      );
    });

    it('rechaza un rango invertido', async () => {
      await expect(service.findAllPersonas({ derechaDesde: 5, derechaHasta: 2 })).rejects.toThrow(BadRequestException);
    });

    it('por apellido usa el orden nativo con la dirección pedida', async () => {
      prisma.personas.findMany = jest.fn().mockResolvedValue([persona(2n, 2), persona(1n, 1)]);

      await service.findAllPersonas({ ordenarPor: 'apellido', direccion: 'DESC' });

      expect(prisma.personas.findMany.mock.calls[0][0].orderBy).toEqual([
        { primer_apellido: 'desc' },
        { primer_nombre: 'desc' },
      ]);
      expect(prisma.relaciones_laborales.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findAllPersonas · filtro por destino', () => {
    beforeEach(() => {
      prisma.personas.count = jest.fn().mockResolvedValue(0);
      prisma.personas.findMany = jest.fn().mockResolvedValue([]);
    });

    it('filtra por la unidad del destino vigente', async () => {
      await service.findAllPersonas({ destino: 5 });

      const { where } = prisma.personas.findMany.mock.calls[0][0];

      expect(where.destinos).toEqual({
        some: { unidad_id: 5n, fecha_fin: null },
      });
    });

    it('ya no filtra por la unidad de la relación laboral', async () => {
      await service.findAllPersonas({ destino: 5 });

      const { where } = prisma.personas.findMany.mock.calls[0][0];

      expect(where.relaciones_laborales.some).not.toHaveProperty('unidad_id');
    });

    it('sin filtro de destino no restringe por destinos', async () => {
      await service.findAllPersonas({});

      const { where } = prisma.personas.findMany.mock.calls[0][0];

      expect(where).not.toHaveProperty('destinos');
    });

    it('mantiene los filtros de estado y rango en la relación laboral', async () => {
      await service.findAllPersonas({ estado: 2, rango: 6 });

      const { where } = prisma.personas.findMany.mock.calls[0][0];

      expect(where.relaciones_laborales.some).toEqual(
        expect.objectContaining({
          fecha_fin: null,
          situacion_id: 2n,
          grado_id: 6n,
        }),
      );
    });
  });

  describe('create', () => {
    it('Crea persona y su relación laboral como subalterno', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      const r = await service.create(dto);
      expect(r.relacion_laboral.tipo_funcionario).toBe('subalterno');
    });

    it('Crea también el destino en la unidad de alta, para que aparezca en el listado por unidad', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      await service.create(dto);
      expect(prisma.destinos.create).toHaveBeenCalledWith({
        data: { persona_id: 1n, unidad_id: 1n, fecha_inicio: new Date(dto.fecha_inicio) },
      });
    });

    it('Falla si la cédula ya existe', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 99n });
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('Falla si la fecha de inicio es anterior a la de nacimiento', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ ...dto, fecha_nacimiento: '2025-06-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.personas.create).not.toHaveBeenCalled();
    });

    it('Acepta una fecha de inicio posterior a la de nacimiento', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      const r = await service.create({ ...dto, fecha_nacimiento: '1990-05-15' });
      expect(r.relacion_laboral.tipo_funcionario).toBe('subalterno');
    });
  });

  describe('createPersonal', () => {
    const dtoMilitar = {
      ...dto,
      es_civil: false,
      tipo_funcionario: 'subalterno',
    };

    it('asigna derecha y numor al final cuando no se indica posición', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      const r: any = await service.createPersonal(dtoMilitar as any, undefined, { id: 5n, permisos: [] });

      expect(derecha.asignarEnAltaEnTransaccion).toHaveBeenCalledWith(prisma, 1n, undefined, undefined, {
        usuarioId: 5n,
      });
      expect(r.relacion_laboral).toMatchObject({ derecha: 7, numor: 2 });
    });

    it('con posición elegida exige el permiso derecha.gestionar', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(
        service.createPersonal({ ...dtoMilitar, posicion_derecha: 1 } as any, undefined, { id: 5n, permisos: [] }),
      ).rejects.toThrow(ForbiddenException);

      await service.createPersonal({ ...dtoMilitar, posicion_derecha: 1, posicion_numor: 2 } as any, undefined, {
        id: 5n,
        permisos: ['derecha.gestionar'],
      });
      expect(derecha.asignarEnAltaEnTransaccion).toHaveBeenCalledWith(prisma, 1n, 1, 2, { usuarioId: 5n });
    });

    it('con omitirDerecha crea al funcionario sin asignarle derecha', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await service.createPersonal(dtoMilitar as any, undefined, undefined, { omitirDerecha: true });

      expect(prisma.personas.create).toHaveBeenCalled();
      expect(derecha.asignarEnAltaEnTransaccion).not.toHaveBeenCalled();
    });

    it('Falla si la fecha de inicio es anterior a la de nacimiento', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      await expect(
        service.createPersonal({ ...dtoMilitar, fecha_nacimiento: '2025-06-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.personas.create).not.toHaveBeenCalled();
    });

    it('Acepta una fecha de inicio posterior a la de nacimiento', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      const r = await service.createPersonal({
        ...dtoMilitar,
        fecha_nacimiento: '1990-05-15',
      });
      expect((r as any).relacion_laboral.tipo_funcionario).toBe('subalterno');
    });

    it('Devuelve los catálogos resueltos por nombre, no solo los ids', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      const r = await service.createPersonal(dtoMilitar);
      expect((r as any).relacion_laboral).toMatchObject({
        grado: 'Sargento',
        unidad: 'Brigada Aérea I',
        escalafon: 'Comando y Aire',
        programa: 'Programa 001',
        situacion: 'Actividad',
        regimen: 'Militar',
        sub_unidad: null,
      });
    });

    it('Un militar también puede tener familiares (no es exclusivo de civiles)', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      prisma.personas.findMany = jest.fn().mockResolvedValue([
        { id: 50n, cedula: '99999999', primer_nombre: 'Pedro', primer_apellido: 'Ramos', es_civil: false },
      ]);
      prisma.relaciones_familiares = { createMany: jest.fn() };

      const r = await service.createPersonal({
        ...dtoMilitar,
        familiares: [{ cedula: '99999999', tipo_relacion: 'Hermano/a' }],
      });

      expect(prisma.relaciones_familiares.createMany).toHaveBeenCalledWith({
        data: [{ persona_id: 1n, familiar_id: 50n, tipo_relacion: 'Hermano/a' }],
      });
      expect((r as any).familiares).toEqual([
        { id: 50, cedula: '99999999', nombre: 'Pedro Ramos', tipo_relacion: 'Hermano/a' },
      ]);
    });

    it('Rechaza un familiar civil también para un militar (el familiar debe ser militar)', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      prisma.personas.findMany = jest.fn().mockResolvedValue([
        { id: 50n, cedula: '99999999', primer_nombre: 'Ana', primer_apellido: 'Ruiz', es_civil: true },
      ]);
      prisma.relaciones_familiares = { createMany: jest.fn() };

      await expect(
        service.createPersonal({
          ...dtoMilitar,
          familiares: [{ cedula: '99999999' }],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.personas.create).not.toHaveBeenCalled();
    });

    it('Un militar sin familiares no intenta crear vínculos', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      prisma.relaciones_familiares = { createMany: jest.fn() };

      await service.createPersonal(dtoMilitar);

      expect(prisma.relaciones_familiares.createMany).not.toHaveBeenCalled();
    });

    it('Crea también el destino en la unidad de alta, para que aparezca en el listado por unidad', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      await service.createPersonal(dtoMilitar);
      expect(prisma.destinos.create).toHaveBeenCalledWith({
        data: { persona_id: 1n, unidad_id: 1n, fecha_inicio: new Date(dtoMilitar.fecha_inicio) },
      });
    });
  });

  describe('update', () => {
    it('Actualiza dirección y teléfono', async () => {
      prisma.personas.findUnique.mockResolvedValue({ id: 1n });
      const r = await service.update(1, {
        direccion: 'Av. Italia 1234',
        telefono: '099123456',
      });
      expect(r.direccion).toBe('Av. Italia 1234');
      expect(r.telefono).toBe('099123456');
    });

    it('Error porque no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      await expect(service.update(999, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    const sinRegistros = (conteos: Record<string, number> = {}) => ({ id: 1n, _count: conteos });

    it('Borra relaciones laborales y persona', async () => {
      prisma.personas.findUnique.mockResolvedValue(sinRegistros());
      const r = await service.remove(1);
      expect(r).toEqual({ id: 1, eliminado: true });
      expect(prisma.relaciones_laborales.deleteMany).toHaveBeenCalled();
      expect(prisma.personas.delete).toHaveBeenCalled();
    });

    it('Error porque no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });

    it('con registros asociados no borra nada y responde 409 con lo que bloquea', async () => {
      prisma.personas.findUnique.mockResolvedValue(
        sinRegistros({ funcionarios_cursos: 2, aguinaldos: 4, items_liquidacion: 10 }),
      );

      const error = await service.remove(1).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual({
        message:
          'No se puede eliminar: el funcionario tiene cursos (2) y registros de liquidaciones (14)',
        data: {
          motivo: 'tiene_registros',
          registros: [
            { tipo: 'cursos', etiqueta: 'Cursos', cantidad: 2 },
            { tipo: 'liquidaciones', etiqueta: 'Registros de liquidaciones', cantidad: 14 },
          ],
        },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('cuenta los vínculos familiares aparte, en las dos direcciones', async () => {
      prisma.personas.findUnique.mockResolvedValue(sinRegistros());
      prisma.relaciones_familiares.count.mockResolvedValue(2);

      const error = await service.remove(1).catch((e) => e);

      expect(prisma.relaciones_familiares.count).toHaveBeenCalledWith({
        where: { OR: [{ persona_id: 1n }, { familiar_id: 1n }] },
      });
      expect(error.getResponse().data.registros).toEqual([
        { tipo: 'familiares', etiqueta: 'Vínculos familiares', cantidad: 2 },
      ]);
    });

    it('los retiros (historial, incluidos los anulados) también bloquean', async () => {
      prisma.personas.findUnique.mockResolvedValue(sinRegistros({ retiros: 2 }));

      const error = await service.remove(1).catch((e) => e);

      expect(error.getResponse().data.registros).toEqual([
        { tipo: 'retiro', etiqueta: 'Retiros', cantidad: 2 },
      ]);
    });

    it('los destinos no bloquean: el alta crea uno y se van con la persona', async () => {
      prisma.personas.findUnique.mockResolvedValue(sinRegistros());

      await service.remove(1);

      const { select } = prisma.personas.findUnique.mock.calls[0][0];
      expect(select._count.select).not.toHaveProperty('destinos');
      expect(prisma.destinos.deleteMany).toHaveBeenCalledWith({ where: { persona_id: 1n } });
    });

    it('las horas de vuelo cargadas bloquean; las filas generadas se van con la persona', async () => {
      prisma.personas.findUnique.mockResolvedValue(sinRegistros({ registros_vuelo: 2 }));

      const error = await service.remove(1).catch((e) => e);

      expect(error.getResponse().data.registros).toEqual([
        { tipo: 'vuelos', etiqueta: 'Horas de vuelo cargadas', cantidad: 2 },
      ]);
      const { select } = prisma.personas.findUnique.mock.calls.at(-1)[0];
      expect(select._count.select.registros_vuelo).toEqual({ where: { editado_en: { not: null } } });

      prisma.personas.findUnique.mockResolvedValue(sinRegistros());
      await service.remove(1);
      expect(prisma.registros_vuelo.deleteMany).toHaveBeenCalledWith({ where: { persona_id: 1n } });
    });

    it('solo cuentan los documentos activos', async () => {
      prisma.personas.findUnique.mockResolvedValue(sinRegistros());

      await service.remove(1);

      const { select } = prisma.personas.findUnique.mock.calls[0][0];
      expect(select._count.select.personas_documentos).toEqual({
        where: { archivos: { eliminado_en: null } },
      });
    });

    it('el legajo y los vínculos con documentos ya borrados se van con la persona', async () => {
      prisma.personas.findUnique.mockResolvedValue(sinRegistros());

      await service.remove(1);

      expect(prisma.legajo_militar.deleteMany).toHaveBeenCalledWith({ where: { persona_id: 1n } });
      expect(prisma.personas_documentos.deleteMany).toHaveBeenCalledWith({
        where: { persona_id: 1n, archivos: { eliminado_en: { not: null } } },
      });
    });

    it('si igual salta una FK que no se contó, 409 genérico y no 500', async () => {
      prisma.personas.findUnique.mockResolvedValue(sinRegistros());
      prisma.$transaction.mockRejectedValueOnce(Object.assign(new Error('fk'), { code: 'P2003' }));

      const error = await service.remove(1).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual({
        message: 'No se puede eliminar: el funcionario tiene registros asociados',
        data: { motivo: 'tiene_registros', registros: [] },
      });
    });
  });

  // ─── Alcance por unidad (spec 002) ─────────────────────────────────────────

  describe('alcance por unidad', () => {
    const UNIDAD: any = { tipo: 'unidad', unidadIds: ['7'] };
    const GLOBAL: any = { tipo: 'global' };

    beforeEach(() => {
      prisma.personas.count = jest.fn().mockResolvedValue(0);
      prisma.personas.findMany = jest.fn().mockResolvedValue([]);
    });

    it('fuerza la unidad propia en el listado e ignora el filtro destino del query', async () => {
      await service.findAllPersonas({ destino: '99' } as any, UNIDAD);

      expect(prisma.personas.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            destinos: { some: { fecha_fin: null, unidad_id: { in: [7n] } } },
          }),
        }),
      );
    });

    it('respeta el filtro destino del query con alcance global', async () => {
      await service.findAllPersonas({ destino: '99' } as any, GLOBAL);

      expect(prisma.personas.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            destinos: { some: { unidad_id: 99n, fecha_fin: null } },
          }),
        }),
      );
    });

    it('no filtra por unidad si no se pasa alcance (regresion del comportamiento previo)', async () => {
      await service.findAllPersonas({} as any);

      expect(prisma.personas.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            relaciones_laborales: { some: { fecha_fin: null } },
          }),
        }),
      );
    });

    it('rechaza dar de alta personal en una unidad ajena', async () => {
      await expect(
        service.create({ ...dto, unidad_id: 99 } as any, UNIDAD),
      ).rejects.toThrow(BadRequestException);
    });

    it('fuerza la unidad propia al dar de alta sin declararla', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await service.create({ ...dto, unidad_id: undefined } as any, UNIDAD);

      expect(prisma.relaciones_laborales.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ unidad_id: 7n }),
        }),
      );
    });

    it('devuelve NotFoundException al editar una persona de otra unidad', async () => {
      prisma.personas.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.update(1, {}, UNIDAD)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('permite eliminar una persona de la propia unidad', async () => {
      prisma.personas.findFirst = jest.fn().mockResolvedValue({ id: 1n });
      prisma.personas.findUnique.mockResolvedValue({ id: 1n });

      // No se invalida ninguna sesion: la unidad del usuario del sistema es
      // independiente del destino del funcionario (spec 002 §3).
      await expect(service.remove(1, UNIDAD)).resolves.toBeDefined();
    });
  });
});
