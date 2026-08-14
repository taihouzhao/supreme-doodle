import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/content/balance";
import { getMission } from "../src/content/missions";
import { UNIT_TYPES, levelFromExp } from "../src/content/units";
import { canCounter, damageComponents, estimateDamage } from "../src/core/combat";
import { runEnemyPhase } from "../src/core/enemyAi";
import { applyAction, legalActions } from "../src/core/engine";
import {
  canAttack,
  coordinationAllies,
  defensiveSupportAllies,
  encirclementStatus,
  reachableTiles,
  resupplyOutcome,
  resupplyTargets,
  tileAt,
} from "../src/core/grid";
import {
  createMissionState,
  evaluateVictory,
  movementBudget,
  requiredEvacuations,
  victoryProgress,
} from "../src/core/mission";
import { performAttack, performMove, performResupply } from "../src/core/resolve";
import { deriveSeed } from "../src/core/rng";
import type { GameEvent, GameState, Unit } from "../src/core/types";
import { fullInventory, testRosterUnit } from "./helpers/roster";

function scenario(): GameState {
  const mission = getMission("m2-unsan");
  return createMissionState({
    mission,
    seed: deriveSeed(1, mission.id),
    roster: [
      testRosterUnit("r0", "试步兵", "rifle", { keyUnit: true }),
      testRosterUnit("r1", "试机枪", "mg"),
      testRosterUnit("r2", "试迫击炮", "mortar"),
      testRosterUnit("r3", "试坦克", "tank"),
    ],
    inventory: fullInventory({ medkit: 1, at_charge: 1, arty_support: 1 }),
  });
}

function put(state: GameState, unitId: string, x: number, y: number): Unit {
  const unit = state.units.find((u) => u.id === unitId)!;
  unit.x = x;
  unit.y = y;
  return unit;
}

describe("地形与移动", () => {
  it("车辆无法进入森林与河流", () => {
    const state = scenario();
    const tank = put(state, "p3", 10, 6);
    tank.mpLeft = 20;
    const tiles = reachableTiles(state, tank);
    for (const tile of tiles) {
      const terrain = tileAt(state, tile.x, tile.y);
      expect(terrain.vehiclePassable).toBe(true);
    }
  });

  it("疲劳会削减移动力", () => {
    const state = scenario();
    const unit = state.units.find((u) => u.id === "p0")!;
    const fresh = movementBudget(unit, "clear");
    unit.fatigue = BALANCE.fatigue.max;
    expect(movementBudget(unit, "clear")).toBeLessThan(fresh);
  });

  it("雨天进一步削减移动力", () => {
    const state = scenario();
    const unit = state.units.find((u) => u.id === "p0")!;
    expect(movementBudget(unit, "rain")).toBeLessThan(movementBudget(unit, "clear"));
  });

  it("从多支敌军控制区脱离会额外消耗移动力", () => {
    const state = scenario();
    state.tiles = state.tiles.map(() => "plain");
    const player = put(state, "p0", 6, 6);
    player.mpLeft = 8;
    put(state, "e0", 6, 5);
    put(state, "e1", 5, 6);
    const exit = reachableTiles(state, player).find((tile) => tile.x === 7 && tile.y === 6);
    expect(exit?.cost).toBe(4); // 平地 2 + 两面接敌脱离 2
  });
});

describe("射程", () => {
  it("迫击炮有最小射程，贴身无法开火", () => {
    const state = scenario();
    const mortar = put(state, "p2", 6, 5);
    const enemy = put(state, "e0", 6, 4);
    expect(canAttack(state, mortar, enemy)).toBe(false);
    put(state, "e0", 6, 3);
    expect(canAttack(state, mortar, enemy)).toBe(true);
  });

  it("迫击炮最大射程为 3，不再覆盖远距离", () => {
    const state = scenario();
    const mortar = put(state, "p2", 6, 5);
    const enemy = put(state, "e0", 6, 1);
    expect(canAttack(state, mortar, enemy)).toBe(false);
    put(state, "e0", 6, 2);
    expect(canAttack(state, mortar, enemy)).toBe(true);
  });

  it("炮兵极慢且有最小射程，后勤不能进攻", () => {
    const state = scenario();
    const arty = put(state, "p0", 2, 5);
    arty.type = "artillery";
    arty.weapon = "type75";
    const near = put(state, "e0", 4, 5);
    expect(canAttack(state, arty, near)).toBe(false);
    put(state, "e0", 7, 5);
    expect(canAttack(state, arty, near)).toBe(true);

    const logistics = put(state, "p1", 3, 5);
    logistics.type = "logistics";
    logistics.weapon = "supply_cart";
    expect(canAttack(state, logistics, near)).toBe(false);
  });

  it("高地为站立单位提供额外射程", () => {
    const state = scenario();
    const hillIndex = state.tiles.findIndex((terrain) => terrain === "hill");
    const hill = { x: hillIndex % state.width, y: Math.floor(hillIndex / state.width) };
    const mg = put(state, "p1", hill.x, hill.y);
    expect(tileAt(state, hill.x, hill.y).rangeBonus).toBe(1);
    const enemy = put(state, "e0", hill.x, Math.min(state.height - 1, hill.y + 3));
    expect(canAttack(state, mg, enemy)).toBe(true);
  });
});

