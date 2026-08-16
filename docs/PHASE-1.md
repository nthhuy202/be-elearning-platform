# Phase 1 — Docker

> Đóng gói ứng dụng thành image, rồi dựng cả app + Postgres bằng `docker compose`.
>
> Mục tiêu cuối: `docker compose up` là chạy được toàn bộ hệ thống, không cần cài Node
> hay Postgres trên máy.

**Shell dùng trong tài liệu này: Git Bash (POSIX).**

---

## Kết quả cuối Phase 1

| File | Vai trò |
|---|---|
| `.dockerignore` | Chặn `node_modules`, `.env`, `dist` lọt vào image |
| `Dockerfile` | Multi-stage: tầng build → tầng runtime gọn |
| `docker-compose.yml` | app + Postgres + volume + healthcheck |
| `prisma/migrations/` | Lịch sử migration để container tự chạy `migrate deploy` |

---

## Bước 1.0 — Chuẩn bị (bắt buộc xong trước khi build)

Bốn việc, không liên quan Docker nhưng Dockerfile phụ thuộc cả bốn.

### ✅ (a) Sửa import `SORT_ORDERS` — ĐÃ XONG

3 file query DTO đã trỏ về `src/common/dto/pagination-query.dto`.

### ✅ (b) Sửa `start:prod` — ĐÃ XONG

```json
"start:prod": "node dist/src/main",
```

Vì `baseUrl: "./"` + import kiểu `'src/common/...'`, output thật là `dist/src/main.js`.
Container chạy đúng lệnh này nên sai đường dẫn là chết ngay.

### ⏳ (c) Tạo migration baseline

Từ trước tới giờ dự án dùng `prisma db push` — tạo được bảng nhưng **không có lịch sử migration**.
Container phải chạy `prisma migrate deploy`, mà lệnh đó cần thư mục `prisma/migrations/`.

```bash
# 1. Sinh SQL từ schema (đã chạy xong, file đã có)
mkdir -p prisma/migrations/0_init
npx prisma migrate diff \
  --from-empty \
  --to-schema prisma/schema.prisma \
  --script \
  --output prisma/migrations/0_init/migration.sql

# 2. Khai báo DB provider
printf 'provider = "postgresql"\n' > prisma/migrations/migration_lock.toml

# 3. Đánh dấu "SQL này đã áp dụng rồi" — KHÔNG chạy lại, KHÔNG mất dữ liệu
npx prisma migrate resolve --applied 0_init

# 4. Kiểm chứng
npx prisma migrate status
```

Bước 4 phải in ra `Database schema is up to date!`.

> ⚠️ **Đừng** chạy `npx prisma migrate dev --name init` ở đây. Prisma sẽ phát hiện drift
> giữa lịch sử migration (rỗng) và DB thật (đã có bảng), rồi đòi **reset toàn bộ database**.
>
> Prisma 7 đã bỏ cờ `--to-schema-datamodel`, dùng `--to-schema`.

**Từ Phase 1 trở đi: mọi thay đổi schema đi qua `npx prisma migrate dev --name <tên>`, không dùng `db push` nữa.**

### ⏳ (d) Chuyển `dotenv` sang `dependencies`

`prisma.config.ts` có dòng `import 'dotenv/config'`. Image runtime cài `npm ci --omit=dev`
→ thiếu `dotenv` → `migrate deploy` crash lúc khởi động container.

```bash
npm install dotenv
```

(nó đang ở `devDependencies`, lệnh này chuyển sang `dependencies` — không tải gì mới)

### Kiểm chứng cả bước 1.0

```bash
npm run build && node dist/src/main
```

App phải chạy được ở port 8080. `Ctrl+C` rồi sang bước tiếp.

---

## Bước 1.1 — `.dockerignore`

**Viết file này TRƯỚC `Dockerfile`.** Nếu không, `COPY . .` sẽ nhét `node_modules`
(hàng trăm MB, biên dịch cho Windows) và `.env` (chứa secret) vào image.

