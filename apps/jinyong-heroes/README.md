# 金庸群侠传

以 **1996 年 DOS 版《金庸群侠传》** 为唯一基准的 Web Classic Engine。现代化只发生在操作、分辨率、存档和兼容性层面，不改变游戏内容与数值。

当前交付：**无画面核心** + 《连城诀》最短合法路线的自动验收。公开站点**不携带**原作美术、音乐、台词或 DAT/GRP。落地页会标明引擎尚未导入原版资源，避免被当成已可玩复刻。

产品需求：[`PRD/`](./PRD/)（原文 [`PRD/00-original-brief.md`](./PRD/00-original-brief.md)）。站规：仓库根目录 `.cursor/rules/jinyong-classic.mdc`。

试玩（落地页）：https://korea-tactics.dashjie.net/jinyong-heroes/index.html

## 命令

在仓库根目录：

```bash
npm run dev:jinyong
npm run test -w @dashjie/jinyong-heroes
npm run build -w @dashjie/jinyong-heroes
```

朝鲜战争的 `npm run sim` **不适用**本项目。改事件、数值或战斗数学后，更新 `facts/` 或黄金样本，并跑上面的 test。

## 目录

```text
src/core/       WorldState、dispatch、i16、ClassicRng、Save
src/event/      条件树与动作解释器
src/battle/     格子战草稿（unverified-vs-original）
src/content/    《连城诀》最小数据（无原作素材）
src/client/     只读文本方格，不写 Flag
src/game/       包入口
facts/          原版事实与版本锁（哈希可空）
bugs/COMPAT.md  Bug 兼容表
tests/          quest-paths / battle-golden / save-compat / anti-modern
```
