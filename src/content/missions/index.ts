import { HISTORICAL_MISSIONS } from "./historical-campaign";
import type { MissionConfig } from "./schema";

export const MISSION_LIST: MissionConfig[] = HISTORICAL_MISSIONS;

export const MISSIONS: Record<string, MissionConfig> = Object.fromEntries(
  MISSION_LIST.map((mission) => [mission.id, mission]),
);

export function getMission(id: string): MissionConfig {
  const mission = MISSIONS[id];
  if (!mission) throw new Error(`未知关卡: ${id}`);
  return mission;
}

export const M1_BREAKTHROUGH = MISSION_LIST[0]!;
export const M2_HOLD = MISSION_LIST[3]!;
export const M3_WITHDRAW = MISSION_LIST[6]!;
export { HISTORICAL_MISSIONS };
export type { MissionConfig };
