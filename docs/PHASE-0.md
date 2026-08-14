# Phase 0 — BE Fundamentals (Tổng kết)

> Tài liệu tổng hợp toàn bộ Phase 0 của dự án **elearning-platform**: đã xây gì, theo thứ tự nào,
> vì sao quyết định như vậy, và còn nợ gì trước khi sang Phase 1 (Docker).
>
> Cập nhật: 2026-08-15

---

## 1. Trạng thái

| Hạng mục | Trạng thái |
|---|---|
| Bước 0.1 → 0.15 | ✅ Đã hoàn thành và chạy được |
| Bước 0.16 (rate limit + verify + health) | ⏳ Đã có hướng dẫn, **chưa áp dụng vào code** |

Kiểm chứng nhanh bước 0.16 đã áp dụng chưa:

```bash
ls src/health src/notifications src/auth/verification.service.ts
grep -E '"(@nestjs/throttler|nodemailer)"' package.json
```

---

## 2. Stack

| Thành phần | Lựa chọn | Ghi chú |
|---|---|---|
| Framework | NestJS 11 | `@nestjs/platform-express` |
| Ngôn ngữ | TypeScript 5.7, target ES2023 | `nodenext`, decorators bật |
| ORM | **Prisma 7** | generator `prisma-client` (không phải `prisma-client-js`) |
| Driver | `@prisma/adapter-pg` + `pg` | Prisma 7 yêu cầu driver adapter |
| DB | PostgreSQL (Docker) | host port **5433** |
| Auth | `@nestjs/jwt` + `passport-jwt` | JWT stateless |
| Hash | `bcrypt` (salt rounds 10) | mật khẩu |
| Validate | `class-validator` + `class-transformer` | qua `ValidationPipe` toàn cục |
| Cổng thanh toán | VNPAY (HMAC-SHA512) | không cần SDK |
| Cổng chạy app | **8080** | `PORT` trong `.env` |

**Lưu ý riêng của Prisma 7 trong dự án này:**

- Client sinh ra ở `generated/prisma/` (không phải `node_modules/.prisma`), `moduleFormat = "cjs"`.
- `Role`, `PaymentStatus`, `PaymentProvider`, `VerificationType` **không phải TS enum** mà là
  `const object + union type`. `Role.ADMIN` dùng được như giá trị, `Role` dùng được như kiểu.
- Import: enum từ `generated/prisma/enums`, namespace `Prisma` (chứa `PrismaClientKnownRequestError`,
  `Prisma.CourseWhereInput`, …) từ `generated/prisma/client`.

---

## 3. Cấu trúc thư mục

```
src/
├── main.ts                     # bootstrap: ValidationPipe, filter, interceptor, port
├── app.module.ts               # gom toàn bộ feature module
│
├── prisma/                     # @Global() — PrismaService dùng chung
│
├── common/                     # code dùng chung, không thuộc domain nào
│   ├── constants.ts            # mọi con số/hằng nghiệp vụ
│   ├── messages.ts             # MỌI chuỗi trả về client (chuẩn bị i18n)
│   ├── decorators/             # @CurrentUser @Roles @ResponseMessage @SkipTransform
│   ├── dto/pagination-query.dto.ts
│   ├── filters/all-exceptions.filter.ts
│   ├── interceptors/transform.interceptor.ts
│   └── utils/pagination.util.ts
│
├── auth/                       # đăng ký, đăng nhập, quên/đặt lại mật khẩu, xác minh
│   ├── guards/                 # JwtAuthGuard, RolesGuard
│   ├── strategies/jwt.strategy.ts
│   └── types/                  # JwtPayload, AuthenticatedUser
│
├── users/                      # CRUD user (ADMIN) + đổi mật khẩu
├── courses/                    # CRUD khoá học + phân trang/lọc/sắp xếp
├── lessons/                    # bài học (nested dưới course) + sắp xếp lại
├── enrollments/                # đăng ký học + tiến độ (ProgressService)
├── payments/                   # VNPAY: tạo giao dịch, IPN, return URL
│
├── notifications/              # ⏳ MailService + SmsService (bước 0.16)
└── health/                     # ⏳ liveness + readiness (bước 0.16)
```

**Không có thư mục `entities/`** — Prisma model trong `schema.prisma` đóng vai trò đó. Mỗi lần
`nest g resource` sinh ra `entities/` thì xoá đi.

---

## 4. Lộ trình các bước

### Nhóm nền tảng (0.1 – 0.6)

