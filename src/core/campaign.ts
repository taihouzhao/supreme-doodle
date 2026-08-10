import {
  CHAPTERS,
  buildCompanionStats,
  companionSeedExp,
  rosterUnitName,
  type ChapterConfig,
} from "../content/chapter";
import { attachmentFits } from "../content/attachments";
import { ITEM_IDS } from "../content/items";
import type { MissionConfig } from "../content/missions/schema";
import { BASE_STATS } from "../content/progress";
import { LOGISTICS, levelFromExp } from "../content/units";
import { WEAPONS, defaultWeaponFor, weaponFits } from "../content/weapons";
import { effectiveMaxHp, recomputeStatsAtLevel } from "./commander";
import { createMissionState, emptyInventory, type RosterUnit } from "./mission";
import { deriveSeed, nextRandom } from "./rng";
import type { AttachmentId, GameState, ItemId, MissionStatus, WeaponId } from "./types";

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
  itemsGained?: ItemId[];
  itemsDiscarded?: ItemId[];
  attachmentsGained: AttachmentId[];
  rosterAfter: number;
  averageLevelAfter: number;
  landmarksDiscovered: string[];
}

export type ItemLoadout = Partial<Record<ItemId, number>>;

export const UNIT_BACKPACK_CAP = 3;
export const WAREHOUSE_CAP = 6;

function inventoryItems(inventory: Record<ItemId, number>): ItemId[] {
  const items: ItemId[] = [];
  for (const item of ITEM_IDS) {
    for (let i = 0; i < Math.max(0, Math.floor(inventory[item] ?? 0)); i += 1) items.push(item);
  }
  return items;
}

function inventoryFromItems(items: ItemId[]): Record<ItemId, number> {
  const result = emptyInventory();
  for (const item of items) result[item] += 1;
  return result;
}

function normalizeBackpack(items: ItemId[] | undefined): ItemId[] {
  return (items ?? []).filter((item) => ITEM_IDS.includes(item)).slice(0, UNIT_BACKPACK_CAP);
}

export interface CampaignState {
  schemaVersion?: 3;
  chapterId: string;
  seed: number;
  rng: number;
  missionIndex: number;
  roster: RosterUnit[];
  inventory: Record<ItemId, number>;
  armory: WeaponId[];
  /** 有限附件库存；数组表示同型号的多件实物，兼容 v2 的数组军械库。 */
  attachments: AttachmentId[];
  history: MissionOutcome[];
  serial: number;
  status: "running" | "complete";
  /** 出击前勾选的伴随单位 id；空则自动按等级与主力标记选择 */
  pendingDeploy?: string[];
  /** 出击前为各单位分配的携行物资（按 rosterId）；空则整库带入 */
  pendingLoadout?: Record<string, ItemLoadout>;
  /** 旧存档仍使用 inventory 字典；该字段用于明确显示仓库语义。 */
  warehouse?: ItemId[];
  /** 已发放过的战前史实换装关卡，避免重复 startMission 造成复制库存。 */
  preMissionClaimed?: string[];
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
    attachment?: AttachmentId;
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
    attachment: spec.attachment,
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
    duty: spec.duty ?? "直属作战分队指挥员",
    bio: spec.bio,
    baseStats,
    stats,
    weapon,
    backpack: [],
    attachment: spec.attachment,
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
  const armory = [...chapter.startingArmory];
  for (const unit of roster) {
    const owned = armory.filter((id) => id === unit.weapon).length;
    const equipped = roster.filter((entry) => entry.weapon === unit.weapon).length;
    if (owned < equipped) armory.push(unit.weapon);
  }
  const attachments = [...(chapter.startingAttachments ?? [])];
  for (const attachment of new Set(
    roster.map((unit) => unit.attachment).filter((id): id is AttachmentId => Boolean(id)),
  )) {
    const equipped = roster.filter((unit) => unit.attachment === attachment).length;
    const owned = attachments.filter((id) => id === attachment).length;
    for (let i = owned; i < equipped; i += 1) attachments.push(attachment);
  }

