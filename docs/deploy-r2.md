# 部署到 Cloudflare R2

把 `npm run build` 产出的 `dist/` 同步到 R2 公共桶，供浏览器直接访问。

## 你需要准备什么

### 1. Cloudflare 账号侧（一次性）

| 项目 | 怎么拿 |
|------|--------|
| 开通 R2 | [Dashboard → R2](https://dash.cloudflare.com/?to=/:account/r2/overview)，按提示开通 |
| Account ID | R2 Overview 右侧 **Account Details**，或任意 Workers 页面右栏 |
| 创建一个桶 | 例如 `korea-tactics`（名称可自定，后面填进 secret） |
| 开启公共访问 | 桶 → **Settings** → **Public Development URL** → Enable（测试用）；生产建议绑 **Custom Domain** |
| R2 API Token | R2 Overview → **Manage R2 API Tokens** → Create → 权限选 **Object Read & Write**，范围限定到该桶 |
| 根路径 rewrite | R2 **不会**自动把 `/` 映射到 `index.html`。自定义域名下必须加一条 URL Rewrite（见下方） |

#### 自定义域名：让 `/` 打开游戏

上传成功后，`/index.html` 通常已经可用，但访问 `https://你的域名/` 会返回 R2 的 “Not Found / Is this your bucket?”。

在托管该域名的 Cloudflare 站点上加一条 **Transform Rule → Rewrite URL**：

1. 进入域名 → **Rules** → **Overview** → **Create rule** → **URL Rewrite**
2. 匹配条件（示例）：
   - `Hostname` equals `korea-tactics.dashjie.net`
   - **AND** `URI Path` equals `/`
3. 动作：
   - Path → **Rewrite to** → **Static** → `/index.html`
4. 部署规则后，再打开 `https://korea-tactics.dashjie.net/`，应看到标题「隘口 · 战棋纵向切片」

> 这是边缘 rewrite，浏览器地址栏仍可保持 `/`，不会变成跳转到 `/index.html` 的 302。

创建 Token 后立刻复制：

- **Access Key ID**
- **Secret Access Key**（只显示一次）

> 这是 R2 专用的 S3 兼容凭证，和普通 Cloudflare API Token 不是同一种东西。

### 2. GitHub Secrets（一次性）

仓库 → **Settings → Secrets and variables → Actions → Repository secrets**，新增：

| Secret | 值 |
|--------|----|
| `CLOUDFLARE_ACCOUNT_ID` | 账号 ID |
| `R2_ACCESS_KEY_ID` | 上一步的 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | 上一步的 Secret Access Key |
| `R2_BUCKET_NAME` | 桶名，如 `korea-tactics` |

兼容别名：`CF_ACCOUNT_ID` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `R2_BUCKET`。

**常见踩坑：**

- 加在 **Variables** 里无效，必须是 **Secrets**
- 加在 **Environment secrets** 里，而 workflow 没有声明 `environment:`，Actions 读不到
- 名称拼写不一致（多空格、大小写不对）
- 用了普通 Cloudflare API Token，而不是 R2 的 Access Key ID / Secret Access Key

可选（一般不用）：

| Secret / Env | 作用 |
|--------------|------|
| `R2_PREFIX` | 上传到桶内子目录 |
| `R2_ENDPOINT` | 覆盖默认 `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |

### 3. 本仓库已提供的部分

- [`scripts/deploy-r2.mjs`](../scripts/deploy-r2.mjs)：按正确 MIME / Cache-Control 同步 `dist/`，并删除远端多余对象
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)：PR / push 时跑类型检查、测试、构建、平衡门槛
- [`.github/workflows/deploy-r2.yml`](../.github/workflows/deploy-r2.yml)：push 到 `main` 或手动 `workflow_dispatch` 时部署

## 本地试部署

```bash
export CLOUDFLARE_ACCOUNT_ID=...
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...
export R2_BUCKET_NAME=korea-tactics

npm run build
DRY_RUN=1 npm run deploy:r2   # 先看会传什么
npm run deploy:r2             # 真正上传
```

打开桶的 Public Development URL，访问根路径应看到游戏标题页。

## 缓存策略

| 文件 | Cache-Control |
|------|---------------|
| `index.html` | `public, max-age=0, must-revalidate` |
| `assets/*.[hash].*` | `public, max-age=31536000, immutable` |
| 其他 | `public, max-age=3600` |

自定义域名时建议再加一条 Cache Everything 规则，否则部分扩展名默认不进 CDN 缓存。详见 [R2 Public Buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)。

## 工作流触发

- **CI**：任意 PR、以及 push 到 `main`
- **Deploy**：push 到 `main`，或 Actions 页手动 **Run workflow**（可勾选 dry run）

当前游戏代码还在特性分支链上，合并进 `main` 之后，Deploy workflow 才会在 push 时自动跑。合并前可以用 `workflow_dispatch` 在目标分支上手动试部署。

## 常见问题

**上传成功但 `/` 404，而 `/index.html` 正常**  
R2 没有目录索引。按上面「根路径 rewrite」加一条把 `/` 改写到 `/index.html` 的 Transform Rule。

**上传成功但 `/index.html` 也 404**  
桶还没开公共访问。去 Settings 打开 Public Development URL，或绑定自定义域名。

**HTML 更新了但浏览器还是旧页面**  
确认 `index.html` 的 Cache-Control 是 `must-revalidate`；若用了自定义域名的 Cache Everything，部署后可 Purge 一次该 URL。

**Secret 配错**  
Deploy job 第一步会检查四个 secret 是否存在；凭证错误时会在 Sync 步骤报 `InvalidAccessKeyId` / `SignatureDoesNotMatch`。

**和 Workers 静态资源有什么区别**  
R2 公共桶是把文件当对象存储公开读；Workers `assets` 是把 `dist/` 绑到 Worker 上由边缘直接托管。本仓库按 PRD 走 R2；若你之后想换 Workers，CI 几乎可以复用，只改最后一步为 `wrangler deploy`。
