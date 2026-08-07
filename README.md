# Supreme Doodle

可在浏览器直接游玩的**静态网页小游戏**：控制涂鸦角色收集星星、躲避墨迹。

需求文档见 [`PRD/`](./PRD/)。

## 目录结构

```text
/
├── PRD/                 # 原始需求（Markdown）
├── public/              # 静态站点根目录（后续可整夹部署到 R2）
│   ├── index.html
│   ├── css/
│   ├── js/
│   │   ├── main.js
│   │   └── game/        # 游戏模块
│   └── assets/          # 图片 / 音频占位
├── README.md
└── .gitignore
```

## 本地试玩

推荐用静态服务器打开 `public/`（ES modules 在 `file://` 下可能受限）：

```bash
python3 -m http.server 8080 --directory public
```

浏览器访问 `http://localhost:8080`。

## 操作

| 平台 | 操作 |
|------|------|
| 桌面 | `WASD` / 方向键移动，`P` 或 `Esc` 暂停 |
| 触屏 | 左下虚拟摇杆移动，右上暂停 |

## 当前范围

- 可玩闭环：开始 → 游玩 → 结束 → 重开
- 无构建、无后端
- **R2 部署尚未接入**（见 `PRD/04-roadmap.md` 阶段 C）
