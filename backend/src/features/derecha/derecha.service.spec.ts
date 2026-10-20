import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DerechaService } from './derecha.service';
import { PrismaService } from '../../lib/prisma.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const GRADOS = {
  GRAL: 15n,
  BRIG: 14n,
  CNEL: 13n,
  SOM: 6n,
  SGTO: 4n,
  CADETE: 30n,
};
const ESC = { AV: 1n, NAV: 2n, ST: 13n };

const makeJerarquia = () => [
  { grado_id: GRADOS.GRAL, escala: 'OFICIALES', posicion: 1, grados: { codigo: 'GRAL', denominacion: 'Gral.' } },
  { grado_id: GRADOS.BRIG, escala: 'OFICIALES', posicion: 2, grados: { codigo: 'BRIG_GRAL', denominacion: 'Brig. Gral.' } },
  { grado_id: GRADOS.CNEL, escala: 'OFICIALES', posicion: 3, grados: { codigo: 'CNEL', denominacion: 'Cnel.' } },
  { grado_id: GRADOS.SOM, escala: 'SUBALTERNOS', posicion: 1, grados: { codigo: 'SOM', denominacion: 'S.O.M.' } },
  { grado_id: GRADOS.SGTO, escala: 'SUBALTERNOS', posicion: 2, grados: { codigo: 'SGTO', denominacion: 'Sgto.' } },
];

const makeEscalafones = () => [
  { id: ESC.AV, codigo: 'AV' },
  { id: ESC.NAV, codigo: 'NAV' },
  { id: ESC.ST, codigo: 'ST' },
];

const makeRelacion = (overrides: Partial<any> = {}) => ({
  id: 1n,
  persona_id: 1n,
  grado_id: GRADOS.CNEL,
  escalafon_id: ESC.AV,
  derecha: null as number | null,
  numor: null as number | null,
  escala_derecha: null as string | null,
  fecha_fin: null as Date | null,
  estado: 'activo',
  fecha_inicio: new Date('2010-01-01'),
  fecha_ultimo_ascenso: null as Date | null,
  egreso_eta: null as Date | null,
  ...overrides,
});

/**
 * Oficiales: Gral (p1) · Brig: p2 AV, p3 NAV, p4 AV · Cnel: p5 AV, p6 NAV · p10 Cnel AV sin derecha.
 * Subalternos: S.O.M. p7 · Sgto: p8, p9.
 */
const makeFilas = () => {
  const of = (id: bigint, grado: bigint, esc: bigint, derecha: number, numor: number) =>
    makeRelacion({ id, persona_id: id, grado_id: grado, escalafon_id: esc, derecha, numor, escala_derecha: 'OFICIALES' });
  const sub = (id: bigint, grado: bigint, derecha: number, numor: number) =>
    makeRelacion({ id, persona_id: id, grado_id: grado, escalafon_id: ESC.ST, derecha, numor, escala_derecha: 'SUBALTERNOS' });
  return [
    of(1n, GRADOS.GRAL, ESC.AV, 1, 1),
    of(2n, GRADOS.BRIG, ESC.AV, 2, 1),
    of(3n, GRADOS.BRIG, ESC.NAV, 3, 1),
    of(4n, GRADOS.BRIG, ESC.AV, 4, 2),
    of(5n, GRADOS.CNEL, ESC.AV, 5, 1),
    of(6n, GRADOS.CNEL, ESC.NAV, 6, 1),
    sub(7n, GRADOS.SOM, 1, 1),
    sub(8n, GRADOS.SGTO, 2, 1),
    sub(9n, GRADOS.SGTO, 3, 2),
    makeRelacion({ id: 10n, persona_id: 10n, grado_id: GRADOS.CNEL, escalafon_id: ESC.AV }),
  ];
};

// ─── Prisma mock (base en memoria) ────────────────────────────────────────────

const conPersona = (r: any) => ({
  ...r,
  personas: {
    cedula: `C${r.persona_id}`,
    primer_nombre: `Nombre${r.persona_id}`,
    segundo_nombre: null,
    primer_apellido: `Apellido${r.persona_id}`,
    segundo_apellido: null,
    legajo_militar: { fecha_egreso_eta: r.egreso_eta },
  },
});

