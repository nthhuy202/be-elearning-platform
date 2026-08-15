import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { VERIFICATION_CODE_TTL_MINUTES } from 'src/common/constants';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;
  private from!: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.from =
      this.configService.get<string>('SMTP_FROM') ?? 'no-reply@elearning.local';

    const host = this.configService.get<string>('SMTP_HOST');

    if (!host) {
      this.logger.warn(
        'Chưa cấu hình SMTP_HOST — email sẽ chỉ được ghi ra log, không gửi đi thật.',
      );
      return;
    }

    this.transporter = createTransport({
      host,
      port: Number(this.configService.get<string>('SMTP_PORT') ?? 587),
      secure: false,
      auth: {
        user: this.configService.getOrThrow<string>('SMTP_USER'),
        pass: this.configService.getOrThrow<string>('SMTP_PASSWORD'),
      },
    });
  }

  sendVerificationCode(to: string, code: string) {
    return this.send(
      to,
      'Mã xác minh tài khoản',
      `Mã xác minh của bạn là ${code}. Mã có hiệu lực trong ${VERIFICATION_CODE_TTL_MINUTES} phút.`,
    );
  }

  sendPasswordResetToken(to: string, token: string) {
    return this.send(
      to,
      'Đặt lại mật khẩu',
      `Dùng token sau để đặt lại mật khẩu: ${token}`,
    );
  }

  private async send(to: string, subject: string, text: string) {
    if (!this.transporter) {
      // Chế độ dev không có SMTP: log là kênh "gửi" duy nhất, nếu không
      // sẽ không có cách nào lấy được mã để test. Không bao giờ bật ở production.
      this.logger.warn(`[NO SMTP] gửi tới ${to} | ${subject} | ${text}`);
      return;
    }

    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text });
    } catch (error) {
      this.logger.error(
        `Gửi email thất bại tới ${to}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
