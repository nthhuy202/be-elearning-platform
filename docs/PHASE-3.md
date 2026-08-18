# Phase 3 — Kubernetes

> Docker trả lời "chạy được ở đâu cũng giống nhau". Kubernetes trả lời "ai giữ cho nó
> tiếp tục chạy khi có thứ hỏng".
>
> **Shell: Git Bash (POSIX).**

---

## Lộ trình

| Bước | Nội dung | Trạng thái |
|---|---|---|
| **3.0** | Dựng cluster local bằng kind, khai sẵn cổng cho Ingress | ✅ |
| **3.1** | Postgres: StatefulSet + PVC + headless Service | ✅ |
| **3.2** | API: Deployment + Service + ConfigMap + Secret + probes | ✅ |
| **3.3** | Tách migration ra Job riêng, bỏ khỏi `CMD` của image | ✅ |
| **3.4** | Ingress phơi API ra `http://localhost`, `trust proxy` | ✅ |
| **3.5** | `resources` requests/limits + rolling update không downtime | ✅ |

Kết quả cuối phase: `curl http://localhost/health/ready` → `{"status":"ok","database":"up"}`,
2 pod API chạy song song, thay pod không rớt một request nào.

---

## Bước 3.0 — Cluster local bằng kind

### Vì sao kind, không phải Kubernetes của Docker Desktop

| | kind | Docker Desktop K8s |
|---|---|---|
| Cấu hình cluster | Một file YAML **commit được vào repo** | Bấm trong Settings, không tái lập được |
| Làm hỏng thì sao | `kind delete cluster` rồi dựng lại, ~20 giây | Reset cả Docker Desktop |
| Nhiều cluster song song | Có | Không |

Thứ quan trọng nhất là dòng đầu: cluster trở thành **code**. Người khác clone repo về chạy
một lệnh là có cluster giống hệt.

kind = "**K**ubernetes **in** **D**ocker": mỗi node của cluster là một container Docker.
`docker ps` sẽ thấy `elearning-control-plane`.

### Cài đặt

```bash
mkdir -p ~/bin
curl -Lo ~/bin/kind.exe https://github.com/kubernetes-sigs/kind/releases/latest/download/kind-windows-amd64
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
kind version
```

`releases/latest/download/` tự redirect nên không phải tra số version.

### `k8s/kind-cluster.yaml`

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: elearning

nodes:
  - role: control-plane

    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"

    extraPortMappings:
      - containerPort: 80
        hostPort: 80
        protocol: TCP
```

**Hai khối này bắt buộc phải có ngay từ lúc tạo cluster.** Cả hai đều **không sửa được về
sau** — muốn thêm thì phải xoá cluster dựng lại. Khai sẵn ở 3.0 để bước 3.4 khỏi làm lại
từ đầu:

- `node-labels: ingress-ready=true` — manifest ingress-nginx bản dành cho kind có
  `nodeSelector` đòi đúng nhãn này. Thiếu nhãn thì pod controller mắc kẹt `Pending` mãi
  với lý do `0/1 nodes are available: node(s) didn't match Pod's node affinity`.
- `extraPortMappings` — node là container, cổng 80 của nó không tự thông ra máy thật.
  Thiếu phần này thì Ingress dựng xong, `kubectl get ingress` vẫn đẹp, nhưng trình duyệt
  không vào được.

### Dựng

```bash
kind create cluster --config k8s/kind-cluster.yaml
kubectl cluster-info --context kind-elearning
kubectl get nodes
```

### Namespace riêng

```bash
kubectl create namespace elearning
kubectl config set-context --current --namespace=elearning
```

Đặt namespace mặc định để khỏi gõ `-n elearning` ở mọi lệnh. Kiểm tra:

```bash
kubectl config view --minify -o jsonpath='{..namespace}'
```

---

## Bước 3.1 — Postgres: StatefulSet, không phải Deployment

### Deployment vs StatefulSet

| | Deployment | StatefulSet |
|---|---|---|
| Tên pod | Ngẫu nhiên: `api-568495bd9c-g8cff` | Có thứ tự: `postgres-0`, `postgres-1` |
| Storage | Mọi replica dùng chung volume đã khai | **Mỗi replica một PVC riêng**, sinh tự động |
| Thay pod | Tên mới, PVC cũ có thể mất | `postgres-0` chết, pod mới **vẫn tên `postgres-0`**, mount lại đúng PVC cũ |

Database cần cái cột phải: danh tính ổn định và ổ đĩa dính liền danh tính đó. Dùng
Deployment cho Postgres là kiểu sai kinh điển của người mới — nó chạy được, cho tới lần
pod bị thay đầu tiên.

### `volumeClaimTemplates`

```yaml
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        resources:
          requests:
            storage: 2Gi