Tạo `.dockerignore` ở thư mục gốc:

```
node_modules
dist
generated
.git
.gitignore
.env
.env.*
!.env.example
*.md
docs
test
coverage
.vscode
Dockerfile
.dockerignore
docker-compose.yml
```

**Vì sao cố ý bỏ `dist` và `generated`:** cả hai sẽ được sinh lại **bên trong** image.
Prisma Client sinh ra phụ thuộc nền tảng — copy bản build trên Windows vào container Linux là hỏng.

### Kiểm chứng

```bash
git check-ignore -v .env      # chỉ để chắc .env cũng không lọt vào git
cat .dockerignore
```

---

## Bước 1.2 — `Dockerfile`

Tạo `Dockerfile` ở thư mục gốc:

```dockerfile
# ---------- Stage 1: build ----------
FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# ---------- Stage 2: runtime ----------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./

USER node
EXPOSE 8080

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
```

### Giải thích từng quyết định

| Dòng | Vì sao |
|---|---|
| `COPY package*.json` **trước** `COPY . .` | Docker cache theo layer. Sửa code mà không đổi dependency → `npm ci` lấy lại từ cache thay vì tải lại |
| 2 stage riêng | Tầng build có `typescript`, `@nestjs/cli`, toàn bộ devDependencies. Tầng runtime không cần → image nhỏ hơn nhiều |
| `npx prisma generate` trong builder | Client sinh ra trên đúng `node:24-alpine`, khớp nền tảng container |
| **Không** copy `generated/` | File trong đó là TypeScript. `nest build` đã biên dịch chúng vào `dist/generated/` rồi |
| `apk add openssl` | CLI của Prisma (`migrate deploy`) cần, alpine không có sẵn |
| `USER node` | Không chạy container bằng root. Image `node` có sẵn user này |
| `migrate deploy && node ...` | Migration chạy trước; fail thì container chết luôn thay vì chạy với schema sai |

> `ponytail:` chạy migration trong `CMD` sẽ đua nhau nếu scale nhiều replica.
> Đủ dùng cho compose 1 container; Phase 3 (K8s) sẽ tách thành `initContainer` hoặc `Job`.

### Kiểm chứng

```bash
docker build -t elearning-api .
docker images elearning-api
```

Ghi lại size. Chưa `docker run` được — container cần `DATABASE_URL` trỏ tới Postgres,
đó là việc của bước 1.3.

---

## Bước 1.3 — `docker-compose.yml`

### Trước khi viết: dừng container Postgres cũ

Từ giờ compose sở hữu Postgres. Container standalone đang chiếm port 5433 sẽ xung đột.

```bash
docker ps                      # tìm tên container Postgres đang chạy
docker stop <tên-container>
```

### File `docker-compose.yml`

```yaml
services:
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: elearning
    ports:
      - '5433:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d elearning']
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build: .
    restart: unless-stopped
    env_file:
      - .env
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/elearning?schema=public
      PORT: 8080
    ports:
      - '8080:8080'
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://localhost:8080/health/ready || exit 1']
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

volumes:
  pgdata:
```

### Giải thích từng quyết định

| Cấu hình | Vì sao |
|---|---|
| `DATABASE_URL` ghi trong `environment`, không trong `.env` | `.env` của bạn trỏ tới `localhost:5433` — đúng khi chạy trên máy, **sai** khi chạy trong container. Trong mạng compose, host là tên service `db`, port là **5432** (port nội bộ, không phải port đã map) |
| `environment` đặt **sau** `env_file` | `environment` ghi đè `env_file`. Các biến khác (`JWT_SECRET`, `VNPAY_*`, `SMTP_*`) vẫn lấy từ `.env` |
| `depends_on: condition: service_healthy` | Không có nó, `api` khởi động trước khi Postgres sẵn sàng → `migrate deploy` fail → container chết |
| `pg_isready` thay vì `depends_on` trơn | `depends_on` mặc định chỉ đợi container **chạy**, không đợi Postgres **nhận kết nối**. Hai chuyện khác nhau |
| `wget` cho healthcheck của api | Alpine có sẵn `wget` (busybox). Cài `curl` là thêm dependency cho việc `wget` làm được |
| Healthcheck dùng `/health/ready` | Endpoint này `SELECT 1` xuống DB — đúng thứ cần biết. `/health` chỉ nói app còn sống |
| `start_period: 20s` | Lần đầu container phải chạy `migrate deploy` xong mới listen. Không có nó, healthcheck fail ngay và bị đánh dấu unhealthy oan |
| Named volume `pgdata` | Không có nó, `docker compose down` là mất sạch dữ liệu |