const makePrismaMock = (filas = makeFilas()) => {
  const historial: any[] = [];
  const mock: any = {
    filas,
    historial,
    $executeRaw: jest.fn(),
    derecha_jerarquia_grados: { findMany: jest.fn().mockResolvedValue(makeJerarquia()) },
    escalafones: { findMany: jest.fn().mockResolvedValue(makeEscalafones()) },
    relaciones_laborales: {
      findMany: jest.fn(async ({ where }: any) => {
        if (where?.id?.in) {
          const ids = where.id.in.map(String);
          return filas.filter((r) => ids.includes(String(r.id))).map(conPersona);
        }
        return filas.filter((r) => r.derecha !== null || r.numor !== null).map(conPersona);
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const r = filas.find(
          (x) => x.persona_id === where.persona_id && x.fecha_fin === null && x.estado === 'activo',
        );
        return r ? conPersona(r) : null;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const r = filas.find((x) => x.id === where.id);
        return r ? conPersona(r) : null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const r = filas.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      }),
    },
    historial_derecha_numor: {
      createMany: jest.fn(async ({ data }: any) => {
        historial.push(...data);
        return { count: data.length };
      }),
    },
  };
  mock.$transaction = jest.fn((cb: any) => cb(mock));
  return mock;
};

// ─── Invariantes ──────────────────────────────────────────────────────────────

const posicionJerarquia = new Map(makeJerarquia().map((j) => [String(j.grado_id), j]));

