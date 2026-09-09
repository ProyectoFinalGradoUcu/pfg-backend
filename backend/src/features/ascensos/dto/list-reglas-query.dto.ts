import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

const aBooleano = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class ListReglasQueryDto {
  @ApiPropertyOptional({
    example: true,
    default: true,
    description:
      'Incluye las reglas desactivadas, que se muestran en gris en la escalera. Por defecto sí, para que se vea la escala completa.',
  })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  incluir_inactivas?: boolean;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Agrega, por tramo, las versiones ya cerradas de la regla.',
  })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  incluir_versiones?: boolean;
}
