# 产品需求文档（PRD）

当前版本是一个**可验证的朝鲜战争战棋章节**：十二场连续任务、固定虚构主角、历史资料边界与可批量模拟验证；仍是战术抽象，不宣称完整复刻战争。

## 文档索引

| 文档 | 说明 |
|------|------|
| [00-original-brief.md](./00-original-brief.md) | 原始需求原文（逐字归档，冲突时以此为准） |
| [01-product-scope.md](./01-product-scope.md) | 当前目标、核心假设、范围与非范围 |
| [02-game-design.md](./02-game-design.md) | 棋盘、兵种、地形、道具、战斗、战役继承、十二关 |
| [03-tech-architecture.md](./03-tech-architecture.md) | 四部分架构、目录、确定性与重放 |
| [04-validation-and-balance.md](./04-validation-and-balance.md) | 数学验证门槛与真人验证观察项 |
| [05-roadmap.md](./05-roadmap.md) | 阶段划分 |
| [06-audit-and-optimization-plan.md](./06-audit-and-optimization-plan.md) | 2026-08 全面审计、经典对标、问题优先级与本轮实施验收 |

## 使用约定

- 需求变更先改 PRD，再改代码；`00` 为原文，不修改。
- 数值只写在 `src/content/`，PRD 记录设计意图与首版取值。
- 归档：[archive/doodle/](./archive/doodle/) 为早期涂鸦原型的需求，已不再适用。
