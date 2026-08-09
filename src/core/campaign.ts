import {
  CHAPTERS,
  buildCompanionStats,
  companionSeedExp,
  rosterUnitName,
  type ChapterConfig,
} from "../content/chapter";
import { ITEM_IDS } from "../content/items";
import type { MissionConfig } from "../content/missions/schema";
import { BASE_STATS } from "../content/progress";
import { LOGISTICS, levelFromExp, rankName, veterancyLevel } from "../content/units";
import { WEAPONS, bestWeapon, defaultWeaponFor, weaponFits } from "../content/weapons";
import { effectiveMaxHp, recomputeStatsAtLevel } from "./commander";
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
  landmarksDiscovered: string[];
}

export type ItemLoadout = Partial<Record<ItemId, number>>;

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
  /** 出击前勾选的伴随单位 id；空则自动老兵优先 */
  pendingDeploy?: string[];
  /** 出击前为各单位分配的携行物资（按 rosterId）；空则整库带入 */
  pendingLoadout?: Record<string, ItemLoadout>;
}

export interface PersonnelTransferBounds {
  sourceId: string | null;
  targetId: string | null;
  max: number;
}

/** 出击前的人力调拨上限，始终保留后勤队最低机动编制。 */
export function personnelTransferBounds(
  campaign: CampaignState,
  sourceId?: string | null,
  targetId?: string | null,
): PersonnelTransferBounds {
  const source =
    campaign.roster.find((unit) => unit.id === sourceId && unit.type === "logistics") ??
    campaign.roster.find((unit) => unit.type === "logistics");
  const target = campaign.roster.find(
    (unit) => unit.id === targetId && unit.type !== "logistics",
  ) ?? campaign.roster.find((unit) => unit.type !== "logistics" && unit.hp < unit.maxHp);
  if (!source || !target) return { sourceId: source?.id ?? null, targetId: target?.id ?? null, max: 0 };
  const sourceRoom = Math.max(0, source.hp - LOGISTICS.minimumPersonnel);
  const targetMissing = Math.max(0, target.maxHp - target.hp);
  return {
    sourceId: source.id,
    targetId: target.id,
    max: Math.min(sourceRoom, targetMissing),
  };
}

/**
 * 应用一次出击前人力调拨。返回新 CampaignState，便于 UI 预览后确认和存档。
 * 任何非法来源、目标或超额请求都会被安全截断为合法范围。
 */
export function transferPersonnel(
  campaign: CampaignState,
  sourceId: string,
  targetId: string,
  requested: number,
): CampaignState {
  const source = campaign.roster.find((unit) => unit.id === sourceId && unit.type === "logistics");
  const target = campaign.roster.find((unit) => unit.id === targetId && unit.type !== "logistics");
  if (!source || !target || source.id === target.id) return campaign;
  const amount = Math.min(
    Math.max(0, Math.floor(requested)),
    Math.max(0, source.hp - LOGISTICS.minimumPersonnel),
    Math.max(0, target.maxHp - target.hp),
  );
  if (amount <= 0) return campaign;
  const roster = campaign.roster.map((unit) => {
    if (unit.id === source.id) return { ...unit, hp: unit.hp - amount };
    if (unit.id === target.id) return { ...unit, hp: unit.hp + amount };
    return unit;
  });
  return { ...campaign, roster };
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
    bio?: string;
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
  const baseStats: RosterUnit["baseStats"] = { ...BASE_STATS, ...spec.baseStats };
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
    bio: spec.bio,
    baseStats,
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
    pendingDeploy: roster.map((unit) => unit.id),
    pendingLoadout: {},
  };
}

export function currentMission(campaign: CampaignState): MissionConfig | null {
  const chapter = chapterOf(campaign.chapterId);
  return chapter.missions[campaign.missionIndex] ?? null;
}

/** 本关伴随单位出战名额（出生点减去临时配属） */
export function companionDeployCap(mission: MissionConfig): number {
  return Math.max(1, mission.playerSpawns.length - (mission.storyAllies?.length ?? 0));
}

