import { TERRAIN } from "../content/terrain";
import type { Faction, GameState, Objective, TerrainId, Unit, UnitTypeId, Vec2 } from "../core/types";
import { ITEM_ICON, UI_ICON, UNIT_ROLE_ICON, terrainIcon, unitPortrait } from "./assets";
import { imageCache } from "./imageCache";
import type { VisualFrame } from "./presentation";
import { FACTION_STYLE, HIGHLIGHT, TERRAIN_STYLE } from "./theme";

/** 大格但不过分：整图通常略大于视口，靠拖拽 / 方向键浏览 */
const TARGET_CSS_TILE = 76;
const MIN_CSS_TILE = 52;
const PAN_THRESHOLD = 8;
/** 镜头可越出地图边缘的缓冲（格），避免贴边单位被 UI/视口裁切且拖不动 */
const EDGE_BUFFER_TILES = 1.25;
const KEY_PAN_STEP = 0.85;

export interface BoardOverlay {
  selectedUnitId: string | null;
  moveTiles: Set<number>;
  /** 攻击半径（含空地） */
  attackTiles: Set<number>;
  /** 当前可点选的敌方目标格 */
  attackTargets: Set<number>;
  /** 后勤可补充的友军格 */
  resupplyTiles: Set<number>;
  /** 邻接但暂无需补给的友军格（仅提示） */
  resupplyIdleTiles: Set<number>;
  itemTiles: Set<number>;
  inspected: Vec2 | null;
  /** 任务目标点击后的地名高亮 */
  highlightObjectiveId: string | null;
  visual: VisualFrame | null;
  /** 目标是否算「已完成控制」：己方持有 */
  objectiveDone: (objective: Objective) => boolean;
}

export const EMPTY_OVERLAY: BoardOverlay = {
  selectedUnitId: null,
  moveTiles: new Set(),
  attackTiles: new Set(),
  attackTargets: new Set(),
  resupplyTiles: new Set(),
  resupplyIdleTiles: new Set(),
  itemTiles: new Set(),
  inspected: null,
  highlightObjectiveId: null,
  visual: null,
  objectiveDone: (o) => o.owner === "player",
};

export class Board {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** 设备像素下的格子边长 */
  private tile = 32;
  /** CSS 像素下的格子边长（决战朝鲜式大格） */
  private cssTile: number = TARGET_CSS_TILE;
  /** 视口左上角在地图上的 CSS 坐标 */
  private cameraX = 0;
  private cameraY = 0;
  private viewCssW = 0;
  private viewCssH = 0;
  private originX = 0;
  private originY = 0;
  private state: GameState | null = null;
  private overlay: BoardOverlay = EMPTY_OVERLAY;
  private onAssetsReady: (() => void) | null = null;
  private focusedMissionKey: string | null = null;

