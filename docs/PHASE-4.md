# Phase 4 — Helm

> Kubernetes cho bạn các mảnh ghép. Helm cho bạn một thứ để **cài, nâng cấp, và quay lui**
> nguyên khối — kèm lịch sử.
>
> **Shell: Git Bash (POSIX). Helm v4.2.4.**

---

## Lộ trình

| Bước | Nội dung | Trạng thái |
|---|---|---|
| **4.0** | Cài Helm, dựng chart render ra **y hệt** manifest đang chạy | ✅ |
| **4.1** | Tham số hoá image, replicas, resources, thông tin DB vào `values.yaml` | ✅ |
| **4.2** | Migration Job thành Helm hook `post-install,pre-upgrade` | ✅ |
| **4.3** | `helm install` thật, upgrade, rollback; xoá manifest thô | ✅ |

Kết quả cuối phase: toàn bộ app dựng lại bằng **một lệnh**, deploy tag mới bằng **một
`--set`**, và deploy hỏng thì tự quay lui không mất một request nào.

---

## Bước 4.0 — Chart tương đương

### Helm giải quyết đúng cái gì

Không phải "cho pro". Bốn vấn đề có thật, đo được, trong chính repo này ở cuối Phase 3:

| Vấn đề | Bằng chứng |
|---|---|
| Một giá trị nằm ở nhiều chỗ | `image: elearning-api:3.4` lặp ở `api.yaml` và `migrate-job.yaml` — và đã **quên bump một chỗ** ở commit `42c4261` |
| Không có khái niệm môi trường | Muốn dev 1 replica / prod 3 phải sửa file hoặc copy cả thư mục |
| Thứ tự deploy nằm trong đầu người deploy | 5 lệnh `kubectl` ở 3.3, không gì ép được |
| Không rollback được | `kubectl apply` không nhớ trạng thái cũ |

### Cài Helm

```bash
HELM_VER=$(curl -s https://api.github.com/repos/helm/helm/releases/latest \
  | sed -n 's/.*"tag_name": "\([^"]*\)".*/\1/p')

curl -Lo ~/helm.zip "https://get.helm.sh/helm-${HELM_VER}-windows-amd64.zip"
unzip -o ~/helm.zip -d ~/helm-tmp
mv ~/helm-tmp/windows-amd64/helm.exe ~/bin/helm.exe
rm -rf ~/helm.zip ~/helm-tmp
```

### Không dùng `helm create`

`helm create` sinh ~200 dòng template kèm ServiceAccount, HPA, test hook, `NOTES.txt` và
một `_helpers.tpl` đầy hàm chưa dùng tới. Với người đang học, đó là đống code không đọc nổi
và không dám xoá.

Ta đã có 5 manifest **chạy được**. Việc của Phase 4 là chuyển dần chúng thành template,
không phải bỏ đi làm lại.

### Nguyên tắc xuyên suốt: chứng minh không đổi gì trước

Đây là ý quan trọng nhất của cả phase.

```bash
helm template elearning helm/elearning --no-hooks | kubectl diff -f -
```

**Rỗng = chart sinh ra chính xác thứ đang chạy.** Chỉ khi đó mới được sang bước sau.

Đảo thứ tự — vừa đưa vào Helm vừa sửa cấu hình — thì lúc hỏng bạn không biết tại chart hay
tại thay đổi. Phép kiểm tra này được lặp lại ở **cả 4.0, 4.1 và 4.2**, và mỗi lần đều phải
rỗng.

`helm template` chỉ render ra stdout, **không đụng cluster**, nên chạy bao nhiêu lần cũng an
toàn.

### Cấu trúc chart

```
helm/elearning/
├── Chart.yaml          # danh tính + version
├── values.yaml         # giá trị mặc định
└── templates/
    ├── _helpers.tpl    # bắt đầu bằng _ -> không phải manifest, là thư viện hàm
    ├── api.yaml
    ├── ingress.yaml
    ├── migrate-job.yaml
    └── postgres.yaml
```

Hai file **cố ý không** đưa vào chart:

- `k8s/ingress-nginx.yaml` — hạ tầng của cluster, phải tồn tại **trước** khi chart cài.
- `k8s/kind-cluster.yaml` — cấu hình tạo cluster, không phải resource trong cluster.

`version` vs `appVersion` trong `Chart.yaml`: version **của chart** (tăng khi sửa template)
và version **của app** (bám theo tag image). Sửa `resources` mà không đổi code thì chỉ
`version` tăng.

