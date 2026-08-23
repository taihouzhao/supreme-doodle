import { describe, expect, it } from "vitest";
import { dispatch } from "../../src/core/dispatch";
import { createInitialWorld } from "../../src/core/state";
import { lianchengContent } from "../../src/content/liancheng";

describe("格子行走", () => {
  it("在自宅走到箱柜前面对搜查", () => {
    let world = createInitialWorld(lianchengContent, 1);
    expect(world.view).toBe("scene");
    expect(world.sceneX).toBe(6);
    expect(world.sceneY).toBe(6);

    const walk = [
      { dx: -1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 },
      { dx: 0, dy: -1 },
    ];
    for (const step of walk) {
      world = dispatch(world, { type: "STEP", ...step }, lianchengContent).state;
    }
    expect(world.sceneX).toBe(3);
    expect(world.sceneY).toBe(4);
    world = dispatch(world, { type: "STEP", dx: 0, dy: -1 }, lianchengContent).state;
    expect(world.sceneX).toBe(3);
    expect(world.sceneY).toBe(4);
    expect(world.facing).toBe("north");
    world = dispatch(world, { type: "FACE_INTERACT" }, lianchengContent).state;
    expect(world.inventory.silver).toBe(10);
  });

  it("走出门口进入大地图，向北走回自宅", () => {
    let world = createInitialWorld(lianchengContent, 1);
    world = dispatch(world, { type: "STEP", dx: 0, dy: 1 }, lianchengContent).state;
    world = dispatch(world, { type: "STEP", dx: 0, dy: 1 }, lianchengContent).state;
    expect(world.view).toBe("overworld");
    const x = world.overworldX;
    const y = world.overworldY;
    const blocked = dispatch(world, { type: "STEP", dx: 0, dy: -1 }, lianchengContent).state;
    expect(blocked.view).toBe("scene");
    expect(blocked.locationId).toBe("home");
    const east = dispatch(world, { type: "STEP", dx: 1, dy: 0 }, lianchengContent).state;
    expect(east.view).toBe("overworld");
    expect(east.overworldX).toBe(x + 1);
    expect(east.overworldY).toBe(y);
  });
});
