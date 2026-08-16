import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

import { createTestApp, mailServiceMock, resetDb } from './helpers/test-app';

const STUDENT = {
  email: 'student@test.local',
  password: 'Password123',
  fullName: 'Nguyen Van A',
};

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /auth/register', () => {
    it('tạo tài khoản STUDENT và không để lộ mật khẩu', async () => {
      const response = await http()
        .post('/auth/register')
        .send(STUDENT)
        .expect(201);

      expect(response.body.data).toMatchObject({
        email: STUDENT.email,
        fullName: STUDENT.fullName,
        role: 'STUDENT',
        isEmailVerified: false,
      });

      expect(response.body.data).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(response.body)).not.toContain(STUDENT.password);
    });

    it('từ chối email đã tồn tại', async () => {
      await http().post('/auth/register').send(STUDENT).expect(201);
      await http().post('/auth/register').send(STUDENT).expect(409);
    });

    it('từ chối mật khẩu ngắn hơn 8 ký tự', async () => {
      await http()
        .post('/auth/register')
        .send({ ...STUDENT, password: 'short' })
        .expect(400);
    });

    it('chặn tự phong quyền ADMIN qua body', async () => {
      await http()
        .post('/auth/register')
        .send({ ...STUDENT, role: 'ADMIN' })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await http().post('/auth/register').send(STUDENT).expect(201);
    });

    it('đăng nhập đúng thì trả accessToken', async () => {
      const response = await http()
        .post('/auth/login')
        .send({ email: STUDENT.email, password: STUDENT.password })
        .expect(200);

      expect(typeof response.body.data.accessToken).toBe('string');
      expect(response.body.data.user.email).toBe(STUDENT.email);
      expect(response.body.data.user).not.toHaveProperty('passwordHash');
    });

    it('sai mật khẩu và email không tồn tại trả về CÙNG một lỗi', async () => {
      const wrongPassword = await http()
        .post('/auth/login')
        .send({ email: STUDENT.email, password: 'WrongPassword1' })
        .expect(401);

      const unknownEmail = await http()
        .post('/auth/login')
        .send({ email: 'khong-ton-tai@test.local', password: STUDENT.password })
        .expect(401);

      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });
  });

  describe('GET /auth/me', () => {
    it('từ chối khi không có token', async () => {
      await http().get('/auth/me').expect(401);
    });

    it('từ chối token rác', async () => {
      await http()
        .get('/auth/me')
        .set('Authorization', 'Bearer khong-phai-jwt')
        .expect(401);
    });

    it('trả đúng người dùng của token', async () => {
      await http().post('/auth/register').send(STUDENT).expect(201);

      const login = await http()
        .post('/auth/login')
        .send({ email: STUDENT.email, password: STUDENT.password })
        .expect(200);

      const response = await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .expect(200);

      expect(response.body.data.email).toBe(STUDENT.email);
    });
  });

  describe('Quên & đặt lại mật khẩu', () => {
    it('email không tồn tại vẫn trả 200 và không gửi mail', async () => {
      await http()
        .post('/auth/forgot-password')
        .send({ email: 'khong-ton-tai@test.local' })
        .expect(200);

      expect(mailServiceMock.sendPasswordResetToken).not.toHaveBeenCalled();
    });

    it('đặt lại mật khẩu xong thì mật khẩu cũ hết hiệu lực', async () => {
      await http().post('/auth/register').send(STUDENT).expect(201);

      await http()
        .post('/auth/forgot-password')
        .send({ email: STUDENT.email })
        .expect(200);

      const [, resetToken] =
        mailServiceMock.sendPasswordResetToken.mock.calls[0];

      await http()
        .post('/auth/reset-password')
        .send({ token: resetToken, newPassword: 'NewPassword123' })
        .expect(200);

      await http()
        .post('/auth/login')
        .send({ email: STUDENT.email, password: STUDENT.password })
        .expect(401);

      await http()
        .post('/auth/login')
        .send({ email: STUDENT.email, password: 'NewPassword123' })
        .expect(200);
    });

    it('token đặt lại chỉ dùng được một lần', async () => {
      await http().post('/auth/register').send(STUDENT).expect(201);
      await http()
        .post('/auth/forgot-password')
        .send({ email: STUDENT.email })
        .expect(200);

      const [, resetToken] =
        mailServiceMock.sendPasswordResetToken.mock.calls[0];

      await http()
        .post('/auth/reset-password')
        .send({ token: resetToken, newPassword: 'NewPassword123' })
        .expect(200);

      await http()
        .post('/auth/reset-password')
        .send({ token: resetToken, newPassword: 'AnotherPassword123' })
        .expect(400);
    });
  });

  describe('PATCH /users/me/password', () => {
    it('đổi mật khẩu xong thì mật khẩu cũ hết hiệu lực', async () => {
      await http().post('/auth/register').send(STUDENT).expect(201);

      const login = await http()
        .post('/auth/login')
        .send({ email: STUDENT.email, password: STUDENT.password })
        .expect(200);

      await http()
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .send({
          currentPassword: STUDENT.password,
          newPassword: 'NewPassword123',
        })
        .expect(200);

      await http()
        .post('/auth/login')
        .send({ email: STUDENT.email, password: STUDENT.password })
        .expect(401);
    });

    it('từ chối 401 khi mật khẩu hiện tại sai', async () => {
      await http().post('/auth/register').send(STUDENT).expect(201);

      const login = await http()
        .post('/auth/login')
        .send({ email: STUDENT.email, password: STUDENT.password })
        .expect(200);

      await http()
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .send({
          currentPassword: 'SaiHoanToan1',
          newPassword: 'NewPassword123',
        })
        .expect(401);
    });
  });
});
