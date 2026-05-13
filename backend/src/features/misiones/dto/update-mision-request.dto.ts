import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { UpdateMisionDto } from './update-mision.dto';

export class UpdateMisionRequestDto {
  @ApiProperty({ type: () => UpdateMisionDto })
  @ValidateNested()
  @Type(() => UpdateMisionDto)
  service_request: UpdateMisionDto;
}
