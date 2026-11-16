import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DesignacionesDocumentosService } from './designaciones-documentos.service';
import { PrismaService } from '../../lib/prisma.service';
import { ArchivosService } from '../archivos/archivos.service';
import { AlcanceResuelto } from '../../lib/alcance/alcance.types';

const GLOBAL: AlcanceResuelto = { tipo: 'global' };
const UNIDAD: AlcanceResuelto = { tipo: 'unidad', subUnidadIds: ['6'], comandoIds: ['2'] };

describe('DesignacionesDocumentosService', () => {
  const armar = async () => {
    const prisma = {
      funcionarios_cursos: {
        findUnique: jest.fn().mockResolvedValue({ id: 5n, archivo_orden_id: null }),
        findFirst: jest.fn().mockResolvedValue({ persona_id: 10n }),
        count: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      cursos: { findFirst: jest.fn().mockResolvedValue({ id: 1n }) },
      personas: { findFirst: jest.fn().mockResolvedValue({ id: 10n }) },
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
        DesignacionesDocumentosService,
        { provide: PrismaService, useValue: prisma },
        { provide: ArchivosService, useValue: archivos },
      ],
    }).compile();
    return { service: module.get(DesignacionesDocumentosService), prisma, archivos };
  };

  it('usa la config de designaciones', async () => {
    const { service, prisma, archivos } = await armar();

    await service.subir(
      5n,
      'orden',
      { originalname: 'orden.pdf', mimetype: 'application/pdf', buffer: Buffer.alloc(8) } as any,
      9n,
    );

    expect(archivos.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: 'funcionarios_cursos', entidadId: 5n, slot: 'orden' }),
    );
    expect(prisma.funcionarios_cursos.updateMany).toHaveBeenCalled();
  });

  describe('verificarVer', () => {
    it('404 si la designación no es del curso', async () => {
      const { service, prisma } = await armar();
      prisma.funcionarios_cursos.findFirst.mockResolvedValue(null);

      await expect(service.verificarVer(1n, 5n, GLOBAL)).rejects.toThrow(
        new NotFoundException('Designación no encontrada'),
      );
      expect(prisma.funcionarios_cursos.findFirst).toHaveBeenCalledWith({
        where: { id: 5n, curso_id: 1n },
        select: { persona_id: true },
      });
    });

    it('pasa si el curso es visible, sin mirar al funcionario', async () => {
      const { service, prisma } = await armar();

      await expect(service.verificarVer(1n, 5n, UNIDAD)).resolves.toBeUndefined();
      expect(prisma.personas.findFirst).not.toHaveBeenCalled();
    });

    it('ver: pasa si el curso no es visible pero el funcionario está en alcance', async () => {
      const { service, prisma } = await armar();
      prisma.cursos.findFirst.mockResolvedValue(null);

      await expect(service.verificarVer(1n, 5n, UNIDAD)).resolves.toBeUndefined();
      expect(prisma.personas.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 10n }) }),
      );
    });

    it('ver: 404 si ni el curso ni el funcionario están en alcance', async () => {
      const { service, prisma } = await armar();
      prisma.cursos.findFirst.mockResolvedValue(null);
      prisma.personas.findFirst.mockResolvedValue(null);

      await expect(service.verificarVer(1n, 5n, UNIDAD)).rejects.toThrow(
        new NotFoundException('Designación no encontrada'),
      );
    });

    it('un error que no es 404 no se tapa', async () => {
      const { service, prisma } = await armar();
      prisma.cursos.findFirst.mockRejectedValue(new Error('db caída'));

      await expect(service.verificarVer(1n, 5n, UNIDAD)).rejects.toThrow('db caída');
      expect(prisma.personas.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('verificarGestionar', () => {
    it('pasa si todas las designaciones son del curso gestionable', async () => {
      const { service, prisma } = await armar();
      prisma.funcionarios_cursos.count.mockResolvedValue(2);

      await expect(service.verificarGestionar(1n, [5n, 6n, 5n], UNIDAD)).resolves.toBeUndefined();
      expect(prisma.cursos.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1n, sub_unidad_id: { in: [6n] } } }),
      );
      expect(prisma.funcionarios_cursos.count).toHaveBeenCalledWith({
        where: { id: { in: [5n, 6n] }, curso_id: 1n },
      });
    });

    it('gestionar: 404 si una designación no es del curso', async () => {
      const { service, prisma } = await armar();
      prisma.funcionarios_cursos.count.mockResolvedValue(1);

      await expect(service.verificarGestionar(1n, [5n, 6n], GLOBAL)).rejects.toThrow(
        new NotFoundException('Designación no encontrada'),
      );
    });

    it('404 si el curso no es gestionable en el alcance, sin contar designaciones', async () => {
      const { service, prisma } = await armar();
      prisma.cursos.findFirst.mockResolvedValue(null);

      await expect(service.verificarGestionar(1n, [5n], UNIDAD)).rejects.toThrow(NotFoundException);
      expect(prisma.funcionarios_cursos.count).not.toHaveBeenCalled();
    });
  });
});