| Nội dung | Kết quả |
|---|---|
| Dựng Postgres bằng Docker, `prisma init`, viết `schema.prisma` 8 bảng | DB chạy ở port 5433 |
| `PrismaModule` `@Global()` + `PrismaService` | mọi module inject chung 1 instance |
| `ConfigModule.forRoot({ isGlobal: true })` | đọc `.env` qua `ConfigService` |
| Module `users`: đăng ký, CRUD, `USER_SELECT` loại `passwordHash` | không bao giờ lộ hash ra response |
| Module `auth`: register / login, `JwtStrategy`, `JwtAuthGuard`, `@CurrentUser()` | JWT stateless |
| Quên & đặt lại mật khẩu: token 32 byte ngẫu nhiên, hash SHA-256, TTL 15 phút | bảng `password_reset_tokens` |

### 0.7 — Đổi mật khẩu

`PATCH /users/me/password`. Xác minh mật khẩu hiện tại bằng `bcrypt.compare`, chặn đặt lại đúng
mật khẩu cũ.

### 0.8 — Tập trung hoá message

Toàn bộ chuỗi trả về client dồn vào `src/common/messages.ts`, gom theo domain
(`COMMON` / `AUTH` / `USER` / `COURSE` / `LESSON` / `ENROLLMENT` / `PAYMENT` / `VALIDATION`),
khai `as const`, message có tham số thì viết dạng hàm:

```ts
PASSWORD_MIN_LENGTH: (min: number) => `Mật khẩu phải có ít nhất ${min} ký tự`,
```

**Quy tắc từ đây trở đi: không hard-code chuỗi trong service/DTO/controller.**
Cấu trúc này map 1-1 sang key của `nestjs-i18n` khi cần đa ngữ (chưa cài).

### 0.9 — Chuẩn hoá response (envelope)

Chọn **Kiểu A — envelope**: mọi response, thành công hay lỗi, đều có cùng khung.

```jsonc
{
  "statusCode": 200,
  "message": "Lấy danh sách khoá học thành công",
  "data": { /* hoặc null */ },
  "timestamp": "2026-08-15T…",
  "path": "/courses"
}
```

- `TransformInterceptor` bọc response thành công, lấy `message` từ `@ResponseMessage()`
  qua `Reflector.getAllAndOverride([handler, class])`, mặc định `MESSAGES.COMMON.SUCCESS`.
- `AllExceptionsFilter` (`@Catch()` không tham số) chuẩn hoá **mọi** lỗi.

**Cái giá của envelope:** không dùng được HTTP `204 No Content` nữa — 204 theo đặc tả không
được có body, Node sẽ cắt bỏ envelope. Route "không trả dữ liệu" phải là `200` + `data: null`.

### 0.10 — Phân quyền theo vai trò

`@Roles()` (`SetMetadata`) + `RolesGuard`. Thứ tự guard bắt buộc:
`@UseGuards(JwtAuthGuard, RolesGuard)` — JWT phải chạy trước để gắn `request.user`.

Đồng thời vá một lỗ hổng thật: `GET /users` trước đó **không có guard nào**, ai cũng dump được
toàn bộ email người dùng.

### 0.11 — Module `courses`

CRUD + kiểm tra quyền sở hữu (`ensureCanModifyCourse`). `instructorId` lấy từ token, không lấy từ body.
`GET /courses` và `GET /courses/:id` để **public** (danh mục khoá học).

### 0.12 — Phân trang, tìm kiếm, sắp xếp

`PaginationQueryDto` dùng chung (`page`, `limit`, có `MAX_PAGE_SIZE`), `buildPaginatedResult`,
`findMany` + `count` gói trong `$transaction`, `sortBy` qua danh sách trắng.

### 0.13 — Module `lessons`

Nested route `courses/:courseId/lessons`. `CoursesService` được `exports` để `LessonsService`
dùng lại logic phân quyền. Thêm `PATCH .../reorder` (đổi thứ tự nhiều bài trong 1 transaction).

### 0.14 — `enrollments` + `lesson_progress`

Đăng ký học (chỉ khoá miễn phí), tiến độ học qua `upsert`, chặn xoá khoá đã có học viên (409),
và khoá nội dung bài học theo enrollment.

### 0.15 — Module `payments`

VNPAY: tạo giao dịch `PENDING` + URL thanh toán đã ký, IPN xác minh HMAC-SHA512,
`$transaction` chuyển `SUCCEEDED` + tạo enrollment. Thêm `@SkipTransform()` để IPN trả đúng
định dạng VNPAY yêu cầu.

