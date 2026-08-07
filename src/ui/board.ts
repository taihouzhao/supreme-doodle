import { TERRAIN } from "../content/terrain";
import { veterancyLevel } from "../content/units";
import type { GameState, Unit, Vec2 } from "../core/types";
import { FACTION_STYLE, HIGHLIGHT, TERRAIN_STYLE, UNIT_GLYPH } from "./theme";

export interface BoardOverlay {
  selectedUnitId: string | null;
  moveTiles: Set<number>;
  attackTiles: Set<number>;
  itemTiles: Set<number>;
  /** 上一次战斗的落点，用于短暂高亮 */
  impact: { x: number; y: number; text: string } | null;
}

export const EMPTY_OVERLAY: BoardOverlay = {
  selectedUnitId: null,
  moveTiles: new Set(),
  attackTiles: new Set(),
  itemTiles: new Set(),
  impact: null,
};

export class Board {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private tile = 32;
  private originX = 0;
  private originY = 0;
  private state: GameState | null = null;
  private overlay: BoardOverlay = EMPTY_OVERLAY;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("画布不可用");
    this.ctx = ctx;
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
    const x = Math.floor((clientX - rect.left - this.originX / devicePixelRatio) / (this.tile / devicePixelRatio));
    const y = Math.floor((clientY - rect.top - this.originY / devicePixelRatio) / (this.tile / devicePixelRatio));
    if (x < 0 || y < 0 || x >= this.state.width || y >= this.state.height) return null;
    return { x, y };
  }

  private resize(): void {
    if (!this.state) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.tile = Math.floor(Math.min(width / this.state.width, height / this.state.height));
    this.originX = Math.floor((width - this.tile * this.state.width) / 2);
    this.originY = Math.floor((height - this.tile * this.state.height) / 2);
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
    }

    for (const objective of state.objectives) {
      this.drawObjective(objective.x, objective.y, objective.owner);
    }

    for (const item of state.fieldItems) {
      this.drawFieldItem(item.x, item.y);
    }

    this.drawOverlay(state);

    for (const unit of state.units) {
      if (!unit.alive || unit.evacuated) continue;
      this.drawUnit(unit);
    }

    if (this.overlay.impact) {
      this.drawImpact(this.overlay.impact);
    }

    ctx.restore();
  }

  private drawTile(state: GameState, x: number, y: number): void {
    const { ctx, tile } = this;
    const terrainId = state.tiles[y * state.width + x]!;
    const style = TERRAIN_STYLE[terrainId];

    ctx.fillStyle = style.fill;
    ctx.fillRect(x * tile, y * tile, tile, tile);
    ctx.strokeStyle = style.edge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x * tile + 0.5, y * tile + 0.5, tile - 1, tile - 1);

    if (style.glyph) {
      ctx.fillStyle = "rgba(38, 43, 34, 0.32)";
      ctx.font = `${Math.round(tile * 0.42)}px "Noto Serif SC", serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(style.glyph, x * tile + tile / 2, y * tile + tile / 2);
    }
  }

  private drawObjective(x: number, y: number, owner: string): void {
    const { ctx, tile } = this;
    const colour =
      owner === "player"
        ? HIGHLIGHT.objectivePlayer
        : owner === "enemy"
          ? HIGHLIGHT.objectiveEnemy
          : HIGHLIGHT.objectiveNeutral;
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2, tile * 0.08);
    ctx.setLineDash([tile * 0.18, tile * 0.12]);
    ctx.strokeRect(x * tile + 3, y * tile + 3, tile - 6, tile - 6);
    ctx.restore();
  }

  private drawFieldItem(x: number, y: number): void {
    const { ctx, tile } = this;
    ctx.save();
    ctx.fillStyle = "#d69e2e";
    ctx.strokeStyle = "#7a5a14";
    ctx.lineWidth = 1.5;
    const size = tile * 0.24;
    ctx.beginPath();
    ctx.rect(x * tile + tile / 2 - size / 2, y * tile + tile * 0.16, size, size);
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
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x * tile + 1, y * tile + 1, tile - 2, tile - 2);
      }
    };

    paint(this.overlay.moveTiles, HIGHLIGHT.move, HIGHLIGHT.moveEdge);
    paint(this.overlay.itemTiles, HIGHLIGHT.item, HIGHLIGHT.attackEdge);
    paint(this.overlay.attackTiles, HIGHLIGHT.attack, HIGHLIGHT.attackEdge);
  }

  private drawUnit(unit: Unit): void {
    const { ctx, tile } = this;
    const style = FACTION_STYLE[unit.faction];
    const cx = unit.x * tile + tile / 2;
    const cy = unit.y * tile + tile / 2;
    const radius = tile * 0.34;

    if (this.overlay.selectedUnitId === unit.id) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius + tile * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = HIGHLIGHT.selected;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = style.body;
    ctx.globalAlpha = unit.hasActed && unit.faction === "player" ? 0.55 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(1.5, tile * 0.05);
    ctx.strokeStyle = style.ring;
    ctx.stroke();

    ctx.fillStyle = style.text;
    ctx.font = `700 ${Math.round(tile * 0.36)}px "Noto Sans SC", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(UNIT_GLYPH[unit.type], cx, cy + tile * 0.01);

    const barWidth = tile * 0.72;
    const barHeight = Math.max(3, tile * 0.09);
    const barX = cx - barWidth / 2;
    const barY = unit.y * tile + tile - barHeight - tile * 0.08;
    ctx.fillStyle = "rgba(22, 26, 20, 0.45)";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    const ratio = Math.max(0, unit.hp / unit.maxHp);
    ctx.fillStyle = ratio > 0.55 ? "#5aa469" : ratio > 0.28 ? "#d9a326" : "#c8503c";
    ctx.fillRect(barX, barY, barWidth * ratio, barHeight);

    const level = veterancyLevel(unit.exp);
    for (let i = 0; i < level; i += 1) {
      ctx.beginPath();
      ctx.arc(unit.x * tile + tile * 0.16 + i * tile * 0.16, unit.y * tile + tile * 0.16, tile * 0.055, 0, Math.PI * 2);
      ctx.fillStyle = "#f5d76e";
      ctx.fill();
      ctx.strokeStyle = "rgba(40, 32, 10, 0.7)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (unit.keyUnit) {
      ctx.fillStyle = "#f5d76e";
      ctx.font = `700 ${Math.round(tile * 0.22)}px "Noto Sans SC", sans-serif`;
      ctx.fillText("主", unit.x * tile + tile * 0.84, unit.y * tile + tile * 0.18);
    }
  }

  private drawImpact(impact: { x: number; y: number; text: string }): void {
    const { ctx, tile } = this;
    ctx.save();
    ctx.font = `700 ${Math.round(tile * 0.42)}px "Noto Sans SC", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(20, 20, 20, 0.75)";
    ctx.strokeText(impact.text, impact.x * tile + tile / 2, impact.y * tile - tile * 0.1);
    ctx.fillStyle = "#ffd9a0";
    ctx.fillText(impact.text, impact.x * tile + tile / 2, impact.y * tile - tile * 0.1);
    ctx.restore();
  }
}

export function terrainName(state: GameState, x: number, y: number): string {
  return TERRAIN[state.tiles[y * state.width + x]!].name;
}
