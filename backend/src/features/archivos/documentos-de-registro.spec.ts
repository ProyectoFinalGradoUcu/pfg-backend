import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ConfigDocumentos,
  DocumentosDeRegistro,
  aDocumento,
  archivosDeFilas,
  darDeBajaArchivos,
  documentosDe,
} from './documentos-de-registro';
import { PrismaService } from '../../lib/prisma.service';
import { ArchivosService } from './archivos.service';

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const SUBIDO_EN = new Date('2026-11-06T12:00:00Z');

const CONFIG: ConfigDocumentos = {
  modelo: 'destinos',
  entidad: 'destinos',
  articulo: 'El',
  nombre: 'destino',
  noEncontrado: 'Destino no encontrado',
  bloqueo: {
    campo: 'anulada_en',
    libre: null,
    mensaje: 'El destino está anulado',
  },
};

const CONFIG_SIN_BLOQUEO: ConfigDocumentos = { ...CONFIG, bloqueo: undefined };

@Injectable()
class DocumentosDePrueba extends DocumentosDeRegistro {
  constructor(prisma: PrismaService, archivos: ArchivosService) {
    super(prisma, archivos, CONFIG);
  }
}

const makeMulter = (overrides: Partial<Express.Multer.File> = {}) =>
  ({
    originalname: 'orden.pdf',
    mimetype: 'application/pdf',
    buffer: PDF,
    size: PDF.length,
    ...overrides,
  }) as Express.Multer.File;

const makeArchivoPublico = (overrides: Partial<any> = {}) => ({
  id: 87n,
  nombre_original: 'orden.pdf',
  content_type: 'application/pdf',
  tamanio_bytes: BigInt(PDF.length),
  subido_en: SUBIDO_EN,
  subido_por: 5n,
  ...overrides,
});

const makeFila = (overrides: Partial<any> = {}) => ({
  id: 88n,
  anulada_en: null,
  archivo_orden_id: null,
  archivo_boletin_id: null,
  ...overrides,
});

const makePrismaMock = () => ({
  destinos: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  archivos: { findFirst: jest.fn() },
});

const makeArchivosMock = () => ({
  guardar: jest.fn(),
  obtener: jest.fn(),
  eliminar: jest.fn().mockResolvedValue(undefined),
});