### 0.16 — ⏳ Đóng Phase 0

Rate limiting (`@nestjs/throttler`), xác minh email (`nodemailer`) / phone (mock),
health check tự viết (liveness + readiness).

---

## 5. Mô hình dữ liệu

```
User ──< Course ──< Lesson
 │         │           │
 │         └──< Enrollment ──< LessonProgress
 │                  │
 └──< Payment ──────┘
 │
 ├──< PasswordResetToken
 └──< VerificationToken
```

**8 bảng.** Quy ước chung:

- Primary key **UUID** (`@default(uuid())`), không dùng auto-increment int.
- Field camelCase trong Prisma, `@map`/`@@map` đổi sang snake_case ở Postgres.
- Tiền lưu **số nguyên, đơn vị nhỏ nhất** (`price`, `amount` kiểu `Int`).

**Ràng buộc quan trọng:**

| Ràng buộc | Bảng | Dùng để |
|---|---|---|
| `@@unique([studentId, courseId])` | `enrollments` | chặn đăng ký trùng; cho `findUnique` bằng `studentId_courseId` |
| `@@unique([enrollmentId, lessonId])` | `lesson_progress` | điều kiện bắt buộc để dùng `upsert` |
| `@@unique([provider, providerTransactionId])` | `payments` | tra cứu giao dịch từ webhook |
| `token @unique` | `password_reset_tokens` | cho `findUnique` (lý do phải hash bằng SHA-256) |

**Quy ước tên khoá tổng hợp của Prisma:** nối tên field bằng `_` theo đúng thứ tự khai báo →
`studentId_courseId`, `enrollmentId_lessonId`, `provider_providerTransactionId`.

---

## 6. Danh mục API

`🔓` public · `🔑` cần đăng nhập · `👤` ADMIN · `🎓` INSTRUCTOR/ADMIN · `⏳` chưa áp dụng

### auth

| Method | Route | Quyền | Ghi chú |
|---|---|---|---|
| POST | `/auth/register` | 🔓 | |
| POST | `/auth/login` | 🔓 | 401 chung cho cả sai email lẫn sai mật khẩu |
| POST | `/auth/forgot-password` | 🔓 | luôn 200, body giống nhau dù email có tồn tại hay không |
| POST | `/auth/reset-password` | 🔓 | |
| GET | `/auth/me` | 🔑 | |
| POST | `/auth/verify/{email,phone}/{request,confirm}` | 🔑 ⏳ | mã 6 số, TTL 10 phút |

### users

| Method | Route | Quyền |
|---|---|---|
| POST · GET | `/users` | 👤 |
| GET · PATCH · DELETE | `/users/:id` | 👤 |
| PATCH | `/users/me/password` | 🔑 |

### courses

| Method | Route | Quyền |
|---|---|---|
| GET | `/courses` | 🔓 phân trang, `search`, `instructorId`, `minPrice`/`maxPrice`, `sortBy`, `sortOrder` |
| GET | `/courses/:id` | 🔓 |
| POST | `/courses` | 🎓 |
| PATCH · DELETE | `/courses/:id` | 🎓 + phải là chủ khoá học |

### lessons

| Method | Route | Quyền |
|---|---|---|
| GET | `/courses/:courseId/lessons` | 🔓 **không trả `content`** |
| GET | `/courses/:courseId/lessons/:id` | 🔑 + phải đã đăng ký (hoặc là chủ khoá / ADMIN) |
| POST | `/courses/:courseId/lessons` | 🎓 |
| PATCH · DELETE | `/courses/:courseId/lessons/:id` | 🎓 |
| PATCH | `/courses/:courseId/lessons/reorder` | 🎓 |
| PATCH | `/courses/:courseId/lessons/:id/progress` | 🔑 + phải đã đăng ký |

### enrollments

| Method | Route | Quyền |
|---|---|---|
| POST | `/enrollments` | 🔑 chỉ khoá miễn phí |
| GET | `/enrollments/me` | 🔑 |
| DELETE | `/enrollments/:id` | 🔑 chủ sở hữu; chặn nếu đã thanh toán |
| GET | `/courses/:courseId/enrollments` | 🎓 danh sách học viên |
| GET | `/courses/:courseId/enrollments/me` | 🔑 tiến độ + % hoàn thành |

### payments

