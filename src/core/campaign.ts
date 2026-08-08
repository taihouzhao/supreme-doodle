import {
  CHAPTERS,
  buildCompanionStats,
  companionSeedExp,
  rosterUnitName,
  type ChapterConfig,
} from "../content/chapter";
import type { MissionConfig } from "../content/missions/schema";
import { levelFromExp, rankName, veterancyLevel } from "../content/units";
import { WEAPONS, bestWeapon, defaultWeaponFor, weaponFits } from "../content/weapons";
import { effectiveMaxHp } from "./commander";
import { createMissionState, emptyInventory, type RosterUnit } from "./mission";
import { deriveSeed, nextRandom } from "./rng";
import type { GameState, ItemId, MissionStatus, WeaponId } from "./types";

export interface MissionOutcome {
  missionId: string;
  status: MissionStatus;
  reason: string;
  turnsUsed: number;
  playerRouted: number;
  enemyRouted: number;
  evacuated: number;
  permanentLosses: string[];
  permanentLossNames: string[];
  returningUnits: string[];
  returningUnitNames: string[];
  replacements: string[];
  replacementNames: string[];
  weaponsGained: WeaponId[];
  rosterAfter: number;
  veteransAfter: number;
}

export interface CampaignState {
  chapterId: string;
  seed: number;
  rng: number;
  missionIndex: number;
  roster: RosterUnit[];
  inventory: Record<ItemId, number>;
  armory: WeaponId[];
  history: MissionOutcome[];
  serial: number;
  status: "running" | "complete";
}

function chapterOf(chapterId: string): ChapterConfig {
  const chapter = CHAPTERS[chapterId];
  if (!chapter) throw new Error(`未知章节: ${chapterId}`);
  return chapter;
}

function rosterFromSpec(
  id: string,
  spec: {
    commander: string;
    type: RosterUnit["type"];
    level: number;
    duty?: string;
    baseStats?: Parameters<typeof buildCompanionStats>[0]["baseStats"];
    weapon?: WeaponId;
    keyUnit?: boolean;
  },
): RosterUnit {
  const full = {
    commander: spec.commander,
    type: spec.type,
    level: spec.level,
    duty: spec.duty,
    baseStats: spec.baseStats,
    weapon: spec.weapon,
    keyUnit: spec.keyUnit,
  };
  const stats = buildCompanionStats(full);
  const weapon = spec.weapon ?? defaultWeaponFor(spec.type, "early");
  const exp = companionSeedExp(spec.level);
  const draft: RosterUnit = {
    id,
    name: rosterUnitName(full),
    type: spec.type,
    hp: 1,
    maxHp: 1,
    exp,
    fatigue: 0,
    missionsSurvived: 0,
    keyUnit: spec.keyUnit ?? false,
    commanderKind: "companion",
    commanderName: spec.commander,
    level: spec.level,
    rank: rankName(spec.level),
    duty: spec.duty ?? "直属作战分队指挥员",
    stats,
    weapon,
  };
  draft.maxHp = effectiveMaxHp(draft);
  draft.hp = draft.maxHp;
  return draft;
}

export function createCampaign(chapterId: string, seed: number): CampaignState {
  const chapter = chapterOf(chapterId);
  const roster: RosterUnit[] = chapter.startingRoster.map((spec, index) =>
    rosterFromSpec(`r${index}`, spec),
  );

  return {
    chapterId,
    seed,
    rng: deriveSeed(seed, "campaign"),
    missionIndex: 0,
    roster,
    inventory: { ...emptyInventory(), ...chapter.startingInventory },
    armory: [...chapter.startingArmory],
    history: [],
    serial: roster.length,
    status: "running",
  };
}

export function currentMission(campaign: CampaignState): MissionConfig | null {
  const chapter = chapterOf(campaign.chapterId);
  return chapter.missions[campaign.missionIndex] ?? null;
}

/** 自动换装只兜底：玩家手动挑过的武器（且仍然适配）保持不动 */
function autoEquip(roster: RosterUnit[], armory: WeaponId[]): void {
  for (const unit of roster) {
    const keepManual = unit.manualWeapon && weaponFits(unit.weapon, unit.type);
    if (!keepManual) {
      unit.weapon = bestWeapon(unit.type, [...armory, unit.weapon], unit.weapon);
      unit.manualWeapon = false;
    }
    unit.maxHp = effectiveMaxHp(unit);
    unit.hp = Math.min(unit.hp, unit.maxHp);
  }
}

