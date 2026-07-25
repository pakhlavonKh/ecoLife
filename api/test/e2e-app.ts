import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/** Nest app for e2e with the same pipes/filters as production, throttling disabled. */
export async function createE2eApp(): Promise<INestApplication> {
  process.env.LOG_LEVEL = 'silent';
  process.env.DISABLE_THROTTLE = 'true';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({
    bufferLogs: true,
    logger: false,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  const logger = app.get(Logger);
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  await app.init();
  return app;
}
