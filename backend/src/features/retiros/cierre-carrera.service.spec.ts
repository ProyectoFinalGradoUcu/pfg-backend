import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { CierreCarreraService } from './cierre-carrera.service';
import { RetirosService } from './retiros.service';
import { PrismaService } from '../../lib/prisma.service';
import { SesionesService } from '../../lib/sesiones/sesiones.service';
import {
  makeMotivoBaja,
  makePersonaMin,
  makePrismaMock,
  makeRelacion,
} from './retiros.factories';

describe('CierreCarreraService', () => {
  let service: CierreCarreraService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let sesiones: { invalidarUsuario: jest.Mock };
  let retiros: { calcularImpacto: jest.Mock };

  const impactoBase = () => ({
    persona: makePersonaMin(),
    relacion: makeRelacion(),
    destino: {
      id: 88n,
      unidad_id: 5n,
      fecha_inicio: new Date('2020-01-01'),
      fecha_fin: null,
      unidades: null,
    },
    inscripciones: [
      { id: 301n, cursos: { id: 9n, nombre_curso: 'Curso A' }, fecha_inicio: null, fecha_fin: null },
    ],
    usuario: { id: 7n, username: 'jperez', estado: 'activo' },
    vivienda: null,
    bloqueos: [],
  });

  const paramsBase = () => ({
    personaId: 100,
    fechaRetiro: new Date('2026-08-28'),
    motivoBajaId: 1,
    autorId: 7n,
    observaciones: 'Pase a retiro',
    cierres: { destino: true, inscripciones: [301], usuario: true },
  });

  beforeAll(async () => {
    prisma = makePrismaMock();
    sesiones = { invalidarUsuario: jest.fn() };
    retiros = { calcularImpacto: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CierreCarreraService,
        { provide: PrismaService, useValue: prisma },
        { provide: SesionesService, useValue: sesiones },
        { provide: RetirosService, useValue: retiros },
      ],
    }).compile();

    service = module.get<CierreCarreraService>(CierreCarreraService);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    );
    retiros.calcularImpacto.mockResolvedValue(impactoBase());
    prisma.motivos_baja.findUnique.mockResolvedValue(makeMotivoBaja());
    prisma.tipos_movimiento.findFirst.mockResolvedValue({ id: 8n, nombre: 'Retiro', es_alta: false });
    prisma.movimientos_laborales.create.mockResolvedValue({ id: 410n });
    prisma.relaciones_laborales.update.mockResolvedValue(makeRelacion({ estado: 'inactivo' }));
    prisma.retiros.create.mockResolvedValue({ id: 88n });
    prisma.destinos.update.mockResolvedValue({ id: 88n });
    prisma.funcionarios_cursos.updateMany.mockResolvedValue({ count: 1 });
    prisma.usuarios.update.mockResolvedValue({ id: 7n });
  });

  it('cierra la relacion con los tres campos y NO toca situacion_id', async () => {
    await service.cerrar(paramsBase());

    expect(prisma.relaciones_laborales.update).toHaveBeenCalledWith({
      where: { id: 45n },
      data: expect.objectContaining({
        estado: 'inactivo',
        fecha_fin: new Date('2026-08-28'),
        motivo_baja_id: 1n,
      }),
    });
    const data = prisma.relaciones_laborales.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('situacion_id');
    expect(data).toHaveProperty('fecha_actualizacion');
  });

  it('inserta el movimiento con tipo Retiro cuando el motivo es RETIRO_OBL', async () => {
    await service.cerrar(paramsBase());

    expect(prisma.tipos_movimiento.findFirst).toHaveBeenCalledWith({
      where: { nombre: 'Retiro', es_alta: false },
    });
    expect(prisma.movimientos_laborales.create).toHaveBeenCalledWith({
      data: {
        relacion_laboral_id: 45n,
        tipo_movimiento_id: 8n,
        fecha_movimiento: new Date('2026-08-28'),
        usuario_id: 7n,
        observaciones: 'Pase a retiro',
      },
    });
  });

  it('usa tipo Baja para cualquier motivo que no sea de retiro', async () => {
    prisma.motivos_baja.findUnique.mockResolvedValue(
      makeMotivoBaja({ id: 4n, codigo: 'FALLECIMIENTO' }),
    );
    prisma.tipos_movimiento.findFirst.mockResolvedValue({ id: 7n, nombre: 'Baja', es_alta: false });

    await service.cerrar({ ...paramsBase(), motivoBajaId: 4 });

    expect(prisma.tipos_movimiento.findFirst).toHaveBeenCalledWith({
      where: { nombre: 'Baja', es_alta: false },
    });
  });

  it('usa tipo Retiro tambien con RETIRO_VOL', async () => {
    prisma.motivos_baja.findUnique.mockResolvedValue(makeMotivoBaja({ id: 2n, codigo: 'RETIRO_VOL' }));

    await service.cerrar({ ...paramsBase(), motivoBajaId: 2 });

    expect(prisma.tipos_movimiento.findFirst).toHaveBeenCalledWith({
      where: { nombre: 'Retiro', es_alta: false },
    });
  });

  it('guarda el movimiento_laboral_id y los cierres_aplicados en el retiro', async () => {
    await service.cerrar(paramsBase());

    expect(prisma.retiros.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        persona_id: 100n,
        relacion_laboral_id: 45n,
        motivo_baja_id: 1n,
        movimiento_laboral_id: 410n,
        registrado_por: 7n,
        cierres_aplicados: {
          destino_id: '88',
          inscripciones_ids: ['301'],
          usuario_id: '7',
        },
      }),
    });
  });

  it('aplica solo los cierres elegidos', async () => {
    await service.cerrar({
      ...paramsBase(),
      cierres: { destino: false, inscripciones: [], usuario: true },
    });

    expect(prisma.destinos.update).not.toHaveBeenCalled();
    expect(prisma.funcionarios_cursos.updateMany).not.toHaveBeenCalled();
    expect(prisma.usuarios.update).toHaveBeenCalled();
    expect(prisma.retiros.create.mock.calls[0][0].data.cierres_aplicados).toEqual({
      destino_id: null,
      inscripciones_ids: [],
      usuario_id: '7',
    });
  });

  it('bloquea la cuenta con estado bloqueado e invalida sesiones', async () => {
    await service.cerrar(paramsBase());

    expect(prisma.usuarios.update).toHaveBeenCalledWith({
      where: { id: 7n },
      data: { estado: 'bloqueado' },
    });
    expect(sesiones.invalidarUsuario).toHaveBeenCalledWith(7n);
  });

  it('invalida sesiones despues de cerrar la transaccion, no adentro', async () => {
    await service.cerrar(paramsBase());

    const ultimaEscrituraEnTx = prisma.retiros.create.mock.invocationCallOrder[0];
    const invalidacion = sesiones.invalidarUsuario.mock.invocationCallOrder[0];

    expect(invalidacion).toBeGreaterThan(ultimaEscrituraEnTx);
  });

  it('no invalida sesiones si no se cerro la cuenta', async () => {
    await service.cerrar({
      ...paramsBase(),
      cierres: { destino: true, inscripciones: [301], usuario: false },
    });

    expect(sesiones.invalidarUsuario).not.toHaveBeenCalled();
  });

  it('cierra el destino con fecha_fin igual a la fecha del retiro', async () => {
    await service.cerrar(paramsBase());

    expect(prisma.destinos.update).toHaveBeenCalledWith({
      where: { id: 88n },
      data: { fecha_fin: new Date('2026-08-28') },
    });
  });

  it('da de baja la inscripcion con motivo y autor', async () => {
    await service.cerrar(paramsBase());

    expect(prisma.funcionarios_cursos.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [301n] } },
      data: expect.objectContaining({
        dado_de_baja: true,
        motivo_baja: 'Retiro del funcionario',
        dado_de_baja_por: 7n,
      }),
    });
  });

  it('recalcula el impacto en vez de confiar en el preview', async () => {
    await service.cerrar(paramsBase());

    expect(retiros.calcularImpacto).toHaveBeenCalledWith(100, new Date('2026-08-28'));
  });

  it('rechaza con 422 si el recalculo trae bloqueos', async () => {
    retiros.calcularImpacto.mockResolvedValue({
      ...impactoBase(),
      bloqueos: ['El funcionario ya tiene un retiro vigente.'],
    });

    await expect(service.cerrar(paramsBase())).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.retiros.create).not.toHaveBeenCalled();
  });

  it('rechaza si el motivo de baja no existe o no esta vigente', async () => {
    prisma.motivos_baja.findUnique.mockResolvedValue(null);

    await expect(service.cerrar(paramsBase())).rejects.toThrow(UnprocessableEntityException);
  });

  it('rechaza si el tipo de movimiento no esta en el catalogo', async () => {
    prisma.tipos_movimiento.findFirst.mockResolvedValue(null);

    await expect(service.cerrar(paramsBase())).rejects.toThrow(UnprocessableEntityException);
  });

  it('rechaza inscripciones que no son de esa persona', async () => {
    await expect(
      service.cerrar({
        ...paramsBase(),
        cierres: { destino: true, inscripciones: [999], usuario: true },
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('con forzarCascada cierra todo aunque cierres venga vacio', async () => {
    await service.cerrar({
      ...paramsBase(),
      cierres: { destino: false, inscripciones: [], usuario: false },
      forzarCascada: true,
    });

    expect(prisma.destinos.update).toHaveBeenCalled();
    expect(prisma.funcionarios_cursos.updateMany).toHaveBeenCalled();
    expect(prisma.usuarios.update).toHaveBeenCalled();
  });

  it('devuelve lo que efectivamente cerro', async () => {
    const result = await service.cerrar(paramsBase());

    expect(result).toEqual({
      retiroId: 88n,
      cerrado: { destino: '88', inscripciones: ['301'], usuario: '7' },
    });
  });
});