describe('DocumentosDeRegistro', () => {
  let service: DocumentosDeRegistro;
  let prisma: ReturnType<typeof makePrismaMock>;
  let archivos: ReturnType<typeof makeArchivosMock>;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma = makePrismaMock();
    archivos = makeArchivosMock();
    prisma.destinos.findUnique.mockResolvedValue(makeFila());
    prisma.destinos.updateMany.mockResolvedValue({ count: 1 });
    archivos.guardar.mockResolvedValue(makeArchivoPublico());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentosDePrueba,
        { provide: PrismaService, useValue: prisma },
        { provide: ArchivosService, useValue: archivos },
      ],
    }).compile();

    service = module.get(DocumentosDePrueba);
  });

  afterEach(() => jest.restoreAllMocks());

  const sinBloqueo = () =>
    new DocumentosDeRegistro(
      prisma as unknown as PrismaService,
      archivos as unknown as ArchivosService,
      CONFIG_SIN_BLOQUEO,
    );

  describe('subir', () => {
    it('guarda con la entidad de la config y engancha si el slot está vacío y no hay bloqueo', async () => {
      const resultado = await service.subir(88n, 'orden', makeMulter(), 5n);

      expect(prisma.destinos.findUnique).toHaveBeenCalledWith({
        where: { id: 88n },
        select: { id: true, archivo_orden_id: true, anulada_en: true },
      });
      expect(archivos.guardar).toHaveBeenCalledWith({
        entidad: 'destinos',
        entidadId: 88n,
        slot: 'orden',
        nombreOriginal: 'orden.pdf',
        buffer: PDF,
        mimetype: 'application/pdf',
        usuarioId: 5n,
      });
      expect(prisma.destinos.updateMany).toHaveBeenCalledWith({
        where: { id: 88n, archivo_orden_id: null, anulada_en: null },
        data: { archivo_orden_id: 87n },
      });
      expect(resultado).toEqual({
        nombre_original: 'orden.pdf',
        content_type: 'application/pdf',
        tamanio_bytes: BigInt(PDF.length),
        subido_en: SUBIDO_EN,
      });
    });

    it('sin bloqueo, solo condiciona a la columna null', async () => {
      await sinBloqueo().subir(88n, 'orden', makeMulter(), 5n);

      expect(prisma.destinos.findUnique).toHaveBeenCalledWith({
        where: { id: 88n },
        select: { id: true, archivo_orden_id: true },
      });
      expect(prisma.destinos.updateMany).toHaveBeenCalledWith({
        where: { id: 88n, archivo_orden_id: null },
        data: { archivo_orden_id: 87n },
      });
    });

    it('usa la columna archivo_boletin_id para el slot boletin', async () => {
      await service.subir(
        88n,
        'boletin',
        makeMulter({ originalname: 'boletin.pdf' }),
        5n,
      );

      expect(archivos.guardar).toHaveBeenCalledWith(
        expect.objectContaining({ slot: 'boletin' }),
      );
      expect(prisma.destinos.updateMany).toHaveBeenCalledWith({
        where: { id: 88n, archivo_boletin_id: null, anulada_en: null },
        data: { archivo_boletin_id: 87n },
      });
    });

    it('404 si el registro no existe, sin subir nada', async () => {
      prisma.destinos.findUnique.mockResolvedValue(null);

      await expect(
        service.subir(88n, 'orden', makeMulter(), 5n),
      ).rejects.toThrow(new NotFoundException('Destino no encontrado'));
      expect(archivos.guardar).not.toHaveBeenCalled();
    });

    it('409 si está bloqueado, sin subir nada', async () => {
      prisma.destinos.findUnique.mockResolvedValue(
        makeFila({ anulada_en: SUBIDO_EN }),
      );

      await expect(
        service.subir(88n, 'orden', makeMulter(), 5n),
      ).rejects.toThrow(new ConflictException('El destino está anulado'));
      expect(archivos.guardar).not.toHaveBeenCalled();
    });

    it('409 si el slot ya tiene documento, sin subir nada', async () => {
      prisma.destinos.findUnique.mockResolvedValue(
        makeFila({ archivo_orden_id: 50n }),
      );

      await expect(
        service.subir(88n, 'orden', makeMulter(), 5n),
      ).rejects.toThrow(
        new ConflictException(
          'El destino ya tiene un documento de orden. Quitalo antes de adjuntar otro.',
        ),
      );
      expect(archivos.guardar).not.toHaveBeenCalled();
    });

    it('si otro pedido ganó el slot (count 0), da de baja el archivo subido y responde 409', async () => {
      prisma.destinos.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.subir(88n, 'orden', makeMulter(), 5n),
      ).rejects.toThrow(
        new ConflictException(
          'El destino cambió mientras se subía el documento. Volvé a intentar.',
        ),
      );
      expect(archivos.eliminar).toHaveBeenCalledWith(87n, 5n);
    });

    it('si falla el update, da de baja el archivo y responde 500', async () => {
      prisma.destinos.updateMany.mockRejectedValue(new Error('db caída'));

      await expect(
        service.subir(88n, 'orden', makeMulter(), 5n),
      ).rejects.toThrow(
        new InternalServerErrorException('Error al registrar el documento'),
      );
      expect(archivos.eliminar).toHaveBeenCalledWith(87n, 5n);
    });
  });

  describe('obtener', () => {
    it('devuelve el stream del archivo del slot', async () => {
      prisma.destinos.findUnique.mockResolvedValue(
        makeFila({ archivo_boletin_id: 87n }),
      );
      const archivo = { stream: {}, nombre_original: 'boletin.pdf' };
      archivos.obtener.mockResolvedValue(archivo);

      await expect(service.obtener(88n, 'boletin')).resolves.toBe(archivo);
      expect(archivos.obtener).toHaveBeenCalledWith(87n);
    });

    it('404 si el registro no existe', async () => {
      prisma.destinos.findUnique.mockResolvedValue(null);

      await expect(service.obtener(88n, 'orden')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404 si el slot no tiene documento', async () => {
      await expect(service.obtener(88n, 'boletin')).rejects.toThrow(
        new NotFoundException('El destino no tiene documento de resolución'),
      );
      expect(archivos.obtener).not.toHaveBeenCalled();
    });
  });

  describe('metadatos', () => {
    const METADATOS = {
      nombre_original: 'orden.pdf',
      content_type: 'application/pdf',
      tamanio_bytes: 8n,
    };

    it('devuelve nombre, tipo y tamaño desde la base, sin bajar el archivo', async () => {
      prisma.destinos.findUnique.mockResolvedValue(
        makeFila({ archivo_orden_id: 87n }),
      );
      prisma.archivos.findFirst.mockResolvedValue(METADATOS);

      await expect(service.metadatos(88n, 'orden')).resolves.toEqual(METADATOS);
      expect(prisma.archivos.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 87n, eliminado_en: null } }),
      );
      expect(archivos.obtener).not.toHaveBeenCalled();
    });

    it('404 si el registro no existe', async () => {
      prisma.destinos.findUnique.mockResolvedValue(null);

      await expect(service.metadatos(88n, 'orden')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404 si el slot no tiene documento', async () => {
      await expect(service.metadatos(88n, 'boletin')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.archivos.findFirst).not.toHaveBeenCalled();
    });

    it('404 si el archivo ya fue dado de baja', async () => {
      prisma.destinos.findUnique.mockResolvedValue(
        makeFila({ archivo_orden_id: 87n }),
      );
      prisma.archivos.findFirst.mockResolvedValue(null);

      await expect(service.metadatos(88n, 'orden')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('quitar', () => {
    it('desengancha el slot y da de baja el archivo', async () => {
      prisma.destinos.findUnique.mockResolvedValue(
        makeFila({ archivo_orden_id: 87n }),
      );

      await expect(service.quitar(88n, 'orden', 5n)).resolves.toBeNull();
      expect(prisma.destinos.updateMany).toHaveBeenCalledWith({
        where: { id: 88n, archivo_orden_id: 87n },
        data: { archivo_orden_id: null },
      });
      expect(archivos.eliminar).toHaveBeenCalledWith(87n, 5n);
    });

    it('409 si está bloqueado', async () => {
      prisma.destinos.findUnique.mockResolvedValue(
        makeFila({ anulada_en: SUBIDO_EN, archivo_orden_id: 87n }),
      );

      await expect(service.quitar(88n, 'orden', 5n)).rejects.toThrow(
        new ConflictException('El destino está anulado'),
      );
      expect(prisma.destinos.updateMany).not.toHaveBeenCalled();
      expect(archivos.eliminar).not.toHaveBeenCalled();
    });

    it('404 si el slot no tiene documento', async () => {
      await expect(service.quitar(88n, 'orden', 5n)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.destinos.updateMany).not.toHaveBeenCalled();
    });

    it('404 si otro pedido ya lo quitó (count 0), sin dar de baja', async () => {
      prisma.destinos.findUnique.mockResolvedValue(
        makeFila({ archivo_orden_id: 87n }),
      );
      prisma.destinos.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.quitar(88n, 'orden', 5n)).rejects.toThrow(
        NotFoundException,
      );
      expect(archivos.eliminar).not.toHaveBeenCalled();
    });

    it('si falla la baja del archivo, el documento igual queda quitado', async () => {
      prisma.destinos.findUnique.mockResolvedValue(
        makeFila({ archivo_orden_id: 87n }),
      );
      archivos.eliminar.mockRejectedValue(new Error('minio caído'));

      await expect(service.quitar(88n, 'orden', 5n)).resolves.toBeNull();
    });
  });

  describe('subirAVarios', () => {
    beforeEach(() => {
      prisma.destinos.findMany.mockResolvedValue([{ id: 1n }, { id: 2n }]);
      archivos.guardar
        .mockResolvedValueOnce(makeArchivoPublico({ id: 87n }))
        .mockResolvedValueOnce(makeArchivoPublico({ id: 88n }));
    });

    it('guarda una copia por registro y engancha cada una', async () => {
      await expect(
        service.subirAVarios([1n, 2n], 'orden', makeMulter(), 5n),
      ).resolves.toEqual({
        adjuntados: 2,
      });

      expect(prisma.destinos.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1n, 2n] } },
        select: { id: true, archivo_orden_id: true },
      });
      expect(archivos.guardar).toHaveBeenCalledTimes(2);
      expect(archivos.guardar).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          entidad: 'destinos',
          entidadId: 1n,
          slot: 'orden',
        }),
      );
      expect(archivos.guardar).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          entidad: 'destinos',
          entidadId: 2n,
          slot: 'orden',
        }),
      );
      expect(prisma.destinos.updateMany).toHaveBeenCalledWith({
        where: { id: 1n, archivo_orden_id: null, anulada_en: null },
        data: { archivo_orden_id: 87n },
      });
      expect(prisma.destinos.updateMany).toHaveBeenCalledWith({
        where: { id: 2n, archivo_orden_id: null, anulada_en: null },
        data: { archivo_orden_id: 88n },
      });
      expect(archivos.eliminar).not.toHaveBeenCalled();
    });

    it('la copia que no engancha se da de baja y no se cuenta', async () => {
      prisma.destinos.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await expect(
        service.subirAVarios([1n, 2n], 'orden', makeMulter(), 5n),
      ).resolves.toEqual({
        adjuntados: 1,
      });
      expect(archivos.eliminar).toHaveBeenCalledTimes(1);
      expect(archivos.eliminar).toHaveBeenCalledWith(88n, 5n);
    });

    it('404 si algún registro no existe, sin subir nada', async () => {
      prisma.destinos.findMany.mockResolvedValue([{ id: 1n }]);

      await expect(
        service.subirAVarios([1n, 2n], 'orden', makeMulter(), 5n),
      ).rejects.toThrow(new NotFoundException('Destino no encontrado'));
      expect(archivos.guardar).not.toHaveBeenCalled();
    });

    it('409 si alguno ya tiene documento en el slot, sin subir nada', async () => {
      prisma.destinos.findMany.mockResolvedValue([
        { id: 1n, archivo_orden_id: null },
        { id: 2n, archivo_orden_id: 9n },
      ]);

      await expect(
        service.subirAVarios([1n, 2n], 'orden', makeMulter(), 5n),
      ).rejects.toThrow(ConflictException);
      expect(archivos.guardar).not.toHaveBeenCalled();
    });

    it('si falla una subida a mitad, corta con ese error y solo quedan las copias enganchadas', async () => {
      prisma.destinos.findMany.mockResolvedValue([
        { id: 1n },
        { id: 2n },
        { id: 3n },
      ]);
      archivos.guardar.mockRejectedValueOnce(new Error('minio caído'));
      prisma.destinos.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await expect(
        service.subirAVarios([1n, 2n, 3n], 'orden', makeMulter(), 5n),
      ).rejects.toThrow('minio caído');
      expect(archivos.eliminar).toHaveBeenCalledTimes(1);
      expect(archivos.eliminar).toHaveBeenCalledWith(88n, 5n);
    });
  });
});

