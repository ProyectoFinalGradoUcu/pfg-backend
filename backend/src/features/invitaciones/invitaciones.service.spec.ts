import { InvitacionesService } from './invitaciones.service';

const makeFila = (id: number) => ({
  id: BigInt(id),
  email: `persona${id}@fau.mil.uy`,
  estado: 'pendiente',
  roles: ['Consulta'],
  persona_id: null,
  creado_en: new Date('2026-01-01T00:00:00Z'),
  expira_en: new Date('2026-01-03T00:00:00Z'),
  usado_en: null,
});

describe('InvitacionesService.listar', () => {
  const makeService = (filas = [makeFila(2), makeFila(1)], total = filas.length) => {
    const prisma = {
      invitaciones: {
        count: jest.fn().mockResolvedValue(total),
        findMany: jest.fn().mockResolvedValue(filas),
      },
      $transaction: jest.fn((operaciones: Promise<unknown>[]) => Promise.all(operaciones)),
    };
    const service = new InvitacionesService(prisma as never, {} as never, {} as never);
    return { service, prisma };
  };

  it('sin page ni pageSize devuelve el listado completo como array', async () => {
    const { service, prisma } = makeService();

    const resultado = await service.listar({ estado: 'pendiente' });

    expect(resultado).toHaveLength(2);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const args = prisma.invitaciones.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ estado: 'pendiente' });
    expect(args).not.toHaveProperty('skip');
    expect(args).not.toHaveProperty('take');
  });

  it('con page y pageSize devuelve esa página con el total de la consulta filtrada', async () => {
    const { service, prisma } = makeService([makeFila(1)], 21);

    const resultado = await service.listar({ estado: 'aceptada', page: 3, pageSize: 10 });

    expect(resultado).toEqual({
      items: [expect.objectContaining({ id: '1', email: 'persona1@fau.mil.uy', personaId: null })],
      total: 21,
      page: 3,
      pageSize: 10,
    });
    expect(prisma.invitaciones.count).toHaveBeenCalledWith({ where: { estado: 'aceptada' } });
    expect(prisma.invitaciones.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { estado: 'aceptada' }, skip: 20, take: 10 }),
    );
  });

  it('con solo page usa 10 registros por página', async () => {
    const { service, prisma } = makeService();

    await service.listar({ page: 1 });

    expect(prisma.invitaciones.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    );
  });

  it('desempata por id para que el orden entre páginas sea estable', async () => {
    const { service, prisma } = makeService();

    await service.listar({ page: 1, pageSize: 10 });

    expect(prisma.invitaciones.findMany.mock.calls[0][0].orderBy).toEqual([
      { creado_en: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('sin resultados no inventa páginas', async () => {
    const { service } = makeService([], 0);

    await expect(service.listar({ page: 1, pageSize: 10 })).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
    });
  });
});
