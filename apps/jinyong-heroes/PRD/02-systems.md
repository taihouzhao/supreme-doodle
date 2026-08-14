# 02 — 系统模型

派生自 `00` 第四至九节。冲突以 `00` 为准。类型实现见 `src/core/types.ts` 与 `src/event/types.ts`。

## 游戏本质

玩家行为 → 检查世界状态 → 命中事件条件 → 执行事件动作 → 新的世界状态。

剧情不得散落在 React 组件或地图渲染代码中。

## 事件

```ts
type EventDefinition = {
  id: string;
  sceneId: string;
  trigger: "ENTER" | "TALK" | "INTERACT" | "USE_ITEM" | "BATTLE_WIN" | "BATTLE_LOSE" | "PARTY_CHANGE";
  conditions: ConditionTree;
  actions: EventAction[];
  priority: number;
  repeatable: boolean;
};
```

条件须支持：物品与数量、在队/满员、道德与声望、见过某人、NPC 存活/离队、战斗完成、地点已获知、天书数量、`all` / `any` / `not`。

动作须支持：对话、Flag、物品、道德声望、开启地点、改地图物件、NPC 加入离开死亡移动、单挑/团队战、传送、改结局路线。

## 人物

可见属性：等级、生命、内力、体力、攻防轻功、医疗/用毒/解毒、拳剑刀暗器熟练度。等级上限 30；攻防轻功等上限 100；生命与内力上限 999。内力分阴、阳、调和。经验同时进入升级与当前修炼秘笈。

招募/离队/回归必须是条件树，不能简化成「做完支线即可加入」。队伍人数与离队去向按原版，不统一处理。

本切片人物表只含闭环所需 ID（主角、南贤、北丑、天宁寺敌方）。完整角色特性（段誉离队、胡斐两页刀法等）在后续天书录入，类型现在就要能表达。

## 武功

每角色固定武功格；最高十级；战斗与修炼成长；资质影响速度；内力属性与人物限定；范围随等级变；内力不足则实际等级下降；左右互搏双击；武器绑定加成。不要做成冷却技能。

本切片只需要一个可重放的单体攻击武功草稿，标 `unverified-vs-original`。

## 物品

天书、信物、钥匙地图、秘笈、医书毒经、武器护具、药品、暗器、炼药材料、银两共用 `ItemDefinition`。地图箱子必须有所有者与盗取判定（翻箱可能降道德）。

《连城诀》切片物品：`compass`（可选）、`tang_poetry`、`liancheng_book`。

## 三层地图

1. 世界大地图：地点坐标与可否进入由 Flag 控制；未获知不可传送。
2. 场景：地面/碰撞/遮挡/NPC/可交互物/事件区/传送/音效层。
3. 战斗图：独立网格、站位、强制单挑名单。

本切片场景：`home`、`nanxian_house`、`jiangnan_cave`、`beichou_house`、`tianning_temple`。坐标取自公开攻略的重建值，进 `facts/`，有原版后对照修正。
