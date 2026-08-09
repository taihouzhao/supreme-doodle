import { ITEMS, ITEM_IDS } from "../content/items";
import { CHAPTER_ONE } from "../content/chapter";
import type { MissionConfig } from "../content/missions/schema";
import { UNIT_TYPES } from "../content/units";
import {
  createCampaign,
  equipWeapon,
  finishMission,
  personnelTransferBounds,
  startMission,
  transferPersonnel,
  toggleDeployUnit,
  adjustLoadoutItem,
  companionDeployCap,
  currentMission,
  normalizeDeployIds,
  sumLoadout,
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
  adjacentFriendlyUnits as gridAdjacentFriendly,
  resupplyTargets as gridResupplyTargets,
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
import { buildAttackPreview, type AttackPreview } from "./combatPreview";
import { describeEvent } from "./format";
import { buildTimeline, Presentation } from "./presentation";
import {
  appendReplay,
  clearSave,
  loadFxSpeed,
  loadSave,
  writeFxSpeed,
  writeSave,
} from "./storage";

export type Screen = "title" | "brief" | "battle" | "result" | "chapterEnd";

export type BriefTab = "staff" | "ordnance" | "org";

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

export interface PendingAttack {
  attackerId: string;
  defenderId: string;
}

/** 移动后尚未攻击/休整前，可整段撤回的快照 */
export interface UndoableMove {
  unitId: string;
  /** 该单位本轮第一次移动之前的整盘状态 */
  before: GameState;
  /** 快照时的动作条长度，撤销时截断回放 */
  actionsLength: number;
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
  pendingAttack: PendingAttack | null;
  /** 尚有未行动单位时，结束回合需要第二次确认。 */
  endTurnArmed: boolean;
  /** 移动可撤销：未执行攻击/休整/占领/道具前有效 */
  undoableMove: UndoableMove | null;
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
  /** 指挥部仪表盘当前部门 */
  briefTab: BriefTab;
  /** 出击前组织部的人员调拨草稿；确认后写入 CampaignState。 */
  personnelTransfer: {
    sourceId: string | null;
    targetId: string | null;
    amount: number;
  };
  /** 回合日志默认折叠，用户主动展开后才显示事件列表。 */
  logExpanded: boolean;
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
      pendingAttack: null,
      endTurnArmed: false,
      undoableMove: null,
      log: [],
      lastStrike: null,
      outcome: null,
      replacements: [],
      actions: [],
      hasSave: save !== null,
      notice: null,
      fxBusy: false,
      fxSpeed: loadFxSpeed(),
      briefTab: "staff",
      personnelTransfer: { sourceId: null, targetId: null, amount: 0 },
      logExpanded: false,
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
      pendingAttack: null,
      endTurnArmed: false,
      fxBusy: false,
      briefTab: "staff",
      personnelTransfer: { sourceId: null, targetId: null, amount: 0 },
      logExpanded: false,
    });
  }

  setBriefTab(tab: BriefTab): void {
    if (this.state.screen !== "brief") return;
    if (tab === this.state.briefTab) return;
    this.update({ briefTab: tab });
  }

  /** 当前组织部人员调拨草稿及可调拨上限。 */
  personnelTransferDraft(): {
    sourceId: string | null;
    targetId: string | null;
    amount: number;
    max: number;
  } {
    const draft = this.state.personnelTransfer;
    const bounds = personnelTransferBounds(this.state.campaign, draft.sourceId, draft.targetId);
    const amount = Math.min(Math.max(0, draft.amount), bounds.max);
    return { sourceId: bounds.sourceId, targetId: bounds.targetId, amount, max: bounds.max };
  }

  selectPersonnelTarget(targetId: string): void {
    if (this.state.screen !== "brief") return;
    const bounds = personnelTransferBounds(this.state.campaign, null, targetId);
    if (!bounds.targetId) return;
    this.update({
      personnelTransfer: {
        sourceId: bounds.sourceId,
        targetId: bounds.targetId,
        amount: Math.min(10, bounds.max),
      },
    });
  }

  adjustPersonnelTransfer(delta: number): void {
    if (this.state.screen !== "brief") return;
    const draft = this.personnelTransferDraft();
    this.update({
      personnelTransfer: {
        sourceId: draft.sourceId,
        targetId: draft.targetId,
        amount: Math.max(0, Math.min(draft.max, draft.amount + Math.floor(delta))),
      },
    });
  }

  confirmPersonnelTransfer(): void {
    if (this.state.screen !== "brief") return;
    const draft = this.personnelTransferDraft();
    if (!draft.sourceId || !draft.targetId || draft.amount <= 0) {
      this.update({ notice: "当前没有可调拨的缺口，或后勤队已达到最低机动编制。" });
      return;
    }
    const campaign = transferPersonnel(
      this.state.campaign,
      draft.sourceId,
      draft.targetId,
      draft.amount,
    );
    if (campaign === this.state.campaign) {
      this.update({ notice: "调拨未生效，请检查目标缺口与后勤余量。" });
      return;
    }
    writeSave(campaign);
    this.update({
      campaign,
      personnelTransfer: { sourceId: draft.sourceId, targetId: draft.targetId, amount: 0 },
      notice: `已从后勤队调拨 ${draft.amount} 人至作战单位。`,
    });
  }

  toggleLog(): void {
    this.update({ logExpanded: !this.state.logExpanded });
  }

  /** 出击前手动换装，立即存档 */
  equipWeapon(unitId: string, weapon: WeaponId): void {
    const campaign = equipWeapon(this.state.campaign, unitId, weapon);
    if (campaign === this.state.campaign) return;
    writeSave(campaign);
    this.update({ campaign });
  }

  toggleDeploy(unitId: string): void {
    if (this.state.screen !== "brief") return;
    const campaign = toggleDeployUnit(this.state.campaign, unitId);
    if (campaign === this.state.campaign) return;
    writeSave(campaign);
    this.update({ campaign });
  }

  adjustLoadout(rosterId: string, itemId: ItemId, delta: number): void {
    if (this.state.screen !== "brief") return;
    const campaign = adjustLoadoutItem(this.state.campaign, rosterId, itemId, delta);
    if (campaign === this.state.campaign) return;
    writeSave(campaign);
    this.update({ campaign });
  }

  deployCap(): number {
    const mission = currentMission(this.state.campaign);
    return mission ? companionDeployCap(mission) : 0;
  }

  deployedIds(): string[] {
    const mission = currentMission(this.state.campaign);
    if (!mission) return [];
    return normalizeDeployIds(this.state.campaign, mission, this.state.campaign.pendingDeploy);
  }

  loadoutTotals(): Record<ItemId, number> {
    return sumLoadout(this.state.campaign.pendingLoadout ?? {});
  }

  continueCampaign(): void {
    this.update({
      screen: this.state.campaign.status === "complete" ? "chapterEnd" : "brief",
      briefTab: "staff",
      personnelTransfer: { sourceId: null, targetId: null, amount: 0 },
    });
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
      pendingAttack: null,
      endTurnArmed: false,
      undoableMove: null,
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
      logExpanded: false,
    });
  }

  selectUnit(unitId: string | null): void {
    if (this.state.fxBusy) return;
    // 换选其他单位视为接受当前移动，撤销窗口关闭
    const undo = this.state.undoableMove;
    const clearUndo = undo && undo.unitId !== unitId;
    const unit = this.state.battle?.units.find((u) => u.id === unitId);
    this.update({
      selectedUnitId: unitId,
      pendingItem: null,
      pendingAttack: null,
      endTurnArmed: false,
      undoableMove: clearUndo ? null : this.state.undoableMove,
      inspectedTile: unit ? { x: unit.x, y: unit.y } : this.state.inspectedTile,
    });
  }

  clearFocus(): void {
    if (this.state.fxBusy) return;
    this.update({
      selectedUnitId: null,
      pendingItem: null,
      pendingAttack: null,
      endTurnArmed: false,
      undoableMove: null,
      inspectedTile: null,
      highlightObjectiveId: null,
      detailExpanded: false,
      lastStrike: null,
    });
  }

  /** 撤回本单位尚未锁定的移动，回到落点前的位置与物资状态 */
  undoMove(): void {
    if (this.state.fxBusy) return;
    const undo = this.state.undoableMove;
    if (!undo || !this.state.battle) return;
    const restored = structuredClone(undo.before);
    const unit = restored.units.find((u) => u.id === undo.unitId);
    this.update({
      battle: restored,
      actions: this.state.actions.slice(0, undo.actionsLength),
      undoableMove: null,
      pendingItem: null,
      pendingAttack: null,
      endTurnArmed: false,
      selectedUnitId: unit && unit.alive && !unit.hasActed ? unit.id : null,
      inspectedTile: unit ? { x: unit.x, y: unit.y } : this.state.inspectedTile,
      notice: unit ? `${unit.name} 已撤回移动` : null,
    });
  }

  /** 当前选中单位是否仍可撤销移动 */
  canUndoMove(): boolean {
    const undo = this.state.undoableMove;
    const unit = this.selectedUnit;
    return Boolean(
      undo &&
        unit &&
        undo.unitId === unit.id &&
        !unit.hasActed &&
        !this.state.fxBusy,
    );
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
          pendingAttack: null,
          endTurnArmed: false,
        });
      }
      return;
    }
    this.update({
      highlightObjectiveId: objectiveId,
      inspectedTile: { x: objective.x, y: objective.y },
      selectedUnitId: null,
      pendingAttack: null,
      endTurnArmed: false,
      detailExpanded: false,
    });
  }

  toggleItem(item: ItemId | null): void {
    if (this.state.fxBusy) return;
    this.update({
      pendingItem: this.state.pendingItem === item ? null : item,
      pendingAttack: null,
      endTurnArmed: false,
    });
  }

  get selectedUnit(): Unit | null {
    const { battle, selectedUnitId } = this.state;
    if (!battle || !selectedUnitId) return null;
    return battle.units.find((u) => u.id === selectedUnitId) ?? null;
  }

  attackPreview(): AttackPreview | null {
    const battle = this.state.battle;
    const pending = this.state.pendingAttack;
    if (!battle || !pending) return null;
    const attacker = battle.units.find((u) => u.id === pending.attackerId);
    const defender = battle.units.find((u) => u.id === pending.defenderId);
    if (!attacker || !defender || !attacker.alive || !defender.alive) return null;
    return buildAttackPreview(battle, attacker, defender);
  }

  confirmAttack(): void {
    const pending = this.state.pendingAttack;
    if (!pending) return;
    this.dispatch({
      kind: "attack",
      unitId: pending.attackerId,
      targetId: pending.defenderId,
    });
  }

  cancelAttack(): void {
    if (!this.state.pendingAttack) return;
    this.update({ pendingAttack: null, notice: null });
  }

  unactedPlayerUnits(): Unit[] {
    const battle = this.state.battle;
    if (!battle) return [];
    return livingUnits(battle, "player").filter((unit) => !unit.hasActed);
  }

  selectNextUnit(): Unit | null {
    if (this.state.fxBusy) return null;
    const units = this.unactedPlayerUnits();
    if (units.length === 0) return null;
    const current = units.findIndex((unit) => unit.id === this.state.selectedUnitId);
    const next = units[(current + 1 + units.length) % units.length]!;
    const undo = this.state.undoableMove;
    this.update({
      selectedUnitId: next.id,
      inspectedTile: { x: next.x, y: next.y },
      pendingItem: null,
      pendingAttack: null,
      endTurnArmed: false,
      // 换到其他单位即接受当前移动
      undoableMove: undo && undo.unitId === next.id ? undo : null,
      notice: null,
    });
    return next;
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
      this.state.fxBusy ||
      UNIT_TYPES[unit.type].attack <= 0
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

  /** 后勤可补充的友军格子 */
  resupplyTargets(): Set<number> {
    const battle = this.state.battle;
    const unit = this.selectedUnit;
    const tiles = new Set<number>();
    if (
      !battle ||
      !unit ||
      unit.faction !== "player" ||
      unit.hasActed ||
      unit.type !== "logistics" ||
      this.state.fxBusy
    ) {
      return tiles;
    }
    for (const ally of gridResupplyTargets(battle, unit)) {
      tiles.add(ally.y * battle.width + ally.x);
    }
    return tiles;
  }

  /** 邻接但暂无需补给的友军（淡提示） */
  resupplyIdleTiles(): Set<number> {
    const battle = this.state.battle;
    const unit = this.selectedUnit;
    const tiles = new Set<number>();
    if (
      !battle ||
      !unit ||
      unit.faction !== "player" ||
      unit.hasActed ||
      unit.type !== "logistics" ||
      this.state.fxBusy
    ) {
      return tiles;
    }
    const ready = this.resupplyTargets();
    for (const ally of gridAdjacentFriendly(battle, unit)) {
      const key = ally.y * battle.width + ally.x;
      if (!ready.has(key)) tiles.add(key);
    }
    return tiles;
  }

  /** 当前后勤可一键补充的友军列表 */
  resupplyAllies(): Unit[] {
    const battle = this.state.battle;
    const unit = this.selectedUnit;
    if (
      !battle ||
      !unit ||
      unit.faction !== "player" ||
      unit.hasActed ||
      unit.type !== "logistics" ||
      this.state.fxBusy
    ) {
      return [];
    }
    return gridResupplyTargets(battle, unit);
  }

  resupplyAlly(targetId: string): void {
    const unit = this.selectedUnit;
    if (!unit || unit.type !== "logistics" || unit.hasActed) return;
    this.dispatch({ kind: "resupply", unitId: unit.id, targetId });
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
        this.update({
          pendingAttack: { attackerId: unit.id, defenderId: occupant.id },
          inspectedTile: { ...pos },
          endTurnArmed: false,
          notice: null,
        });
        return;
      }
      if (
        unit.type === "logistics" &&
        occupant?.faction === "player" &&
        occupant.id !== unit.id
      ) {
        if (this.resupplyTargets().has(pos.y * battle.width + pos.x)) {
          this.dispatch({ kind: "resupply", unitId: unit.id, targetId: occupant.id });
          return;
        }
        if (manhattan(unit, occupant) === 1) {
          this.update({
            inspectedTile: { ...pos },
            notice: `${occupant.name} 暂无需补给（生命与疲劳已满）`,
            endTurnArmed: false,
          });
          return;
        }
      }
      if (!occupant && this.moveTiles().has(pos.y * battle.width + pos.x)) {
        this.dispatch({ kind: "move", unitId: unit.id, to: { x: pos.x, y: pos.y } });
        return;
      }
    }

    if (occupant) {
      this.selectUnit(occupant.id);
      return;
    }

    // 点空地：取消选中并关闭撤销窗口（移动结果保留）
    this.update({
      selectedUnitId: null,
      pendingItem: null,
      pendingAttack: null,
      endTurnArmed: false,
      undoableMove: null,
      inspectedTile: { x: pos.x, y: pos.y },
      highlightObjectiveId: null,
      detailExpanded: false,
      lastStrike: null,
    });
  }

  dispatch(action: Action): void {
    const battle = this.state.battle;
    if (!battle || battle.status !== "playing" || this.state.fxBusy) return;

    const prev = battle;
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
    const timeline = buildTimeline(prev, result.events);
    this.pendingRoutNotice = combatNotice(next, result.events);

    let undoableMove = this.state.undoableMove;
    if (action.kind === "move") {
      const movedUnit = next.units.find((u) => u.id === action.unitId);
      // 撤离落地等已锁定行动：不可再撤
      if (movedUnit && !movedUnit.hasActed && movedUnit.alive) {
        if (!undoableMove || undoableMove.unitId !== action.unitId) {
          undoableMove = {
            unitId: action.unitId,
            before: structuredClone(prev),
            actionsLength: this.state.actions.length,
          };
        }
        // 同一单位连续挪步：保留第一次移动前的快照
      } else {
        undoableMove = null;
      }
    } else {
      // 攻击 / 休整 / 占领 / 道具 / 结束回合：锁定移动
      undoableMove = null;
    }

    const stillSelected =
      selected && selected.alive && !selected.hasActed ? selected.id : null;
    const movedOnly =
      action.kind === "move" && stillSelected && undoableMove?.unitId === stillSelected;
    const movedUnit =
      action.kind === "move" ? next.units.find((u) => u.id === action.unitId) : undefined;
    const moveTip =
      movedUnit?.type === "logistics"
        ? "可点青绿友军或跟手「补充」按钮补给；「撤销」可退回移动"
        : "还可攻击，或点「休整」结束；「撤销」可退回移动";
    if (movedOnly) this.pendingRoutNotice = moveTip;

    this.update({
      battle: next,
      actions: [...this.state.actions, action],
      log: this.pushLog(entries, next.turn),
      lastStrike: strike,
      pendingItem: null,
      pendingAttack: null,
      endTurnArmed: false,
      undoableMove,
      notice:
        timeline.clips.length > 0
          ? null
          : movedOnly
            ? moveTip
            : this.pendingRoutNotice,
      selectedUnitId: stillSelected,
      fxBusy: timeline.clips.length > 0,
    });
    if (timeline.clips.length === 0) this.pendingRoutNotice = null;

    if (next.status !== "playing") {
      this.pendingConclude = next;
    }

    if (timeline.clips.length > 0) {
      this.presentation.enqueueTimeline(timeline);
    } else if (this.pendingConclude) {
      const finalState = this.pendingConclude;
      this.pendingConclude = null;
      this.concludeMission(finalState);
    }
  }

  endTurn(): void {
    const pending = this.unactedPlayerUnits();
    if (pending.length > 0 && !this.state.endTurnArmed) {
      this.update({
        endTurnArmed: true,
        pendingAttack: null,
        notice: `还有 ${pending.length} 支部队未行动。再点一次确认结束，或定位下一支部队。`,
      });
      return;
    }
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
      pendingAttack: null,
      endTurnArmed: false,
      fxBusy: false,
    });
  }

  proceed(): void {
    this.update({
      screen: this.state.campaign.status === "complete" ? "chapterEnd" : "brief",
      battle: null,
      mission: null,
      pendingAttack: null,
      endTurnArmed: false,
      briefTab: "staff",
      personnelTransfer: { sourceId: null, targetId: null, amount: 0 },
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
  // 首关引导：点选单位 → 蓝格移动 → 红格攻击（可撤销移动）
  if (mission.id === "m1-onjong") {
    parts.push("操作：点选部队 → 蓝格移动 → 红格攻击；移动后可用「撤销移动」");
  }
  if ((mission.supplyPoints?.length ?? 0) > 0) {
    parts.push("地图补给点可恢复弹药；后勤邻接友军亦可短暂补弹");
  }
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
      return unit && unit.faction === "player" ? `${unit.name} 提升至战斗 Lv.${e.to}` : null;
    })
    .filter((text): text is string => Boolean(text));
  if (promotions.length > 0) parts.push(promotions.join("、"));

  return parts.length > 0 ? parts.join(" · ") : null;
}
