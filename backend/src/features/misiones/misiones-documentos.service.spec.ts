import { Test, TestingModule } from '@nestjs/testing';
import {
  AsignacionesMisionDocumentosService,
  ConvocatoriasDocumentosService,
} from './misiones-documentos.service';
import { PrismaService } from '../../lib/prisma.service';
import { ArchivosService } from '../archivos/archivos.service';

describe.each([
  [ConvocatoriasDocumentosService, 'convocatorias'],
  [AsignacionesMisionDocumentosService, 'funcionarios_convocatorias'],
] as const)('%p', (Servicio, modelo) => {
  it(`usa la config de ${modelo}`, async () => {
    const prisma = {
      [modelo]: {
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
        Servicio,
        { provide: PrismaService, useValue: prisma },
        { provide: ArchivosService, useValue: archivos },
      ],
    }).compile();

    await module
      .get(Servicio)
      .subir(9n, 'orden', { originalname: 'orden.pdf', mimetype: 'application/pdf', buffer: Buffer.alloc(8) } as any, 5n);

    expect(archivos.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: modelo, entidadId: 9n, slot: 'orden' }),
    );
    expect((prisma as any)[modelo].updateMany).toHaveBeenCalled();
  });
});