describe("后勤补充", () => {
  it("邻接伤员可补充生命并降低疲劳", () => {
    const state = scenario();
    const logistics = put(state, "p1", 5, 5);
    logistics.type = "logistics";
    logistics.weapon = "supply_cart";
    const ally = put(state, "p0", 5, 6);
    ally.hp = 40;
    ally.fatigue = 30;
    expect(resupplyTargets(state, logistics).map((u) => u.id)).toContain(ally.id);
    expect(resupplyOutcome(state, logistics, ally)).toMatchObject({
      personnel: 28,
      fatigueRelief: 18,
      targetHpAfter: 68,
      sourceHpAfter: logistics.hp - 28,
    });
    const events: GameEvent[] = [];
    expect(performResupply(state, logistics, ally, events)).toBe(true);
    expect(ally.hp).toBe(68);
    expect(ally.fatigue).toBe(12);
    expect(logistics.hasActed).toBe(true);
    expect(events.some((e) => e.type === "resupplied")).toBe(true);
  });

  it("满员无疲劳的邻接友军不在补给列表中", () => {
    const state = scenario();
    const logistics = put(state, "p1", 5, 5);
    logistics.type = "logistics";
    logistics.weapon = "supply_cart";
    const ally = put(state, "p0", 5, 6);
    ally.hp = ally.maxHp;
    ally.fatigue = 0;
    expect(resupplyTargets(state, logistics)).toHaveLength(0);
  });
});

describe("战斗", () => {
  it("反击射程与武器增程和最小射程使用同一套核心规则", () => {
    const state = scenario();
    const attacker = put(state, "p0", 6, 6);
    const defender = put(state, "e0", 6, 3);
    defender.type = "mg";
    defender.weapon = "bren";
    expect(canCounter(state, attacker, defender)).toBe(false);
    defender.weapon = "dp28";
    expect(canCounter(state, attacker, defender)).toBe(true);
  });

  it("远程兵种不会自动反击，只有步兵与机枪回射", () => {
    const state = scenario();
    const attacker = put(state, "p0", 6, 6);
    const defender = put(state, "e0", 6, 5);
    for (const type of ["mortar", "artillery", "tank"] as const) {
      defender.type = type;
      defender.weapon = type === "mortar" ? "mortar60" : type === "artillery" ? "type75" : "sherman";
      expect(canCounter(state, attacker, defender)).toBe(false);
    }
    defender.type = "rifle";
    defender.weapon = "m1_garand";
    expect(canCounter(state, attacker, defender)).toBe(true);
  });

  it("抖动被限制在窄区间内，没有暴击", () => {
    const state = scenario();
    const attacker = put(state, "p0", 6, 6);
    const defender = put(state, "e0", 6, 5);
    const low = damageComponents(state, attacker, defender, BALANCE.jitter.min).total;
    const high = damageComponents(state, attacker, defender, BALANCE.jitter.max).total;
    expect(high / low).toBeLessThan(1.25);
  });

  it("兵种克制生效：机枪打步兵强，打坦克弱", () => {
    const state = scenario();
    const mg = put(state, "p1", 6, 6);
    const infantry = put(state, "e0", 6, 5);
    const vsInfantry = estimateDamage(state, mg, infantry);
    infantry.type = "tank";
    infantry.maxHp = UNIT_TYPES.tank.maxHp;
    const vsTank = estimateDamage(state, mg, infantry);
    expect(vsTank).toBeLessThan(vsInfantry * 0.5);
  });

  it("将领武力提升伤害", () => {
    const state = scenario();
    const attacker = put(state, "p0", 6, 6);
    const defender = put(state, "e0", 6, 5);
    const base = estimateDamage(state, attacker, defender);
    attacker.stats.might += 30;
    expect(estimateDamage(state, attacker, defender)).toBeGreaterThan(base);
  });

  it("等级随经验提升", () => {
    expect(levelFromExp(0)).toBe(1);
    expect(levelFromExp(500)).toBeGreaterThan(1);
  });

  it("多单位火力呼应与相互掩护进入伤害分解", () => {
    const state = scenario();
    const attacker = put(state, "p0", 6, 6);
    const defender = put(state, "e0", 6, 5);
    const coveringAttacker = put(state, "p1", 5, 5);
    const coveringDefender = put(state, "e1", 5, 5);
    expect(coordinationAllies(state, attacker, defender)).toBeGreaterThan(0);
    expect(defensiveSupportAllies(state, defender, attacker)).toBeGreaterThan(0);

    const breakdown = damageComponents(state, attacker, defender, 1);
    expect(breakdown.coordination).toBeGreaterThan(1);
    expect(breakdown.defensiveSupport).toBeLessThan(1);
    coveringAttacker.alive = false;
    coveringDefender.alive = false;
  });

  it("对向封锁会形成可解释的包围加成", () => {
    const state = scenario();
    state.tiles = state.tiles.map(() => "plain");
    const attacker = put(state, "p0", 6, 6);
    const defender = put(state, "e0", 6, 5);
    put(state, "p1", 6, 4);
    const surround = encirclementStatus(state, defender, "player", attacker);
    expect(surround.encircled).toBe(true);
    expect(surround.opposedAxis).toBe(true);
    expect(damageComponents(state, attacker, defender, 1).encirclement).toBeGreaterThan(1);
  });
});

