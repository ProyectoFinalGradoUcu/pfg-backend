import { armarResumen, detalleLegible, fraseEntidad } from './auditoria-frases';

const resumen = (accion: string, entidad: string | null, detalle: unknown, nombres: Record<string, string> = {}) =>
  armarResumen({ accion, entidad, entidadNombre: null, detalle, nombres });

describe('armarResumen', () => {
  it('reorden de la derecha con grado y afectados', () => {
    expect(
      resumen('derecha.reordenar', 'Derecha', { body: { grado_id: 7, orden: [1, 2] }, resultado: { afectados: 3 } }, {
        'grado_id:7': 'Sargento',
      }),
    ).toBe('Reordenó la derecha de Sargento: 3 funcionarios cambiaron de posición');
  });

  it('reorden con un solo afectado y motivo', () => {
    expect(
      resumen('derecha.reordenar', 'Derecha', { body: { grado_id: 7, motivo: 'Error de carga' }, resultado: { afectados: 1 } }, {
        'grado_id:7': 'Sargento',
      }),
    ).toBe('Reordenó la derecha de Sargento: 1 funcionario cambió de posición. Motivo: Error de carga');
  });

  it('reorden del numor con grado y escalafón', () => {
    expect(
      resumen('numor.reordenar', 'Numor', { body: { grado_id: 7, escalafon_id: 2 }, resultado: { afectados: 2 } }, {
        'grado_id:7': 'Sargento',
        'escalafon_id:2': 'Aerotécnicos',
      }),
    ).toBe('Reordenó el numor de Sargento Aerotécnicos: 2 funcionarios cambiaron de posición');
  });

  it('cambios en la derecha cuenta los pasos', () => {
    expect(resumen('derecha.cambios', 'Derecha', { body: { cambios: [{}, {}], motivo: 'Ajuste' } })).toBe(
      'Aplicó 2 cambios en la derecha. Motivo: Ajuste',
    );
  });

  it('asignación de comisión en lote', () => {
    const detalle = { body: { service_request: { comision_id: 3, persona_ids: [5, 6, 7], fecha_inicio: '2026-01-01' } } };
    const nombres = { 'comision_id:3': 'Comisión X', 'persona_ids:5': 'Sgto. A', 'persona_ids:6': 'Cbo. B', 'persona_ids:7': 'Sdo. C' };
    expect(resumen('CREAR', 'Asignación de comisión', detalle, nombres)).toBe('Asignó a Sgto. A, Cbo. B y Sdo. C a la comisión Comisión X');
  });

  it('asignación de comisión de una persona', () => {
    const detalle = { body: { service_request: { comision_id: 3, persona_id: 5 } } };
    const nombres = { 'comision_id:3': 'Comisión X', 'persona_id:5': 'Sgto. A' };
    expect(resumen('CREAR', 'Asignación de comisión', detalle, nombres)).toBe('Asignó a Sgto. A a la comisión Comisión X');
  });

  it('lote de comisión sin nombres cuenta funcionarios', () => {
    const detalle = { body: { comision_id: 3, persona_ids: [5, 6] } };
    expect(resumen('CREAR', 'Asignación de comisión', detalle, { 'comision_id:3': 'Comisión X' })).toBe(
      'Asignó 2 funcionarios a la comisión Comisión X',
    );
  });

  it('borrar un civil desde subalternos', () => {
    expect(armarResumen({ accion: 'ELIMINAR', entidad: 'Subalterno', entidadNombre: 'Ana Gómez', detalle: { anterior: { es_civil: true } } })).toBe(
      'Eliminó la persona Ana Gómez',
    );
    expect(armarResumen({ accion: 'ELIMINAR', entidad: 'Subalterno', entidadNombre: 'Sgto. Juan Pérez', detalle: { anterior: {} } })).toBe(
      'Eliminó el subalterno Sgto. Juan Pérez',
    );
  });

  it('sin datos cae a la frase fija', () => {
    expect(resumen('derecha.cambios', 'Derecha', null)).toBe('Aplicó cambios en la derecha');
    expect(resumen('LOGIN', null, null)).toBe('Inició sesión');
  });

  it('quitar todos los funcionarios de una convocatoria', () => {
    expect(
      resumen('ELIMINAR', 'Asignación a misión', { params: { misionId: '1', convocatoriaId: '8' } }, {
        'convocatoriaId:8': 'Antártida 2026',
      }),
    ).toBe('Quitó a todos los funcionarios de la convocatoria Antártida 2026');
  });

  it('asignar funcionarios a una convocatoria los nombra', () => {
    expect(
      resumen(
        'CREAR',
        'Asignación a misión',
        { params: { convocatoriaId: '8' }, body: { service_request: { funcionarios: [{ persona_id: 5 }, { persona_id: 6 }] } } },
        { 'convocatoriaId:8': 'Antártida 2026', 'persona_id:5': 'Sgto. Juan Pérez', 'persona_id:6': 'Cbo. Ana Gómez' },
      ),
    ).toBe('Asignó a Sgto. Juan Pérez y Cbo. Ana Gómez a la convocatoria Antártida 2026');
  });

  it('si falta algún nombre cuenta los funcionarios', () => {
    expect(
      resumen('CREAR', 'Asignación a misión', { params: { convocatoriaId: '8' }, body: { funcionarios: [{ persona_id: 5 }] } }),
    ).toBe('Asignó 1 funcionario a la convocatoria');
  });

  it('designar en un curso con muchos nombres', () => {
    const nombres = { 'cursoId:1': 'Mando' } as Record<string, string>;
    [1, 2, 3, 4, 5].forEach((i) => (nombres[`persona_ids:${i}`] = `P${i}`));
    expect(resumen('CREAR', 'Designación de curso', { params: { cursoId: '1' }, body: { persona_ids: [1, 2, 3, 4, 5] } }, nombres)).toBe(
      'Designó a P1, P2, P3 y 2 más al curso Mando',
    );
  });

  it('subir un documento dice adjuntó', () => {
    expect(armarResumen({ accion: 'CREAR', entidad: 'Documento de retiro', entidadNombre: 'Cbo. Ana Gómez', detalle: {} })).toBe(
      'Adjuntó el documento de retiro de Cbo. Ana Gómez',
    );
  });

  it('calificar un curso', () => {
    expect(resumen('ACTUALIZAR', 'Calificación de curso', { params: { cursoId: '1' } }, { 'cursoId:1': 'Mando' })).toBe(
      'Registró resultados del curso Mando',
    );
  });
});

describe('fraseEntidad', () => {
  it('artículos de las entidades nuevas', () => {
    expect(fraseEntidad('Convocatoria', 'Antártida')).toBe('la convocatoria Antártida');
    expect(fraseEntidad('Módulo de curso', null, true)).toBe('un módulo de curso');
    expect(fraseEntidad('Documento de retiro', 'Cbo. Ana Gómez')).toBe('el documento de retiro de Cbo. Ana Gómez');
    expect(fraseEntidad('Documento de orden de ascenso', null)).toBe('el documento de orden de ascenso');
  });
});

describe('detalleLegible', () => {
  it('arma descripción y cambios', () => {
    expect(
      detalleLegible({ accion: 'unidad.quitar', entidad: 'Usuario', entidadNombre: 'jperez', detalle: {} }, { bases: ['A', 'B'] }, { bases: ['A'] }),
    ).toEqual({ descripcion: 'Quitó bases al usuario jperez', cambios: [{ campo: 'bases', anterior: ['A', 'B'], nuevo: ['A'] }] });
  });
});
