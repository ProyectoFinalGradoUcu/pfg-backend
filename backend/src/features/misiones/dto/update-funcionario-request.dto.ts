import { ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { UpdateFuncionarioDto } from './update-funcionario.dto';

export class UpdateFuncionarioRequestDto {
  @ApiProperty({ type: () => UpdateFuncionarioDto })
  @ValidateNested()
  @Type(() => UpdateFuncionarioDto)
  service_request: UpdateFuncionarioDto;
}
