# Changelog

## v0.2 — UX feedback (unreleased)

- 交战浮字 / 血条 / 反击过程（≤2s）与移动轨迹动画
- 任务目标清单（完成/未完成）与棋盘标记
- 点格状态栏；移除操作教学卡
- Canvas 极简地形与兵种几何图标
- 志愿军 / 联合军历史启发命名（云山、长津等）

## v0.1 — 2026-08-07

首个可玩的战棋纵向切片发布。

- 确定性规则核心：移动、战斗、道具、任务判定、战役继承
- 三场连续任务内容配置与本地存档 / 回放
- Canvas 网页表现（点击单位 → 点击目标）
- 蒙特卡洛模拟器与平衡门槛（`npm run sim`）
- GitHub Actions CI + Cloudflare R2 部署流水线

验证地址：`https://korea-tactics.dashjie.net/index.html`  
（根路径 `/` 需在 Cloudflare 配置 URL Rewrite 到 `index.html`）