---

## Bước 1.4 — Chạy và kiểm thử

```bash
docker compose up --build
```

Quan sát log theo thứ tự đúng phải là:

1. `db` khởi động → `database system is ready to accept connections`
2. `db` chuyển sang `healthy`
3. `api` mới bắt đầu → `Applying migration 0_init` (hoặc `No pending migrations`)
4. `api` → `Nest application successfully started`

### Bốn phép thử

```bash
# 1. Liveness
curl http://localhost:8080/health

# 2. Readiness — chứng minh api nói chuyện được với db qua mạng compose
curl http://localhost:8080/health/ready

# 3. Trạng thái healthcheck
docker compose ps

# 4. Dữ liệu sống sót sau khi restart
docker compose down
docker compose up -d
curl http://localhost:8080/health/ready
```

Phép 4 là quan trọng nhất: nếu `pgdata` cấu hình đúng thì dữ liệu còn nguyên sau `down`/`up`.

### Nếu hỏng

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `api` restart liên tục | Đọc log: `docker compose logs api`. Hay gặp nhất là `migrate deploy` fail |
| `Can't reach database server at localhost:5433` | `DATABASE_URL` chưa được ghi đè — trong container `localhost` là chính nó, không phải máy bạn |
| `Cannot find module 'dotenv'` | Bước 1.0 (d) chưa làm |
| `Cannot find module '/app/dist/main.js'` | Bước 1.0 (b) chưa làm — đường dẫn đúng là `dist/src/main` |
| Port 5433 đã bị chiếm | Container Postgres cũ chưa dừng |
| `api` unhealthy nhưng vẫn chạy | `start_period` quá ngắn, hoặc `/health/ready` trả 503 vì DB chưa sẵn sàng |

---

### Dừng container sạch — hai lỗi phải sửa cùng lúc

Triệu chứng: `docker compose down` mất đúng ~10 giây và báo `Error while Stopping`.
Đúng 10 giây là dấu hiệu kinh điển: Docker gửi `SIGTERM`, đợi hết timeout mặc định, rồi `SIGKILL`.

**Lỗi 1 — `sh` là PID 1.** `CMD ["sh", "-c", "... && node dist/src/main"]` để `sh` làm PID 1
và `node` làm tiến trình con. `SIGTERM` tới `sh`, `sh` không chuyển tiếp. Sửa bằng `exec`:

```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/src/main"]
```

`exec` thay thế `sh` bằng `node` luôn, giữ nguyên PID 1.

**Lỗi 2 — Nest không lắng nghe `SIGTERM`.** Mặc định Nest không đăng ký handler nào.
`PrismaService.onModuleDestroy()` bạn đã viết là **code chết** — chưa từng chạy lần nào lúc
container dừng. Thêm vào `src/main.ts`, trước `await app.listen(port)`:

```ts
app.enableShutdownHooks();
```

Dòng này khiến Nest bắt `SIGTERM`/`SIGINT` → `app.close()` → chạy `onModuleDestroy` của mọi
provider → Prisma `$disconnect()` → event loop rỗng → tiến trình thoát.

**Kết quả đo thật:** 10.4s → 0.4s. Thiếu một trong hai thay đổi là vẫn 10 giây.

