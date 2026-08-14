# 金庸群侠传

以 **1996 年 DOS 版《金庸群侠传》** 为唯一基准的 Web Classic Engine。没有原版文件时，按公开攻略重建《连城诀》；坐标、条件与战斗公式都标 `reconstructed-from-walkthrough` / `unverified-vs-original`。

公开站点**不携带**原作美术、音乐、台词或 DAT/GRP。试玩是占位像素上的行走与棋盘战斗，不是已导入原版的复刻。

产品需求：[`PRD/`](./PRD/)。事实库：[`facts/`](./facts/)。

- 说明页：https://korea-tactics.dashjie.net/jinyong-heroes/index.html
- 试玩（箭头走、空格面对、ESC 菜单）：https://korea-tactics.dashjie.net/jinyong-heroes/index.html?play=1

## 命令

```bash
npm run dev:jinyong
npm run test -w @dashjie/jinyong-heroes
```

朝鲜战争的 `npm run sim` **不适用**本项目。
