# Phase 5 — CI/CD với GitOps

> Phase 2 dựng CI. Phase 4 dựng chart. Phase 5 nối hai đầu lại — và phát hiện ra
> chỗ nối không nằm ở kỹ thuật, mà ở chính các lớp bảo vệ ta đã tự dựng lên.
>
> **Shell: Git Bash (POSIX). ArgoCD stable, Sealed Secrets v0.39.0.**

---

## Lộ trình

| Bước | Nội dung | Trạng thái |
|---|---|---|
| **5.0** | Chart trỏ sang image **ghcr** thật, kind kéo được từ registry | ✅ |
| **5.1** | Cài ArgoCD vào cluster | ✅ |
| **5.2** | `Application` trỏ vào chart, chuyển quyền quản lý từ Helm sang ArgoCD | ✅ |
| **5.3** | CI tự cập nhật `image.tag` vào git sau khi push image | ✅ |
| **5.4** | Sealed Secrets — bỏ plaintext khỏi `values.yaml` | ✅ |
| **5.5** | Tài liệu | ✅ |

Kết quả cuối phase: **`git push` code là đủ để pod mới lên.** Không `kubectl`, không
`helm`, không `docker`.

---

## Quyết định mở đầu: push hay pull

GitHub Actions chạy trên máy của GitHub; cluster kind chạy trên máy bạn. Runner không có
đường nào tới `kubectl` của bạn — không phải vấn đề cấu hình mà là không có kết nối mạng.

Ba lối thoát đã cân nhắc:

| Hướng | Cách làm | Vì sao không / có chọn |
|---|---|---|
| Self-hosted runner | Cài agent GitHub lên máy | Repo public → PR từ người lạ chạy được code tuỳ ý trên máy bạn |
| Tách đôi | CI build, `helm upgrade` gõ tay | Không phải CD đúng nghĩa |
| **GitOps kéo (ArgoCD)** | Cluster tự theo dõi git | ✅ Đã chọn |

### Push vs Pull

```
Push (Phase 2-4):   CI  --[có kubeconfig]-->  cluster
Pull (Phase 5):     CI  --commit-->  git  <--[đọc]--  ArgoCD (sống TRONG cluster)
```

| | Push | Pull |
|---|---|---|
| Credential cluster | Nằm ở GitHub Actions | **Không rời khỏi cluster** |
| API server | Phải cho CI truy cập được | Không cần lộ ra ngoài |
| Nguồn sự thật | "Ai đó đã chạy lệnh gì" | **git** — đọc repo là biết cluster chạy gì |
| Sửa tay bằng `kubectl` | Sống tới lần deploy sau | Bị phát hiện là drift, **tự vá lại** |

Dòng cuối trị đúng bệnh đã gặp ở cuối Phase 4: `--set replicaCount=4` khiến cluster chạy 4
trong khi `values.yaml` ghi 2, và không có gì báo.

---

## Bước 5.0 — Image thật trên registry

GitOps có một hệ quả bắt buộc: **ArgoCD chỉ biết những gì có trong git.**

Trước bước này `values.yaml` ghi `image.repository: elearning-api` — tag chỉ tồn tại trên
node kind do `kind load` bơm vào tay. ArgoCD render ra manifest đó thì pod vẫn chạy (image
có sẵn, `IfNotPresent`), nhưng đó là **ảo giác**: không có gì trong git dẫn tới một image
thật. Máy khác dựng lên là hỏng ngay.

```yaml
image:
  repository: ghcr.io/nthhuy202/be-elearning-platform
  tag: <commit sha>
  pullPolicy: IfNotPresent
```

Bỏ luôn cơ chế `tag: '' → appVersion` của Phase 4. Nó tiện khi deploy tay, nhưng với GitOps
thì **git phải nói thẳng ra đang chạy image nào** — một giá trị rỗng cần suy luận qua hai
file là thứ khiến người đọc repo không biết production đang chạy gì.

### Kiểm chứng đúng chỗ

```bash
docker exec elearning-control-plane crictl pull ghcr.io/nthhuy202/be-elearning-platform:<sha>
docker exec elearning-control-plane crictl images | grep be-elearning-platform
```

`crictl` chạy **bên trong** node, dùng đúng containerd mà kubelet dùng. Máy bạn
`docker pull` được không chứng minh được gì — hai runtime khác nhau.

Rồi xoá image local để không còn ảo giác:

```bash
docker exec elearning-control-plane crictl rmi elearning-api:3.4
```

