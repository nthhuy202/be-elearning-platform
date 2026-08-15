import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) {}

  sendVerificationCode(phone: string, code: string) {
    // Dự án học tập không đăng ký nhà mạng/Twilio nên SMS được mock hoàn toàn:
    // log chính là kênh giao mã. Phải thay bằng provider thật trước production.
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      this.logger.error('SmsService chưa được cấu hình provider thật');
      return;
    }

    this.logger.warn(`[MOCK SMS] gửi tới ${phone}: mã xác minh ${code}`);
  }
}