---

## Bước 4.1 — `values.yaml`

### Chọn cái gì để tham số hoá

**Chỉ những thứ thật sự thay đổi** giữa môi trường hoặc giữa các lần deploy. Đưa mọi thứ
vào là tạo ra một ngôn ngữ cấu hình thứ hai còn khó đọc hơn YAML gốc.

Bốn nhóm được chọn: image, quy mô (replicas/resources), cấu hình app, thông tin đăng nhập DB.

### Hai chỗ khử trùng lặp đáng giá nhất

**1. Image — nợ lớn nhất của Phase 3**

`templates/_helpers.tpl`:

```
{{- define "elearning.image" -}}
{{ printf "%s:%s" .Values.image.repository (.Values.image.tag | default .Chart.AppVersion) }}
{{- end -}}
```

Dùng ở cả `api.yaml` và `migrate-job.yaml`:

```yaml
          image: {{ include "elearning.image" . | quote }}
```

Dấu `.` cuối là **bắt buộc** — nó truyền context (`.Values`, `.Chart`...) vào hàm. Thiếu nó
thì trong hàm `.Values` rỗng, và bạn nhận `:` trơ trọi chứ không phải lỗi.

**2. `DATABASE_URL` ghép từ `postgres.auth`**

```yaml
  DATABASE_URL: {{ printf "postgresql://%s:%s@postgres:5432/%s?schema=public"
                    .Values.postgres.auth.user
                    .Values.postgres.auth.password
                    .Values.postgres.auth.database | quote }}
```

Cùng loại lỗi với image tag: mật khẩu DB từng nằm ở hai chỗ (Secret của Postgres và
connection string của app), đổi một chỗ quên chỗ kia là app không kết nối được. Giờ đổi
`postgres.auth.password` là cả hai cùng đổi.

### ConfigMap/Secret sinh bằng `range`

```yaml
data:
  {{- range $key, $value := .Values.env }}
  {{ $key }}: {{ $value | quote }}
  {{- end }}
```

Key trong `values.yaml` chính là tên biến môi trường — không dịch qua lại, không có chỗ để
sai. Và `quote` bọc nháy cho **mọi** value, nên tự động tránh cái bẫy `PORT: 8080 là số` đã
gặp ở 3.2.

### Cú pháp template — chỉ 6 thứ

| Cú pháp | Ý nghĩa |
|---|---|
| `{{ .Values.x }}` | Đọc từ `values.yaml` |
| `{{ .Chart.AppVersion }}` | Đọc từ `Chart.yaml` (còn `.Release.Name`, `.Release.Namespace`) |
| `{{- ` | Xoá khoảng trắng/xuống dòng **phía trước**. Không có nó, mỗi `{{- if }}` để lại một dòng trống |
| `\| quote` | Bọc nháy kép. Bắt buộc cho value ConfigMap/Secret |
| `\| default X` | Rỗng thì lấy X |
| `toYaml .Values.x \| nindent 12` | Đổi cả nhánh sang YAML. `toYaml` trả text **không thụt lề**, `nindent 12` xuống dòng rồi thụt 12 space mỗi dòng |

Một quy tắc duy nhất cần nhớ: **template không hiểu YAML.** Nó chỉ thay chuỗi, chạy
trước khi ai đó parse YAML. Nên lỗi báo ra luôn nói về **kết quả**, không nói về nguyên
nhân. Phản xạ đầu tiên khi lỗi: `helm template` rồi đọc thẳng đầu ra.

### Kiểm chứng payoff

```bash
helm template elearning helm/elearning --set replicaCount=5 --set image.tag=abc123 \
  | grep -E 'replicas:|image:'
```

Một dòng lệnh, không sửa file nào, và `image:` đổi ở **cả hai** chỗ.

---

## Bước 4.2 — Migration là Helm hook

### Trước

Năm lệnh phải chạy đúng thứ tự, không gì ép:

```bash
kubectl delete job migrate --ignore-not-found   # vì spec của Job bất biến
kubectl apply -f k8s/migrate-job.yaml
kubectl wait --for=condition=complete job/migrate --timeout=120s
kubectl apply -f k8s/api.yaml
kubectl rollout status deploy/api
```

Quên dòng đầu → `field is immutable`. Quên `wait` → code mới chạy trên schema cũ. Kiến thức
này nằm trong đầu người deploy, không nằm trong repo — và biến mất khi người đó nghỉ.