Package ghcr phải **Public**, kiểm tra bằng token ẩn danh:

```bash
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:<owner>/<repo>:pull" \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
curl -s -H "Authorization: Bearer $TOKEN" "https://ghcr.io/v2/<owner>/<repo>/tags/list"
```

Lấy được danh sách tag = public = kind pull thẳng được, không cần `imagePullSecret`.

---

## Bước 5.1 — Cài ArgoCD

```bash
kubectl create namespace argocd
curl -fL -o k8s/argocd-install.yaml \
  https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -n argocd -f k8s/argocd-install.yaml
kubectl wait --for=condition=available --timeout=300s -n argocd deployment --all
```

Ghim file vào repo, không `apply -f <url>` — cùng lý do đã ghim `ingress-nginx.yaml` ở 3.4.

Bảy pod. Ba cái đáng nhớ vai trò:

| Thành phần | Việc |
|---|---|
| `repo-server` | Clone git, chạy `helm template` → ra manifest |
| `application-controller` | So manifest với cluster, phát hiện lệch, apply |
| `server` | API + giao diện web |

`argocd-applicationset-controller` restart vài lần lúc khởi động là bình thường — nó chờ CRD
của chính ArgoCD được đăng ký xong.

### Vào giao diện

Cổng 80 đang do Ingress của `api` chiếm với `path: /` bắt tất cả, nên dùng port-forward —
ArgoCD là công cụ vận hành, không cần phơi ra:

```bash
kubectl port-forward -n argocd svc/argocd-server 8090:443     # chiếm terminal
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d; echo
```

---

## Bước 5.2 — Application và chuyển quyền quản lý

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: elearning
  namespace: argocd          # BẮT BUỘC ở namespace của ArgoCD
spec:
  source:
    repoURL: https://github.com/nthhuy202/be-elearning-platform.git
    targetRevision: main
    path: helm/elearning
  destination:
    server: https://kubernetes.default.svc
    namespace: elearning
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

`repoURL` dùng **HTTPS công khai**, không phải SSH. Repo public nên ArgoCD đọc được mà không
cần credential nào — đúng tinh thần pull: không có bí mật nào phải cấp cho ai.

| | Tắt | Bật |
|---|---|---|
| `prune` | Xoá file khỏi git → resource sống trong cluster mãi mãi | git là sự thật, xoá là xoá thật |
| `selfHeal` | `kubectl edit` sống tới lần sync sau | Bị vá lại trong vài giây |

`selfHeal: true` nghĩa là **`kubectl edit`/`kubectl scale` trên app này hết tác dụng vĩnh
viễn.** Muốn đổi gì thì sửa git. Đó là điểm mấu chốt, không phải tác dụng phụ.

### Nhường quyền từ Helm

ArgoCD không dùng release state của Helm — nó chạy `helm template` rồi apply. Để hai bên
không giành field manager, gỡ release Helm trước:

```bash
helm uninstall elearning
kubectl get pvc                       # data-postgres-0 VẪN CÒN
kubectl apply -f k8s/argocd-app.yaml
```

Nghe đáng sợ nhưng đã kiểm chứng ở 4.3 bằng một tai nạn thật: PVC không bị xoá, dữ liệu
nguyên vẹn, StatefulSet mới bám lại đúng volume cũ.

### Thí nghiệm self-heal

```bash
kubectl scale deploy/api --replicas=5
kubectl get pods -w
```

Pod 3, 4, 5 mọc lên rồi bị đưa về 2 trong vài giây. Không ai gọi lệnh nào.

```bash
kubectl delete svc api                # Service quay lại
```

### Bẫy: hook Helm dưới ArgoCD

Lần sync đầu tiên **kẹt vĩnh viễn**:

```
operationState: Running — waiting for completion of hook batch/Job/migrate
pod migrate-xxxxx   Init:0/1
```

Namespace `elearning` chỉ có mỗi Job migrate, không Postgres, không Secret.

ArgoCD **có** hiểu Helm hook, nhưng dịch sang mô hình phase của riêng nó:

| Helm hook | ArgoCD phase |
|---|---|
| `pre-install`, `pre-upgrade` | **PreSync** — trước mọi resource |
| `post-install`, `post-upgrade` | PostSync — sau |

Job khai **cả hai** (`post-install,pre-upgrade`). Khi có `pre-upgrade`, ArgoCD xếp vào
PreSync — nó không phân biệt install với upgrade như Helm; với ArgoCD mọi lần đều là *sync*.

