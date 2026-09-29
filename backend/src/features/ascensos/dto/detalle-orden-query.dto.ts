import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

const aNumero = ({ value }: { value: unknown }) =>
  value === '' || value == null ? undefined : Number(value);

/** Paginación de los funcionarios de una orden. */
export class DetalleOrdenQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Transform(aNumero)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