```

Đây là **template**, không phải một PVC. StatefulSet sinh ra PVC thật tên
`<template>-<statefulset>-<ordinal>` = `data-postgres-0`.

**PVC KHÔNG bị xoá khi xoá StatefulSet.** Đây là hành vi cố ý của Kubernetes: nó thà để
lại rác còn hơn xoá nhầm database. Hệ quả thực tế:

```bash
kubectl delete -f k8s/postgres.yaml   # StatefulSet biến mất
kubectl get pvc                       # data-postgres-0 vẫn còn
kubectl apply -f k8s/postgres.yaml    # dựng lại -> dữ liệu cũ nguyên vẹn
```

Muốn xoá sạch thật thì phải `kubectl delete pvc data-postgres-0` một cách tường minh.

### Headless Service

```yaml
spec:
  clusterIP: None
```

Service thường có một IP ảo và load-balance sang các pod phía sau. Với 1 replica Postgres
thì tầng ảo đó chỉ thêm một chặng vô ích. `clusterIP: None` khiến DNS trả thẳng IP pod.
Sau này lên nhiều replica (primary/replica), headless còn cho phép gọi đích danh từng pod
qua `postgres-0.postgres`.

### `PGDATA`

```yaml
          env:
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
```

`initdb` của Postgres từ chối chạy nếu thư mục data không rỗng. Trên block storage thật,
volume mới mount vào luôn có sẵn `lost+found` → init fail. Đẩy data xuống thư mục con là
hết chuyện. Trên kind (local-path provisioner) thì không gặp, nhưng đây là thói quen phải
có từ đầu.

### Hai probe khác nhau

```yaml
          readinessProbe:
            exec:
              command: ['pg_isready', '-U', 'postgres', '-d', 'elearning']
          livenessProbe:
            exec:
              command: ['pg_isready', '-U', 'postgres']
```

Readiness kiểm tra tới cấp database cụ thể (sẵn sàng nhận query chưa). Liveness chỉ hỏi
tiến trình còn sống không — nới lỏng hơn, vì **liveness fail nghĩa là giết container**, và
giết một database vì nó đang bận là cách tự tạo ra sự cố.

---

## Bước 3.2 — API: Deployment, Service, ConfigMap, Secret

### Chia đôi cấu hình

| | ConfigMap `api` | Secret `api` |
|---|---|---|
| Chứa | `NODE_ENV`, `PORT`, `JWT_EXPIRES_IN`, `VNPAY_TMN_CODE`, các URL | `DATABASE_URL`, `JWT_SECRET`, `VNPAY_HASH_SECRET` |
| Đọc bằng | `envFrom.configMapRef` | `envFrom.secretRef` |

`envFrom` nạp **toàn bộ** key thành biến môi trường, khỏi liệt kê từng cái bằng `env`.

**Secret của Kubernetes chỉ là base64, KHÔNG mã hoá.** Ai `kubectl get secret -o yaml`
được là đọc được. Ở đây chấp nhận vì toàn giá trị dev giả. Phase 5 sẽ chuyển sang Sealed
Secrets — mã hoá bằng public key, chỉ controller trong cluster giải được, an toàn để commit.

### Bẫy: value trong ConfigMap phải là chuỗi

```yaml
  PORT: '8080'     # đúng
  PORT: 8080       # sai
