import type { DefenseMissionConfig, DefenseVariant, EnemyDefinition, TowerDefinition, TowerType } from "../core/types";

export const DEFENSE_VARIANT_LABELS: Record<DefenseVariant, { name: string; description: string }> = {
  "road-raids": { name: "公路袭扰", description: "突击小组会从长直公路切入，迫使机枪与步兵分担拦截。" },
  "ridge-relief": { name: "高地增援", description: "重装纵队更早抵达，迫击炮的范围火力成为关键。" },
  "night-attack": { name: "夜间强袭", description: "敌军间隔更短，入口会出现连续混合编队。" },
};

export function defenseVariantFromSeed(seed: number): DefenseVariant {
  return (["road-raids", "ridge-relief", "night-attack"] as const)[Math.abs(seed | 0) % 3] ?? "road-raids";
}

export const TOWER_DEFINITIONS: Record<TowerType, TowerDefinition> = {
  infantry: {
    type: "infantry",
    name: "步兵班",
    shortName: "步兵",
    cost: 40,
    range: 5,
    damage: 8,
    shotsPerSecond: 2,
    description: "可靠的近中程火力，优先压制最接近温井的敌军。",
    icon: "/assets/roles/rifle.svg",
  },
  machineGun: {
    type: "machineGun",
    name: "机枪阵地",
    shortName: "机枪",
    cost: 60,
    range: 6,
    damage: 5,
    shotsPerSecond: 5,
    description: "射速高、持续压制强，适合覆盖公路长直段。",
    icon: "/assets/roles/mg.svg",
  },
  mortar: {
    type: "mortar",
    name: "迫击炮组",
    shortName: "迫击炮",
    cost: 80,
    range: 9,
    minRange: 3,
    damage: 28,
    shotsPerSecond: 0.6,
    splashRadius: 2,
    description: "曲射范围火力，不能攻击近身目标；落点周围敌军同时受击。",
    icon: "/assets/roles/mortar.svg",
  },
};

export const ENEMY_DEFINITIONS: Record<string, EnemyDefinition> = {
  rifle: { type: "rifle", name: "步兵连", hp: 42, speed: 1.45, leakDamage: 10, reward: 3, radius: 0.23, color: 0xd66a56 },
  runner: { type: "runner", name: "突击小组", hp: 28, speed: 2.5, leakDamage: 10, reward: 5, radius: 0.2, color: 0xe1b65a, damageTakenMultiplier: { infantry: 1.08, machineGun: 1.18, mortar: 0.9 } },
  heavy: { type: "heavy", name: "重装步兵", hp: 105, speed: 0.82, leakDamage: 15, reward: 8, radius: 0.3, color: 0xbd4a45, damageTakenMultiplier: { infantry: 0.88, machineGun: 0.72, mortar: 1.12 } },
  armored: { type: "armored", name: "装甲车", hp: 250, speed: 0.48, leakDamage: 20, reward: 12, radius: 0.38, color: 0xa7384e, damageTakenMultiplier: { infantry: 0.42, machineGun: 0.3, mortar: 1.2 } },
};

const WIDTH = 22;
const HEIGHT = 14;
const path = [
  { x: 10, y: -0.5 },
  { x: 10, y: 1.5 },
  { x: 8, y: 3.5 },
  { x: 8, y: 5.5 },
  { x: 12, y: 7.5 },
  { x: 12, y: 9.5 },
  { x: 15, y: 11.5 },
  { x: 15, y: 14.5 },
];

const alternatePath = [
  { x: 10, y: -0.5 },
  { x: 10, y: 1.5 },
  { x: 8, y: 3.5 },
  { x: 8, y: 5.5 },
  { x: 12, y: 7.5 },
  { x: 16, y: 7.5 },
  { x: 18, y: 9.5 },
  { x: 18, y: 12 },
  { x: 15, y: 14.5 },
];