### Sau

```yaml
metadata:
  name: migrate
  annotations:
    'helm.sh/hook': post-install,pre-upgrade
    'helm.sh/hook-delete-policy': before-hook-creation
```

| Annotation | Thay cho |
|---|---|
| `post-install` | Lần cài đầu — Postgres phải tồn tại trước đã |
| `pre-upgrade` | Các lần sau — migration chạy **trước** khi pod code mới lên |
| `before-hook-creation` | Đúng dòng `kubectl delete` thủ công. Trị dứt `field is immutable` |

Không dùng `hook-succeeded` cho delete-policy: giữ Job lại giữa hai lần deploy chính là thứ
cho bạn đọc log khi có sự cố. Cũng bỏ luôn `ttlSecondsAfterFinished` vì
`before-hook-creation` đã lo việc dọn.

Thêm initContainer chờ Postgres — rẻ hơn nhiều so với để migration fail rồi dựa vào
`backoffLimit`:

```yaml
      initContainers:
        - name: wait-for-postgres
          image: {{ .Values.postgres.image | quote }}
          command:
            - sh
            - -c
            - until pg_isready -h postgres -U {{ .Values.postgres.auth.user }}; do sleep 2; done
```

### Helm làm gì khi `helm upgrade`

```
1. Render toàn bộ chart
2. Tạo resource có hook pre-upgrade            <- Job migrate
3. ĐỢI cho tới khi Complete                    <- thay cho `kubectl wait`
   Fail -> HUỶ TOÀN BỘ upgrade, app giữ bản cũ
4. Áp resource thường (Deployment, Service...)
5. Hook post-upgrade nếu có
```

Bước 3 là mấu chốt: **migration hỏng thì code mới không bao giờ được deploy.** Ở 3.3 điều
đó phụ thuộc vào việc bạn có nhớ gõ `kubectl wait` hay không.

### Ba điều phải biết về hook

**1. Hook không thuộc release manifest.** `helm rollback` **không** hoàn tác migration.
Rollback đưa image về bản cũ, schema vẫn ở bản mới. Rollback giờ dễ tới mức một lệnh, nên
luật "migration chỉ được thêm, đổi/xoá phải tách nhiều lần deploy" (3.3) càng bắt buộc.

**2. `helm template` có render hook.** Phép kiểm chứng "không đổi gì" từ 4.2 trở đi phải
thêm `--no-hooks`, nếu không diff sẽ báo Job `migrate` là resource mới.

**3. `pre-upgrade` dùng Secret của bản CŨ.** Hook chạy trước khi resource thường được cập
nhật. Một lần upgrade vừa đổi mật khẩu DB vừa có migration sẽ kết nối bằng mật khẩu cũ →
tách làm hai lần deploy.

---

## Bước 4.3 — Cài thật, upgrade, rollback

### Hai hệ thống "sở hữu" khác nhau

Đây là chỗ tốn thời gian nhất của cả phase.

| | Cơ chế | Flag |
|---|---|---|
| Sở hữu của **Helm** | Annotation `meta.helm.sh/release-name` | `--take-ownership` |
| Sở hữu của **Kubernetes** | `metadata.managedFields`, theo từng field | `--force-conflicts` |

Helm 4 mặc định dùng **server-side apply** (`--server-side` default `true`; Helm 3 dùng
client-side). Với SSA, mỗi field có một *field manager* đứng tên. Resource do `kubectl
apply` tạo mang tên `kubectl-client-side-apply`, nên Helm xin ghi
`.spec.volumeClaimTemplates` thì API server từ chối:

```
conflict with "kubectl-client-side-apply" using apps/v1: .spec.volumeClaimTemplates
```

Đây là **tính năng**, không phải lỗi — nó ngăn hai công cụ âm thầm giẫm lên nhau. Cần cả
hai flag, và chỉ dùng chúng khi `kubectl diff` đã chứng minh nội dung y hệt: lúc đó việc
"cướp quyền" chỉ đổi tên người đứng chủ, không đổi nội dung.

### Sự cố: `helm uninstall` và bài học PVC

Trong lúc gỡ rối tranh chấp sở hữu, `helm uninstall elearning` đã được chạy. Nó xoá sạch
Deployment, Service, StatefulSet, ConfigMap, Secret, Ingress.

Nhưng:

```
data-postgres-0   Bound   2Gi   24h
```