```

Không có nháy thì YAML hiểu là số, và API server từ chối:
`cannot unmarshal number into Go struct field ConfigMap.data of type string`.

### Ba probe, ba câu hỏi khác nhau

| Probe | Câu hỏi | Endpoint | Fail thì sao |
|---|---|---|---|
| `startupProbe` | Boot xong chưa? | `/health` | Đợi tiếp, **tạm khoá hai probe kia** |
| `livenessProbe` | Còn sống không? | `/health` | **Giết container**, restart |
| `readinessProbe` | Nhận request được chưa? | `/health/ready` | Gỡ khỏi Service, **không giết** |

**Nguyên tắc quan trọng nhất: liveness KHÔNG được đụng database.**

`/health/ready` chạy `SELECT 1`, `/health` thì không. Nếu để liveness trỏ vào endpoint có
query DB thì database chớp một cái → mọi pod đồng loạt fail liveness → toàn bộ bị giết
cùng lúc → `CrashLoopBackOff` cả cụm. Một sự cố nhỏ ở DB biến thành sập toàn hệ thống, do
chính probe gây ra.

Readiness thì ngược lại: DB chết, pod bị gỡ khỏi Service (không nhận request nữa) nhưng
vẫn sống. DB hồi thì pod tự quay lại. Đúng hành vi mong muốn.

`startupProbe` tồn tại để tách "boot chậm" khỏi "chết". Không có nó thì phải nới
`initialDelaySeconds` của liveness cho vừa lúc boot chậm nhất — và mất luôn khả năng phát
hiện chết nhanh lúc đang chạy bình thường.

### Nạp image vào kind

kind không thấy được registry local của Docker. Phải nạp tường minh:

```bash
docker build -t elearning-api:3.4 .
kind load docker-image elearning-api:3.4 --name elearning
```

Kiểm chứng image đã nằm trong node:

```bash
docker exec -it elearning-control-plane crictl images | grep elearning-api
```

Đi kèm `imagePullPolicy: IfNotPresent` — để mặc định, tag không phải `:latest` thì K8s cũng
không kéo lại, nhưng khai rõ vẫn hơn.

---

## Bước 3.3 — Migration là Job, không phải `CMD`

### Vấn đề của cách cũ

Trước bước này, `Dockerfile` kết thúc bằng:

```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/src/main"]
```

Nghĩa là **mỗi container khi khởi động đều chạy migration**. Chạy được với 1 replica, và
hỏng ngay khi có 2:

| Triệu chứng | Nguyên nhân |
|---|---|
| Phải để `replicas: 1` | Nhiều pod cùng `migrate deploy` một lúc → tranh nhau advisory lock, có pod fail |
| `startupProbe.failureThreshold: 40` (2 phút) | Container phải migrate xong mới listen được |
| Rollback nguy hiểm | Deploy lại bản cũ = image cũ, nhưng schema đã đổi |
| Không biết migration hỏng ở đâu | Log migration lẫn vào log app |

Hai dòng đầu là **nợ cố ý** ở 3.2, ghi rõ trong comment, và 3.3 là lúc trả.

### Cách mới

`Dockerfile`:

```dockerfile
CMD ["node", "dist/src/main"]
```

`k8s/migrate-job.yaml`:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: migrate
spec:
  backoffLimit: 3
  ttlSecondsAfterFinished: 600
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: elearning-api:3.4
          imagePullPolicy: IfNotPresent
          command: ['npx', 'prisma', 'migrate', 'deploy']
          envFrom:
            - secretRef:
                name: api
```

| Trường | Vì sao |
|---|---|
| `backoffLimit: 3` | Migration fail thường là fail thật (SQL sai). Thử lại 10 lần vô nghĩa |
| `ttlSecondsAfterFinished: 600` | Job xong tự dọn sau 10 phút, khỏi tích tụ pod `Completed` |
| `restartPolicy: Never` | Pod hỏng thì tạo pod **mới**, không restart pod cũ → giữ được log lần hỏng |
| Cùng image với app | Migration nằm trong `prisma/migrations` của chính commit đó |

