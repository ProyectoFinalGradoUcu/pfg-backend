import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { SubalternosService } from './subalternos.service.js';
import { CreateSubalternoDto } from './dto/create-subalterno.dto.js';
import { UpdateSubalternoDto } from './dto/update-subalterno.dto.js';

@Controller('subalternos')
export class SubalternosController {
  constructor(private readonly subalternosService: SubalternosService) {}

  @Post()
  async create(@Body() dto: CreateSubalternoDto) {
    return this.subalternosService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubalternoDto,
  ) {
    return this.subalternosService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.subalternosService.remove(id);
  }
}
