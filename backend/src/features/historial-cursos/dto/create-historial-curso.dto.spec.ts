import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateHistorialCursoDto } from './create-historial-curso.dto';

describe('CreateHistorialCursoDto', () => {
  const valido = { personaId: 10, nombre: 'Aviación', institucion: 'EMA', tipo: 'obligatorio' };

  it.each([
    ['personaId', 0],
    ['personaId', -1],
    ['nombre', ''],
    ['institucion', ''],
    ['fechaInicio', 'no-es-fecha'],
    ['fechaFin', 'no-es-fecha'],
  ])('rechaza %s inválido (%s)', async (campo, valor) => {
    const errores = await validate(plainToInstance(CreateHistorialCursoDto, { ...valido, [campo]: valor }));
    expect(errores.some((error) => error.property === campo)).toBe(true);
  });

  it('acepta el contrato existente y transforma el id enviado como texto', async () => {
    const dto = plainToInstance(CreateHistorialCursoDto, { ...valido, personaId: '10' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.personaId).toBe(10);
  });
});
