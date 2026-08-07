# 决战朝鲜式战棋纵向切片

一个**可验证的战棋纵向切片**：一个小章节、三场连续任务，同一套确定性规则核心同时驱动网页游戏、AI Agent 与蒙特卡洛模拟器。

需求见 [`PRD/`](./PRD/)，其中 [`PRD/00-original-brief.md`](./PRD/00-original-brief.md) 是原始需求原文。

## 目录

```text
PRD/                  原始需求与派生规格
src/
├── core/             规则核心（纯 TS，不依赖 DOM）
├── content/          兵种 / 地形 / 道具 / 关卡 / 平衡数值
├── ai/               随机、基础、战术三档 Agent 与退化打法
├── sim/              批量模拟、门槛判定、平衡报告
└── ui/               网页表现
tests/                规则、确定性、战役与平衡测试
reports/balance.md    自动生成的平衡报告
```

## 命令

```bash
npm install
npm run dev      # 本地开发
npm run build    # 构建静态产物到 dist/
npm run test     # 规则、确定性、战役与平衡测试
npm run sim      # 批量模拟并重新生成 reports/balance.md
npm run deploy:r2  # 把 dist/ 同步到 Cloudflare R2（需先配置凭证）
```

## 部署到 R2

CI 会在 PR 上跑测试与构建；合并进 `main` 后自动把 `dist/` 同步到 R2。

你需要在 Cloudflare 创建桶、开启公共访问、生成 R2 API Token，并把四个值写进 GitHub Secrets。完整步骤见 [`docs/deploy-r2.md`](./docs/deploy-r2.md)。

模拟器参数：

```bash
npm run sim -- --seeds=300 --campaign-seeds=80 --out=reports/balance.md --json
npx tsx src/sim/trace.ts m3-withdraw tactical 7   # 单局复盘
```

`npm run sim` 在任一平衡门槛未通过时以非零码退出。

## 玩法要点

- 方格棋盘，回合制，「点击单位 → 点击目标」，鼠标与触屏一致。
- 四个兵种各有不可替代的用途：步兵占点、机枪架设压制、迫击炮曲射破掩体、坦克突破。
- 六种地形，高地与森林是躲避的强解，迫击炮是它们的反制。
- 生命、经验、疲劳、物资跨关继承；撤离的部队 100% 保留，被击溃的可能永久损失。
- 随机只作用于敌军编成、援军时间窗、天气与道具；核心目标、地形与我方初始兵力固定。

## 确定性

`applyAction(state, action)` 是纯函数，所有随机来自随状态流转的 mulberry32。
一局只需 `{ 初始状态, 种子, 动作序列 }` 即可完整重放，测试对状态哈希做断言。

## 当前状态

平衡门槛全部通过，详见 [`reports/balance.md`](./reports/balance.md)。
对象存储部署尚未接入，见 [`PRD/05-roadmap.md`](./PRD/05-roadmap.md)。
