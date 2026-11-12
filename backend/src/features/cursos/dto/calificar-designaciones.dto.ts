import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { UpdateDesignacionDto } from './update-designacion.dto';

export class CalificacionDesignacionDto extends UpdateDesignacionDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  @Min(1)
  designacionId: number;
}

export class CalificarDesignacionesDto {
  @ApiProperty({ type: [CalificacionDesignacionDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CalificacionDesignacionDto)
  resultados: CalificacionDesignacionDto[];
}
