import type { MissionConfig } from "./schema";

/**
 * M2 高地阻击：玩家据守中央高地与村庄，敌军分三波从北面压下来。
 * 坚守到回合结束即可，不需要歼灭。
 */
export const M2_HOLD: MissionConfig = {
  id: "m2-hold",
  name: "高地阻击",
  kind: "hold",
  brief: "敌军将从北面反扑。守住中央的两个村庄据点，撑到增援抵达。",
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
    { type: "rifle", x: 5, y: 1, name: "先头步兵" },
    { type: "rifle", x: 8, y: 1, name: "先头步兵" },
    { type: "mg", x: 6, y: 0, name: "支援火力" },
    { type: "mortar", x: 7, y: 0, name: "迫击炮组" },
  ],
  variantSlots: [
    { index: 0, options: ["rifle", "mg"] },
    { index: 1, options: ["rifle", "mortar"] },
  ],
  waves: [
    {
      window: [3, 4],
      units: [
        { type: "rifle", x: 4, y: 0, name: "第二波步兵" },
        { type: "rifle", x: 9, y: 0, name: "第二波步兵" },
        { type: "mg", x: 2, y: 0, name: "第二波火力", exp: 110 },
      ],
    },
    {
      window: [6, 7],
      units: [
        { type: "tank", x: 6, y: 0, name: "突击装甲" },
        { type: "rifle", x: 11, y: 0, name: "第三波步兵" },
      ],
    },
  ],
  objectives: [
    { id: "hold-west", kind: "hold", x: 4, y: 6, owner: "player" },
    { id: "hold-east", kind: "hold", x: 9, y: 6, owner: "player" },
  ],
  evacZone: [],
  itemDrops: [
    { x: 3, y: 6, options: ["medkit", "arty_support"] },
    { x: 10, y: 6, options: ["at_charge", "medkit"] },
  ],
  rainChance: 0.35,
  victory: {
    holdUntilEnd: true,
    minPostsHeld: 2,
    minSurvivors: 4,
  },
};
