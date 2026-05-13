import { PartialType } from '@nestjs/swagger';
import { CreateMisionDto } from './create-mision.dto';

export class UpdateMisionDto extends PartialType(CreateMisionDto) {}
