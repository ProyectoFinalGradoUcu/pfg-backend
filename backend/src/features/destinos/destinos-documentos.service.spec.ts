import { Test, TestingModule } from '@nestjs/testing';
import { DestinosDocumentosService } from './destinos-documentos.service';
import { PrismaService } from '../../lib/prisma.service';
import { ArchivosService } from '../archivos/archivos.service';

describe('DestinosDocumentosService', () => {
  it('usa la config de destinos', async () => {
    const prisma = {
      destinos: {
        findUnique: jest.fn().mockResolvedValue({ archivo_orden_id: null, archivo_boletin_id: null }),
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
        DestinosDocumentosService,
        { provide: PrismaService, useValue: prisma },
        { provide: ArchivosService, useValue: archivos },
      ],
    }).compile();

    await module
      .get(DestinosDocumentosService)
      .subir(9n, 'orden', { originalname: 'orden.pdf', mimetype: 'application/pdf', buffer: Buffer.alloc(8) } as any, 5n);

    expect(archivos.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: 'destinos', entidadId: 9n, slot: 'orden' }),
    );
    expect(prisma.destinos.updateMany).toHaveBeenCalled();
  });
});
