import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { VnpayService } from './vnpay.service';
import { MESSAGES } from 'src/common/messages';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  VNPAY_CURRENCY,
  VNPAY_IPN_RESPONSE,
  VNPAY_SUCCESS_RESPONSE_CODE,
} from 'src/common/constants';
import { PaymentProvider, PaymentStatus } from 'generated/prisma/enums';
import { buildPaginatedResult } from 'src/common/utils/pagination.util';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { randomBytes } from 'crypto';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';

const PAYMENT_SELECT = {
  id: true,
  amount: true,
  currency: true,
  status: true,
  provider: true,
  providerTransactionId: true,
  paidAt: true,
  createdAt: true,
  course: { select: { id: true, title: true } },
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vnpayService: VnpayService,
    @InjectMetric('payment_events_total')
    private readonly paymentEvents: Counter<string>,
  ) {}

  async create(userId: string, dto: CreatePaymentDto, ipAddress: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
      select: { id: true, price: true, currency: true, instructorId: true },
    });

    if (!course) {
      throw new NotFoundException(MESSAGES.COURSE.NOT_FOUND);
    }

    if (course.instructorId === userId) {
      throw new BadRequestException(
        MESSAGES.ENROLLMENT.INSTRUCTOR_CANNOT_ENROLL,
      );
    }

    if (course.price <= 0) {
      throw new BadRequestException(MESSAGES.PAYMENT.COURSE_IS_FREE);
    }

    if (course.currency !== VNPAY_CURRENCY) {
      throw new BadRequestException(MESSAGES.PAYMENT.CURRENCY_NOT_SUPPORTED);
    }

    const existingEnrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: userId, courseId: course.id } },
      select: { id: true },
    });

    if (existingEnrollment) {
      throw new ConflictException(MESSAGES.ENROLLMENT.ALREADY_ENROLLED);
    }

    const txnRef = this.generateTxnRef();

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        courseId: course.id,
        provider: PaymentProvider.VNPAY,
        providerTransactionId: txnRef,
        amount: course.price,
        currency: course.currency,
      },
      select: PAYMENT_SELECT,
    });

    const paymentUrl = this.vnpayService.buildPaymentUrl({
      txnRef,
      amount: payment.amount,
      orderInfo: `Thanh toan khoa hoc ${course.id}`,
      ipAddress,
    });

    return { payment, paymentUrl };
  }

  async findMine(userId: string, query: QueryPaymentDto) {
    const {
      page = DEFAULT_PAGE,
      limit = DEFAULT_PAGE_SIZE,
      sortOrder = 'desc',
      status,
    } = query;

    const where = { userId, ...(status && { status }) };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        select: PAYMENT_SELECT,
        orderBy: [{ createdAt: sortOrder }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return buildPaginatedResult(items, total, page, limit);
  }

  async handleVnpayIpn(query: Record<string, string>) {
    try {
      if (!this.vnpayService.isSignatureValid(query)) {
        this.paymentEvents.inc({
          provider: 'vnpay',
          result: 'invalid_signature',
        });
        this.logger.warn(
          `IPN sai chữ ký, vnp_TxnRef=${query.vnp_TxnRef ?? 'unknown'}`,
        );
        return VNPAY_IPN_RESPONSE.INVALID_SIGNATURE;
      }

      const payment = await this.findByTxnRef(query.vnp_TxnRef);

      if (!payment) {
        this.paymentEvents.inc({ provider: 'vnpay', result: 'not_found' });
        this.logger.warn(`IPN không tìm thấy giao dịch ${query.vnp_TxnRef}`);
        return VNPAY_IPN_RESPONSE.ORDER_NOT_FOUND;
      }

      if (payment.status !== PaymentStatus.PENDING) {
        this.paymentEvents.inc({
          provider: 'vnpay',
          result: 'already_confirmed',
        });
        return VNPAY_IPN_RESPONSE.ORDER_ALREADY_CONFIRMED;
      }

      if (Number(query.vnp_Amount) !== payment.amount * 100) {
        this.paymentEvents.inc({
          provider: 'vnpay',
          result: 'amount_mismatch',
        });
        this.logger.error(
          `IPN lệch số tiền, paymentId=${payment.id}, nhận=${query.vnp_Amount}, mong đợi=${payment.amount * 100}`,
        );
        return VNPAY_IPN_RESPONSE.INVALID_AMOUNT;
      }

      if (query.vnp_ResponseCode !== VNPAY_SUCCESS_RESPONSE_CODE) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED },
        });

        this.paymentEvents.inc({ provider: 'vnpay', result: 'failed' });
        this.logger.warn(
          `Thanh toán thất bại, paymentId=${payment.id}, mã=${query.vnp_ResponseCode}`,
        );

        return VNPAY_IPN_RESPONSE.SUCCESS;
      }

      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.SUCCEEDED, paidAt: new Date() },
        }),
        this.prisma.enrollment.upsert({
          where: {
            studentId_courseId: {
              studentId: payment.userId,
              courseId: payment.courseId,
            },
          },
          create: {
            studentId: payment.userId,
            courseId: payment.courseId,
            paymentId: payment.id,
          },
          update: { paymentId: payment.id },
        }),
      ]);

      this.paymentEvents.inc({ provider: 'vnpay', result: 'succeeded' });
      this.logger.log(
        `Thanh toán thành công, paymentId=${payment.id}, userId=${payment.userId}, courseId=${payment.courseId}`,
      );

      return VNPAY_IPN_RESPONSE.SUCCESS;
    } catch (error) {
      this.paymentEvents.inc({ provider: 'vnpay', result: 'error' });
      this.logger.error(
        `Lỗi xử lý IPN, vnp_TxnRef=${query.vnp_TxnRef ?? 'unknown'}`,
        error instanceof Error ? error.stack : undefined,
      );

      return VNPAY_IPN_RESPONSE.UNKNOWN_ERROR;
    }
  }

  async handleVnpayReturn(query: Record<string, string>) {
    if (!this.vnpayService.isSignatureValid(query)) {
      throw new BadRequestException(MESSAGES.PAYMENT.INVALID_SIGNATURE);
    }

    const payment = await this.findByTxnRef(query.vnp_TxnRef);

    if (!payment) {
      throw new NotFoundException(MESSAGES.PAYMENT.NOT_FOUND);
    }

    return {
      paymentId: payment.id,
      status: payment.status,
      responseCode: query.vnp_ResponseCode,
    };
  }

  private findByTxnRef(txnRef: string) {
    return this.prisma.payment.findUnique({
      where: {
        provider_providerTransactionId: {
          provider: PaymentProvider.VNPAY,
          providerTransactionId: txnRef,
        },
      },
      select: {
        id: true,
        userId: true,
        courseId: true,
        amount: true,
        status: true,
      },
    });
  }

  private generateTxnRef() {
    return `${Date.now().toString(36)}${randomBytes(6).toString('hex')}`;
  }
}
