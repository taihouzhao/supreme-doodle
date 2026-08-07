# 产品需求文档（PRD）

第一版目标是一个**可验证的战棋纵向切片**：一个小章节、三场连续任务、可批量模拟验证，而不是完整复刻《决战朝鲜》。

## 文档索引

| 文档 | 说明 |
|------|------|
| [00-original-brief.md](./00-original-brief.md) | 原始需求原文（逐字归档，冲突时以此为准） |
| [01-product-scope.md](./01-product-scope.md) | 第一版目标、核心假设、范围与非范围 |
| [02-game-design.md](./02-game-design.md) | 棋盘、兵种、地形、道具、战斗、战役继承、三关 |
| [03-tech-architecture.md](./03-tech-architecture.md) | 四部分架构、目录、确定性与重放 |
| [04-validation-and-balance.md](./04-validation-and-balance.md) | 数学验证门槛与真人验证观察项 |
| [05-roadmap.md](./05-roadmap.md) | 阶段划分 |

## 使用约定

- 需求变更先改 PRD，再改代码；`00` 为原文，不修改。
- 数值只写在 `src/content/`，PRD 记录设计意图与首版取值。
- 归档：[archive/doodle/](./archive/doodle/) 为早期涂鸦原型的需求，已不再适用。
