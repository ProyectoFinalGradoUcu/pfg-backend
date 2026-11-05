import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRolDto } from './create-rol.dto';
import { UpdateRolDto } from './update-rol.dto';

describe('nombre del rol', () => {
  const errores = async (cls: any, body: object) =>
    (await validate(plainToInstance(cls, body))).flatMap((e) => Object.values(e.constraints ?? {}));

  it.each([CreateRolDto, UpdateRolDto])('%p rechaza un nombre de solo espacios', async (cls) => {
    expect(await errores(cls, { nombre: '     ' })).toContain(
      'El nombre del rol tiene que tener al menos 3 caracteres',
    );
  });

  it('recorta los espacios del nombre', () => {
    expect(plainToInstance(CreateRolDto, { nombre: '  Encargado  ' }).nombre).toBe('Encargado');
  });

  it('acepta un nombre válido', async () => {
    expect(await errores(CreateRolDto, { nombre: 'Encargado de Misiones' })).toEqual([]);
  });
});
