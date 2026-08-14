import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  VNPAY_COMMAND,
  VNPAY_CURRENCY,
  VNPAY_EXPIRE_MINUTES,
  VNPAY_LOCALE,
  VNPAY_ORDER_TYPE,
  VNPAY_VERSION,
} from 'src/common/constants';

type BuildPaymentUrlInput = {
  txnRef: string;
  amount: number;
  orderInfo: string;
  ipAddress: string;
};

@Injectable()
export class VnpayService {
  private readonly tmnCode: string;
  private readonly hashSecret: string;
  private readonly payUrl: string;
  private readonly returnUrl: string;

  constructor(configService: ConfigService) {
    this.tmnCode = configService.getOrThrow<string>('VNPAY_TMN_CODE');
    this.hashSecret = configService.getOrThrow<string>('VNPAY_HASH_SECRET');
    this.payUrl = configService.getOrThrow<string>('VNPAY_PAY_URL');
    this.returnUrl = configService.getOrThrow<string>('VNPAY_RETURN_URL');
  }

  buildPaymentUrl(input: BuildPaymentUrlInput) {
    const createdAt = new Date();
    const expiredAt = new Date(
      createdAt.getTime() + VNPAY_EXPIRE_MINUTES * 60 * 1000,
    );

    const params: Record<string, string> = {
      vnp_Version: VNPAY_VERSION,
      vnp_Command: VNPAY_COMMAND,
      vnp_TmnCode: this.tmnCode,
      vnp_Amount: (input.amount * 100).toString(),
      vnp_CurrCode: VNPAY_CURRENCY,
      vnp_TxnRef: input.txnRef,
      vnp_OrderInfo: input.orderInfo,
      vnp_OrderType: VNPAY_ORDER_TYPE,
      vnp_Locale: VNPAY_LOCALE,
      vnp_ReturnUrl: this.returnUrl,
      vnp_IpAddr: input.ipAddress,
      vnp_CreateDate: this.formatDate(createdAt),
      vnp_ExpireDate: this.formatDate(expiredAt),
    };

    const signData = this.buildSignData(params);
    const secureHash = this.sign(signData);

    return `${this.payUrl}?${signData}&vnp_SecureHash=${secureHash}`;
  }

  isSignatureValid(query: Record<string, string>) {
    const params = { ...query };
    const receivedHash = params.vnp_SecureHash;

    delete params.vnp_SecureHash;
    delete params.vnp_SecureHashType;

    if (!receivedHash) {
      return false;
    }

    const expectedHash = this.sign(this.buildSignData(params));

    return this.isEqualInConstantTime(receivedHash, expectedHash);
  }

  private buildSignData(params: Record<string, string>) {
    return Object.keys(params)
      .sort()
      .map(
        (key) =>
          `${key}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`,
      )
      .join('&');
  }

  private sign(signData: string) {
    return createHmac('sha512', this.hashSecret)
      .update(Buffer.from(signData, 'utf-8'))
      .digest('hex');
  }

  private isEqualInConstantTime(received: string, expected: string) {
    const receivedBuffer = Buffer.from(received, 'utf-8');
    const expectedBuffer = Buffer.from(expected, 'utf-8');

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(receivedBuffer, expectedBuffer);
  }

  // VNPAY yêu cầu giờ GMT+7; tự cộng offset thay vì dựa vào timezone của máy chủ,
  // vì container trên K8s hầu như luôn chạy UTC.
  private formatDate(date: Date) {
    const gmt7 = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const pad = (value: number) => value.toString().padStart(2, '0');

    return [
      gmt7.getUTCFullYear(),
      pad(gmt7.getUTCMonth() + 1),
      pad(gmt7.getUTCDate()),
      pad(gmt7.getUTCHours()),
      pad(gmt7.getUTCMinutes()),
      pad(gmt7.getUTCSeconds()),
    ].join('');
  }
}
