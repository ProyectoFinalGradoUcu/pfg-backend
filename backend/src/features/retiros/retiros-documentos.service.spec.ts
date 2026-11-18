import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { RetirosDocumentosService, aDocumentoRetiro } from './retiros-documentos.service';
import { PrismaService } from '../../lib/prisma.service';
import { ArchivosService } from '../archivos/archivos.service';

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const SUBIDO_EN = new Date('2026-11-06T12:00:00Z');

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

const makeRetiroFila = (overrides: Partial<any> = {}) => ({
  anulado: false,
  archivo_orden_id: null,
  archivo_boletin_id: null,
  ...overrides,
});

const makePrismaMock = () => ({
  retiros: { findUnique: jest.fn(), updateMany: jest.fn() },
  archivos: { findFirst: jest.fn() },
});

const makeArchivosMock = () => ({
  guardar: jest.fn(),
  obtener: jest.fn(),
  eliminar: jest.fn().mockResolvedValue(undefined),
});

describe('RetirosDocumentosService', () => {
  let service: RetirosDocumentosService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let archivos: ReturnType<typeof makeArchivosMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    archivos = makeArchivosMock();
    prisma.retiros.findUnique.mockResolvedValue(makeRetiroFila());
    prisma.retiros.updateMany.mockResolvedValue({ count: 1 });
    archivos.guardar.mockResolvedValue(makeArchivoPublico());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetirosDocumentosService,
        { provide: PrismaService, useValue: prisma },
        { provide: ArchivosService, useValue: archivos },
      ],
    }).compile();

    service = module.get(RetirosDocumentosService);
  });

  describe('subir', () => {
    it('guarda el archivo con entidad retiros y el slot, y lo engancha si el slot estaba vacío', async () => {
      const resultado = await service.subir(88, 'orden', makeMulter(), 5n);

      expect(archivos.guardar).toHaveBeenCalledWith(
        expect.objectContaining({
          entidad: 'retiros',
          entidadId: 88n,
          slot: 'orden',
          nombreOriginal: 'orden.pdf',
          mimetype: 'application/pdf',
          buffer: PDF,
          usuarioId: 5n,
        }),
      );
      expect(prisma.retiros.updateMany).toHaveBeenCalledWith({
        where: { id: 88n, anulado: false, archivo_orden_id: null },
        data: { archivo_orden_id: 87n },
      });
      expect(resultado).toEqual({
        nombre_original: 'orden.pdf',
        content_type: 'application/pdf',
        tamanio_bytes: BigInt(PDF.length),
        subido_en: SUBIDO_EN,
      });
    });

    it('usa la columna archivo_boletin_id para el slot boletin', async () => {
      await service.subir(88, 'boletin', makeMulter({ originalname: 'boletin.pdf' }), 5n);

      expect(archivos.guardar).toHaveBeenCalledWith(expect.objectContaining({ slot: 'boletin' }));
      expect(prisma.retiros.updateMany).toHaveBeenCalledWith({
        where: { id: 88n, anulado: false, archivo_boletin_id: null },
        data: { archivo_boletin_id: 87n },
      });
    });

    it('404 si el retiro no existe, sin subir nada', async () => {
      prisma.retiros.findUnique.mockResolvedValue(null);

      await expect(service.subir(88, 'orden', makeMulter(), 5n)).rejects.toThrow(NotFoundException);
      expect(archivos.guardar).not.toHaveBeenCalled();
    });

    it('409 si el retiro está anulado, sin subir nada', async () => {
      prisma.retiros.findUnique.mockResolvedValue(makeRetiroFila({ anulado: true }));

      await expect(service.subir(88, 'orden', makeMulter(), 5n)).rejects.toThrow(ConflictException);
      expect(archivos.guardar).not.toHaveBeenCalled();
    });

    it('409 si el slot ya tiene documento, sin subir nada', async () => {
      prisma.retiros.findUnique.mockResolvedValue(makeRetiroFila({ archivo_orden_id: 50n }));

      await expect(service.subir(88, 'orden', makeMulter(), 5n)).rejects.toThrow(
        'Quitalo antes de adjuntar otro',
      );
      expect(archivos.guardar).not.toHaveBeenCalled();
    });

    it('si otro pedido ganó el slot (count 0), da de baja el archivo subido y responde 409', async () => {
      prisma.retiros.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.subir(88, 'orden', makeMulter(), 5n)).rejects.toThrow(ConflictException);
      expect(archivos.eliminar).toHaveBeenCalledWith(87n, 5n);
    });

    it('si falla el update, da de baja el archivo y responde 500', async () => {
      prisma.retiros.updateMany.mockRejectedValue(new Error('db caída'));

      await expect(service.subir(88, 'orden', makeMulter(), 5n)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(archivos.eliminar).toHaveBeenCalledWith(87n, 5n);
    });
  });

  describe('obtener', () => {
    it('devuelve el stream del archivo del slot', async () => {
      prisma.retiros.findUnique.mockResolvedValue(makeRetiroFila({ archivo_boletin_id: 87n }));
      const archivo = { stream: {}, nombre_original: 'boletin.pdf' };
      archivos.obtener.mockResolvedValue(archivo);

      await expect(service.obtener(88, 'boletin')).resolves.toBe(archivo);
      expect(archivos.obtener).toHaveBeenCalledWith(87n);
    });

    it('404 si el retiro no existe', async () => {
      prisma.retiros.findUnique.mockResolvedValue(null);

      await expect(service.obtener(88, 'orden')).rejects.toThrow(NotFoundException);
    });

    it('404 si el slot no tiene documento', async () => {
      await expect(service.obtener(88, 'orden')).rejects.toThrow(NotFoundException);
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
      prisma.retiros.findUnique.mockResolvedValue(makeRetiroFila({ archivo_orden_id: 87n }));
      prisma.archivos.findFirst.mockResolvedValue(METADATOS);

      await expect(service.metadatos(88, 'orden')).resolves.toEqual(METADATOS);
      expect(prisma.archivos.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 87n, eliminado_en: null } }),
      );
      expect(archivos.obtener).not.toHaveBeenCalled();
    });

    it('404 si el retiro no existe', async () => {
      prisma.retiros.findUnique.mockResolvedValue(null);

      await expect(service.metadatos(88, 'orden')).rejects.toThrow(NotFoundException);
    });

    it('404 si el slot no tiene documento', async () => {
      await expect(service.metadatos(88, 'boletin')).rejects.toThrow(NotFoundException);
      expect(prisma.archivos.findFirst).not.toHaveBeenCalled();
    });

    it('404 si el archivo ya fue dado de baja', async () => {
      prisma.retiros.findUnique.mockResolvedValue(makeRetiroFila({ archivo_orden_id: 87n }));
      prisma.archivos.findFirst.mockResolvedValue(null);

      await expect(service.metadatos(88, 'orden')).rejects.toThrow(NotFoundException);
    });
  });

  describe('quitar', () => {
    it('desengancha el slot y da de baja el archivo', async () => {
      prisma.retiros.findUnique.mockResolvedValue(makeRetiroFila({ archivo_orden_id: 87n }));

      await expect(service.quitar(88, 'orden', 5n)).resolves.toBeNull();
      expect(prisma.retiros.updateMany).toHaveBeenCalledWith({
        where: { id: 88n, archivo_orden_id: 87n },
        data: { archivo_orden_id: null },
      });
      expect(archivos.eliminar).toHaveBeenCalledWith(87n, 5n);
    });

    it('409 si el retiro está anulado', async () => {
      prisma.retiros.findUnique.mockResolvedValue(
        makeRetiroFila({ anulado: true, archivo_orden_id: 87n }),
      );

      await expect(service.quitar(88, 'orden', 5n)).rejects.toThrow(ConflictException);
      expect(archivos.eliminar).not.toHaveBeenCalled();
    });

    it('404 si el slot no tiene documento', async () => {
      await expect(service.quitar(88, 'orden', 5n)).rejects.toThrow(NotFoundException);
      expect(prisma.retiros.updateMany).not.toHaveBeenCalled();
    });

    it('404 si otro pedido ya lo quitó (count 0), sin dar de baja', async () => {
      prisma.retiros.findUnique.mockResolvedValue(makeRetiroFila({ archivo_orden_id: 87n }));
      prisma.retiros.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.quitar(88, 'orden', 5n)).rejects.toThrow(NotFoundException);
      expect(archivos.eliminar).not.toHaveBeenCalled();
    });

    it('si falla la baja del archivo, el documento igual queda quitado', async () => {
      prisma.retiros.findUnique.mockResolvedValue(makeRetiroFila({ archivo_orden_id: 87n }));
      archivos.eliminar.mockRejectedValue(new Error('minio caído'));

      await expect(service.quitar(88, 'orden', 5n)).resolves.toBeNull();
    });
  });

  describe('aDocumentoRetiro', () => {
    it('sin fila devuelve null', () => {
      expect(aDocumentoRetiro(undefined)).toBeNull();
      expect(aDocumentoRetiro(null)).toBeNull();
    });
  });
});
