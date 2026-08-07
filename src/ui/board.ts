import { TERRAIN } from "../content/terrain";
import { veterancyLevel } from "../content/units";
import type { Faction, GameState, Objective, TerrainId, Unit, UnitTypeId, Vec2 } from "../core/types";
import { ITEM_ICON, TERRAIN_ICON, UI_ICON, UNIT_ICON } from "./assets";
import { imageCache } from "./imageCache";
import type { VisualFrame } from "./presentation";
import { FACTION_STYLE, HIGHLIGHT, TERRAIN_STYLE } from "./theme";

export interface BoardOverlay {
  selectedUnitId: string | null;
  moveTiles: Set<number>;
  attackTiles: Set<number>;
  itemTiles: Set<number>;
  inspected: Vec2 | null;
  visual: VisualFrame | null;
  /** 目标是否算「已完成控制」：己方持有 */
  objectiveDone: (objective: Objective) => boolean;
}

export const EMPTY_OVERLAY: BoardOverlay = {
  selectedUnitId: null,
  moveTiles: new Set(),
  attackTiles: new Set(),
  itemTiles: new Set(),
  inspected: null,
  visual: null,
  objectiveDone: (o) => o.owner === "player",
};

export class Board {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private tile = 32;
  private originX = 0;
  private originY = 0;
  private state: GameState | null = null;
  private overlay: BoardOverlay = EMPTY_OVERLAY;
  private onAssetsReady: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, onAssetsReady?: () => void) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("画布不可用");
    this.ctx = ctx;
    this.onAssetsReady = onAssetsReady ?? null;
    imageCache.onReady(() => {
      if (this.state) this.draw();
      this.onAssetsReady?.();
    });
  }

  render(state: GameState, overlay: BoardOverlay): void {
    this.state = state;
    this.overlay = overlay;
    this.resize();
    this.draw();
  }

  /** 把屏幕坐标换算成格子坐标 */
  toTile(clientX: number, clientY: number): Vec2 | null {
    if (!this.state) return null;
    const rect = this.canvas.getBoundingClientRect();
    const cssTile = rect.width / this.state.width;
    const x = Math.floor((clientX - rect.left) / cssTile);
    const y = Math.floor((clientY - rect.top) / cssTile);
    if (x < 0 || y < 0 || x >= this.state.width || y >= this.state.height) return null;
    return { x, y };
  }

  /**
   * 画布按棋盘比例精确取尺寸，而不是拉满容器，
   * 否则窄屏上棋盘四周会留出大片空白。
   */
  private resize(): void {
    const state = this.state;
    const parent = this.canvas.parentElement;
    if (!state || !parent) return;

    const style = getComputedStyle(parent);
    const availableWidth =
      parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availableHeight =
      parent.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (availableWidth <= 0 || availableHeight <= 0) return;

    const cssTile = Math.max(
      12,
      Math.floor(Math.min(availableWidth / state.width, availableHeight / state.height)),
    );
    const cssWidth = cssTile * state.width;
    const cssHeight = cssTile * state.height;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(cssWidth * dpr);
    const height = Math.round(cssHeight * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.tile = cssTile * dpr;
    this.originX = 0;
    this.originY = 0;
  }

  private drawImage(
    src: string,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    alpha = 1,
  ): boolean {
    const img = imageCache.get(src);
    if (!img) return false;
    const { ctx } = this;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.globalAlpha = prev;
    return true;
  }

  private draw(): void {
    const state = this.state;
    if (!state) return;
    const { ctx, tile } = this;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.translate(this.originX, this.originY);

    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) {
        this.drawTile(state, x, y);
      }
    }

    for (const zone of state.evacZone) {
      ctx.fillStyle = HIGHLIGHT.evac;
      ctx.fillRect(zone.x * tile, zone.y * tile, tile, tile);
      const pad = tile * 0.18;
      if (
        !this.drawImage(
          UI_ICON.evac,
          zone.x * tile + pad,
          zone.y * tile + pad,
          tile - pad * 2,
          tile - pad * 2,
          0.92,
        )
      ) {
        ctx.fillStyle = "rgba(47, 111, 94, 0.85)";
        ctx.font = `700 ${Math.round(tile * 0.28)}px "Noto Sans SC", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("撤", zone.x * tile + tile / 2, zone.y * tile + tile / 2);
      }
    }

    const visual = this.overlay.visual;
    if (visual) {
      for (const trail of visual.trail) {
        ctx.fillStyle = `rgba(58, 122, 196, ${trail.alpha})`;
        ctx.fillRect(trail.x * tile + 2, trail.y * tile + 2, tile - 4, tile - 4);
      }
    }

    for (const objective of state.objectives) {
      this.drawObjective(objective);
    }

    for (const item of state.fieldItems) {
      this.drawFieldItem(item.x, item.y);
    }

    this.drawOverlay(state);

    if (this.overlay.inspected) {
      const { x, y } = this.overlay.inspected;
      ctx.fillStyle = HIGHLIGHT.inspect;
      ctx.fillRect(x * tile, y * tile, tile, tile);
      ctx.strokeStyle = HIGHLIGHT.selected;
      ctx.lineWidth = Math.max(2, tile * 0.06);
      ctx.strokeRect(x * tile + 1.5, y * tile + 1.5, tile - 3, tile - 3);
    }

    for (const unit of state.units) {
      if (!unit.alive || unit.evacuated) continue;
      this.drawUnit(unit);
    }

    this.drawTargetMarks(state, this.overlay.attackTiles);
    this.drawTargetMarks(state, this.overlay.itemTiles);

    if (visual?.strikeLine) {
      this.drawStrikeLine(state, visual);
    }
    if (visual?.impact && visual.impactUnitId) {
      this.drawImpactForUnit(state, visual);
    }

    ctx.restore();
  }

  private drawTile(state: GameState, x: number, y: number): void {
    const { ctx, tile } = this;
    const terrainId = state.tiles[y * state.width + x]!;
    const style = TERRAIN_STYLE[terrainId];

    ctx.fillStyle = style.fill;
    ctx.fillRect(x * tile, y * tile, tile, tile);

    const inset = Math.max(0.5, tile * 0.02);
    const drawn = this.drawImage(
      TERRAIN_ICON[terrainId],
      x * tile + inset,
      y * tile + inset,
      tile - inset * 2,
      tile - inset * 2,
      terrainId === "plain" ? 0.72 : 0.92,
    );
    if (!drawn) this.drawTerrainIconFallback(terrainId, x, y);

    // 默认网格极轻；移动/攻击范围另用高亮描边
    ctx.strokeStyle = "rgba(38, 43, 34, 0.07)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x * tile + 0.5, y * tile + 0.5, tile - 1, tile - 1);
  }

  private drawTerrainIconFallback(terrainId: TerrainId, x: number, y: number): void {
    const { ctx, tile } = this;
    const cx = x * tile + tile / 2;
    const cy = y * tile + tile / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(38, 43, 34, 0.38)";
    ctx.fillStyle = "rgba(38, 43, 34, 0.28)";
    ctx.lineWidth = Math.max(1.2, tile * 0.045);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    switch (terrainId) {
      case "forest": {
        for (const [ox, oy, s] of [
          [-0.16, 0.08, 0.22],
          [0.14, 0.02, 0.26],
          [0, -0.1, 0.2],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(cx + ox * tile, cy + (oy + s) * tile);
          ctx.lineTo(cx + (ox - s * 0.7) * tile, cy + (oy + s) * tile);
          ctx.lineTo(cx + ox * tile, cy + (oy - s) * tile);
          ctx.lineTo(cx + (ox + s * 0.7) * tile, cy + (oy + s) * tile);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case "hill": {
        ctx.beginPath();
        ctx.moveTo(cx - tile * 0.34, cy + tile * 0.22);
        ctx.lineTo(cx - tile * 0.08, cy - tile * 0.18);
        ctx.lineTo(cx + tile * 0.06, cy + tile * 0.02);
        ctx.lineTo(cx + tile * 0.34, cy - tile * 0.22);
        ctx.stroke();
        break;
      }
      case "village": {
        const w = tile * 0.34;
        const h = tile * 0.22;
        ctx.fillRect(cx - w / 2, cy - h * 0.1, w, h);
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.65, cy - h * 0.1);
        ctx.lineTo(cx, cy - h * 0.85);
        ctx.lineTo(cx + w * 0.65, cy - h * 0.1);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "road": {
        ctx.beginPath();
        ctx.moveTo(cx - tile * 0.28, cy - tile * 0.08);
        ctx.lineTo(cx + tile * 0.28, cy - tile * 0.08);
        ctx.moveTo(cx - tile * 0.28, cy + tile * 0.08);
        ctx.lineTo(cx + tile * 0.28, cy + tile * 0.08);
        ctx.stroke();
        break;
      }
      case "river": {
        ctx.beginPath();
        ctx.moveTo(cx - tile * 0.3, cy - tile * 0.06);
        ctx.quadraticCurveTo(cx - tile * 0.1, cy - tile * 0.18, cx + tile * 0.05, cy - tile * 0.04);
        ctx.quadraticCurveTo(cx + tile * 0.18, cy + tile * 0.06, cx + tile * 0.3, cy - tile * 0.02);
        ctx.moveTo(cx - tile * 0.28, cy + tile * 0.12);
        ctx.quadraticCurveTo(cx, cy + tile * 0.02, cx + tile * 0.28, cy + tile * 0.14);
        ctx.stroke();
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }

  private drawObjective(objective: Objective): void {
    const { ctx, tile } = this;
    const done = this.overlay.objectiveDone(objective);
    const colour =
      objective.owner === "player"
        ? HIGHLIGHT.objectivePlayer
        : objective.owner === "enemy"
          ? HIGHLIGHT.objectiveEnemy
          : HIGHLIGHT.objectiveNeutral;
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2.5, tile * 0.1);
    if (done) ctx.setLineDash([]);
    else ctx.setLineDash([tile * 0.16, tile * 0.1]);
    ctx.strokeRect(objective.x * tile + 3, objective.y * tile + 3, tile - 6, tile - 6);

    const label = objective.name.slice(0, 2) || "标";
    ctx.fillStyle = colour;
    ctx.font = `700 ${Math.round(tile * 0.22)}px "Noto Sans SC", sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(label, objective.x * tile + tile * 0.12, objective.y * tile + tile * 0.1);

    const markSize = tile * 0.28;
    const bx = objective.x * tile + tile * 0.68;
    const by = objective.y * tile + tile * 0.08;
    const markSrc = done ? UI_ICON.objDone : UI_ICON.objPending;
    if (!this.drawImage(markSrc, bx, by, markSize, markSize)) {
      ctx.beginPath();
      const cx = bx + markSize / 2;
      const cy = by + markSize / 2;
      const r = markSize * 0.42;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (done) {
        ctx.fillStyle = HIGHLIGHT.objectivePlayer;
        ctx.fill();
        ctx.strokeStyle = "#f4f7f2";
        ctx.lineWidth = Math.max(1.5, tile * 0.04);
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.45, cy);
        ctx.lineTo(cx - r * 0.1, cy + r * 0.4);
        ctx.lineTo(cx + r * 0.5, cy - r * 0.35);
        ctx.stroke();
      } else {
        ctx.strokeStyle = colour;
        ctx.lineWidth = Math.max(1.5, tile * 0.045);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawFieldItem(x: number, y: number): void {
    const { ctx, tile } = this;
    const size = tile * 0.42;
    const dx = x * tile + tile / 2 - size / 2;
    const dy = y * tile + tile * 0.08;
    if (this.drawImage(UI_ICON.fieldItem, dx, dy, size, size)) return;

    ctx.save();
    ctx.fillStyle = "#d69e2e";
    ctx.strokeStyle = "#7a5a14";
    ctx.lineWidth = 1.5;
    const fallback = tile * 0.24;
    ctx.beginPath();
    ctx.rect(x * tile + tile / 2 - fallback / 2, y * tile + tile * 0.16, fallback, fallback);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawOverlay(state: GameState): void {
    const { ctx, tile } = this;
    const paint = (indices: Set<number>, fill: string, edge: string) => {
      for (const index of indices) {
        const x = index % state.width;
        const y = Math.floor(index / state.width);
        ctx.fillStyle = fill;
        ctx.fillRect(x * tile, y * tile, tile, tile);
        ctx.strokeStyle = edge;
        ctx.lineWidth = Math.max(2, tile * 0.08);
        ctx.strokeRect(x * tile + 1.5, y * tile + 1.5, tile - 3, tile - 3);
      }
    };

    paint(this.overlay.moveTiles, HIGHLIGHT.move, HIGHLIGHT.moveEdge);
    paint(this.overlay.itemTiles, HIGHLIGHT.item, HIGHLIGHT.attackEdge);
    paint(this.overlay.attackTiles, HIGHLIGHT.attack, HIGHLIGHT.attackEdge);
  }

  /** 目标标记画在单位之上，否则会被单位圆形盖住 */
  private drawTargetMarks(state: GameState, indices: Set<number>): void {
    const { ctx, tile } = this;
    for (const index of indices) {
      const cx = (index % state.width) * tile + tile / 2;
      const cy = Math.floor(index / state.width) * tile + tile / 2;
      const radius = tile * 0.46;
      ctx.save();
      ctx.strokeStyle = HIGHLIGHT.attackEdge;
      ctx.lineWidth = Math.max(2, tile * 0.07);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        ctx.moveTo(cx + dx * radius, cy + dy * radius);
        ctx.lineTo(cx + dx * radius * 0.62, cy + dy * radius * 0.62);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  private unitDrawPos(unit: Unit): { cx: number; cy: number } {
    const { tile } = this;
    const visual = this.overlay.visual;
    const pos = visual?.unitPositions[unit.id];
    if (pos) {
      return { cx: pos.x * tile + tile / 2, cy: pos.y * tile + tile / 2 };
    }
    return { cx: unit.x * tile + tile / 2, cy: unit.y * tile + tile / 2 };
  }

  private tokenFace(faction: Faction): string {
    return faction === "player" ? "#e7efe9" : "#f6e9e6";
  }

  private drawUnit(unit: Unit): void {
    const { ctx, tile } = this;
    const style = FACTION_STYLE[unit.faction];
    const { cx, cy } = this.unitDrawPos(unit);
    const radius = tile * 0.36;
    const visual = this.overlay.visual;
    const acted = unit.hasActed && unit.faction === "player";

    if (this.overlay.selectedUnitId === unit.id) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius + tile * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = HIGHLIGHT.selected;
      ctx.fill();
    }

    ctx.save();
    ctx.globalAlpha = acted ? 0.55 : 1;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = this.tokenFace(unit.faction);
    ctx.fill();
    ctx.lineWidth = Math.max(2, tile * 0.07);
    ctx.strokeStyle = style.body;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - tile * 0.025, 0, Math.PI * 2);
    ctx.strokeStyle = style.ring;
    ctx.lineWidth = Math.max(1.2, tile * 0.035);
    ctx.stroke();

    const iconSize = radius * 1.7;
    const iconDrawn = this.drawImage(
      UNIT_ICON[unit.type][unit.faction],
      cx - iconSize / 2,
      cy - iconSize / 2,
      iconSize,
      iconSize,
    );
    if (!iconDrawn) {
      this.drawUnitSilhouette(unit.type, cx, cy, radius, style.body);
    }

    ctx.restore();

    if (visual?.flashUnitId === unit.id) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.fill();
    }

    const hp =
      visual?.hpDisplay[unit.id] !== undefined ? visual.hpDisplay[unit.id]! : unit.hp;
    const barWidth = tile * 0.72;
    const barHeight = Math.max(3, tile * 0.09);
    const barX = cx - barWidth / 2;
    const barY = cy + radius + tile * 0.04;
    ctx.fillStyle = "rgba(22, 26, 20, 0.45)";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    const ratio = Math.max(0, Math.min(1, hp / unit.maxHp));
    ctx.fillStyle = ratio > 0.55 ? "#5aa469" : ratio > 0.28 ? "#d9a326" : "#c8503c";
    ctx.fillRect(barX, barY, barWidth * ratio, barHeight);

    const level = veterancyLevel(unit.exp);
    for (let i = 0; i < level; i += 1) {
      ctx.beginPath();
      ctx.arc(cx - tile * 0.22 + i * tile * 0.16, cy - radius * 0.85, tile * 0.055, 0, Math.PI * 2);
      ctx.fillStyle = "#f5d76e";
      ctx.fill();
      ctx.strokeStyle = "rgba(40, 32, 10, 0.7)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (unit.keyUnit) {
      const star = tile * 0.3;
      if (
        !this.drawImage(
          UI_ICON.keyUnit,
          cx + radius * 0.35,
          cy - radius * 1.05,
          star,
          star,
        )
      ) {
        ctx.fillStyle = "#f5d76e";
        ctx.font = `700 ${Math.round(tile * 0.2)}px "Noto Sans SC", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("主", cx + radius * 0.75, cy - radius * 0.75);
      }
    }
  }

  private drawUnitSilhouette(
    type: UnitTypeId,
    cx: number,
    cy: number,
    radius: number,
    color: string,
  ): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.4, radius * 0.14);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (type) {
      case "rifle": {
        ctx.beginPath();
        ctx.arc(cx, cy - radius * 0.35, radius * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx, cy - radius * 0.1);
        ctx.lineTo(cx, cy + radius * 0.45);
        ctx.moveTo(cx - radius * 0.32, cy + radius * 0.05);
        ctx.lineTo(cx + radius * 0.32, cy + radius * 0.05);
        ctx.stroke();
        break;
      }
      case "mg": {
        ctx.beginPath();
        ctx.moveTo(cx - radius * 0.35, cy + radius * 0.15);
        ctx.lineTo(cx + radius * 0.4, cy - radius * 0.25);
        ctx.moveTo(cx - radius * 0.35, cy + radius * 0.32);
        ctx.lineTo(cx + radius * 0.4, cy - radius * 0.08);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx - radius * 0.28, cy + radius * 0.24, radius * 0.12, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "mortar": {
        ctx.beginPath();
        ctx.moveTo(cx - radius * 0.28, cy + radius * 0.35);
        ctx.lineTo(cx, cy + radius * 0.35);
        ctx.lineTo(cx + radius * 0.05, cy - radius * 0.35);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + radius * 0.18, cy - radius * 0.42, radius * 0.1, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "tank": {
        const w = radius * 1.1;
        const h = radius * 0.55;
        ctx.fillRect(cx - w / 2, cy - h * 0.15, w, h);
        ctx.fillRect(cx - w * 0.2, cy - h * 0.7, w * 0.4, h * 0.55);
        ctx.beginPath();
        ctx.moveTo(cx + w * 0.2, cy - h * 0.35);
        ctx.lineTo(cx + w * 0.55, cy - h * 0.35);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  private drawStrikeLine(state: GameState, visual: VisualFrame): void {
    const line = visual.strikeLine;
    if (!line) return;
    const from = state.units.find((u) => u.id === line.fromId);
    const to = state.units.find((u) => u.id === line.toId);
    if (!from || !to) return;
    const a = this.unitDrawPos(from);
    const b = this.unitDrawPos(to);
    const { ctx, tile } = this;
    ctx.save();
    ctx.globalAlpha = line.alpha;
    ctx.strokeStyle = "#c8503c";
    ctx.lineWidth = Math.max(2, tile * 0.06);
    ctx.beginPath();
    ctx.moveTo(a.cx, a.cy);
    ctx.lineTo(b.cx, b.cy);
    ctx.stroke();
    ctx.restore();
  }

  private drawImpactForUnit(state: GameState, visual: VisualFrame): void {
    const impact = visual.impact;
    const unitId = visual.impactUnitId;
    if (!impact || !unitId) return;
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit) return;
    const { cx, cy } = this.unitDrawPos(unit);
    const { ctx, tile } = this;
    ctx.save();
    ctx.globalAlpha = impact.alpha;
    ctx.font = `700 ${Math.round(tile * 0.42)}px "Noto Sans SC", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(20, 20, 20, 0.75)";
    const y = cy - tile * 0.55;
    ctx.strokeText(impact.text, cx, y);
    ctx.fillStyle = "#ffd9a0";
    ctx.fillText(impact.text, cx, y);
    ctx.restore();
  }
}

export function terrainName(state: GameState, x: number, y: number): string {
  return TERRAIN[state.tiles[y * state.width + x]!].name;
}

/** Expose item icon path for panel buttons (canvas uses UI field-item). */
export { ITEM_ICON };