**Cách đo cho đúng** — phải đợi container `healthy`, vì trong lúc `migrate deploy` chạy thì
PID 1 vẫn là `sh` và mọi phép đo đều ra 10 giây:

```bash
docker compose up -d --build
until [ "$(docker inspect -f '{{.State.Health.Status}}' elearning-platform-api-1)" = healthy ]; do sleep 1; done
time docker compose down
```

> Dừng container *trong lúc* migration vẫn mất 10 giây. Chấp nhận được — nó chỉ xảy ra trong
> vài giây đầu vòng đời, và cắt ngang một migration đang chạy dở là việc Docker *nên* cân nhắc.

---

## Bước 1.5 — Dọn và tối ưu

```bash
docker images elearning-api    # so size với lần build đầu
docker history elearning-api   # xem layer nào nặng nhất
```

Ba việc nên làm nếu image còn to:

1. **Kiểm tra `.dockerignore` có ăn không** — `docker build` in ra dòng
   `transferring context: XX MB` ở đầu. Nếu con số đó vượt vài MB thì `.dockerignore` chưa đúng.
2. **Không cài lại devDependencies ở tầng runtime** — `npm ci --omit=dev` đã lo.
3. **Đo trước khi tối ưu.** Đừng đổi base image sang `distroless` hay `slim` chỉ vì nghe nói nhẹ hơn —
   `alpine` + Prisma đã là tổ hợp đủ nhỏ và ít rắc rối nhất cho dự án này.

---

## Bẫy của Phase 1

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| `localhost` bên trong container | `ECONNREFUSED 127.0.0.1:5433` | Trong compose, host là **tên service** (`db`), port là port **nội bộ** (5432) |
| Copy `node_modules` vào image | Image khổng lồ, `bcrypt` báo lỗi binary | `.dockerignore` phải có `node_modules` |
| Copy `generated/` vào image | Prisma Client sai nền tảng | Chạy `prisma generate` trong tầng build |
| `depends_on` không có `condition` | api chết ngay lần đầu `up` | `condition: service_healthy` + healthcheck của db |
| `.env` lọt vào image | Secret nằm vĩnh viễn trong layer, `docker history` đọc được | `.dockerignore` phải có `.env` |
| Không có named volume | `docker compose down` là mất sạch DB | `volumes: pgdata` |
| `prisma.config.ts` là TypeScript | Nếu CLI trong container không load được config | Fallback: `npm install typescript` (chuyển sang `dependencies`). Chỉ làm khi thật sự gặp lỗi |
| Sửa code nhưng container không đổi | Image cũ được dùng lại | `docker compose up --build` |
| Container mất đúng 10 giây để dừng | `docker compose down` báo `Error while Stopping` | **Hai lỗi độc lập, phải sửa cả hai** — xem mục "Dừng container sạch" bên dưới |
| Đo thời gian dừng ngay sau `up` | Luôn ra ~10s dù đã sửa đúng | Lúc đó `migrate deploy` còn chạy, PID 1 vẫn là `sh`. Phải đợi `healthy` rồi mới đo |

---

## Nợ để lại cho Phase 2 (CI)

| Việc | Ghi chú |
|---|---|
| Chưa có `docker-compose.override.yml` cho dev (hot reload) | Hiện tại sửa code phải build lại image. Vẫn dùng `npm run start:dev` khi code |
| Migration chạy trong `CMD` | Sẽ đua nếu nhiều replica — Phase 3 tách thành Job |
| Chưa có test tự động | Đây vẫn là nợ lớn nhất, kéo dài từ Phase 0. CI ở Phase 2 sẽ không có gì để chạy ngoài `build` + `lint` |
| Chưa gắn `app.set('trust proxy', 1)` | Chưa cần khi chưa có ingress. Bắt buộc từ Phase 4 |
| Image chưa được đẩy lên registry | Phase 2 sẽ đẩy lên `ghcr.io` từ GitHub Actions |
