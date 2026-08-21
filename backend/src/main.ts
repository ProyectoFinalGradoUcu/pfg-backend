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

  // Detrás del reverse proxy, sin esto Express toma la IP del gateway de Docker como origen
  // de todas las peticiones y el throttler las cuenta como si vinieran de un solo usuario.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

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

  // `??` solo cubre null/undefined: con PORT="" en el .env pasaba la cadena vacía a listen()
  // y Node tiraba ERR_SOCKET_BAD_PORT. Number('') e Number('abc') son falsy, así que cualquier
  // valor inválido o vacío cae al default.
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
