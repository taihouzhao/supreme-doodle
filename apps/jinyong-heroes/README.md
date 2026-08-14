# 金庸群侠传

以 **1996 年 DOS 版《金庸群侠传》** 为唯一基准的网页复刻立项。现代化只发生在操作、分辨率、存档和兼容性层面，不改变游戏内容与数值。

当前仍是空项目：只有落地页，还没有规则核心或关卡。产品需求全文见 [`PRD/`](./PRD/)，原文归档为 [`PRD/00-original-brief.md`](./PRD/00-original-brief.md)。

试玩（落地页）：https://korea-tactics.dashjie.net/jinyong-heroes/index.html

## 命令

在仓库根目录：

```bash
npm run dev:jinyong
npm run build -w @dashjie/jinyong-heroes
npm run test -w @dashjie/jinyong-heroes
```

或进入本目录后 `npm run dev`。

## 目录

```text
src/game/     规则与内容（空）
src/main.ts   落地页
PRD/          极致复刻需求（原文归档）
tests/        脚手架测试
```

与决战朝鲜共用根目录的 CI 与 R2 部署，互不覆盖静态前缀。
