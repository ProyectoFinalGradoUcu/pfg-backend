import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CatalogosService } from './catalogos.service';
import { PrismaService } from '../../lib/prisma.service';
import { CreateUnidadDto } from './dto/create-unidad.dto';
import { UpdateUnidadDto } from './dto/update-unidad.dto';

const makeUnidad = (overrides: Partial<any> = {}) => ({
  id: 5n,
  codigo: 'COA',
  denominacion: 'Comando Aéreo de Operaciones (C.O.A.)',
  tipo: 'Unidad',
  vigente: true,
  ...overrides,
});

const makePrismaMock = () => ({
  unidades: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  destinos: {
    count: jest.fn(),
  },
  motivos_baja: {
    findMany: jest.fn(),
  },
  escalafones: {
    findUnique: jest.fn(),
  },
  grados: {
    findMany: jest.fn(),
  },
  relaciones_laborales: {
    count: jest.fn(),
  },
});

describe('CatalogosService · grados por escalafón', () => {
  let service: CatalogosService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const module = await Test.createTestingModule({
      providers: [CatalogosService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CatalogosService);
  });

  it.each([
    ['SG', { es_subalterno: true }],
    ['ST', { es_subalterno: true }],
    ['AV', { es_oficial: true }],
  ])('usa la escala correspondiente cuando %s no tiene grados vinculados', async (codigo, fallback) => {
    prisma.escalafones.findUnique.mockResolvedValue({ codigo });
    prisma.grados.findMany.mockResolvedValue([]);

    await service.findGrados(13);

    expect(prisma.grados.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        vigente: true,
        OR: [{ escalafon_id: 13n }, fallback],
      },
    }));
  });

  it('usa la escala propia de aerotécnicos para AT', async () => {
    prisma.escalafones.findUnique.mockResolvedValue({ codigo: 'AT' });
    prisma.grados.findMany.mockResolvedValue([]);

    await service.findGrados(14);

    expect(prisma.grados.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        vigente: true,
        OR: [
          { escalafon_id: 14n },
          { codigo: { in: ['AT_2DA', 'AT_1RA', 'AT_PPAL', 'INST_AT', 'SUP_AT'] } },
        ],
      },
    }));
  });

  it('devuelve el escalafón como null cuando el catálogo compartido no lo informa', async () => {
    prisma.escalafones.findUnique.mockResolvedValue({ codigo: 'AV' });
    prisma.grados.findMany.mockResolvedValue([
      { id: 7n, codigo: 'ALF', denominacion: 'Alf.', escalafon_id: null, orden: 7 },
    ]);

    await expect(service.findGrados(1)).resolves.toEqual([
      { id: 7, codigo: 'ALF', denominacion: 'Alf.', escalafon_id: null, orden: 7 },
    ]);
  });

  it('devuelve vacío si el escalafón no existe', async () => {
    prisma.escalafones.findUnique.mockResolvedValue(null);

    await expect(service.findGrados(999)).resolves.toEqual([]);
    expect(prisma.grados.findMany).not.toHaveBeenCalled();
  });
});

