import type { MissionConfig } from "./schema";

/**
 * M2 长津阻击（1950.11–12）：第9兵团方向在长津湖地区
 * 阻击美军陆战第1师，严寒中为主力转移争取时间。
 */
export const M2_HOLD: MissionConfig = {
  id: "m2-hold",
  name: "长津阻击",
  kind: "hold",
  brief:
    "长津湖方向，陆战第1师沿公路北进。据守西长津高地与东长津高地，在风雪中顶住轮番冲击，撑到回合结束。后期可能出现装甲威胁。",
  maxTurns: 10,
  map: [
    "......==......",
    "..F...==...F..",
    "....F.==.F....",
    "......==......",
    "..~~~.==.~~~..",
    "....^^==^^....",
    "...^VV==VV^...",
    "....^^==^^....",
    "..F...==...F..",
    "......==......",
  ],
  playerSpawns: [
    { x: 4, y: 6 },
    { x: 9, y: 6 },
    { x: 5, y: 5 },
    { x: 8, y: 5 },
    { x: 4, y: 7 },
    { x: 9, y: 7 },
    { x: 6, y: 7 },
    { x: 7, y: 7 },
  ],
  enemies: [
    { type: "rifle", x: 5, y: 1, name: "李奇微步兵", exp: 60 },
    { type: "rifle", x: 8, y: 1, name: "史密斯步兵", exp: 60 },
    { type: "mg", x: 6, y: 0, name: "利曾伯格机枪", exp: 90 },
    { type: "rifle", x: 7, y: 0, name: "费思步兵", exp: 20 },
  ],
  variantSlots: [
    { index: 0, options: ["rifle", "mg"] },
    { index: 1, options: ["rifle", "mg"] },
  ],
  waves: [
    {
      window: [3, 4],
      units: [
        { type: "rifle", x: 4, y: 0, name: "普尔勒步兵", exp: 40 },
        { type: "mg", x: 9, y: 0, name: "默里机枪", exp: 70 },
      ],
    },
    {
      window: [6, 7],
      units: [
        { type: "tank", x: 6, y: 0, name: "德里坦克" },
        { type: "rifle", x: 11, y: 0, name: "哈里斯步兵" },
      ],
    },
  ],
  objectives: [
    { id: "hold-west", name: "西长津高地", kind: "hold", x: 4, y: 6, owner: "player" },
    { id: "hold-east", name: "东长津高地", kind: "hold", x: 9, y: 6, owner: "player" },
  ],
  evacZone: [],
  itemDrops: [
    { x: 3, y: 6, options: ["medkit", "at_charge"] },
    { x: 10, y: 6, options: ["at_charge", "medkit"] },
  ],
  rainChance: 0.4,
  victory: {
    holdUntilEnd: true,
    minPostsHeld: 2,
    minSurvivors: 3,
  },
};
