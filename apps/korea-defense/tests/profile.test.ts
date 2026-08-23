import { describe, expect, it } from "vitest";
import { applyMissionResult, buyArmoryUpgrade, defaultProfile, loadProfile, resetArmory, saveProfile, type StorageLike } from "../src/core/profile";

function memoryStorage(): StorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

describe("DefenseProfileV1", () => {
  it("保存、读取和首次星级奖励可重复", () => {
    const storage = memoryStorage();
    const profile = defaultProfile();
    saveProfile(profile, storage);
    const loaded = loadProfile(storage);
    expect(loaded.version).toBe(1);
    expect(applyMissionResult(loaded, "normal", { stars: 3, medalReward: 3 })).toBe(3);
    expect(applyMissionResult(loaded, "normal", { stars: 2, medalReward: 2 })).toBe(0);
    expect(loaded.hardUnlocked).toBe(true);
    expect(loaded.medals).toBe(3);
  });

  it("损坏档回退默认档并保留原始字符串", () => {
    const storage = memoryStorage();
    storage.setItem("korea-defense.profile.v1", "{bad json");
    const loaded = loadProfile(storage);
    expect(loaded.version).toBe(1);
    expect([...storage.values.keys()].some((key) => key.includes("corrupt"))).toBe(true);
  });

  it("军械升级每级消耗一枚勋章，重置全额返还", () => {
    const profile = defaultProfile();
    profile.medals = 2;
    expect(buyArmoryUpgrade(profile, "infantry")).toBe(true);
    expect(buyArmoryUpgrade(profile, "infantry")).toBe(true);
    expect(profile.medals).toBe(0);
    expect(resetArmory(profile)).toBe(2);
    expect(profile.medals).toBe(2);
    expect(profile.armory.infantry).toEqual([0, 0, 0]);
  });
});
