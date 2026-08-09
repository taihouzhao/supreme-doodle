# 决战朝鲜式战棋纵向切片

一个**可验证的朝鲜战争历史战棋**：十二场连续任务覆盖1950年10月至1953年7月，同一套确定性规则核心同时驱动网页游戏、AI Agent 与蒙特卡洛模拟器。

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
docs/historical-basis.md  关卡史料、设计边界与来源
```

## 命令

```bash
npm install
npm run dev           # 本地开发
npm run build         # 构建静态产物到 dist/
npm run test          # 规则、确定性、战役与平衡测试
npm run sim           # 蒙特卡洛模拟 + 门槛 + reports/balance.md
npm run balance:tune  # 调敌军伤害系数，靶心十二关平均任务完成率 ≈ 40%
npm run ship          # 模拟门槛 → 构建 → 推送（触发 R2 部署）
npm run deploy:r2     # 仅把 dist/ 同步到 R2（需凭证）
```

## 玩法变更站规

1. **凡改玩法 / 数值 / 关卡难度**：必须用蒙特卡洛打磨（`npm run sim` / `npm run balance:tune`）。十二关采用“平均任务完成率”而非几乎必然归零的“全胜率”：基础策略目标带 **25%–65%**（靶心 40%，与 `src/sim/gates.ts` 一致），同时检查分关难度、战术≥基础、无死种子与反无脑打法门槛。
2. **改完直接部署**：推送 `cursor/**` 或 `main` 会自动 Deploy to R2。试玩：https://korea-tactics.dashjie.net/index.html （强制刷新）。

详见 `.cursor/rules/gameplay-workflow.mdc`。

## 部署到 R2

CI 会在 PR 上跑测试与构建；推送到 `main` 或任意 `cursor/**` 分支后自动把 `dist/` 同步到 R2。

你需要在 Cloudflare 创建桶、开启公共访问、生成 R2 API Token，并把四个值写进 GitHub Secrets。完整步骤见 [`docs/deploy-r2.md`](./docs/deploy-r2.md)。

模拟器参数：

```bash
npm run sim -- --seeds=300 --campaign-seeds=80 --workers=4 --out=reports/balance.md --json
npm run balance:tune -- --seeds=80 --target=0.3 --workers=4 --write
node --import tsx src/sim/trace.ts m12-kumsong tactical 7   # 单局复盘
```

`npm run sim` / `npm run balance:tune` 在门槛未通过时以非零码退出。

## 玩法要点

- 方格棋盘，回合制，「点击单位 → 查看伤害/反击预测 → 确认或取消攻击」，鼠标与触屏逻辑一致。
- 主角是虚构的志司直属指挥员高大全；真实将领以固定肖像、战时职务与军衔徽记出现在历史简报中。
- 开局 4 名伴随将领跨关成长（统率/智力/武力/耐力/机敏 + 战斗资历等级）；固定战时职务与等级分开显示，各关另有剧情将领临时配属。
- 十二关依次为温井、云山、清川江、长津湖、第三次战役、横城、砥平里、临津江、铁原、上甘岭、猪排山、金城。
- 四个兵种各有不可替代的用途；地图单位以人物头像为主体、右下叠加兵种角标，武器卡显示型号、产地与口径。
- 八种地形均有常态/雪地成对贴图；高地与森林是掩护强解，迫击炮是其反制。
- 生命、经验、疲劳、物资跨关继承；撤离的部队 100% 保留，被击溃的可能永久损失。
- 晴、阴、雨、雪、雾五类天气来自各战役的史实气候范围；随机只在合理集合内选择。
- 随机只作用于敌军编成、援军时间窗、受约束天气与道具；核心目标、地形与我方初始兵力固定。

## 确定性

`applyAction(state, action)` 是纯函数，所有随机来自随状态流转的 mulberry32。
一局只需 `{ 初始状态, 种子, 动作序列 }` 即可完整重放，测试对状态哈希做断言。

## 当前状态

正式基线为每关每策略 200 seeds、连续战役 50 seeds，11/11 自动门槛通过；115/115 测试与生产构建通过。数学报告见 [`reports/balance.md`](./reports/balance.md)，未完成的视觉/真人验收见 [`PRD/06-audit-and-optimization-plan.md`](./PRD/06-audit-and-optimization-plan.md)。试玩站：https://korea-tactics.dashjie.net/index.html 。
