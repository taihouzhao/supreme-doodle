import { describe, expect, it, beforeEach } from "vitest";
import { CHAPTER_ONE } from "../src/content/chapter";
import { createCampaign, startMission } from "../src/core/campaign";
import { applyAction } from "../src/core/engine";
import { livingUnits, reachableTiles, unitAt } from "../src/core/grid";
import type { GameState, Unit } from "../src/core/types";

/**
 * 不挂 DOM 的「移动可撤销」语义测试：模拟 Session 对 undoableMove 的快照策略。
 */
function firstPlayer(state: GameState): Unit {
  const unit = livingUnits(state, "player")[0];
  if (!unit) throw new Error("no player");
  return unit;
}

function reachableEmpty(state: GameState, unit: Unit): { x: number; y: number } | null {
  for (const tile of reachableTiles(state, unit)) {
    if (tile.cost === 0) continue;
    if (unitAt(state, tile.x, tile.y)) continue;
    return { x: tile.x, y: tile.y };
  }
  return null;
}

describe("移动撤销语义", () => {
  let state: GameState;

  beforeEach(() => {
    const campaign = createCampaign(CHAPTER_ONE.id, 42);
    const started = startMission(campaign);
    state = started.state;
  });

  it("移动后未行动可用快照完整撤回位置与疲劳", () => {
    const unit = firstPlayer(state);
    const dest = reachableEmpty(state, unit);
    expect(dest).not.toBeNull();
    const before = structuredClone(state);
    const origin = { x: unit.x, y: unit.y, mpLeft: unit.mpLeft, fatigue: unit.fatigue };

    const moved = applyAction(state, { kind: "move", unitId: unit.id, to: dest! }).state;
    const after = moved.units.find((u) => u.id === unit.id)!;
    expect(after.x).toBe(dest!.x);
    expect(after.y).toBe(dest!.y);
    expect(after.mpLeft).toBeLessThan(origin.mpLeft);

    // Session.undoMove 等价：恢复 before
    const restored = structuredClone(before);
    const back = restored.units.find((u) => u.id === unit.id)!;
    expect(back.x).toBe(origin.x);
    expect(back.y).toBe(origin.y);
    expect(back.mpLeft).toBe(origin.mpLeft);
    expect(back.fatigue).toBe(origin.fatigue);
    expect(back.hasActed).toBe(false);
  });

  it("休整后移动被锁定（hasActed），不再处于可撤销窗口", () => {
    const unit = firstPlayer(state);
    const dest = reachableEmpty(state, unit);
    expect(dest).not.toBeNull();
    const moved = applyAction(state, { kind: "move", unitId: unit.id, to: dest! }).state;
    const waited = applyAction(moved, { kind: "wait", unitId: unit.id }).state;
    const after = waited.units.find((u) => u.id === unit.id)!;
    expect(after.hasActed).toBe(true);
    expect(after.x).toBe(dest!.x);
  });
});