Thành ra: Job chạy trước → initContainer chờ `postgres` → StatefulSet chưa được tạo (nằm ở
phase Sync, sau) → chờ vĩnh viễn → sync không xong → Postgres không bao giờ được tạo.
Bế tắc vòng tròn.

**Sửa** — khai annotation riêng cho ArgoCD, giữ annotation Helm để chart vẫn dùng tay được:

```yaml
    'argocd.argoproj.io/hook': PostSync
    'argocd.argoproj.io/hook-delete-policy': BeforeHookCreation
    'helm.sh/hook': post-install,pre-upgrade
    'helm.sh/hook-delete-policy': before-hook-creation
```

Hai hệ thống đọc hai key khác nhau, không xung đột.

**Đánh đổi:** với `PostSync`, migration chạy **sau** khi pod code mới đã lên — ngược lại
với 3.3 (code cũ trên schema mới). Luật vẫn không đổi và vẫn đủ: *migration chỉ được thêm,
không đổi/xoá trong một bước.*

### Gỡ sync đang treo

```bash
kubectl patch application elearning -n argocd --type merge -p '{"operation":null}'
kubectl delete job migrate -n elearning --wait=false
kubectl delete pod <pod> -n elearning --grace-period=0 --force
```

Không `patch operation:null` trước thì ArgoCD tạo lại Job ngay sau khi bạn xoá.

---

## Bước 5.3 — Khép vòng lặp, và cuộc chiến với chính hàng rào của mình

Ý tưởng đơn giản: sau khi CI push image tag `<sha>` lên ghcr, sửa `image.tag` trong
`values.yaml` rồi commit — ArgoCD thấy git đổi và tự sync.

Thực tế mất **sáu vòng thử** vì bốn lớp chặn khác nhau, mỗi lớp một thông điệp lỗi riêng.

### Lớp 1 — Ruleset chặn push vào main

```
GH013: Repository rule violations found for refs/heads/main
 - Changes must be made through a pull request.
 - 3 of 3 required status checks are expected.
```

Thêm bypass "Repository admin" + "Deploy keys" → **vẫn hỏng**, vì `github-actions[bot]` là
một **GitHub App**, không thuộc nhóm nào trong hai cái đó.

### Lớp 2 — Actions không được phép tạo PR

Chuyển sang hướng "bot mở PR rồi auto-merge":

```
GraphQL: GitHub Actions is not permitted to create or approve pull requests
```

Đây là **checkbox riêng** ở Settings → Actions → General, độc lập hoàn toàn với
`permissions:` trong YAML: *Allow GitHub Actions to create and approve pull requests*.

### Lớp 3 — Nhánh cũ còn sót

```
! [rejected]  bump/<sha> -> bump/<sha> (fetch first)
```

Lần chạy trước push nhánh thành công rồi hỏng ở bước sau, nên re-run tạo commit hash khác →
không fast-forward. Nhánh do máy sinh, dùng một lần → `git push --force` là đúng chỗ.

### Lớp 4 — Mâu thuẫn không sửa được bằng cấu hình

PR bump được tạo, auto-merge bật, `mergeable: true`, nhưng `/check-runs` **rỗng**:

> GitHub cố ý **không cho `GITHUB_TOKEN` kích hoạt workflow khác**. Bot tạo PR → CI không
> chạy trên PR đó → ruleset đòi 3 check xanh → auto-merge chờ vĩnh viễn.

Đây là biện pháp chống đệ quy của GitHub va chạm trực diện với nhu cầu của GitOps. Không có
tổ hợp cấu hình nào thoát được.

### Lối thoát đã chọn: PAT

Fine-grained PAT, scope **Contents: Read and write**, chỉ repo này, lưu thành secret
`CD_BUMP_TOKEN`. Commit mang danh **bạn** — mà bạn là admin — nên bypass ruleset ăn.

```yaml
  bump:
    needs: docker
    if: >-
      github.event_name == 'push' && github.ref == 'refs/heads/main' &&
      !startsWith(github.event.head_commit.message, 'chore: bump image tag')

    permissions: {}                          # không dùng GITHUB_TOKEN nữa

    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.CD_BUMP_TOKEN }}

      - name: Bump image tag in values.yaml
        run: sed -i "s|^  tag: .*|  tag: ${{ github.sha }}|" helm/elearning/values.yaml

      - name: Commit and push
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add helm/elearning/values.yaml
          git diff --staged --quiet && exit 0      # chạy lại workflow -> thoát êm
          git commit -m "chore: bump image tag to ${{ github.sha }} [skip ci]"
          git push
```

