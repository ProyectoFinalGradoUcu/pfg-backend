import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PersonasFotoService } from './personas-foto.service';
import { PrismaService } from '../../lib/prisma.service';
import { ArchivosService } from '../archivos/archivos.service';
import { RESTRICCIONES_IMAGEN } from '../archivos/archivos.restricciones';

// ─── Factories ────────────────────────────────────────────────────────────────

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GLOBAL = { tipo: 'global' as const };
const UNIDAD = { tipo: 'unidad' as const, subUnidadIds: ['3'], comandoIds: [] };

const makeMulter = (overrides: Partial<any> = {}) =>
  ({
    originalname: 'foto.jpg',
    mimetype: 'image/jpeg',
    buffer: JPG,
    size: JPG.length,
    ...overrides,
  }) as Express.Multer.File;

const makeGuardado = (overrides: Partial<any> = {}) => ({
  id: 90n,
  nombre_original: 'foto.jpg',
  content_type: 'image/jpeg',
  tamanio_bytes: 6n,
  subido_en: new Date('2026-11-16T10:00:00Z'),
  subido_por: 1n,
  ...overrides,
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makePrismaMock = () => ({
  personas: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
});

const makeArchivosMock = () => ({
  guardar: jest.fn().mockResolvedValue(makeGuardado()),
  obtener: jest.fn(),
  eliminar: jest.fn().mockResolvedValue(undefined),
});

describe('PersonasFotoService', () => {
  let service: PersonasFotoService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let archivos: ReturnType<typeof makeArchivosMock>;

  const conFoto = (fotoId: bigint | null) =>
    prisma.personas.findUnique.mockResolvedValue({ id: 42n, foto_archivo_id: fotoId });

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma = makePrismaMock();
    archivos = makeArchivosMock();
    conFoto(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonasFotoService,
        { provide: PrismaService, useValue: prisma },
        { provide: ArchivosService, useValue: archivos },
      ],
    }).compile();
    service = module.get(PersonasFotoService);
  });

  afterEach(() => jest.restoreAllMocks());

  // ─── cargar ─────────────────────────────────────────────────────────────────

  describe('cargar', () => {
    it('guarda la imagen bajo personas/{id}/foto con las restricciones de imagen', async () => {
      await service.cargar(42, makeMulter(), 1n, GLOBAL);

      expect(archivos.guardar).toHaveBeenCalledWith({
        entidad: 'personas',
        entidadId: 42n,
        slot: 'foto',
        nombreOriginal: 'foto.jpg',
        buffer: JPG,
        mimetype: 'image/jpeg',
        usuarioId: 1n,
        restricciones: RESTRICCIONES_IMAGEN,
      });
    });

    it('sin foto previa, la engancha condicionado a que siga sin foto y devuelve su id', async () => {
      const resultado = await service.cargar(42, makeMulter(), 1n, GLOBAL);

      expect(prisma.personas.updateMany).toHaveBeenCalledWith({
        where: { id: 42n, foto_archivo_id: null },
        data: { foto_archivo_id: 90n },
      });
      expect(archivos.eliminar).not.toHaveBeenCalled();
      expect(resultado).toEqual({ foto_id: 90n });
    });

    it('con foto previa, la reemplaza y da de baja la anterior', async () => {
      conFoto(70n);

      await service.cargar(42, makeMulter(), 1n, GLOBAL);

      expect(prisma.personas.updateMany).toHaveBeenCalledWith({
        where: { id: 42n, foto_archivo_id: 70n },
        data: { foto_archivo_id: 90n },
      });
      expect(archivos.eliminar).toHaveBeenCalledTimes(1);
      expect(archivos.eliminar).toHaveBeenCalledWith(70n, 1n);
    });

    it('si la foto cambió mientras se subía, da de baja la nueva y responde 409', async () => {
      conFoto(70n);
      prisma.personas.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cargar(42, makeMulter(), 1n, GLOBAL)).rejects.toThrow(
        ConflictException,
      );
      expect(archivos.eliminar).toHaveBeenCalledTimes(1);
      expect(archivos.eliminar).toHaveBeenCalledWith(90n, 1n);
    });

    it('si falla el registro en base, da de baja la nueva, conserva la anterior y da 500', async () => {
      conFoto(70n);
      prisma.personas.updateMany.mockRejectedValue(new Error('db caída'));

      await expect(service.cargar(42, makeMulter(), 1n, GLOBAL)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(archivos.eliminar).toHaveBeenCalledTimes(1);
      expect(archivos.eliminar).toHaveBeenCalledWith(90n, 1n);
    });

    it('si falla la baja de la anterior, la carga igual responde bien', async () => {
      conFoto(70n);
      archivos.eliminar.mockRejectedValue(new Error('minio caído'));

      await expect(service.cargar(42, makeMulter(), 1n, GLOBAL)).resolves.toEqual({
        foto_id: 90n,
      });
    });

    it('si el archivo no pasa la validación, no toca la persona', async () => {
      archivos.guardar.mockRejectedValue(new BadRequestException('Solo JPG o PNG'));

      await expect(service.cargar(42, makeMulter(), 1n, GLOBAL)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.personas.updateMany).not.toHaveBeenCalled();
    });

    it('404 si el funcionario no existe', async () => {
      prisma.personas.findUnique.mockResolvedValue(null);

      await expect(service.cargar(999, makeMulter(), 1n, GLOBAL)).rejects.toThrow(
        NotFoundException,
      );
      expect(archivos.guardar).not.toHaveBeenCalled();
    });

    it('404 si el funcionario está fuera del alcance de unidad', async () => {
      prisma.personas.findFirst.mockResolvedValue(null);

      await expect(service.cargar(42, makeMulter(), 1n, UNIDAD)).rejects.toThrow(
        NotFoundException,
      );
      expect(archivos.guardar).not.toHaveBeenCalled();
    });
  });

  // ─── obtener ────────────────────────────────────────────────────────────────

  describe('obtener', () => {
    it('devuelve el archivo de la foto actual', async () => {
      conFoto(70n);
      const archivo = { stream: {}, content_type: 'image/jpeg' };
      archivos.obtener.mockResolvedValue(archivo);

      await expect(service.obtener(42, GLOBAL)).resolves.toBe(archivo);
      expect(archivos.obtener).toHaveBeenCalledWith(70n);
    });

    it('404 si el funcionario no tiene foto', async () => {
      await expect(service.obtener(42, GLOBAL)).rejects.toThrow('El funcionario no tiene foto');
      expect(archivos.obtener).not.toHaveBeenCalled();
    });

    it('404 si el funcionario está fuera del alcance de unidad', async () => {
      conFoto(70n);
      prisma.personas.findFirst.mockResolvedValue(null);

      await expect(service.obtener(42, UNIDAD)).rejects.toThrow(NotFoundException);
      expect(archivos.obtener).not.toHaveBeenCalled();
    });
  });

  // ─── quitar ─────────────────────────────────────────────────────────────────

  describe('quitar', () => {
    it('desengancha la foto condicionado a que siga siendo esa y la da de baja', async () => {
      conFoto(70n);

      await expect(service.quitar(42, 1n, GLOBAL)).resolves.toBeNull();

      expect(prisma.personas.updateMany).toHaveBeenCalledWith({
        where: { id: 42n, foto_archivo_id: 70n },
        data: { foto_archivo_id: null },
      });
      expect(archivos.eliminar).toHaveBeenCalledWith(70n, 1n);
    });

    it('404 si el funcionario no tiene foto', async () => {
      await expect(service.quitar(42, 1n, GLOBAL)).rejects.toThrow(NotFoundException);
      expect(prisma.personas.updateMany).not.toHaveBeenCalled();
    });

    it('404 si otro pedido la cambió en el medio, sin dar de baja nada', async () => {
      conFoto(70n);
      prisma.personas.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.quitar(42, 1n, GLOBAL)).rejects.toThrow(NotFoundException);
      expect(archivos.eliminar).not.toHaveBeenCalled();
    });

    it('si falla la baja en MinIO, igual responde bien', async () => {
      conFoto(70n);
      archivos.eliminar.mockRejectedValue(new Error('minio caído'));

      await expect(service.quitar(42, 1n, GLOBAL)).resolves.toBeNull();
    });
  });
});
