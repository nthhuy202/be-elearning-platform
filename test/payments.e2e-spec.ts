import request from 'supertest';
import { createHmac } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { PaymentStatus, Role } from 'generated/prisma/enums';

import { createTestApp, resetDb } from './helpers/test-app';
import { PrismaService } from 'src/prisma/prisma.service';

const PRICE = 500_000;

const STUDENT = {
  email: 'student@test.local',
  password: 'Password123',
  fullName: 'Nguyen Van A',
};

// Ký lại độc lập với VnpayService. Không bắt được lỗi thuật toán (cùng một
// cách làm), nhưng ghim chặt định dạng chuỗi ký: đổi thứ tự key hay đổi cách
// encode dấu cách là test đỏ ngay.
function signQuery(params: Record<string, string>) {
  const signData = Object.keys(params)
    .sort()
    .map(
      (key) => `${key}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`,
    )
    .join('&');

  return createHmac('sha512', process.env.VNPAY_HASH_SECRET as string)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');
}

function ipnQuery(overrides: Record<string, string>): Record<string, string> {
  const params: Record<string, string> = {
    vnp_Amount: String(PRICE * 100),
    vnp_BankCode: 'NCB',
    vnp_OrderInfo: 'Thanh toan khoa hoc',
    vnp_PayDate: '20260816120000',
    vnp_ResponseCode: '00',
    vnp_TmnCode: process.env.VNPAY_TMN_CODE as string,
    vnp_TransactionNo: '14231234',
    vnp_TransactionStatus: '00',
    ...overrides,
  };

  return { ...params, vnp_SecureHash: signQuery(params) };
}

describe('Payments VNPAY IPN (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let courseId: string;
  let paymentId: string;
  let txnRef: string;

  const http = () => request(app.getHttpServer());

  const sendIpn = (overrides: Record<string, string> = {}) =>
    http()
      .get('/payments/vnpay/ipn')
      .query(ipnQuery({ vnp_TxnRef: txnRef, ...overrides }));

  const paymentStatus = async () => {
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    return payment.status;
  };

  const countEnrollments = () =>
    prisma.enrollment.count({ where: { courseId } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await resetDb(app);

    const instructor = await prisma.user.create({
      data: {
        email: 'instructor@test.local',
        // Không bao giờ đăng nhập bằng tài khoản này nên không cần hash thật.
        passwordHash: 'khong-dung-de-dang-nhap',
        fullName: 'Giang Vien',
        role: Role.INSTRUCTOR,
      },
    });

    const course = await prisma.course.create({
      data: {
        instructorId: instructor.id,
        title: 'Khoa hoc NestJS',
        price: PRICE,
        currency: 'VND',
      },
    });

    courseId = course.id;

    await http().post('/auth/register').send(STUDENT).expect(201);

    const login = await http()
      .post('/auth/login')
      .send({ email: STUDENT.email, password: STUDENT.password })
      .expect(200);

    const created = await http()
      .post('/payments')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ courseId })
      .expect(201);

    paymentId = created.body.data.payment.id;
    txnRef = created.body.data.payment.providerTransactionId;
  });

  it('chữ ký sai thì trả 97 và không đụng vào dữ liệu', async () => {
    const query = ipnQuery({ vnp_TxnRef: txnRef });

    // Sửa số tiền SAU khi ký — đúng kịch bản kẻ tấn công tự gọi IPN.
    query.vnp_Amount = String(PRICE * 100 + 1);

    const response = await http()
      .get('/payments/vnpay/ipn')
      .query(query)
      .expect(200);

    expect(response.body).toEqual({
      RspCode: '97',
      Message: 'Invalid signature',
    });

    await expect(paymentStatus()).resolves.toBe(PaymentStatus.PENDING);
    await expect(countEnrollments()).resolves.toBe(0);
  });

  it('không có chữ ký thì trả 97', async () => {
    const unsigned = ipnQuery({ vnp_TxnRef: txnRef });
    delete unsigned.vnp_SecureHash;

    const response = await http()
      .get('/payments/vnpay/ipn')
      .query(unsigned)
      .expect(200);

    expect(response.body.RspCode).toBe('97');
    await expect(paymentStatus()).resolves.toBe(PaymentStatus.PENDING);
  });

  it('mã giao dịch không tồn tại thì trả 01', async () => {
    const response = await sendIpn({ vnp_TxnRef: 'khong-ton-tai' }).expect(200);

    expect(response.body.RspCode).toBe('01');
  });

  it('chữ ký đúng nhưng lệch số tiền thì trả 04 và không ghi danh', async () => {
    const response = await sendIpn({
      vnp_Amount: String(PRICE * 100 - 100),
    }).expect(200);

    expect(response.body.RspCode).toBe('04');
    await expect(paymentStatus()).resolves.toBe(PaymentStatus.PENDING);
    await expect(countEnrollments()).resolves.toBe(0);
  });

  it('thanh toán hợp lệ thì trả 00, chuyển SUCCEEDED và tạo ghi danh', async () => {
    const response = await sendIpn().expect(200);

    expect(response.body).toEqual({
      RspCode: '00',
      Message: 'Confirm Success',
    });

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(payment.paidAt).not.toBeNull();

    const enrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { studentId_courseId: { studentId: payment.userId, courseId } },
    });

    expect(enrollment.paymentId).toBe(paymentId);
  });

  it('gọi lại IPN lần hai thì trả 02 và vẫn chỉ có một ghi danh', async () => {
    await sendIpn().expect(200);

    const replay = await sendIpn().expect(200);

    expect(replay.body).toEqual({
      RspCode: '02',
      Message: 'Order already confirmed',
    });

    await expect(countEnrollments()).resolves.toBe(1);
  });

  it('giao dịch bị huỷ thì đánh dấu FAILED và không ghi danh', async () => {
    // RspCode 00 ở đây nghĩa là "đã ghi nhận IPN", không phải "thanh toán
    // thành công" — nếu trả khác 00 thì VNPAY sẽ gửi lại mãi.
    const response = await sendIpn({
      vnp_ResponseCode: '24',
      vnp_TransactionStatus: '02',
    }).expect(200);

    expect(response.body.RspCode).toBe('00');
    await expect(paymentStatus()).resolves.toBe(PaymentStatus.FAILED);
    await expect(countEnrollments()).resolves.toBe(0);
  });
});
