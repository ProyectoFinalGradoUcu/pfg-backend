import { BadRequestException } from '@nestjs/common';

type Tipo = string | null | undefined;

/** El grado tiene que ser de la misma escala que el tipo de funcionario. */
export function assertGradoCoherenteConTipo(
  tipo: Tipo,
  grado: { denominacion: string | null; es_oficial: boolean | null; es_subalterno: boolean | null },
): void {
  if (tipo === 'oficial' && grado.es_subalterno) {
    throw new BadRequestException(`El grado "${grado.denominacion}" es de personal subalterno y no corresponde a un oficial.`);
  }
  if (tipo === 'subalterno' && grado.es_oficial) {
    throw new BadRequestException(`El grado "${grado.denominacion}" es de oficiales y no corresponde a un subalterno.`);
  }
}

/**
 * El nivel de idoneidad es del personal subalterno y los códigos del legajo, de los oficiales.
 * `null` siempre se acepta: es borrar el dato.
 */
export function assertCamposDelTipo(
  tipo: Tipo,
  campos: { nivel_idoneidad?: number | null; codigos_legajo?: string | null },
): void {
  if (campos.nivel_idoneidad != null && tipo !== 'subalterno') {
    throw new BadRequestException('El nivel de idoneidad solo se carga al personal subalterno.');
  }
  if (campos.codigos_legajo != null && campos.codigos_legajo !== '' && tipo !== 'oficial') {
    throw new BadRequestException('Los códigos del legajo solo se cargan a los oficiales.');
  }
}
