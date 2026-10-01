import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ArchivosService, MINIO_CLIENT, calcularSha256 } from './archivos.service';
import { PrismaService } from '../../lib/prisma.service';

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const BUCKET = 'pfg-documents';

const makeArchivo = (overrides: Partial<any> = {}) => ({
  id: 87n,
  bucket: BUCKET,
  object_key: 'misiones/12/boletin/uuid-boletin.pdf',
  nombre_original: 'Boletín 042.pdf',
  content_type: 'application/pdf',
  tamanio_bytes: 8n,
  sha256: 'a'.repeat(64),
  subido_por: 3n,
  subido_en: new Date('2026-09-11T14:03:00Z'),
  eliminado_en: null,
  eliminado_por: null,
  ...overrides,
});

const makeInput = (overrides: Partial<any> = {}) => ({
  entidad: 'misiones',
  entidadId: 12n,
  slot: 'boletin',
  nombreOriginal: 'Boletín 042.pdf',
  buffer: PDF,
  mimetype: 'application/pdf',
  usuarioId: 3n,
  ...overrides,
});

const makePrismaMock = () => ({
  archivos: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
});

const makeMinioMock = () => ({
  bucketExists: jest.fn().mockResolvedValue(true),
  makeBucket: jest.fn(),
  putObject: jest.fn().mockResolvedValue(undefined),
  getObject: jest.fn(),
  removeObject: jest.fn().mockResolvedValue(undefined),
});

