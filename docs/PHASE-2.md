# Phase 2 — Test tích hợp & CI

> Viết test trước, dựng CI sau. CI không có test chỉ là một cái badge xanh.
>
> **Shell: Git Bash (POSIX).**

---

## Lộ trình

| Bước | Nội dung | Trạng thái |
|---|---|---|
| **2.0.1** | Hạ tầng test: DB riêng, reset dữ liệu, app helper | ✅ |
| **2.0.2** | Test luồng auth — 14 test | ✅ |
| **2.0.3** | Test luồng payment IPN — 7 test | ✅ |
| 2.1 | GitHub Actions: `lint` + `typecheck` + `build` | ⏳ |
| 2.2 | Postgres service container trong CI | ⏳ |
| 2.3 | Build Docker image trong CI, dùng cache GitHub | ⏳ |
| 2.4 | Đẩy image lên `ghcr.io`, tag theo commit SHA | ⏳ |

---

## Bước 2.0.1 — Hạ tầng test

### Nguyên tắc

**Test đi qua đúng pipeline của production.** Cùng `ValidationPipe`, cùng exception filter,
cùng transform interceptor. Vì vậy `src/app.setup.ts` được tách ra và **cả `main.ts` lẫn test
helper đều gọi nó** — chép tay sang test là hai bên sẽ trôi khỏi nhau, và test sẽ kiểm tra
một ứng dụng không tồn tại.

**Database test tách hẳn khỏi database dev.** Mỗi test `TRUNCATE` sạch bảng; trỏ nhầm là
mất toàn bộ dữ liệu dev.

### Các file

| File | Vai trò |
|---|---|
| `.env.test` | Biến môi trường cho test. **Được commit** — không chứa secret thật, CI dùng lại |
| `src/app.setup.ts` | `configureApp()` — pipeline dùng chung cho `main.ts` và test |
| `test/setup-e2e.ts` | Nạp `.env.test` vào `process.env` trước khi app khởi tạo |
| `test/helpers/test-app.ts` | `createTestApp()` + `resetDb()` |
| `test/jest-e2e.json` | Cấu hình Jest cho e2e |

### Chuẩn bị database test

```bash
docker compose up -d db
docker compose exec db psql -U postgres -c "CREATE DATABASE elearning_test;"

DATABASE_URL="postgresql://postgres:postgres@localhost:5433/elearning_test?schema=public" \
  npx prisma migrate deploy
```

Lệnh cuối phải chạy lại mỗi khi thêm migration mới.

### Cấu hình Jest — 5 dòng không hiển nhiên

```json
{
  "rootDir": "..",
  "moduleDirectories": ["node_modules", "<rootDir>"],
  "moduleNameMapper": { "^(\\.{1,2}/.*)\\.js$": "$1" },
  "setupFiles": ["<rootDir>/test/setup-e2e.ts"],
  "maxWorkers": 1
}
```

| Dòng | Vì sao |
|---|---|
| `rootDir: ".."` + `moduleDirectories` | Để import `'src/app.module'` và `'generated/prisma/enums'` giải được đúng như trong code thật |
| `moduleNameMapper` | Xem bẫy #1 bên dưới |
| `setupFiles` | Nạp `.env.test` **trước** khi module nào được import |
| `maxWorkers: 1` | **Bắt buộc.** Các file test chạy song song sẽ `TRUNCATE` đè lên nhau và fail ngẫu nhiên |

### Lệnh chạy test

```json
"test:e2e": "node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json"
```

Xem bẫy #2.

---

## Bước 2.0.2 — Test luồng auth (14 test)

`test/auth.e2e-spec.ts`. Chọn test theo **giá trị bảo mật**, không theo phần trăm coverage.

| Nhóm | Test đáng giá nhất |
|---|---|
| `POST /auth/register` | Chặn tự phong `role: 'ADMIN'` qua body (`forbidNonWhitelisted`); `JSON.stringify(body)` không được chứa mật khẩu |
| `POST /auth/login` | Sai mật khẩu và email không tồn tại phải trả **cùng một message** — chống dò tài khoản |
| `GET /auth/me` | Không token / token rác → 401 |
| Quên mật khẩu | Email lạ vẫn trả 200 và **không** gửi mail; token đặt lại chỉ dùng được một lần |
| `PATCH /users/me/password` | Mật khẩu cũ hết hiệu lực sau khi đổi |

Token đặt lại lấy từ mock, không đọc DB:

```ts
const [, resetToken] = mailServiceMock.sendPasswordResetToken.mock.calls[0];
```

Muốn `resetToken` là `string` chứ không phải `any` thì phải khai kiểu cho mock
(cú pháp Jest 30):

```ts
sendPasswordResetToken: jest.fn<(to: string, token: string) => Promise<void>>(),
```

## Bước 2.0.3 — Test luồng payment IPN (7 test)

`test/payments.e2e-spec.ts`. Đây là chỗ **duy nhất** `payments.status` chuyển sang
`SUCCEEDED` và `enrollments` được tạo — và người gọi nó đến từ internet.

Fixture dựng bằng Prisma trực tiếp (giảng viên + khoá học), luồng cần test thì đi qua HTTP
(đăng ký → đăng nhập → `POST /payments` lấy `txnRef` thật → gọi IPN).