Bốn chi tiết:

| | Vì sao |
|---|---|
| `needs: docker` | Chỉ bump khi image **đã có thật** trên ghcr. Bump trước → ArgoCD kéo tag không tồn tại → `ErrImagePull` |
| `permissions: {}` | Không dùng `GITHUB_TOKEN` để ghi nữa. Thừa quyền là bề mặt tấn công không cần có |
| `[skip ci]` | Lớp chặn đệ quy **chính** — commit do PAT tạo **có** kích hoạt workflow, khác `GITHUB_TOKEN` |
| `!startsWith(...)` trong `if` | Lớp chặn thứ hai, phòng khi `[skip ci]` bị bỏ sót |

### Bốn tầng quyền — bảng tra cứu

Đã đi qua đủ cả bốn trong một buổi. Chúng trông giống nhau nhưng ở bốn nơi khác nhau:

| Tầng | Ở đâu | Chặn cái gì | Thông điệp lỗi đặc trưng |
|---|---|---|---|
| `permissions:` trong YAML | File workflow | Thu hẹp quyền token từng job. **Không mở rộng được** vượt trần | `Resource not accessible by integration` |
| Workflow permissions | Settings → Actions → General | Trần quyền của `GITHUB_TOKEN` toàn repo | như trên |
| Allow Actions to create PRs | Settings → Actions → General (checkbox riêng) | Đúng hành vi tạo/duyệt PR | `not permitted to create or approve pull requests` |
| Ruleset bypass | Settings → Rules | Ai được phá branch protection | `GH013: Repository rule violations` |

**Phản xạ đúng: đọc dòng lỗi trước.** Mỗi tầng có thông điệp riêng biệt. Sáu vòng vừa rồi
mất thời gian vì đoán tầng thay vì đợi log.

### Đọc log CI bằng API — repo public không cần token

```bash
RUN=$(curl -s "https://api.github.com/repos/<owner>/<repo>/actions/runs?branch=main&event=push&per_page=1" \
  | sed -n 's/.*"id": \([0-9]\{9,\}\).*/\1/p' | head -1)
curl -s "https://api.github.com/repos/<owner>/<repo>/actions/runs/$RUN/jobs" \
  | grep -oE '"(name|conclusion)": "[^"]*"' | paste - -
```

Cho biết **job/bước nào đỏ**. Nội dung log thì phải mở web (endpoint `/logs` cần xác thực).

---

## Bước 5.4 — Sealed Secrets

### Vì sao GitOps làm secret thành vấn đề riêng

Ở Phase 3–4 plaintext trong `values.yaml` là nợ nhẹ: giá trị giả, cluster local. Với GitOps
nó thành mâu thuẫn cấu trúc:

> ArgoCD lấy **git** làm nguồn sự thật duy nhất. Mọi thứ nó cần đều phải nằm trong git.
> Kể cả secret.

Không có đường vòng. Không thể "để secret ngoài git rồi ArgoCD tự biết" — nó không biết gì
ngoài git.

```
bạn:      Secret thường  --[mã hoá, PUBLIC key]-->  SealedSecret  -->  commit vào git
cluster:  SealedSecret   --[giải mã, PRIVATE key]-->  Secret thường
```

Private key **chỉ tồn tại trong cluster**. File trong git đọc được công khai nhưng vô dụng
với người ngoài. Bản mã gắn chặt với **tên + namespace** — bê sang namespace khác cũng
không giải được.

### Cài

Repo đã chuyển từ `bitnami-labs/` sang **`bitnami/`**:

```bash
SS_VER=0.39.0
curl -fL -o k8s/sealed-secrets.yaml \
  "https://github.com/bitnami/sealed-secrets/releases/download/v${SS_VER}/controller.yaml"
kubectl apply -f k8s/sealed-secrets.yaml
```

### Sao lưu private key — làm ngay

Mất key là **mọi SealedSecret trong git thành rác vĩnh viễn**.

```bash
kubectl get secret -n kube-system \
  -l sealedsecrets.bitnami.com/sealed-secrets-key \
  -o yaml > ~/sealed-secrets-key-BACKUP.yaml
```

**Tuyệt đối không commit.** Để ở `~`, ngoài thư mục dự án, là có chủ ý.

Khôi phục:

```bash
kubectl apply -f ~/sealed-secrets-key-BACKUP.yaml
kubectl delete pod -n kube-system -l name=sealed-secrets-controller
```

