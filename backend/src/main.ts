import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ServiceResponseInterceptor } from './lib/http/service-response.interceptor';
import { ServiceResponseExceptionFilter } from './lib/http/service-response-exception.filter';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(cookieParser());

  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ServiceResponseInterceptor());
  app.useGlobalFilters(new ServiceResponseExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('PFG API')
    .setDescription('Documentación de la API del Proyecto Final de Grado')
    .setVersion('1.0')
    .addCookieAuth('auth_token')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { withCredentials: true },
  });

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
