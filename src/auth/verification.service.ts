import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import { VerificationType } from 'generated/prisma/enums';
import { MESSAGES } from 'src/common/messages';
import { MailService } from 'src/notifications/mail.service';
import { SmsService } from 'src/notifications/sms.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { VerifyCodeDto } from './dto/verify-code.dto';
import {
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_CODE_MAX,
  VERIFICATION_CODE_TTL_MINUTES,
} from 'src/common/constants';

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
  ) {}

  async requestEmailCode(userId: string) {
    const user = await this.getUserOrThrow(userId);

    if (user.isEmailVerified) {
      throw new BadRequestException(MESSAGES.AUTH.EMAIL_ALREADY_VERIFIED);
    }

    const code = await this.issueCode(userId, VerificationType.EMAIL);

    await this.mailService.sendVerificationCode(user.email, code);
  }

  async requestPhoneCode(userId: string) {
    const user = await this.getUserOrThrow(userId);

    if (!user.phone) {
      throw new BadRequestException(MESSAGES.AUTH.PHONE_NOT_PROVIDED);
    }

    if (user.isPhoneVerified) {
      throw new BadRequestException(MESSAGES.AUTH.PHONE_ALREADY_VERIFIED);
    }

    const code = await this.issueCode(userId, VerificationType.PHONE);

    this.smsService.sendVerificationCode(user.phone, code);
  }

  confirmEmail(userId: string, dto: VerifyCodeDto) {
    return this.consumeCode(userId, VerificationType.EMAIL, dto.code, {
      isEmailVerified: true,
    });
  }

  confirmPhone(userId: string, dto: VerifyCodeDto) {
    return this.consumeCode(userId, VerificationType.PHONE, dto.code, {
      isPhoneVerified: true,
    });
  }

  private async issueCode(userId: string, type: VerificationType) {
    const code = randomInt(0, VERIFICATION_CODE_MAX)
      .toString()
      .padStart(VERIFICATION_CODE_LENGTH, '0');

    const expiresAt = new Date(
      Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.verificationToken.updateMany({
        where: { userId, type, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.verificationToken.create({
        data: { userId, type, code: this.hashCode(code), expiresAt },
      }),
    ]);

    return code;
  }

  private async consumeCode(
    userId: string,
    type: VerificationType,
    code: string,
    userData: { isEmailVerified?: boolean; isPhoneVerified?: boolean },
  ) {
    const token = await this.prisma.verificationToken.findFirst({
      where: {
        userId,
        type,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        code: this.hashCode(code),
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw new BadRequestException(MESSAGES.AUTH.INVALID_VERIFICATION_CODE);
    }

    await this.prisma.$transaction([
      this.prisma.verificationToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({ where: { id: userId }, data: userData }),
    ]);
  }

  private async getUserOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        isEmailVerified: true,
        isPhoneVerified: true,
      },
    });

    if (!user) {
      throw new NotFoundException(MESSAGES.USER.NOT_FOUND);
    }

    return user;
  }

  private hashCode(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }
}
