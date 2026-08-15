# 决战朝鲜：塔防 · 温井防御战

这是 `@dashjie/korea-defense` 的首个垂直切片：根据温井地形、北侧入口和参战编成进行的实时塔防玩法改编，不宣称复原历史胜负，也不修改 `korea-tactics` 的战棋引擎。

## 视觉重设计

- [Canvas 2D 迁移与实施计划](./docs/REDESIGN_PLAN.md)
- [雪夜战术作战图设计规范](./docs/DESIGN_SPEC.md)

当前本地版本已切换 Canvas 2D；本轮加入每局 seed 变体、可见替代路线、敌人兵种克制和波次间有限准备时间，远端版本会在完整回归与 R2 workflow 成功后更新。

## 开发与验证

```bash
npm run dev:defense
npm run typecheck -w @dashjie/korea-defense
npm run test -w @dashjie/korea-defense
npm run build -w @dashjie/korea-defense
npm run test:defense
```

核心模拟在 `src/core/engine.ts`，使用 20 Hz 固定步长和带种子 RNG；Canvas 2D 只读取 `SimulationSnapshot` 做表现层渲染。每局从“公路袭扰 / 高地增援 / 夜间强袭”中选择一个可复现变体；普通模式需要根据编成补充火力，困难模式通过支路、混合编成、密集波次和更快路线增加压力。

试玩控制：点击金色部署点 → 选择单位 → 部署；部队自动攻击距离终点最近的敌人。支持暂停、1×、2×、升级和撤回。首次教学可跳过，档案写入版本化 `localStorage`，不保存中途战局。

浏览器冒烟覆盖 1366×768、844×390、390×844，检查教学、部署、升级、波次、暂停、倍速、Canvas 素材、地图选点、横屏不溢出和触控尺寸。素材加载失败时，页面显示可重试的明确提示而不是无限 loading。
