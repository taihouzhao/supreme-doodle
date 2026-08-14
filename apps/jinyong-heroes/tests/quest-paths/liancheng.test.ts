import { describe, expect, it } from "vitest";
import { dispatch } from "../../src/core/dispatch";
import { fingerprint } from "../../src/core/hash";
import { createInitialWorld } from "../../src/core/state";
import { lianchengContent } from "../../src/content/liancheng";
import { runPath, type PathStep } from "./script";

/**
 * Reconstructed from public DOS walkthroughs (not a hashed original binary):
 * loot home → Heluo tip → Nanxian compass → Fuwei hidden cave → poetry →
 * Beichou basin → Tianning fight → statue back.
 */
export const LIANCHENG_SHORTEST_PATH: PathStep[] = [
  { take: "home_chest" },
  { goTo: "heluo_inn" },
  { talkTo: "waiter" },
  { talkTo: "inn_crowd" },
  { goTo: "nanxian_house" },
  { talkTo: "nanxian" },
  { interact: "nanxian_cabinet" },
  { goTo: "fuwei_biaoju" },
  { interact: "cave_trail" },
  { goTo: "jiangnan_cave" },
  { take: "cave_poetry" },
  { goTo: "beichou_house" },
  { useOn: { itemId: "tang_poetry", targetId: "basin" } },
  { goTo: "tianning_temple" },
  { battleAuto: true },
  { interact: "statue_back" },
];

describe("《连城诀》重建路线", () => {
  it("跑通后持有天书并写入 Flag", () => {
    const { state } = runPath(lianchengContent, LIANCHENG_SHORTEST_PATH, 1);
    expect(state.inventory.liancheng_book).toBe(1);
    expect(state.flags.heaven_book_liancheng).toBe(true);
    expect(state.heavenBooks).toContain("liancheng");
    expect(state.battlesWon).toContain("tianning_raid");
    expect(state.locationId).toBe("tianning_temple");
    expect(state.battle).toBeNull();
    expect(state.moral).toBe(50);
    expect(state.inventory.compass).toBe(1);
    expect(state.inventory.tang_poetry).toBe(1);
  });

  it("同一种子与同一操作序列得到同一状态指纹", () => {
    const a = fingerprint(runPath(lianchengContent, LIANCHENG_SHORTEST_PATH, 1).state);
    const b = fingerprint(runPath(lianchengContent, LIANCHENG_SHORTEST_PATH, 1).state);
    expect(a).toBe(b);
  });

  it("未给小二银两则南贤居仍未知", () => {
    const { state } = runPath(lianchengContent, [{ goTo: "heluo_inn" }, { talkTo: "waiter" }], 1);
    expect(state.knownLocations).not.toContain("nanxian_house");
    expect(state.locationId).toBe("heluo_inn");
  });

  it("未获知地点不可前往", () => {
    const { state } = runPath(lianchengContent, [{ goTo: "jiangnan_cave" }], 1);
    expect(state.locationId).toBe("home");
    expect(state.knownLocations).not.toContain("jiangnan_cave");
  });

  it("开局品德 50，狄云不入队", () => {
    const opening: PathStep[] = [
      { take: "home_chest" },
      { goTo: "heluo_inn" },
      { talkTo: "waiter" },
      { goTo: "nanxian_house" },
      { interact: "nanxian_cabinet" },
      { goTo: "dalun_temple" },
      { battleAuto: true },
      { interact: "diyun_cell" },
      { talkTo: "diyun" },
    ];
    const { state } = runPath(lianchengContent, opening, 1);
    expect(state.moral).toBe(52);
    expect(state.flags.diyun_lied).toBe(true);
    expect(state.party).not.toContain("diyun");
    expect(state.inventory.orange_key).toBe(1);
  });
});

describe("开局银两", () => {
  it("搜刮自宅后才能付小费", () => {
    const empty = createInitialWorld(lianchengContent, 1);
    expect(empty.inventory.silver).toBeUndefined();
    const tipped = dispatch(empty, { type: "TAKE", targetId: "home_chest" }, lianchengContent).state;
    expect(tipped.inventory.silver).toBe(10);
  });
});
