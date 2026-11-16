import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { OrdenesDocumentosService } from './ordenes-documentos.service.js';
import { PrismaService } from '../../lib/prisma.service';
import { ArchivosService } from '../archivos/archivos.service';

const makeMulter = () =>
  ({
    originalname: 'orden.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.alloc(8),
  }) as Express.Multer.File;

describe('OrdenesDocumentosService', () => {
  const armar = async (fila: any) => {
    const prisma = {
      ascensos_ordenes: {
        findUnique: jest.fn().mockResolvedValue(fila),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const archivos = {
      guardar: jest.fn().mockResolvedValue({
        id: 87n,
        nombre_original: 'orden.pdf',
        content_type: 'application/pdf',
        tamanio_bytes: 8n,
        subido_en: new Date(),
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdenesDocumentosService,
        { provide: PrismaService, useValue: prisma },
        { provide: ArchivosService, useValue: archivos },
      ],
    }).compile();
    return { service: module.get(OrdenesDocumentosService), prisma, archivos };
  };

  it('usa la config de órdenes de ascenso', async () => {
    const { service, prisma, archivos } = await armar({
      id: 9n,
      archivo_orden_id: null,
      anulada_en: null,
    });

    await service.subir(9n, 'orden', makeMulter(), 5n);

    expect(archivos.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: 'ascensos_ordenes', entidadId: 9n, slot: 'orden' }),
    );
    expect(prisma.ascensos_ordenes.updateMany).toHaveBeenCalled();
  });

  it('409 si la orden está anulada', async () => {
    const { service, archivos } = await armar({
      id: 9n,
      archivo_orden_id: null,
      anulada_en: new Date(),
    });

    await expect(service.subir(9n, 'orden', makeMulter(), 5n)).rejects.toThrow(ConflictException);
    expect(archivos.guardar).not.toHaveBeenCalled();
  });
});
