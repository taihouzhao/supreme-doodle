import { describe, expect, it } from "vitest";
import { deserializeSave, serializeSave } from "../../src/core/save";
import { fingerprint } from "../../src/core/hash";
import { lianchengContent } from "../../src/content/liancheng";
import { LIANCHENG_SHORTEST_PATH } from "../quest-paths/liancheng.test";
import { runPath } from "../quest-paths/script";

describe("存档往返", () => {
  it("序列化后再读回，状态指纹不变", () => {
    const { state } = runPath(lianchengContent, LIANCHENG_SHORTEST_PATH.slice(0, 4), 7);
    const restored = deserializeSave(serializeSave(state));
    expect(fingerprint(restored)).toBe(fingerprint(state));
    expect(restored.inventory.tang_poetry).toBe(1);
    expect(restored.knownLocations).toContain("beichou_house");
  });

  it("拒绝未知格式", () => {
    expect(() => deserializeSave(JSON.stringify({ format: "nope", saveVersion: 1, world: {} }))).toThrow(
      /not a jinyong classic save/,
    );
  });
});