  return {
    chapterId,
    seed,
    rng: deriveSeed(seed, "campaign"),
    missionIndex: 0,
    roster,
    inventory: { ...emptyInventory(), ...chapter.startingInventory },
    armory,
    attachments,
    schemaVersion: 3,
    history: [],
    serial: roster.length,
    status: "running",
    pendingDeploy: roster.map((unit) => unit.id),
    pendingLoadout: {},
    warehouse: inventoryItems({ ...emptyInventory(), ...chapter.startingInventory }),
    preMissionClaimed: [],
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

function autoEquip(roster: RosterUnit[], armory: WeaponId[], attachments: AttachmentId[] = []): void {
  for (const unit of roster) {
    // 取消“评分最高即最好”：只修复旧存档中不适配的型号，不主动替换玩家选择。
    if (!weaponFits(unit.weapon, unit.type)) {
      const fallback = armory.find((id) => weaponFits(id, unit.type));
      if (fallback) unit.weapon = fallback;
      unit.manualWeapon = false;
    }
    if (
      unit.attachment &&
      (!attachmentFits(unit.attachment, unit.type) ||
        !attachments.includes(unit.attachment) ||
        (unit.weapon === "bm13" && unit.attachment === "artillery_tractor"))
    ) {
      unit.attachment = undefined;
    }
    unit.maxHp = effectiveMaxHp(unit);
    unit.hp = Math.min(unit.hp, unit.maxHp);
  }
}

function equippedWeaponCount(campaign: CampaignState, weapon: WeaponId, exceptUnitId?: string): number {
  return campaign.roster.filter((unit) => unit.id !== exceptUnitId && unit.weapon === weapon).length;
}

function equippedAttachmentCount(campaign: CampaignState, attachment: AttachmentId, exceptUnitId?: string): number {
  return campaign.roster.filter((unit) => unit.id !== exceptUnitId && unit.attachment === attachment).length;
}

export function ownedWeaponCount(campaign: CampaignState, weapon: WeaponId): number {
  return campaign.armory.filter((id) => id === weapon).length;
}

export function freeWeaponCount(campaign: CampaignState, weapon: WeaponId, exceptUnitId?: string): number {
  return Math.max(0, ownedWeaponCount(campaign, weapon) - equippedWeaponCount(campaign, weapon, exceptUnitId));
}

export function ownedAttachmentCount(campaign: CampaignState, attachment: AttachmentId): number {
  return campaign.attachments.filter((id) => id === attachment).length;
}

export function freeAttachmentCount(campaign: CampaignState, attachment: AttachmentId, exceptUnitId?: string): number {
  return Math.max(0, ownedAttachmentCount(campaign, attachment) - equippedAttachmentCount(campaign, attachment, exceptUnitId));
}

export function equippableWeapons(campaign: CampaignState, unitId: string): WeaponId[] {
  const unit = campaign.roster.find((u) => u.id === unitId);
  if (!unit) return [];
  const pool = new Set<WeaponId>([unit.weapon, ...campaign.armory]);
  return [...pool].filter(
    (id) => weaponFits(id, unit.type) && (id === unit.weapon || freeWeaponCount(campaign, id, unitId) > 0),
  );
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
  if (weapon !== unit.weapon && freeWeaponCount(campaign, weapon, unitId) <= 0) return campaign;

  const roster = [...campaign.roster];
  const updated: RosterUnit = { ...unit, weapon, manualWeapon: true };
  updated.maxHp = effectiveMaxHp(updated);
  updated.hp = Math.min(updated.hp, updated.maxHp);
  roster[index] = updated;
  return { ...campaign, roster };
}

export function equippableAttachments(campaign: CampaignState, unitId: string): AttachmentId[] {
  const unit = campaign.roster.find((u) => u.id === unitId);
  if (!unit) return [];
  const pool = new Set<AttachmentId>([...(unit.attachment ? [unit.attachment] : []), ...campaign.attachments]);
  return [...pool].filter(
    (id) =>
      attachmentFits(id, unit.type) &&
      !(id === "artillery_tractor" && unit.weapon === "bm13") &&
      (id === unit.attachment || freeAttachmentCount(campaign, id, unitId) > 0),
  );
}

export function equipAttachment(
  campaign: CampaignState,
  unitId: string,
  attachment: AttachmentId | null,
): CampaignState {
  const index = campaign.roster.findIndex((u) => u.id === unitId);
  const unit = campaign.roster[index];
  if (!unit) return campaign;
  if (attachment !== null) {
    if (!attachmentFits(attachment, unit.type)) return campaign;
    if (attachment === "artillery_tractor" && unit.weapon === "bm13") return campaign;
    if (attachment !== unit.attachment && freeAttachmentCount(campaign, attachment, unitId) <= 0) return campaign;
  }
  const roster = [...campaign.roster];
  const updated: RosterUnit = { ...unit, attachment: attachment ?? undefined };
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
    // 新补充单位随附同期基础武器，保证有限库存下仍然可以合法部署。
    campaign.armory.push(unit.weapon);
    campaign.roster.push(unit);
    added.push(id);
  }
  return added;
}

function addArtilleryCompanion(campaign: CampaignState, commander: string): string {
  const id = `r${campaign.serial}`;
  campaign.serial += 1;
  const unit = rosterFromSpec(id, {
    commander,
    type: "artillery",
    level: 1,
    duty: commander === "谭朝志" ? "常驻炮兵指挥员" : "炮兵补位指挥员",
    bio:
      commander === "谭朝志"
        ? "第五关前编入加强营的常驻炮兵，携带现有75毫米山炮。"
        : "孔庆三炮兵作为谭朝志炮兵永久减员后的编制补位。",
    weapon: "type75",
  });
  if (freeWeaponCount(campaign, unit.weapon) <= 0) campaign.armory.push(unit.weapon);
  campaign.roster.push(unit);
  return id;
}

export interface MissionStart {
  campaign: CampaignState;
  state: GameState;
  mission: MissionConfig;
  replacements: string[];
}

interface PreparedMissionInventory {
  battle: Record<ItemId, number>;
  remaining: Record<ItemId, number>;
  loadout: Record<string, ItemLoadout>;
  backpacks: Record<string, ItemId[]>;
}

/** 将仓库物资装入本关出战单位的 3 格背包；不改变旧 inventory 字典的公开形状。 */
function prepareMissionInventory(
  campaign: CampaignState,
  deployedIds: string[],
): PreparedMissionInventory {
  const warehouse = inventoryItems({ ...emptyInventory(), ...campaign.inventory });
  const remaining = [...warehouse];
  const pending = campaign.pendingLoadout ?? {};
  const hasManual = Object.values(pending).some((bag) =>
    ITEM_IDS.some((id) => (bag[id] ?? 0) > 0),
  );
  const backpacks: Record<string, ItemId[]> = {};
  const loadout: Record<string, ItemLoadout> = {};

  const take = (item: ItemId): boolean => {
    const index = remaining.indexOf(item);
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  };

  for (const id of deployedIds) {
    const unit = campaign.roster.find((entry) => entry.id === id);
    if (!unit) continue;
    const requested: ItemId[] = [];
    const manual = pending[id];
    if (hasManual && manual) {
      for (const item of ITEM_IDS) {
        for (let i = 0; i < Math.max(0, Math.floor(manual[item] ?? 0)); i += 1) {
          requested.push(item);
        }
      }
    } else {
      requested.push(...normalizeBackpack(unit.backpack));
    }
    const bag: ItemId[] = [];
    for (const item of requested) {
      if (bag.length >= UNIT_BACKPACK_CAP || !take(item)) continue;
      bag.push(item);
    }
    if (!hasManual) {
      for (const item of ITEM_IDS) {
        while (bag.length < UNIT_BACKPACK_CAP && take(item)) bag.push(item);
        if (bag.length >= UNIT_BACKPACK_CAP) break;
      }
    }
    backpacks[id] = bag;
    const counts = inventoryFromItems(bag);
    if (Object.keys(counts).some((item) => counts[item as ItemId] > 0)) loadout[id] = counts;
  }

  const battleItems = deployedIds.flatMap((id) => backpacks[id] ?? []);
  return {
    battle: inventoryFromItems(battleItems),
    remaining: inventoryFromItems(remaining),
    loadout,
    backpacks,
  };
}

export function startMission(campaign: CampaignState): MissionStart {
  const chapter = chapterOf(campaign.chapterId);
  const mission = currentMission(campaign);
  if (!mission) throw new Error("章节已结束");

  const next = structuredClone(campaign);
  next.preMissionClaimed ??= [];
  if (!next.preMissionClaimed.includes(mission.id)) {
    next.armory.push(...(mission.preMissionWeapons ?? []));
    (next.attachments ??= []).push(...(mission.preMissionAttachments ?? []));
    next.preMissionClaimed.push(mission.id);
  }
  const replacements = replenish(next, chapter);
  autoEquip(next.roster, next.armory, next.attachments ?? []);

  const deployedIds = normalizeDeployIds(next, mission, next.pendingDeploy);
  const prepared = prepareMissionInventory(next, deployedIds);
  next.inventory = prepared.remaining;
  next.warehouse = inventoryItems(prepared.remaining);
  next.roster = next.roster.map((unit) =>
    prepared.backpacks[unit.id] ? { ...unit, backpack: prepared.backpacks[unit.id] } : unit,
  );
  next.pendingDeploy = deployedIds;
  next.pendingLoadout = prepared.loadout;

  const state = createMissionState({
    mission,
    seed: deriveSeed(next.seed, mission.id),
    roster: deployedIds
      .map((id) => next.roster.find((unit) => unit.id === id)!)
      .filter(Boolean),
    inventory: prepared.battle,
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
        stats: deployed.stats,
        weapon: deployed.weapon,
        backpack: normalizeBackpack(deployed.backpack),
        attachment: deployed.attachment,
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
        stats: rosterUnit.baseStats
          ? recomputeStatsAtLevel(
              rosterUnit.baseStats,
              rosterUnit.type,
              level,
              rosterUnit.commanderName,
            )
          : deployed.stats,
        weapon: deployed.weapon,
        backpack: normalizeBackpack(deployed.backpack),
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
      stats: rosterUnit.baseStats
        ? recomputeStatsAtLevel(
            rosterUnit.baseStats,
            rosterUnit.type,
            level,
            rosterUnit.commanderName,
          )
        : deployed.stats,
      weapon: deployed.weapon,
      backpack: normalizeBackpack(deployed.backpack),
      attachment: deployed.attachment,
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
    next.armory.push(weapon);
  }
  const attachmentsGained: AttachmentId[] = [
    ...(finalState.pendingAttachments ?? []),
    ...(won ? mission?.attachmentRewards ?? [] : []),
  ];
  (next.attachments ??= []).push(...attachmentsGained);
  autoEquip(roster, next.armory, next.attachments);

  next.roster = roster;
  const warehouseItems = inventoryItems(next.inventory);
  warehouseItems.push(...inventoryItems(finalState.inventory));
  warehouseItems.push(...(finalState.pendingLoot ?? []));
  for (const [item, amount] of Object.entries(chapter.resupply)) {
    for (let i = 0; i < (amount ?? 0); i += 1) warehouseItems.push(item as ItemId);
  }
  const retainedWarehouse = warehouseItems.slice(0, WAREHOUSE_CAP);
  const discardedWarehouse = warehouseItems.slice(WAREHOUSE_CAP);
  next.inventory = inventoryFromItems(retainedWarehouse);
  next.warehouse = retainedWarehouse;
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
    itemsGained: finalState.pendingLoot ?? [],
    itemsDiscarded: discardedWarehouse,
    attachmentsGained,
    rosterAfter: roster.length,
    averageLevelAfter:
      roster.length > 0
        ? Math.round((roster.reduce((sum, unit) => sum + unit.level, 0) / roster.length) * 10) / 10
        : 0,
    landmarksDiscovered: finalState.places
      .filter((place) => (finalState.discoveredPlaceIds ?? []).includes(place.id ?? `${place.x},${place.y}`))
      .map((place) => place.name),
  };

  next.history.push(outcome);
  next.missionIndex += 1;
  // M4 结束后、M5 开始前固定加入谭朝志炮兵；若之后炮兵永久减员则由孔庆三补位。
  if (mission?.id === "m4-chosin" && !next.roster.some((unit) => unit.type === "artillery")) {
    addArtilleryCompanion(next, "谭朝志");
  } else if (next.missionIndex >= 5 && !next.roster.some((unit) => unit.type === "artillery")) {
    addArtilleryCompanion(next, "孔庆三");
  }
  next.pendingDeploy = next.roster.map((unit) => unit.id);
  outcome.rosterAfter = next.roster.length;
  if (next.missionIndex >= chapter.missions.length) next.status = "complete";

  return { campaign: next, outcome };
}

export function rosterSummary(campaign: CampaignState): string {
  return campaign.roster
    .map(
      (u) =>
        `${u.name}(Lv.${u.level} EXP${Math.round(u.exp)} ${u.hp}/${u.maxHp} ${WEAPONS[u.weapon].name})`,
    )
    .join("、");
}
