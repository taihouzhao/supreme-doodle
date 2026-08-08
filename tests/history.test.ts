import { describe, expect, it } from "vitest";
import { CHAPTER_ONE } from "../src/content/chapter";
import { MISSION_LIST } from "../src/content/missions";

describe("历史战役内容", () => {
  it("按时间顺序提供十二个唯一关卡", () => {
    expect(MISSION_LIST).toHaveLength(12);
    expect(new Set(MISSION_LIST.map((mission) => mission.id)).size).toBe(12);
    expect(MISSION_LIST[0]?.id).toBe("m1-onjong");
    expect(MISSION_LIST.at(-1)?.id).toBe("m12-kumsong");
  });

  it("每关都有史实、天气、指挥体系、装备与地图说明", () => {
    for (const mission of MISSION_LIST) {
      expect(mission.date).toBeTruthy();
      expect(mission.location).toBeTruthy();
      expect(mission.historicalOutcome).toBeTruthy();
      expect(mission.historicalNote).toBeTruthy();
      expect(mission.mapNote).toBeTruthy();
      expect(mission.commanders?.length).toBeGreaterThanOrEqual(2);
      expect(mission.weather?.options.length).toBeGreaterThan(0);
      expect(Object.keys(mission.playerEquipment ?? {}).length).toBe(4);
      expect(mission.places?.length ?? 0).toBeGreaterThan(0);
      expect(mission.scripted?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("地名与脚本事件坐标落在地图内且不在峭壁上", () => {
    for (const mission of MISSION_LIST) {
      const width = mission.map[0]!.length;
      for (const place of mission.places ?? []) {
        expect(place.x).toBeGreaterThanOrEqual(0);
        expect(place.y).toBeGreaterThanOrEqual(0);
        expect(place.x).toBeLessThan(width);
        expect(place.y).toBeLessThan(mission.map.length);
        expect(mission.map[place.y]![place.x]).not.toBe("#");
      }
      for (const rule of mission.scripted ?? []) {
        expect(rule.note.length).toBeGreaterThan(0);
      }
    }
  });

  it("地图含不可通行峭壁或要塞等复杂地形", () => {
    const joined = MISSION_LIST.map((m) => m.map.join("")).join("");
    expect(joined.includes("#") || joined.includes("B")).toBe(true);
    expect(joined.includes("F")).toBe(true);
  });

  it("地图、出生点、目标和撤离区全部在边界内", () => {
    for (const mission of MISSION_LIST) {
      const height = mission.map.length;
      const width = mission.map[0]?.length ?? 0;
      expect(width).toBeGreaterThan(0);
      expect(mission.map.every((row) => row.length === width)).toBe(true);
      const points = [
        ...mission.playerSpawns,
        ...mission.enemies,
        ...mission.objectives,
        ...mission.evacZone,
        ...mission.itemDrops,
      ];
      for (const point of points) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThan(width);
        expect(point.y).toBeLessThan(height);
      }
    }
  });

  it("高大全是唯一且跨关稳定的虚构主角", () => {
    expect(CHAPTER_ONE.protagonist.name).toBe("高大全");
    const keyUnits = CHAPTER_ONE.startingRoster.filter((unit) => unit.keyUnit);
    expect(keyUnits).toHaveLength(1);
    expect(keyUnits[0]?.commander).toBe("高大全");
    expect(CHAPTER_ONE.startingRoster).toHaveLength(4);
  });

  it("每关都有剧情将领客串", () => {
    for (const mission of MISSION_LIST) {
      expect(mission.storyAllies?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("标志性气候与历史结局不被改写", () => {
    const chosin = MISSION_LIST.find((mission) => mission.id === "m4-chosin")!;
    const chipyong = MISSION_LIST.find((mission) => mission.id === "m7-chipyongni")!;
    const kumsong = MISSION_LIST.find((mission) => mission.id === "m12-kumsong")!;
    expect(chosin.weather?.options).toEqual(["snow"]);
    expect(chipyong.kind).toBe("withdraw");
    expect(chipyong.historicalOutcome).toContain("守住砥平里");
    expect(kumsong.weather?.options).toEqual(["rain"]);
  });
});

