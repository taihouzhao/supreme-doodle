import { describe, expect, it } from "vitest";
import { dispatch } from "../../src/core/dispatch";
import { fingerprint } from "../../src/core/hash";
import { createInitialWorld } from "../../src/core/state";
import { lianchengContent } from "../../src/content/liancheng";
import { runPath, walkToLocation, type PathStep } from "./script";

/**
 * Reconstructed from public DOS walkthroughs (not a hashed original binary):
 * loot home → walk to Heluo → tip → Nanxian compass → walk Fuwei then the
 * unmarked cave south of it → poetry → Beichou basin → Tianning fight → statue.
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
  { goTo: "jiangnan_cave" },
  { take: "cave_poetry" },
  { goTo: "beichou_house" },
  { useOn: { itemId: "tang_poetry", targetId: "basin" } },
  { goTo: "tianning_temple" },
  { battleAuto: true },
  { interact: "statue_back" },
];

export const LIANCHENG_ENTER_TIANNING: PathStep[] = LIANCHENG_SHORTEST_PATH.slice(0, 13);

describe("《连城诀》重建路线", () => {
  it("走完后持有天书并写入 Flag", () => {
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

  it("经典 GO_TO 不能传送，得自己走", () => {
    const { state, presentations } = runPath(lianchengContent, [{ jumpTo: "jiangnan_cave" }], 1);
    expect(state.locationId).toBe("home");
    expect(state.knownLocations).not.toContain("jiangnan_cave");
    expect(presentations.some((entry) => entry.dialogue.includes("walk-there"))).toBe(true);
  });

  it("不听传闻也能走到南贤居", () => {
    const { state } = walkToLocation(createInitialWorld(lianchengContent, 1), lianchengContent, "nanxian_house");
    expect(state.locationId).toBe("nanxian_house");
    expect(state.view).toBe("scene");
  });

  it("走进未标记隐洞即可进入，不必先出现图钉", () => {
    const start = createInitialWorld(lianchengContent, 1);
    expect(start.knownLocations).not.toContain("jiangnan_cave");
    const { state } = walkToLocation(start, lianchengContent, "jiangnan_cave");
    expect(state.locationId).toBe("jiangnan_cave");
    expect(state.view).toBe("scene");
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
    const atChest = runPath(lianchengContent, [{ take: "home_chest" }], 1).state;
    expect(atChest.inventory.silver).toBe(10);
    const tipped = dispatch(empty, { type: "TAKE", targetId: "home_chest" }, lianchengContent).state;
    expect(tipped.inventory.silver).toBe(10);
  });
});
