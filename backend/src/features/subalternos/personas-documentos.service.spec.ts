import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PersonasDocumentosService } from './personas-documentos.service';
import { ActualizarDocumentoDto, SubirDocumentoDto } from './dto/documento-personal.dto';
import { PrismaService } from '../../lib/prisma.service';
import { ArchivosService, calcularSha256 } from '../archivos/archivos.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const GLOBAL = { tipo: 'global' as const };
const UNIDAD = { tipo: 'unidad' as const, unidadIds: ['3'] };

const makeArchivoFila = (overrides: Partial<any> = {}) => ({
  id: 87n,
  bucket: 'pfg-documents',
  object_key: 'personas/42/documentos/uuid-cedula.pdf',
  nombre_original: 'cedula.pdf',
  content_type: 'application/pdf',
  tamanio_bytes: 8n,
  sha256: 'b'.repeat(64),
  subido_por: 1n,
  subido_en: new Date('2026-09-12T10:00:00Z'),
  eliminado_en: null,
  eliminado_por: null,
  usuarios_archivos_subido_porTousuarios: { id: 1n, username: 'admin@fau.mil.uy' },
  ...overrides,
});

const makeDocumento = (overrides: Partial<any> = {}, archivo: Partial<any> = {}) => ({
  id: 7n,
  persona_id: 42n,
  archivo_id: 87n,
  descripcion: 'Cédula' as string | null,
  archivos: makeArchivoFila(archivo),
  ...overrides,
});

