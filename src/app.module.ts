import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { LessonsModule } from './lessons/lessons.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { PaymentsModule } from './payments/payments.module';
import { MESSAGES } from './common/messages';
import { APP_GUARD } from '@nestjs/core';
import { THROTTLE } from './common/constants';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    AuthModule,
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ...THROTTLE.DEFAULT }],
      errorMessage: MESSAGES.COMMON.TOO_MANY_REQUESTS,
      // Rate limit tính theo IP; e2e test đến từ cùng một IP nên sẽ dính 429
      // giữa chừng. Không thể override guard này từ testing module vì Nest
      // đăng ký APP_GUARD dưới một token có UUID ngẫu nhiên.
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    UsersModule,
    CoursesModule,
    LessonsModule,
    EnrollmentsModule,
    PaymentsModule,
    NotificationsModule,
    HealthModule,
    MetricsModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
