import type { Agent } from "../ai/types";
import { CHAPTERS } from "../content/chapter";
import { getMission } from "../content/missions";
import { veterancyLevel } from "../content/units";
import {
  createCampaign,
  finishMission,
  startMission,
  type CampaignState,
  type MissionOutcome,
} from "../core/campaign";
import { applyAction } from "../core/engine";
import { coreObjectiveMet, createMissionState } from "../core/mission";
import { Rng, deriveSeed } from "../core/rng";
import type { Action, GameState } from "../core/types";

/** 单回合内的动作上限，避免随机 Agent 无限打转 */
export const MAX_ACTIONS_PER_TURN = 60;
export const MAX_TOTAL_ACTIONS = 4000;

export interface MissionRun {
  missionId: string;
  agentId: string;
  seed: number;
  status: GameState["status"];
  reason: string;
  /** 是否完成核心目标（不含伤亡上限等附加要求） */
  coreObjectiveMet: boolean;
  turnsUsed: number;
  playerRouted: number;
  enemyRouted: number;
  evacuated: number;
  damageDealt: number;
  damageTaken: number;
  survivors: number;
  veteransAlive: number;
  weather: GameState["weather"];
  actions: Action[];
  finalState: GameState;
}

export function playMission(
  initial: GameState,
  agent: Agent,
  agentSeed: number,
  reportedSeed = agentSeed,
): MissionRun {
  const rng = new Rng(deriveSeed(agentSeed, `agent:${agent.id}`));
  let state = initial;
  const actions: Action[] = [];

  let total = 0;
  let inTurn = 0;
  let turnMarker = state.turn;

  while (state.status === "playing" && total < MAX_TOTAL_ACTIONS) {
    if (state.turn !== turnMarker) {
      turnMarker = state.turn;
      inTurn = 0;
    }

    const action: Action =
      inTurn >= MAX_ACTIONS_PER_TURN ? { kind: "endTurn" } : agent.decide(state, rng);

    actions.push(action);
    const result = applyAction(state, action);
    state = result.state;
    total += 1;
    inTurn += 1;
  }

  const survivors = state.units.filter(
    (u) => u.faction === "player" && (u.alive || u.evacuated),
  );

  return {
    missionId: state.missionId,
    agentId: agent.id,
    seed: reportedSeed,
    status: state.status,
    reason: state.resultReason,
    coreObjectiveMet: coreObjectiveMet(state, getMission(state.missionId).victory),
    turnsUsed: Math.min(state.turn, state.maxTurns),
    playerRouted: state.stats.playerRouted,
    enemyRouted: state.stats.enemyRouted,
    evacuated: state.stats.playerEvacuated,
    damageDealt: state.stats.damageDealt,
    damageTaken: state.stats.damageTaken,
    survivors: survivors.length,
    veteransAlive: survivors.filter((u) => veterancyLevel(u.exp) >= 1).length,
    weather: state.weather,
    actions,
    finalState: state,
  };
}

/** 用章节初始花名册单跑一关，用于分关卡的平衡评估 */
export function playStandaloneMission(
  chapterId: string,
  missionId: string,
  agent: Agent,
  seed: number,
): MissionRun {
  const chapter = CHAPTERS[chapterId];
  if (!chapter) throw new Error(`未知章节: ${chapterId}`);
  const campaign = createCampaign(chapterId, seed);
  const mission = getMission(missionId);

  const deployed = campaign.roster
    .slice()
    .sort((a, b) => b.exp - a.exp || a.id.localeCompare(b.id))
    .slice(0, mission.playerSpawns.length);

  const state = createMissionState({
    mission,
    seed: deriveSeed(seed, mission.id),
    roster: deployed,
    inventory: campaign.inventory,
  });

  return playMission(state, agent, seed);
}

export interface CampaignRun {
  chapterId: string;
  agentId: string;
  seed: number;
  missions: MissionRun[];
  outcomes: MissionOutcome[];
  finalCampaign: CampaignState;
  missionsWon: number;
  veteransAtEnd: number;
  rosterAtEnd: number;
}

/**
 * @param agentFor 按关卡序号选择 Agent，用于「前一关重创后能否恢复」这类续跑测试
 */
export function playCampaign(
  chapterId: string,
  agentFor: Agent | ((missionIndex: number) => Agent),
  seed: number,
): CampaignRun {
  const pick = typeof agentFor === "function" ? agentFor : () => agentFor;
  let campaign = createCampaign(chapterId, seed);
  const missions: MissionRun[] = [];
  const outcomes: MissionOutcome[] = [];

  while (campaign.status === "running") {
    const index = missions.length;
    const started = startMission(campaign);
    const run = playMission(started.state, pick(index), seed + index);
    missions.push(run);
    const finished = finishMission(started.campaign, run.finalState, started.replacements);
    campaign = finished.campaign;
    outcomes.push(finished.outcome);
  }

  return {
    chapterId,
    agentId: typeof agentFor === "function" ? "mixed" : agentFor.id,
    seed,
    missions,
    outcomes,
    finalCampaign: campaign,
    missionsWon: missions.filter((m) => m.status === "won").length,
    veteransAtEnd: campaign.roster.filter((u) => veterancyLevel(u.exp) >= 1).length,
    rosterAtEnd: campaign.roster.length,
  };
}
