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
| **2.1** | GitHub Actions: `lint` + `typecheck` + `build` | ✅ |
| **2.2** | Postgres service container trong CI | ✅ |
| **2.3** | Build Docker image trong CI, dùng cache GitHub | ✅ |
| **2.4** | Đẩy image lên `ghcr.io`, tag theo commit SHA | ✅ |
| **2.5** | Bảo vệ `main` + quy ước làm việc nhóm trên GitHub | ✅ |

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

---

## Bước 2.1 — GitHub Actions: lint, typecheck, build

`.github/workflows/ci.yml`, job `check`. Chạy trên mọi PR và mọi push vào `main`.

```yaml
- run: npm ci
- run: npx prisma generate     # bắt buộc, xem bên dưới
- run: npm run lint:ci
- run: npx tsc --noEmit
- run: npm run build
```

### Hai thứ không hiển nhiên

**`npx prisma generate` phải chạy trước mọi thứ khác.** `generated/prisma` nằm trong
`.gitignore` nên trên máy CI nó không tồn tại. Thiếu bước này thì `tsc` và `build` đều
chết ở `Cannot find module 'generated/prisma/enums'` — trong khi ở máy local vẫn xanh,
vì thư mục đó đã được sinh từ lần `prisma generate` nào đó trước kia.

**`npm run lint` không dùng làm cổng chặn được.** Script đó có `--fix`: nó tự sửa rồi
báo thành công, CI sẽ xanh với một repo mà code chưa hề được sửa. Cần một script riêng
không có `--fix`:

```json
"lint:ci": "eslint \"{src,apps,libs,test}/**/*.ts\""
```

Lần chạy đầu tiên của `lint:ci` cho **26 lỗi**, toàn bộ nằm trong `test/` và chưa từng
thấy bao giờ — chính vì `npm run lint` đã âm thầm sửa chúng ở local. Chủ yếu là
`no-unsafe-member-access` trên `response.body.data`: supertest trả `any`.

Xử lý bằng một override cuối `eslint.config.mjs` thay vì rắc `as` khắp test:

```js
{
  files: ['test/**/*.ts'],
  rules: {
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
  },
}
```

Lý do không gán kiểu cho `response.body`: làm vậy là chép lại response DTO của app sang
test. Chép sai thì test vẫn xanh trong khi app trả sai — che mất đúng cái sai lệch mà
test sinh ra để bắt.

### Kèm theo: gỡ `.env.test` khỏi `.gitignore`

File này chứa toàn giá trị giả (`JWT_SECRET=test-secret-only`,
`VNPAY_HASH_SECRET=TESTHASHSECRET`, DB trỏ localhost). Không commit thì bước 2.2
không có gì để chạy.

---

## Bước 2.2 — Postgres service container

Job **riêng** tên `e2e`. Phải là job riêng vì `services:` gắn container vào toàn bộ job,
không gắn được cho một step.

```yaml
services:
  postgres:
    image: postgres:17-alpine
    env:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: elearning_test
    ports:
      - 5433:5432
    options: >-
      --health-cmd "pg_isready -U postgres"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

| Chi tiết | Vì sao |
|---|---|
| `5433:5432` | Trùng với `docker compose` ở local, nên `.env.test` dùng nguyên xi cho cả hai nơi. Không cần biến môi trường riêng cho CI |
| `--health-cmd` | Runner **chờ** container healthy rồi mới chạy step đầu tiên. Không có nó thì test nối vào một Postgres chưa kịp mở cổng, và fail ngẫu nhiên |
| `POSTGRES_DB: elearning_test` | Tạo sẵn database, khỏi phải `psql -c "CREATE DATABASE"` như ở local |

### Bẫy — `prisma.config.ts` nạp `.env`, không phải `.env.test`

Bước migrate phải truyền `DATABASE_URL` tường minh, dù `.env.test` đã có sẵn biến đó:

```yaml
- name: Migrate test database
  run: npx prisma migrate deploy
  env:
    DATABASE_URL: postgresql://postgres:postgres@localhost:5433/elearning_test?schema=public
```

`.env.test` chỉ được `test/setup-e2e.ts` nạp vào lúc Jest khởi động — Prisma CLI chạy ở
tiến trình khác, hoàn toàn không biết file đó tồn tại.

---

## Bước 2.3 — Build Docker image với cache GitHub

Job `docker`, `needs: [check, e2e]` — lint hoặc test đỏ thì khỏi tốn hai phút build.

```yaml
- uses: docker/setup-buildx-action@v3
- uses: docker/build-push-action@v6
  with:
    context: .
    push: false
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

