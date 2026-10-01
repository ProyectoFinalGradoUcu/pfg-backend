import {
  describirBloqueos,
  mensajeDeBloqueo,
  SELECT_CONTEO_BLOQUEOS,
} from './bloqueos-borrado';

describe('describirBloqueos', () => {
  it('sin registros devuelve una lista vacía', () => {
    expect(describirBloqueos({ funcionarios_cursos: 0, aguinaldos: 0, retiros: 0 })).toEqual([]);
  });

  it('lista lo propio con su etiqueta y suma todo lo de liquidaciones en una línea', () => {
    expect(
      describirBloqueos({
        personas_documentos: 3,
        funcionarios_cursos: 2,
        aguinaldos: 4,
        items_liquidacion: 10,
        retiros: 1,
      }),
    ).toEqual([
      { tipo: 'documentos', etiqueta: 'Documentos', cantidad: 3 },
      { tipo: 'cursos', etiqueta: 'Cursos', cantidad: 2 },
      { tipo: 'retiro', etiqueta: 'Retiro', cantidad: 1 },
      { tipo: 'liquidaciones', etiqueta: 'Registros de liquidaciones', cantidad: 14 },
    ]);
  });

  it('los vínculos familiares (las dos direcciones, contadas aparte) van con su etiqueta', () => {
    expect(
      describirBloqueos({ relaciones_familiares: 3 }),
    ).toEqual([{ tipo: 'familiares', etiqueta: 'Vínculos familiares', cantidad: 3 }]);
  });
});

describe('mensajeDeBloqueo', () => {
  it('une los registros en una frase', () => {
    expect(
      mensajeDeBloqueo([
        { tipo: 'documentos', etiqueta: 'Documentos', cantidad: 3 },
        { tipo: 'cursos', etiqueta: 'Cursos', cantidad: 2 },
        { tipo: 'liquidaciones', etiqueta: 'Registros de liquidaciones', cantidad: 14 },
      ]),
    ).toBe(
      'No se puede eliminar: el funcionario tiene documentos (3), cursos (2) y registros de liquidaciones (14)',
    );
  });

  it('con un solo registro no lleva "y"', () => {
    expect(mensajeDeBloqueo([{ tipo: 'cursos', etiqueta: 'Cursos', cantidad: 2 }])).toBe(
      'No se puede eliminar: el funcionario tiene cursos (2)',
    );
  });
});

describe('SELECT_CONTEO_BLOQUEOS', () => {
  // Prisma arma el alias `_aggr_count_<relación>` y Postgres corta los identificadores a
  // 63 caracteres: con un nombre más largo, el alias llega truncado y la consulta falla.
  it('ningún alias de _count pasa los 63 caracteres de Postgres', () => {
    const largos = Object.keys(SELECT_CONTEO_BLOQUEOS).filter(
      (campo) => `_aggr_count_${campo}`.length > 63,
    );
    expect(largos).toEqual([]);
  });
});
