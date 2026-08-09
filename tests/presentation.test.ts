import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  clipsFromEvents,
  projectStickyAfterClips,
} from "../src/ui/presentation";
import type { DamageBreakdown, GameEvent, GameState, Unit } from "../src/core/types";
import { fullInventory } from "./helpers/roster";

function blankBreakdown(total = 20): DamageBreakdown {
  return {
    base: total,
    matchup: 1,
    level: 1,
    commander: 1,
    weapon: 1,
    fatigue: 1,
    flank: 1,
    terrain: 1,
    defenderLevel: 1,
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
    supplyPoints: [],
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

describe("buildTimeline 交战时间线", () => {
  it("集火同一目标时，只有最后一击标记溃散，前几击只掉血", () => {
    const prev = stateWith([
      unit({ id: "a1", faction: "enemy", x: 4, y: 5, hp: 80, alive: true }),
      unit({ id: "a2", faction: "enemy", x: 5, y: 4, hp: 80, alive: true }),
      unit({ id: "t0", faction: "player", x: 5, y: 5, hp: 60, alive: true }),
    ]);
    // 终局：目标已死、a2 已推进到目标格
    const final = stateWith([
      unit({ id: "a1", faction: "enemy", x: 4, y: 5, hp: 80, alive: true }),
      unit({ id: "a2", faction: "enemy", x: 5, y: 5, hp: 80, alive: true }),
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
        path: [
          { x: 5, y: 4 },
          { x: 5, y: 5 },
        ],
      },
    ];

    const { clips, seed } = buildTimeline(prev, events);
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

    // 第一击结束后：目标仍在场、血量 30，a2 仍在开火格（尚未推进）
    const afterFirst = projectStickyAfterClips(seed, clips.slice(0, 1));
    expect(afterFirst.hp.t0).toBe(30);
    expect(afterFirst.present.t0).toBe(true);
    expect(afterFirst.positions.a2).toEqual({ x: 5, y: 4 });

    // 第二击结束后、推进前：目标已溃散，a2 仍钉在开火格
    const afterKill = projectStickyAfterClips(seed, clips.slice(0, 2));
    expect(afterKill.hp.t0).toBe(0);
    expect(afterKill.present.t0).toBe(false);
    expect(afterKill.positions.a2).toEqual({ x: 5, y: 4 });

    // 推进后才到终局格
    const afterAdvance = projectStickyAfterClips(seed, clips);
    expect(afterAdvance.positions.a2).toEqual({ x: 5, y: 5 });
    // 终局状态不得反向污染中间帧断言
    expect(final.units.find((u) => u.id === "a2")!.x).toBe(5);
  });

  it("多单位先后移动时，后动者不提前出现在终局格", () => {
    const prev = stateWith([
      unit({ id: "a", faction: "enemy", x: 1, y: 1, hp: 80, alive: true }),
      unit({ id: "b", faction: "enemy", x: 8, y: 8, hp: 80, alive: true }),
      unit({ id: "t", faction: "player", x: 3, y: 1, hp: 50, alive: true }),
    ]);
    const events: GameEvent[] = [
      {
        type: "moved",
        unitId: "a",
        from: { x: 1, y: 1 },
        to: { x: 2, y: 1 },
        cost: 2,
        path: [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
      },
      {
        type: "attacked",
        attackerId: "a",
        defenderId: "t",
        damage: 20,
        counterDamage: 0,
        breakdown: blankBreakdown(20),
        defenderHpFrom: 50,
        defenderHpTo: 30,
        attackerHpFrom: 80,
        attackerHpTo: 80,
        defenderRouted: false,
        attackerRouted: false,
        attackerFrom: { x: 2, y: 1 },
        defenderFrom: { x: 3, y: 1 },
      },
      {
        type: "moved",
        unitId: "b",
        from: { x: 8, y: 8 },
        to: { x: 7, y: 8 },
        cost: 2,
        path: [
          { x: 8, y: 8 },
          { x: 7, y: 8 },
        ],
      },
    ];

    const { clips, seed } = buildTimeline(prev, events);
    expect(seed.positions.b).toEqual({ x: 8, y: 8 });

    const afterA = projectStickyAfterClips(seed, clips.slice(0, 2));
    expect(afterA.positions.a).toEqual({ x: 2, y: 1 });
    expect(afterA.positions.b).toEqual({ x: 8, y: 8 });
    expect(afterA.hp.t).toBe(30);

    const afterAll = projectStickyAfterClips(seed, clips);
    expect(afterAll.positions.b).toEqual({ x: 7, y: 8 });
  });

  it("晋升片段排在对应攻击之后，且攻击者坐标钉在开火格", () => {
    const prev = stateWith([
      unit({
        id: "p0",
        faction: "player",
        x: 3,
        y: 3,
        hp: 90,
        alive: true,
        level: 1,
      }),
      unit({ id: "e0", faction: "enemy", x: 3, y: 4, hp: 40, alive: true }),
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
      { type: "levelUp", unitId: "p0", from: 1, to: 2 },
      { type: "routed", unitId: "e0", faction: "enemy" },
      {
        type: "moved",
        unitId: "p0",
        from: { x: 3, y: 3 },
        to: { x: 3, y: 4 },
        cost: 0,
        path: [
          { x: 3, y: 3 },
          { x: 3, y: 4 },
        ],
      },
    ];
    const { clips, seed } = buildTimeline(prev, events);
    expect(clips.map((c) => c.kind)).toEqual(["attack", "promote", "move"]);

    const afterPromote = projectStickyAfterClips(seed, clips.slice(0, 2));
    expect(afterPromote.positions.p0).toEqual({ x: 3, y: 3 });
    expect(afterPromote.present.e0).toBe(false);

    const afterAdvance = projectStickyAfterClips(seed, clips);
    expect(afterAdvance.positions.p0).toEqual({ x: 3, y: 4 });
  });

  it("移动片段使用事件自带 path，不依赖终局寻路", () => {
    const prev = stateWith([
      unit({ id: "a", faction: "enemy", x: 0, y: 0, hp: 80, alive: true }),
    ]);
    const events: GameEvent[] = [
      {
        type: "moved",
        unitId: "a",
        from: { x: 0, y: 0 },
        to: { x: 2, y: 0 },
        cost: 4,
        path: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      },
    ];
    const clips = clipsFromEvents(prev, events);
    expect(clips[0]).toMatchObject({
      kind: "move",
      unitId: "a",
      path: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    });
  });
});