| Dòng | Vì sao |
|---|---|
| `setup-buildx-action` | Driver `docker` mặc định **không** hỗ trợ cache exporter. Thiếu bước này thì `cache-to` bị bỏ qua **im lặng** — không lỗi, không cảnh báo, chỉ là lần nào cũng build lại từ đầu |
| `type=gha` | Cache layer đẩy vào GitHub Actions Cache API. Không cần registry, không cần secret |
| `mode=max` | Mặc định `mode=min` chỉ cache layer có mặt trong image cuối. Image cuối là stage `runner`, **không** chứa `npm ci` + `npm run build` của stage `builder` — tức là cache đúng phần đắt nhất bị bỏ qua |

Chỗ này cũng là lúc thấy được vì sao `Dockerfile` copy `package*.json` **trước** `COPY . .`:
commit không đụng dependency thì `npm ci` hiện `CACHED`. Đảo hai dòng đó là mọi commit đều
cài lại toàn bộ node_modules.

### Kèm theo: siết workflow

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
```

`concurrency` huỷ run cũ khi push đè lên cùng một PR — mỗi run tốn 3 job, trong đó `e2e`
dựng cả container Postgres. `permissions` hạ `GITHUB_TOKEN` từ quyền-ghi-mặc-định về
chỉ-đọc; job nào cần hơn thì tự khai ở cấp job (2.4).

---

## Bước 2.4 — Push image lên `ghcr.io`

```yaml
docker:
  permissions:
    contents: read
    packages: write          # nới cho riêng job này

  steps:
    - name: Log in to ghcr.io
      if: github.event_name == 'push'
      uses: docker/login-action@v3
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}

    - uses: docker/build-push-action@v6
      with:
        push: ${{ github.event_name == 'push' }}
        tags: |
          ghcr.io/${{ github.repository }}:${{ github.sha }}
          ghcr.io/${{ github.repository }}:latest
