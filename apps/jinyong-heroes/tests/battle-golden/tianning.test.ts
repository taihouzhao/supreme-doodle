import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dispatch } from "../../src/core/dispatch";
import { fingerprint } from "../../src/core/hash";
import { lianchengContent } from "../../src/content/liancheng";
import { LIANCHENG_SHORTEST_PATH } from "../quest-paths/liancheng.test";
import { runPath, stepToAction } from "../quest-paths/script";

const meta = JSON.parse(
  readFileSync(new URL("./tianning_guard.meta.json", import.meta.url), "utf8"),
) as {
  status: string;
  formulaStatus: string;
  seed: number;
};

describe("天宁寺战斗黄金样本占位", () => {
  it("元数据标 pending-original 与 unverified-vs-original", () => {
    expect(meta.status).toBe("pending-original");
    expect(meta.formulaStatus).toBe("unverified-vs-original");
  });

  it("同一战斗操作逐步可重放", () => {
    const enter = LIANCHENG_SHORTEST_PATH.slice(0, 7);
    const fight = LIANCHENG_SHORTEST_PATH.slice(7, 9);
    const first = runPath(lianchengContent, enter, meta.seed).state;
    expect(first.battle?.formulaStatus).toBe("unverified-vs-original");
    expect(first.battle?.id).toBe("tianning_guard");

    const replayA = replay(first, fight);
    const replayB = replay(first, fight);
    expect(fingerprint(replayA)).toBe(fingerprint(replayB));
    expect(replayA.battlesWon).toContain("tianning_guard");
    expect(replayA.battle).toBeNull();
  });
});

function replay(state: ReturnType<typeof runPath>["state"], steps: typeof LIANCHENG_SHORTEST_PATH) {
  let current = state;
  for (const step of steps) {
    current = dispatch(current, stepToAction(step), lianchengContent).state;
  }
  return current;
}