  private pointerId: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private camAtDragStartX = 0;
  private camAtDragStartY = 0;
  private didPan = false;
  private onTap: ((tile: Vec2) => void) | null = null;

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
    this.bindPointer();
    this.bindKeyboard();
  }

  /** 点击格子（非拖拽）回调 */
  setTapHandler(handler: (tile: Vec2) => void): void {
    this.onTap = handler;
  }

  /** 方向键平移（供战斗界面使用） */
  panByTiles(dx: number, dy: number): void {
    if (!this.state) return;
    this.cameraX += dx * this.cssTile * KEY_PAN_STEP;
    this.cameraY += dy * this.cssTile * KEY_PAN_STEP;
    this.clampCamera();
    this.syncOrigin();
    this.draw();
  }

  private bindKeyboard(): void {
    this.canvas.addEventListener("keydown", (event) => {
      if (!this.state) return;
      let dx = 0;
      let dy = 0;
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") dx = -1;
      else if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") dx = 1;
      else if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") dy = -1;
      else if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") dy = 1;
      else return;
      event.preventDefault();
      this.panByTiles(dx, dy);
    });
  }

  render(state: GameState, overlay: BoardOverlay, missionKey?: string): void {
    this.state = state;
    this.overlay = overlay;
    const key = missionKey ?? `${state.width}x${state.height}`;
    const missionChanged = this.focusedMissionKey !== key;
    this.resize();
    if (missionChanged) {
      this.focusedMissionKey = key;
      this.focusPlayerArmy(state);
    }
    this.clampCamera();
    this.syncOrigin();
    this.draw();
  }

  /** 把屏幕坐标换算成格子坐标（计入镜头） */
  toTile(clientX: number, clientY: number): Vec2 | null {
    if (!this.state || this.cssTile <= 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    const mapX = this.cameraX + (clientX - rect.left);
    const mapY = this.cameraY + (clientY - rect.top);
    const x = Math.floor(mapX / this.cssTile);
    const y = Math.floor(mapY / this.cssTile);
    if (x < 0 || y < 0 || x >= this.state.width || y >= this.state.height) return null;
    return { x, y };
  }

  focusTile(x: number, y: number): void {
    if (!this.state) return;
    this.cameraX = x * this.cssTile + this.cssTile / 2 - this.viewCssW / 2;
    this.cameraY = y * this.cssTile + this.cssTile / 2 - this.viewCssH / 2;
    this.clampCamera();
    this.syncOrigin();
  }

  /** 格子在 `.stage__map` 内的 CSS 矩形，供跟手操作条定位 */
  tileCssRect(x: number, y: number): { left: number; top: number; width: number; height: number } | null {
    if (!this.state || this.viewCssW <= 0 || this.viewCssH <= 0) return null;
    return {
      left: x * this.cssTile - this.cameraX,
      top: y * this.cssTile - this.cameraY,
      width: this.cssTile,
      height: this.cssTile,
    };
  }

  private focusPlayerArmy(state: GameState): void {
    const players = state.units.filter((u) => u.faction === "player" && u.alive && !u.evacuated);
    if (players.length === 0) {
      this.cameraX = 0;
      this.cameraY = Math.max(0, state.height * this.cssTile - this.viewCssH);
      return;
    }
    const cx = players.reduce((s, u) => s + u.x, 0) / players.length;
    const cy = players.reduce((s, u) => s + u.y, 0) / players.length;
    this.focusTile(cx, cy);
  }

  private bindPointer(): void {
    const el = this.canvas;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      el.focus({ preventScroll: true });
      this.pointerId = event.pointerId;
      this.didPan = false;
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.camAtDragStartX = this.cameraX;
      this.camAtDragStartY = this.cameraY;
      el.setPointerCapture(event.pointerId);
    });
    el.addEventListener("pointermove", (event) => {
      if (this.pointerId !== event.pointerId) return;
      const dx = event.clientX - this.dragStartX;
      const dy = event.clientY - this.dragStartY;
      if (!this.didPan && dx * dx + dy * dy < PAN_THRESHOLD * PAN_THRESHOLD) return;
      this.didPan = true;
      this.cameraX = this.camAtDragStartX - dx;
      this.cameraY = this.camAtDragStartY - dy;
      this.clampCamera();
      this.syncOrigin();
      this.draw();
    });
    const end = (event: PointerEvent) => {
      if (this.pointerId !== event.pointerId) return;
      const wasPan = this.didPan;
      this.pointerId = null;
      this.didPan = false;
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      if (wasPan) return;
      const tile = this.toTile(event.clientX, event.clientY);
      if (tile && this.onTap) this.onTap(tile);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  /**
   * 画布铺满舞台视口；格子用大尺寸，地图整体大于屏幕，靠拖拽浏览。
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

    this.viewCssW = availableWidth;
    this.viewCssH = availableHeight;
    // 保证一屏能看到大半张地图，同时格子仍然够大能认清兵种
    const fitW = availableWidth / Math.max(7, state.width * 0.72);
    const fitH = availableHeight / Math.max(6, state.height * 0.72);
    this.cssTile = Math.max(
      MIN_CSS_TILE,
      Math.min(TARGET_CSS_TILE, Math.floor(Math.min(fitW, fitH))),
    );

    this.canvas.style.width = `${availableWidth}px`;
    this.canvas.style.height = `${availableHeight}px`;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(availableWidth * dpr);
    const height = Math.round(availableHeight * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.tile = this.cssTile * dpr;
    this.clampCamera();
    this.syncOrigin();
  }

  private mapCssWidth(): number {
    return (this.state?.width ?? 0) * this.cssTile;
  }

  private mapCssHeight(): number {
    return (this.state?.height ?? 0) * this.cssTile;
  }

  private clampCamera(): void {
    const pad = this.cssTile * EDGE_BUFFER_TILES;
    const maxX = Math.max(0, this.mapCssWidth() - this.viewCssW);
    const maxY = Math.max(0, this.mapCssHeight() - this.viewCssH);
    // 允许越界缓冲：边缘单位可拖进视口中部
    this.cameraX = Math.min(maxX + pad, Math.max(-pad, this.cameraX));
    this.cameraY = Math.min(maxY + pad, Math.max(-pad, this.cameraY));
  }

  private syncOrigin(): void {
    const dpr = window.devicePixelRatio || 1;
    this.originX = -this.cameraX * dpr;
    this.originY = -this.cameraY * dpr;
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
    // 视口外衬底（地图卷轴感）
    ctx.fillStyle = "#2a3228";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.translate(this.originX, this.originY);

    const dpr = window.devicePixelRatio || 1;
    const x0 = Math.max(0, Math.floor(this.cameraX / this.cssTile) - 1);
    const y0 = Math.max(0, Math.floor(this.cameraY / this.cssTile) - 1);
    const x1 = Math.min(state.width - 1, Math.ceil((this.cameraX + this.viewCssW) / this.cssTile) + 1);
    const y1 = Math.min(
      state.height - 1,
      Math.ceil((this.cameraY + this.viewCssH) / this.cssTile) + 1,
    );

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        this.drawTile(state, x, y);
      }
    }

    this.drawWeatherLayer(state, x0, y0, x1, y1);

    for (const zone of state.evacZone) {
      if (zone.x < x0 || zone.x > x1 || zone.y < y0 || zone.y > y1) continue;
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

    this.drawPlaceLabels(state, x0, y0, x1, y1);
    this.drawSupplyPoints(state, x0, y0, x1, y1);

    for (const objective of state.objectives) {
      this.drawObjective(objective);
    }

    for (const item of state.fieldItems) {
      this.drawFieldItem(item.x, item.y);
    }
    for (const weapon of state.fieldWeapons) {
      this.drawFieldItem(weapon.x, weapon.y);
    }
    for (const attachment of state.fieldAttachments ?? []) {
      this.drawFieldItem(attachment.x, attachment.y);
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
      if (unit.evacuated) continue;
      const linger = visual?.lingerUnits[unit.id];
      // 演出期间：终局已溃散但时间线尚未走到溃散的单位靠 linger / 粘性坐标继续绘制
      if (!unit.alive && !linger) continue;
      const hpOverride =
        linger?.hp ??
        (visual?.busy && visual.hpDisplay[unit.id] !== undefined
          ? visual.hpDisplay[unit.id]
          : undefined);
      this.drawUnit(unit, linger?.alpha ?? 1, hpOverride);
    }

    this.drawTargetMarks(state, this.overlay.attackTargets);
    this.drawTargetMarks(state, this.overlay.resupplyTiles);
    this.drawTargetMarks(state, this.overlay.itemTiles);

    if (visual?.strikeLine) {
      this.drawStrikeLine(state, visual);
    }
    if (visual?.impact && visual.impactUnitId) {
      this.drawImpactForUnit(state, visual);
    }
    if (visual?.routBurst) {
      this.drawRoutBurst(state, visual);
    }
    if (visual?.promoteBurst) {
      this.drawPromoteBurst(state, visual);
    }

    ctx.restore();
    this.drawMinimap(state, dpr);
  }

  /** 真实地名标注：让「云山」「三所里」这类地标出现在棋盘上而不只在简报里 */
  private drawPlaceLabels(
    state: GameState,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): void {
    if (state.places.length === 0) return;
    const { ctx, tile } = this;
    ctx.save();
    ctx.font = `600 ${Math.round(tile * 0.2)}px "Noto Sans SC", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const place of state.places) {
      if (place.x < x0 || place.x > x1 || place.y < y0 || place.y > y1) continue;
      const cx = place.x * tile + tile / 2;
      const cy = place.y * tile + tile * 0.86;
      const w = ctx.measureText(place.name).width + tile * 0.16;
      ctx.fillStyle = "rgba(22, 26, 20, 0.62)";
      ctx.beginPath();
      ctx.roundRect(cx - w / 2, cy - tile * 0.11, w, tile * 0.22, tile * 0.05);
      ctx.fill();
      ctx.fillStyle = "rgba(240, 236, 214, 0.92)";
      ctx.fillText(place.name, cx, cy);
    }
    ctx.restore();
  }

  /** 补给点：青绿角标，提示站上可恢复弹药窗口 */
  private drawSupplyPoints(
    state: GameState,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): void {
    if (state.supplyPoints.length === 0) return;
    const { ctx, tile } = this;
    ctx.save();
    for (const point of state.supplyPoints) {
      if (point.x < x0 || point.x > x1 || point.y < y0 || point.y > y1) continue;
      const cx = point.x * tile + tile * 0.78;
      const cy = point.y * tile + tile * 0.22;
      ctx.fillStyle = "rgba(46, 140, 110, 0.85)";
      ctx.beginPath();
      ctx.arc(cx, cy, tile * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(240, 248, 240, 0.95)";
      ctx.font = `700 ${Math.round(tile * 0.14)}px "Noto Sans SC", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("补", cx, cy);
    }
    ctx.restore();
  }

  /** 固定种子下完全静态的天气层：既表现战场气候，又不影响棋子可读性。 */
  private drawWeatherLayer(
    state: GameState,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): void {
    const { ctx, tile } = this;
    if (state.weather === "clear") return;

    const left = x0 * tile;
    const top = y0 * tile;
    const width = (x1 - x0 + 1) * tile;
    const height = (y1 - y0 + 1) * tile;

    ctx.save();
    if (state.weather === "overcast") {
      ctx.fillStyle = "rgba(76, 84, 82, 0.14)";
      ctx.fillRect(left, top, width, height);
    } else if (state.weather === "fog") {
      ctx.fillStyle = "rgba(220, 224, 216, 0.26)";
      ctx.fillRect(left, top, width, height);
      ctx.strokeStyle = "rgba(244, 241, 226, 0.2)";
      ctx.lineWidth = tile * 0.28;
      for (let y = top + tile * 0.4; y < top + height; y += tile * 1.4) {
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + width, y + tile * 0.15);
        ctx.stroke();
      }
    } else if (state.weather === "rain") {
      ctx.fillStyle = "rgba(47, 70, 82, 0.2)";
      ctx.fillRect(left, top, width, height);
      ctx.strokeStyle = "rgba(202, 222, 231, 0.42)";
      ctx.lineWidth = Math.max(1, tile * 0.018);
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          if ((x * 7 + y * 11 + state.seed) % 3 !== 0) continue;
          const sx = x * tile + tile * 0.72;
          const sy = y * tile + tile * 0.18;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - tile * 0.16, sy + tile * 0.28);
          ctx.stroke();
        }
      }
    } else if (state.weather === "snow") {
      // 地面已换成雪地贴图，这里只补飘雪颗粒，不再压一层白蒙版
      ctx.fillStyle = "rgba(255, 255, 250, 0.8)";
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const hash = (x * 31 + y * 17 + state.seed) >>> 0;
          const cx = x * tile + tile * (0.2 + ((hash % 57) / 100));
          const cy = y * tile + tile * (0.18 + (((hash >> 3) % 61) / 100));
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(1.5, tile * 0.035), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  /** 右上角小地图（地图视口内，不再被顶栏遮挡） */
  private drawMinimap(state: GameState, dpr: number): void {
    const { ctx } = this;
    const pad = 10 * dpr;
    const maxW = Math.min(132 * dpr, this.canvas.width * 0.26);
    const scale = maxW / (state.width * this.tile);
    const mw = state.width * this.tile * scale;
    const mh = state.height * this.tile * scale;
    const mx = this.canvas.width - mw - pad;
    const my = pad;

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(20, 24, 18, 0.82)";
    ctx.fillRect(mx - 4 * dpr, my - 4 * dpr, mw + 8 * dpr, mh + 8 * dpr);
    ctx.strokeStyle = "rgba(245, 215, 110, 0.55)";
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeRect(mx - 4 * dpr, my - 4 * dpr, mw + 8 * dpr, mh + 8 * dpr);

    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) {
        const terrainId = state.tiles[y * state.width + x]!;
        ctx.fillStyle = TERRAIN_STYLE[terrainId].fill;
        ctx.fillRect(mx + x * this.tile * scale, my + y * this.tile * scale, this.tile * scale + 0.5, this.tile * scale + 0.5);
      }
    }

    for (const unit of state.units) {
      if (!unit.alive || unit.evacuated) continue;
      ctx.fillStyle = unit.faction === "player" ? FACTION_STYLE.player.body : FACTION_STYLE.enemy.body;
      const r = Math.max(1.5 * dpr, this.tile * scale * 0.35);
      ctx.beginPath();
      ctx.arc(
        mx + (unit.x + 0.5) * this.tile * scale,
        my + (unit.y + 0.5) * this.tile * scale,
        r,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // 当前视口框
    ctx.strokeStyle = "#f5d76e";
    ctx.lineWidth = Math.max(1.5, 1.5 * dpr);
    ctx.strokeRect(
      mx + this.cameraX * dpr * scale,
      my + this.cameraY * dpr * scale,
      this.viewCssW * dpr * scale,
      this.viewCssH * dpr * scale,
    );
    ctx.restore();
  }

  private drawTile(state: GameState, x: number, y: number): void {
    const { ctx, tile } = this;
    const terrainId = state.tiles[y * state.width + x]!;
    const style = TERRAIN_STYLE[terrainId];
    const snow = state.weather === "snow";

    // 雪天连底色一起换成积雪色，靠贴图而不是蒙版表现天气
    ctx.fillStyle = snow ? snowFill(style.fill) : style.fill;
    if (terrainId === "cliff" || terrainId === "fort" || terrainId === "forest") {
      // 非规则四边形边缘，打破「全是整齐小方块」的观感
      const j = tile * 0.08;
      const hash = (x * 13 + y * 29) & 7;
      const ox = (hash & 1) === 0 ? j : -j * 0.4;
      const oy = (hash & 2) === 0 ? j * 0.5 : -j;
      ctx.beginPath();
      ctx.moveTo(x * tile + ox, y * tile);
      ctx.lineTo(x * tile + tile, y * tile + oy);
      ctx.lineTo(x * tile + tile - ox * 0.5, y * tile + tile);
      ctx.lineTo(x * tile, y * tile + tile - oy * 0.5);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(x * tile, y * tile, tile, tile);
    }

    // 整格贴图铺满
    const drawn = this.drawImage(
      terrainIcon(terrainId, state.weather),
      x * tile,
      y * tile,
      tile,
      tile,
      1,
    );
    if (!drawn) this.drawTerrainIconFallback(terrainId, x, y);

    ctx.strokeStyle = snow ? "rgba(60, 70, 78, 0.22)" : "rgba(20, 24, 16, 0.18)";
    ctx.lineWidth = Math.max(1, tile * 0.02);
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
    const focused = this.overlay.highlightObjectiveId === objective.id;
    const colour =
      objective.owner === "player"
        ? HIGHLIGHT.objectivePlayer
        : objective.owner === "enemy"
          ? HIGHLIGHT.objectiveEnemy
          : HIGHLIGHT.objectiveNeutral;
    ctx.save();
    if (focused) {
      ctx.fillStyle = HIGHLIGHT.objectiveFocus;
      ctx.fillRect(objective.x * tile, objective.y * tile, tile, tile);
      ctx.strokeStyle = HIGHLIGHT.selected;
      ctx.lineWidth = Math.max(3, tile * 0.12);
      ctx.strokeRect(objective.x * tile + 2, objective.y * tile + 2, tile - 4, tile - 4);
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2.5, tile * 0.1);
    if (done) ctx.setLineDash([]);
    else ctx.setLineDash([tile * 0.16, tile * 0.1]);
    ctx.strokeRect(objective.x * tile + 3, objective.y * tile + 3, tile - 6, tile - 6);

    const label = focused ? objective.name : objective.name.slice(0, 2) || "标";
    ctx.fillStyle = colour;
    ctx.font = `700 ${Math.round(tile * (focused ? 0.2 : 0.22))}px "Noto Sans SC", sans-serif`;
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

  /**
   * 移动格铺蓝底并只在区域外沿描边；攻击半径改用红色斜线阴影。
   * 两者重叠时读作「蓝底 + 红斜线」，不会互相盖住。
   */
  private drawOverlay(state: GameState): void {
    const { ctx, tile } = this;

    const fillRegion = (indices: Set<number>, fill: string) => {
      ctx.fillStyle = fill;
      for (const index of indices) {
        const x = index % state.width;
        const y = Math.floor(index / state.width);
        ctx.fillRect(x * tile, y * tile, tile, tile);
      }
    };

    /** 只描区域外沿，避免每格一个方框把地图切碎 */
    const outlineRegion = (indices: Set<number>, color: string, width: number, inset: number) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "square";
      ctx.beginPath();
      for (const index of indices) {
        const x = index % state.width;
        const y = Math.floor(index / state.width);
        const left = x * tile + inset;
        const top = y * tile + inset;
        const right = (x + 1) * tile - inset;
        const bottom = (y + 1) * tile - inset;
        if (!indices.has(index - state.width) || y === 0) {
          ctx.moveTo(left, top);
          ctx.lineTo(right, top);
        }
        if (!indices.has(index + state.width) || y === state.height - 1) {
          ctx.moveTo(left, bottom);
          ctx.lineTo(right, bottom);
        }
        if (x === 0 || !indices.has(index - 1)) {
          ctx.moveTo(left, top);
          ctx.lineTo(left, bottom);
        }
        if (x === state.width - 1 || !indices.has(index + 1)) {
          ctx.moveTo(right, top);
          ctx.lineTo(right, bottom);
        }
      }
      ctx.stroke();
      ctx.restore();
    };

    const hatchRegion = (indices: Set<number>, color: string) => {
      const step = Math.max(6, tile * 0.22);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, tile * 0.045);
      for (const index of indices) {
        const x = (index % state.width) * tile;
        const y = Math.floor(index / state.width) * tile;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, tile, tile);
        ctx.clip();
        ctx.beginPath();
        for (let offset = -tile; offset <= tile; offset += step) {
          ctx.moveTo(x + offset, y + tile);
          ctx.lineTo(x + offset + tile, y);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    };

    fillRegion(this.overlay.moveTiles, HIGHLIGHT.move);
    outlineRegion(this.overlay.moveTiles, HIGHLIGHT.moveEdge, Math.max(2, tile * 0.05), 1);

    hatchRegion(this.overlay.attackTiles, HIGHLIGHT.attackHatch);
    outlineRegion(this.overlay.attackTiles, HIGHLIGHT.attackEdge, Math.max(2, tile * 0.06), 2.5);

    fillRegion(this.overlay.resupplyIdleTiles, HIGHLIGHT.resupplyIdle);
    outlineRegion(this.overlay.resupplyIdleTiles, HIGHLIGHT.resupplyIdleEdge, Math.max(1.5, tile * 0.04), 1.5);

    fillRegion(this.overlay.resupplyTiles, HIGHLIGHT.resupply);
    hatchRegion(this.overlay.resupplyTiles, HIGHLIGHT.resupplyHatch);
    outlineRegion(this.overlay.resupplyTiles, HIGHLIGHT.resupplyEdge, Math.max(2, tile * 0.05), 2.5);

    fillRegion(this.overlay.itemTiles, HIGHLIGHT.item);
    hatchRegion(this.overlay.itemTiles, HIGHLIGHT.itemHatch);
    outlineRegion(this.overlay.itemTiles, HIGHLIGHT.attackEdge, Math.max(2, tile * 0.05), 2.5);
  }

  /** 目标标记画在单位之上，否则会被单位圆形盖住 */
  private drawTargetMarks(state: GameState, indices: Set<number>): void {
    const { ctx, tile } = this;
    for (const index of indices) {
      const x = (index % state.width) * tile;
      const y = Math.floor(index / state.width) * tile;
      const cx = x + tile / 2;
      const cy = y + tile / 2;
      const radius = tile * 0.44;
      ctx.save();

      // 双层描边保证在任何地形与单位色上都看得清
      ctx.lineWidth = Math.max(3, tile * 0.09);
      ctx.strokeStyle = "rgba(20, 10, 8, 0.55)";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = Math.max(1.6, tile * 0.05);
      ctx.strokeStyle = "#ffd9cf";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // 四角括号，突出「这是可打的目标」
      const arm = tile * 0.18;
      const pad = tile * 0.08;
      ctx.lineWidth = Math.max(2, tile * 0.06);
      ctx.strokeStyle = HIGHLIGHT.attackEdge;
      ctx.beginPath();
      for (const [sx, sy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ] as const) {
        const px = sx > 0 ? x + pad : x + tile - pad;
        const py = sy > 0 ? y + pad : y + tile - pad;
        ctx.moveTo(px + sx * arm, py);
        ctx.lineTo(px, py);
        ctx.lineTo(px, py + sy * arm);
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

  private drawUnit(unit: Unit, alpha = 1, hpOverride?: number): void {
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
    ctx.globalAlpha = (acted ? 0.55 : 1) * alpha;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = this.tokenFace(unit.faction);
    ctx.fill();
    ctx.lineWidth = Math.max(2.4, tile * 0.08);
    ctx.strokeStyle = style.body;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - tile * 0.03, 0, Math.PI * 2);
    ctx.strokeStyle = style.ring;
    ctx.lineWidth = Math.max(1.2, tile * 0.035);
    ctx.stroke();

    const iconSize = radius * 1.95;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.86, 0, Math.PI * 2);
    ctx.clip();
    const portrait = unitPortrait(unit);
    const iconDrawn = this.drawImage(
      portrait,
      cx - iconSize / 2,
      cy - iconSize / 2,
      iconSize,
      iconSize,
    );
    ctx.restore();
    if (!iconDrawn) {
      this.drawUnitSilhouette(unit.type, cx, cy, radius, style.body);
    }

    // 人物肖像是单位主体；右下角用独立兵种角标保证缩小时仍可识别。
    const roleSize = radius * 0.78;
    const roleX = cx + radius * 0.18;
    const roleY = cy + radius * 0.18;
    ctx.beginPath();
    ctx.arc(roleX + roleSize / 2, roleY + roleSize / 2, roleSize * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = unit.faction === "player" ? "#e4d39d" : "#d9b4aa";
    ctx.fill();
    ctx.strokeStyle = style.body;
    ctx.lineWidth = Math.max(1.5, tile * 0.025);
    ctx.stroke();
    this.drawImage(UNIT_ROLE_ICON[unit.type], roleX, roleY, roleSize, roleSize);

    ctx.restore();

    if (visual?.flashUnitId === unit.id) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.fill();
    }

    const hp =
      hpOverride !== undefined
        ? hpOverride
        : visual?.hpDisplay[unit.id] !== undefined
          ? visual.hpDisplay[unit.id]!
          : unit.hp;
    const barWidth = tile * 0.72;
    const barHeight = Math.max(3, tile * 0.09);
    const barX = cx - barWidth / 2;
    const barY = cy + radius + tile * 0.04;
    ctx.fillStyle = "rgba(22, 26, 20, 0.45)";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    const ratio = Math.max(0, Math.min(1, hp / unit.maxHp));
    ctx.fillStyle = ratio > 0.55 ? "#5aa469" : ratio > 0.28 ? "#d9a326" : "#c8503c";
    ctx.fillRect(barX, barY, barWidth * ratio, barHeight);

    const pips = Math.min(5, Math.max(1, Math.ceil(unit.level / 4)));
    for (let i = 0; i < pips; i += 1) {
      ctx.beginPath();
      ctx.arc(cx - tile * 0.22 + i * tile * 0.16, cy - radius * 0.85, tile * 0.055, 0, Math.PI * 2);
      ctx.fillStyle = unit.commanderKind === "story" ? "#9ec5e8" : "#f5d76e";
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
      case "artillery": {
        ctx.beginPath();
        ctx.moveTo(cx - radius * 0.4, cy + radius * 0.3);
        ctx.lineTo(cx + radius * 0.35, cy - radius * 0.25);
        ctx.lineWidth = Math.max(2, radius * 0.22);
        ctx.stroke();
        ctx.lineWidth = Math.max(1.4, radius * 0.14);
        ctx.beginPath();
        ctx.arc(cx - radius * 0.28, cy + radius * 0.28, radius * 0.16, 0, Math.PI * 2);
        ctx.arc(cx - radius * 0.05, cy + radius * 0.32, radius * 0.16, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "logistics": {
        const w = radius * 0.9;
        const h = radius * 0.55;
        ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.15, cy);
        ctx.lineTo(cx + w * 0.15, cy);
        ctx.moveTo(cx, cy - h * 0.25);
        ctx.lineTo(cx, cy + h * 0.25);
        ctx.stroke();
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

  /** 溃散：红色横幅 + 叉号，确保单位消失前有明确交代 */
  private drawRoutBurst(state: GameState, visual: VisualFrame): void {
    const burst = visual.routBurst;
    if (!burst) return;
    const unit = state.units.find((u) => u.id === burst.unitId);
    if (!unit) return;
    const { cx, cy } = this.unitDrawPos(unit);
    const { ctx, tile } = this;
    ctx.save();
    ctx.globalAlpha = burst.alpha;

    const cross = tile * 0.26;
    ctx.strokeStyle = "rgba(28, 12, 10, 0.7)";
    ctx.lineWidth = Math.max(4, tile * 0.11);
    ctx.beginPath();
    ctx.moveTo(cx - cross, cy - cross);
    ctx.lineTo(cx + cross, cy + cross);
    ctx.moveTo(cx + cross, cy - cross);
    ctx.lineTo(cx - cross, cy + cross);
    ctx.stroke();
    ctx.strokeStyle = "#ff8f7a";
    ctx.lineWidth = Math.max(2, tile * 0.055);
    ctx.beginPath();
    ctx.moveTo(cx - cross, cy - cross);
    ctx.lineTo(cx + cross, cy + cross);
    ctx.moveTo(cx + cross, cy - cross);
    ctx.lineTo(cx - cross, cy + cross);
    ctx.stroke();

    const label = burst.text;
    ctx.font = `700 ${Math.round(tile * 0.3)}px "Noto Sans SC", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const y = cy - tile * 0.52;
    const w = ctx.measureText(label).width + tile * 0.24;
    ctx.fillStyle = "rgba(120, 24, 18, 0.88)";
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, y - tile * 0.16, w, tile * 0.32, tile * 0.08);
    ctx.fill();
    ctx.strokeStyle = "#ffb9a8";
    ctx.lineWidth = Math.max(1.5, tile * 0.02);
    ctx.stroke();
    ctx.fillStyle = "#fff1ec";
    ctx.fillText(label, cx, y);
    ctx.restore();
  }

  /** 晋升：金色横幅弹出 */
  private drawPromoteBurst(state: GameState, visual: VisualFrame): void {
    const burst = visual.promoteBurst;
    if (!burst) return;
    const unit = state.units.find((u) => u.id === burst.unitId);
    if (!unit) return;
    const { cx, cy } = this.unitDrawPos(unit);
    const { ctx, tile } = this;
    ctx.save();
    ctx.globalAlpha = burst.alpha;
    ctx.translate(cx, cy - tile * 0.62);
    ctx.scale(burst.scale, burst.scale);
    ctx.font = `700 ${Math.round(tile * 0.3)}px "Noto Sans SC", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(burst.text).width + tile * 0.3;
    ctx.fillStyle = "rgba(70, 52, 12, 0.9)";
    ctx.beginPath();
    ctx.roundRect(-w / 2, -tile * 0.18, w, tile * 0.36, tile * 0.09);
    ctx.fill();
    ctx.strokeStyle = "#f5d76e";
    ctx.lineWidth = Math.max(1.8, tile * 0.025);
    ctx.stroke();
    ctx.fillStyle = "#ffeeb4";
    ctx.fillText(burst.text, 0, 0);

    // 星芒点出「这是好事」
    ctx.strokeStyle = "#f5d76e";
    ctx.lineWidth = Math.max(1.5, tile * 0.02);
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI * 2 * i) / 6;
      const r0 = tile * 0.24;
      const r1 = tile * 0.34;
      ctx.moveTo(Math.cos(angle) * r0, Math.sin(angle) * r0 * 0.6);
      ctx.lineTo(Math.cos(angle) * r1, Math.sin(angle) * r1 * 0.6);
    }
    ctx.stroke();
    ctx.restore();
  }
}

export function terrainName(state: GameState, x: number, y: number): string {
  return TERRAIN[state.tiles[y * state.width + x]!].name;
}

/** 把地形底色推向积雪色，作为雪地贴图的兜底底板 */
function snowFill(hex: string): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const mix = (channel: number, target: number) => Math.round(channel + (target - channel) * 0.72);
  return `rgb(${mix(r, 246)}, ${mix(g, 249)}, ${mix(b, 253)})`;
}

/** Expose item icon path for panel buttons (canvas uses UI field-item). */
export { ITEM_ICON };