describe('ArchivosService', () => {
  let service: ArchivosService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let minio: ReturnType<typeof makeMinioMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    minio = makeMinioMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArchivosService,
        { provide: PrismaService, useValue: prisma },
        { provide: MINIO_CLIENT, useValue: minio },
        { provide: ConfigService, useValue: { get: () => BUCKET } },
      ],
    }).compile();

    service = module.get<ArchivosService>(ArchivosService);
  });

  describe('guardar', () => {
    it('sube el objeto y registra la fila', async () => {
      prisma.archivos.create.mockResolvedValue(makeArchivo());

      const resultado = await service.guardar(makeInput());

      expect(minio.putObject).toHaveBeenCalledTimes(1);
      expect(prisma.archivos.create).toHaveBeenCalledTimes(1);
      expect(resultado.id).toBe(87n);
    });

    it('no expone bucket, object key ni hash en lo que devuelve', async () => {
      prisma.archivos.create.mockResolvedValue(makeArchivo());

      const resultado = await service.guardar(makeInput());

      expect(resultado).toEqual({
        id: 87n,
        nombre_original: 'Boletín 042.pdf',
        content_type: 'application/pdf',
        tamanio_bytes: 8n,
        subido_en: new Date('2026-09-11T14:03:00Z'),
        subido_por: 3n,
      });
    });

    it('genera la object key con el prefijo de entidad, id y slot', async () => {
      prisma.archivos.create.mockResolvedValue(makeArchivo());

      await service.guardar(makeInput());

      const [bucket, key] = minio.putObject.mock.calls[0];
      expect(bucket).toBe(BUCKET);
      expect(key.startsWith('misiones/12/boletin/')).toBe(true);
    });

    it('un nombre con traversal no cambia el prefijo de la key', async () => {
      prisma.archivos.create.mockResolvedValue(makeArchivo());

      await service.guardar(makeInput({ nombreOriginal: '../../../secreto.pdf' }));

      const [, key] = minio.putObject.mock.calls[0];
      expect(key.startsWith('misiones/12/boletin/')).toBe(true);
      expect(key).not.toContain('..');
    });

    it('guarda el nombre original sin sanear en la fila', async () => {
      prisma.archivos.create.mockResolvedValue(makeArchivo());

      await service.guardar(makeInput());

      expect(prisma.archivos.create.mock.calls[0][0].data.nombre_original).toBe(
        'Boletín 042.pdf',
      );
    });

    it('calcula el sha256 del contenido', async () => {
      prisma.archivos.create.mockResolvedValue(makeArchivo());

      await service.guardar(makeInput());

      expect(prisma.archivos.create.mock.calls[0][0].data.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('rechaza un tipo que no está permitido', async () => {
      await expect(service.guardar(makeInput({ mimetype: 'application/zip' }))).rejects.toThrow(
        BadRequestException,
      );
      expect(minio.putObject).not.toHaveBeenCalled();
    });

    it('rechaza un archivo que supera el tamaño máximo', async () => {
      const grande = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);

      await expect(service.guardar(makeInput({ buffer: grande }))).rejects.toThrow(
        BadRequestException,
      );
      expect(minio.putObject).not.toHaveBeenCalled();
    });

    it('rechaza contenido que no coincide con el tipo declarado', async () => {
      const falso = Buffer.from('no soy un pdf', 'utf8');

      await expect(service.guardar(makeInput({ buffer: falso }))).rejects.toThrow(
        BadRequestException,
      );
      expect(minio.putObject).not.toHaveBeenCalled();
    });

    it('borra el objeto recién subido si falla el registro en base', async () => {
      prisma.archivos.create.mockRejectedValue(new Error('db caída'));

      await expect(service.guardar(makeInput())).rejects.toThrow(InternalServerErrorException);

      const [, keySubida] = minio.putObject.mock.calls[0];
      expect(minio.removeObject).toHaveBeenCalledWith(BUCKET, keySubida);
    });

    it('si MinIO falla al subir, da 500 con mensaje propio y no el error interno', async () => {
      minio.putObject.mockRejectedValueOnce(new Error('connect ECONNREFUSED 172.18.0.5:9000'));

      const error = await service.guardar(makeInput()).catch((e) => e);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect(error.message).toBe('Error al guardar el archivo');
      expect(prisma.archivos.create).not.toHaveBeenCalled();
    });
  });

  describe('obtener', () => {
    it('devuelve el stream con la metadata de la fila', async () => {
      prisma.archivos.findFirst.mockResolvedValue(makeArchivo());
      const stream = { pipe: jest.fn() };
      minio.getObject.mockResolvedValue(stream);

      const resultado = await service.obtener(87n);

      expect(minio.getObject).toHaveBeenCalledWith(
        BUCKET,
        'misiones/12/boletin/uuid-boletin.pdf',
      );
      expect(resultado).toEqual({
        stream,
        nombre_original: 'Boletín 042.pdf',
        content_type: 'application/pdf',
        tamanio_bytes: 8n,
      });
    });

    it('ignora las filas ya eliminadas', async () => {
      prisma.archivos.findFirst.mockResolvedValue(null);

      await expect(service.obtener(87n)).rejects.toThrow(NotFoundException);
      expect(prisma.archivos.findFirst.mock.calls[0][0].where).toEqual({
        id: 87n,
        eliminado_en: null,
      });
    });

    it('traduce NoSuchKey de MinIO a 404 y no a 500', async () => {
      prisma.archivos.findFirst.mockResolvedValue(makeArchivo());
      minio.getObject.mockRejectedValue(Object.assign(new Error('nope'), { code: 'NoSuchKey' }));

      await expect(service.obtener(87n)).rejects.toThrow(NotFoundException);
    });

    it('un error inesperado de MinIO sale como 500', async () => {
      prisma.archivos.findFirst.mockResolvedValue(makeArchivo());
      minio.getObject.mockRejectedValue(new Error('red caída'));

      await expect(service.obtener(87n)).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('eliminar', () => {
    it('marca la fila como eliminada y remueve el objeto', async () => {
      prisma.archivos.findFirst.mockResolvedValue(makeArchivo());

      await service.eliminar(87n, 3n);

      const argumentos = prisma.archivos.updateMany.mock.calls[0][0];
      expect(argumentos.where).toEqual({ id: 87n, eliminado_en: null });
      expect(argumentos.data.eliminado_por).toBe(3n);
      expect(argumentos.data.eliminado_en).toBeInstanceOf(Date);
      expect(minio.removeObject).toHaveBeenCalledWith(
        BUCKET,
        'misiones/12/boletin/uuid-boletin.pdf',
      );
    });

    it('404 si el archivo no existe o ya fue eliminado', async () => {
      prisma.archivos.findFirst.mockResolvedValue(null);

      await expect(service.eliminar(87n, 3n)).rejects.toThrow(NotFoundException);
      expect(minio.removeObject).not.toHaveBeenCalled();
    });

    it('si MinIO falla al remover, la fila igual queda marcada', async () => {
      prisma.archivos.findFirst.mockResolvedValue(makeArchivo());
      minio.removeObject.mockRejectedValue(new Error('red caída'));

      await expect(service.eliminar(87n, 3n)).resolves.toBeUndefined();
      expect(prisma.archivos.updateMany).toHaveBeenCalledTimes(1);
    });

    it('si otro pedido lo borró en el medio, 404 y no remueve el objeto dos veces', async () => {
      prisma.archivos.findFirst.mockResolvedValue(makeArchivo());
      prisma.archivos.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.eliminar(87n, 3n)).rejects.toThrow(NotFoundException);
      expect(minio.removeObject).not.toHaveBeenCalled();
    });
  });
});

describe('calcularSha256', () => {
  it('devuelve el sha256 en hexadecimal', () => {
    expect(calcularSha256(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
