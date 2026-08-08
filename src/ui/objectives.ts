import type { MissionConfig } from "../content/missions/schema";
import { requiredEvacuations, victoryProgress } from "../core/mission";
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

  if (!victory) return lines;

  // 与规则同源的收尾条件，说明「已占领却还没结束」的原因
  const progress = victoryProgress(battle, victory);
  if (battle.missionKind === "breakthrough" && progress.holdTurns > 1) {
    lines.push({
      id: "hold-streak",
      name: "坚守计时",
      done: progress.coreMet && progress.streak >= progress.holdTurns,
      detail: progress.coreMet
        ? `${progress.streak}/${progress.holdTurns} 回合`
        : "需先占领全部目标",
    });
  }
  if (battle.missionKind === "hold") {
    lines.push({
      id: "hold-clock",
      name: "坚守进度",
      done: battle.turn > battle.maxTurns,
      detail: `第 ${Math.min(battle.turn, battle.maxTurns)}/${battle.maxTurns} 回合`,
    });
  }
  if (progress.blocking) {
    lines.push({
      id: "victory-blocker",
      name: "尚未达成",
      done: false,
      detail: progress.blocking,
    });
  }

  return lines;
}

export function briefVictoryLines(mission: MissionConfig): string[] {
  const lines: string[] = [];
  const v = mission.victory;
  if (mission.kind === "breakthrough") {
    const holdTurns = v.holdTurns ?? 1;
    for (const objective of mission.objectives) {
      lines.push(
        `占领「${objective.name}」${holdTurns > 1 ? `并连续守住 ${holdTurns} 回合` : "（占领即达成）"}`,
      );
    }
    if (v.minSurvivors) lines.push(`至少保留 ${v.minSurvivors} 支志愿军单位`);
  } else if (mission.kind === "hold") {
    for (const objective of mission.objectives) {
      lines.push(`坚守「${objective.name}」至第 ${mission.maxTurns} 回合`);
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