const verificarInvariantes = (filas: any[]) => {
  const activas = filas.filter(
    (r) => r.fecha_fin === null && r.estado === 'activo' && r.derecha !== null,
  );

  for (const escala of ['OFICIALES', 'SUBALTERNOS']) {
    const deEscala = activas
      .filter((r) => r.escala_derecha === escala)
      .sort((a, b) => a.derecha - b.derecha);
    expect(deEscala.map((r) => r.derecha)).toEqual(deEscala.map((_, i) => i + 1));
    for (let i = 1; i < deEscala.length; i++) {
      const anterior = posicionJerarquia.get(String(deEscala[i - 1].grado_id))!.posicion;
      const actual = posicionJerarquia.get(String(deEscala[i].grado_id))!.posicion;
      expect(actual).toBeGreaterThanOrEqual(anterior);
    }
  }

  const grupos = new Map<string, number[]>();
  for (const r of activas) {
    const clave = `${r.grado_id}-${r.escalafon_id}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), r.numor]);
  }
  for (const numores of grupos.values()) {
    expect([...numores].sort((a, b) => a - b)).toEqual(numores.map((_, i) => i + 1));
  }

  for (const r of filas.filter((x) => x.fecha_fin !== null || x.estado !== 'activo')) {
    expect(r.derecha).toBeNull();
    expect(r.numor).toBeNull();
  }
};

const valores = (filas: any[], personaId: bigint) => {
  const r = filas.find((x) => x.persona_id === personaId && x.fecha_fin === null)!;
  return { derecha: r.derecha, numor: r.numor };
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DerechaService', () => {
  let service: DerechaService;
  let prisma: ReturnType<typeof makePrismaMock>;

  const crear = async (filas?: any[]) => {
    prisma = makePrismaMock(filas);
    const module: TestingModule = await Test.createTestingModule({
      providers: [DerechaService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(DerechaService);
  };

  beforeEach(() => crear());

  describe('listarPersonal', () => {
    it('lista todo el padrón por escala y derecha, con grado y escalafón', async () => {
      const r = await service.listarPersonal();
      expect(r.map((x) => [x.persona_id, x.derecha])).toEqual([
        ['1', 1], ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6], ['7', 1], ['8', 2], ['9', 3],
      ]);
      expect(r[5]).toEqual(
        expect.objectContaining({ grado: 'Cnel.', escala: 'OFICIALES', escalafon: 'NAV', derecha: 6, numor: 1 }),
      );
    });
  });

  describe('asignarEnAlta', () => {
    it('sin posición lo ubica al final de su grado y de su grupo de numor', async () => {
      await service.asignarEnAlta(10n);

      expect(valores(prisma.filas, 10n)).toEqual({ derecha: 7, numor: 2 });
      expect(valores(prisma.filas, 6n)).toEqual({ derecha: 6, numor: 1 });
      expect(prisma.filas.find((r: any) => r.id === 10n).escala_derecha).toBe('OFICIALES');
      verificarInvariantes(prisma.filas);
    });

    it('en el medio corre +1 al resto del grado sin tocar a la otra escala', async () => {
      const r = await service.asignarEnAlta(10n, 1, 1);

      expect(valores(prisma.filas, 10n)).toEqual({ derecha: 5, numor: 1 });
      expect(valores(prisma.filas, 5n)).toEqual({ derecha: 6, numor: 2 });
      expect(valores(prisma.filas, 6n)).toEqual({ derecha: 7, numor: 1 });
      expect(valores(prisma.filas, 7n)).toEqual({ derecha: 1, numor: 1 });
      expect(r.afectados).toBe(3);
      verificarInvariantes(prisma.filas);
    });

    it('rechaza una posición fuera del bloque del grado', async () => {
      await expect(service.asignarEnAlta(10n, 4)).rejects.toThrow(BadRequestException);
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
    });

    it('rechaza a un funcionario que no está en actividad', async () => {
      const filas = makeFilas();
      filas.find((r) => r.id === 10n)!.fecha_fin = new Date('2025-01-01');
      filas.find((r) => r.id === 10n)!.estado = 'inactivo';
      await crear(filas);

      await expect(service.asignarEnAlta(10n)).rejects.toThrow(BadRequestException);
    });

    it('rechaza a quien ya tiene derecha', async () => {
      await expect(service.asignarEnAlta(5n)).rejects.toThrow(ConflictException);
    });

    it('en un grado sin derecha (cadetes) no asigna nada', async () => {
      const filas = makeFilas();
      filas.push(makeRelacion({ id: 11n, persona_id: 11n, grado_id: GRADOS.CADETE, escalafon_id: ESC.ST }));
      await crear(filas);

      const r = await service.asignarEnAlta(11n);

      expect(r.afectados).toBe(0);
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
    });
  });

  describe('quitarPorInactividad', () => {
    it('pone null y recompacta derecha y numor', async () => {
      const r3 = prisma.filas.find((r: any) => r.id === 3n);
      r3.fecha_fin = new Date('2026-01-01');
      r3.estado = 'inactivo';

      await service.quitarPorInactividad(3n, { motivo: 'Retiro', usuarioId: 99n });

      expect(r3.derecha).toBeNull();
      expect(r3.numor).toBeNull();
      expect(r3.escala_derecha).toBeNull();
      expect(valores(prisma.filas, 4n)).toEqual({ derecha: 3, numor: 2 });
      expect(valores(prisma.filas, 5n)).toEqual({ derecha: 4, numor: 1 });
      expect(valores(prisma.filas, 6n)).toEqual({ derecha: 5, numor: 1 });
      verificarInvariantes(prisma.filas);

      const loteIds = new Set(prisma.historial.map((h: any) => h.lote_id));
      expect(loteIds.size).toBe(1);
      expect(prisma.historial.every((h: any) => h.operacion === 'BAJA' && h.usuario_id === 99n)).toBe(true);
      expect(prisma.historial).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ persona_id: 3n, tipo: 'DERECHA', valor_anterior: 3, valor_nuevo: null }),
          expect.objectContaining({ persona_id: 3n, tipo: 'NUMOR', valor_anterior: 1, valor_nuevo: null }),
        ]),
      );
    });

    it('recompacta el numor del grupo cuando sale alguien del medio', async () => {
      const r2 = prisma.filas.find((r: any) => r.id === 2n);
      r2.fecha_fin = new Date('2026-01-01');
      r2.estado = 'inactivo';

      await service.quitarPorInactividad(2n);

      expect(valores(prisma.filas, 4n)).toEqual({ derecha: 3, numor: 1 });
      verificarInvariantes(prisma.filas);
    });
  });

  describe('reordenarEnGrado', () => {
    it('hacia arriba corre +1 a los que quedan debajo', async () => {
      await service.reordenarEnGrado(Number(GRADOS.BRIG), 4, 1);

      expect(valores(prisma.filas, 4n).derecha).toBe(2);
      expect(valores(prisma.filas, 2n).derecha).toBe(3);
      expect(valores(prisma.filas, 3n).derecha).toBe(4);
      verificarInvariantes(prisma.filas);
    });

    it('hacia abajo corre -1 a los que estaban debajo', async () => {
      await service.reordenarEnGrado(Number(GRADOS.BRIG), 2, 3);

      expect(valores(prisma.filas, 3n).derecha).toBe(2);
      expect(valores(prisma.filas, 4n).derecha).toBe(3);
      expect(valores(prisma.filas, 2n).derecha).toBe(4);
      verificarInvariantes(prisma.filas);
    });

    it('no toca el numor', async () => {
      await service.reordenarEnGrado(Number(GRADOS.BRIG), 4, 1);

      expect(valores(prisma.filas, 4n).numor).toBe(2);
      expect(valores(prisma.filas, 2n).numor).toBe(1);
      expect(prisma.historial.every((h: any) => h.tipo === 'DERECHA')).toBe(true);
    });

    it('persiste solo las filas que cambiaron', async () => {
      await service.reordenarEnGrado(Number(GRADOS.BRIG), 3, 1);

      const actualizadas = prisma.relaciones_laborales.update.mock.calls.map((c: any) => c[0].where.id);
      expect(actualizadas.sort()).toEqual([2n, 3n]);
    });

    it('rechaza una posición fuera del bloque del grado', async () => {
      await expect(service.reordenarEnGrado(Number(GRADOS.BRIG), 2, 4)).rejects.toThrow(
        'fuera del rango del grado Brig. Gral. (de 1 a 3)',
      );
      await expect(service.reordenarEnGrado(Number(GRADOS.BRIG), 2, 0)).rejects.toThrow(BadRequestException);
    });

    it('rechaza a un funcionario que no está en el grado', async () => {
      await expect(service.reordenarEnGrado(Number(GRADOS.BRIG), 5, 1)).rejects.toThrow(BadRequestException);
    });

    it('con el orden completo exige una permutación del grado', async () => {
      await expect(service.ordenarGrado(Number(GRADOS.BRIG), [2, 3])).rejects.toThrow(BadRequestException);
      await expect(service.ordenarGrado(Number(GRADOS.BRIG), [2, 2, 3])).rejects.toThrow(BadRequestException);

      await service.ordenarGrado(Number(GRADOS.BRIG), [3, 4, 2]);

      expect([3n, 4n, 2n].map((p) => valores(prisma.filas, p).derecha)).toEqual([2, 3, 4]);
      verificarInvariantes(prisma.filas);
    });

    it('serializa las operaciones con un lock de Postgres', async () => {
      await service.reordenarEnGrado(Number(GRADOS.BRIG), 4, 1);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('aplicarCambios', () => {
    it('guarda cambios de varios grados en un mismo lote', async () => {
      const r = await service.aplicarCambios([
        { persona_id: 4, derecha: 2 },
        { persona_id: 6, derecha: 5 },
      ]);

      expect([2n, 3n, 4n, 5n, 6n].map((id) => valores(prisma.filas, id).derecha)).toEqual([3, 4, 2, 6, 5]);
      expect(r.afectados).toBe(5);
      expect(new Set(prisma.historial.map((h: any) => h.lote_id)).size).toBe(1);
      verificarInvariantes(prisma.filas);
    });

    it('aplica cada cambio sobre lo que dejó el anterior', async () => {
      await service.aplicarCambios([
        { persona_id: 4, derecha: 2 },
        { persona_id: 2, derecha: 2 },
      ]);

      expect([2n, 3n, 4n].map((id) => valores(prisma.filas, id).derecha)).toEqual([2, 4, 3]);
      verificarInvariantes(prisma.filas);
    });

    it('combina un orden de grado con un movimiento por valor', async () => {
      await service.aplicarCambios([
        { grado_id: Number(GRADOS.BRIG), orden: [3, 4, 2] },
        { persona_id: 5, numor: 1 },
      ]);

      expect([3n, 4n, 2n].map((id) => valores(prisma.filas, id).derecha)).toEqual([2, 3, 4]);
      verificarInvariantes(prisma.filas);
    });

    it('rechaza un cambio sin valores', async () => {
      await expect(service.aplicarCambios([{ persona_id: 4 }])).rejects.toThrow(BadRequestException);
    });

    it('previsualiza el lote sin persistir', async () => {
      const impacto = await service.previsualizar({
        operacion: 'REORDEN',
        cambios: [{ persona_id: 4, derecha: 2 }],
      } as any);

      expect(impacto.derecha.map((a) => [a.persona_id, a.despues])).toEqual([['4', 2], ['2', 3], ['3', 4]]);
      expect(prisma.historial).toHaveLength(0);
    });
  });

  describe('moverAValores', () => {
    it('lleva al funcionario a la derecha escrita y corre al resto del grado', async () => {
      const r = await service.moverAValores(4n, { derecha: 2 }, { motivo: 'Edición', usuarioId: 9n });

      expect(valores(prisma.filas, 4n)).toEqual({ derecha: 2, numor: 2 });
      expect(valores(prisma.filas, 2n).derecha).toBe(3);
      expect(valores(prisma.filas, 3n).derecha).toBe(4);
      expect(r.afectados).toBe(3);
      expect(prisma.historial.every((h: any) => h.operacion === 'REORDEN' && h.motivo === 'Edición')).toBe(true);
      verificarInvariantes(prisma.filas);
    });

    it('cambia derecha y numor en un mismo lote', async () => {
      await service.moverAValores(4n, { derecha: 2, numor: 1 });

      expect(valores(prisma.filas, 4n)).toEqual({ derecha: 2, numor: 1 });
      expect(valores(prisma.filas, 2n)).toEqual({ derecha: 3, numor: 2 });
      expect(new Set(prisma.historial.map((h: any) => h.lote_id)).size).toBe(1);
      verificarInvariantes(prisma.filas);
    });

    it('rechaza una derecha fuera del bloque del grado', async () => {
      await expect(service.moverAValores(4n, { derecha: 5 })).rejects.toThrow(
        'La derecha 5 está fuera del bloque del grado Brig. Gral. (de 2 a 4)',
      );
      await expect(service.moverAValores(4n, { derecha: 1 })).rejects.toThrow(BadRequestException);
    });

    it('rechaza un numor fuera del grupo', async () => {
      await expect(service.moverAValores(4n, { numor: 3 })).rejects.toThrow(BadRequestException);
    });

    it('previsualiza por valor sin persistir', async () => {
      const r = await service.previsualizar({ operacion: 'REORDEN', persona_id: 6, derecha: 5 });

      expect(r.derecha).toEqual([
        expect.objectContaining({ persona_id: '6', antes: 6, despues: 5 }),
        expect.objectContaining({ persona_id: '5', antes: 5, despues: 6 }),
      ]);
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
    });
  });

  describe('reordenarNumor', () => {
    it('reordena dentro del grupo sin tocar la derecha', async () => {
      await service.reordenarNumor(Number(GRADOS.BRIG), Number(ESC.AV), 4, 1);

      expect(valores(prisma.filas, 4n)).toEqual({ derecha: 4, numor: 1 });
      expect(valores(prisma.filas, 2n)).toEqual({ derecha: 2, numor: 2 });
      verificarInvariantes(prisma.filas);
    });

    it('rechaza una posición fuera del grupo', async () => {
      await expect(service.reordenarNumor(Number(GRADOS.BRIG), Number(ESC.AV), 4, 3)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('ascender', () => {
    /** Como lo deja AscensoRegistroService: la relación vieja cerrada y una nueva abierta. */
    const abrirRelacionNueva = (personaId: bigint, grado: bigint, id: bigint) => {
      const vieja = prisma.filas.find((r: any) => r.persona_id === personaId && r.fecha_fin === null);
      vieja.fecha_fin = new Date('2026-02-01');
      vieja.estado = 'inactivo';
      prisma.filas.push(
        makeRelacion({ id, persona_id: personaId, grado_id: grado, escalafon_id: vieja.escalafon_id }),
      );
      return vieja;
    };

    it('sale del grado actual y entra en la posición elegida del grado destino', async () => {
      const vieja = abrirRelacionNueva(5n, GRADOS.BRIG, 50n);

      const r = await service.ascender(5n, GRADOS.BRIG, { posicion: 2, posicionNumor: 1, relacionDestinoId: 50n });

      expect(vieja.derecha).toBeNull();
      expect(vieja.numor).toBeNull();
      expect(valores(prisma.filas, 2n)).toEqual({ derecha: 2, numor: 2 });
      expect(valores(prisma.filas, 5n)).toEqual({ derecha: 3, numor: 1 });
      expect(valores(prisma.filas, 3n)).toEqual({ derecha: 4, numor: 1 });
      expect(valores(prisma.filas, 4n)).toEqual({ derecha: 5, numor: 3 });
      expect(valores(prisma.filas, 6n)).toEqual({ derecha: 6, numor: 1 });
      expect(r.derecha.find((a) => a.persona_id === '5')).toMatchObject({ antes: 5, despues: 3 });
      expect(prisma.historial.every((h: any) => h.operacion === 'ASCENSO')).toBe(true);
      verificarInvariantes(prisma.filas);
    });

    it('sin posición va al final del grado destino', async () => {
      abrirRelacionNueva(5n, GRADOS.BRIG, 50n);

      await service.ascender(5n, GRADOS.BRIG, { relacionDestinoId: 50n });

      expect(valores(prisma.filas, 5n)).toEqual({ derecha: 5, numor: 3 });
      verificarInvariantes(prisma.filas);
    });

    it('al pasar de escala recompacta las dos', async () => {
      abrirRelacionNueva(7n, GRADOS.CNEL, 70n);

      await service.ascender(7n, GRADOS.CNEL, { relacionDestinoId: 70n });

      const nueva = prisma.filas.find((r: any) => r.id === 70n);
      expect(nueva).toMatchObject({ derecha: 7, escala_derecha: 'OFICIALES' });
      expect(valores(prisma.filas, 8n).derecha).toBe(1);
      expect(valores(prisma.filas, 9n).derecha).toBe(2);
      verificarInvariantes(prisma.filas);
    });

    it('rechaza una posición fuera del grado destino', async () => {
      abrirRelacionNueva(5n, GRADOS.BRIG, 50n);

      await expect(
        service.ascender(5n, GRADOS.BRIG, { posicion: 5, relacionDestinoId: 50n }),
      ).rejects.toThrow('fuera del rango del grado Brig. Gral. (de 1 a 4)');
    });
  });

  describe('cambiarEscalafon', () => {
    it('mueve el numor al grupo nuevo y no cambia la derecha', async () => {
      await service.cambiarEscalafon(4n, ESC.NAV);

      expect(valores(prisma.filas, 4n)).toEqual({ derecha: 4, numor: 2 });
      expect(valores(prisma.filas, 3n)).toEqual({ derecha: 3, numor: 1 });
      expect(valores(prisma.filas, 2n)).toEqual({ derecha: 2, numor: 1 });
      expect(prisma.historial.every((h: any) => h.tipo === 'NUMOR')).toBe(true);
    });

    it('en una posición del grupo nuevo corre a los demás', async () => {
      await service.cambiarEscalafon(2n, ESC.NAV, 1);

      expect(valores(prisma.filas, 2n)).toEqual({ derecha: 2, numor: 1 });
      expect(valores(prisma.filas, 3n)).toEqual({ derecha: 3, numor: 2 });
      expect(valores(prisma.filas, 4n)).toEqual({ derecha: 4, numor: 1 });
    });

    it('rechaza a quien no tiene derecha', async () => {
      await expect(service.cambiarEscalafon(10n, ESC.NAV)).rejects.toThrow(BadRequestException);
    });
  });

  describe('previsualizar', () => {
    it('devuelve los afectados antes y después sin persistir', async () => {
      const r = await service.previsualizar({ operacion: 'REORDEN', grado_id: Number(GRADOS.BRIG), persona_id: 4, posicion: 1 });

      expect(r.afectados).toBe(3);
      expect(r.derecha).toEqual([
        expect.objectContaining({ persona_id: '4', antes: 4, despues: 2 }),
        expect.objectContaining({ persona_id: '2', antes: 2, despues: 3 }),
        expect.objectContaining({ persona_id: '3', antes: 3, despues: 4 }),
      ]);
      expect(r.numor).toEqual([]);
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
      expect(prisma.historial_derecha_numor.createMany).not.toHaveBeenCalled();
    });

    it('previsualiza el alta de un funcionario que todavía no existe', async () => {
      const r = await service.previsualizar({
        operacion: 'ALTA',
        grado_id: Number(GRADOS.BRIG),
        escalafon_id: Number(ESC.AV),
        posicion: 1,
      });

      expect(r.derecha[0]).toMatchObject({ persona_id: null, nombre: 'Nuevo funcionario', despues: 2 });
      expect(r.afectados).toBe(6);
    });

    it('previsualiza un ascenso sin abrir la relación nueva', async () => {
      const r = await service.previsualizar({
        operacion: 'ASCENSO',
        persona_id: 5,
        grado_id: Number(GRADOS.BRIG),
        posicion: 1,
      });

      expect(r.derecha.find((a) => a.persona_id === '5')).toMatchObject({ antes: 5, despues: 2, grado: 'Brig. Gral.' });
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
    });

    it('avisa cuando un grado supera su tope habitual', async () => {
      const filas = makeFilas();
      filas.push(makeRelacion({ id: 12n, persona_id: 12n, grado_id: GRADOS.GRAL, escalafon_id: ESC.AV }));
      await crear(filas);

      const r = await service.previsualizar({ operacion: 'ALTA', persona_id: 12 });

      expect(r.avisos).toEqual([expect.stringContaining('Gral. quedaría con 2 funcionarios')]);
    });
  });

  describe('sugerirOrden', () => {
    it('ordena por antigüedad en el grado y desempata la tanda por egreso ETA', async () => {
      const filas = makeFilas();
      const fecha = (id: bigint) => filas.find((r) => r.id === id)!;
      Object.assign(fecha(2n), { fecha_ultimo_ascenso: new Date('2024-02-01'), egreso_eta: new Date('2000-12-01') });
      Object.assign(fecha(3n), { fecha_ultimo_ascenso: new Date('2023-02-01') });
      Object.assign(fecha(4n), { fecha_ultimo_ascenso: new Date('2024-02-01'), egreso_eta: new Date('1999-12-01') });
      await crear(filas);

      const r = await service.sugerirOrden(Number(GRADOS.BRIG), 'ANTIGUEDAD');

      expect(r.orden).toEqual(['3', '4', '2']);
      expect(prisma.relaciones_laborales.update).not.toHaveBeenCalled();
    });

    it('sin fechas mantiene el orden actual', async () => {
      const r = await service.sugerirOrden(Number(GRADOS.BRIG), 'EGRESO');

      expect(r.orden).toEqual(['2', '3', '4']);
      expect(r.sin_datos).toHaveLength(3);
    });
  });

  describe('lectura', () => {
    it('devuelve el grado con su rango de derecha y el tope', async () => {
      const r = await service.obtenerGrado(Number(GRADOS.BRIG));

      expect(r).toMatchObject({ derecha_desde: 2, derecha_hasta: 4, cantidad: 3, tope: 5, excede_tope: false });
      expect(r.items.map((i) => i.posicion_grado)).toEqual([1, 2, 3]);
    });

    it('rechaza un grado sin derecha', async () => {
      await expect(service.obtenerGrado(Number(GRADOS.CADETE))).rejects.toThrow(BadRequestException);
    });
  });
});