/** 军械库里这位将领可以换的武器（含当前装备），按评分从高到低 */
export function equippableWeapons(campaign: CampaignState, unitId: string): WeaponId[] {
  const unit = campaign.roster.find((u) => u.id === unitId);
  if (!unit) return [];
  const pool = new Set<WeaponId>([unit.weapon, ...campaign.armory]);
  return [...pool]
    .filter((id) => weaponFits(id, unit.type))
    .sort((a, b) => WEAPONS[b].score - WEAPONS[a].score);
}

/** 手动换装：只在出击前可用，落在花名册上跨关保留 */
export function equipWeapon(
  campaign: CampaignState,
  unitId: string,
  weapon: WeaponId,
): CampaignState {
  const index = campaign.roster.findIndex((u) => u.id === unitId);
  const unit = campaign.roster[index];
  if (!unit) return campaign;
  if (!weaponFits(weapon, unit.type)) return campaign;
  if (weapon !== unit.weapon && !campaign.armory.includes(weapon)) return campaign;

  const roster = [...campaign.roster];
  const updated: RosterUnit = { ...unit, weapon, manualWeapon: true };
  updated.maxHp = effectiveMaxHp(updated);
  updated.hp = Math.min(updated.hp, updated.maxHp);
  roster[index] = updated;
  return { ...campaign, roster };
}

/** 补充新兵，保证前一关重创后仍有可行解；每位主将仍只带一支部队 */
function replenish(campaign: CampaignState, chapter: ChapterConfig): string[] {
  const added: string[] = [];
  let budget = chapter.maxReplacementsPerMission;
  const usedCommanders = new Set(campaign.roster.map((unit) => unit.commanderName));
  let reserveIndex = 0;
  while (campaign.roster.length < chapter.minRoster && budget > 0) {
    while (
      reserveIndex < chapter.reserveCommanders.length &&
      usedCommanders.has(chapter.reserveCommanders[reserveIndex]!)
    ) {
      reserveIndex += 1;
    }
    const commander =
      chapter.reserveCommanders[reserveIndex] ?? `增援${campaign.serial + 1}`;
    reserveIndex += 1;
    usedCommanders.add(commander);

    const id = `r${campaign.serial}`;
    campaign.serial += 1;
    budget -= 1;
    const unit = rosterFromSpec(id, {
      commander,
      type: "rifle",
      level: 1,
      duty: "补充步兵分队指挥员",
      weapon: defaultWeaponFor("rifle", "early"),
    });
    campaign.roster.push(unit);
    added.push(id);
  }
  return added;
}

export interface MissionStart {
  campaign: CampaignState;
  state: GameState;
  mission: MissionConfig;
  replacements: string[];
}

export function startMission(campaign: CampaignState): MissionStart {
  const chapter = chapterOf(campaign.chapterId);
  const mission = currentMission(campaign);
  if (!mission) throw new Error("章节已结束");

  const next = structuredClone(campaign);
  const replacements = replenish(next, chapter);
  autoEquip(next.roster, next.armory);

  // 老兵优先上阵；剧情将领另占剩余出生点
  const companionSlots = Math.max(
    1,
    mission.playerSpawns.length - (mission.storyAllies?.length ?? 0),
  );
  const deployed = next.roster
    .slice()
    .sort((a, b) => b.exp - a.exp || a.id.localeCompare(b.id))
    .slice(0, companionSlots);

  const state = createMissionState({
    mission,
    seed: deriveSeed(next.seed, mission.id),
    roster: deployed,
    inventory: next.inventory,
  });

  return { campaign: next, state, mission, replacements };
}

