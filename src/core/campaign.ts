import { CHAPTERS, commanderFromUnitName, rosterUnitName, type ChapterConfig } from "../content/chapter";
import { designation } from "../content/naming";
import type { MissionConfig } from "../content/missions/schema";
import { UNIT_TYPES, veterancyLevel } from "../content/units";
import { effectiveMaxHp } from "./combat";
import { createMissionState, emptyInventory, type RosterUnit } from "./mission";
import { deriveSeed, nextRandom } from "./rng";
import type { GameState, ItemId, MissionStatus } from "./types";

export interface MissionOutcome {
  missionId: string;
  status: MissionStatus;
  reason: string;
  turnsUsed: number;
  playerRouted: number;
  enemyRouted: number;
  evacuated: number;
  permanentLosses: string[];
  returningUnits: string[];
  replacements: string[];
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
  history: MissionOutcome[];
  serial: number;
  status: "running" | "complete";
}

function chapterOf(chapterId: string): ChapterConfig {
  const chapter = CHAPTERS[chapterId];
  if (!chapter) throw new Error(`未知章节: ${chapterId}`);
  return chapter;
}

export function createCampaign(chapterId: string, seed: number): CampaignState {
  const chapter = chapterOf(chapterId);
  const roster: RosterUnit[] = chapter.startingRoster.map((spec, index) => ({
    id: `r${index}`,
    name: rosterUnitName(spec),
    type: spec.type,
    hp: effectiveMaxHp(spec.type, spec.exp),
    maxHp: effectiveMaxHp(spec.type, spec.exp),
    exp: spec.exp,
    fatigue: 0,
    missionsSurvived: 0,
  }));

  return {
    chapterId,
    seed,
    rng: deriveSeed(seed, "campaign"),
    missionIndex: 0,
    roster,
    inventory: { ...emptyInventory(), ...chapter.startingInventory },
    history: [],
    serial: roster.length,
    status: "running",
  };
}

export function currentMission(campaign: CampaignState): MissionConfig | null {
  const chapter = chapterOf(campaign.chapterId);
  return chapter.missions[campaign.missionIndex] ?? null;
}

/** 补充新兵，保证前一关重创后仍有可行解；每位主将仍只带一支部队 */
function replenish(campaign: CampaignState, chapter: ChapterConfig): string[] {
  const added: string[] = [];
  let budget = chapter.maxReplacementsPerMission;
  const usedCommanders = new Set(campaign.roster.map((unit) => commanderFromUnitName(unit.name)));
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
    campaign.roster.push({
      id,
      name: designation(commander, "rifle"),
      type: "rifle",
      hp: effectiveMaxHp("rifle", 0),
      maxHp: effectiveMaxHp("rifle", 0),
      exp: 0,
      fatigue: 0,
      missionsSurvived: 0,
    });
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

  // 老兵优先上阵，出场顺序稳定
  const deployed = next.roster
    .slice()
    .sort((a, b) => b.exp - a.exp || a.id.localeCompare(b.id))
    .slice(0, mission.playerSpawns.length);

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
  const next = structuredClone(campaign);
  const won = finalState.status === "won";
  const lossChance = won ? chapter.permanentLossChance.won : chapter.permanentLossChance.lost;

  const permanentLosses: string[] = [];
  const returningUnits: string[] = [];
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
        missionsSurvived: rosterUnit.missionsSurvived + 1,
      });
      continue;
    }

    const draw = nextRandom(next.rng);
    next.rng = draw.state;
    if (draw.value < lossChance) {
      permanentLosses.push(rosterUnit.id);
      continue;
    }

    const exp = Math.round(deployed.exp * (1 - chapter.returningUnit.expPenalty));
    returningUnits.push(rosterUnit.id);
    roster.push({
      ...rosterUnit,
      hp: chapter.returningUnit.hp,
      maxHp: effectiveMaxHp(rosterUnit.type, exp),
      exp,
      fatigue: deployed.fatigue,
      missionsSurvived: rosterUnit.missionsSurvived + 1,
    });
  }

  // 关卡之间的休整
  for (const unit of roster) {
    const recovered = Math.round(unit.maxHp * chapter.restRecovery.hp);
    unit.hp = Math.min(unit.maxHp, unit.hp + recovered);
    unit.fatigue = Math.round(unit.fatigue * (1 - chapter.restRecovery.fatigue));
  }

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
    returningUnits,
    replacements,
    rosterAfter: roster.length,
    veteransAfter: roster.filter((u) => veterancyLevel(u.exp) >= 1).length,
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
        `${u.name}(${UNIT_TYPES[u.type].name} ${u.hp}/${u.maxHp} 经验${Math.round(u.exp)})`,
    )
    .join("、");
}
