# 决战朝鲜：塔防 · 温井防御战

这是 `@dashjie/korea-defense` 的首个垂直切片：根据温井地形、北侧入口和参战编成进行的实时塔防玩法改编，不宣称复原历史胜负，也不修改 `korea-tactics` 的战棋引擎。

## 开发与验证

```bash
npm run dev:defense
npm run typecheck -w @dashjie/korea-defense
npm run test -w @dashjie/korea-defense
npm run build -w @dashjie/korea-defense
npm run test:defense
```

核心模拟在 `src/core/engine.ts`，使用 20 Hz 固定步长和带种子 RNG；Three.js 只读取 `SimulationSnapshot` 做插值与渲染。普通模式按一套可复现的四点布局约 8–12 分钟完成，困难模式通过支路、混合编成、密集波次和更快路线增加压力。

试玩控制：点击金色部署点 → 选择单位 → 部署；部队自动攻击距离终点最近的敌人。支持暂停、1×、2×、升级和撤回。首次教学可跳过，档案写入版本化 `localStorage`，不保存中途战局。

浏览器冒烟覆盖 1366×768、844×390、390×844，检查教学、部署、升级、波次、暂停、倍速、横屏不溢出和触控尺寸。WebGL 2 创建失败时，页面显示明确的降级提示而不是空白画布。