### Niêm phong

Sinh Secret trong bộ nhớ rồi niêm phong luôn, không ghi file trung gian ra đĩa:

```bash
kubectl create secret generic api --namespace elearning \
  --dry-run=client -o yaml \
  --from-literal=DATABASE_URL='postgresql://...' \
  --from-literal=JWT_SECRET="$(openssl rand -base64 48)" \
  --from-literal=VNPAY_HASH_SECRET='...' \
| kubeseal --format yaml > helm/elearning/templates/sealed-secret.yaml
```

`--dry-run=client` = `kubectl` chỉ **in YAML ra stdout**, không tạo gì trong cluster.

Rồi xoá khối `Secret` tên `api` khỏi `templates/api.yaml` và khối `secrets:` khỏi
`values.yaml`. `envFrom.secretRef.name: api` trong Deployment **giữ nguyên** — controller
tạo ra Secret cùng tên, app không phân biệt được nguồn gốc.

### Kiểm chứng

```bash
helm template elearning helm/elearning --no-hooks | grep -c 'kind: Secret'   # phải = 1
kubectl get sealedsecret,secret -n elearning
```

Phải thấy **cả hai**: `sealedsecret.bitnami.com/api` (từ git) và `secret/api` (do controller
giải mã sinh ra).

**Cảnh báo:** đổi `JWT_SECRET` làm mọi token đang lưu hành hết hiệu lực. Ở hệ thống thật
đây là loại thay đổi cần lên lịch.

---

## Vòng lặp hoàn chỉnh

```
git push code
   -> CI: check + e2e + docker (build, push ghcr:<sha>)
   -> CI: bump  (sed values.yaml, commit "[skip ci]", push main bằng PAT)
   -> ArgoCD phát hiện main đổi (≤3 phút)
   -> helm template -> apply -> rolling update (maxUnavailable: 0)
   -> PostSync: Job migrate
   -> Synced / Healthy
```

Nghiệm thu: SHA trong `kubectl get deploy api -o jsonpath='{...containers[0].image}'` khớp
SHA trong tiêu đề commit bump trên `main`.

---

## Bảng lệnh hay dùng

```bash
# ArgoCD
kubectl get application elearning -n argocd
kubectl get application elearning -n argocd -o jsonpath='{.status.sync.status}{" / "}{.status.health.status}{"\n"}'
kubectl patch application elearning -n argocd --type merge -p '{"operation":{"sync":{"revision":"main"}}}'   # ép sync ngay
kubectl patch application elearning -n argocd --type merge -p '{"operation":null}'                          # huỷ sync đang treo
kubectl port-forward -n argocd svc/argocd-server 8090:443

# Sealed Secrets
kubeseal --format yaml < secret.yaml > sealed.yaml
kubectl get sealedsecret,secret -n elearning
kubectl logs -n kube-system -l name=sealed-secrets-controller --tail=30

# Đọc kết quả CI không cần token (repo public)
curl -s ".../actions/runs?branch=main&event=push&per_page=1"
curl -s ".../actions/runs/<id>/jobs" | grep -oE '"(name|conclusion)": "[^"]*"' | paste - -

# Kiểm tra image trong node kind (KHÔNG phải docker của máy)
docker exec elearning-control-plane crictl images
docker exec elearning-control-plane crictl pull <image>
```

---

## Bẫy đã gặp trong phase này

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Sync kẹt `waiting for completion of hook Job/migrate`, namespace chỉ có Job | ArgoCD dịch `pre-upgrade` → PreSync, chạy trước cả Postgres | Thêm `argocd.argoproj.io/hook: PostSync` |
| `GH013: Repository rule violations` | Ruleset chặn push vào `main` | Bypass không ăn với App → dùng PAT |
| `not permitted to create or approve pull requests` | Checkbox riêng ở Settings → Actions | Tick *Allow GitHub Actions to create and approve pull requests* |
| PR bump `mergeable: true` nhưng `/check-runs` rỗng, auto-merge chờ mãi | `GITHUB_TOKEN` cố ý không kích hoạt workflow | Đổi sang PAT |
| `! [rejected] bump/<sha> (fetch first)` | Nhánh cũ còn sót từ lần chạy hỏng | Xoá nhánh, hoặc `git push --force` |
| `SS_VER=[]`, rồi `path does not exist` | `curl -s` không đi theo redirect; repo đã đổi tên | Thêm `-L`; đổi URL sang `bitnami/sealed-secrets` |
| `fatal: ambiguous argument 'origin\main;.github\...'` | MSYS dịch `<ref>:<path>` thành đường dẫn Windows | `MSYS_NO_PATHCONV=1 git show ...` |
| Merge conflict `both added` khi merge nhánh chồng nhánh | PR merge kiểu squash | `git rebase --onto origin/main <nhánh-dưới>` |
| Commit rơi thẳng vào `main` local | Quên tạo nhánh trước khi sửa | `git branch --show-current` trước mỗi commit |

