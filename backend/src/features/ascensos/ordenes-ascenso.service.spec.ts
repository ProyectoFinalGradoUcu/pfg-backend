import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { OrdenesAscensoService } from './ordenes-ascenso.service';
import { AscensoRegistroService } from './ascenso-registro.service';
import { ElegibilidadService } from './elegibilidad.service';
import { PrismaService } from '../../lib/prisma.service';
import { CreateOrdenDto } from './dto/create-orden.dto';
import { AnularDto } from './dto/anular.dto';
import { ResultadoElegibilidad } from './elegibilidad.evaluador';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeEvaluacion = (
  overrides: Partial<ResultadoElegibilidad> = {},
): ResultadoElegibilidad => ({
  persona: {
    id: '100',
    cedula: '12345678',
    nombre_completo: 'José Pérez',
    apellido: 'Pérez',
    unidad: { id: '5', denominacion: 'Base Aérea Nº 1' },
    escalafon: { id: '14', denominacion: 'Aerotécnicos' },
    situacion: { id: '7', codigo: 'SIT07', denominacion: 'Actividad' },
  },
  grado_actual: { id: '3', codigo: 'CBO_2DA', denominacion: 'Cbo. 2ª', orden: 2 },
  grado_destino: { id: '4', codigo: 'CBO_1RA', denominacion: 'Cbo. 1ª', orden: 3 },
  regla: { id: '40', nombre: 'Cbo. 2.ª → Cbo. 1.ª' },
  estado: 'PASIBLE',
  fecha_cumpliria: null,
  motivo: null,
  antiguedad_dias: 900,
  edad: 36,
  requisitos: [],
  ...overrides,
});

const makeAscensoFila = (overrides: Partial<any> = {}) => ({
  id: 900n,
  persona_id: 100n,
  grado_id: 4n,
  grado_anterior_id: 3n,
  fecha_ascenso: new Date('2027-02-01'),
  numero_orden: 'O.C.G.F.A. N.º 12.345',
  cumplia_requisitos: true,
  motivo_excepcion: null,
  evaluacion: null,
  anulado_en: null,
  motivo_anulacion: null,
  orden_ascenso_id: 70n,
  personas: {
    id: 100n,
    cedula: '12345678',
    primer_nombre: 'José',
    primer_apellido: 'Pérez',
  },
  grados: { id: 4n, codigo: 'CBO_1RA', denominacion: 'Cbo. 1ª' },
  grados_grado_anterior: { id: 3n, codigo: 'CBO_2DA', denominacion: 'Cbo. 2ª' },
  ascensos_reglas: { id: 40n, nombre: 'Cbo. 2.ª → Cbo. 1.ª' },
  usuario_registro: { id: 8n, username: 'admin@fau.mil.uy' },
  usuario_anulacion: null,
  ...overrides,
});

const makeOrdenFila = (overrides: Partial<any> = {}) => ({
  id: 70n,
  numero_orden: 'O.C.G.F.A. N.º 12.345',
  fecha_orden: new Date('2027-02-01'),
  boletin: null,
  observaciones: null,
  anulada_en: null,
  motivo_anulacion: null,
  creada_en: new Date('2027-02-02T10:00:00Z'),
  usuario_creacion: { id: 8n, username: 'admin@fau.mil.uy' },
  usuario_anulacion: null,
  ascensos: [makeAscensoFila()],
  ...overrides,
});