describe("联合军协同 AI", () => {
  it("同一敌方阶段会优先集火受创目标", () => {
    const state = scenario();
    state.tiles = state.tiles.map(() => "plain");
    state.objectives = [];
    state.phase = "enemy";
    const wounded = put(state, "p0", 6, 5);
    wounded.hp = Math.max(12, Math.round(wounded.maxHp * 0.22));
    const healthy = put(state, "p1", 7, 5);
    healthy.hp = healthy.maxHp;
    const first = put(state, "e0", 6, 6);
    const second = put(state, "e1", 5, 5);
    first.mpLeft = 0;
    second.mpLeft = 0;
    first.hasActed = false;
    second.hasActed = false;
    state.units = [wounded, healthy, first, second];
    const events: GameEvent[] = [];
    runEnemyPhase(state, events);
    const attacks = events.filter((event): event is Extract<GameEvent, { type: "attacked" }> => event.type === "attacked");
    expect(attacks[0]?.defenderId).toBe(wounded.id);
  });
});

describe("规则动作", () => {
  it("结束回合会切换到敌方阶段或推进回合", () => {
    const state = scenario();
    const before = state.turn;
    const next = applyAction(state, { kind: "endTurn" }).state;
    expect(next.phase === "enemy" || next.turn > before || next.status !== "playing").toBe(true);
  });

  it("撤离要求会按出战人数缩放", () => {
    const state = scenario();
    state.deployedCount = 4;
    expect(requiredEvacuations(state, { evacuateRatio: 0.5, minEvacuated: 3 })).toBe(3);
  });

  it("合法动作列表不为空", () => {
    const state = scenario();
    expect(legalActions(state).length).toBeGreaterThan(0);
  });
});

describe("战场地标", () => {
  it("部队抵达地标时解锁战地注记并写入统计", () => {
    const state = scenario();
    state.tiles = state.tiles.map(() => "plain");
    const place = state.places.find((entry) => entry.id === "chongchon-tributary")!;
    const player = put(state, "p0", place.x - 1, place.y);
    player.mpLeft = 10;
    state.units = [player];
    const events: GameEvent[] = [];
    expect(performMove(state, player, place, events)).toBe(true);
    expect(state.discoveredPlaceIds).toContain(place.id);
    expect(state.stats.landmarksDiscovered).toBe(1);
    expect(events.some((event) => event.type === "landmarkDiscovered")).toBe(true);
  });
});