### Thói quen rút ra

- **`curl -s` một mình là nguy hiểm** — nó nuốt cả lỗi HTTP lẫn redirect. Luôn `-fL`.
- **`echo` biến ngay sau khi gán** từ một lệnh có thể thất bại.
- **`git checkout -b` là việc đầu tiên**, trước khi sửa file — không phải việc nhớ ra lúc
  sắp commit.
- **Sửa file local không còn tác dụng gì.** ArgoCD đọc `main` trên GitHub. Vòng lặp từ giờ
  là: sửa → commit → push → **merge** → ArgoCD mới thấy.

---

## Nợ kỹ thuật ghi nhận ở Phase 5

| Nợ | Vì sao chấp nhận bây giờ | Trả ở đâu |
|---|---|---|
| `main` nhận commit không qua PR (bot dùng PAT) | Commit do máy sinh, sửa một dòng, nội dung xác định bởi một commit khác đã qua PR + CI xanh | Cách triệt để: **tách repo cấu hình khỏi repo code** — quá sức cho dự án một người |
| PAT là secret dài hạn, hết hạn sau 90 ngày | `GITHUB_TOKEN` không dùng được cho việc này | Đặt lịch gia hạn; hoặc GitHub App riêng |
| Postgres Secret vẫn plaintext trong `values.yaml` | Niêm phong từng cái một để nếu hỏng còn biết hỏng ở đâu | Bước tiếp theo, cùng cách với `api` |
| `migrate` chạy PostSync → code mới gặp schema cũ trong giây lát | ArgoCD không phân biệt install/upgrade | Chấp nhận vĩnh viễn; luật "chỉ thêm, không đổi/xoá" đủ che |
| Private key Sealed Secrets chỉ có 1 bản backup thủ công | Cluster học | Nếu lên thật: backup tự động, mã hoá, off-site |
| ArgoCD dùng mật khẩu admin mặc định, chỉ vào qua port-forward | Không phơi ra ngoài nên rủi ro thấp | Phase 7 nếu có: SSO, Ingress riêng |
| 9 PR Dependabot chưa xử lý, có `typescript 5→7`, `eslint 9→10` | Major bump sẽ làm CI đỏ, không muốn lẫn với việc gỡ CD | Một buổi riêng |
| Chưa có `values-prod.yaml` | Vẫn một môi trường | Khi có môi trường thứ hai |
| `README.md` vẫn là boilerplate NestJS | Chưa viết lại | Sớm |

---

## Đã học được gì

1. **GitOps đảo chiều tin cậy.** Không ai cầm chìa khoá cluster từ bên ngoài. Đổi lại, mọi
   thứ cluster cần phải nằm trong git — kể cả secret, và đó là lý do Sealed Secrets tồn tại.
2. **`selfHeal` biến git thành sự thật, không phải tài liệu.** Drift kiểu `--set
   replicaCount=4` ở Phase 4 giờ không thể tồn tại quá vài giây.
3. **Hook không di động giữa Helm và ArgoCD.** Cùng một Job, cùng annotation, hai hành vi
   hoàn toàn khác. Đọc kỹ cách công cụ *dịch* khái niệm của công cụ khác.
4. **Bảo mật và tự động hoá kéo ngược nhau.** Bốn lớp bảo vệ ta tự dựng lên ở 2.5 chính là
   bốn lớp phải gỡ ở 5.3. Không có cấu hình nào "đúng" — chỉ có đánh đổi được ghi lại tử tế.
5. **Đọc dòng lỗi trước khi đoán.** Sáu vòng thử ở 5.3 lẽ ra là hai, nếu bước đầu tiên luôn
   là mở log job đỏ thay vì suy luận xem tầng nào chặn.

Và một ý lặp lại từ ba phase trước: nợ được ghi chép thì trả được. `image` lặp hai file
(Phase 3) chết ở 4.1. Plaintext secret (Phase 4) chết ở 5.4. Bảng nợ của phase này cũng
đang chờ đúng như vậy.
