import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { AlcanceGuard } from '../../lib/alcance/alcance.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Después de PermissionsGuard: resuelve el alcance de los endpoints con @RequireAlcance.
    { provide: APP_GUARD, useClass: AlcanceGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
