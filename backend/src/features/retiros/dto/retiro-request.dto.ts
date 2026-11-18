import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateRetiroDto } from './create-retiro.dto';
import { UpdateRetiroDto } from './update-retiro.dto';
import { AnularRetiroDto } from './anular-retiro.dto';
import { ReincorporarDto } from './reincorporar.dto';
import { ActualizarReincorporacionDto } from './actualizar-reincorporacion.dto';

export class CreateRetiroRequestDto {
  @ApiProperty({ type: () => CreateRetiroDto })
  @ValidateNested()
  @Type(() => CreateRetiroDto)
  service_request: CreateRetiroDto;
}

export class UpdateRetiroRequestDto {
  @ApiProperty({ type: () => UpdateRetiroDto })
  @ValidateNested()
  @Type(() => UpdateRetiroDto)
  service_request: UpdateRetiroDto;
}

export class AnularRetiroRequestDto {
  @ApiProperty({ type: () => AnularRetiroDto })
  @ValidateNested()
  @Type(() => AnularRetiroDto)
  service_request: AnularRetiroDto;
}

export class ReincorporarRequestDto {
  @ApiProperty({ type: () => ReincorporarDto })
  @ValidateNested()
  @Type(() => ReincorporarDto)
  service_request: ReincorporarDto;
}

export class ActualizarReincorporacionRequestDto {
  @ApiProperty({ type: () => ActualizarReincorporacionDto })
  @ValidateNested()
  @Type(() => ActualizarReincorporacionDto)
  service_request: ActualizarReincorporacionDto;
}
