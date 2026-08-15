import type { ArmoryLevels, DefenseMode, StarResult, TowerType } from "./types";

export const PROFILE_STORAGE_KEY = "korea-defense.profile.v1";
export const PROFILE_VERSION = 1;

export interface DefenseProfileV1 {
  version: 1;
  stars: { normal: 0 | 1 | 2 | 3; hard: 0 | 1 | 2 | 3 };
  hardUnlocked: boolean;
  medals: number;
  armory: ArmoryLevels;
  tutorialCompleted: boolean;
  settings: {
    quality: "high" | "low";
    soundEnabled: boolean;
    volume: number;
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function levels(): ArmoryLevels {
  return { infantry: [0, 0, 0], machineGun: [0, 0, 0], mortar: [0, 0, 0] };
}

export function defaultProfile(): DefenseProfileV1 {
  return {
    version: PROFILE_VERSION,
    stars: { normal: 0, hard: 0 },
    hardUnlocked: false,
    medals: 0,
    armory: levels(),
    tutorialCompleted: false,
    settings: { quality: "high", soundEnabled: true, volume: 0.65 },
  };
}

function isTowerType(value: unknown): value is TowerType {
  return value === "infantry" || value === "machineGun" || value === "mortar";
}

function parseProfile(value: unknown): DefenseProfileV1 | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== PROFILE_VERSION) return null;
  const rawStars = raw.stars;
  const rawArmory = raw.armory;
  const rawSettings = raw.settings;
  if (!rawStars || typeof rawStars !== "object" || !rawArmory || typeof rawArmory !== "object" || !rawSettings || typeof rawSettings !== "object") return null;
  const stars = rawStars as Record<string, unknown>;
  const armory = rawArmory as Record<string, unknown>;
  const settings = rawSettings as Record<string, unknown>;
  if (!["normal", "hard"].every((mode) => Number.isInteger(stars[mode]) && Number(stars[mode]) >= 0 && Number(stars[mode]) <= 3)) return null;
  if (!["infantry", "machineGun", "mortar"].every((type) => {
    const values = armory[type];
    return isTowerType(type) && Array.isArray(values) && values.length === 3 && values.every((item) => Number.isInteger(item) && Number(item) >= 0 && Number(item) <= 1);
  })) return null;
  if (typeof settings.quality !== "string" || !["high", "low"].includes(settings.quality) || typeof settings.soundEnabled !== "boolean" || typeof settings.volume !== "number" || settings.volume < 0 || settings.volume > 1) return null;
  return {
    version: 1,
    stars: { normal: Number(stars.normal) as 0 | 1 | 2 | 3, hard: Number(stars.hard) as 0 | 1 | 2 | 3 },
    hardUnlocked: raw.hardUnlocked === true || Number(stars.normal) >= 1,
    medals: Number.isInteger(raw.medals) && Number(raw.medals) >= 0 ? Number(raw.medals) : 0,
    armory: {
      infantry: [...(armory.infantry as number[])] as [number, number, number],
      machineGun: [...(armory.machineGun as number[])] as [number, number, number],
      mortar: [...(armory.mortar as number[])] as [number, number, number],
    },
    tutorialCompleted: raw.tutorialCompleted === true,
    settings: { quality: settings.quality as "high" | "low", soundEnabled: settings.soundEnabled, volume: settings.volume },
  };
}

function storageOrNull(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof globalThis.localStorage === "undefined") return null;
  return globalThis.localStorage;
}

export function loadProfile(storage?: StorageLike): DefenseProfileV1 {
  const target = storageOrNull(storage);
  if (!target) return defaultProfile();
  const raw = target.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return defaultProfile();
  try {
    const profile = parseProfile(JSON.parse(raw) as unknown);
    if (profile) return profile;
  } catch {
    // Preserve the original bytes below for diagnosis, then fail closed.
  }
  try {
    target.setItem(`${PROFILE_STORAGE_KEY}.corrupt.${Date.now()}`, raw);
  } catch {
    // A read-only/private storage still gets a safe default.
  }
  return defaultProfile();
}

export function saveProfile(profile: DefenseProfileV1, storage?: StorageLike): void {
  const target = storageOrNull(storage);
  if (!target) return;
  target.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function applyMissionResult(profile: DefenseProfileV1, mode: DefenseMode, result: StarResult): number {
  if (result.stars <= profile.stars[mode]) return 0;
  const gained = result.stars - profile.stars[mode];
  profile.stars[mode] = result.stars;
  profile.medals += gained;
  if (mode === "normal" && result.stars >= 1) profile.hardUnlocked = true;
  return gained;
}

export function buyArmoryUpgrade(profile: DefenseProfileV1, type: TowerType): boolean {
  const values = profile.armory[type];
  const index = values.findIndex((level) => level === 0);
  if (index < 0 || profile.medals < 1) return false;
  profile.medals -= 1;
  values[index] = 1;
  return true;
}

export function resetArmory(profile: DefenseProfileV1): number {
  let returned = 0;
  for (const type of ["infantry", "machineGun", "mortar"] as const) {
    for (const value of profile.armory[type]) returned += value;
    profile.armory[type] = [0, 0, 0];
  }
  profile.medals += returned;
  return returned;
}