describe('CatalogosService · unidades', () => {
  let service: CatalogosService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeAll(async () => {
    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CatalogosService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CatalogosService>(CatalogosService);
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ─── crearUnidad ────────────────────────────────────────────────────────────

  describe('crearUnidad', () => {
    const dto = {
      codigo: 'COA',
      denominacion: 'Comando Aéreo de Operaciones (C.O.A.)',
      tipo: 'Unidad',
    };

    beforeEach(() => {
      prisma.unidades.findFirst.mockResolvedValue(null);
      prisma.unidades.create.mockResolvedValue(makeUnidad());
    });

    it('crea la unidad vigente', async () => {
      const result = await service.crearUnidad(dto);

      expect(prisma.unidades.create).toHaveBeenCalledWith({
        data: {
          codigo: 'COA',
          denominacion: 'Comando Aéreo de Operaciones (C.O.A.)',
          tipo: 'Unidad',
          vigente: true,
        },
      });
      expect(result).toEqual({
        id: '5',
        codigo: 'COA',
        denominacion: 'Comando Aéreo de Operaciones (C.O.A.)',
        tipo: 'Unidad',
        vigente: true,
      });
    });

    it('acepta una unidad sin tipo', async () => {
      const { tipo, ...sinTipo } = dto;

      await service.crearUnidad(sinTipo);

      expect(prisma.unidades.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tipo: null }),
      });
    });

    it('rechaza un código repetido', async () => {
      prisma.unidades.findFirst.mockResolvedValueOnce(makeUnidad());

      await expect(service.crearUnidad(dto)).rejects.toThrow(ConflictException);
    });

    it('rechaza una denominación repetida', async () => {
      prisma.unidades.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeUnidad());

      await expect(service.crearUnidad(dto)).rejects.toThrow(ConflictException);
    });

    it('compara el código ignorando mayúsculas', async () => {
      await service.crearUnidad({ ...dto, codigo: 'coa' });

      expect(prisma.unidades.findFirst).toHaveBeenCalledWith({
        where: { codigo: { equals: 'coa', mode: 'insensitive' } },
      });
    });
  });

  // ─── editarUnidad ───────────────────────────────────────────────────────────

  describe('editarUnidad', () => {
    beforeEach(() => {
      prisma.unidades.findUnique.mockResolvedValue(makeUnidad());
      prisma.unidades.findFirst.mockResolvedValue(null);
      prisma.unidades.update.mockResolvedValue(makeUnidad({ denominacion: 'C.O.A.' }));
      prisma.destinos.count.mockResolvedValue(0);
      prisma.relaciones_laborales.count.mockResolvedValue(0);
    });

    it('actualiza la denominación', async () => {
      await service.editarUnidad(5, { denominacion: 'C.O.A.' });

      expect(prisma.unidades.update).toHaveBeenCalledWith({
        where: { id: 5n },
        data: { denominacion: 'C.O.A.' },
      });
    });

    it('permite dar de baja y reactivar con vigente', async () => {
      await service.editarUnidad(5, { vigente: false });

      expect(prisma.unidades.update).toHaveBeenCalledWith({
        where: { id: 5n },
        data: { vigente: false },
      });
    });

    it('permite limpiar el tipo', async () => {
      await service.editarUnidad(5, { tipo: null });

      expect(prisma.unidades.update).toHaveBeenCalledWith({
        where: { id: 5n },
        data: { tipo: null },
      });
    });

    it('rechaza si la unidad no existe', async () => {
      prisma.unidades.findUnique.mockResolvedValue(null);

      await expect(service.editarUnidad(999, { denominacion: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza una denominación que ya usa otra unidad', async () => {
      prisma.unidades.findFirst.mockResolvedValue(makeUnidad({ id: 9n }));

      await expect(service.editarUnidad(5, { denominacion: 'E.M.G.F.A.' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('no se queja si la denominación es la que ya tenía', async () => {
      await service.editarUnidad(5, {
        denominacion: 'Comando Aéreo de Operaciones (C.O.A.)',
      });

      expect(prisma.unidades.findFirst).not.toHaveBeenCalled();
      expect(prisma.unidades.update).toHaveBeenCalled();
    });
  });

  // ─── No dar de baja una unidad con gente adentro ────────────────────────────
  // Marcar `vigente: false` una unidad donde todavía revistan funcionarios deja
  // la grilla mostrando un destino en una unidad que ya no existe para el resto
  // del sistema. Se bloquea hasta que los reasignen.

  describe('baja de una unidad con funcionarios destinados', () => {
    beforeEach(() => {
      prisma.unidades.findUnique.mockResolvedValue(makeUnidad());
      prisma.unidades.findFirst.mockResolvedValue(null);
      prisma.unidades.update.mockResolvedValue(makeUnidad({ vigente: false }));
      prisma.destinos.count.mockResolvedValue(0);
      prisma.relaciones_laborales.count.mockResolvedValue(0);
    });

    it('rechaza el PATCH con vigente:false si hay destinos vigentes', async () => {
      prisma.destinos.count.mockResolvedValue(3);

      await expect(service.editarUnidad(5, { vigente: false })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.unidades.update).not.toHaveBeenCalled();
    });

    it('el mensaje dice cuántos funcionarios hay que reasignar', async () => {
      prisma.destinos.count.mockResolvedValue(3);

      await expect(service.editarUnidad(5, { vigente: false })).rejects.toThrow(
        /3 funcionario/,
      );
    });

    it('cuenta solo los destinos vigentes de esa unidad, no el historial', async () => {
      prisma.destinos.count.mockResolvedValue(1);

      await expect(service.editarUnidad(5, { vigente: false })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.destinos.count).toHaveBeenCalledWith({
        where: { unidad_id: 5n, fecha_fin: null },
      });
    });

    it('permite el PATCH con vigente:false si no queda nadie', async () => {
      await service.editarUnidad(5, { vigente: false });

      expect(prisma.unidades.update).toHaveBeenCalledWith({
        where: { id: 5n },
        data: { vigente: false },
      });
    });

    it('rechaza el DELETE si hay destinos vigentes', async () => {
      prisma.destinos.count.mockResolvedValue(2);

      await expect(service.darDeBajaUnidad(5)).rejects.toThrow(ConflictException);
      expect(prisma.unidades.update).not.toHaveBeenCalled();
    });

    it('permite el DELETE si no queda nadie', async () => {
      const result = await service.darDeBajaUnidad(5);

      expect(result.vigente).toBe(false);
    });

    it('reactivar con vigente:true no consulta destinos', async () => {
      await service.editarUnidad(5, { vigente: true });

      expect(prisma.destinos.count).not.toHaveBeenCalled();
    });

    it('editar sin tocar vigente no consulta destinos', async () => {
      await service.editarUnidad(5, { denominacion: 'C.O.A.' });

      expect(prisma.destinos.count).not.toHaveBeenCalled();
    });
  });

  // ─── No dar de baja una unidad que liquidación está usando ──────────────────
  // `unidades` y `relaciones_laborales` son tablas del sistema de liquidación de
  // sueldos, que comparte esta base. Liquidación calcula por relación laboral, y
  // `relaciones_laborales.unidad_id` es NOT NULL: si se marca la unidad como no
  // vigente, sigue referenciada por relaciones que ellos usan para calcular.

  describe('baja de una unidad con relaciones laborales vigentes', () => {
    beforeEach(() => {
      prisma.unidades.findUnique.mockResolvedValue(makeUnidad());
      prisma.unidades.findFirst.mockResolvedValue(null);
      prisma.unidades.update.mockResolvedValue(makeUnidad({ vigente: false }));
      prisma.destinos.count.mockResolvedValue(0);
      prisma.relaciones_laborales.count.mockResolvedValue(0);
    });

    it('rechaza el PATCH con vigente:false si hay relaciones laborales vigentes', async () => {
      prisma.relaciones_laborales.count.mockResolvedValue(4);

      await expect(service.editarUnidad(5, { vigente: false })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.unidades.update).not.toHaveBeenCalled();
    });

    it('rechaza el DELETE si hay relaciones laborales vigentes', async () => {
      prisma.relaciones_laborales.count.mockResolvedValue(4);

      await expect(service.darDeBajaUnidad(5)).rejects.toThrow(ConflictException);
      expect(prisma.unidades.update).not.toHaveBeenCalled();
    });

    it('cuenta solo las relaciones vigentes de esa unidad, no las cerradas', async () => {
      prisma.relaciones_laborales.count.mockResolvedValue(1);

      await expect(service.darDeBajaUnidad(5)).rejects.toThrow(ConflictException);
      expect(prisma.relaciones_laborales.count).toHaveBeenCalledWith({
        where: { unidad_id: 5n, fecha_fin: null },
      });
    });

    it('el mensaje explica que el dato lo usa liquidación', async () => {
      prisma.relaciones_laborales.count.mockResolvedValue(4);

      await expect(service.darDeBajaUnidad(5)).rejects.toThrow(/liquidaci/i);
    });

    it('el mensaje trae la cantidad de relaciones', async () => {
      prisma.relaciones_laborales.count.mockResolvedValue(4);

      await expect(service.darDeBajaUnidad(5)).rejects.toThrow(/4 /);
    });

    it('el destino manda en el mensaje si hay de los dos', async () => {
      prisma.destinos.count.mockResolvedValue(2);
      prisma.relaciones_laborales.count.mockResolvedValue(4);

      await expect(service.darDeBajaUnidad(5)).rejects.toThrow(/destino vigente/);
    });

    it('permite la baja si no hay destinos ni relaciones vigentes', async () => {
      const result = await service.darDeBajaUnidad(5);

      expect(result.vigente).toBe(false);
    });

    it('reactivar no consulta relaciones laborales', async () => {
      await service.editarUnidad(5, { vigente: true });

      expect(prisma.relaciones_laborales.count).not.toHaveBeenCalled();
    });
  });

  // ─── darDeBajaUnidad ────────────────────────────────────────────────────────

  describe('darDeBajaUnidad', () => {
    it('marca la unidad como no vigente sin borrarla', async () => {
      prisma.unidades.findUnique.mockResolvedValue(makeUnidad());
      prisma.unidades.update.mockResolvedValue(makeUnidad({ vigente: false }));

      const result = await service.darDeBajaUnidad(5);

      expect(prisma.unidades.update).toHaveBeenCalledWith({
        where: { id: 5n },
        data: { vigente: false },
      });
      expect(result.vigente).toBe(false);
    });

    it('rechaza si la unidad no existe', async () => {
      prisma.unidades.findUnique.mockResolvedValue(null);

      await expect(service.darDeBajaUnidad(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findMotivosBaja ────────────────────────────────────────────────────────
  // Alimenta el desplegable de motivo_baja_id al registrar un retiro.

  describe('findMotivosBaja', () => {
    it('devuelve solo los vigentes, ordenados por denominacion', async () => {
      prisma.motivos_baja.findMany.mockResolvedValue([
        { id: 4n, codigo: 'BAJA_DEFINITIVA', denominacion: 'Baja definitiva.' },
        { id: 5n, codigo: 'RETIRO_OBL', denominacion: 'Baja por retiro obligatorio.' },
      ]);

      const result = await service.findMotivosBaja();

      expect(prisma.motivos_baja.findMany).toHaveBeenCalledWith({
        where: { vigente: true },
        orderBy: { denominacion: 'asc' },
        select: { id: true, codigo: true, denominacion: true },
      });
      expect(result).toEqual([
        { id: 4, codigo: 'BAJA_DEFINITIVA', denominacion: 'Baja definitiva.' },
        { id: 5, codigo: 'RETIRO_OBL', denominacion: 'Baja por retiro obligatorio.' },
      ]);
    });

    it('convierte el BigInt del id a number', async () => {
      prisma.motivos_baja.findMany.mockResolvedValue([
        { id: 9007199254740991n, codigo: 'X', denominacion: 'X' },
      ]);

      const result = await service.findMotivosBaja();

      expect(typeof result[0].id).toBe('number');
    });

    it('devuelve lista vacia si no hay motivos vigentes', async () => {
      prisma.motivos_baja.findMany.mockResolvedValue([]);

      expect(await service.findMotivosBaja()).toEqual([]);
    });
  });
});

describe('DTOs de unidades', () => {
  const errores = async (cls: any, payload: object) =>
    (await validate(plainToInstance(cls, payload))).map((e) => e.property);

  describe('CreateUnidadDto', () => {
    const valido = { codigo: 'COA', denominacion: 'Comando Aéreo de Operaciones' };

    it('acepta código y denominación', async () => {
      expect(await errores(CreateUnidadDto, valido)).toEqual([]);
    });

    it('rechaza si falta el código', async () => {
      const { codigo, ...sinCodigo } = valido;

      expect(await errores(CreateUnidadDto, sinCodigo)).toContain('codigo');
    });

    it('rechaza si falta la denominación', async () => {
      const { denominacion, ...sinDenom } = valido;

      expect(await errores(CreateUnidadDto, sinDenom)).toContain('denominacion');
    });

    it('rechaza código de más de 30 caracteres', async () => {
      expect(await errores(CreateUnidadDto, { ...valido, codigo: 'x'.repeat(31) })).toContain(
        'codigo',
      );
    });

    it('rechaza denominación de más de 150 caracteres', async () => {
      expect(
        await errores(CreateUnidadDto, { ...valido, denominacion: 'x'.repeat(151) }),
      ).toContain('denominacion');
    });
  });

  describe('UpdateUnidadDto', () => {
    it('acepta objeto vacío', async () => {
      expect(await errores(UpdateUnidadDto, {})).toEqual([]);
    });

    it('acepta tipo en null', async () => {
      expect(await errores(UpdateUnidadDto, { tipo: null })).toEqual([]);
    });

    // El código no se puede editar. Lo garantiza el ValidationPipe global, así
    // que se testea con la misma configuración que main.ts.
    it('el pipe rechaza codigo como campo no permitido', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });

      await expect(
        pipe.transform({ codigo: 'X' }, { type: 'body', metatype: UpdateUnidadDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('el pipe acepta los campos que sí declara', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });

      await expect(
        pipe.transform(
          { denominacion: 'C.O.A.', vigente: false },
          { type: 'body', metatype: UpdateUnidadDto },
        ),
      ).resolves.toEqual({ denominacion: 'C.O.A.', vigente: false });
    });

    it('rechaza vigente que no sea booleano', async () => {
      expect(await errores(UpdateUnidadDto, { vigente: 'quizas' })).toContain('vigente');
    });
  });
});
