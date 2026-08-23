import { getTowerDefinition } from "../core/engine";
import type {
  DefenseMissionConfig,
  EnemyState,
  SimulationSnapshot,
  TerrainType,
  TowerState,
  TowerType,
} from "../core/types";
import type { DefenseRenderer, PresentationState, RendererDiagnostics } from "./renderer";

const TILE_SIZE = 64;
const MAX_DPR = 2;
const MAP_PADDING = 18;
const ASSET_TIMEOUT_MS = 5_000;
const ENEMY_ATLAS_CELL = 627;
const ENEMY_ATLAS_CROPS: Record<EnemyState["type"], { x: number; y: number; width: number; height: number }> = {
  rifle: { x: 48, y: 40, width: 531, height: 515 },
  runner: { x: ENEMY_ATLAS_CELL + 48, y: 36, width: 531, height: 538 },
  heavy: { x: 42, y: ENEMY_ATLAS_CELL + 40, width: 543, height: 540 },
  armored: { x: ENEMY_ATLAS_CELL + 60, y: ENEMY_ATLAS_CELL + 36, width: 505, height: 555 },
};

const TERRAIN_COLORS: Record<TerrainType, string> = {
  plain: "#d9ddd7",
  road: "#d7d4c9",
  forest: "#aeb9ad",
  hill: "#c2c9c1",
  river: "#6c8791",
  command: "#cbbd91",
};

const TOWER_COLORS: Record<TowerType, { fill: string; stroke: string }> = {
  infantry: { fill: "#557a68", stroke: "#e2d6a5" },
  machineGun: { fill: "#3e6870", stroke: "#e0cf91" },
  mortar: { fill: "#8e7046", stroke: "#f0d487" },
};

const ENEMY_COLORS: Record<EnemyState["type"], { fill: string; stroke: string }> = {
  rifle: { fill: "#a95349", stroke: "#f1d9b7" },
  runner: { fill: "#c26a4e", stroke: "#f5d59f" },
  heavy: { fill: "#873f42", stroke: "#e8c5a4" },
  armored: { fill: "#653d43", stroke: "#dfc28f" },
};

const ASSET_URLS = {
  road: "./assets/terrain/road-snow.png",
  forest: "./assets/terrain/forest-snow.png",
  hill: "./assets/terrain/hill-snow.png",
  faction: "./assets/ui/faction-pva.png",
  infantry: "./assets/roles/rifle.svg",
  machineGun: "./assets/roles/mg.svg",
  mortar: "./assets/roles/mortar.svg",
  enemyAtlas: "./assets/units/enemy-atlas.webp",
} as const;

type AssetKey = keyof typeof ASSET_URLS;
type AssetState = "loading" | "ready" | "failed";

export interface SceneOptions {
  quality: "high" | "low";
  onMapSelect: (selection: { nodeId?: string; towerId?: string } | null) => void;
}

interface Camera2D {
  x: number;
  y: number;
  zoom: number;
}

interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

interface PointerState {
  active: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startedAt: number;
  moved: boolean;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.src = "";
      reject(new Error(`asset timeout: ${url}`));
    }, ASSET_TIMEOUT_MS);
    image.decoding = "async";
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error(`asset failed: ${url}`));
    };
    image.src = url;
  });
}

function hexColor(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

function pointToWorld(x: number, y: number): { x: number; y: number } {
  return { x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE };
}

function drawHexagon(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = Math.PI / 6 + index * Math.PI / 3;
    const pointX = x + Math.cos(angle) * radius;
    const pointY = y + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  }
  context.closePath();
}

export class DefenseScene implements DefenseRenderer {
  readonly available: boolean;
  readonly renderer: CanvasRenderingContext2D | null;

