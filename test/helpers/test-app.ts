import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';

import { AppModule } from 'src/app.module';
import { configureApp } from 'src/app.setup';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/notifications/mail.service';

const TABLES = [
  'lesson_progress',
  'enrollments',
  'payments',
  'lessons',
  'courses',
  'verification_tokens',
  'password_reset_tokens',
  'users',
];

export const mailServiceMock = {
  sendVerificationCode: jest.fn(),
  sendPasswordResetToken: jest.fn(),
};

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MailService)
    .useValue(mailServiceMock)
    .compile();

  const app = configureApp(moduleRef.createNestApplication());

  await app.init();

  return app;
}

export async function resetDb(app: INestApplication) {
  const prisma = app.get(PrismaService);

  // Prisma Client không có API cho TRUNCATE. Danh sách bảng là hằng số trong
  // code, không nhận input từ ngoài, nên không có bề mặt SQL injection.
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}
