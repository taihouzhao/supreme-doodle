# 金庸群侠传

开放世界武侠网页游戏。**当前是空项目**：只有落地页与目录结构，还没有规则核心或关卡。

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
tests/        脚手架测试
```

与决战朝鲜共用根目录的 CI 与 R2 部署，互不覆盖静态前缀。
