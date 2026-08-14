import { describe, expect, it } from "vitest";
import { pickBattleTile, pickDevicePixelRatio, pickDialogHeight, pickTileSize } from "../../src/client/view";

describe("现代网页分辨率", () => {
  it("桌面窗格用地砖而不是 16px DOS 格", () => {
    expect(pickTileSize(1280, 720)).toBeGreaterThanOrEqual(48);
    expect(pickTileSize(1280, 720)).toBeLessThanOrEqual(88);
    expect(pickDialogHeight(800)).toBeGreaterThanOrEqual(112);
    expect(pickBattleTile(1280, 640, 5, 5)).toBeGreaterThanOrEqual(64);
  });

  it("设备像素比封顶在 2，避免超大 backing store", () => {
    expect(pickDevicePixelRatio(1)).toBe(1);
    expect(pickDevicePixelRatio(3)).toBe(2);
  });
});
