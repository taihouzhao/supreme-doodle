import { describe, expect, it } from "vitest";
import { fingerprint } from "../../src/core/hash";
import { lianchengContent } from "../../src/content/liancheng";
import { runPath, type PathStep } from "./script";

/** home → nanxian → jiangnan_cave → beichou → tianning_temple → battle → liancheng_book */
export const LIANCHENG_SHORTEST_PATH: PathStep[] = [
  { goTo: "nanxian_house" },
  { talkTo: "nanxian" },
  { goTo: "jiangnan_cave" },
  { take: "cave_poetry" },
  { goTo: "beichou_house" },
  { useOn: { itemId: "tang_poetry", targetId: "water" } },
  { goTo: "tianning_temple" },
  { battleMove: { unitId: "player", x: 2, y: 2 } },
  { battleAttack: { unitId: "player", targetId: "tianning_monk" } },
  { interact: "statue" },
];

describe("《连城诀》最短合法路线", () => {
  it("跑通后持有天书并写入 Flag", () => {
    const { state } = runPath(lianchengContent, LIANCHENG_SHORTEST_PATH, 1);
    expect(state.inventory.liancheng_book).toBe(1);
    expect(state.flags.heaven_book_liancheng).toBe(true);
    expect(state.heavenBooks).toContain("liancheng");
    expect(state.battlesWon).toContain("tianning_guard");
    expect(state.locationId).toBe("tianning_temple");
    expect(state.battle).toBeNull();
  });

  it("同一种子与同一操作序列得到同一状态指纹", () => {
    const a = fingerprint(runPath(lianchengContent, LIANCHENG_SHORTEST_PATH, 1).state);
    const b = fingerprint(runPath(lianchengContent, LIANCHENG_SHORTEST_PATH, 1).state);
    expect(a).toBe(b);
  });

  it("未获知地点不可前往", () => {
    const { state } = runPath(lianchengContent, [{ goTo: "jiangnan_cave" }], 1);
    expect(state.locationId).toBe("home");
    expect(state.knownLocations).not.toContain("jiangnan_cave");
  });
});
