# 03 — 技术规格

## 技术约束

- **纯静态**：HTML + CSS + ES Modules，无构建步骤、无 npm 依赖。
- **运行方式**：本地用任意静态服务器打开 `public/`，或直接用支持 ES modules 的方式加载 `index.html`（建议用本地静态服务，避免 `file://` 模块限制）。
- **渲染**：Canvas 2D。
- **兼容**：现代 Chromium / Firefox / Safari；布局适配手机竖屏与桌面。

## 仓库目录

```text
/
├── PRD/                      # 原始需求（本目录）
├── public/                   # 可部署的静态根目录（未来可整夹上传 R2）
│   ├── index.html
│   ├── css/
│   ├── js/
│   │   ├── main.js           # 入口
│   │   └── game/             # 游戏逻辑模块
│   └── assets/               # 图片 / 音频等资源
├── README.md
└── .gitignore
```

## 模块约定

| 文件 | 职责 |
|------|------|
| `js/main.js` | 挂载画布、创建 `Game`、启动循环 |
| `js/game/constants.js` | 尺寸、颜色、平衡数值 |
| `js/game/input.js` | 键盘与触屏输入状态 |
| `js/game/entities.js` | 玩家 / 星星 / 障碍的更新与绘制 |
| `js/game/game.js` | 状态机、碰撞、生成、主循环 |
| `js/game/ui.js` | DOM 面板与 HUD 同步 |

## 本地试玩

```bash
# 任选其一，在仓库根目录执行
python3 -m http.server 8080 --directory public
# 或
npx --yes serve public
```

浏览器访问提示的本地地址即可。

## 后续 R2（未实现）

- 将 `public/` 作为上传根。
- 配置公开读与（可选）自定义域名、缓存头。
- 可用 Wrangler / CI 自动化；本期不交付。

## 修订记录

| 版本 | 说明 |
|------|------|
| 0.1 | 初稿：目录与模块边界 |