| Method | Route | Quyền |
|---|---|---|
| POST | `/payments` | 🔑 trả về `paymentUrl` |
| GET | `/payments/me` | 🔑 |
| GET | `/payments/vnpay/ipn` | 🔓 **xác minh HMAC** · `@SkipThrottle` `@SkipTransform` |
| GET | `/payments/vnpay/return` | 🔓 chỉ hiển thị, **không cấp quyền** |

### health ⏳

| Method | Route | Ghi chú |
|---|---|---|
| GET | `/health` | liveness — **không** đụng DB |
| GET | `/health/ready` | readiness — `SELECT 1`, fail → 503 |

---

## 7. Mô hình phân quyền 4 tầng

| Tầng | Câu hỏi | Ở đâu | Cần query DB? |
|---|---|---|---|
| 1 | Bạn là ai? | `JwtAuthGuard` | Không |
| 2 | Vai trò của bạn có được làm **loại** việc này? | `RolesGuard` + `@Roles()` | Không |
| 3 | Bạn có sở hữu **đúng** tài nguyên này? | `ensureCanModifyCourse` (Service) | Có |
| 4 | Bạn có quyền **truy cập nội dung** này? | `ensureEnrolled` (Service) | Có |

Hai tầng đầu là tĩnh, đọc được từ token. Hai tầng sau bắt buộc phải hỏi DB.

**Bỏ tầng 3 = lỗ hổng IDOR** (Insecure Direct Object Reference): giảng viên A qua được tầng 1–2
rồi sửa/xoá khoá học của giảng viên B chỉ bằng cách đổi UUID trên URL.

**Lưu ý JWT bị "cũ":** `role` được nướng vào token lúc ký. Đổi role trong Prisma Studio **không**
làm token đang có hiệu lực đổi theo — phải đăng nhập lại. Muốn luôn tươi thì `JwtStrategy.validate()`
phải query DB mỗi request, đánh đổi bằng hiệu năng.

---

## 8. Các quyết định bảo mật và lý do

| Quyết định | Lý do |
|---|---|
| Login trả **một** message 401 chung | Chặn **user enumeration** — message riêng cho "email không tồn tại" giúp kẻ tấn công lọc ra danh sách tài khoản có thật |
| `forgotPassword` `return` rỗng thay vì `throw NotFoundException` | Cùng lý do trên. Quy tắc chung: throw 404 khi danh tính tài nguyên không nhạy cảm; trả chung chung khi chính câu trả lời "có tồn tại không" là thứ kẻ tấn công muốn |
| Reset token hash bằng **SHA-256**, không phải bcrypt | SHA-256 tất định → `findUnique` trên cột có index. Bcrypt có salt ngẫu nhiên → phải quét cả bảng. An toàn vì đầu vào là 32 byte ngẫu nhiên, không phải mật khẩu người đặt |
| Cấp token/mã mới thì huỷ hết cái cũ | 5 mã cùng hợp lệ = không gian tìm kiếm giảm 5 lần |
| `timingSafeEqual` khi so chữ ký | `===` dừng ở ký tự khác đầu tiên → rò rỉ thông tin qua **timing attack** |
| `crypto.randomInt` / `randomBytes`, **không** `Math.random` | `Math.random` tất định, đoán được giá trị kế tiếp |
| `amount` **không** nằm trong DTO | Server tự đọc `courses.price`. Để client gửi = bán lỗ |
| Route webhook **không** có `JwtAuthGuard` | VNPAY không có JWT của user. Chữ ký HMAC thay thế vai trò guard |
| Chỉ IPN được cấp enrollment, Return URL thì không | Return URL nằm trên thanh địa chỉ trình duyệt, người dùng sửa query string được |
| Rate limit login / forgot-password / verify ⏳ | Không có nó, mã OTP 6 số bị dò hết 1.000.000 khả năng trong vài phút |
| Tiền lưu số nguyên | `0.1 + 0.2 === 0.30000000000000004` |

---

## 9. Các pattern kỹ thuật lặp lại

### `SetMetadata` + `Reflector` — dùng 3 lần

| Decorator | Metadata key | Đọc ở |
|---|---|---|
| `@ResponseMessage()` | `response_message` | `TransformInterceptor` |
| `@Roles()` | `roles` | `RolesGuard` |
| `@SkipTransform()` | `skip_transform` | `TransformInterceptor` |

Luôn đọc bằng `reflector.getAllAndOverride(KEY, [context.getHandler(), context.getClass()])` —
method ghi đè class.

### `$transaction` — 4 tình huống khác nhau