| Test | Bảo vệ điều gì |
|---|---|
| Chữ ký sai | Sửa `vnp_Amount` **sau khi ký**. Chứng minh signature được kiểm **trước** khi kiểm tiền |
| Thiếu chữ ký | `isSignatureValid` phải `return false`, không so sánh với `undefined` |
| `vnp_TxnRef` lạ | Không tự tạo giao dịch từ dữ liệu callback |
| Lệch số tiền | Ký đúng nhưng báo sai tiền → `04`, không ghi danh |
| Hợp lệ | `SUCCEEDED` + `paidAt` + `enrollment.paymentId` — cả transaction phải chạy trọn |
| Gọi lại lần hai | VNPAY **có** gửi lại IPN. Không idempotent là `@@unique` nổ hoặc ghi danh trùng |
| Bị huỷ (`vnp_ResponseCode=24`) | Trả `00` nhưng đánh dấu `FAILED` và **không** ghi danh |

Test cuối dễ viết sai nhất: `RspCode` nghĩa là *"tôi đã nhận và xử lý xong"*, **không** phải
*"giao dịch thành công"*. Trả `99` cho giao dịch huỷ sẽ khiến VNPAY retry vô hạn.

Hàm ký trong test được viết lại độc lập với `VnpayService`. Nó không bắt được lỗi thuật toán
(cùng một cách làm) nhưng ghim chặt định dạng chuỗi ký — đổi thứ tự key hay đổi
`%20` → `+` là test đỏ ngay. Khoá bí mật đọc từ `process.env.VNPAY_HASH_SECRET` để không
lệch với `.env.test`.

---

## Bẫy của bước 2.0.1

### #1 — `Cannot find module './internal/class.js'`

Prisma 7 sinh client dạng **TypeScript** nhưng import nội bộ ghi đuôi `.js`
(kiểu ESM, do `moduleResolution: nodenext`). Node hiểu, resolver của Jest thì không —
nó đi tìm `class.js` trong khi file thật là `class.ts`.

```json
"moduleNameMapper": { "^(\\.{1,2}/.*)\\.js$": "$1" }
```

Cắt đuôi `.js` khỏi **mọi import tương đối**. Pattern chỉ khớp đường dẫn bắt đầu bằng dấu chấm
nên import từ package (`@prisma/client/runtime/client`) vẫn giải bình thường.

### #2 — `A dynamic import callback was invoked without --experimental-vm-modules`

Engine của Prisma 7 nạp WASM query compiler bằng `import()` động. Môi trường VM của Jest
chặn dynamic import trừ khi bật cờ.

Cách thường thấy là `NODE_OPTIONS=--experimental-vm-modules jest`, nhưng trên Windows
`npm run` gọi `cmd.exe` nên cú pháp gán biến kiểu shell hỏng. Gọi thẳng Jest bằng `node`
thì chạy giống nhau ở mọi nền tảng và **không cần thêm dependency** (`cross-env`):

```
node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json
```

### #3 — Lỗi thật bị chôn dưới lỗi giả

`beforeAll` fail → `app` là `undefined` → `afterAll` ném
`Cannot read properties of undefined (reading 'close')`, đè lên nguyên nhân gốc.

```ts
afterAll(async () => {
  await app?.close();
});
```

### #4 — `override: true` khi nạp `.env.test`

```ts
config({ path: '.env.test', override: true, quiet: true });
```

Không có `override`, biến `DATABASE_URL` đang có sẵn trong shell sẽ thắng và test chạy vào
**database dev**, rồi `TRUNCATE` sạch dữ liệu của bạn.

### #5 — Không override được guard toàn cục từ testing module

Throttler tính theo IP. Mọi test đến từ cùng một IP nên sẽ dính `429` giữa chừng.
Phản xạ đầu tiên là ghi đè guard — **cả hai cách dưới đây đều không chạy, và Nest
không hề báo lỗi**:

```ts
.overrideGuard(ThrottlerGuard).useValue(...)   // vô tác dụng
.overrideProvider(APP_GUARD).useValue(...)     // cũng vô tác dụng
```

Lý do nằm ở `node_modules/@nestjs/core/scanner.js:247`:

```js
const providerToken = `${type} (UUID: ${uuid})`;
```

Provider `APP_GUARD` **không** được đăng ký dưới token `APP_GUARD` mà dưới
`"APP_GUARD (UUID: <ngẫu nhiên>)"` — UUID chỉ tất định khi bật snapshot.
`Module.replace()` so khớp bằng `hasProvider(token)` nên không tìm thấy gì và im lặng bỏ qua.

Dùng `skipIf` — API của chính `@nestjs/throttler`:

```ts
ThrottlerModule.forRoot({
  throttlers: [{ name: 'default', ...THROTTLE.DEFAULT }],
  errorMessage: MESSAGES.COMMON.TOO_MANY_REQUESTS,
  skipIf: () => process.env.NODE_ENV === 'test',
}),
```

Phải đặt ở **gốc** `forRoot`, không phải trong `throttlers[]`: guard đọc nó qua
`commonOptions` (`throttler.guard.js:72`) nên nó thắng cả `@Throttle()` gắn trên từng route.
Đặt trong `throttlers[]` thì `@Throttle({ default: ... })` sẽ ghi đè mất.

Đánh đổi: không e2e test được rate limiting. Chấp nhận — hành vi đó đã kiểm thử tay ở Phase 0 §12.

### #6 — Chạy `npx tsc --noEmit` trước khi chạy test

Lỗi copy-paste và lỗi kiểu hiện ra dưới dạng `ReferenceError` giữa stack trace của Jest,
rất tốn thời gian đọc. `tsc --noEmit` chỉ thẳng ra file + dòng trong một lần chạy.

Một lỗi kiểu đã gặp: **TypeScript làm rơi index signature khi spread**.

```ts
function ipnQuery(overrides: Record<string, string>) {
  return { ...params, vnp_SecureHash: signQuery(params) };
}
// suy ra: { vnp_SecureHash: string } — mất hết key còn lại
```

Khai báo kiểu trả về tường minh là xong: `): Record<string, string> {`.