export function autoDeployIds(campaign: CampaignState, mission: MissionConfig): string[] {
  const cap = companionDeployCap(mission);
  return campaign.roster
    .slice()
    .sort((a, b) => Number(b.keyUnit) - Number(a.keyUnit) || b.exp - a.exp || a.id.localeCompare(b.id))
    .slice(0, cap)
    .map((unit) => unit.id);
}

/** 规范化出战名单：保证主力在列、不超名额 */
export function normalizeDeployIds(
  campaign: CampaignState,
  mission: MissionConfig,
  selected: string[] | undefined,
): string[] {
  const cap = companionDeployCap(mission);
  const valid = new Set(campaign.roster.map((unit) => unit.id));
  const keyId = campaign.roster.find((unit) => unit.keyUnit)?.id;
  const picked: string[] = [];
  for (const id of selected ?? []) {
    if (!valid.has(id) || picked.includes(id)) continue;
    picked.push(id);
    if (picked.length >= cap) break;
  }
  if (keyId && !picked.includes(keyId)) {
    if (picked.length >= cap) picked[picked.length - 1] = keyId;
    else picked.unshift(keyId);
  }
  if (picked.length === 0) return autoDeployIds(campaign, mission);
  if (picked.length < cap) {
    for (const id of autoDeployIds(campaign, mission)) {
      if (picked.includes(id)) continue;
      picked.push(id);
      if (picked.length >= cap) break;
    }
  }
  return picked.slice(0, cap);
}

export function toggleDeployUnit(campaign: CampaignState, unitId: string): CampaignState {
  const mission = currentMission(campaign);
  if (!mission) return campaign;
  const cap = companionDeployCap(mission);
  const unit = campaign.roster.find((entry) => entry.id === unitId);
  if (!unit) return campaign;
  if (unit.keyUnit) return campaign;

  const current = normalizeDeployIds(campaign, mission, campaign.pendingDeploy);
  const exists = current.includes(unitId);
  let next = exists ? current.filter((id) => id !== unitId) : [...current, unitId];
  if (!exists && next.length > cap) {
    const droppable = next
      .filter((id) => id !== unitId)
      .map((id) => campaign.roster.find((entry) => entry.id === id)!)
      .filter((entry) => entry && !entry.keyUnit)
      .sort((a, b) => a.exp - b.exp || a.id.localeCompare(b.id));
    const victim = droppable[0];
    if (!victim) return campaign;
    next = next.filter((id) => id !== victim.id);
  }
  next = normalizeDeployIds(campaign, mission, next);
  return { ...campaign, pendingDeploy: next };
}

function clampLoadout(
  inventory: Record<ItemId, number>,
  loadout: Record<string, ItemLoadout>,
): Record<string, ItemLoadout> {
  const used = emptyInventory();
  const result: Record<string, ItemLoadout> = {};
  for (const [rosterId, bag] of Object.entries(loadout)) {
    const nextBag: ItemLoadout = {};
    for (const itemId of ITEM_IDS) {
      const want = Math.max(0, Math.floor(bag[itemId] ?? 0));
      if (want <= 0) continue;
      const remain = (inventory[itemId] ?? 0) - used[itemId];
      const take = Math.min(want, Math.max(0, remain));
      if (take <= 0) continue;
      nextBag[itemId] = take;
      used[itemId] += take;
    }
    if (Object.keys(nextBag).length > 0) result[rosterId] = nextBag;
  }
  return result;
}

export function sumLoadout(loadout: Record<string, ItemLoadout>): Record<ItemId, number> {
  const total = emptyInventory();
  for (const bag of Object.values(loadout)) {
    for (const itemId of ITEM_IDS) {
      total[itemId] += Math.max(0, bag[itemId] ?? 0);
    }
  }
  return total;
}

