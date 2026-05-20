import { Module } from '@nestjs/common';
import { CursosController } from './cursos.controller';
import { CursosService } from './cursos.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CursosController],
  providers: [CursosService],
})
export class CursosModule {}
