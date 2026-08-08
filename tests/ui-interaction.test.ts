import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ITEM_IDS } from "../src/content/items";
import { getMission } from "../src/content/missions";
import { applyAction, hashState } from "../src/core/engine";
import { createMissionState } from "../src/core/mission";
import { deriveSeed } from "../src/core/rng";
import type { GameEvent, GameState, Unit } from "../src/core/types";
import { buildAttackPreview } from "../src/ui/combatPreview";
import { objectiveLines } from "../src/ui/objectives";
import { Session } from "../src/ui/session";
import { ITEM_SLOT_COUNT, renderItemSlots } from "../src/ui/view";
import { fullInventory, testRosterUnit } from "./helpers/roster";

function prepareDuel(state: GameState): { attacker: Unit; defender: Unit } {
  const attacker = state.units.find((unit) => unit.faction === "player" && unit.keyUnit)!;
  const defender = state.units.find((unit) => unit.faction === "enemy")!;

  for (const unit of state.units) {
    if (unit.id !== attacker.id && unit.id !== defender.id) {
      unit.alive = false;
      unit.hp = 0;
    }
  }
  Object.assign(attacker, {
    x: 6,
    y: 6,
    alive: true,
    evacuated: false,
    hasActed: false,
    movedThisTurn: false,
    mpLeft: 6,
    hp: 400,
    maxHp: 400,
    fatigue: 0,
  });
  Object.assign(defender, {
    x: 6,
    y: 5,
    type: "rifle",
    alive: true,
    evacuated: false,
    hasActed: false,
    movedThisTurn: false,
    hp: 400,
    maxHp: 400,
    fatigue: 0,
  });
  state.tiles[6 * state.width + 6] = "plain";
  state.tiles[5 * state.width + 6] = "plain";
  state.phase = "player";
  state.status = "playing";
  return { attacker, defender };
}

function previewState(): GameState {
  const mission = getMission("m1-onjong");
  return createMissionState({
    mission,
    seed: deriveSeed(73, mission.id),
    roster: [testRosterUnit("r0", "预览步兵", "rifle", { keyUnit: true })],
    inventory: fullInventory(),
  });
}

function attackedEvent(events: GameEvent[]): Extract<GameEvent, { type: "attacked" }> {
  const event = events.find(
    (candidate): candidate is Extract<GameEvent, { type: "attacked" }> =>
      candidate.type === "attacked",
  );
  expect(event).toBeTruthy();
  return event!;
}

