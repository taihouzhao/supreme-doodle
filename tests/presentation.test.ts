import { describe, expect, it } from "vitest";
import { clipsFromEvents } from "../src/ui/presentation";
import type { DamageBreakdown, GameEvent, GameState, Unit } from "../src/core/types";
import { fullInventory } from "./helpers/roster";

function blankBreakdown(total = 20): DamageBreakdown {
  return {
    base: total,
    matchup: 1,
    veterancy: 1,
    commander: 1,
    weapon: 1,
    fatigue: 1,
    flank: 1,
    terrain: 1,
    defenderVeterancy: 1,
    keyGuard: 1,
    weather: 1,
    setup: 1,
    highGround: 1,
    scripted: 1,
    jitter: 1,
    total,
  };
}

function unit(
  partial: Partial<Unit> & Pick<Unit, "id" | "faction" | "x" | "y" | "hp" | "alive">,
): Unit {
  return {
    rosterId: null,
    name: partial.id,
    type: "rifle",
    maxHp: 100,
    mpLeft: 0,
    exp: 0,
    level: 1,
    rank: "列兵",
    commanderKind: "companion",
    commanderName: partial.id,
    stats: { leadership: 1, intellect: 1, might: 1, stamina: 1, agility: 1 },
    weapon: "zhongzheng",
    equipment: "步枪",
    fatigue: 0,
    hasActed: true,
    movedThisTurn: false,
    evacuated: false,
    keyUnit: false,
    ...partial,
  };
}

function stateWith(units: Unit[]): GameState {
  return {
    missionId: "m1-onjong",
    missionKind: "breakthrough",
    seed: 1,
    turn: 1,
    maxTurns: 10,
    phase: "enemy",
    status: "playing",
    width: 14,
    height: 10,
    tiles: Array.from({ length: 140 }, () => "plain" as const),
    units,
    objectives: [],
    evacZone: [],
    fieldItems: [],
    fieldWeapons: [],
    inventory: fullInventory(),
    pendingWeapons: [],
    weather: "clear",
    pending: [],
    places: [],
    scripted: [],
    resultReason: "",
    rng: 1,
    stats: {
      playerRouted: 0,
      enemyRouted: 1,
      playerEvacuated: 0,
      damageDealt: 40,
      damageTaken: 0,
    },
    captureStreak: 0,
    deployedCount: 4,
  };
}

describe("clipsFromEvents 交战时间线", () => {
  it("集火同一目标时，只有最后一击标记溃散，前几击只掉血", () => {
    // 终局状态：目标已死、攻方已推进——这正是旧 bug 的诱因
    const state = stateWith([
      unit({ id: "a1", faction: "enemy", x: 5, y: 5, hp: 80, alive: true }),
      unit({ id: "a2", faction: "enemy", x: 5, y: 4, hp: 80, alive: true }),
      unit({ id: "t0", faction: "player", x: 5, y: 5, hp: 0, alive: false }),
    ]);

    const events: GameEvent[] = [
      {
        type: "attacked",
        attackerId: "a1",
        defenderId: "t0",
        damage: 30,
        counterDamage: 0,
        breakdown: blankBreakdown(30),
        defenderHpFrom: 60,
        defenderHpTo: 30,
        attackerHpFrom: 80,
        attackerHpTo: 80,
        defenderRouted: false,
        attackerRouted: false,
        attackerFrom: { x: 4, y: 5 },
        defenderFrom: { x: 5, y: 5 },
      },
      {
        type: "attacked",
        attackerId: "a2",
        defenderId: "t0",
        damage: 30,
        counterDamage: 0,
        breakdown: blankBreakdown(30),
        defenderHpFrom: 30,
        defenderHpTo: 0,
        attackerHpFrom: 80,
        attackerHpTo: 80,
        defenderRouted: true,
        attackerRouted: false,
        attackerFrom: { x: 5, y: 4 },
        defenderFrom: { x: 5, y: 5 },
      },
      { type: "routed", unitId: "t0", faction: "player" },
      {
        type: "moved",
        unitId: "a2",
        from: { x: 5, y: 4 },
        to: { x: 5, y: 5 },
        cost: 0,
      },
    ];

    const clips = clipsFromEvents(state, events);
    const attacks = clips.filter((c) => c.kind === "attack");
    expect(attacks).toHaveLength(2);
    expect(attacks[0]).toMatchObject({
      defenderDies: false,
      defenderHpFrom: 60,
      defenderHpTo: 30,
      attackerFrom: { x: 4, y: 5 },
    });
    expect(attacks[1]).toMatchObject({
      defenderDies: true,
      defenderHpFrom: 30,
      defenderHpTo: 0,
      attackerFrom: { x: 5, y: 4 },
    });
    expect(clips.map((c) => c.kind)).toEqual(["attack", "attack", "move"]);
  });

  it("晋升片段排在对应攻击之后", () => {
    const state = stateWith([
      unit({
        id: "p0",
        faction: "player",
        x: 3,
        y: 3,
        hp: 90,
        alive: true,
        rank: "下士",
        level: 2,
      }),
      unit({ id: "e0", faction: "enemy", x: 3, y: 4, hp: 0, alive: false }),
    ]);
    const events: GameEvent[] = [
      {
        type: "attacked",
        attackerId: "p0",
        defenderId: "e0",
        damage: 40,
        counterDamage: 0,
        breakdown: blankBreakdown(40),
        defenderHpFrom: 40,
        defenderHpTo: 0,
        attackerHpFrom: 90,
        attackerHpTo: 90,
        defenderRouted: true,
        attackerRouted: false,
        attackerFrom: { x: 3, y: 3 },
        defenderFrom: { x: 3, y: 4 },
      },
      { type: "levelUp", unitId: "p0", from: 1, to: 2, rank: "下士" },
      { type: "routed", unitId: "e0", faction: "enemy" },
    ];
    const clips = clipsFromEvents(state, events);
    expect(clips.map((c) => c.kind)).toEqual(["attack", "promote"]);
  });
});