Job dùng **cùng Secret `api`** — nó chỉ cần `DATABASE_URL`, nhưng dùng chung để không bao
giờ có chuyện Job và app trỏ về hai database khác nhau.

### Thứ tự deploy

```bash
kubectl delete job migrate --ignore-not-found
kubectl apply -f k8s/migrate-job.yaml
kubectl wait --for=condition=complete job/migrate --timeout=120s
kubectl apply -f k8s/api.yaml
kubectl rollout status deploy/api
```

**`spec` của Job là bất biến.** `kubectl apply` đè lên một Job đã tồn tại sẽ fail với
`field is immutable`. Bắt buộc `delete` trước — đó là lý do dòng đầu tiên tồn tại, và
`--ignore-not-found` để lệnh vẫn chạy được ở lần đầu.

`migrate deploy` **idempotent**: nó đọc bảng `_prisma_migrations`, migration nào đã chạy
thì bỏ qua. Chạy lại nhiều lần vô hại.

### Hệ quả phải nhớ: migration phải tương thích ngược

Migration chạy **trước** khi pod code mới lên. Nghĩa là có một khoảng thời gian **code cũ
chạy trên schema mới**. Vì vậy:

- ❌ Đổi tên cột trong một bước → code cũ query cột cũ → lỗi ngay
- ✅ Thêm cột mới (nullable) → deploy code dùng cột mới → backfill → bước sau mới xoá cột cũ

Luật: **thêm thì được, đổi/xoá phải tách thành nhiều lần deploy.**

### Trả nợ

Sau khi migration ra khỏi container:

```yaml
  replicas: 2                     # từ 1
            failureThreshold: 10  # từ 40
```

---

## Bước 3.4 — Ingress

### Service vs Ingress

| | Service | Ingress |
|---|---|---|
| Tầng | L4 (TCP) | L7 (HTTP) |
| Định tuyến theo | Không — chỉ tới một Service | Hostname, path |
| Từ ngoài cluster | Cần NodePort/LoadBalancer, mỗi service một cổng | Một cổng 80/443 cho tất cả |
| TLS | Không | Có, tập trung một chỗ |

Ingress chỉ là **cấu hình**. Nó không tự làm gì nếu trong cluster không có một *ingress
controller* đọc nó và dựng cấu hình proxy thật. Đây là chỗ người mới hay mắc: apply
Ingress, `kubectl get ingress` thấy có, nhưng `ADDRESS` trống mãi vì chưa cài controller.

### Cài ingress-nginx

```bash
curl -fL -o k8s/ingress-nginx.yaml \
  https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl apply -f k8s/ingress-nginx.yaml

kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s
```

**Lưu file về repo thay vì `apply -f <url>` thẳng.** Hai lý do: dựng lại cluster lần sau ra
đúng phiên bản đó (nhánh `main` của ingress-nginx trôi liên tục), và không phụ thuộc
GitHub sống hay chết — sự cố GitHub ngày 17/08 trả `429 Too Many Requests` cho
`raw.githubusercontent.com` và chặn đúng bước này mất nửa ngày.

Bản `provider/kind` khác bản mặc định ở chỗ nó dùng `hostPort` + `nodeSelector:
ingress-ready=true` thay vì Service `LoadBalancer` — khớp với cluster đã khai ở 3.0.

### `k8s/ingress.yaml`

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 8080
```

Không khai `host:` → khớp mọi hostname, gõ `localhost` là vào. Khi cần nhiều hostname,
dùng `*.localtest.me` (domain công cộng trỏ sẵn về `127.0.0.1`, khỏi sửa file `hosts`).

Đường đi đầy đủ của một request:

```
trình duyệt :80
  -> hostPort của container elearning-control-plane   (extraPortMappings, 3.0)
  -> pod ingress-nginx-controller
  -> Service api:8080
  -> pod api, cổng tên http (8080)
