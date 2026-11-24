import { AuditoriaService } from './auditoria.service';
import { AuditoriaNombres } from './auditoria-nombres';
import { calcularCambios } from './auditoria-cambios';

describe('AuditoriaService', () => {
  let service: AuditoriaService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      acciones: { findUnique: jest.fn().mockResolvedValue({ id: 1n }) },
      contextos: { findUnique: jest.fn().mockResolvedValue({ id: 2n }) },
      bitacora_auditoria: { create: jest.fn().mockResolvedValue({ id: 99n }) },
    };
    service = new AuditoriaService(prisma, new AuditoriaNombres(prisma));
  });

  const detalleGuardado = () =>
    prisma.bitacora_auditoria.create.mock.calls[0][0].data.detalle;

  const registrar = (detalle: unknown) =>
    service.registrar({
      usuarioId: '1',
      accion: 'CREAR',
      contexto: 'Personas',
      detalle,
    });

  describe('filtros', () => {
    beforeEach(() => {
      prisma.acciones.findMany = jest.fn().mockResolvedValue([]);
      prisma.contextos.findMany = jest.fn().mockResolvedValue([]);
      prisma.usuarios = {
        findMany: jest.fn().mockResolvedValue([
          { id: 1n, username: 'activo@fau.mil.uy' },
          { id: 2n, username: 'bloqueado@fau.mil.uy' },
        ]),
      };
    });

    it('ofrece los usuarios de la aplicación sin filtrar por estado, para incluir a los bloqueados', async () => {
      const { usuarios } = await service.filtros();

      expect(usuarios).toEqual([
        { id: '1', username: 'activo@fau.mil.uy' },
        { id: '2', username: 'bloqueado@fau.mil.uy' },
      ]);
      expect(prisma.usuarios.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { aplicacion: 'personal' }, orderBy: { username: 'asc' } }),
      );
    });

    it('ofrece solo acciones y contextos usados en la bitácora de personal', async () => {
      await service.filtros();

      const where = { bitacora_auditoria: { some: { aplicacion: 'personal' } } };
      expect(prisma.acciones.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
      expect(prisma.contextos.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    });

    it('solo expone id y username', async () => {
      await service.filtros();

      expect(prisma.usuarios.findMany.mock.calls[0][0].select).toEqual({ id: true, username: true });
    });
  });

  describe('listar', () => {
    beforeEach(() => {
      prisma.bitacora_auditoria.count = jest.fn().mockResolvedValue(0);
      prisma.bitacora_auditoria.findMany = jest.fn().mockResolvedValue([]);
      prisma.$transaction = jest.fn((operaciones: Promise<unknown>[]) => Promise.all(operaciones));
    });

    it('combina usuario, acción, contexto y período, y el total respeta los mismos filtros', async () => {
      await service.listar({
        usuarioId: '7',
        accion: 'CREAR',
        contexto: 'Roles',
        desde: '2026-01-01',
        hasta: '2026-01-31',
        page: 2,
        pageSize: 20,
      });

      const args = prisma.bitacora_auditoria.findMany.mock.calls[0][0];
      expect(args.where).toEqual(
        expect.objectContaining({
          usuario_id: 7n,
          acciones: { nombre: 'CREAR' },
          contextos: { nombre: 'Roles' },
          fecha: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
        }),
      );
      expect(args.skip).toBe(20);
      expect(prisma.bitacora_auditoria.count).toHaveBeenCalledWith({ where: args.where });
    });

    it('un día sin hora se interpreta en hora de Uruguay (UTC-3), no en UTC', async () => {
      await service.listar({ desde: '2026-10-20', hasta: '2026-10-20' });

      const { fecha } = prisma.bitacora_auditoria.findMany.mock.calls[0][0].where;
      expect(fecha.gte.toISOString()).toBe('2026-10-20T03:00:00.000Z');
      expect(fecha.lte.toISOString()).toBe('2026-10-21T02:59:59.999Z');
    });

    it('sin usuario no filtra por usuario', async () => {
      await service.listar({});

      expect(prisma.bitacora_auditoria.findMany.mock.calls[0][0].where).not.toHaveProperty('usuario_id');
    });
  });

  describe('sanitización del detalle', () => {
    it('Serializa las fechas en ISO en vez de vaciarlas', async () => {
      await registrar({ fecha_inicio: new Date('2024-01-15T00:00:00.000Z') });
      expect(detalleGuardado()).toEqual({ fecha_inicio: '2024-01-15T00:00:00.000Z' });
    });

    it('Convierte BigInt a string', async () => {
      await registrar({ id: 42n });
      expect(detalleGuardado()).toEqual({ id: '42' });
    });

    it('Oculta los campos sensibles a cualquier profundidad', async () => {
      await registrar({ body: { username: 'jperez', password: 'secreto' } });
      expect(detalleGuardado()).toEqual({
        body: { username: 'jperez', password: '***' },
      });
    });

    it('Recorre arrays y objetos anidados', async () => {
      await registrar({
        resultado: { familiares: [{ cedula: '123', alta: new Date('2020-03-01T00:00:00.000Z') }] },
      });
      expect(detalleGuardado()).toEqual({
        resultado: { familiares: [{ cedula: '123', alta: '2020-03-01T00:00:00.000Z' }] },
      });
    });
  });

  describe('validación contra los catálogos', () => {
    it('No registra nada si la acción no existe', async () => {
      prisma.acciones.findUnique.mockResolvedValue(null);
      await registrar({ algo: 1 });
      expect(prisma.bitacora_auditoria.create).not.toHaveBeenCalled();
    });

    it('No registra nada si el contexto no existe', async () => {
      prisma.contextos.findUnique.mockResolvedValue(null);
      await registrar({ algo: 1 });
      expect(prisma.bitacora_auditoria.create).not.toHaveBeenCalled();
    });
  });

  describe('nombres y resumen', () => {
    const fila = (id: number, accion: string, entidad: string | null, entidadId: number | null, detalle: unknown) => ({
      id: BigInt(id),
      fecha: new Date('2026-11-20T12:00:00Z'),
      acciones: { nombre: accion },
      contextos: { nombre: 'X' },
      entidad,
      entidad_id: entidadId === null ? null : BigInt(entidadId),
      host: null,
      detalle,
      usuarios: { id: 1n, username: 'admin' },
    });

    const persona = (id: number, nombre: string, apellido: string, grado: string) => ({
      id: BigInt(id),
      primer_nombre: nombre,
      primer_apellido: apellido,
      relaciones_laborales: [{ grados: { denominacion: grado } }],
    });

    beforeEach(() => {
      prisma.$transaction = jest.fn((operaciones: Promise<unknown>[]) => Promise.all(operaciones));
      prisma.bitacora_auditoria.count = jest.fn().mockResolvedValue(3);
      prisma.personas = {
        findMany: jest.fn().mockResolvedValue([persona(5, 'Juan', 'Pérez', 'Sgto.'), persona(6, 'Ana', 'Gómez', 'Cbo. 1ª')]),
      };
      prisma.grados = { findMany: jest.fn().mockResolvedValue([{ id: 7n, denominacion: 'Sargento' }]) };
      prisma.roles = { findMany: jest.fn().mockResolvedValue([{ id: 4n, nombre: 'Administrador' }]) };
      prisma.usuarios = { findMany: jest.fn().mockResolvedValue([{ id: 33n, username: 'jperez@fau.mil.uy' }]) };
      prisma.misiones = { findMany: jest.fn().mockResolvedValue([{ id: 94n, nombre_mision: 'Antártida 2026' }]) };
    });

    it('resuelve los ids de toda la página con una consulta por tipo', async () => {
      prisma.bitacora_auditoria.findMany = jest.fn().mockResolvedValue([
        fila(1, 'CREAR', 'Destino', 10, { body: { service_request: { persona_id: 5, grado_id: 7 } } }),
        fila(2, 'CREAR', 'Curso', null, { body: { persona_ids: [5, 6] } }),
        fila(3, 'ELIMINAR', 'Misión', 94, { params: { misionId: '94' } }),
      ]);

      const { items } = await service.listar({});

      expect(prisma.personas.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.personas.findMany.mock.calls[0][0].where.id.in.sort()).toEqual([5n, 6n]);
      expect(items[0].nombres).toEqual({ 'persona_id:5': 'Sgto. Juan Pérez', 'grado_id:7': 'Sargento' });
      expect(items[1].nombres).toEqual({ 'persona_ids:5': 'Sgto. Juan Pérez', 'persona_ids:6': 'Cbo. 1ª Ana Gómez' });
      expect(items[2].entidadNombre).toBe('Antártida 2026');
      expect(items[2].nombres).toEqual({ 'misionId:94': 'Antártida 2026' });
    });

    it('si el registro ya no existe no lo incluye', async () => {
      prisma.bitacora_auditoria.findMany = jest.fn().mockResolvedValue([
        fila(1, 'ACTUALIZAR', 'Rol', 99, { params: { id: '99' }, body: { grado_id: 123 } }),
      ]);
      prisma.roles.findMany.mockResolvedValue([]);
      prisma.grados.findMany.mockResolvedValue([]);

      const [item] = (await service.listar({})).items;

      expect(item.nombres).toEqual({});
      expect(item.entidadNombre).toBeNull();
      expect(item.resumen).toBe('Modificó el rol');
    });

    it('si falla una consulta igual devuelve los demás nombres', async () => {
      prisma.bitacora_auditoria.findMany = jest.fn().mockResolvedValue([
        fila(1, 'CREAR', 'Destino', null, { body: { persona_id: 5, grado_id: 7 } }),
      ]);
      prisma.grados.findMany.mockRejectedValue(new Error('caída'));

      const [item] = (await service.listar({})).items;

      expect(item.nombres).toEqual({ 'persona_id:5': 'Sgto. Juan Pérez' });
    });

    it('el resumen usa la descripción guardada si la hay', async () => {
      prisma.bitacora_auditoria.findMany = jest.fn().mockResolvedValue([
        fila(1, 'ELIMINAR', 'Rol', 4, { descripcion: 'Eliminó el rol Viejo' }),
      ]);

      const [item] = (await service.listar({})).items;

      expect(item.resumen).toBe('Eliminó el rol Viejo');
      expect(item.entidadNombre).toBe('Administrador');
    });

    it('arma el resumen con verbo, entidad y nombre', async () => {
      prisma.bitacora_auditoria.findMany = jest.fn().mockResolvedValue([
        fila(1, 'CREAR', 'Misión', 94, {}),
        fila(2, 'ASIGNAR', 'Usuario', 33, { params: { id: '33', rolId: '4' } }),
        fila(3, 'LOGIN_FALLIDO', 'Usuario', 33, { username: 'jperez@fau.mil.uy' }),
        fila(4, 'retiro.anular', 'Retiro', null, {}),
        fila(5, 'CREAR', 'Reporte', null, null),
      ]);

      const resumenes = (await service.listar({})).items.map((i) => i.resumen);

      expect(resumenes).toEqual([
        'Creó la misión Antártida 2026',
        'Asignó el rol Administrador al usuario jperez@fau.mil.uy',
        'Intento fallido de inicio de sesión con el usuario jperez@fau.mil.uy',
        'Anuló el retiro',
        'Generó un reporte',
      ]);
    });

    it('la asignación a misión se nombra con la persona y la convocatoria', async () => {
      prisma.convocatorias = {
        findMany: jest.fn().mockResolvedValue([{ id: 8n, numero_orden: '12/2026', misiones: { nombre_mision: 'Antártida 2026' } }]),
      };
      prisma.bitacora_auditoria.findMany = jest.fn().mockResolvedValue([
        fila(1, 'ELIMINAR', 'Asignación a misión', null, { params: { misionId: '94', convocatoriaId: '8', personaId: '5' } }),
        fila(2, 'ELIMINAR', 'Asignación a misión', null, { params: { misionId: '94', convocatoriaId: '8' } }),
      ]);

      const [una, todas] = (await service.listar({})).items;

      expect(una.entidadNombre).toBe('Sgto. Juan Pérez en Antártida 2026 (orden 12/2026)');
      expect(una.resumen).toBe('Eliminó la asignación a misión de Sgto. Juan Pérez en Antártida 2026 (orden 12/2026)');
      expect(todas.entidadNombre).toBeNull();
      expect(todas.resumen).toBe('Quitó a todos los funcionarios de la convocatoria Antártida 2026 (orden 12/2026)');
    });

    it('las entidades de cursos salen por su param', async () => {
      prisma.funcionarios_cursos = {
        findMany: jest.fn().mockResolvedValue([
          { id: 3n, personas: persona(5, 'Juan', 'Pérez', 'Sgto.'), cursos: { nombre_curso: 'Mando' } },
        ]),
      };
      prisma.modulos_curso = { findMany: jest.fn().mockResolvedValue([{ id: 2n, nombre_modulo: 'Táctica' }]) };
      prisma.cursos = { findMany: jest.fn().mockResolvedValue([{ id: 1n, nombre_curso: 'Mando' }]) };
      prisma.bitacora_auditoria.findMany = jest.fn().mockResolvedValue([
        fila(1, 'ACTUALIZAR', 'Designación de curso', 99, { params: { cursoId: '1', designacionId: '3' } }),
        fila(2, 'ELIMINAR', 'Módulo de curso', null, { params: { cursoId: '1', moduloId: '2' } }),
        fila(3, 'ACTUALIZAR', 'Calificación de curso', 99, { params: { cursoId: '1' } }),
      ]);

      const resumenes = (await service.listar({})).items.map((i) => i.resumen);

      expect(resumenes).toEqual([
        'Modificó la designación de curso de Sgto. Juan Pérez en Mando',
        'Eliminó el módulo de curso Táctica',
        'Registró resultados del curso Mando',
      ]);
    });

    it('sin acción conocida ni entidad el resumen es null', async () => {
      prisma.bitacora_auditoria.findMany = jest.fn().mockResolvedValue([fila(1, 'OtraCosa', null, null, null)]);

      const [item] = (await service.listar({})).items;

      expect(item.resumen).toBeNull();
    });
  });

  describe('cambios', () => {
    it('solo devuelve los campos que cambiaron', () => {
      const antes = { telefono: '099', grado: 'Cabo', alta: new Date('2020-01-01T00:00:00Z'), roles: ['A', 'B'], email: '' };
      const despues = { telefono: '099', grado: 'Sargento', alta: new Date('2020-01-01T00:00:00Z'), roles: ['B', 'A'], email: null };

      expect(calcularCambios(antes, despues)).toEqual([{ campo: 'grado', anterior: 'Cabo', nuevo: 'Sargento' }]);
    });

    it('fechas sin hora quedan como YYYY-MM-DD', () => {
      expect(calcularCambios({ alta: null }, { alta: new Date('2024-03-01T00:00:00Z') })).toEqual([
        { campo: 'alta', anterior: null, nuevo: '2024-03-01' },
      ]);
    });

    it('oculta los valores de campos sensibles', async () => {
      await registrar({ cambios: [{ campo: 'password', anterior: 'a', nuevo: 'b' }] });
      expect(detalleGuardado()).toEqual({ cambios: [{ campo: 'password', anterior: '***', nuevo: '***' }] });
    });
  });
});
