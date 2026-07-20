import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { InvitacionesService } from './invitaciones.service';
import { CrearInvitacionDto } from './dto/crear-invitacion.dto';
import { AceptarInvitacionDto } from './dto/aceptar-invitacion.dto';
import { Auditar } from '../auditoria/decorators/auditar.decorator';

@ApiTags('Invitaciones')
@Controller('invitaciones')
@Auditar({ contexto: 'Usuarios', entidad: 'Invitación' })
export class InvitacionesController {
  constructor(private readonly invitacionesService: InvitacionesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('usuarios.gestionar')
  @ApiCookieAuth('auth_token')
  @ApiOperation({ summary: 'Crear y enviar una invitación por email' })
  @ApiResponse({ status: 201, description: 'Invitación enviada' })
  @ApiResponse({ status: 409, description: 'Ya existe una invitación pendiente para ese email' })
  crear(
    @Body() dto: CrearInvitacionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invitacionesService.crear(dto, user.id);
  }

  @Get()
  @RequirePermissions('usuarios.gestionar')
  @ApiCookieAuth('auth_token')
  @ApiOperation({ summary: 'Listar invitaciones' })
  @ApiQuery({ name: 'estado', required: false, enum: ['pendiente', 'aceptada', 'expirada'] })
  listar(@Query('estado') estado?: string) {
    return this.invitacionesService.listar(estado);
  }

  @Get('verificar')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verificar si un token de invitación es válido (público)' })
  @ApiQuery({ name: 'token', required: true })
  @ApiResponse({ status: 200, description: 'Token válido' })
  @ApiResponse({ status: 400, description: 'Token inválido o expirado' })
  verificar(@Query('token') token: string) {
    return this.invitacionesService.verificarToken(token);
  }

  @Post('aceptar')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Completar registro con token de invitación (público)' })
  @ApiResponse({ status: 200, description: 'Registro completado exitosamente' })
  @ApiResponse({ status: 400, description: 'Token inválido o expirado' })
  aceptar(@Body() dto: AceptarInvitacionDto) {
    return this.invitacionesService.aceptar(dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('usuarios.gestionar')
  @ApiCookieAuth('auth_token')
  @ApiOperation({ summary: 'Revocar una invitación pendiente' })
  @ApiResponse({ status: 200, description: 'Invitación revocada' })
  @ApiResponse({ status: 404, description: 'Invitación no encontrada' })
  revocar(@Param('id') id: string) {
    return this.invitacionesService.revocar(id);
  }
}