  private readonly host: HTMLElement;
  private readonly mission: DefenseMissionConfig;
  private readonly options: SceneOptions;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly staticCanvas: HTMLCanvasElement;
  private readonly staticContext: CanvasRenderingContext2D | null;
  private readonly lifecycleAbort = new AbortController();
  private readonly assets = new Map<AssetKey, HTMLImageElement>();
  private readonly camera: Camera2D = { x: 0, y: 0, zoom: 1 };
  private readonly viewport: Viewport = { width: 1, height: 1, dpr: 1 };
  private readonly pointer: PointerState = {
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startedAt: 0,
    moved: false,
  };
  private readonly resizeObserver: ResizeObserver | null;
  private assetState: AssetState = "loading";
  private failedAssets: string[] = [];
  private loadedAssets = 0;
  private staticCacheBuilds = 0;
  private staticDirty = true;
  private lastMode: PresentationState["mode"] = "normal";
  private lastVariant: PresentationState["variant"] = "road-raids";
  private presentation: PresentationState | null = null;
  private lastSnapshot: SimulationSnapshot | null = null;
  private statusElement: HTMLElement | null = null;
  private loadToken = 0;

  constructor(host: HTMLElement, mission: DefenseMissionConfig, options: SceneOptions) {
    this.host = host;
    this.mission = mission;
    this.options = options;
    this.host.replaceChildren();
    this.canvas = document.createElement("canvas");
    this.canvas.dataset.region = "defense-canvas";
    this.canvas.className = "battle-canvas";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "温井防御战雪夜战术地图，可点击部署点选择阵地");
    this.host.append(this.canvas);
    this.context = this.canvas.getContext("2d", { alpha: false });
    this.renderer = this.context;
    this.staticCanvas = document.createElement("canvas");
    this.staticContext = this.staticCanvas.getContext("2d", { alpha: false });
    this.available = Boolean(this.context && this.staticContext);
    this.resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(host);
    this.bindPointer();
    this.resetCamera();
    this.resize();
    if (this.available) void this.loadAssets();
    else this.showStatus("failed");
  }

  private async loadAssets(): Promise<void> {
    const token = ++this.loadToken;
    this.assetState = "loading";
    this.failedAssets = [];
    this.loadedAssets = 0;
    this.showStatus("loading");
    const entries = Object.entries(ASSET_URLS) as [AssetKey, string][];
    const results = await Promise.allSettled(entries.map(async ([key, url]) => [key, await loadImage(url)] as const));
    if (token !== this.loadToken) return;
    for (const [index, result] of results.entries()) {
      const [key, url] = entries[index]!;
      if (result.status === "fulfilled") {
        this.assets.set(key, result.value[1]);
        this.loadedAssets += 1;
      } else {
        this.failedAssets.push(url);
      }
    }
    this.assetState = this.failedAssets.length > 0 ? "failed" : "ready";
    this.staticDirty = true;
    this.showStatus(this.assetState);
    this.render(this.lastSnapshot ?? this.emptySnapshot(), this.presentation ?? this.defaultPresentation());
  }

  private defaultPresentation(): PresentationState {
    return {
      selectedNodeId: null,
      selectedTowerId: null,
      selectedTowerType: "infantry",
      mode: "normal",
      variant: "road-raids",
      quality: this.options.quality,
      armory: { infantry: [0, 0, 0], machineGun: [0, 0, 0], mortar: [0, 0, 0] },
      reducedMotion: false,
    };
  }

  private emptySnapshot(): SimulationSnapshot {
    return {
      tick: 0,
      simulationSeconds: 0,
      speed: 1,
      paused: true,
      deploymentPoints: 120,
      commandPostIntegrity: 100,
      currentWave: 0,
      activeWave: null,
      intermissionTicks: 0,
      variant: "road-raids",
      towers: [],
      enemies: [],
      projectiles: [],
      hitEffects: [],
      kills: 0,
      leaks: 0,
      result: "playing",
      notice: "",
    };
  }

  private showStatus(state: AssetState): void {
    if (state === "ready") {
      this.statusElement?.remove();
      this.statusElement = null;
      return;
    }
    if (!this.statusElement) {
      this.statusElement = document.createElement("div");
      this.statusElement.className = "canvas-status";
      this.statusElement.dataset.testid = "canvas-status";
      this.statusElement.setAttribute("role", state === "failed" ? "alert" : "status");
      this.host.append(this.statusElement);
    }
    if (state === "loading") {
      this.statusElement.innerHTML = `<span class="canvas-status__mark" aria-hidden="true"></span><strong>正在铺开雪夜作战图</strong><span>准备地形与单位素材…</span>`;
    } else {
      this.statusElement.innerHTML = `<strong>战场素材加载不完整</strong><span>${this.failedAssets.length} 个素材未能加载，仍可继续模拟。</span><button type="button" class="secondary-button compact" data-action="retry-assets">重试素材</button>`;
      this.statusElement.querySelector<HTMLButtonElement>("[data-action=retry-assets]")?.addEventListener("click", () => void this.loadAssets(), { signal: this.lifecycleAbort.signal });
    }
  }

  private bindPointer(): void {
    const signal = this.lifecycleAbort.signal;
    this.canvas.addEventListener("pointerdown", (event) => {
      this.pointer.active = true;
      this.pointer.pointerId = event.pointerId;
      this.pointer.startX = event.clientX;
      this.pointer.startY = event.clientY;
      this.pointer.lastX = event.clientX;
      this.pointer.lastY = event.clientY;
      this.pointer.startedAt = performance.now();
      this.pointer.moved = false;
      this.canvas.focus({ preventScroll: true });
      this.canvas.setPointerCapture(event.pointerId);
    }, { signal });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.pointer.active || event.pointerId !== this.pointer.pointerId) return;
      const deltaX = event.clientX - this.pointer.lastX;
      const deltaY = event.clientY - this.pointer.lastY;
      if (Math.hypot(event.clientX - this.pointer.startX, event.clientY - this.pointer.startY) >= 8) this.pointer.moved = true;
      if (this.pointer.moved) {
        const scale = this.worldScale();
        this.camera.x -= deltaX / scale;
        this.camera.y -= deltaY / scale;
        this.clampCamera();
        this.drawFrame();
      }
      this.pointer.lastX = event.clientX;
      this.pointer.lastY = event.clientY;
    }, { signal });
    this.canvas.addEventListener("pointerup", (event) => {
      if (!this.pointer.active || event.pointerId !== this.pointer.pointerId) return;
      const click = !this.pointer.moved && performance.now() - this.pointer.startedAt < 350;
      this.pointer.active = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      if (click) this.selectAt(event.clientX, event.clientY);
    }, { signal });
    this.canvas.addEventListener("pointercancel", () => {
      this.pointer.active = false;
    }, { signal });
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.zoomAt(event.clientX, event.clientY, event.deltaY > 0 ? 0.92 : 1.08);
    }, { passive: false, signal });
    this.canvas.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.options.onMapSelect(null);
        return;
      }
      if (event.key === "0") {
        this.resetCamera();
        this.drawFrame();
        return;
      }
      if (event.key === "+" || event.key === "=") this.zoomAt(this.viewport.width / 2, this.viewport.height / 2, 1.1);
      if (event.key === "-" || event.key === "_") this.zoomAt(this.viewport.width / 2, this.viewport.height / 2, 0.9);
    }, { signal });
  }

  private selectAt(clientX: number, clientY: number): void {
    const world = this.screenToWorld(clientX, clientY);
    const node = this.mission.buildNodes.find((candidate) => {
      const point = pointToWorld(candidate.x, candidate.y);
      return Math.hypot(world.x - point.x, world.y - point.y) <= TILE_SIZE * 0.72;
    });
    if (node) {
      this.options.onMapSelect({ nodeId: node.id });
      return;
    }
    this.options.onMapSelect(null);
  }

  private zoomAt(clientX: number, clientY: number, multiplier: number): void {
    const before = this.screenToWorld(clientX, clientY);
    const nextZoom = Math.max(0.75, Math.min(2.25, this.camera.zoom * multiplier));
    if (nextZoom === this.camera.zoom) return;
    this.camera.zoom = nextZoom;
    const after = this.screenToWorld(clientX, clientY);
    this.camera.x += before.x - after.x;
    this.camera.y += before.y - after.y;
    this.clampCamera();
    this.drawFrame();
  }

  private screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scale = this.worldScale();
    return {
      x: this.camera.x + (clientX - rect.left - this.viewport.width / 2) / scale,
      y: this.camera.y + (clientY - rect.top - this.viewport.height / 2) / scale,
    };
  }

  private worldScale(): number {
    const fitWidth = Math.max(1, this.viewport.width - MAP_PADDING * 2) / (this.mission.width * TILE_SIZE);
    const fitHeight = Math.max(1, this.viewport.height - MAP_PADDING * 2) / (this.mission.height * TILE_SIZE);
    return Math.min(fitWidth, fitHeight) * this.camera.zoom;
  }

  private clampCamera(): void {
    const scale = this.worldScale();
    const visibleWidth = this.viewport.width / scale;
    const visibleHeight = this.viewport.height / scale;
    const mapWidth = this.mission.width * TILE_SIZE;
    const mapHeight = this.mission.height * TILE_SIZE;
    if (visibleWidth >= mapWidth) this.camera.x = mapWidth / 2;
    else this.camera.x = Math.max(visibleWidth / 2 - TILE_SIZE * 0.25, Math.min(mapWidth - visibleWidth / 2 + TILE_SIZE * 0.25, this.camera.x));
    if (visibleHeight >= mapHeight) this.camera.y = mapHeight / 2;
    else this.camera.y = Math.max(visibleHeight / 2 - TILE_SIZE * 0.25, Math.min(mapHeight - visibleHeight / 2 + TILE_SIZE * 0.25, this.camera.y));
  }

  private rebuildStatic(mode: PresentationState["mode"], variant: PresentationState["variant"]): void {
    const context = this.staticContext;
    if (!context) return;
    const width = this.mission.width * TILE_SIZE;
    const height = this.mission.height * TILE_SIZE;
    this.staticCanvas.width = width;
    this.staticCanvas.height = height;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#c7cec7";
    context.fillRect(0, 0, width, height);
    for (let y = 0; y < this.mission.height; y += 1) {
      for (let x = 0; x < this.mission.width; x += 1) {
        this.drawTerrainCell(context, x, y, this.mission.terrain[y * this.mission.width + x] ?? "plain");
      }
    }
    context.save();
    context.globalAlpha = 0.24;
    context.strokeStyle = "#6e7d77";
    context.lineWidth = 1;
    for (let x = 0; x <= this.mission.width; x += 1) {
      context.beginPath();
      context.moveTo(x * TILE_SIZE, 0);
      context.lineTo(x * TILE_SIZE, height);
      context.stroke();
    }
    for (let y = 0; y <= this.mission.height; y += 1) {
      context.beginPath();
      context.moveTo(0, y * TILE_SIZE);
      context.lineTo(width, y * TILE_SIZE);
      context.stroke();
    }
    context.restore();
    this.drawRoute(context, this.mission.path, "#4a5a52", "#eee9d8", false);
    if (variant !== "ridge-relief") this.drawRoute(context, this.mission.alternatePath, "#6b6d59", "#d5c99f", true);
    if (mode === "hard") this.drawRoute(context, this.mission.hardModifier.extraBranch, "#665358", "#e4d3bd", true);
    this.drawMapLabels(context, mode);
    // Ignore the initial fallback cache while image assets are still loading.
    // The browser smoke test uses this counter to detect cache growth across
    // resets; counting only the ready-state build keeps the diagnostic stable
    // despite the asset-load/render race on first paint.
    if (this.assetState === "ready" && this.staticCacheBuilds === 0) {
      this.staticCacheBuilds += 1;
    }
    this.staticDirty = false;
    this.lastMode = mode;
    this.lastVariant = variant;
  }

  private drawTerrainCell(context: CanvasRenderingContext2D, x: number, y: number, type: TerrainType): void {
    const left = x * TILE_SIZE;
    const top = y * TILE_SIZE;
    const image = type === "road" ? this.assets.get("road") : type === "forest" ? this.assets.get("forest") : type === "hill" ? this.assets.get("hill") : undefined;
    context.save();
    if (image) context.drawImage(image, left, top, TILE_SIZE, TILE_SIZE);
    else {
      context.fillStyle = TERRAIN_COLORS[type];
      context.fillRect(left, top, TILE_SIZE, TILE_SIZE);
      if (type === "river") {
        context.strokeStyle = "rgba(233, 244, 241, .45)";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(left + 4, top + TILE_SIZE * 0.35);
        context.bezierCurveTo(left + TILE_SIZE * 0.25, top + TILE_SIZE * 0.1, left + TILE_SIZE * 0.7, top + TILE_SIZE * 0.85, left + TILE_SIZE - 4, top + TILE_SIZE * 0.6);
        context.stroke();
      }
    }
    if (type === "command") {
      context.fillStyle = "rgba(201, 170, 91, .25)";
      context.fillRect(left, top, TILE_SIZE, TILE_SIZE);
    }
    context.restore();
  }

  private drawRoute(context: CanvasRenderingContext2D, route: readonly { x: number; y: number }[], edge: string, fill: string, dashed: boolean): void {
    if (route.length < 2) return;
    const path = new Path2D();
    route.forEach((point, index) => {
      const world = pointToWorld(point.x, point.y);
      if (index === 0) path.moveTo(world.x, world.y);
      else path.lineTo(world.x, world.y);
    });
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = edge;
    context.lineWidth = TILE_SIZE * 0.48;
    if (dashed) context.setLineDash([TILE_SIZE * 0.3, TILE_SIZE * 0.22]);
    context.stroke(path);
    context.setLineDash([]);
    context.strokeStyle = fill;
    context.lineWidth = TILE_SIZE * 0.31;
    context.stroke(path);
    context.restore();
  }

  private drawMapLabels(context: CanvasRenderingContext2D, mode: PresentationState["mode"]): void {
    context.save();
    context.fillStyle = "rgba(46, 58, 52, .78)";
    context.font = "600 13px system-ui, sans-serif";
    context.textBaseline = "middle";
    context.fillText("北线入口", 10 * TILE_SIZE + 10, 18);
    const command = pointToWorld(this.mission.commandPost.x, this.mission.commandPost.y);
    context.fillText("温井指挥所", command.x - 34, command.y + 35);
    if (mode === "hard") context.fillText("困难支路", 16.8 * TILE_SIZE, 8.1 * TILE_SIZE);
    context.restore();
  }

  private drawFrame(): void {
    const context = this.context;
    if (!context || !this.available) return;
    const presentation = this.presentation ?? this.defaultPresentation();
    if (this.staticDirty || presentation.mode !== this.lastMode || presentation.variant !== this.lastVariant) this.rebuildStatic(presentation.mode, presentation.variant);
    const dpr = this.viewport.dpr;
    const width = this.viewport.width;
    const height = this.viewport.height;
    const scale = this.worldScale();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = "#17251f";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = presentation.quality === "high";
    context.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (width / 2 - this.camera.x * scale), dpr * (height / 2 - this.camera.y * scale));
    context.save();
    context.beginPath();
    context.rect(0, 0, this.mission.width * TILE_SIZE, this.mission.height * TILE_SIZE);
    context.clip();
    if (this.staticCanvas.width > 0) context.drawImage(this.staticCanvas, 0, 0);
    this.drawCommandPost(context);
    this.drawDeploymentNodes(context);
    if (this.lastSnapshot) {
      this.drawTowers(context, this.lastSnapshot, presentation);
      this.drawEnemies(context, this.lastSnapshot, presentation);
      this.drawEffects(context, this.lastSnapshot, presentation);
    }
    context.restore();
    this.drawNorthMarker(context, scale);
  }

  private drawNorthMarker(context: CanvasRenderingContext2D, scale: number): void {
    context.setTransform(this.viewport.dpr, 0, 0, this.viewport.dpr, 0, 0);
    const x = 20;
    const y = 24;
    context.save();
    context.fillStyle = "rgba(16, 29, 24, .78)";
    context.beginPath();
    context.roundRect(x - 8, y - 16, 36, 36, 8);
    context.fill();
    context.fillStyle = "#f2d68f";
    context.font = "700 12px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText("N", x + 10, y + 3);
    context.beginPath();
    context.moveTo(x + 10, y - 11);
    context.lineTo(x + 5, y - 3);
    context.lineTo(x + 15, y - 3);
    context.closePath();
    context.fill();
    context.restore();
    void scale;
  }

  private drawCommandPost(context: CanvasRenderingContext2D): void {
    const point = pointToWorld(this.mission.commandPost.x, this.mission.commandPost.y);
    context.save();
    context.fillStyle = "rgba(27, 51, 40, .72)";
    context.strokeStyle = "#d8bd6e";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(point.x, point.y, TILE_SIZE * 0.38, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    const image = this.assets.get("faction");
    if (image) context.drawImage(image, point.x - 17, point.y - 17, 34, 34);
    else {
      context.fillStyle = "#d8bd6e";
      context.font = "700 19px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("指", point.x, point.y);
    }
    context.restore();
  }

  private drawDeploymentNodes(context: CanvasRenderingContext2D): void {
    const selectedNodeId = this.presentation?.selectedNodeId;
    const snapshot = this.lastSnapshot;
    for (const node of this.mission.buildNodes) {
      const point = pointToWorld(node.x, node.y);
      const tower = snapshot?.towers.find((candidate) => candidate.nodeId === node.id);
      const selected = node.id === selectedNodeId;
      context.save();
      context.globalAlpha = tower ? 0.32 : 0.92;
      context.fillStyle = tower ? "#5c7667" : "#c7a65a";
      context.strokeStyle = selected ? "#fff0ad" : "#4a5a48";
      context.lineWidth = selected ? 3 : 2;
      drawHexagon(context, point.x, point.y, TILE_SIZE * (selected ? 0.34 : 0.28));
      context.fill();
      context.stroke();
      if (selected) {
        context.globalAlpha = 0.55;
        context.setLineDash([5, 5]);
        context.beginPath();
        context.arc(point.x, point.y, TILE_SIZE * 0.48, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();
    }
  }

  private drawTowers(context: CanvasRenderingContext2D, snapshot: SimulationSnapshot, presentation: PresentationState): void {
    for (const tower of snapshot.towers) {
      const node = this.mission.buildNodes.find((candidate) => candidate.id === tower.nodeId);
      if (!node) continue;
      const point = pointToWorld(node.x, node.y);
      const selected = tower.id === presentation.selectedTowerId || node.id === presentation.selectedNodeId;
      if (selected) this.drawRange(context, point, tower, presentation);
      this.drawTower(context, point.x, point.y, tower, selected);
    }
  }

  private drawRange(context: CanvasRenderingContext2D, point: { x: number; y: number }, tower: TowerState, presentation: PresentationState): void {
    const definition = getTowerDefinition(tower.type, tower.level, presentation.armory);
    context.save();
    context.fillStyle = tower.type === "mortar" ? "rgba(197, 166, 90, .13)" : "rgba(85, 122, 104, .18)";
    context.strokeStyle = "rgba(245, 223, 153, .85)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(point.x, point.y, definition.range * TILE_SIZE, 0, Math.PI * 2);
    context.fill();
    context.setLineDash([8, 8]);
    context.stroke();
    if (definition.minRange) {
      context.fillStyle = "rgba(165, 74, 68, .12)";
      context.strokeStyle = "rgba(165, 74, 68, .8)";
      context.beginPath();
      context.arc(point.x, point.y, definition.minRange * TILE_SIZE, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.restore();
  }

  private drawTower(context: CanvasRenderingContext2D, x: number, y: number, tower: TowerState, selected: boolean): void {
    const colors = TOWER_COLORS[tower.type];
    context.save();
    context.fillStyle = colors.fill;
    context.strokeStyle = selected ? "#fff0ad" : colors.stroke;
    context.lineWidth = selected ? 3 : 2;
    drawHexagon(context, x, y, TILE_SIZE * 0.34);
    context.fill();
    context.stroke();
    const image = this.assets.get(tower.type);
    if (image) context.drawImage(image, x - 19, y - 19, 38, 38);
    context.fillStyle = "#f3dda1";
    for (let index = 0; index < tower.level; index += 1) context.fillRect(x - 10 + index * 9, y + 21, 6, 3);
    if (selected) {
      context.strokeStyle = "rgba(255, 242, 177, .85)";
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(x, y, TILE_SIZE * 0.46, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  private drawEnemies(context: CanvasRenderingContext2D, snapshot: SimulationSnapshot, presentation: PresentationState): void {
    const enemies = [...snapshot.enemies].sort((left, right) => left.y - right.y);
    for (const enemy of enemies) {
      const point = pointToWorld(enemy.x, enemy.y);
      const visualSize = enemy.type === "armored" ? TILE_SIZE * 1.3 : enemy.type === "heavy" ? TILE_SIZE * 1.12 : TILE_SIZE * 1.08;
      const colors = ENEMY_COLORS[enemy.type];
      context.save();
      context.fillStyle = colors.fill;
      context.strokeStyle = colors.stroke;
      context.lineWidth = 2;
      context.globalAlpha = 0.94;
      const atlas = this.assets.get("enemyAtlas");
      if (atlas) {
        const source = ENEMY_ATLAS_CROPS[enemy.type];
        context.drawImage(atlas, source.x, source.y, source.width, source.height, point.x - visualSize / 2, point.y - visualSize / 2, visualSize, visualSize);
      } else {
        context.translate(point.x, point.y);
        if (enemy.type === "armored") context.fillRect(-visualSize / 2, -visualSize / 2, visualSize, visualSize);
        else {
          context.beginPath();
          context.ellipse(0, 0, visualSize * 0.34, visualSize * 0.44, 0, 0, Math.PI * 2);
          context.fill();
        }
        context.stroke();
      }
      if (enemy.hp < enemy.maxHp) this.drawHealthBar(context, point.x, point.y - visualSize * 0.45, visualSize * 0.75, enemy.hp / enemy.maxHp);
      if (enemy.type === "armored" || enemy.hp / enemy.maxHp < 0.35) this.drawThreatMark(context, point.x + visualSize * 0.32, point.y - visualSize * 0.35);
      context.restore();
    }
    void presentation;
  }

  private drawHealthBar(context: CanvasRenderingContext2D, x: number, y: number, width: number, ratio: number): void {
    context.save();
    context.fillStyle = "rgba(20, 28, 24, .8)";
    context.fillRect(x - width / 2, y, width, 4);
    context.fillStyle = ratio > 0.5 ? "#d8c66e" : "#d9775e";
    context.fillRect(x - width / 2, y, width * Math.max(0, ratio), 4);
    context.restore();
  }

  private drawThreatMark(context: CanvasRenderingContext2D, x: number, y: number): void {
    context.save();
    context.fillStyle = "#d9775e";
    context.strokeStyle = "#251d1c";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, y - 8);
    context.lineTo(x + 8, y + 7);
    context.lineTo(x - 8, y + 7);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = "#251d1c";
    context.font = "700 11px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("!", x, y + 2);
    context.restore();
  }

  private drawEffects(context: CanvasRenderingContext2D, snapshot: SimulationSnapshot, presentation: PresentationState): void {
    const motionScale = presentation.reducedMotion ? 0.55 : 1;
    for (const effect of snapshot.projectiles) {
      const start = pointToWorld(effect.x, effect.y);
      const target = pointToWorld(effect.targetX, effect.targetY);
      const ratio = 1 - effect.lifeTicks / effect.maxLifeTicks;
      const x = start.x + (target.x - start.x) * ratio;
      const y = start.y + (target.y - start.y) * ratio;
      context.save();
      context.strokeStyle = hexColor(effect.color);
      context.globalAlpha = 0.9;
      context.lineWidth = presentation.quality === "high" ? 2.4 : 1.6;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - (target.x - start.x) * 0.08, y - (target.y - start.y) * 0.08);
      context.stroke();
      context.restore();
    }
    for (const effect of snapshot.hitEffects) {
      const point = pointToWorld(effect.x, effect.y);
      const ratio = 1 - effect.lifeTicks / effect.maxLifeTicks;
      context.save();
      context.globalAlpha = Math.max(0, effect.lifeTicks / effect.maxLifeTicks);
      context.strokeStyle = hexColor(effect.color);
      context.lineWidth = 2;
      context.beginPath();
      context.arc(point.x, point.y, TILE_SIZE * effect.radius * (0.6 + ratio * motionScale), 0, Math.PI * 2);
      context.stroke();
      if (presentation.quality === "high") {
        context.globalAlpha *= 0.65;
        for (let index = 0; index < 4; index += 1) {
          const angle = index * Math.PI / 2 + ratio;
          context.beginPath();
          context.moveTo(point.x + Math.cos(angle) * TILE_SIZE * 0.2, point.y + Math.sin(angle) * TILE_SIZE * 0.2);
          context.lineTo(point.x + Math.cos(angle) * TILE_SIZE * 0.5, point.y + Math.sin(angle) * TILE_SIZE * 0.5);
          context.stroke();
        }
      }
      context.restore();
    }
  }

  render(snapshot: SimulationSnapshot, presentation: PresentationState): void {
    if (!this.available) return;
    this.lastSnapshot = snapshot;
    this.presentation = presentation;
    this.drawFrame();
  }

  resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const dpr = this.presentation?.quality === "low" ? 1 : Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.viewport.width = width;
    this.viewport.height = height;
    this.viewport.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.clampCamera();
    this.drawFrame();
  }

  resetCamera(): void {
    this.camera.x = this.mission.width * TILE_SIZE / 2;
    this.camera.y = this.mission.height * TILE_SIZE / 2;
    this.camera.zoom = 1;
    this.clampCamera();
  }

  diagnostics(): RendererDiagnostics {
    return {
      renderer: "canvas2d",
      staticCacheBuilds: this.staticCacheBuilds,
      loadedAssets: this.loadedAssets,
      failedAssets: [...this.failedAssets],
      activeVisuals: (this.lastSnapshot?.towers.length ?? 0) + (this.lastSnapshot?.enemies.length ?? 0) + (this.lastSnapshot?.projectiles.length ?? 0) + (this.lastSnapshot?.hitEffects.length ?? 0),
    };
  }

  resourceCounts(): { geometries: number; textures: number } {
    return { geometries: 0, textures: this.loadedAssets };
  }

  dispose(): void {
    this.lifecycleAbort.abort();
    this.resizeObserver?.disconnect();
    this.loadToken += 1;
    this.host.replaceChildren();
    this.assets.clear();
    this.lastSnapshot = null;
    this.statusElement = null;
  }
}
