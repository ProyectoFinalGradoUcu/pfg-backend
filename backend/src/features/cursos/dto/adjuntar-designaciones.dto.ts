import { ApiProperty } from '@nestjs/swagger';
import { Matches, Validate, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

export const MAX_DESIGNACIONES_POR_ADJUNTO = 500;

@ValidatorConstraint({ name: 'maxIdsPorLista' })
class MaxIdsPorLista implements ValidatorConstraintInterface {
  validate(valor: unknown) {
    return typeof valor === 'string' && valor.split(',').length <= MAX_DESIGNACIONES_POR_ADJUNTO;
  }

  defaultMessage() {
    return `designacion_ids admite como máximo ${MAX_DESIGNACIONES_POR_ADJUNTO} ids`;
  }
}

// Multipart no trae arrays: los ids llegan como texto separado por comas.
export class AdjuntarDesignacionesDto {
  @ApiProperty({ description: 'Ids de las designaciones del curso, separados por coma', example: '12,13,14' })
  @Matches(/^\d{1,18}(,\d{1,18})*$/, { message: 'designacion_ids debe ser una lista de ids separados por coma' })
  @Validate(MaxIdsPorLista)
  designacion_ids: string;
}