describe('archivosDeFilas', () => {
  it('junta los ids no null de las dos columnas', () => {
    expect(
      archivosDeFilas([
        { archivo_orden_id: 1n, archivo_boletin_id: null },
        { archivo_orden_id: null, archivo_boletin_id: 2n },
        { archivo_orden_id: null, archivo_boletin_id: null },
        { archivo_orden_id: 3n, archivo_boletin_id: 4n },
      ]),
    ).toEqual([1n, 2n, 3n, 4n]);
  });

  it('archivosDeFilas ignora columnas ausentes', () => {
    expect(archivosDeFilas([{ archivo_orden_id: 5n } as any])).toEqual([5n]);
  });
});

describe('darDeBajaArchivos', () => {
  it('da de baja cada id con el usuario dado; si uno falla, loguea y sigue', async () => {
    const archivos = {
      eliminar: jest
        .fn()
        .mockRejectedValueOnce(new Error('minio caído'))
        .mockResolvedValueOnce(undefined),
    };
    const logger = { error: jest.fn() };

    await expect(
      darDeBajaArchivos(
        archivos as unknown as ArchivosService,
        [1n, 2n],
        5n,
        logger as unknown as Logger,
      ),
    ).resolves.toBeUndefined();
    expect(archivos.eliminar).toHaveBeenNthCalledWith(1, 1n, 5n);
    expect(archivos.eliminar).toHaveBeenNthCalledWith(2, 2n, 5n);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

describe('documentosDe', () => {
  it('sin relaciones devuelve los dos slots en null', () => {
    expect(documentosDe({})).toEqual({ orden: null, boletin: null });
  });
});

describe('aDocumento', () => {
  it('sin fila devuelve null', () => {
    expect(aDocumento(undefined)).toBeNull();
    expect(aDocumento(null)).toBeNull();
  });
});
