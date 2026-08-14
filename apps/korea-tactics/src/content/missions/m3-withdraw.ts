import type { MissionConfig } from "./schema";

/**
 * M3 北撤掩护：第二次战役后战线收缩，
 * 沿公路脱离接触，护送主力北移。撤离单位完整保留。
 */
export const M3_WITHDRAW: MissionConfig = {
  id: "m3-withdraw",
  name: "北撤掩护",
  kind: "withdraw",
  brief:
    "战线收缩。沿北面公路脱离接触，护送主力进入撤离带。撤离的部队完整保留；主力若阵亡则战役失败。敌方在路侧设卡，并试图从南面咬住后卫。",
  maxTurns: 9,
  map: [
    "==============",
    "..F...==...F..",
    "....^.==.^....",
    "..~~~.==.~~~..",
    "......==......",
    "..FF..==..FF..",
    "....V.==.V....",
    "......==......",
    "..^...==...^..",
    "......==......",
  ],
  playerSpawns: [
    { x: 6, y: 7 },
    { x: 7, y: 7 },
    { x: 5, y: 7 },
    { x: 8, y: 7 },
    { x: 6, y: 8 },
    { x: 7, y: 8 },
    { x: 5, y: 8 },
    { x: 8, y: 8 },
  ],
  enemies: [
    { type: "mg", x: 4, y: 2, name: "沃克机枪", exp: 80 },
    { type: "mg", x: 9, y: 2, name: "盖伊机枪", exp: 80 },
    { type: "mg", x: 6, y: 1, name: "科洛姆机枪", exp: 40 },
    { type: "rifle", x: 7, y: 2, name: "米尔本步兵", exp: 30 },
  ],
  variantSlots: [
    { index: 3, options: ["rifle", "mg"] },
  ],
  waves: [
    {
      window: [2, 3],
      units: [
        { type: "rifle", x: 6, y: 9, name: "奥蒙德步兵", exp: 40 },
        { type: "rifle", x: 7, y: 9, name: "艾伦步兵", exp: 20 },
        { type: "mg", x: 5, y: 9, name: "哈里斯机枪", exp: 50 },
      ],
    },
  ],
  objectives: [],
  evacZone: Array.from({ length: 14 }, (_, x) => ({ x, y: 0 })),
  itemDrops: [
    { x: 5, y: 6, options: ["medkit", "at_charge"] },
    { x: 8, y: 6, options: ["medkit"] },
  ],
  rainChance: 0.35,
  victory: {
    minEvacuated: 3,
    evacuateRatio: 0.5,
    requireKeyUnit: true,
  },
};
