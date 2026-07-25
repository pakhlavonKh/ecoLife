import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  app.use(
    helmet({
      // API returns JSON; relax CSP so Swagger UI works in non-prod.
      contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.setGlobalPrefix('api/v1');

  const uploadsRoot = join(process.cwd(), 'uploads');
  mkdirSync(join(uploadsRoot, 'categories'), { recursive: true });
  app.useStaticAssets(uploadsRoot, { prefix: '/uploads/' });

  const isProd = process.env.NODE_ENV === 'production';
  const corsOrigins = [
    process.env.PUBLIC_SITE_URL,
    process.env.ADMIN_PANEL_URL,
  ].filter((v): v is string => Boolean(v && v.trim()));

  if (isProd && corsOrigins.length === 0) {
    throw new Error(
      'CORS whitelist empty: set PUBLIC_SITE_URL and/or ADMIN_PANEL_URL in production',
    );
  }

  app.enableCors({
    origin: isProd ? corsOrigins : corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(logger));

  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('EcoLife Booking API')
      .setDescription('Cottage resort booking platform')
      .setVersion('0.8.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  logger.log(`EcoLife API listening on http://localhost:${port}/api/v1`);
  if (!isProd) {
    logger.log(`Swagger docs at http://localhost:${port}/docs`);
  }
}

void bootstrap();
