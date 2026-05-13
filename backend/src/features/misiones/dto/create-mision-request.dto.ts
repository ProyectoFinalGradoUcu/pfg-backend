import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateMisionDto } from './create-mision.dto';

export class CreateMisionRequestDto {
  @ApiProperty({ type: () => CreateMisionDto })
  @ValidateNested()
  @Type(() => CreateMisionDto)
  service_request: CreateMisionDto;
}