function terrainGrid(): DefenseMissionConfig["terrain"] {
  const result: DefenseMissionConfig["terrain"] = [];
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const road = x === 10 || (y >= 3 && y <= 5 && x >= 8 && x <= 10) || (y >= 6 && y <= 9 && x >= 10 && x <= 12) || (y >= 10 && x >= 13 && x <= 15);
      const river = y === 6 && x < 8;
      const forest = (x < 5 && y % 3 !== 1) || (x > 17 && y % 4 !== 2) || (x >= 6 && x <= 8 && y >= 8);
      const hill = (x < 3 && y >= 8) || (x > 18 && y <= 5) || (x >= 16 && y >= 8);
      result.push(road ? "road" : river ? "river" : forest ? "forest" : hill ? "hill" : "plain");
    }
  }
  result[13 * WIDTH + 15] = "command";
  return result;
}

const waves: DefenseMissionConfig["waves"] = [
  { number: 1, label: "北线侦察", intermissionSeconds: 10, spawns: [{ type: "rifle", count: 7, intervalSeconds: 2.2 }] },
  { number: 2, label: "迫近公路", intermissionSeconds: 12, spawns: [{ type: "rifle", count: 8, intervalSeconds: 1.9 }, { type: "runner", count: 3, intervalSeconds: 1.8, startDelaySeconds: 4 }] },
  { number: 3, label: "夜袭纵队", intermissionSeconds: 14, spawns: [{ type: "runner", count: 7, intervalSeconds: 1.5 }, { type: "heavy", count: 3, intervalSeconds: 3, startDelaySeconds: 5 }] },
  { number: 4, label: "重装压境", intermissionSeconds: 15, spawns: [{ type: "rifle", count: 10, intervalSeconds: 1.5 }, { type: "heavy", count: 5, intervalSeconds: 2.7, startDelaySeconds: 3 }] },
  { number: 5, label: "混合突击", intermissionSeconds: 18, spawns: [{ type: "runner", count: 9, intervalSeconds: 1.2 }, { type: "heavy", count: 6, intervalSeconds: 2.1, startDelaySeconds: 3 }, { type: "armored", count: 1, intervalSeconds: 1, startDelaySeconds: 10 }] },
  { number: 6, label: "温井决战", intermissionSeconds: 0, spawns: [{ type: "rifle", count: 12, intervalSeconds: 1.25 }, { type: "runner", count: 8, intervalSeconds: 1.1, startDelaySeconds: 2 }, { type: "heavy", count: 8, intervalSeconds: 1.9, startDelaySeconds: 4 }, { type: "armored", count: 2, intervalSeconds: 1.2, startDelaySeconds: 13 }] },
];

export const WONJEONG_MISSION: DefenseMissionConfig = {
  id: "wonjeong-defense",
  name: "温井防御战",
  subtitle: "1950 年 11 月 · 北线公路",
  historicalNote: "玩法根据温井地形、北侧入口和参战编成改编为固定路线塔防；不是历史胜负复原。",
  width: WIDTH,
  height: HEIGHT,
  terrain: terrainGrid(),
  path,
  alternatePath,
  commandPost: { x: 15, y: 13 },
  buildNodes: [
    { id: "ridge-west", x: 5, y: 3, label: "西岭" },
    { id: "ridge-east", x: 15, y: 3, label: "东岭" },
    { id: "forest-west", x: 5, y: 7, label: "西侧林缘" },
    { id: "road-west", x: 6, y: 9, label: "公路西侧" },
    { id: "road-east", x: 16, y: 7, label: "公路东侧" },
    { id: "hill-east", x: 19, y: 9, label: "东高地" },
    { id: "last-stand", x: 18, y: 12, label: "最后防线" },
  ],
  waves: [...waves],
  hardModifier: {
    spawnIntervalMultiplier: 0.22,
    spawnCountMultiplier: 1.8,
    routeSpeedMultiplier: 1.2,
    extraBranch: [{ x: 18, y: 7 }, { x: 18, y: 10 }, { x: 15, y: 12 }, { x: 15, y: 14.5 }],
  },
};

export const TOWER_TYPES: TowerType[] = ["infantry", "machineGun", "mortar"];