/** 未手动配额时：整库带入（保持模拟门槛与旧存档行为） */
export function resolveMissionInventory(
  campaign: CampaignState,
  deployedIds: string[],
): { battle: Record<ItemId, number>; remaining: Record<ItemId, number>; loadout: Record<string, ItemLoadout> } {
  const pending = campaign.pendingLoadout ?? {};
  const hasManual = Object.values(pending).some((bag) =>
    ITEM_IDS.some((id) => (bag[id] ?? 0) > 0),
  );
  if (!hasManual) {
    return {
      battle: { ...emptyInventory(), ...campaign.inventory },
      remaining: emptyInventory(),
      loadout: {},
    };
  }
  const filtered: Record<string, ItemLoadout> = {};
  for (const id of deployedIds) {
    if (pending[id]) filtered[id] = pending[id]!;
  }
  const loadout = clampLoadout(campaign.inventory, filtered);
  const battle = sumLoadout(loadout);
  const remaining = emptyInventory();
  for (const itemId of ITEM_IDS) {
    remaining[itemId] = Math.max(0, (campaign.inventory[itemId] ?? 0) - battle[itemId]);
  }
  return { battle, remaining, loadout };
}

export function adjustLoadoutItem(
  campaign: CampaignState,
  rosterId: string,
  itemId: ItemId,
  delta: number,
): CampaignState {
  if (!campaign.roster.some((unit) => unit.id === rosterId)) return campaign;
  const loadout = { ...(campaign.pendingLoadout ?? {}) };
  const bag = { ...(loadout[rosterId] ?? {}) };
  const current = bag[itemId] ?? 0;
  const nextVal = Math.max(0, current + delta);
  const usedElsewhere = sumLoadout(
    Object.fromEntries(Object.entries(loadout).filter(([id]) => id !== rosterId)),
  )[itemId];
  const maxTake = Math.max(0, (campaign.inventory[itemId] ?? 0) - usedElsewhere);
  bag[itemId] = Math.min(nextVal, maxTake);
  if (bag[itemId] === 0) delete bag[itemId];
  if (Object.keys(bag).length === 0) delete loadout[rosterId];
  else loadout[rosterId] = bag;
  return { ...campaign, pendingLoadout: loadout };
}

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

export function equippableWeapons(campaign: CampaignState, unitId: string): WeaponId[] {
  const unit = campaign.roster.find((u) => u.id === unitId);
  if (!unit) return [];
  const pool = new Set<WeaponId>([unit.weapon, ...campaign.armory]);
  return [...pool]
    .filter((id) => weaponFits(id, unit.type))
    .sort((a, b) => WEAPONS[b].score - WEAPONS[a].score);
}

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

  const deployedIds = normalizeDeployIds(next, mission, next.pendingDeploy);
  const deployed = deployedIds
    .map((id) => next.roster.find((unit) => unit.id === id)!)
    .filter(Boolean);

  const { battle, remaining, loadout } = resolveMissionInventory(next, deployedIds);
  next.inventory = remaining;
  next.pendingDeploy = deployedIds;
  next.pendingLoadout = loadout;

  const state = createMissionState({
    mission,
    seed: deriveSeed(next.seed, mission.id),
    roster: deployed,
    inventory: battle,
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
        stats: rosterUnit.baseStats
          ? recomputeStatsAtLevel(
              rosterUnit.baseStats,
              rosterUnit.type,
              level,
              rosterUnit.commanderName,
            )
          : deployed.stats,
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
      stats: rosterUnit.baseStats
        ? recomputeStatsAtLevel(
            rosterUnit.baseStats,
            rosterUnit.type,
            level,
            rosterUnit.commanderName,
          )
        : deployed.stats,
      weapon: deployed.weapon,
      fatigue: deployed.fatigue,
      missionsSurvived: rosterUnit.missionsSurvived + 1,
      maxHp: 1,
    };
    restored.maxHp = effectiveMaxHp(restored);
    restored.hp = Math.min(restored.hp, restored.maxHp);
    roster.push(restored);
  }

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
  const merged = emptyInventory();
  for (const itemId of ITEM_IDS) {
    merged[itemId] = (next.inventory[itemId] ?? 0) + (finalState.inventory[itemId] ?? 0);
  }
  next.inventory = merged;
  for (const [item, amount] of Object.entries(chapter.resupply)) {
    next.inventory[item as ItemId] = (next.inventory[item as ItemId] ?? 0) + (amount ?? 0);
  }
  next.pendingDeploy = roster.map((unit) => unit.id);
  next.pendingLoadout = {};

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
    landmarksDiscovered: finalState.places
      .filter((place) => (finalState.discoveredPlaceIds ?? []).includes(place.id ?? `${place.x},${place.y}`))
      .map((place) => place.name),
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
