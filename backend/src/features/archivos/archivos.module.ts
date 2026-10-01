import { Module } from '@nestjs/common';
import { ArchivosService } from './archivos.service';
import { minioClientProvider } from './archivos.minio';
import { PrismaModule } from '../../lib/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [minioClientProvider, ArchivosService],
  exports: [ArchivosService],
})
export class ArchivosModule {}
