import { BadRequestException } from '@nestjs/common';

export const MSG_INICIO_ANTES_DE_NACIMIENTO =
  'La fecha de inicio no puede ser anterior a la fecha de nacimiento';

export function assertFechaInicioPosteriorANacimiento(
  fechaInicio: Date | string | null | undefined,
  fechaNacimiento: Date | string | null | undefined,
): void {
  const inicio = aFecha(fechaInicio);
  const nacimiento = aFecha(fechaNacimiento);
  if (!inicio || !nacimiento) return;

  if (inicio.getTime() < nacimiento.getTime()) {
    throw new BadRequestException(MSG_INICIO_ANTES_DE_NACIMIENTO);
  }
}

function aFecha(valor: Date | string | null | undefined): Date | null {
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}
