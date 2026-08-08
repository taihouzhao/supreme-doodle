import { ITEMS, ITEM_IDS } from "../content/items";
import { CHAPTER_ONE } from "../content/chapter";
import type { MissionConfig } from "../content/missions/schema";
import { UNIT_TYPES } from "../content/units";
import {
  createCampaign,
  equipWeapon,
  finishMission,
  startMission,
  type CampaignState,
  type MissionOutcome,
} from "../core/campaign";
import { applyAction, IllegalActionError } from "../core/engine";
import {
  attackRangeTiles,
  attackableTargets,
  livingUnits,
  manhattan,
  reachableTiles,
  unitAt,
} from "../core/grid";
import type {
  Action,
  DamageBreakdown,
  GameEvent,
  GameState,
  ItemId,
  Unit,
  Vec2,
  WeaponId,
  Weather,
} from "../core/types";
import { describeEvent } from "./format";
import { clipsFromEvents, Presentation } from "./presentation";
import {
  appendReplay,
  clearSave,
  loadFxSpeed,
  loadSave,
  writeFxSpeed,
  writeSave,
} from "./storage";

export type Screen = "title" | "brief" | "battle" | "result" | "chapterEnd";

export interface LogEntry {
  id: number;
  turn: number;
  text: string;
  tone: "player" | "enemy" | "system";
}

export interface LastStrike {
  attackerId: string;
  defenderId: string;
  damage: number;
  counterDamage: number;
  breakdown: DamageBreakdown;
}

export interface SessionState {
  screen: Screen;
  campaign: CampaignState;
  mission: MissionConfig | null;
  battle: GameState | null;
  selectedUnitId: string | null;
  inspectedTile: Vec2 | null;
  highlightObjectiveId: string | null;
  detailExpanded: boolean;
  pendingItem: ItemId | null;
  log: LogEntry[];
  lastStrike: LastStrike | null;
  outcome: MissionOutcome | null;
  replacements: string[];
  actions: Action[];
  hasSave: boolean;
  notice: string | null;
  fxBusy: boolean;
  /** 交战动画倍速：1 / 2 / 3 */
  fxSpeed: number;
}

type Listener = (state: SessionState) => void;
type VisualListener = () => void;

export class Session {
  private state: SessionState;
  private listeners: Listener[] = [];
  private visualListeners: VisualListener[] = [];
  private logSerial = 0;
  private pendingConclude: GameState | null = null;
  readonly presentation: Presentation;

  constructor() {
    const save = loadSave();
    this.state = {
      screen: "title",
      campaign: save?.campaign ?? createCampaign(CHAPTER_ONE.id, freshSeed()),
      mission: null,
      battle: null,
      selectedUnitId: null,
      inspectedTile: null,
      highlightObjectiveId: null,
      detailExpanded: false,
      pendingItem: null,
      log: [],
      lastStrike: null,
      outcome: null,
      replacements: [],
      actions: [],
      hasSave: save !== null,
      notice: null,
      fxBusy: false,
      fxSpeed: loadFxSpeed(),
    };
    this.presentation = new Presentation(
      () => {
        for (const listener of this.visualListeners) listener();
      },
      () => this.onPresentationIdle(),
    );
    this.presentation.setSpeed(this.state.fxSpeed);
  }

  /** 在 1x / 2x / 3x 之间循环，选择记在本地 */
  cycleFxSpeed(): void {
    const next = this.state.fxSpeed >= 3 ? 1 : this.state.fxSpeed + 1;
    this.presentation.setSpeed(next);
    writeFxSpeed(next);
    this.update({ fxSpeed: next });
  }

  /** 跳过正在播放的交战动画 */
  skipFx(): void {
    this.presentation.skip();
  }

  subscribe(listener: Listener): void {
    this.listeners.push(listener);
    listener(this.state);
  }

  /** 仅刷新棋盘动画帧，不重绘整页 DOM */
  onVisual(listener: VisualListener): void {
    this.visualListeners.push(listener);
  }

  get current(): SessionState {
    return this.state;
  }