**PVC còn nguyên.** Đúng hành vi ghi ở 3.1 — Kubernetes không xoá PVC kèm StatefulSet, kể
cả khi Helm gỡ release. Dữ liệu database không mất một dòng. Cài lại bằng một lệnh, và
StatefulSet mới tự bám lại đúng PVC cũ theo tên.

Và tình cờ nó làm mọi thứ dễ hơn: không còn resource nào do `kubectl` tạo → không còn tranh
chấp sở hữu → `helm install` sạch, không cần flag nào.

Nếu cần lặp lại tình huống này mà **không** muốn xoá resource: trạng thái Helm chỉ nằm
trong một Secret trong namespace.

```bash
kubectl get secret -l owner=helm        # sh.helm.release.v1.<release>.v<n>
kubectl delete secret sh.helm.release.v1.elearning.v1
```

Xoá đúng cái đó là Helm quên lần cài hỏng, mọi thứ trong cluster vẫn chạy.

### Rollback tự động — phần đáng giá nhất

```bash
helm upgrade elearning helm/elearning \
  --set image.tag=khong-ton-tai \
  --wait --timeout 90s --rollback-on-failure
```

Diễn biến: pod mới `ErrImagePull` → Helm đợi hết timeout → tự rollback về revision trước.
Trong suốt quá trình, `maxUnavailable: 0` (3.5) giữ nguyên các pod cũ nên
`curl http://localhost/health` **không hề gián đoạn**.

Đây là lúc thấy rõ ba thứ của Phase 3 và cơ chế của Helm ăn khớp với nhau: readinessProbe
chặn pod hỏng khỏi Endpoints, `maxUnavailable: 0` giữ đủ pod cũ, Helm phát hiện timeout và
quay lui.

```bash
helm history elearning
```

```
1  Install complete
2  Upgrade complete
3  failed      Upgrade "elearning" failed: context canceled
4  Rollback to 2
5  Upgrade complete
```

### Bẫy: `--set` không phải chuyện một lần

Sau chuỗi thí nghiệm trên, cluster chạy 4 replica trong khi `values.yaml` ghi 2.

```bash
helm get values elearning
# USER-SUPPLIED VALUES:
# replicaCount: 4
```

`--set` được **lưu vào release** và mọi upgrade sau đều mang theo. Rollback về một revision
từng `--set` cũng kéo giá trị đó về. Hệ quả: **file trong git không còn là sự thật**, và
không có gì báo cho bạn biết.

| Flag | Ý nghĩa |
|---|---|
| (không có) | Lấy values từ chart, **cộng** `--set`/`-f` của lần này |
| `--reuse-values` | Giữ values của release cũ, merge thêm override mới |
| `--reset-values` | Vứt hết, quay về đúng `values.yaml` trong chart |

Quy tắc thực dụng: **`--set` chỉ dùng cho thử nghiệm tạm và cho `image.tag` trong CI/CD.**
Mọi thứ khác sửa vào `values.yaml` rồi commit.

---

## Bảng lệnh hay dùng

```bash
# Dựng lại toàn bộ app từ số 0 (cluster + ingress-nginx đã có sẵn)
helm install elearning helm/elearning --wait --timeout 3m

# Deploy một tag cụ thể — đây là hình dạng của CI/CD ở Phase 5
helm upgrade elearning helm/elearning --set image.tag=<sha> --wait --rollback-on-failure

# Không đụng cluster
helm lint helm/elearning
helm template elearning helm/elearning                       # render ra stdout
helm template elearning helm/elearning -s templates/api.yaml # chỉ 1 file
helm template elearning helm/elearning --no-hooks | kubectl diff -f -

# Trạng thái
helm list
helm history elearning
helm status elearning
helm get values elearning          # values do người dùng truyền
helm get values elearning --all    # cộng cả mặc định của chart
helm get manifest elearning        # YAML thật đang chạy

# Quay lui
helm rollback elearning            # về revision trước
helm rollback elearning 2          # về revision cụ thể
helm upgrade elearning helm/elearning --reset-values   # bỏ hết --set đã tích luỹ
```

---

