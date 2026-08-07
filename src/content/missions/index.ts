import { M1_BREAKTHROUGH } from "./m1-breakthrough";
import { M2_HOLD } from "./m2-hold";
import { M3_WITHDRAW } from "./m3-withdraw";
import type { MissionConfig } from "./schema";

export const MISSION_LIST: MissionConfig[] = [M1_BREAKTHROUGH, M2_HOLD, M3_WITHDRAW];

export const MISSIONS: Record<string, MissionConfig> = Object.fromEntries(
  MISSION_LIST.map((mission) => [mission.id, mission]),
);

export function getMission(id: string): MissionConfig {
  const mission = MISSIONS[id];
  if (!mission) throw new Error(`未知关卡: ${id}`);
  return mission;
}

export { M1_BREAKTHROUGH, M2_HOLD, M3_WITHDRAW };
export type { MissionConfig };
