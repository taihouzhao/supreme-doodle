# 04 — 验收与测试

派生自 `00` 第一、十二、十三节。冲突以 `00` 为准。

## 没有原版二进制时

CI 跑攻略路径与引擎不变量。黄金样本目录放 schema 与占位，`status: pending-original`。有 DOS 版后写入文件哈希，把占位换成实测逐步一致样本。

## 事实库

`facts/` 一条事实一个文件（或同一文件内一条记录），必须含：

- `id`
- `status`：`reconstructed-from-walkthrough` | `verified-vs-original` | `pending-original`
- `source`：攻略/手册/实测
- `repro`：可重复步骤
- `before` / `after`：世界状态要点

争议行为只进事实库，不进「感觉应该这样」。

## 黄金样本

目录：`tests/battle-golden/`。每场最终应保存：初始属性、装备、武功、位置、种子、每步操作、每次伤害与状态、最终经验。网页实现必须逐步一致。

本阶段天宁寺一战可重放，元数据标 `unverified-vs-original`。

## 旧攻略脚本

步骤写成 `goTo` / `talkTo` / `receive` / `take` / `useOn`。每次改事件或数值必须跑 `tests/quest-paths/`。

《连城诀》最短合法路线：

```text
home → nanxian_house → jiangnan_cave → beichou_house → tianning_temple → battle → liancheng_book
```

## 反现代化扫描

`tests/anti-modern/` 检查源码与内容不含：抽卡、天赋树、每日任务、任务箭头、动态等级、装备词条、赛季、联网养成等。允许在 PRD/站规/本测试里出现这些词作为**禁止项说明**。

## Bug 兼容

见 [`../bugs/COMPAT.md`](../bugs/COMPAT.md)。三类：必须保留原版行为；仅增强模式可修的摩擦；两模式都修的崩溃/坏档/卡死/无法通关程序错误。修复要留下 `BUG-ORIGINAL-NNN` 记录。

## 命令

```bash
npm run test -w @dashjie/jinyong-heroes
```

朝鲜战争的 `npm run sim` **不适用**本项目。
