import type { CampaignState } from "../core/campaign";
import type { Action } from "../core/types";

const SAVE_KEY = "korea-tactics/save/v3";
const LEGACY_SAVE_KEY = "korea-tactics/save/v2";
const REPLAY_KEY = "korea-tactics/replays/v1";
const FX_SPEED_KEY = "korea-tactics/fx-speed/v1";

export interface SaveData {
  campaign: CampaignState;
  savedAt: number;
  version?: 3;
}

export interface ReplayRecord {
  chapterId: string;
  missionId: string;
  seed: number;
  status: string;
  actions: Action[];
  recordedAt: number;
}

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储不可用时静默降级，不影响游玩
  }
}

export function loadSave(): SaveData | null {
  const current = safeRead<SaveData>(SAVE_KEY);
  if (current?.campaign) {
    const campaign =
      current.campaign.schemaVersion === 3 && Array.isArray(current.campaign.attachments)
        ? current.campaign
        : migrateV2Campaign(current.campaign);
    return { ...current, campaign, version: 3 };
  }
  const legacy = safeRead<{ campaign: CampaignState; savedAt: number }>(LEGACY_SAVE_KEY);
  if (!legacy?.campaign) return null;
  return { campaign: migrateV2Campaign(legacy.campaign), savedAt: legacy.savedAt, version: 3 };
}

export function writeSave(campaign: CampaignState): void {
  safeWrite(SAVE_KEY, { campaign, savedAt: Date.now(), version: 3 } satisfies SaveData);
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(LEGACY_SAVE_KEY);
  } catch {
    // 忽略
  }
}

/** v2→v3：保留所有单位当前武器，并按实际已装备数量补足有限库存；附件从空库存开始。 */
function migrateV2Campaign(raw: CampaignState): CampaignState {
  const campaign = structuredClone(raw);
  campaign.schemaVersion = 3;
  campaign.attachments ??= [];
  campaign.preMissionClaimed ??= [];
  for (const unit of campaign.roster ?? []) {
    const owned = campaign.armory.filter((id) => id === unit.weapon).length;
    const equipped = campaign.roster.filter((entry) => entry.weapon === unit.weapon).length;
    for (let i = owned; i < equipped; i += 1) campaign.armory.push(unit.weapon);
    delete unit.attachment;
  }
  campaign.history = (campaign.history ?? []).map((outcome) => ({
    ...outcome,
    attachmentsGained: outcome.attachmentsGained ?? [],
  }));
  return campaign;
}

/** 交战动画倍速，1 为默认节奏 */
export function loadFxSpeed(): number {
  const value = safeRead<number>(FX_SPEED_KEY);
  return value === 2 || value === 3 ? value : 1;
}

export function writeFxSpeed(speed: number): void {
  safeWrite(FX_SPEED_KEY, speed);
}

export function loadReplays(): ReplayRecord[] {
  return safeRead<ReplayRecord[]>(REPLAY_KEY) ?? [];
}

export function appendReplay(record: ReplayRecord): void {
  const replays = loadReplays();
  replays.unshift(record);
  safeWrite(REPLAY_KEY, replays.slice(0, 12));
}

export function downloadReplay(record: ReplayRecord): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${record.missionId}-seed${record.seed}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