| Tình huống | Vì sao cần |
|---|---|
| `findMany` + `count` (phân trang) | Hai lần đọc phải thấy cùng ảnh chụp dữ liệu, nếu không `total` lệch với `items` |
| Huỷ token cũ + tạo token mới | Không được có khoảnh khắc tồn tại 2 token hợp lệ |
| `payment.update(SUCCEEDED)` + `enrollment.upsert` | Đứt giữa chừng = khách trả tiền mà không vào học được, **hoặc** học miễn phí |
| Mảng `lesson.update` khi reorder | Nửa vời = thứ tự không đúng cũ cũng không đúng mới |

### Chống trùng lặp

| Cơ chế | Dùng ở |
|---|---|
| `@@unique` ở DB (lưới an toàn cuối) | enrollment, payment |
| Check ở tầng app trước (chỉ để có message đẹp) | `ALREADY_ENROLLED` |
| `upsert` (nguyên tử ở DB) | `lesson_progress`, enrollment trong IPN |
| Kiểm tra trạng thái `PENDING` (idempotency) | webhook IPN |

**Điểm mấu chốt:** check ở tầng app luôn có race condition (TOCTOU). Tính đúng đắn của dữ liệu
phải do DB bảo đảm; tầng app chỉ lo trải nghiệm.

### Luôn có tiêu chí sắp xếp phụ

```ts
orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }]
```

Query có phân trang mà thứ tự không xác định tuyệt đối → sang trang sẽ lặp hoặc nhảy bản ghi.

### `select` khác nhau cho list và detail

`LESSON_LIST_SELECT` không có `content`. Trả 20 bài × vài chục KB markdown cho một màn hình danh sách
là lãng phí băng thông thuần tuý.

---

## 10. Bẫy đã gặp (và sẽ gặp lại)

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| **TS1272** | Build đỏ khi dùng `AuthenticatedUser` trong method có decorator | `import type { AuthenticatedUser }` — bắt buộc do `isolatedModules` + `emitDecoratorMetadata` |
| Query param là **chuỗi** | `?page=2` fail `@IsInt()` | `@Type(() => Number)`; đừng bật `enableImplicitConversion` |
| `@ValidateNested` thiếu `@Type` | Validate **im lặng cho qua** mọi thứ | Luôn đi cặp |
| `@IsString()` cho phép `""` | Chuỗi rỗng lọt qua | Thêm `@IsNotEmpty()` |
| Route tĩnh sau route động | `PATCH /lessons/reorder` khớp vào `:id` | Khai `reorder` / `me` **trước** `:id` |
| Thiếu `ParseUUIDPipe` | UUID sai → Postgres lỗi ép kiểu → **500** thay vì 400 | Gắn `ParseUUIDPipe` cho mọi `@Param` là UUID |
| Nested route không kiểm tra con thuộc cha | Xoá được bài học của khoá khác | `findFirst({ where: { id, courseId } })`, không phải `findUnique({ where: { id } })` |
| `if (minPrice)` với `minPrice = 0` | Bộ lọc "khoá miễn phí" bị bỏ qua | `!== undefined` |
| `%20` vs `+` khi ký HMAC | Luôn báo sai chữ ký (mã 97) | `.replace(/%20/g, '+')`; in `signData` ra so từng ký tự |
| Envelope + HTTP 204 | Client nhận 204 rỗng, mất `message` | Dùng 200 + `data: null` |
| Thiếu `exports` trong module | `Nest can't resolve dependencies of…` | `exports` ở module nguồn **và** `imports` ở module đích |
| Liveness probe đụng DB | DB restart 30s → **CrashLoopBackOff** toàn hệ thống | Liveness không đụng DB; chỉ readiness mới đụng |
| Rate limit sau proxy | Mọi user dùng chung 1 hạn mức | `app.set('trust proxy', 1)` — **đừng** dùng `true` |
| `configService.get('Port')` | Im lặng bỏ qua `.env`, chạy nhờ `?? 8080` | Key trong `.env` là `PORT` |

---

## 11. Nợ kỹ thuật

### Cần sửa (lỗi thật trong code hiện tại)

| Vị trí | Vấn đề |
|---|---|
| `src/auth/auth.controller.ts:50` | `@HttpCode(NO_CONTENT)` ở `reset-password` → envelope bị nuốt. Đổi sang `OK` |
| `src/auth/auth.service.ts:105` | `resetPassword` ném `INVALID_CREDENTIALS`, đúng phải là `INVALID_OR_EXPIRED_TOKEN` |
| `src/users/users.controller.ts:44` | `@HttpCode(NO_CONTENT)` ở `me/password` → cùng lỗi trên |
| `src/users/users.controller.ts:39` | `findAll` thiếu `@ResponseMessage` |
| `src/users/users.controller.ts:45` | `@UseGuards(JwtAuthGuard)` thừa (đã có ở cấp class) |
| `src/users/users.controller.ts:48` | Inline type `{ id: string }` thay vì `AuthenticatedUser` |
| `src/main.ts:25` | `configService.get('Port')` — sai hoa/thường, phải là `'PORT'` |

