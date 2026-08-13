import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAPTER_ONE } from "../src/content/chapter";
import { MISSION_LIST } from "../src/content/missions";
import { TERRAIN, TERRAIN_CHARS } from "../src/content/terrain";
import { WEAPONS, WEAPON_HISTORY, weaponFits, weaponForEquipment } from "../src/content/weapons";
import { createCampaign, startMission } from "../src/core/campaign";
import {
  BRIDGE_ICON,
  ATTACHMENT_ICON,
  COMMANDER_PORTRAIT,
  ITEM_ICON,
  RANK_INSIGNIA,
  TERRAIN_ICON,
  TERRAIN_ICON_SNOW,
  UNIT_ICON,
  UNIT_IDENTITY_PORTRAIT,
  UNIT_ROLE_ICON,
  WEAPON_ICON,
  unitPortrait,
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
      expect(Object.keys(mission.playerEquipment ?? {}).length).toBe(6);
      expect(mission.places?.length ?? 0).toBeGreaterThan(0);
      for (const place of mission.places ?? []) {
        expect(place.id).toBeTruthy();
        expect(place.historicalContext).toBeTruthy();
        expect(place.tacticalHint).toBeTruthy();
      }
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

  it("五个历史阵营各有八张不同的普通单位肖像", () => {
    const hashes = new Set<string>();
    for (const pool of Object.values(UNIT_IDENTITY_PORTRAIT)) {
      expect(pool).toHaveLength(8);
      for (const portrait of pool) {
        expect(publicAssetExists(portrait)).toBe(true);
        const relative = portrait.split("?")[0]!.replace(/^\/assets\//, "assets/");
        hashes.add(createHash("sha256").update(readFileSync(join(process.cwd(), "public", relative))).digest("hex"));
      }
    }
    expect(hashes.size).toBe(40);
  });

  it("每一关的在场与增援单位都解析到不同肖像", () => {
    for (let missionIndex = 0; missionIndex < MISSION_LIST.length; missionIndex += 1) {
      const campaign = createCampaign("chapter-one", 17 + missionIndex);
      campaign.missionIndex = missionIndex;
      const { state } = startMission(campaign);
      const units = [...state.units, ...state.pending.flatMap((wave) => wave.units)];
      const portraits = units.map(unitPortrait);
      expect(new Set(portraits).size, MISSION_LIST[missionIndex]!.id).toBe(units.length);
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

  it("新增战术物资与附件都有可加载的图标", () => {
    for (const icon of Object.values(ITEM_ICON)) {
      expect(publicAssetExists(icon)).toBe(true);
    }
    for (const icon of Object.values(ATTACHMENT_ICON)) {
      expect(publicAssetExists(icon)).toBe(true);
    }
  });

  it("八类地形都有常态与雪地成对贴图", () => {
    expect(Object.keys(TERRAIN_ICON).sort()).toEqual(Object.keys(TERRAIN_ICON_SNOW).sort());
    for (const id of Object.keys(TERRAIN_ICON) as (keyof typeof TERRAIN_ICON)[]) {
      expect(publicAssetExists(TERRAIN_ICON[id])).toBe(true);
      expect(publicAssetExists(TERRAIN_ICON_SNOW[id])).toBe(true);
    }
    expect(publicAssetExists(BRIDGE_ICON.clear)).toBe(true);
    expect(publicAssetExists(BRIDGE_ICON.snow)).toBe(true);
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

  it("地图、出生点、目标和撤离区全部在边界内且可通行", () => {
    for (const mission of MISSION_LIST) {
      const height = mission.map.length;
      const width = mission.map[0]?.length ?? 0;
      expect(width).toBe(20);
      expect(height).toBe(14);
      expect(mission.map.every((row) => row.length === width)).toBe(true);
      const points = [
        ...mission.playerSpawns,
        ...mission.enemies,
        ...mission.objectives,
        ...mission.evacZone,
        ...mission.itemDrops,
        ...(mission.supplyPoints ?? []),
        ...(mission.places ?? []),
        ...mission.waves.flatMap((wave) => wave.units),
      ];
      for (const point of points) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThan(width);
        expect(point.y).toBeLessThan(height);
        const glyph = mission.map[point.y]![point.x]!;
        const terrainId = TERRAIN_CHARS[glyph];
        expect(terrainId, `${mission.id} 未知地形 ${glyph} @${point.x},${point.y}`).toBeTruthy();
        expect(TERRAIN[terrainId!].passable, `${mission.id} 不可通行 ${glyph} @${point.x},${point.y}`).toBe(true);
      }
    }
  });

  it("十二关地形轮廓互不雷同，能读出不同战法", () => {
    const histogram = (map: string[]) => {
      const counts: Record<string, number> = {};
      for (const row of map) {
        for (const glyph of row) counts[glyph] = (counts[glyph] ?? 0) + 1;
      }
      return counts;
    };
    const signatures = MISSION_LIST.map((mission) => {
      const counts = histogram(mission.map);
      const ranked = Object.entries(counts)
        .filter(([glyph]) => glyph !== ".")
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([glyph, count]) => `${glyph}:${count}`)
        .join(",");
      return `${mission.id}|${ranked}`;
    });
    expect(new Set(signatures).size).toBe(12);

    const m1 = histogram(MISSION_LIST[0]!.map);
    const m3 = histogram(MISSION_LIST[2]!.map);
    const m5 = histogram(MISSION_LIST[4]!.map);
    const m9 = histogram(MISSION_LIST[8]!.map);
    const m10 = histogram(MISSION_LIST[9]!.map);
    expect((m1["#"] ?? 0) > (m1.F ?? 0)).toBe(true);
    expect(MISSION_LIST[2]!.map[5]).toMatch(/V.*=.*V|V=/);
    expect((m3["="] ?? 0) > (m3["#"] ?? 0)).toBe(true);
    expect((m5["~"] ?? 0) > (m5["="] ?? 0)).toBe(true);
    expect((m9["."] ?? 0) / 280).toBeGreaterThan(0.7);
    expect((m10.B ?? 0) + (m10["^"] ?? 0)).toBeGreaterThan(80);
    expect(MISSION_LIST[5]!.map.join("").includes("#")).toBe(true);
    expect(MISSION_LIST[8]!.map[0]).toBe("....................");
  });

  it("高大全是唯一虚构主角，伴随将领为真实人物", () => {
    expect(CHAPTER_ONE.protagonist.name).toBe("高大全");
    const keyUnits = CHAPTER_ONE.startingRoster.filter((unit) => unit.keyUnit);
    expect(keyUnits).toHaveLength(1);
    expect(keyUnits[0]?.commander).toBe("高大全");
    expect(CHAPTER_ONE.startingRoster).toHaveLength(5);
    const companions = CHAPTER_ONE.startingRoster.filter((unit) => !unit.keyUnit);
    expect(companions.map((unit) => unit.commander)).toEqual([
      "郭恩志",
      "胡修道",
      "唐章洪",
      "柴云振",
    ]);
  });

  it("每关都有真实人物临时配属，且至少一名敌军精英/主将", () => {
    for (const mission of MISSION_LIST) {
      expect(mission.storyAllies?.length ?? 0).toBeGreaterThan(0);
      for (const ally of mission.storyAllies ?? []) {
        expect(ally.commander.length).toBeGreaterThan(1);
        expect(["韩卫东", "外线鹰", "坑道龙", "温井尖兵"]).not.toContain(ally.commander);
      }
      const elites = mission.enemies.filter(
        (enemy) => enemy.commanderId || enemy.title || (enemy.dropOptions?.length ?? 0) > 0,
      );
      expect(elites.length).toBeGreaterThan(0);
      for (const elite of elites) {
        if (elite.commanderId) {
          expect(mission.commanders?.some((c) => c.id === elite.commanderId)).toBe(true);
        }
        if (elite.dropOptions) expect(elite.dropOptions.length).toBeGreaterThan(0);
      }
    }
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
    const triangle = MISSION_LIST.find((mission) => mission.id === "m10-triangle-hill")!;

    expect(onjong.commanders?.some((commander) => commander.id === "kim-jong-oh" && commander.formation.includes("第6"))).toBe(true);
    expect(onjong.enemies.some((enemy) => (enemy.name ?? "").includes("炮兵中队"))).toBe(true);
    expect(JSON.stringify(unsan)).not.toContain("诸仁桥");
    expect(unsan.commanders?.find((commander) => commander.id === "paik-sun-yup")?.historicalRank).toContain("准将");
    const bridge = unsan.objectives.find((objective) => objective.id === "south-road-bridge")!;
    expect(unsan.map[bridge.y]?.[bridge.x]).toBe("=");
    expect(hoengsong.commanders?.find((commander) => commander.id === "edward-almond")?.historicalRank).toContain("少将");
    expect(cheorwon.kind).toBe("withdraw");
    expect(cheorwon.evacZone.length).toBeGreaterThan(0);
    expect(porkChop.commanders?.some((commander) => commander.id === "zhong-guochu" && commander.formation.includes("第67师"))).toBe(true);
    expect(porkChop.storyAllies?.some((ally) => ally.weapon === "t34_85")).toBe(true);
    expect(porkChop.playerEquipment?.tank).toContain("T-34");
    expect(triangle.playerEquipment?.tank).not.toContain("T-34");
    expect(kumsong.playerEquipment?.tank).not.toContain("T-34");
    expect(kumsong.storyAllies?.some((ally) => ally.type === "tank")).toBe(false);
    expect(kumsong.enemies.some((enemy) => enemy.type === "tank")).toBe(false);
    expect(kumsong.waves.flatMap((wave) => wave.units).some((enemy) => enemy.type === "tank")).toBe(false);
    expect(kumsong.scripted?.some((rule) => rule.kind === "barrage" && rule.target === "enemy" && rule.turns.includes(1))).toBe(true);
    expect(kumsong.historicalOutcome).toContain("轿岩山");
  });

  it("硬史实门禁锁定清川江、三八线、砥平里与临津江切片边界", () => {
    const chongchon = MISSION_LIST.find((mission) => mission.id === "m3-chongchon")!;
    const third = MISSION_LIST.find((mission) => mission.id === "m5-third-offensive")!;
    const chipyong = MISSION_LIST.find((mission) => mission.id === "m7-chipyongni")!;
    const imjin = MISSION_LIST.find((mission) => mission.id === "m8-imjin")!;

    expect(chongchon.objectives.map((o) => o.name).sort()).toEqual(["三所里", "龙源里"].sort());
    expect((chongchon.places ?? []).some((p) => p.name.includes("清川江"))).toBe(true);
    expect(chongchon.objectives.some((o) => o.name.includes("清川江"))).toBe(false);
    expect(chongchon.commanders?.some((c) => c.id === "liang-xingchu" && c.formation.includes("113"))).toBe(true);

    const crossing = third.objectives.find((o) => o.id === "imjin-crossing")!;
    const pass = third.objectives.find((o) => o.id === "uigongbu-pass")!;
    expect(crossing.y).toBeLessThan(pass.y);
    expect(JSON.stringify(third.objectives)).not.toContain("汉城");

    expect(chipyong.kind).toBe("withdraw");
    expect(chipyong.objectives).toHaveLength(0);
    expect((chipyong.places ?? []).some((p) => p.name === "砥平里")).toBe(true);
    expect(chipyong.waves.flatMap((w) => w.units).some((u) => u.type === "tank")).toBe(true);
    expect(chipyong.historicalNote).toContain("不允许");

    const bridgehead = imjin.objectives.find((o) => o.id.includes("bridge") || o.name.includes("桥头"))!;
    const hill = imjin.objectives.find((o) => o.name.includes("235"))!;
    expect(bridgehead.y).toBeLessThan(hill.y);
    expect(imjin.commanders?.some((c) => c.id === "james-carne")).toBe(true);
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
