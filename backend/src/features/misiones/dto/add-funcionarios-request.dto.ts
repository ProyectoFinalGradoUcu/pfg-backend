import { ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AddFuncionariosDto } from './add-funcionarios.dto';

export class AddFuncionariosRequestDto {
  @ApiProperty({ type: () => AddFuncionariosDto })
  @ValidateNested()
  @Type(() => AddFuncionariosDto)
  service_request: AddFuncionariosDto;
}
