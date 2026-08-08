import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAPTER_ONE } from "../src/content/chapter";
import { MISSION_LIST } from "../src/content/missions";
import { WEAPONS, WEAPON_HISTORY, weaponFits, weaponForEquipment } from "../src/content/weapons";
import {
  COMMANDER_PORTRAIT,
  RANK_INSIGNIA,
  TERRAIN_ICON,
  TERRAIN_ICON_SNOW,
  UNIT_ICON,
  UNIT_ROLE_ICON,
  WEAPON_ICON,
} from "../src/ui/assets";

function publicAssetExists(url: string): boolean {
  const relative = url.split("?")[0]!.replace(/^\//, "");
  return existsSync(join(process.cwd(), "public", relative.replace(/^assets\//, "assets/")));
}

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

  it("任务登记的历史将领都有稳定肖像，并只在史实存在时显示军衔徽记", () => {
    const commanders = new Map(
      MISSION_LIST.flatMap((mission) => mission.commanders ?? []).map((commander) => [
        commander.id,
        commander,
      ]),
    );
    const registered = Object.keys(COMMANDER_PORTRAIT)
      .filter((id) => id !== "gao-daquan")
      .sort();
    expect([...commanders.keys()].sort()).toEqual(registered);
    for (const commander of commanders.values()) {
      expect(commander.portrait).toBe(commander.id);
      expect(commander.historicalRank).toBeTruthy();
      const portrait = COMMANDER_PORTRAIT[commander.portrait!];
      expect(portrait, `${commander.name}缺少肖像映射`).toBeTruthy();
      expect(publicAssetExists(portrait!)).toBe(true);
      if (commander.faction === "player") {
        expect(commander.historicalRank).toBe("职务制（无军衔徽章）");
        expect(commander.rankInsignia).toBeUndefined();
      } else {
        expect(commander.rankInsignia).toBeTruthy();
        const insignia = RANK_INSIGNIA[commander.rankInsignia!];
        expect(insignia, `${commander.name}缺少军衔徽记映射`).toBeTruthy();
        expect(publicAssetExists(insignia!)).toBe(true);
      }
    }
  });

  it("地图兵种由人物头像加独立兵种角标组成", () => {
    for (const [type, pair] of Object.entries(UNIT_ICON)) {
      expect(publicAssetExists(pair.player)).toBe(true);
      expect(publicAssetExists(pair.enemy)).toBe(true);
      expect(publicAssetExists(UNIT_ROLE_ICON[type as keyof typeof UNIT_ROLE_ICON])).toBe(true);
    }
  });

  it("全部历史武器都有型号说明和可用图标", () => {
    expect(Object.keys(WEAPON_ICON).sort()).toEqual(Object.keys(WEAPONS).sort());
    expect(Object.keys(WEAPON_HISTORY).sort()).toEqual(Object.keys(WEAPONS).sort());
    for (const [id, weapon] of Object.entries(WEAPONS)) {
      expect(weapon.name).toBeTruthy();
      expect(WEAPON_HISTORY[id as keyof typeof WEAPON_HISTORY].origin).toBeTruthy();
      expect(WEAPON_HISTORY[id as keyof typeof WEAPON_HISTORY].caliber).toBeTruthy();
      expect(publicAssetExists(WEAPON_ICON[id as keyof typeof WEAPON_ICON])).toBe(true);
    }
  });

  it("八类地形都有常态与雪地成对贴图", () => {
    expect(Object.keys(TERRAIN_ICON).sort()).toEqual(Object.keys(TERRAIN_ICON_SNOW).sort());
    for (const id of Object.keys(TERRAIN_ICON) as (keyof typeof TERRAIN_ICON)[]) {
      expect(publicAssetExists(TERRAIN_ICON[id])).toBe(true);
      expect(publicAssetExists(TERRAIN_ICON_SNOW[id])).toBe(true);
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

  it("硬史实门禁锁定温井、云山、横城、铁原、猪排山与金城修订", () => {
    const onjong = MISSION_LIST.find((mission) => mission.id === "m1-onjong")!;
    const unsan = MISSION_LIST.find((mission) => mission.id === "m2-unsan")!;
    const hoengsong = MISSION_LIST.find((mission) => mission.id === "m6-hoengsong")!;
    const cheorwon = MISSION_LIST.find((mission) => mission.id === "m9-cheorwon")!;
    const porkChop = MISSION_LIST.find((mission) => mission.id === "m11-pork-chop")!;
    const kumsong = MISSION_LIST.find((mission) => mission.id === "m12-kumsong")!;

    expect(onjong.commanders?.some((commander) => commander.id === "kim-jong-oh" && commander.formation.includes("第6"))).toBe(true);
    expect(JSON.stringify(unsan)).not.toContain("诸仁桥");
    expect(unsan.commanders?.find((commander) => commander.id === "paik-sun-yup")?.historicalRank).toContain("准将");
    const bridge = unsan.objectives.find((objective) => objective.id === "south-road-bridge")!;
    expect(unsan.map[bridge.y]?.[bridge.x]).toBe("=");
    expect(hoengsong.commanders?.find((commander) => commander.id === "edward-almond")?.historicalRank).toContain("少将");
    expect(cheorwon.kind).toBe("withdraw");
    expect(cheorwon.evacZone.length).toBeGreaterThan(0);
    expect(porkChop.commanders?.some((commander) => commander.id === "zhong-guochu" && commander.formation.includes("第23军"))).toBe(true);
    expect(porkChop.storyAllies?.some((ally) => ally.weapon === "t34_85")).toBe(true);
    expect(kumsong.storyAllies?.some((ally) => ally.type === "tank")).toBe(false);
    expect(kumsong.enemies.some((enemy) => enemy.type === "tank")).toBe(false);
    expect(kumsong.waves.flatMap((wave) => wave.units).some((enemy) => enemy.type === "tank")).toBe(false);
    expect(kumsong.scripted?.some((rule) => rule.kind === "barrage" && rule.target === "enemy" && rule.turns.includes(1))).toBe(true);
  });

  it("所有写入战场的装备名称都解析为适配兵种的真实机械型号", () => {
    for (const mission of MISSION_LIST) {
      for (const enemy of [...mission.enemies, ...mission.waves.flatMap((wave) => wave.units)]) {
        const weapon = enemy.weapon ?? weaponForEquipment(enemy.type, enemy.equipment, "enemy");
        expect(weaponFits(weapon, enemy.type), `${mission.id}/${enemy.name} 装备与兵种不匹配`).toBe(true);
      }
      for (const ally of mission.storyAllies ?? []) {
        if (ally.weapon) expect(weaponFits(ally.weapon, ally.type), `${mission.id}/${ally.commander} 装备与兵种不匹配`).toBe(true);
      }
    }
  });
});
