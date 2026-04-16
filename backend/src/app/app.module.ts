import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../features/auth/auth.module';
import { SubalternosModule } from '../features/subalternos/subalternos.module';
import { PrismaModule } from '../lib/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    SubalternosModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
