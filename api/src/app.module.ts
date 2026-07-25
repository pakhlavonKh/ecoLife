import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingsModule } from './bookings/bookings.module';
import { CategoriesModule } from './categories/categories.module';
import { CottagesModule } from './cottages/cottages.module';
import { CustomersModule } from './customers/customers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AppController } from './app.controller';
import { OptionalThrottlerGuard } from './common/guards/optional-throttler.guard';
import { PaymentsModule } from './payments/payments.module';
import { PriceTiersModule } from './price-tiers/price-tiers.module';
import { PrismaModule } from './prisma/prisma.module';
import { RoomsModule } from './rooms/rooms.module';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        // Reasonable public default; tightened per-route for auth/booking.
        ttl: 60_000,
        limit: 120,
      },
    ]),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: { singleLine: true, colorize: true },
              }
            : undefined,
        autoLogging: {
          ignore: (req) => req.url === '/api/v1/health',
        },
      },
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    CottagesModule,
    RoomsModule,
    PriceTiersModule,
    AvailabilityModule,
    PaymentsModule,
    BookingsModule,
    CustomersModule,
    DashboardModule,
    TelegramModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: OptionalThrottlerGuard,
    },
  ],
})
export class AppModule {}