```

### `trust proxy` — phần dễ quên nhất

Sau khi có Ingress, **IP nguồn của mọi request đều là IP của pod ingress-nginx.** Không
phải IP người dùng.

Hậu quả trực tiếp: `ThrottlerGuard` (`@nestjs/throttler`) chia hạn mức theo IP → toàn bộ
người dùng bị gom vào **chung một rổ**. Một người spam login là cả thế giới bị chặn. Rate
limiting biến thành lỗ hổng từ chối dịch vụ do chính mình tạo ra.

`src/app.setup.ts`:

```ts
import type { Express } from 'express';

export function configureApp(app: INestApplication) {
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
  ...
}
```

`1` = tin đúng **một** hop (ingress). Express lấy IP thật từ header `X-Forwarded-For` do
ingress ghi vào.

**Không được dùng `true`.** `true` nghĩa là tin toàn bộ chuỗi `X-Forwarded-For` — mà header
đó client tự gửi được. Kẻ tấn công chỉ cần đổi header mỗi request là thoát rate limit hoàn
toàn. Con số phải khớp đúng số proxy thật đứng trước app.

**Về kiểu dữ liệu:** phải `as Express` chứ không phải `getInstance<Express>()`. Interface
`HttpServer` của Nest khai `getInstance(): ServerInstance` — **không có type parameter**,
và `getHttpAdapter(): HttpServer` gọi không truyền type argument nên `ServerInstance` rơi
về `any`. Viết `getInstance<Express>()` sẽ dính cả lỗi TS *"Expected 0 type arguments"* lẫn
lỗi lint `no-unsafe-call`.

### Kiểm chứng

```bash
kubectl get ingress          # ADDRESS phải là localhost
curl http://localhost/health
curl http://localhost/health/ready
```

---

## Bước 3.5 — Resources và rolling update không downtime

### Vì sao `resources` là bắt buộc

Không khai `resources` thì:

- **Scheduler mù.** Nó xếp pod dựa trên tổng `requests` đang có. Pod không khai request
  được tính bằng 0 — "miễn phí". Node nhận pod cho tới khi RAM thật cạn, rồi OOM-killer
  của kernel bắn bừa một tiến trình.
- **QoS thấp nhất.** Pod không có request/limit thuộc class `BestEffort` — **nhóm đầu
  tiên bị giết** khi node thiếu RAM.

Ba class QoS:

| Class | Điều kiện | Thứ tự bị giết khi thiếu RAM |
|---|---|---|
| `Guaranteed` | request == limit ở **cả** cpu và memory | Cuối cùng |
| `Burstable` | Có request, khác limit | Giữa |
| `BestEffort` | Không khai gì | **Đầu tiên** |

```bash
kubectl get pods -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass
```

### Cấu hình đã chọn

```yaml
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              memory: 512Mi
```

**Cố ý không đặt `limits.cpu`.** Đây là quyết định quan trọng nhất của bước này:

| | Memory | CPU |
|---|---|---|
| Loại tài nguyên | Incompressible | **Compressible** |
| Chạm limit thì | `OOMKilled` ngay | Bị **throttle** — chậm dần |
| Triệu chứng | Rõ ràng, đọc `kubectl describe` là thấy | Mơ hồ: p99 xấu, probe timeout ngẫu nhiên, restart không rõ lý do |

Memory có limit là tốt: vượt thì chết ngay, lỗi hiện rõ. CPU có limit là bẫy: container bị
CFS throttle, chậm lại một cách khó hiểu, và tốn hàng giờ để lần ra. Cứ để nó mượn CPU
rảnh của node — `requests` đã đủ bảo đảm phần tối thiểu khi node đông.

### Ba thứ làm nên "không downtime"

Cả ba phải có đủ. Thiếu một là rớt request.

**1. `strategy`**

```yaml
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

`maxUnavailable: 0` = không bao giờ tụt dưới số replica sẵn sàng. `maxSurge: 1` = được
dựng tạm pod thứ 3 trong lúc thay.

Mặc định là `25%` cho cả hai. Với `replicas: 2` thì `maxUnavailable` làm tròn **xuống** =
0, `maxSurge` làm tròn **lên** = 1 — tình cờ đã đúng. Nhưng nó phụ thuộc vào số replica:
lên 4 replica thì `25%` thành `maxUnavailable: 1`, và im lặng cho phép rớt. Khai số tuyệt
đối để hành vi không đổi theo quy mô.

