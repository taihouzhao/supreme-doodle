# 大杰游戏

这是一个 **npm workspaces monorepo**：多款网页游戏共用一套安装、测试、构建和 Cloudflare R2 部署流水线。

| 项目 | 包名 | 状态 | 试玩 |
|------|------|------|------|
| [决战朝鲜](./apps/korea-tactics/) | `@dashjie/korea-tactics` | 可玩 | https://korea-tactics.dashjie.net/index.html |
| [金庸群侠传](./apps/jinyong-heroes/) | `@dashjie/jinyong-heroes` | 《连城诀》攻略重建（未导入原版） | https://korea-tactics.dashjie.net/jinyong-heroes/index.html |
| [游戏目录](./apps/studio-site/) | `@dashjie/studio-site` | 索引页 | https://korea-tactics.dashjie.net/games/index.html |

决战朝鲜继续占据站点根路径，旧书签不用改。其它游戏写在独立 URL 前缀下，部署时不会互相删文件。

## 目录

```text
apps/
  korea-tactics/     决战朝鲜（规则核心、关卡、模拟器、网页）
  jinyong-heroes/    金庸群侠传 Classic Engine（无画面核心 + PRD）
  studio-site/       /games/ 目录页
packages/
  deploy/            多游戏 R2 同步
```

## 命令

在**仓库根目录**执行（会转发到对应 workspace）：

```bash
npm install
npm run dev:korea          # 决战朝鲜
npm run dev:jinyong        # 金庸群侠传落地页
npm run build              # 构建全部站点
npm run test               # 全部包的测试
npm run sim                # 仅决战朝鲜蒙特卡洛
npm run deploy:r2          # 同步所有 dist/ 到 R2
```

进入某个 `apps/<game>` 后，也可以直接 `npm run dev` / `npm run test`。

新增一款游戏：

1. 在 `apps/` 下建独立包（自带 `package.json`、`build` 产出 `dist/`）
2. 在 [`packages/deploy/catalog.mjs`](./packages/deploy/catalog.mjs) 登记 `id`、`dist`、`prefix`
3. 根目录 `npm install` 后即可纳入 CI 与部署

## 决战朝鲜玩法站规

改朝鲜战争这款游戏的玩法 / 数值 / 关卡时，仍须跑蒙特卡洛（`npm run sim`），详见 `.cursor/rules/gameplay-workflow.mdc` 与 [`apps/korea-tactics/README.md`](./apps/korea-tactics/README.md)。