describe("攻击确认与预测", () => {
  beforeEach(() => {
    // Presentation 只需确认动画已排队；单元测试不实际推进浏览器帧。
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("首次点击敌军只进入预览，确认后才结算攻击", () => {
    const session = new Session();
    session.beginMission();
    const battle = session.current.battle!;
    const { attacker, defender } = prepareDuel(battle);
    const hpBefore = defender.hp;

    session.selectUnit(attacker.id);
    session.clickTile({ x: defender.x, y: defender.y });

    expect(session.current.pendingAttack).toEqual({
      attackerId: attacker.id,
      defenderId: defender.id,
    });
    expect(session.current.actions).toHaveLength(0);
    expect(session.current.battle!.units.find((unit) => unit.id === defender.id)!.hp).toBe(hpBefore);
    expect(session.attackPreview()?.defenderId).toBe(defender.id);

    session.confirmAttack();

    expect(session.current.pendingAttack).toBeNull();
    expect(session.current.actions.at(-1)).toEqual({
      kind: "attack",
      unitId: attacker.id,
      targetId: defender.id,
    });
    expect(session.current.battle!.units.find((unit) => unit.id === defender.id)!.hp).toBeLessThan(
      hpBefore,
    );
  });

  it("预测区间覆盖真实抖动伤害，并正确给出反击区间", () => {
    const state = previewState();
    const { attacker, defender } = prepareDuel(state);
    const preview = buildAttackPreview(state, attacker, defender);

    expect(preview.rout).toBe("none");
    expect(preview.counter).not.toBeNull();
    expect(preview.counterConditional).toBe(false);
    expect(preview.damage.min).toBeLessThanOrEqual(preview.damage.expected);
    expect(preview.damage.expected).toBeLessThanOrEqual(preview.damage.max);

    for (let rng = 1; rng <= 40; rng += 1) {
      const trial = structuredClone(state);
      trial.rng = rng;
      const result = applyAction(trial, {
        kind: "attack",
        unitId: attacker.id,
        targetId: defender.id,
      });
      const event = attackedEvent(result.events);
      expect(event.damage).toBeGreaterThanOrEqual(preview.damage.min);
      expect(event.damage).toBeLessThanOrEqual(preview.damage.max);
      expect(event.counterDamage).toBeGreaterThanOrEqual(preview.counter!.min);
      expect(event.counterDamage).toBeLessThanOrEqual(preview.counter!.max);
    }
  });

  it("确定击溃时不预测反击，曲射攻击也不受反击", () => {
    const state = previewState();
    const { attacker, defender } = prepareDuel(state);
    defender.hp = 1;
    const lethal = buildAttackPreview(state, attacker, defender);
    expect(lethal.rout).toBe("certain");
    expect(lethal.counter).toBeNull();

    defender.hp = 400;
    attacker.type = "mortar";
    attacker.weapon = "mortar60";
    defender.type = "mg";
    attacker.y = 7;
    const indirect = buildAttackPreview(state, attacker, defender);
    expect(indirect.counter).toBeNull();
  });
});

describe("结束回合保护", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("有未行动单位时第一次只武装确认，第二次才推进", () => {
    const session = new Session();
    session.beginMission();
    const before = session.current.battle!;
    const beforeHash = hashState(before);

    expect(session.unactedPlayerUnits().length).toBeGreaterThan(0);
    session.endTurn();

    expect(session.current.endTurnArmed).toBe(true);
    expect(session.current.actions).toHaveLength(0);
    expect(session.current.battle).toBe(before);
    expect(hashState(session.current.battle!)).toBe(beforeHash);

    session.endTurn();

    expect(session.current.actions.at(-1)).toEqual({ kind: "endTurn" });
    expect(session.current.battle).not.toBe(before);
    expect(
      session.current.battle!.turn > before.turn || session.current.battle!.status !== "playing",
    ).toBe(true);
  });
});

describe("物资槽与目标定位", () => {
  it("七种正库存物资全部生成槽位，不截断末项", () => {
    const items = ITEM_IDS.map((id) => ({ id, count: 1 }));
    const html = renderItemSlots(items, null, false);

    expect(ITEM_SLOT_COUNT).toBe(ITEM_IDS.length);
    expect(html.match(/data-action="use-item"/g)).toHaveLength(ITEM_IDS.length);
    for (const id of ITEM_IDS) {
      expect(html).toContain(`data-value="${id}"`);
    }
  });

  it("地图据点和撤离带可定位，计时与牵制等状态目标不可定位", () => {
    const holdMission = getMission("m10-triangle-hill");
    // 使用 M10 配置单独构造状态，避免战役进度影响目标类型。
    const holdState = createMissionState({
      mission: holdMission,
      seed: deriveSeed(19, holdMission.id),
      roster: [testRosterUnit("r0", "守点步兵", "rifle", { keyUnit: true })],
      inventory: fullInventory(),
    });
    const holdLines = objectiveLines(holdState, holdMission);
    const spatialLines = holdLines.filter((line) =>
      holdState.objectives.some((objective) => objective.id === line.id),
    );
    expect(spatialLines).toHaveLength(holdState.objectives.length);
    expect(spatialLines.every((line) => line.locatable)).toBe(true);
    expect(holdLines.find((line) => line.id === "hold-clock")?.locatable).toBe(false);

    const withdrawMission = getMission("m7-chipyongni");
    const withdrawState = createMissionState({
      mission: withdrawMission,
      seed: deriveSeed(23, withdrawMission.id),
      roster: [testRosterUnit("r0", "撤离步兵", "rifle", { keyUnit: true })],
      inventory: fullInventory(),
    });
    const withdrawLines = objectiveLines(withdrawState, withdrawMission);
    expect(withdrawLines.find((line) => line.id === "evac-quota")?.locatable).toBe(true);
    expect(withdrawLines.find((line) => line.id === "contact-pressure")?.locatable).toBe(false);
  });
});