## Bẫy đã gặp trong phase này

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `invalid map key: map[".Values.postgres.image \| quote":...]` | **Prettier** format-on-save đọc `{{ x }}` bằng YAML parser, thấy flow mapping lồng nhau, in lại thành `{ { x } }` | `sed -i 's/{ {/{{/g; s/} }/}}/g'` + tạo `.prettierignore` chứa `helm/` |
| `conflict with "kubectl-client-side-apply" ... .spec.volumeClaimTemplates` | Helm 4 dùng server-side apply; field đang do kubectl đứng tên | Thêm `--force-conflicts` (kèm `--take-ownership`) |
| `invalid ownership metadata` | Resource có sẵn thiếu annotation `meta.helm.sh/*` | `--take-ownership` |
| Release `failed` ở revision 1, không cài lại được | Helm không cho `install` trùng tên | Xoá Secret `sh.helm.release.v1.<name>.v1` — **đừng** `helm uninstall`, nó xoá cả resource |
| Cluster 4 replica, `values.yaml` ghi 2 | `--set` được lưu vào release, tồn tại qua mọi upgrade | `helm upgrade --reset-values` |
| `helm list -a` → `unknown shorthand flag: 'a'` | Helm 4 bỏ shorthand này | Dùng `--deployed`, `--failed`, `-A` (all namespaces) |
| `helm template \| kubectl diff` báo Job là resource mới | `helm template` render cả hook | Thêm `--no-hooks` |
| Lỗi YAML khó hiểu trong chart | Template thay chuỗi **trước**, YAML parse **sau** | `helm template` rồi đọc thẳng đầu ra |

### Khác biệt Helm 3 → Helm 4 đã gặp

| | Helm 3 | Helm 4 |
|---|---|---|
| Apply | Client-side | **Server-side** mặc định (`--server-side=true`) |
| `helm list -a` | Có | Bỏ — dùng `--deployed`/`--failed`/`-A` |
| `--atomic` | Có | Đổi tên thành `--rollback-on-failure` |
| `--wait` | Boolean | Enum `WaitStrategy`: `watcher` / `hookOnly` / `legacy`. Mặc định khi không truyền: `hookOnly` |

---

## Nợ kỹ thuật ghi nhận ở Phase 4

| Nợ | Vì sao chấp nhận bây giờ | Trả ở đâu |
|---|---|---|
| `values.yaml` chứa `JWT_SECRET`, mật khẩu DB dạng plaintext | Cluster local, giá trị giả | **Phase 5** — Sealed Secrets |
| Resource đặt tên cứng (`api`, `postgres`), không prefix `.Release.Name` | Giữ tên cũ để `kubectl diff` chứng minh được tương đương. Chart chuẩn sẽ prefix | Khi cần cài 2 release trong cùng namespace |
| Chưa có `values-prod.yaml` | Mới có đúng một môi trường | Phase 5 khi có môi trường thứ hai |
| Postgres nằm chung chart với app | Đúng cho môi trường học | Production sẽ là DB ngoài (RDS) hoặc subchart |
| `image.repository: elearning-api` vẫn là tag local | CI/CD chưa có | **Phase 5** — `ghcr.io/...` + `--set image.tag=<sha>` |
| `README.md` vẫn là boilerplate NestJS | Chưa viết lại | Cuối Phase 5 |
| Chưa có `helm test` | Có e2e ở CI rồi | Chưa xếp lịch |

---

## Đã học được gì

1. **Chứng minh không đổi gì, rồi mới đổi.** `helm template | kubectl diff -f -` phải rỗng
   ở mỗi bước migration sang Helm. Vừa đưa vào Helm vừa sửa cấu hình là tự làm mù mình.
2. **Hook đưa quy trình vào repo.** Năm lệnh `kubectl` theo thứ tự — thứ chỉ tồn tại trong
   đầu người deploy — trở thành hai dòng annotation ai cũng đọc được.
3. **Rollback không hoàn tác migration.** Helm làm rollback dễ tới mức nguy hiểm nếu quên
   điều này.
4. **`--set` là trạng thái, không phải tham số.** Nó sống trong release và làm git trôi
   khỏi cluster mà không báo.
5. **Template không hiểu YAML.** Prettier cũng không hiểu template. Hai thứ đó gặp nhau
   sinh ra lỗi mà thông báo lỗi không hề nhắc tới nguyên nhân.

Và một ý về quy trình lặp lại từ Phase 3: nợ được ghi chép thì trả được. `image` lặp ở hai
file — ghi vào bảng nợ cuối Phase 3, và chết đúng ở 4.1 bằng `_helpers.tpl`. Bảng nợ của
phase này cũng đang chờ Phase 5 theo đúng cách đó.
