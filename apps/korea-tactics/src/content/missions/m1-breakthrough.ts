import type { MissionConfig } from "./schema";

/**
 * M1 云山伏击（1950.11）：志愿军第38军（军长梁兴初）在云山附近
 * 伏击美军骑兵第1师。夜战近战穿插，双方均以步兵与机枪为主。
 */
export const M1_BREAKTHROUGH: MissionConfig = {
  id: "m1-breakthrough",
  name: "云山伏击",
  kind: "breakthrough",
  brief:
    "1950年11月，第38军进至云山。骑兵第1师据守河谷两侧村落。夜色下穿插分割，夺取西云山村与东云山村并守住。此战尚无成建制炮兵与装甲配合，全凭步兵与机枪。主力阵亡则战役失败。",
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
    { type: "rifle", x: 3, y: 2, name: "米尔本步兵", exp: 50 },
    { type: "rifle", x: 10, y: 2, name: "盖章步兵", exp: 10 },
    { type: "mg", x: 6, y: 3, name: "科洛姆机枪", exp: 40 },
    { type: "rifle", x: 7, y: 1, name: "奥蒙德步兵", exp: 0 },
  ],
  variantSlots: [
    { index: 3, options: ["rifle", "mg"] },
  ],
  waves: [
    {
      window: [5, 7],
      units: [{ type: "rifle", x: 7, y: 0, name: "艾伦步兵" }],
    },
  ],
  objectives: [
    { id: "obj-west", name: "西云山村", kind: "capture", x: 3, y: 2, owner: "enemy" },
    { id: "obj-east", name: "东云山村", kind: "capture", x: 10, y: 2, owner: "enemy" },
  ],
  evacZone: [],
  itemDrops: [
    { x: 3, y: 6, options: ["medkit"] },
    { x: 10, y: 6, options: ["medkit"] },
  ],
  rainChance: 0.2,
  victory: {
    requiredCaptures: 2,
    holdTurns: 1,
    minSurvivors: 3,
  },
};
