import { describe, expect, it } from "vitest";
import { compassReadout, overworldSpriteIds } from "../../src/client/world-map";
import { cloneWorld, createInitialWorld } from "../../src/core/state";
import { fingerprint } from "../../src/core/hash";
import { lianchengContent } from "../../src/content/liancheng";
import { runPath } from "../quest-paths/script";

describe("江湖大地图", () => {
  it("看得见的房子不是图钉清单，隐洞永不标名", () => {
    const ids = overworldSpriteIds(lianchengContent);
    expect(ids).toContain("home");
    expect(ids).toContain("heluo_inn");
    expect(ids).toContain("nanxian_house");
    expect(ids).not.toContain("jiangnan_cave");
    const cave = lianchengContent.overworld.buildings.find((building) => building.locationId === "jiangnan_cave");
    expect(cave?.hidden).toBe(true);
    expect(cave?.w).toBe(1);
    expect(cave?.h).toBe(1);
  });

  it("小二指路不会把隐洞画成房子", () => {
    const { state } = runPath(
      lianchengContent,
      [{ take: "home_chest" }, { goTo: "heluo_inn" }, { talkTo: "waiter" }],
      1,
    );
    expect(state.knownLocations).toContain("nanxian_house");
    expect(overworldSpriteIds(lianchengContent)).not.toContain("jiangnan_cave");
  });

  it("罗盘读数不修改世界状态", () => {
    const state = createInitialWorld(lianchengContent, 1);
    const copy = cloneWorld(state);
    compassReadout(state, lianchengContent);
    expect(fingerprint(state)).toBe(fingerprint(copy));
  });
});