export function finishMission(
  campaign: CampaignState,
  finalState: GameState,
  replacements: string[] = [],
): { campaign: CampaignState; outcome: MissionOutcome } {
  const chapter = chapterOf(campaign.chapterId);
  const mission = currentMission(campaign);
  const next = structuredClone(campaign);
  const won = finalState.status === "won";
  const lossChance = won ? chapter.permanentLossChance.won : chapter.permanentLossChance.lost;

  const permanentLosses: string[] = [];
  const permanentLossNames: string[] = [];
  const returningUnits: string[] = [];
  const returningUnitNames: string[] = [];
  const roster: RosterUnit[] = [];

  for (const rosterUnit of next.roster) {
    const deployed = finalState.units.find((u) => u.rosterId === rosterUnit.id);
    if (!deployed) {
      roster.push(rosterUnit);
      continue;
    }

    if (deployed.alive || deployed.evacuated) {
      roster.push({
        ...rosterUnit,
        hp: Math.max(1, deployed.hp),
        maxHp: deployed.maxHp,
        exp: deployed.exp,
        fatigue: deployed.fatigue,
        level: deployed.level,
        rank: deployed.rank,
        stats: deployed.stats,
        weapon: deployed.weapon,
        missionsSurvived: rosterUnit.missionsSurvived + 1,
      });
      continue;
    }

    // 高大全是连续战役主角：单关被击溃会导致该关失败，但叙事上按重伤后送处理
    if (rosterUnit.keyUnit) {
      const exp = Math.round(deployed.exp * 0.9);
      const level = levelFromExp(exp);
      returningUnits.push(rosterUnit.id);
      returningUnitNames.push(rosterUnit.name);
      const restored: RosterUnit = {
        ...rosterUnit,
        hp: Math.max(25, chapter.returningUnit.hp),
        exp,
        level,
        rank: rankName(level),
        stats: deployed.stats,
        weapon: deployed.weapon,
        fatigue: deployed.fatigue,
        missionsSurvived: rosterUnit.missionsSurvived + 1,
        maxHp: 1,
      };
      restored.maxHp = effectiveMaxHp(restored);
      restored.hp = Math.min(restored.hp, restored.maxHp);
      roster.push(restored);
      continue;
    }

    const draw = nextRandom(next.rng);
    next.rng = draw.state;
    if (draw.value < lossChance) {
      permanentLosses.push(rosterUnit.id);
      permanentLossNames.push(rosterUnit.name);
      continue;
    }

    const exp = Math.round(deployed.exp * (1 - chapter.returningUnit.expPenalty));
    const level = levelFromExp(exp);
    returningUnits.push(rosterUnit.id);
    returningUnitNames.push(rosterUnit.name);
    const restored: RosterUnit = {
      ...rosterUnit,
      hp: chapter.returningUnit.hp,
      exp,
      level,
      rank: rankName(level),
      stats: deployed.stats,
      weapon: deployed.weapon,
      fatigue: deployed.fatigue,
      missionsSurvived: rosterUnit.missionsSurvived + 1,
      maxHp: 1,
    };
    restored.maxHp = effectiveMaxHp(restored);
    restored.hp = Math.min(restored.hp, restored.maxHp);
    roster.push(restored);
  }

  // 关卡之间的休整
  for (const unit of roster) {
    unit.maxHp = effectiveMaxHp(unit);
    const recovered = Math.round(unit.maxHp * chapter.restRecovery.hp);
    unit.hp = Math.min(unit.maxHp, unit.hp + recovered);
    unit.fatigue = Math.round(unit.fatigue * (1 - chapter.restRecovery.fatigue));
  }

  const weaponsGained: WeaponId[] = [
    ...finalState.pendingWeapons,
    ...(won ? mission?.weaponRewards ?? [] : []),
  ];
  for (const weapon of weaponsGained) {
    if (!next.armory.includes(weapon)) next.armory.push(weapon);
  }
  autoEquip(roster, next.armory);

  next.roster = roster;
  next.inventory = { ...finalState.inventory };
  for (const [item, amount] of Object.entries(chapter.resupply)) {
    next.inventory[item as ItemId] = (next.inventory[item as ItemId] ?? 0) + (amount ?? 0);
  }

  const outcome: MissionOutcome = {
    missionId: finalState.missionId,
    status: finalState.status,
    reason: finalState.resultReason,
    turnsUsed: Math.min(finalState.turn, finalState.maxTurns),
    playerRouted: finalState.stats.playerRouted,
    enemyRouted: finalState.stats.enemyRouted,
    evacuated: finalState.stats.playerEvacuated,
    permanentLosses,
    permanentLossNames,
    returningUnits,
    returningUnitNames,
    replacements,
    replacementNames: replacements
      .map((id) => next.roster.find((unit) => unit.id === id)?.name)
      .filter((name): name is string => Boolean(name)),
    weaponsGained,
    rosterAfter: roster.length,
    veteransAfter: roster.filter((u) => veterancyLevel(u.exp) >= 3).length,
  };

  next.history.push(outcome);
  next.missionIndex += 1;
  if (next.missionIndex >= chapter.missions.length) next.status = "complete";

  return { campaign: next, outcome };
}

export function rosterSummary(campaign: CampaignState): string {
  return campaign.roster
    .map(
      (u) =>
        `${u.name}(${u.rank}Lv${u.level} ${u.hp}/${u.maxHp} ${WEAPONS[u.weapon].name})`,
    )
    .join("、");
}