### Dọn dẹp

- `SORT_ORDERS` / `SortOrder` đang nằm trong `src/courses/dto/query-course.dto.ts` nhưng được
  `lessons`, `enrollments`, `payments` import chéo → chuyển sang `src/common/dto/pagination-query.dto.ts`.
- `ParseUUIDPipe` còn thiếu ở `courses.controller.ts` và `users.controller.ts`.
- `src/payments/dto/update-payment.dto.ts` là file thừa do CLI sinh, chưa dùng.
- `src/app.controller.ts` / `app.service.ts` / `app.controller.spec.ts` vẫn là boilerplate `getHello()`.

### Hoãn có chủ đích

| Việc | Vì sao hoãn |
|---|---|
| **Test tự động** | Chưa có `*.spec.ts` nào thật. Nợ lớn nhất của Phase 0 |
| **Swagger** | Chưa có tài liệu API tự sinh |
| Soft delete cho `courses` | Hiện chặn hẳn khi có học viên (409). Đủ an toàn, chưa đủ tiện |
| Hàng đợi (BullMQ + Redis) cho email | Sẽ tự retry, đồng thời khử timing attack ở `forgot-password` |
| Full-text search | `contains` sinh `ILIKE '%…%'`, không dùng được index. Cần `tsvector` + GIN khi dữ liệu lớn |
| Cursor pagination | `skip` lớn thì chậm và dữ liệu bị trôi. Offset đúng cho quy mô hiện tại |
| Refresh token | Nếu thêm, phải lưu **hash** trong DB, không lưu plaintext |
| Gộp định dạng `message` | Lỗi validate trả mảng, lỗi khác trả chuỗi → thống nhất qua `exceptionFactory` |
| SMS provider thật | `SmsService` đang mock hoàn toàn bằng log |

---

## 12. Kiểm thử thủ công quan trọng nhất

Nếu chỉ chạy được 6 case trước khi sang Phase 1, chạy đúng 6 case này:

| # | Case | Kỳ vọng | Nếu sai thì sao |
|---|---|---|---|
| 1 | IPN với `vnp_SecureHash` bị sửa 1 ký tự | `RspCode: "97"` | Ai cũng tự cấp khoá học có phí bằng 1 câu `curl` |
| 2 | IPN ký đúng nhưng số tiền sai | `RspCode: "04"` | Trả 1.000đ mua khoá 2.000.000đ |
| 3 | Gọi lại đúng URL IPN đã thành công | `RspCode: "02"`, **vẫn chỉ 1 enrollment** | Webhook gửi trùng làm hỏng dữ liệu |
| 4 | `POST /enrollments` với khoá **có phí** | `400 REQUIRES_PAYMENT` | Toàn bộ doanh thu bị bỏ ngỏ |
| 5 | `PATCH /courses/A/lessons/<bài-của-B>` khi là chủ khoá A | `404` | Xoá được nội dung của người khác |
| 6 | `GET /courses/:id/lessons/:id` khi chưa đăng ký | `403` | Nội dung khoá có phí đọc được miễn phí |

---

## 13. Chuẩn bị cho Phase 1 — Docker

Những thứ Phase 0 để lại và Phase 1 sẽ dùng ngay:

| Có sẵn | Dùng làm gì ở Phase 1 |
|---|---|
| `/health/ready` ⏳ | `HEALTHCHECK` trong Dockerfile và `depends_on: condition: service_healthy` |
| `PORT` qua `ConfigService` | `EXPOSE` + biến môi trường của container |
| Mọi secret qua `.env` | Không có gì bị nướng vào image |
| `.env.example` | Nói cho người khác biết cần cấu hình gì |
| `prisma migrate deploy` | Bước khởi động container (khác `migrate dev` của môi trường dev) |

Việc của Phase 1: multi-stage `Dockerfile` (build → runtime gọn), `.dockerignore`,
`docker-compose.yml` gộp app + Postgres, và xử lý `prisma generate` / `migrate deploy`
đúng chỗ trong vòng đời container.
