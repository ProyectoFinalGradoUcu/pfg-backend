import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateRetiroDto } from './create-retiro.dto';
import { UpdateRetiroDto } from './update-retiro.dto';
import { AnularRetiroDto } from './anular-retiro.dto';

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
