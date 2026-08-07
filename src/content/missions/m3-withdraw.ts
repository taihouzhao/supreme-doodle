import type { MissionConfig } from "./schema";

/**
 * M3 主力后撤：北面公路是唯一撤离通道，敌军已在中途设卡并从背后追击。
 * 撤离的单位 100% 保留，被击溃的单位则可能永久损失——这一关是整个切片的验证焦点。
 */
export const M3_WITHDRAW: MissionConfig = {
  id: "m3-withdraw",
  name: "北撤通道",
  kind: "withdraw",
  brief:
    "沿北面公路撤出战场。抵达撤离带的部队完整保留；主力必须撤出。留在战场上的会付出代价。",
  maxTurns: 8,
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
    { type: "mg", x: 4, y: 2, name: "麦克阿瑟路障", exp: 70 },
    { type: "mg", x: 9, y: 2, name: "骑一师卡口", exp: 70 },
    { type: "rifle", x: 6, y: 3, name: "封锁步兵" },
  ],
  variantSlots: [
    { index: 2, options: ["rifle", "mortar"] },
  ],
  waves: [
    {
      window: [2, 3],
      units: [
        { type: "tank", x: 6, y: 9, name: "追击装甲" },
        { type: "rifle", x: 7, y: 9, name: "追击步兵" },
      ],
    },
  ],
  objectives: [],
  evacZone: Array.from({ length: 14 }, (_, x) => ({ x, y: 0 })),
  itemDrops: [
    { x: 5, y: 6, options: ["medkit", "at_charge"] },
    { x: 8, y: 6, options: ["at_charge", "arty_support"] },
  ],
  rainChance: 0.25,
  victory: {
    minEvacuated: 3,
    evacuateRatio: 0.6,
    requireKeyUnit: true,
  },
};
