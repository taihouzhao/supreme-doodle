import type { ArmoryLevels, DefenseMode, DefenseVariant, SimulationSnapshot, TowerType } from "../core/types";

export interface PresentationState {
  selectedNodeId: string | null;
  selectedTowerId: string | null;
  selectedTowerType: TowerType;
  mode: DefenseMode;
  variant: DefenseVariant;
  quality: "high" | "low";
  armory: ArmoryLevels;
  reducedMotion: boolean;
}

export interface RendererDiagnostics {
  renderer: "three" | "canvas2d";
  staticCacheBuilds: number;
  loadedAssets: number;
  failedAssets: string[];
  activeVisuals: number;
}

export interface DefenseRenderer {
  readonly available: boolean;
  render(snapshot: SimulationSnapshot, presentation: PresentationState): void;
  resize(): void;
  resetCamera(): void;
  diagnostics(): RendererDiagnostics;
  dispose(): void;
}
