import { describe, expect, it } from "vitest";
import { renderWorldMap } from "../../src/client/world-map";
import { cloneWorld, createInitialWorld } from "../../src/core/state";
import { fingerprint } from "../../src/core/hash";
import { lianchengContent } from "../../src/content/liancheng";
import { runPath } from "../quest-paths/script";

describe("江湖地图", () => {
  it("开局只标已知道的自宅和河洛客栈", () => {
    const svg = renderWorldMap(createInitialWorld(lianchengContent, 1), lianchengContent);
    expect(svg).toContain("自宅");
    expect(svg).toContain("河洛客栈");
    expect(svg).toContain('locationId":"home"');
    expect(svg).not.toContain("天宁寺");
    expect(svg).not.toContain("北丑居");
    expect(svg).not.toContain("唐诗山洞");
    expect(svg).not.toContain("南贤居");
    expect(svg).not.toContain("大轮寺");
  });

  it("发现地点后才在图上出现", () => {
    const { state } = runPath(
      lianchengContent,
      [{ take: "home_chest" }, { goTo: "heluo_inn" }, { talkTo: "waiter" }],
      1,
    );
    const svg = renderWorldMap(state, lianchengContent);
    expect(svg).toContain("南贤居");
    expect(svg).not.toContain("天宁寺");
  });

  it("渲染不修改世界状态", () => {
    const state = createInitialWorld(lianchengContent, 1);
    const copy = cloneWorld(state);
    renderWorldMap(state, lianchengContent);
    expect(fingerprint(state)).toBe(fingerprint(copy));
  });
});