  private update(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private pushLog(entries: { text: string; tone: LogEntry["tone"] }[], turn: number): LogEntry[] {
    const next = [...this.state.log];
    for (const entry of entries) {
      this.logSerial += 1;
      next.push({ id: this.logSerial, turn, ...entry });
    }
    return next.slice(-60);
  }

  private pendingRoutNotice: string | null = null;

  private onPresentationIdle(): void {
    const notice = this.pendingRoutNotice;
    this.pendingRoutNotice = null;
    if (this.state.fxBusy || notice) {
      this.update({ fxBusy: false, notice: notice ?? this.state.notice });
    } else {
      for (const listener of this.listeners) listener(this.state);
    }
    if (this.pendingConclude) {
      const finalState = this.pendingConclude;
      this.pendingConclude = null;
      this.concludeMission(finalState);
    }
  }

  newCampaign(): void {
    clearSave();
    this.logSerial = 0;
    this.presentation.reset();
    this.pendingConclude = null;
    this.update({
      screen: "brief",
      campaign: createCampaign(CHAPTER_ONE.id, freshSeed()),
      mission: null,
      battle: null,
      outcome: null,
      log: [],
      actions: [],
      hasSave: false,
      notice: null,
      inspectedTile: null,
      fxBusy: false,
    });
  }

  /** 出击前手动换装，立即存档 */
  equipWeapon(unitId: string, weapon: WeaponId): void {
    const campaign = equipWeapon(this.state.campaign, unitId, weapon);
    if (campaign === this.state.campaign) return;
    writeSave(campaign);
    this.update({ campaign });
  }

  continueCampaign(): void {
    this.update({ screen: this.state.campaign.status === "complete" ? "chapterEnd" : "brief" });
  }

  beginMission(): void {
    const started = startMission(this.state.campaign);
    writeSave(started.campaign);
    this.logSerial = 0;
    this.presentation.reset();
    this.pendingConclude = null;
    this.update({
      screen: "battle",
      campaign: started.campaign,
      mission: started.mission,
      battle: started.state,
      replacements: started.replacements,
      selectedUnitId: null,
      inspectedTile: null,
      pendingItem: null,
      lastStrike: null,
      outcome: null,
      actions: [],
      fxBusy: false,
      log: [
        {
          id: ++this.logSerial,
          turn: 1,
          tone: "system",
          text: `${started.mission.name}：${started.mission.brief}`,
        },
      ],
      notice: missionStartNotice(started.mission, started.state.weather),
    });
  }

  selectUnit(unitId: string | null): void {
    if (this.state.fxBusy) return;
    const unit = this.state.battle?.units.find((u) => u.id === unitId);
    this.update({
      selectedUnitId: unitId,
      pendingItem: null,
      inspectedTile: unit ? { x: unit.x, y: unit.y } : this.state.inspectedTile,
    });
  }

  clearFocus(): void {
    if (this.state.fxBusy) return;
    this.update({
      selectedUnitId: null,
      pendingItem: null,
      inspectedTile: null,
      highlightObjectiveId: null,
      detailExpanded: false,
      lastStrike: null,
    });
  }

  toggleDetail(): void {
    this.update({ detailExpanded: !this.state.detailExpanded });
  }

  focusObjective(objectiveId: string): void {
    const battle = this.state.battle;
    if (!battle) return;
    const objective = battle.objectives.find((o) => o.id === objectiveId);
    if (!objective) {
      // 撤离类目标：跳到撤离带中心
      if (objectiveId === "evac-quota" && battle.evacZone.length > 0) {
        const cx =
          battle.evacZone.reduce((s, z) => s + z.x, 0) / battle.evacZone.length;
        const cy =
          battle.evacZone.reduce((s, z) => s + z.y, 0) / battle.evacZone.length;
        this.update({
          highlightObjectiveId: objectiveId,
          inspectedTile: { x: Math.round(cx), y: Math.round(cy) },
          selectedUnitId: null,
        });
      }
      return;
    }
    this.update({
      highlightObjectiveId: objectiveId,
      inspectedTile: { x: objective.x, y: objective.y },
      selectedUnitId: null,
      detailExpanded: false,
    });
  }

  toggleItem(item: ItemId | null): void {
    if (this.state.fxBusy) return;
    this.update({ pendingItem: this.state.pendingItem === item ? null : item });
  }

  get selectedUnit(): Unit | null {
    const { battle, selectedUnitId } = this.state;
    if (!battle || !selectedUnitId) return null;
    return battle.units.find((u) => u.id === selectedUnitId) ?? null;
  }

  /** 当前选中单位可以停留的格子 */
  moveTiles(): Set<number> {
    const battle = this.state.battle;
    const unit = this.selectedUnit;
    const tiles = new Set<number>();
    if (
      !battle ||
      !unit ||
      unit.faction !== "player" ||
      unit.hasActed ||
      this.state.pendingItem ||
      this.state.fxBusy
    ) {
      return tiles;
    }
    for (const tile of reachableTiles(battle, unit)) {
      if (tile.cost === 0) continue;
      const occupant = unitAt(battle, tile.x, tile.y);
      if (occupant && occupant.id !== unit.id) continue;
      tiles.add(tile.y * battle.width + tile.x);
    }
    return tiles;
  }

  /** 攻击半径（含空地），叠加在移动蓝格上 */
  attackTiles(): Set<number> {
    const battle = this.state.battle;
    const unit = this.selectedUnit;
    const tiles = new Set<number>();
    if (
      !battle ||
      !unit ||
      unit.faction !== "player" ||
      unit.hasActed ||
      this.state.pendingItem ||
      this.state.fxBusy
    ) {
      return tiles;
    }
    for (const tile of attackRangeTiles(battle, unit)) {
      tiles.add(tile.y * battle.width + tile.x);
    }
    return tiles;
  }

  /** 当前可点选攻击的敌方格子 */
  attackTargets(): Set<number> {
    const battle = this.state.battle;
    const unit = this.selectedUnit;
    const tiles = new Set<number>();
    if (
      !battle ||
      !unit ||
      unit.faction !== "player" ||
      unit.hasActed ||
      this.state.pendingItem ||
      this.state.fxBusy
    ) {
      return tiles;
    }
    for (const target of attackableTargets(battle, unit)) {
      tiles.add(target.y * battle.width + target.x);
    }
    return tiles;
  }

  itemTiles(): Set<number> {
    const battle = this.state.battle;
    const unit = this.selectedUnit;
    const item = this.state.pendingItem;
    const tiles = new Set<number>();
    if (!battle || !unit || !item || unit.hasActed || this.state.fxBusy) return tiles;
    const def = ITEMS[item];
    if (def.targeting === "self") return tiles;
    for (const enemy of livingUnits(battle, "enemy")) {
      if (manhattan(unit, enemy) > def.range) continue;
      if (def.antiArmorOnly && !UNIT_TYPES[enemy.type].vehicle) continue;
      tiles.add(enemy.y * battle.width + enemy.x);
    }
    return tiles;
  }

  clickTile(pos: Vec2): void {
    const battle = this.state.battle;
    if (!battle || battle.status !== "playing" || this.state.fxBusy) return;

    const occupant = unitAt(battle, pos.x, pos.y);
    const unit = this.selectedUnit;
    const item = this.state.pendingItem;

    if (unit && item) {
      const def = ITEMS[item];
      if (def.targeting === "target" && occupant?.faction === "enemy") {
        this.dispatch({ kind: "useItem", unitId: unit.id, item, targetId: occupant.id });
        return;
      }
      if (def.targeting === "tile") {
        this.dispatch({ kind: "useItem", unitId: unit.id, item, to: { x: pos.x, y: pos.y } });
        return;
      }
      this.update({ pendingItem: null, inspectedTile: { ...pos } });
      return;
    }

    if (unit && unit.faction === "player" && !unit.hasActed) {
      if (occupant?.faction === "enemy" && this.attackTiles().has(pos.y * battle.width + pos.x)) {
        this.dispatch({ kind: "attack", unitId: unit.id, targetId: occupant.id });
        return;
      }
      if (!occupant && this.moveTiles().has(pos.y * battle.width + pos.x)) {
        this.dispatch({ kind: "move", unitId: unit.id, to: { x: pos.x, y: pos.y } });
        return;
      }
    }

    if (occupant) {
      this.update({
        selectedUnitId: occupant.id,
        pendingItem: null,
        inspectedTile: { x: pos.x, y: pos.y },
      });
      return;
    }

    this.update({
      selectedUnitId: null,
      pendingItem: null,
      inspectedTile: { x: pos.x, y: pos.y },
    });
  }

  dispatch(action: Action): void {
    const battle = this.state.battle;
    if (!battle || battle.status !== "playing" || this.state.fxBusy) return;

    let result;
    try {
      result = applyAction(battle, action);
    } catch (error) {
      if (error instanceof IllegalActionError) {
        this.update({ notice: error.message, pendingItem: null });
        return;
      }
      throw error;
    }

    const next = result.state;
    const entries: { text: string; tone: LogEntry["tone"] }[] = [];
    let strike: LastStrike | null = this.state.lastStrike;

    for (const event of result.events) {
      const text = describeEvent(next, event);
      if (!text) continue;
      const tone: LogEntry["tone"] =
        event.type === "attacked"
          ? next.units.find((u) => u.id === event.attackerId)?.faction === "player"
            ? "player"
            : "enemy"
          : "system";
      entries.push({ text, tone });
      if (event.type === "attacked") {
        strike = {
          attackerId: event.attackerId,
          defenderId: event.defenderId,
          damage: event.damage,
          counterDamage: event.counterDamage,
          breakdown: event.breakdown,
        };
      }
    }

    const selected = next.units.find((u) => u.id === this.state.selectedUnitId);
    const clips = clipsFromEvents(next, result.events);
    this.pendingRoutNotice = combatNotice(next, result.events);

    this.update({
      battle: next,
      actions: [...this.state.actions, action],
      log: this.pushLog(entries, next.turn),
      lastStrike: strike,
      pendingItem: null,
      notice: clips.length > 0 ? null : this.pendingRoutNotice,
      selectedUnitId: selected && selected.alive && !selected.hasActed ? selected.id : null,
      fxBusy: clips.length > 0,
    });
    if (clips.length === 0) this.pendingRoutNotice = null;

    if (next.status !== "playing") {
      this.pendingConclude = next;
    }

    if (clips.length > 0) {
      this.presentation.enqueue(clips);
    } else if (this.pendingConclude) {
      const finalState = this.pendingConclude;
      this.pendingConclude = null;
      this.concludeMission(finalState);
    }
  }

  endTurn(): void {
    this.dispatch({ kind: "endTurn" });
  }

  private concludeMission(finalState: GameState): void {
    const finished = finishMission(this.state.campaign, finalState, this.state.replacements);
    writeSave(finished.campaign);
    appendReplay({
      chapterId: finished.campaign.chapterId,
      missionId: finalState.missionId,
      seed: finalState.seed,
      status: finalState.status,
      actions: this.state.actions,
      recordedAt: Date.now(),
    });
    this.presentation.reset();
    this.update({
      screen: "result",
      campaign: finished.campaign,
      outcome: finished.outcome,
      hasSave: true,
      selectedUnitId: null,
      inspectedTile: null,
      fxBusy: false,
    });
  }

  proceed(): void {
    this.update({
      screen: this.state.campaign.status === "complete" ? "chapterEnd" : "brief",
      battle: null,
      mission: null,
    });
  }

  dismissNotice(): void {
    if (this.state.notice) this.update({ notice: null });
  }

  availableItems(): { id: ItemId; count: number }[] {
    const battle = this.state.battle;
    if (!battle) return [];
    return ITEM_IDS.map((id) => ({ id, count: battle.inventory[id] ?? 0 })).filter(
      (entry) => entry.count > 0,
    );
  }
}

function freshSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** 进场横幅：天气与战史脚本一并提示，避免规则只藏在简报里 */
function missionStartNotice(mission: MissionConfig, weather: Weather): string | null {
  const parts: string[] = [];
  if (weather !== "clear") {
    parts.push(
      `${mission.weather?.label ?? "复杂天气"}：${mission.weather?.detail ?? "移动与远程火力受到影响"}`,
    );
  }
  const scripted = (mission.scripted ?? []).map((rule) => rule.note);
  if (scripted.length > 0) parts.push(`战史规则：${scripted.join("；")}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 一次结算里的溃散与晋升摘要，动画播完后作为横幅提示 */
function combatNotice(state: GameState, events: GameEvent[]): string | null {
  const parts: string[] = [];
  const routed = events
    .filter((e): e is Extract<GameEvent, { type: "routed" }> => e.type === "routed")
    .map((e) => state.units.find((u) => u.id === e.unitId))
    .filter((u): u is Unit => Boolean(u));
  const lost = routed.filter((u) => u.faction === "player").map((u) => u.name);
  const killed = routed.filter((u) => u.faction === "enemy").map((u) => u.name);
  if (killed.length > 0) parts.push(`击溃 ${killed.join("、")}`);
  if (lost.length > 0) parts.push(`我方 ${lost.join("、")} 溃散撤离`);

  const promotions = events
    .filter((e): e is Extract<GameEvent, { type: "levelUp" }> => e.type === "levelUp")
    .map((e) => {
      const unit = state.units.find((u) => u.id === e.unitId);
      return unit && unit.faction === "player" ? `${unit.name} 晋升${e.rank}` : null;
    })
    .filter((text): text is string => Boolean(text));
  if (promotions.length > 0) parts.push(promotions.join("、"));

  return parts.length > 0 ? parts.join(" · ") : null;
}