describe("击溃后的站位", () => {
  it("打掉紧贴的敌人后仍留在原开火格", () => {
    const state = scenario();
    const attacker = put(state, "p0", 6, 6);
    const defender = put(state, "e0", 6, 5);
    defender.hp = 1;
    const events: GameEvent[] = [];
    expect(performAttack(state, attacker, defender, events)).toBe(true);
    expect(defender.alive).toBe(false);
    expect({ x: attacker.x, y: attacker.y }).toEqual({ x: 6, y: 6 });
    expect(events.some((e) => e.type === "moved")).toBe(false);
  });

  it("远距离击溃不会推进", () => {
    const state = scenario();
    const attacker = put(state, "p2", 6, 7);
    const defender = put(state, "e0", 6, 5);
    defender.hp = 1;
    const events: GameEvent[] = [];
    expect(performAttack(state, attacker, defender, events)).toBe(true);
    expect(defender.alive).toBe(false);
    expect({ x: attacker.x, y: attacker.y }).toEqual({ x: 6, y: 7 });
    expect(events.some((e) => e.type === "moved")).toBe(false);
  });

  it("目标格不可通行时留在原地", () => {
    const state = scenario();
    state.tiles = state.tiles.map(() => "plain");
    const attacker = put(state, "p3", 6, 6);
    const defender = put(state, "e0", 6, 5);
    state.tiles[5 * state.width + 6] = "forest";
    defender.hp = 1;
    const events: GameEvent[] = [];
    expect(performAttack(state, attacker, defender, events)).toBe(true);
    expect(defender.alive).toBe(false);
    expect({ x: attacker.x, y: attacker.y }).toEqual({ x: 6, y: 6 });
  });

  it("击溃奖励经验，并在随机命中时收容少量俘虏", () => {
    const base = scenario();
    const attacker = put(base, "p0", 6, 6);
    const defender = put(base, "e0", 6, 5);
    defender.hp = 1;
    const logistics = put(base, "p1", 6, 7);
    logistics.type = "logistics";
    logistics.weapon = "supply_cart";
    logistics.hp = 1;
    const expBefore = attacker.exp;
    let captured = false;
    for (let rng = 0; rng < 512 && !captured; rng += 1) {
      const state = structuredClone(base);
      state.rng = rng;
      const events: GameEvent[] = [];
      const trialAttacker = state.units.find((unit) => unit.id === attacker.id)!;
      const trialDefender = state.units.find((unit) => unit.id === defender.id)!;
      performAttack(state, trialAttacker, trialDefender, events);
      captured = events.some((event) => event.type === "prisonersCaptured");
      if (captured) {
        expect(trialAttacker.exp).toBeGreaterThan(expBefore);
        expect(state.stats.prisonersCaptured).toBeGreaterThan(0);
        // 俘虏只转为情报与战功记录；己方兵员仍必须通过后勤转移补充。
        expect(state.units.find((unit) => unit.id === logistics.id)!.hp).toBe(1);
      }
    }
    expect(captured).toBe(true);
  });
});

describe("胜利判定", () => {
  function ownAll(state: GameState): void {
    for (const objective of state.objectives) objective.owner = "player";
  }

  it("单回合要求的关卡，占领当场即判定胜利", () => {
    const state = scenario();
    const rule = getMission("m2-unsan").victory;
    expect(rule.holdTurns ?? 1).toBe(1);
    ownAll(state);
    const verdict = evaluateVictory(state, rule, false);
    expect(verdict.status).toBe("won");
    expect(victoryProgress(state, rule).blocking).toBeNull();
  });

  it("需要连续坚守的关卡，占领后仍要顶住一个回合", () => {
    const mission = getMission("m5-third-offensive");
    const state = createMissionState({
      mission,
      seed: deriveSeed(1, mission.id),
      roster: [
        testRosterUnit("r0", "试步兵", "rifle", { keyUnit: true }),
        testRosterUnit("r1", "试机枪", "mg"),
        testRosterUnit("r2", "试迫击炮", "mortar"),
      ],
      inventory: fullInventory(),
    });
    ownAll(state);
    state.captureStreak = 0;
    expect(evaluateVictory(state, mission.victory, true).status).toBe("playing");
    expect(victoryProgress(state, mission.victory).blocking).toContain("坚守");
    state.captureStreak = mission.victory.holdTurns ?? 2;
    expect(evaluateVictory(state, mission.victory, true).status).toBe("won");
  });

  it("存活不足时说明原因而不是静默继续", () => {
    const state = scenario();
    const rule = getMission("m2-unsan").victory;
    ownAll(state);
    const players = state.units.filter((u) => u.faction === "player");
    for (const unit of players.slice(1)) unit.alive = false;
    expect(evaluateVictory(state, rule, true).status).toBe("playing");
    expect(victoryProgress(state, rule).blocking).toContain("存活不足");
  });

  it("阻击关会给出坚守回合进度", () => {
    const mission = getMission("m10-triangle-hill");
    const state = createMissionState({
      mission,
      seed: deriveSeed(2, mission.id),
      roster: [
        testRosterUnit("r0", "试步兵", "rifle", { keyUnit: true }),
        testRosterUnit("r1", "试机枪", "mg"),
      ],
      inventory: fullInventory(),
    });
    for (const objective of state.objectives) objective.owner = "player";
    const progress = victoryProgress(state, mission.victory);
    expect(progress.coreMet).toBe(true);
    expect(progress.blocking).toContain("坚守");
  });
});
