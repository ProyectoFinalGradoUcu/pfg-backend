import { IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FuncionarioMisionDto } from './funcionario-mision.dto';

export class AddFuncionariosDto {
  @ApiProperty({ type: [FuncionarioMisionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FuncionarioMisionDto)
  funcionarios_misiones: FuncionarioMisionDto[];
}
