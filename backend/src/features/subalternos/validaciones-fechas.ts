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

// Fallecimiento: no puede ser futuro ni anterior al nacimiento o al inicio de la relación vigente.
export function assertFechaFallecimientoValida(
  fechaFallecimiento: Date | string | null | undefined,
  fechaNacimiento: Date | string | null | undefined,
  inicioRelacionActiva?: Date | string | null,
): void {
  const fallecimiento = aFecha(fechaFallecimiento);
  if (!fallecimiento) return;

  const hoy = new Date();
  hoy.setUTCHours(0, 0, 0, 0);
  if (fallecimiento.getTime() > hoy.getTime()) {
    throw new BadRequestException('La fecha de fallecimiento no puede ser futura');
  }
  const nacimiento = aFecha(fechaNacimiento);
  if (nacimiento && fallecimiento.getTime() < nacimiento.getTime()) {
    throw new BadRequestException('La fecha de fallecimiento no puede ser anterior a la fecha de nacimiento');
  }
  const inicio = aFecha(inicioRelacionActiva);
  if (inicio && fallecimiento.getTime() < inicio.getTime()) {
    throw new BadRequestException(
      'La fecha de fallecimiento no puede ser anterior al inicio de la relación laboral vigente',
    );
  }
}
