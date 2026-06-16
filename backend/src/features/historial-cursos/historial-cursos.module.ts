import { Module } from '@nestjs/common';
import { HistorialCursosController } from './historial-cursos.controller';
import { HistorialCursosService } from './historial-cursos.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [HistorialCursosController],
  providers: [HistorialCursosService],
})
export class HistorialCursosModule {}