const makeMulter = (overrides: Partial<any> = {}) =>
  ({
    originalname: 'titulo.pdf',
    mimetype: 'application/pdf',
    buffer: PDF,
    size: PDF.length,
    ...overrides,
  }) as Express.Multer.File;

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makePrismaMock = () => {
  const mock: any = {
    personas: { findUnique: jest.fn(), findFirst: jest.fn() },
    personas_documentos: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  // La transacción corre el callback contra el mismo mock.
  mock.$transaction.mockImplementation((cb: any) => cb(mock));
  return mock;
};

const makeArchivosMock = () => ({
  guardar: jest.fn(),
  obtener: jest.fn(),
  eliminar: jest.fn().mockResolvedValue(undefined),
});

describe('PersonasDocumentosService', () => {
  let service: PersonasDocumentosService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let archivos: ReturnType<typeof makeArchivosMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    archivos = makeArchivosMock();
    prisma.personas.findUnique.mockResolvedValue({ id: 42n });
    prisma.personas_documentos.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonasDocumentosService,
        { provide: PrismaService, useValue: prisma },
        { provide: ArchivosService, useValue: archivos },
      ],
    }).compile();
    service = module.get(PersonasDocumentosService);
  });

  // ─── listar ─────────────────────────────────────────────────────────────────

  describe('listar', () => {
    it('devuelve los documentos activos del funcionario con la forma pública exacta', async () => {
      prisma.personas_documentos.findMany.mockResolvedValue([makeDocumento()]);

      const resultado = await service.listar(42, GLOBAL);

      expect(resultado).toEqual([
        {
          id: 7n,
          descripcion: 'Cédula',
          nombre_original: 'cedula.pdf',
          content_type: 'application/pdf',
          tamanio_bytes: 8n,
          subido_en: new Date('2026-09-12T10:00:00Z'),
          subido_por: { id: 1n, username: 'admin@fau.mil.uy' },
        },
      ]);
    });

    it('filtra por funcionario y por archivo no borrado, más recientes primero y desempata por id', async () => {
      await service.listar(42, GLOBAL);

      expect(prisma.personas_documentos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { persona_id: 42n, archivos: { eliminado_en: null } },
          orderBy: [{ archivos: { subido_en: 'desc' } }, { id: 'desc' }],
        }),
      );
    });

    it('404 si la persona no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.listar(999, GLOBAL)).rejects.toThrow(NotFoundException);
    });

    it('404 si la persona está fuera del alcance de unidad', async () => {
      prisma.personas.findFirst.mockResolvedValue(null);

      await expect(service.listar(42, UNIDAD)).rejects.toThrow(NotFoundException);
      expect(prisma.personas_documentos.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── subir ──────────────────────────────────────────────────────────────────

  describe('subir', () => {
    it('guarda el archivo bajo personas/{id}/documentos y registra el documento', async () => {
      archivos.guardar.mockResolvedValue({ id: 88n });
      prisma.personas_documentos.create.mockResolvedValue(
        makeDocumento(
          { id: 8n, archivo_id: 88n, descripcion: 'Título' },
          { id: 88n, nombre_original: 'titulo.pdf' },
        ),
      );

      const resultado = await service.subir(42, makeMulter(), { descripcion: 'Título' }, 1n, GLOBAL);

      expect(archivos.guardar).toHaveBeenCalledWith({
        entidad: 'personas',
        entidadId: 42n,
        slot: 'documentos',
        nombreOriginal: 'titulo.pdf',
        buffer: PDF,
        mimetype: 'application/pdf',
        usuarioId: 1n,
      });
      expect(prisma.personas_documentos.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { persona_id: 42n, archivo_id: 88n, descripcion: 'Título' },
        }),
      );
      expect(resultado.id).toBe(8n);
      expect(resultado).not.toHaveProperty('sha256');
      expect(resultado).not.toHaveProperty('object_key');
      expect(resultado).not.toHaveProperty('bucket');
    });

    it('sin descripción, o con solo espacios, guarda null', async () => {
      archivos.guardar.mockResolvedValue({ id: 88n });
      prisma.personas_documentos.create.mockResolvedValue(makeDocumento({ descripcion: null }));

      await service.subir(42, makeMulter(), { descripcion: '   ' }, 1n, GLOBAL);

      expect(prisma.personas_documentos.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { persona_id: 42n, archivo_id: 88n, descripcion: null },
        }),
      );
    });

    it('toma el lock del funcionario antes de buscar duplicados (dos subidas iguales a la vez)', async () => {
      archivos.guardar.mockResolvedValue({ id: 88n });
      prisma.personas_documentos.create.mockResolvedValue(makeDocumento());

      await service.subir(42, makeMulter(), {}, 1n, GLOBAL);

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRaw.mock.calls[0][0].join('?')).toContain('pg_advisory_xact_lock');
      expect(prisma.$executeRaw.mock.calls[0]).toContain(42n);
      expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.personas_documentos.findMany.mock.invocationCallOrder[0],
      );
    });

    it('compara solo contra los documentos activos de ese funcionario', async () => {
      archivos.guardar.mockResolvedValue({ id: 88n });
      prisma.personas_documentos.create.mockResolvedValue(makeDocumento());

      await service.subir(42, makeMulter(), {}, 1n, GLOBAL);

      expect(prisma.personas_documentos.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { persona_id: 42n, archivos: { eliminado_en: null } },
        }),
      );
    });

    it('409 contenido: mismo archivo con otro nombre, informa el existente y no sube', async () => {
      prisma.personas_documentos.findMany.mockResolvedValue([
        makeDocumento({}, { sha256: calcularSha256(PDF), nombre_original: 'otro.pdf' }),
      ]);

      const error = await service
        .subir(42, makeMulter(), { descripcion: 'Título' }, 1n, GLOBAL)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual({
        message: 'Este archivo ya está cargado para el funcionario',
        data: {
          motivo: 'contenido',
          existente: expect.objectContaining({ id: 7n, nombre_original: 'otro.pdf' }),
        },
      });
      expect(archivos.guardar).not.toHaveBeenCalled();
    });

    it('409 nombre: mismo nombre normalizado con contenido distinto', async () => {
      prisma.personas_documentos.findMany.mockResolvedValue([
        makeDocumento({}, { nombre_original: 'Titulo.PDF' }),
      ]);

      const error = await service.subir(42, makeMulter(), {}, 1n, GLOBAL).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual({
        message: 'Ya existe un documento con el nombre «Titulo.PDF»',
        data: { motivo: 'nombre', existente: expect.objectContaining({ id: 7n }) },
      });
      expect(archivos.guardar).not.toHaveBeenCalled();
    });

    it('409 descripcion: misma descripción sin importar acentos ni mayúsculas', async () => {
      prisma.personas_documentos.findMany.mockResolvedValue([
        makeDocumento({ descripcion: 'Título de bachillerato' }),
      ]);

      const error = await service
        .subir(42, makeMulter(), { descripcion: 'titulo  de BACHILLERATO' }, 1n, GLOBAL)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual({
        message: 'Ya existe un documento con la descripción «Título de bachillerato»',
        data: { motivo: 'descripcion', existente: expect.objectContaining({ id: 7n }) },
      });
    });

    it('si falla el registro del documento, da de baja el archivo recién guardado', async () => {
      archivos.guardar.mockResolvedValue({ id: 88n });
      prisma.personas_documentos.create.mockRejectedValue(new Error('FK rota'));

      await expect(service.subir(42, makeMulter(), {}, 1n, GLOBAL)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(archivos.eliminar).toHaveBeenCalledWith(88n, 1n);
    });

    it('si la compensación también falla, deja logueado el archivo huérfano', async () => {
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      archivos.guardar.mockResolvedValue({ id: 88n });
      prisma.personas_documentos.create.mockRejectedValue(new Error('FK rota'));
      archivos.eliminar.mockRejectedValue(new Error('MinIO caído'));

      await expect(service.subir(42, makeMulter(), {}, 1n, GLOBAL)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(log.mock.calls.some(([mensaje]) => String(mensaje).includes('huérfano id=88'))).toBe(
        true,
      );
      log.mockRestore();
    });

    it('404 si la persona no existe, sin subir nada', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.subir(999, makeMulter(), {}, 1n, GLOBAL)).rejects.toThrow(
        NotFoundException,
      );
      expect(archivos.guardar).not.toHaveBeenCalled();
    });
  });

  // ─── obtener ────────────────────────────────────────────────────────────────

  describe('obtener', () => {
    it('busca el documento activo por id y funcionario y devuelve su archivo', async () => {
      prisma.personas_documentos.findFirst.mockResolvedValue(makeDocumento());
      archivos.obtener.mockResolvedValue({ nombre_original: 'cedula.pdf' });

      const resultado = await service.obtener(42, 7, GLOBAL);

      expect(prisma.personas_documentos.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 7n, persona_id: 42n, archivos: { eliminado_en: null } },
        }),
      );
      expect(archivos.obtener).toHaveBeenCalledWith(87n);
      expect(resultado.nombre_original).toBe('cedula.pdf');
    });

    it('404 si el documento no existe, está borrado o es de otro funcionario', async () => {
      prisma.personas_documentos.findFirst.mockResolvedValue(null);

      await expect(service.obtener(42, 7, GLOBAL)).rejects.toThrow(NotFoundException);
      expect(archivos.obtener).not.toHaveBeenCalled();
    });
  });

  // ─── metadatos (HEAD) ───────────────────────────────────────────────────────

  describe('metadatos', () => {
    it('devuelve nombre, tipo y tamaño desde la base, sin tocar MinIO', async () => {
      prisma.personas_documentos.findFirst.mockResolvedValue(makeDocumento());

      const resultado = await service.metadatos(42, 7, GLOBAL);

      expect(resultado).toEqual({
        nombre_original: 'cedula.pdf',
        content_type: 'application/pdf',
        tamanio_bytes: 8n,
      });
      expect(archivos.obtener).not.toHaveBeenCalled();
    });

    it('404 si el documento no es de ese funcionario', async () => {
      prisma.personas_documentos.findFirst.mockResolvedValue(null);

      await expect(service.metadatos(42, 7, GLOBAL)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── actualizar (PATCH descripción) ─────────────────────────────────────────

  describe('actualizar', () => {
    it('cambia la descripción y devuelve el documento', async () => {
      prisma.personas_documentos.findMany.mockResolvedValue([makeDocumento()]);
      prisma.personas_documentos.update.mockResolvedValue(makeDocumento({ descripcion: 'Cédula vieja' }));

      const resultado = await service.actualizar(42, 7, { descripcion: ' Cédula vieja ' }, GLOBAL);

      expect(prisma.personas_documentos.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 7n }, data: { descripcion: 'Cédula vieja' } }),
      );
      expect(resultado.descripcion).toBe('Cédula vieja');
    });

    it('null quita la descripción', async () => {
      prisma.personas_documentos.findMany.mockResolvedValue([makeDocumento()]);
      prisma.personas_documentos.update.mockResolvedValue(makeDocumento({ descripcion: null }));

      await service.actualizar(42, 7, { descripcion: null }, GLOBAL);

      expect(prisma.personas_documentos.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { descripcion: null } }),
      );
    });

    it('409 si otro documento del funcionario ya tiene esa descripción', async () => {
      prisma.personas_documentos.findMany.mockResolvedValue([
        makeDocumento(),
        makeDocumento({ id: 9n, archivo_id: 90n, descripcion: 'Título' }, { id: 90n }),
      ]);

      const error = await service
        .actualizar(42, 7, { descripcion: 'titulo' }, GLOBAL)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toEqual({
        message: 'Ya existe un documento con la descripción «Título»',
        data: { motivo: 'descripcion', existente: expect.objectContaining({ id: 9n }) },
      });
      expect(prisma.personas_documentos.update).not.toHaveBeenCalled();
    });

    it('no choca consigo mismo', async () => {
      prisma.personas_documentos.findMany.mockResolvedValue([makeDocumento()]);
      prisma.personas_documentos.update.mockResolvedValue(makeDocumento());

      await expect(service.actualizar(42, 7, { descripcion: 'CÉDULA' }, GLOBAL)).resolves.toBeDefined();
    });

    it('404 si el documento no está entre los activos del funcionario', async () => {
      prisma.personas_documentos.findMany.mockResolvedValue([makeDocumento({ id: 9n })]);

      await expect(service.actualizar(42, 7, { descripcion: 'X' }, GLOBAL)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('toma el lock del funcionario antes de comparar', async () => {
      prisma.personas_documentos.findMany.mockResolvedValue([makeDocumento()]);
      prisma.personas_documentos.update.mockResolvedValue(makeDocumento());

      await service.actualizar(42, 7, { descripcion: 'X' }, GLOBAL);

      expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.personas_documentos.findMany.mock.invocationCallOrder[0],
      );
    });
  });

  // ─── eliminar ───────────────────────────────────────────────────────────────

  describe('eliminar', () => {
    it('da de baja el archivo del documento y devuelve null', async () => {
      prisma.personas_documentos.findFirst.mockResolvedValue(makeDocumento());

      const resultado = await service.eliminar(42, 7, 1n, GLOBAL);

      expect(archivos.eliminar).toHaveBeenCalledWith(87n, 1n);
      expect(resultado).toBeNull();
    });

    it('404 si el documento es de otro funcionario', async () => {
      prisma.personas_documentos.findFirst.mockResolvedValue(null);

      await expect(service.eliminar(42, 7, 1n, GLOBAL)).rejects.toThrow(NotFoundException);
      expect(archivos.eliminar).not.toHaveBeenCalled();
    });
  });
});

