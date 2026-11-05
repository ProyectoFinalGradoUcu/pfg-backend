import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CrearInvitacionDto } from './crear-invitacion.dto';

// El email termina en usuarios.username, que es varchar(60).
describe('CrearInvitacionDto', () => {
  const errores = (email: string) =>
    validate(plainToInstance(CrearInvitacionDto, { email }));

  it('acepta un email de 60 caracteres', async () => {
    const email = `${'a'.repeat(60 - '@fau.mil.uy'.length)}@fau.mil.uy`;
    expect(email).toHaveLength(60);
    expect(await errores(email)).toHaveLength(0);
  });

  it('rechaza un email de 61 caracteres', async () => {
    const email = `${'a'.repeat(61 - '@fau.mil.uy'.length)}@fau.mil.uy`;
    const [error] = await errores(email);
    expect(error?.constraints).toHaveProperty('maxLength');
  });
});