**2. `readinessProbe`** — lo **pod mới**. Pod chưa sẵn sàng thì chưa được đưa vào
Endpoints, nên chưa nhận request nào. Đã có từ 3.2.

**3. `preStop`** — lo **pod cũ**.

```yaml
          lifecycle:
            preStop:
              exec:
                command: ['sleep', '5']
```

Lúc xoá pod, Kubernetes làm **song song** hai việc:

```
(a) endpoint controller gỡ pod khỏi Endpoints -> ingress-nginx nạp lại cấu hình
(b) kubelet gửi SIGTERM cho container
```

Không ai đợi ai. Nếu (b) xong trước khi (a) lan tới ingress, ingress vẫn đẩy request vào
một pod đã đóng listener → **502**. `preStop` chạy trước SIGTERM, nên `sleep 5` mua đủ thời
gian cho (a) hoàn tất.

Đây là lý do rolling update *trông có vẻ* không downtime ở môi trường ít traffic nhưng rớt
request ở production — lỗi chỉ hiện ra khi đủ tải để rơi trúng cửa sổ vài trăm ms đó.

Phía app còn cần `app.enableShutdownHooks()` để Nest bắt SIGTERM và đóng kết nối gọn gàng
— đã có sẵn từ Phase 0.

### Cách kiểm chứng

**Tab 1** — bắn liên tục qua Ingress:

```bash
while true; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost/health)
  [ "$code" = "200" ] && printf '.' || printf "\n[%s] %s\n" "$(date +%T)" "$code"
  sleep 0.2
done
```

**Tab 2** — ép thay toàn bộ pod:

```bash
kubectl rollout restart deploy/api
kubectl rollout status deploy/api
```

Kỳ vọng: tab 1 **chỉ toàn dấu chấm**, không một dòng lỗi, suốt quá trình thay pod.

Muốn thấy tận mắt `preStop` đang che gì: bỏ khối `lifecycle` ra, apply lại, chạy lại thí
nghiệm.

---

## Bảng lệnh hay dùng

```bash
# Dựng lại toàn bộ từ số 0
kind create cluster --config k8s/kind-cluster.yaml
kubectl create namespace elearning
kubectl config set-context --current --namespace=elearning
kubectl apply -f k8s/ingress-nginx.yaml
kubectl apply -f k8s/postgres.yaml
docker build -t elearning-api:3.4 . && kind load docker-image elearning-api:3.4 --name elearning
kubectl delete job migrate --ignore-not-found
kubectl apply -f k8s/migrate-job.yaml
kubectl wait --for=condition=complete job/migrate --timeout=120s
kubectl apply -f k8s/api.yaml -f k8s/ingress.yaml
kubectl rollout status deploy/api

# Chẩn đoán
kubectl get pods -o wide
kubectl describe pod <tên>              # phần Events ở cuối là chỗ đáng đọc nhất
kubectl logs deploy/api --tail=50
kubectl logs job/migrate
kubectl get endpoints api               # rỗng = readiness đang fail
kubectl get pods -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass
kubectl diff -f k8s/api.yaml            # so file với thứ đang chạy, không apply

# Xem DB trong cluster từ máy thật (5434 để khỏi đụng docker-compose ở 5433)
kubectl port-forward svc/postgres 5434:5432

# Xoá sạch
kind delete cluster --name elearning
```

---