// ─── DTO ──────────────────────────────────────────────────────────────────────

describe('SubirDocumentoDto', () => {
  it('recorta la descripción', async () => {
    const dto = plainToInstance(SubirDocumentoDto, { descripcion: '  Cédula  ' });
    expect(dto.descripcion).toBe('Cédula');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('una descripción de solo espacios queda vacía', async () => {
    const dto = plainToInstance(SubirDocumentoDto, { descripcion: '   ' });
    expect(dto.descripcion).toBeUndefined();
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza más de 200 caracteres', async () => {
    const dto = plainToInstance(SubirDocumentoDto, { descripcion: 'x'.repeat(201) });
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'descripcion')).toBe(true);
  });
});

describe('ActualizarDocumentoDto', () => {
  it('exige el campo: sin descripcion no valida', async () => {
    const errores = await validate(plainToInstance(ActualizarDocumentoDto, {}));
    expect(errores.some((e) => e.property === 'descripcion')).toBe(true);
  });

  it('null y vacío quitan la descripción', async () => {
    for (const valor of [null, '   ']) {
      const dto = plainToInstance(ActualizarDocumentoDto, { descripcion: valor });
      expect(dto.descripcion).toBeNull();
      expect(await validate(dto)).toHaveLength(0);
    }
  });

  it('recorta y rechaza más de 200 caracteres', async () => {
    expect(plainToInstance(ActualizarDocumentoDto, { descripcion: ' Título ' }).descripcion).toBe(
      'Título',
    );
    const errores = await validate(
      plainToInstance(ActualizarDocumentoDto, { descripcion: 'x'.repeat(201) }),
    );
    expect(errores.some((e) => e.property === 'descripcion')).toBe(true);
  });
});
