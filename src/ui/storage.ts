import type { CampaignState } from "../core/campaign";
import type { Action } from "../core/types";

const SAVE_KEY = "korea-tactics/save/v2";
const REPLAY_KEY = "korea-tactics/replays/v1";
const FX_SPEED_KEY = "korea-tactics/fx-speed/v1";

export interface SaveData {
  campaign: CampaignState;
  savedAt: number;
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
  return safeRead<SaveData>(SAVE_KEY);
}

export function writeSave(campaign: CampaignState): void {
  safeWrite(SAVE_KEY, { campaign, savedAt: Date.now() } satisfies SaveData);
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 忽略
  }
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
