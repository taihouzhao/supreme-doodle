import type { MissionConfig } from "./schema";

/**
 * M1 云山隘口：河流把地图切成两半，唯一桥梁在中央道路。
 * 玩家必须在回合上限内占领两侧村庄，同时保住部队。
 */
export const M1_BREAKTHROUGH: MissionConfig = {
  id: "m1-breakthrough",
  name: "云山隘口",
  kind: "breakthrough",
  brief:
    "云山河谷北岸的两个村庄扼守隘口。中央是桥，两翼各有一处浅滩——联合军守不住全部三条路。占领西云山村与东云山村并守住两回合。",
  maxTurns: 14,
  map: [
    "^^..FF==FF..^^",
    "^...F.==.F...^",
    "...V..==..V...",
    "...F..==..F...",
    "~~..~~==~~..~~",
    "..FF..==..FF..",
    "....^.==.^....",
    "..F...==...F..",
    "......==......",
    "......==......",
  ],
  playerSpawns: [
    { x: 6, y: 9 },
    { x: 7, y: 9 },
    { x: 5, y: 9 },
    { x: 8, y: 9 },
    { x: 6, y: 8 },
    { x: 7, y: 8 },
    { x: 4, y: 9 },
    { x: 9, y: 9 },
  ],
  enemies: [
    { type: "rifle", x: 3, y: 2, name: "沃克前哨", exp: 170 },
    { type: "rifle", x: 10, y: 2, name: "骑一师警戒", exp: 40 },
    { type: "mg", x: 6, y: 3, name: "桥头火力点", exp: 160 },
    { type: "mortar", x: 7, y: 1, name: "史密斯迫击炮" },
    { type: "mg", x: 3, y: 1, name: "西翼掩护" },
    { type: "rifle", x: 10, y: 1, name: "东翼预备队" },
  ],
  variantSlots: [
    { index: 3, options: ["mortar", "mg"] },
    { index: 5, options: ["rifle", "mortar"] },
  ],
  waves: [
    {
      window: [3, 5],
      units: [{ type: "tank", x: 7, y: 0, name: "仁川增援" }],
    },
  ],
  objectives: [
    { id: "obj-west", name: "西云山村", kind: "capture", x: 3, y: 2, owner: "enemy" },
    { id: "obj-east", name: "东云山村", kind: "capture", x: 10, y: 2, owner: "enemy" },
  ],
  evacZone: [],
  itemDrops: [
    { x: 3, y: 6, options: ["medkit", "at_charge"] },
    { x: 10, y: 6, options: ["at_charge", "arty_support"] },
  ],
  rainChance: 0.3,
  victory: {
    requiredCaptures: 2,
    holdTurns: 2,
    minSurvivors: 3,
  },
};
