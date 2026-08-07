import type { MissionConfig } from "../content/missions/schema";
import { requiredEvacuations } from "../core/mission";
import type { GameState } from "../core/types";

export interface ObjectiveLine {
  id: string;
  name: string;
  done: boolean;
  detail: string;
}

/** 战斗中与简报共用的目标清单 */
export function objectiveLines(battle: GameState, mission: MissionConfig | null): ObjectiveLine[] {
  const lines: ObjectiveLine[] = [];
  const victory = mission?.victory;

  if (battle.missionKind === "withdraw") {
    const required = requiredEvacuations(battle, {
      minEvacuated: victory?.minEvacuated ?? 3,
      evacuateRatio: victory?.evacuateRatio ?? 0.6,
      requireKeyUnit: victory?.requireKeyUnit ?? true,
    });
    const evacuated = battle.stats.playerEvacuated;
    const key = battle.units.find((u) => u.keyUnit);
    const keyDone = Boolean(key?.evacuated);
    const quotaDone = evacuated >= required;
    lines.push({
      id: "evac-quota",
      name: "撤离通道",
      done: quotaDone && (!victory?.requireKeyUnit || keyDone),
      detail: `已撤离 ${evacuated}/${required}${victory?.requireKeyUnit ? ` · 主力${keyDone ? "已撤" : "未撤"}` : ""}`,
    });
    return lines;
  }

  const holdTurns = victory?.holdTurns ?? 0;
  for (const objective of battle.objectives) {
    const owned = objective.owner === "player";
    if (battle.missionKind === "breakthrough") {
      lines.push({
        id: objective.id,
        name: objective.name,
        done: owned,
        detail: owned ? "已占领" : "未占领",
      });
    } else {
      lines.push({
        id: objective.id,
        name: objective.name,
        done: owned,
        detail: owned ? "据守中" : "已失守",
      });
    }
  }

  if (battle.missionKind === "breakthrough" && holdTurns > 0) {
    const allOwned =
      battle.objectives.length > 0 && battle.objectives.every((o) => o.owner === "player");
    lines.push({
      id: "hold-streak",
      name: "坚守计时",
      done: allOwned && battle.captureStreak >= holdTurns,
      detail: allOwned
        ? `${battle.captureStreak}/${holdTurns} 回合`
        : "需先占领全部目标",
    });
  }

  return lines;
}

export function briefVictoryLines(mission: MissionConfig): string[] {
  const lines: string[] = [];
  const v = mission.victory;
  if (mission.kind === "breakthrough") {
    for (const objective of mission.objectives) {
      lines.push(`占领并守住「${objective.name}」${v.holdTurns ? `（连续 ${v.holdTurns} 回合）` : ""}`);
    }
    if (v.minSurvivors) lines.push(`至少保留 ${v.minSurvivors} 支志愿军单位`);
  } else if (mission.kind === "hold") {
    for (const objective of mission.objectives) {
      lines.push(`坚守「${objective.name}」至回合结束`);
    }
    if (v.minPostsHeld) lines.push(`结束时至少持有 ${v.minPostsHeld} 处据点`);
    if (v.minSurvivors) lines.push(`至少保留 ${v.minSurvivors} 支志愿军单位`);
  } else if (mission.kind === "withdraw") {
    lines.push("将部队撤入北面撤离带");
    if (v.requireKeyUnit) lines.push("主力单位必须撤离");
    lines.push("撤离人数需达到编制比例要求");
  }
  return lines;
}