```

**PR build nhưng không push.** Vẫn bắt được lỗi Dockerfile trước khi vào `main`, vẫn nạp
cache, nhưng không đẻ image rác trong registry. PR từ fork cũng không được cấp
`packages: write` nên đăng nhập sẽ fail — do đó bước login có `if`.

**Không cần tạo secret nào.** `GITHUB_TOKEN` do Actions tự cấp mỗi run và hết hạn khi run
kết thúc. Dùng PAT ở đây là tự tạo ra một secret sống mãi không cần thiết.

### Ba điều dễ hoang mang lần đầu

- **Package mặc định private** dù repo public. Không sửa thì Phase 3 phải tạo
  `imagePullSecret` chỉ vì chuyện này. Sửa ở `profile → Packages → Package settings → Change visibility`.
- **Xuất hiện dòng `unknown/unknown`** trong danh sách platform — đó là manifest
  attestation buildx sinh mặc định, không phải lỗi. Thêm `provenance: false` nếu muốn sạch.
- **`ghcr.io` bắt buộc chữ thường.** `${{ github.repository }}` trả nguyên văn tên repo;
  repo có chữ hoa sẽ fail `invalid reference format`, lúc đó mới cần `docker/metadata-action`.

**`latest` chỉ để `docker pull` thử cho nhanh.** Nó trỏ chỗ khác sau mỗi lần merge —
deploy bằng `latest` là rollback mà không biết đang về đâu. Từ Phase 3, manifest K8s luôn
ghi SHA. Đó là lý do bước này tồn tại.

### Kiểm chứng

```bash
docker pull ghcr.io/nthhuy202/be-elearning-platform:$(git rev-parse HEAD)
```

Kết quả: 804MB trên đĩa / 175MB nén. Xem mục nợ kỹ thuật.

---

## Bước 2.5 — Bảo vệ `main` và quy ước làm việc nhóm

### Điều kiện: repo phải public

Trên gói Free, **ruleset/branch protection và secret scanning chỉ có với repo public**.
Repo private cần Team trở lên. Dấu hiệu nhận biết: trang `Settings → Advanced Security`
không có mục Secret scanning, chỉ có Dependency graph và Dependabot.

Project này chuyển sang public — không có gì để lộ (`.env` chưa từng được commit,
`.env.test` toàn giá trị giả) và public còn được Actions minutes không giới hạn.

### Ruleset `protect-main`

`Settings → Rules → Rulesets → New branch ruleset`, target `Include default branch`,
enforcement **Active**, **bypass list để trống**.

- ☑ Restrict deletions · Block force pushes · Require linear history
- ☑ Require a pull request before merging
  - Required approvals: **0**
  - ☑ Dismiss stale approvals · Require review from Code Owners · Require conversation resolution
- ☑ Require status checks to pass
  - ☑ Require branches to be up to date before merging
  - Checks: `check`, `e2e`, `docker`

| Bẫy | Thực tế |
|---|---|
| Chọn check tên `CI` | Sai. `CI` là tên **workflow**; phải chọn tên **job**. Chọn nhầm thì PR treo vĩnh viễn ở "Expected" vì chờ một check không tồn tại |
| Check chưa hiện trong ô search | Check phải chạy ít nhất một lần mới xuất hiện. Làm ruleset **sau** khi 2.3/2.4 đã chạy |
| Required approvals = 1 khi làm một mình | Tự khoá cửa nhốt mình bên ngoài — không ai tự approve PR của mình được. Để 0, đổi lên 1 khi có người thứ hai |
| Tên mình trong bypass list | Mọi luật ở trên trở thành gợi ý, và sẽ push thẳng vào `main` lúc 11h đêm mà không biết mình đang bypass |

Kiểm chứng bằng cách thử phá — chưa thử thì chưa biết khoá có khoá thật không:

```bash
git checkout main && echo "# test" >> README.md && git commit -am "test" && git push
# mong đợi: GH013: Repository rule violations found
git reset --hard origin/main
```

### Merge settings

`Settings → General → Pull Requests`: chỉ bật **squash merge** (bỏ merge commit và
rebase), default commit message = `Pull request title and description`, bật
**Allow auto-merge** và **Automatically delete head branches**.

`Allow auto-merge` là thứ trả lời đúng câu "CI xanh mới được merge": mở PR → bấm
*Enable auto-merge* → CI xanh đủ 3 job thì GitHub tự merge, tự xoá nhánh. Xoá nhánh tự
động cũng chặn luôn lỗi từng gặp: push tiếp vào một nhánh đã merge.

Squash + linear history: `main` thành một dòng thẳng, mỗi commit là một PR trọn vẹn,
`git revert` một tính năng là một lệnh.

### Các file quy ước

| File | Vai trò |
|---|---|
| `.github/CODEOWNERS` | Ghi "ai chịu trách nhiệm cái gì" bằng code thay vì bằng trí nhớ. Đụng `prisma/`, `src/payments/`, `src/auth/` là tự kéo đúng người vào PR |
| `.github/pull_request_template.md` | Checklist chỉ giữ những dòng mà quên là **đau thật** (migration, DTO, secret, e2e). Dài quá thì người ta tick hết mà không đọc |
| `.github/dependabot.yml` | npm + **github-actions**, weekly, gom minor/patch vào 1 PR |

Phần `github-actions` quan trọng ngang phần npm: `actions/checkout@v4` cũng có lỗ hổng, và
nó chạy với quyền ghi vào repo. PR của Dependabot cũng phải qua đủ 3 job CI — bot không có
đặc quyền.

### Advanced Security

Bật theo thứ tự (mục dưới bị khoá nếu chưa bật mục trên): Dependency graph → Dependabot
alerts → Dependabot security updates → Grouped security updates → **Secret scanning** →
**Push protection**.

Push protection là cái đáng giá nhất: nó chặn ngay lúc `git push`. Secret scanning thường
chỉ báo *sau khi* secret đã lên GitHub — và lúc đó xoá commit **không đủ**, phải đi xoay key.

---

## Nợ kỹ thuật ghi nhận ở Phase 2

| Món | Chi tiết |
|---|---|
| Image 804MB | Thủ phạm gần như chắc chắn là `@prisma/engines` trong `npm ci --omit=dev` ở stage runner. Chỉ tối ưu nếu Phase 3 thấy pull image chậm |
| Không e2e test được rate limiting | Đánh đổi của `skipIf` (bẫy #5). Hành vi đã kiểm thử tay ở Phase 0 §12 |
| `provenance` chưa tắt | Package hiện dòng `unknown/unknown`. Vô hại |
| Migration vẫn nằm trong `CMD` của Dockerfile | Tách thành K8s Job ở Phase 3 |