const dtoBase = (overrides: Partial<CreateOrdenDto> = {}): CreateOrdenDto => ({
  numero_orden: 'O.C.G.F.A. N.º 12.345',
  fecha_orden: '2027-02-01',
  funcionarios: [{ persona_id: 100 }],
  ...overrides,
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makePrismaMock = () => {
  const mock: any = {
    ascensos_ordenes: {
      create: jest.fn().mockResolvedValue({ id: 70n }),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    ascensos: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation((arg: any) =>
    typeof arg === 'function' ? arg(mock) : Promise.all(arg),
  );
  return mock;
};

describe('OrdenesAscensoService', () => {
  let service: OrdenesAscensoService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let registro: {
    registrarEnTransaccion: jest.Mock;
    anularEnTransaccion: jest.Mock;
    anular: jest.Mock;
  };
  let elegibilidad: { evaluarVarios: jest.Mock };

  beforeEach(async () => {
    prisma = makePrismaMock();
    registro = {
      registrarEnTransaccion: jest.fn().mockResolvedValue({ ascenso: { id: 900n } }),
      anularEnTransaccion: jest.fn().mockResolvedValue({ id: 900n }),
      anular: jest.fn().mockResolvedValue({ id: 900n, orden_ascenso_id: 70n }),
    };
    elegibilidad = {
      evaluarVarios: jest.fn().mockResolvedValue(new Map([['100', makeEvaluacion()]])),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdenesAscensoService,
        { provide: PrismaService, useValue: prisma },
        { provide: AscensoRegistroService, useValue: registro },
        { provide: ElegibilidadService, useValue: elegibilidad },
      ],
    }).compile();

    service = module.get<OrdenesAscensoService>(OrdenesAscensoService);
    prisma.ascensos_ordenes.findUnique.mockResolvedValue(makeOrdenFila());
  });

  // ─── Alta ───────────────────────────────────────────────────────────────────

  describe('crear', () => {
    it('crea la orden y registra un ascenso por funcionario en la misma transacción', async () => {
      await service.crear(dtoBase(), 8n, ['ascensos.registrar']);

      expect(prisma.ascensos_ordenes.create).toHaveBeenCalledTimes(1);
      expect(registro.registrarEnTransaccion).toHaveBeenCalledTimes(1);

      const params = registro.registrarEnTransaccion.mock.calls[0][1];
      expect(params.persona_id).toBe(100n);
      expect(params.grado_destino_id).toBe(4n);
      expect(params.orden_ascenso_id).toBe(70n);
      expect(params.numero_orden).toBe('O.C.G.F.A. N.º 12.345');
      expect(params.cumplia_requisitos).toBe(true);
    });

    it('sin número de orden ni boletín no crea nada', async () => {
      await expect(
        service.crear(
          { ...dtoBase(), numero_orden: undefined },
          8n,
          ['ascensos.registrar'],
        ),
        ).rejects.toThrow(BadRequestException);

      expect(prisma.ascensos_ordenes.create).not.toHaveBeenCalled();
    });

    it('con solo el boletín, el número de orden queda nulo', async () => {
      await service.crear(
        { ...dtoBase(), numero_orden: undefined, boletin: 'BOL-2027-02' },
        8n,
        ['ascensos.registrar'],
      );

      const data = prisma.ascensos_ordenes.create.mock.calls[0][0].data;
      expect(data.numero_orden).toBeNull();
      expect(data.boletin).toBe('BOL-2027-02');
      expect(registro.registrarEnTransaccion.mock.calls[0][1].numero_orden).toBeNull();
    });

    it('toma el grado destino de la regla vigente cuando no se indica', async () => {
      await service.crear(dtoBase(), 8n, []);

      expect(registro.registrarEnTransaccion.mock.calls[0][1].grado_destino_id).toBe(4n);
    });

    it('respeta el grado destino indicado a mano', async () => {
      await service.crear(
        dtoBase({ funcionarios: [{ persona_id: 100, grado_destino_id: 9 }] }),
        8n,
        [],
      );

      expect(registro.registrarEnTransaccion.mock.calls[0][1].grado_destino_id).toBe(9n);
    });

    it('usa la fecha de la orden si el funcionario no trae una propia', async () => {
      await service.crear(dtoBase(), 8n, []);

      expect(registro.registrarEnTransaccion.mock.calls[0][1].fecha_ascenso).toEqual(
        new Date('2027-02-01'),
      );
    });

    it('agrupa la evaluación por fecha: no consulta una vez por funcionario', async () => {
      elegibilidad.evaluarVarios.mockResolvedValue(
        new Map([
          ['100', makeEvaluacion()],
          ['101', makeEvaluacion({ persona: { ...makeEvaluacion().persona, id: '101' } })],
        ]),
      );

      await service.crear(
        dtoBase({ funcionarios: [{ persona_id: 100 }, { persona_id: 101 }] }),
        8n,
        [],
      );

      expect(elegibilidad.evaluarVarios).toHaveBeenCalledTimes(1);
      expect(elegibilidad.evaluarVarios).toHaveBeenCalledWith([100, 101], '2027-02-01');
    });

    it('evalúa aparte a quien asciende en otra fecha', async () => {
      elegibilidad.evaluarVarios.mockImplementation((ids: number[]) =>
        Promise.resolve(
          new Map(
            ids.map((id) => [
              String(id),
              makeEvaluacion({ persona: { ...makeEvaluacion().persona, id: String(id) } }),
            ]),
          ),
        ),
      );

      await service.crear(
        dtoBase({
          funcionarios: [{ persona_id: 100 }, { persona_id: 101, fecha_ascenso: '2027-03-01' }],
        }),
        8n,
        [],
      );

      expect(elegibilidad.evaluarVarios).toHaveBeenCalledTimes(2);
      expect(elegibilidad.evaluarVarios).toHaveBeenCalledWith([100], '2027-02-01');
      expect(elegibilidad.evaluarVarios).toHaveBeenCalledWith([101], '2027-03-01');
    });

    it('rechaza funcionarios repetidos en la misma orden', async () => {
      await expect(
        service.crear(
          dtoBase({ funcionarios: [{ persona_id: 100 }, { persona_id: 100 }] }),
          8n,
          [],
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.ascensos_ordenes.create).not.toHaveBeenCalled();
    });

    it('rechaza si no se sabe a qué grado asciende', async () => {
      elegibilidad.evaluarVarios.mockResolvedValue(
        new Map([['100', makeEvaluacion({ grado_destino: null, regla: null })]]),
      );

      await expect(service.crear(dtoBase(), 8n, [])).rejects.toThrow(BadRequestException);
    });

    // ── Excepción ───────────────────────────────────────────────────────────

    it('quien no cumple necesita motivo de excepción', async () => {
      elegibilidad.evaluarVarios.mockResolvedValue(
        new Map([['100', makeEvaluacion({ estado: 'BLOQUEADO', motivo: 'Le falta el curso' })]]),
      );

      await expect(
        service.crear(dtoBase(), 8n, ['ascensos.registrar', 'ascensos.excepcion']),
      ).rejects.toThrow(BadRequestException);
    });

    it('y también el permiso de excepción', async () => {
      elegibilidad.evaluarVarios.mockResolvedValue(
        new Map([['100', makeEvaluacion({ estado: 'BLOQUEADO', motivo: 'Le falta el curso' })]]),
      );

      await expect(
        service.crear(
          dtoBase({
            funcionarios: [{ persona_id: 100, motivo_excepcion: 'Vacante urgente' }],
          }),
          8n,
          ['ascensos.registrar'],
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('con motivo y permiso, la excepción se registra y queda marcada', async () => {
      elegibilidad.evaluarVarios.mockResolvedValue(
        new Map([['100', makeEvaluacion({ estado: 'BLOQUEADO', motivo: 'Le falta el curso' })]]),
      );

      await service.crear(
        dtoBase({ funcionarios: [{ persona_id: 100, motivo_excepcion: 'Vacante urgente' }] }),
        8n,
        ['ascensos.registrar', 'ascensos.excepcion'],
      );

      const params = registro.registrarEnTransaccion.mock.calls[0][1];
      expect(params.cumplia_requisitos).toBe(false);
      expect(params.motivo_excepcion).toBe('Vacante urgente');
      expect(params.evaluacion).toMatchObject({ estado: 'BLOQUEADO' });
    });

    it('sin regla evaluable no se afirma que cumplía ni que no cumplía', async () => {
      elegibilidad.evaluarVarios.mockResolvedValue(
        new Map([['100', makeEvaluacion({ estado: 'SIN_REGLA', regla: null })]]),
      );

      await service.crear(
        dtoBase({ funcionarios: [{ persona_id: 100, grado_destino_id: 4 }] }),
        8n,
        [],
      );

      const params = registro.registrarEnTransaccion.mock.calls[0][1];
      expect(params.cumplia_requisitos).toBeNull();
      expect(params.regla_id).toBeNull();
    });

    it('guarda la foto de la evaluación de cada funcionario', async () => {
      await service.crear(dtoBase(), 8n, []);

      expect(registro.registrarEnTransaccion.mock.calls[0][1].evaluacion).toMatchObject({
        estado: 'PASIBLE',
      });
    });
  });

  // ─── Consulta ───────────────────────────────────────────────────────────────

  describe('listar', () => {
    it('filtra por el año en curso cuando no se indica período', async () => {
      await service.listar();

      const where = prisma.ascensos_ordenes.findMany.mock.calls[0][0].where;
      expect(where.fecha_orden.gte.getUTCFullYear()).toBe(new Date().getUTCFullYear());
    });

    it('filtra solo las anuladas cuando se pide', async () => {
      await service.listar({ anuladas: true });

      expect(prisma.ascensos_ordenes.findMany.mock.calls[0][0].where.anulada_en).toEqual({
        not: null,
      });
    });

    it('con alcance de unidad solo trae órdenes que tocan esas unidades', async () => {
      await service.listar({}, { tipo: 'unidad', unidadIds: ['5'] });

      const where = prisma.ascensos_ordenes.findMany.mock.calls[0][0].where;
      expect(where.ascensos.some.relacion_laboral_nueva).toEqual({ unidad_id: { in: [5n] } });
    });

    it('cuenta ascensos, anulados y excepciones del período', async () => {
      prisma.ascensos_ordenes.count.mockResolvedValue(1);
      prisma.ascensos_ordenes.findMany
        .mockResolvedValueOnce([makeOrdenFila()])
        .mockResolvedValueOnce([
          {
            anulada_en: null,
            ascensos: [
              { anulado_en: null, cumplia_requisitos: true },
              { anulado_en: new Date(), cumplia_requisitos: false },
            ],
          },
        ]);

      const res = await service.listar();

      expect(res.stats.ordenes).toBe(1);
      expect(res.stats.ascensos).toBe(1);
      expect(res.stats.ascensos_anulados).toBe(1);
      expect(res.stats.por_excepcion).toBe(1);
    });

    it('el listado no arrastra la foto de evaluación de cada ascenso', async () => {
      prisma.ascensos_ordenes.count.mockResolvedValue(1);
      prisma.ascensos_ordenes.findMany.mockResolvedValue([makeOrdenFila()]);

      const res = await service.listar();

      expect(res.items[0].ascensos[0]).not.toHaveProperty('evaluacion');
    });
  });

  describe('obtener', () => {
    it('el detalle sí trae la foto de evaluación', async () => {
      prisma.ascensos_ordenes.findUnique.mockResolvedValue(
        makeOrdenFila({
          ascensos: [makeAscensoFila({ evaluacion: { estado: 'PASIBLE' } })],
        }),
      );

      const res = await service.obtener(70);

      expect(res.ascensos[0]).toHaveProperty('evaluacion');
      expect(res.cantidad_funcionarios).toBe(1);
    });

    it('devuelve 404 si la orden no existe', async () => {
      prisma.ascensos_ordenes.findUnique.mockResolvedValue(null);

      await expect(service.obtener(70)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Anulación ──────────────────────────────────────────────────────────────

  describe('anularOrden', () => {
    it('anula cada ascenso vigente y marca la orden', async () => {
      prisma.ascensos_ordenes.findUnique.mockResolvedValueOnce({
        id: 70n,
        numero_orden: 'O.C.G.F.A. N.º 12.345',
        anulada_en: null,
        ascensos: [
          { id: 900n, anulado_en: null },
          { id: 901n, anulado_en: null },
        ],
      });
      prisma.ascensos_ordenes.findUnique.mockResolvedValue(makeOrdenFila());

      await service.anularOrden(70, 'Se dejó sin efecto', 8n);

      expect(registro.anularEnTransaccion).toHaveBeenCalledTimes(2);
      expect(registro.anularEnTransaccion.mock.calls[0][1]).toBe(901n);
      expect(prisma.ascensos_ordenes.update.mock.calls[0][0].data.motivo_anulacion).toBe(
        'Se dejó sin efecto',
      );
    });

    it('no vuelve a anular una orden ya anulada', async () => {
      prisma.ascensos_ordenes.findUnique.mockResolvedValueOnce({
        id: 70n,
        numero_orden: 'X',
        anulada_en: new Date(),
        ascensos: [],
      });

      await expect(service.anularOrden(70, 'motivo', 8n)).rejects.toThrow(ConflictException);
    });

    it('no toca los ascensos que ya estaban anulados', async () => {
      prisma.ascensos_ordenes.findUnique.mockResolvedValueOnce({
        id: 70n,
        numero_orden: 'X',
        anulada_en: null,
        ascensos: [
          { id: 900n, anulado_en: new Date() },
          { id: 901n, anulado_en: null },
        ],
      });
      prisma.ascensos_ordenes.findUnique.mockResolvedValue(makeOrdenFila());

      await service.anularOrden(70, 'motivo', 8n);

      expect(registro.anularEnTransaccion).toHaveBeenCalledTimes(1);
    });

    it('si un ascenso no se puede revertir, no se anula ninguno', async () => {
      prisma.ascensos_ordenes.findUnique.mockResolvedValueOnce({
        id: 70n,
        numero_orden: 'X',
        anulada_en: null,
        ascensos: [{ id: 900n, anulado_en: null }],
      });
      registro.anularEnTransaccion.mockRejectedValue(
        new ConflictException('El ascenso ya fue liquidado'),
      );

      await expect(service.anularOrden(70, 'motivo', 8n)).rejects.toThrow(ConflictException);
      expect(prisma.ascensos_ordenes.update).not.toHaveBeenCalled();
    });
  });

  describe('anularAscenso', () => {
    it('anula uno solo y devuelve la orden actualizada', async () => {
      await service.anularAscenso(900, 'Se corrigió el grado', 8n);

      expect(registro.anular).toHaveBeenCalledWith(900n, {
        motivo: 'Se corrigió el grado',
        usuario_id: 8n,
      });
      expect(prisma.ascensos_ordenes.findUnique).toHaveBeenCalled();
    });
  });

  // ─── DTOs ───────────────────────────────────────────────────────────────────

  describe('DTOs', () => {
    it('una orden sin funcionarios se rechaza', async () => {
      const dto = plainToInstance(CreateOrdenDto, {
        numero_orden: 'O.C.G.F.A. N.º 1',
        fecha_orden: '2027-02-01',
        funcionarios: [],
      });
      const errores = await validate(dto);
      expect(errores.map((e) => e.property)).toContain('funcionarios');
    });

    it('sin número de orden ni boletín se rechaza', async () => {
      const dto = plainToInstance(CreateOrdenDto, {
        numero_orden: '',
        fecha_orden: '2027-02-01',
        funcionarios: [{ persona_id: 1 }],
      });
      const propiedades = (await validate(dto)).map((e) => e.property);
      expect(propiedades).toContain('numero_orden');
      expect(propiedades).toContain('boletin');
    });

    it('alcanza con el número de orden', async () => {
      const dto = plainToInstance(CreateOrdenDto, {
        numero_orden: 'O.C.G.F.A. N.º 1',
        fecha_orden: '2027-02-01',
        funcionarios: [{ persona_id: 1 }],
      });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('alcanza con el boletín', async () => {
      const dto = plainToInstance(CreateOrdenDto, {
        boletin: 'BOL-2027-02',
        fecha_orden: '2027-02-01',
        funcionarios: [{ persona_id: 1 }],
      });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('se pueden mandar los dos', async () => {
      const dto = plainToInstance(CreateOrdenDto, {
        numero_orden: 'O.C.G.F.A. N.º 1',
        boletin: 'BOL-2027-02',
        fecha_orden: '2027-02-01',
        funcionarios: [{ persona_id: 1 }],
      });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('anular exige un motivo con contenido', async () => {
      const vacio = plainToInstance(AnularDto, { motivo: '  ' });
      expect((await validate(vacio)).length).toBeGreaterThan(0);

      const bueno = plainToInstance(AnularDto, { motivo: 'Se dejó sin efecto' });
      expect(await validate(bueno)).toHaveLength(0);
    });
  });
});