## Bẫy đã gặp trong phase này

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `kind create cluster` báo `npipe:////./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified` | Docker Desktop chưa chạy. `docker info` cho `ServerVersion` rỗng, `NCPU: 0` | Bật Docker Desktop |
| Pod ingress-nginx `Pending` mãi | Node thiếu nhãn `ingress-ready=true` | Phải khai lúc tạo cluster, không sửa được sau |
| `kubectl get ingress` có nhưng `ADDRESS` trống | Chưa cài controller, hoặc thiếu `extraPortMappings` | Xem 3.4 |
| `kubectl apply` Job báo `field is immutable` | `spec` của Job bất biến | `kubectl delete job migrate --ignore-not-found` trước |
| ConfigMap báo `cannot unmarshal number into ... type string` | `PORT: 8080` thiếu nháy | `PORT: '8080'` |
| `apply -f <url>` báo `429 Too Many Requests` | Sự cố GitHub, không phải lỗi cấu hình | Tải file về repo, apply từ file |
| `npm run test:e2e` fail 23/24 sau khi sang Phase 3 | Container `db` của docker-compose đã dừng. Postgres trong kind **không** thay thế nó | `docker compose up -d db` |
| Merge nhánh chồng nhánh conflict `both added` | PR merge kiểu **squash** → hash local khác main hoàn toàn | `git rebase --onto origin/main <nhánh-dưới>` |
| `getInstance<Express>()` báo `no-unsafe-call` | `HttpServer.getInstance()` không có type parameter | `getInstance() as Express` |

### Hai Postgres song song — nhớ kỹ

Từ Phase 3 trở đi luôn có **hai** database chạy cùng lúc, phục vụ hai mục đích khác nhau:

| | Chạy ở đâu | Ai dùng | Truy cập từ máy |
|---|---|---|---|
| `docker compose db` | Docker thường | `npm run test:e2e`, `npm run start:dev` | `localhost:5433` |
| `postgres-0` | kind cluster | pod `api` trong cluster | không expose, phải `port-forward` |

Chúng độc lập hoàn toàn và **không thay thế nhau**.

---

## Nợ kỹ thuật ghi nhận ở Phase 3

| Nợ | Vì sao chấp nhận bây giờ | Trả ở đâu |
|---|---|---|
| `image: elearning-api:3.4` chỉ tồn tại trên máy local, lặp ở **2 file** | Image ghcr tương ứng chưa tồn tại: chính commit này sửa `Dockerfile` nên phải merge xong CI mới build ra được. Vòng lặp gà-trứng | **Phase 4** — `values.yaml` của Helm giữ tag ở đúng một chỗ; **Phase 5** — CI/CD tự cập nhật |
| Secret là plaintext trong git | Toàn giá trị dev giả, cluster local | **Phase 5** — Sealed Secrets |
| Không có `NetworkPolicy` | Mọi pod gọi được Postgres | Phase 7 nếu có |
| Không có `PodDisruptionBudget` | Cluster 1 node, không có drain | Phase 7 nếu có |
| Postgres 1 replica, không backup | Môi trường học | Ngoài phạm vi |
| Image vẫn ~800MB | Nghi `@prisma/engines` lọt vào stage `runner` | Chưa xếp lịch |
| `resources` đặt bằng cảm tính, chưa đo | Chưa có metrics | **Phase 6** — Prometheus rồi chỉnh lại theo số thật |
| Không có HPA | Chưa có metrics-server | Phase 7 |

---

## Đã học được gì

Ba ý đáng nhớ nhất, xếp theo mức độ hay bị làm sai:

1. **Liveness không được đụng database.** Probe sai biến sự cố nhỏ ở tầng dữ liệu thành
   sập toàn cụm — và thủ phạm chính là thứ đáng lẽ để bảo vệ.
2. **Migration không thuộc về container app.** Tách ra Job mới cho phép nhiều replica,
   rollback an toàn, và log đọc được. Đổi lại, migration phải tương thích ngược.
3. **"Không downtime" cần đủ ba thứ**: `maxUnavailable: 0`, `readinessProbe` (pod mới),
   `preStop` (pod cũ). Thiếu cái thứ ba là lỗi chỉ hiện ra khi có tải thật.

Và một ý về quy trình: mỗi bước cố tình để lại nợ, bước sau trả. `replicas: 1` và
`failureThreshold: 40` ở 3.2 không phải cẩu thả — chúng là hệ quả bắt buộc của việc
migration còn nằm trong `CMD`, được ghi rõ trong comment, và biến mất đúng lúc 3.3 gỡ
nguyên nhân. Nợ có ghi chép thì trả được; nợ không ghi chép thì thành di sản.
