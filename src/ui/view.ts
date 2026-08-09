import { ITEMS, ITEM_IDS } from "../content/items";
import { BALANCE } from "../content/balance";
import { CHAPTER_ONE } from "../content/chapter";
import { TERRAIN } from "../content/terrain";
import { PROGRESS, levelFromExp } from "../content/progress";
import { UNIT_TYPES } from "../content/units";
import { WEAPONS, WEAPON_HISTORY } from "../content/weapons";
import { equippableWeapons } from "../core/campaign";
import { effectiveStats } from "../core/commander";
import { attackRange, livingUnits, unitAt } from "../core/grid";
import { isEvacTile, movementBudget, type RosterUnit } from "../core/mission";
import type { GameState, ItemId, Unit, WeaponId, Weather } from "../core/types";
import {
  COMMANDER_PORTRAIT,
  ITEM_ICON,
  TERRAIN_ICON,
  UI_ICON,
  WEAPON_ICON,
  unitIdentityPortrait,
  unitPortrait,
} from "./assets";
import { Board, terrainName } from "./board";
import { breakdownFactors } from "./format";
import { briefVictoryLines, objectiveLines } from "./objectives";
import type { Session, SessionState } from "./session";
import { downloadReplay, loadReplays } from "./storage";

function itemEffectLabel(item: ItemId): string {
  const def = ITEMS[item];
  if (def.heal > 0) return `+${def.heal}HP`;
  if (def.fatigueRelief) return `疲劳-${def.fatigueRelief}`;
  if (def.expGain) return `+${def.expGain}经验`;
  if (def.damage > 0) return def.splash ? `${def.damage}溅射` : `${def.damage}伤`;
  return def.name;
}

function meter(label: string, value: number, max = 100): string {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return `<div class="meter" title="${esc(label)} ${value}"><span class="meter__lab">${esc(label)}</span><i style="width:${pct}%"></i><em>${value}</em></div>`;
}

/** 与内容表同源，不能静默吞掉第七种物资。 */
export const ITEM_SLOT_COUNT = ITEM_IDS.length;

export function renderItemSlots(
  items: { id: ItemId; count: number }[],
  pending: ItemId | null,
  locked: boolean,
): string {
  const cells: string[] = [];
  for (let i = 0; i < ITEM_SLOT_COUNT; i += 1) {
    const entry = items[i];
    if (!entry) {
      cells.push(`<span class="slot slot--empty" aria-hidden="true"></span>`);
      continue;
    }
    const def = ITEMS[entry.id];
    const active = pending === entry.id ? " is-active" : "";
    cells.push(
      `<button type="button" class="slot${active}" data-action="use-item" data-value="${entry.id}" title="${esc(def.name)}：${esc(def.description)}" aria-label="${esc(`${def.name}，${entry.count}个，${itemEffectLabel(entry.id)}`)}" ${locked ? "disabled" : ""}>` +
        `<img class="slot__ico" src="${ITEM_ICON[entry.id]}" alt="" draggable="false" />` +
        `<span class="slot__count">${entry.count}</span>` +
        `<span class="slot__effect">${esc(def.name)}</span>` +
        `</button>`,
    );
  }
  return cells.join("");
}

interface StatCell {
  label: string;
  value: string;
  hint: string;
}

/** 卡片上只显示能直接决策的派生数值，原始五维收进「详」 */
function combatSummary(battle: GameState, unit: Unit): StatCell[] {
  const def = UNIT_TYPES[unit.type];
  const weapon = WEAPONS[unit.weapon];
  const stats = effectiveStats(unit, battle.inventory);
  const range = attackRange(battle, unit);
  const terrain = TERRAIN[battle.tiles[unit.y * battle.width + unit.x]!];

  const primary = def.indirect ? stats.intellect : stats.might;
  // 武器进攻已并入 effectiveStats；统率常驻微幅与战斗公式一致
  const attack = Math.round(
    def.attack *
      (1 + (primary - 40) * 0.005) *
      (1 + Math.max(0, stats.leadership - 40) * 0.001) *
      (1 + (unit.level - 1) * PROGRESS.attackPerLevel),
  );
  const defence = Math.round(
    (terrain.defense + weapon.defenseBonus + (unit.level - 1) * PROGRESS.defensePerLevel) * 100,
  );

  return [
    { label: "基础火力", value: String(attack), hint: `兵种底火 ${def.attack} × 将领与武器加成；对具体目标请看攻击预测` },
    {
      label: "防御",
      value: `${defence >= 0 ? "+" : ""}${defence}%`,
      hint: `${terrain.name}地形 ${Math.round(terrain.defense * 100)}% + 武器与资历`,
    },
    { label: "射程", value: `${range.min}–${range.max}`, hint: "含地形与武器修正" },
    {
      label: "移动",
      value: `${unit.mpLeft}/${movementBudget(unit, battle.weather)}`,
      hint: "剩余移动力 / 本回合上限（受疲劳与天气影响）",
    },
  ];
}

const SKELETON = `
  <div class="battle" data-region="battle">
    <div class="stage" data-region="stage">
      <header class="hud-top" data-region="hud-top"></header>
      <div class="stage__map" data-region="map">
        <canvas data-region="canvas" tabindex="0" aria-label="战场棋盘；获得焦点后可用方向键平移"></canvas>
        <aside class="hud-sheet" data-region="panel" aria-live="polite" hidden></aside>
        <div class="action-dock" data-region="action-dock" hidden></div>
        <aside class="battle-intel" data-region="intel" aria-label="交战情报"></aside>
        <div class="notice" data-region="notice" role="status" aria-live="polite" hidden></div>
      </div>
    </div>
  </div>
  <div class="overlay" data-region="overlay" role="dialog" aria-modal="true" hidden></div>
`;

function ico(src: string, cls = "ico"): string {
  return `<img class="${cls}" src="${src}" alt="" draggable="false" />`;
}

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&quot;",
  );
}

function defenseText(value: number): string {
  if (value === 0) return "无";
  const pct = Math.round(value * 100);
  return pct > 0 ? `防御 +${pct}%` : `防御 ${pct}%`;
}

function weatherPresentation(weather: Weather): { label: string; icon: string } {
  switch (weather) {
    case "rain": return { label: "雨", icon: UI_ICON.weatherRain };
    case "snow": return { label: "雪", icon: UI_ICON.weatherSnow };
    case "fog": return { label: "雾", icon: UI_ICON.weatherFog };
    case "overcast": return { label: "阴", icon: UI_ICON.weatherOvercast };
    default: return { label: "晴", icon: UI_ICON.weatherClear };
  }
}

export class View {
  private readonly root: HTMLElement;
  private readonly session: Session;
  private readonly board: Board;
  private readonly regions: Record<string, HTMLElement>;
  private overlayScreen: SessionState["screen"] | null = null;
  constructor(root: HTMLElement, session: Session) {
    this.root = root;
    this.session = session;
    root.innerHTML = SKELETON;

    this.regions = {};
    for (const node of root.querySelectorAll<HTMLElement>("[data-region]")) {
      this.regions[node.dataset.region as string] = node;
    }

    this.board = new Board(this.regions.canvas as HTMLCanvasElement);
    this.board.setTapHandler((tile) => this.session.clickTile(tile));
    this.bindEvents();
    this.bindArmory();
    window.addEventListener("resize", () => this.render(this.session.current));
    // 战斗快捷键只在战场页生效；不拦截表单控件。
    window.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) return;
      if (this.session.current.screen !== "battle") return;
      if (event.code === "Space" && this.session.current.fxBusy) {
        event.preventDefault();
        this.session.skipFx();
      } else if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        this.focusNextUnit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (this.session.current.pendingAttack) this.session.cancelAttack();
        else this.session.clearFocus();
      }
    });
  }

  private bindEvents(): void {
    this.root.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      const value = target.dataset.value;

      switch (action) {
        case "new-campaign":
          this.session.newCampaign();
          break;
        case "continue":
          this.session.continueCampaign();
          break;
        case "begin-mission":
          this.session.beginMission();
          break;
        case "end-turn":
          this.session.endTurn();
          break;
        case "next-unit":
          this.focusNextUnit();
          break;
        case "confirm-attack":
          this.session.confirmAttack();
          break;
        case "cancel-attack":
          this.session.cancelAttack();
          break;
        case "proceed":
          this.session.proceed();
          break;
        case "select-unit":
          this.session.selectUnit(value ?? null);
          queueMicrotask(() => {
            const unit = this.session.selectedUnit;
            if (!unit) return;
            this.board.focusTile(unit.x, unit.y);
            this.renderBoard();
          });
          break;
        case "clear-focus":
          this.session.clearFocus();
          break;
        case "unit-wait":
          if (value) this.session.dispatch({ kind: "wait", unitId: value });
          break;
        case "unit-undo-move":
          this.session.undoMove();
          break;
        case "unit-capture":
          if (value) this.session.dispatch({ kind: "capture", unitId: value });
          break;
        case "unit-resupply":
          if (value) this.session.resupplyAlly(value);
          break;
        case "use-item":
          this.handleItem(value as ItemId);
          break;
        case "toggle-detail":
          this.session.toggleDetail();
          break;
        case "focus-objective":
          if (value) {
            this.session.focusObjective(value);
            queueMicrotask(() => {
              const tile = this.session.current.inspectedTile;
              if (tile) {
                this.board.focusTile(tile.x, tile.y);
                this.renderBoard();
              }
            });
          }
          break;
        case "cycle-fx-speed":
          this.session.cycleFxSpeed();
          break;
        case "skip-fx":
          this.session.skipFx();
          break;
        case "download-replay":
          this.downloadLatestReplay();
          break;
        case "toggle-deploy":
          if (value) this.session.toggleDeploy(value);
          break;
        case "loadout-adj": {
          const rosterId = target.dataset.roster;
          const item = target.dataset.item as ItemId | undefined;
          const delta = Number(target.dataset.delta ?? "0");
          if (rosterId && item && delta) this.session.adjustLoadout(rosterId, item, delta);
          break;
        }
        default:
          break;
      }
    });
  }

  private focusNextUnit(): void {
    const unit = this.session.selectNextUnit();
    if (!unit) return;
    queueMicrotask(() => {
      this.board.focusTile(unit.x, unit.y);
      this.renderBoard();
    });
  }

  private bindArmory(): void {
    this.root.addEventListener("change", (event) => {
      const select = (event.target as HTMLElement).closest<HTMLSelectElement>(
        'select[data-action="equip-weapon"]',
      );
      if (!select) return;
      const unitId = select.dataset.value;
      if (!unitId) return;
      this.session.equipWeapon(unitId, select.value as WeaponId);
    });
  }

  private handleItem(item: ItemId): void {
    const unit = this.session.selectedUnit;
    if (!unit) return;
    if (ITEMS[item].targeting === "self") {
      this.session.dispatch({ kind: "useItem", unitId: unit.id, item });
      return;
    }
    this.session.toggleItem(item);
  }

  private downloadLatestReplay(): void {
    const [latest] = loadReplays();
    if (latest) downloadReplay(latest);
  }

  render(state: SessionState): void {
    const battleVisible = state.screen === "battle" && state.battle !== null;
    this.regions.battle!.hidden = !battleVisible;

    if (battleVisible && state.battle) {
      this.renderHudTop(state, state.battle);
      this.renderSheet(state, state.battle);
      this.renderActionDock(state, state.battle);
      this.renderIntel(state, state.battle);
      this.renderNotice(state);
      const endBtn = this.root.querySelector<HTMLButtonElement>('[data-action="end-turn"]');
      if (endBtn) endBtn.disabled = state.fxBusy;
      this.paintBoard(state, state.battle);
      this.positionActionDock(state, state.battle);
    } else {
      const dock = this.regions["action-dock"];
      if (dock) {
        dock.hidden = true;
        dock.innerHTML = "";
      }
    }

    this.renderOverlay(state);
  }

  /** 动画帧只重绘棋盘 */
  renderBoard(): void {
    const state = this.session.current;
    if (state.screen !== "battle" || !state.battle) return;
    this.paintBoard(state, state.battle);
    this.positionActionDock(state, state.battle);
  }

  private paintBoard(state: SessionState, battle: GameState): void {
    const missionKey = state.mission?.id ?? `${battle.width}x${battle.height}-${battle.turn}`;
    this.board.render(
      battle,
      {
        selectedUnitId: state.selectedUnitId,
        moveTiles: this.session.moveTiles(),
        attackTiles: this.session.attackTiles(),
        attackTargets: this.session.attackTargets(),
        resupplyTiles: this.session.resupplyTargets(),
        resupplyIdleTiles: this.session.resupplyIdleTiles(),
        itemTiles: this.session.itemTiles(),
        inspected: state.inspectedTile,
        highlightObjectiveId: state.highlightObjectiveId,
        visual: this.session.presentation.visual,
        objectiveDone: (o) => o.owner === "player",
      },
      missionKey,
    );
  }

  private renderNotice(state: SessionState): void {
    const notice = this.regions.notice!;
    notice.hidden = !state.notice;
    notice.textContent = state.notice ?? "";
  }

  private renderIntel(state: SessionState, battle: GameState): void {
    const intel = this.regions.intel!;
    const strike = state.lastStrike;
    const attacker = strike ? battle.units.find((unit) => unit.id === strike.attackerId) : null;
    const defender = strike ? battle.units.find((unit) => unit.id === strike.defenderId) : null;
    const factors = strike ? breakdownFactors(strike.breakdown).slice(0, 8) : [];
    const recent = state.log.slice(-5);
    intel.hidden = recent.length === 0 && !strike;
    intel.innerHTML = `
      ${strike ? `<section class="intel__strike" aria-label="最近一次交火">
        <strong>${esc(attacker?.name ?? "攻方")} → ${esc(defender?.name ?? "守方")}</strong>
        <span>伤害 ${strike.damage}${strike.counterDamage > 0 ? ` · 反击 ${strike.counterDamage}` : " · 未受反击"}</span>
        ${factors.length > 0 ? `<ul class="factors">${factors.map((factor) =>
          `<li class="${factor.favourable ? "is-up" : "is-down"}"><span>${esc(factor.label)}</span><strong>×${factor.value.toFixed(2)}</strong></li>`,
        ).join("")}</ul>` : ""}
      </section>` : `<strong class="intel__title">战场记录</strong>`}
      <ol class="log" role="log" aria-live="polite">
        ${recent.map((entry) => `<li class="log__item log__item--${entry.tone}"><span class="log__turn">T${entry.turn}</span>${esc(entry.text)}</li>`).join("")}
      </ol>
    `;
  }

  private renderHudTop(state: SessionState, battle: GameState): void {
    const lines = objectiveLines(battle, state.mission);
    const goals = lines
      .map((line) => {
        const active = state.highlightObjectiveId === line.id ? " is-active" : "";
        const objectiveLabel = `${line.name}：${line.detail}`;
        const content = `${ico(line.done ? UI_ICON.objDone : UI_ICON.objPending, "ico ico--xs")}<span>${esc(line.name)}<small>${esc(line.detail)}</small></span>`;
        return line.locatable
          ? `<button type="button" class="hud-top__obj${line.done ? " is-done" : ""}${active}" data-action="focus-objective" data-value="${esc(line.id)}" title="${esc(objectiveLabel)}" aria-label="${esc(objectiveLabel)}">${content}</button>`
          : `<span class="hud-top__obj hud-top__obj--status${line.done ? " is-done" : ""}" title="${esc(objectiveLabel)}" aria-label="${esc(objectiveLabel)}">${content}</span>`;
      })
      .join("");
    const weather = weatherPresentation(battle.weather);
    const unacted = this.session.unactedPlayerUnits().length;
    const endLabel = state.endTurnArmed
      ? "确认结束"
      : unacted > 0
        ? `结束回合 · ${unacted}未动`
        : "结束回合";
    this.regions["hud-top"]!.innerHTML = `
      <div class="hud-top__left">
        <strong class="hud-top__name">${esc(state.mission?.name ?? "")}</strong>
        <div class="hud-top__goals">${goals}</div>
      </div>
      <div class="hud-top__meta">
        <span class="hud-top__turn" title="当前回合 / 最大回合">T<strong>${battle.turn}</strong>/${battle.maxTurns}</span>
        <span class="hud-top__pill" title="${esc(state.mission?.weather?.detail ?? "")}" aria-label="天气：${esc(weather.label)}">${ico(weather.icon, "ico ico--xs ico--badge")}<span class="hud-top__label">${weather.label}</span></span>
        <span class="hud-top__pill" title="我方存活部队" aria-label="我方存活部队：${livingUnits(battle, "player").length}">${ico(UI_ICON.factionPva, "ico ico--xs ico--badge")}<span class="hud-top__label">${livingUnits(battle, "player").length}</span></span>
        <span class="hud-top__pill" title="敌方存活部队" aria-label="敌方存活部队：${livingUnits(battle, "enemy").length}">${ico(UI_ICON.factionUn, "ico ico--xs ico--badge")}<span class="hud-top__label">${livingUnits(battle, "enemy").length}</span></span>
        <button type="button" class="hud-top__pill hud-top__speed" data-action="cycle-fx-speed" title="交战动画倍速" aria-label="交战动画倍速">${state.fxSpeed}×</button>
        ${state.fxBusy ? `<button type="button" class="hud-top__pill hud-top__skip" data-action="skip-fx" title="跳过动画" aria-label="跳过动画"><span class="hud-top__skip-label">跳过</span><span class="hud-top__skip-icon" aria-hidden="true">»</span></button>` : ""}
      </div>
      <div class="hud-top__actions">
        ${unacted > 0 ? `<button class="btn hud-top__next" data-action="next-unit" title="定位下一支未行动部队（N）" aria-label="定位下一支未行动部队">${ico(UI_ICON.keyUnit, "ico ico--btn")}<span class="hud-top__action-label">下一支</span></button>` : ""}
        <button class="btn btn--primary hud-top__end" data-action="end-turn" title="${esc(endLabel)}" aria-label="${esc(endLabel)}">
          ${ico(UI_ICON.actEndTurn, "ico ico--btn")}<span class="hud-top__action-label">${esc(endLabel)}</span>
        </button>
      </div>
    `;
  }

  private renderSheet(state: SessionState, battle: GameState): void {
    const unit = this.session.selectedUnit;
    const hasFocus = Boolean(unit || state.inspectedTile);
    const panel = this.regions.panel!;

    if (!hasFocus) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }

    const body = unit
      ? this.unitCard(state, battle, unit)
      : this.inspectCard(battle, state.inspectedTile!.x, state.inspectedTile!.y);

    panel.hidden = false;
    panel.innerHTML = `
      <div class="hud-sheet__head">
        <div class="hud-sheet__body">${body}</div>
        <button class="hud-sheet__close" data-action="clear-focus" type="button" aria-label="关闭">×</button>
      </div>
    `;
  }

  private inspectCard(battle: GameState, x: number, y: number): string {
    const terrainId = battle.tiles[y * battle.width + x]!;
    const terrain = TERRAIN[terrainId];
    const occupant = unitAt(battle, x, y);
    const objective = battle.objectives.find((o) => o.x === x && o.y === y);
    const fieldItem = battle.fieldItems.find((i) => i.x === x && i.y === y);
    const evac = isEvacTile(battle, x, y);

    const title = occupant
      ? occupant.name
      : objective
        ? objective.name
        : evac
          ? "撤离带"
          : terrain.name;

    const titleIcon = occupant
      ? unitPortrait(occupant)
      : objective
        ? objective.owner === "player"
          ? UI_ICON.objDone
          : UI_ICON.objPending
        : evac
          ? UI_ICON.evac
          : TERRAIN_ICON[terrainId];

    const extras = [
      fieldItem ? `补给${ITEMS[fieldItem.item].name}` : "",
      objective
        ? objective.owner === "player"
          ? "己方控制"
          : objective.owner === "enemy"
            ? "敌方控制"
            : "中立"
        : "",
    ]
      .filter(Boolean)
      .map((t) => ` · ${t}`)
      .join("");

    const regen = terrain.regen > 0 ? ` · 回血+${terrain.regen}/回合` : "";
    const blocked = terrain.passable ? "" : " · 不可通行";
    return `<section class="card card--compact">
      <header class="card__head"><h2 class="card__title">${ico(titleIcon, "ico ico--sm")}${esc(title)}</h2></header>
      <p class="card__sub">${ico(TERRAIN_ICON[terrainId], "ico ico--xs")}${esc(terrain.name)} · 移 ${terrain.passable ? terrain.moveCost : "—"}${terrain.defense ? ` · ${esc(defenseText(terrain.defense))}` : ""}${regen}${blocked}${occupant ? ` · ${esc(UNIT_TYPES[occupant.type].name)} ${occupant.hp}/${occupant.maxHp}` : " · 无人"}${evac ? " · 撤离带" : ""}${extras}</p>
    </section>`;
  }

  private unitCard(state: SessionState, battle: GameState, unit: Unit): string {
    const def = UNIT_TYPES[unit.type];
    const weapon = WEAPONS[unit.weapon];
    const range = attackRange(battle, unit);
    const isMine = unit.faction === "player";
    const items = this.session.availableItems();
    const locked = state.fxBusy;
    const hpPct = Math.max(0, Math.min(100, Math.round((unit.hp / unit.maxHp) * 100)));
    const level = levelFromExp(unit.exp);
    const floor = PROGRESS.expForLevel(level);
    const next = level >= PROGRESS.maxLevel ? floor : PROGRESS.expForLevel(level + 1);
    const xpPct =
      next <= floor ? 100 : Math.max(0, Math.min(100, Math.round(((unit.exp - floor) / (next - floor)) * 100)));
    const portrait = unitPortrait(unit);
    const kind =
      unit.commanderKind === "story" ? "剧情" : unit.commanderKind === "companion" ? "伴随" : "敌军";
    const duty = unit.duty ?? (unit.keyUnit ? CHAPTER_ONE.protagonist.title : `${kind}作战分队`);
    const preview = this.session.attackPreview();
    const previewForUnit = preview?.attackerId === unit.id ? preview : null;
    const previewTarget = previewForUnit
      ? battle.units.find((candidate) => candidate.id === previewForUnit.defenderId)
      : null;

    const combat = combatSummary(battle, unit);
    const slots = !isMine
      ? ""
      : `<div class="slots" role="group" aria-label="随行物资">
          ${renderItemSlots(items, state.pendingItem, locked || unit.hasActed)}
        </div>`;

    const attackPreview = previewForUnit && previewTarget
      ? `<section class="attack-preview" aria-label="攻击预测">
          <div class="attack-preview__head"><strong>攻击预测 · ${esc(previewTarget.name)}</strong><span>${previewForUnit.rout === "certain" ? "确定击溃" : previewForUnit.rout === "possible" ? "可能击溃" : "无法击溃"}</span></div>
          <div class="attack-preview__numbers">
            <span>预计伤害 <b>${previewForUnit.damage.min}–${previewForUnit.damage.max}</b><small>中值 ${previewForUnit.damage.expected}</small></span>
            <span>目标剩余 <b>${previewForUnit.defenderHpAfter.min}–${previewForUnit.defenderHpAfter.max}</b><small>当前 ${previewTarget.hp}</small></span>
            <span>预计反击 <b>${previewForUnit.counter ? `${previewForUnit.counter.min}–${previewForUnit.counter.max}` : "无"}</b><small>${previewForUnit.counterConditional ? "若未被击溃" : previewForUnit.counter ? "射程可及" : "无法反击"}</small></span>
          </div>
          <ul class="factors">${breakdownFactors(previewForUnit.breakdown).slice(0, 8).map((factor) =>
            `<li class="${factor.favourable ? "is-up" : "is-down"}"><span>${esc(factor.label)}</span><strong>×${factor.value.toFixed(2)}</strong></li>`,
          ).join("")}</ul>
        </section>`
      : "";

    const detail = state.detailExpanded
      ? `<div class="card__help">
          <p>${esc(def.role)}</p>
          <p>武器 ${esc(weapon.name)} · 射程 ${range.min}–${range.max} · 地形 ${esc(terrainName(battle, unit.x, unit.y))}</p>
          <div class="card__stats">
            ${meter("统率", unit.stats.leadership)}
            ${meter("智力", unit.stats.intellect)}
            ${meter("武力", unit.stats.might)}
            ${meter("耐力", unit.stats.stamina)}
            ${meter("机敏", unit.stats.agility)}
          </div>
          <p class="card__note">统率提夹击，智力提曲射与道具，武力提直射，耐力撑生命，机敏加机动。</p>
          ${state.pendingItem ? `<p class="card__tip">${esc(ITEMS[state.pendingItem].name)}：${esc(ITEMS[state.pendingItem].description)}</p>` : ""}
        </div>`
      : "";

    return `<section class="card card--unit">
      <div class="card__row">
        <img class="card__avatar" src="${portrait}" alt="" />
        <div class="card__id">
          <div class="card__name">${esc(unit.name)}${unit.keyUnit ? " ★" : ""}</div>
          <div class="card__meta"><span>${esc(duty)}</span><span>战斗 Lv.${unit.level}</span><span>${esc(def.name)}</span><span>${esc(kind)}</span></div>
        </div>
        <button class="card__more" data-action="toggle-detail" type="button" title="详细说明">${state.detailExpanded ? "收起" : "详"}</button>
      </div>
      <div class="card__bars">
        <div class="bar bar--hp" title="生命 ${unit.hp}/${unit.maxHp}"><i style="width:${hpPct}%"></i><span>${unit.hp}/${unit.maxHp}</span></div>
        <div class="bar bar--xp" title="经验 ${Math.round(unit.exp)} → Lv.${Math.min(PROGRESS.maxLevel, level + 1)}"><i style="width:${xpPct}%"></i><span>EXP</span></div>
        <div class="bar bar--fatigue" title="疲劳 ${unit.fatigue}/100"><i style="width:${Math.max(0, Math.min(100, unit.fatigue))}%"></i><span>疲劳 ${unit.fatigue}</span></div>
      </div>
      <div class="card__combat">
        ${combat.map((cell) => `<div class="stat" title="${esc(cell.hint)}"><span>${esc(cell.label)}</span><b>${esc(cell.value)}</b></div>`).join("")}
      </div>
      <div class="card__gear" title="${esc(`${unit.equipment} · 机械型号 ${weapon.name} · ${WEAPON_HISTORY[unit.weapon].caliber}`)}">${ico(WEAPON_ICON[unit.weapon], "ico ico--weapon")}<span>${esc(unit.equipment)}</span><span class="card__range">${range.min}–${range.max}格</span></div>
      ${unit.keyUnit ? `<p class="card__state">主力护卫：承受伤害 ×${BALANCE.keyUnitDamageTaken.toFixed(2)}；重伤将立即失败</p>` : ""}
      ${def.setupBonus > 0 ? `<p class="card__state">${unit.movedThisTurn ? "机枪已移动：本回合无架设加成" : `机枪已架设：伤害 +${Math.round(def.setupBonus * 100)}%`}</p>` : ""}
      ${unit.type === "logistics" && isMine && !unit.hasActed ? `<p class="card__state">后勤：靠近伤员后点跟手「补充」，或点棋盘上的青绿友军</p>` : ""}
      ${isMine && unit.hasActed ? `<p class="card__dim">本回合已行动</p>` : ""}
      ${slots}
      ${attackPreview}
      ${detail}
    </section>`;
  }

  /** 跟手操作条：贴近单位/目的地，只放当前必操作 */
  private renderActionDock(state: SessionState, battle: GameState): void {
    const dock = this.regions["action-dock"]!;
    const unit = this.session.selectedUnit;
    if (!unit || unit.faction !== "player") {
      dock.hidden = true;
      dock.innerHTML = "";
      return;
    }

    const locked = state.fxBusy;
    const preview = this.session.attackPreview();
    const previewForUnit = preview?.attackerId === unit.id ? preview : null;
    const previewTarget = previewForUnit
      ? battle.units.find((candidate) => candidate.id === previewForUnit.defenderId)
      : null;

    if (previewForUnit && previewTarget) {
      dock.hidden = false;
      dock.innerHTML = `
        <div class="action-dock__label">攻击 · ${esc(previewTarget.name)}</div>
        <div class="action-dock__row">
          <button class="btn btn--primary" data-action="confirm-attack" ${locked ? "disabled" : ""}>确认攻击</button>
          <button class="btn" data-action="cancel-attack" ${locked ? "disabled" : ""}>取消</button>
        </div>`;
      return;
    }

    if (unit.hasActed) {
      dock.hidden = true;
      dock.innerHTML = "";
      return;
    }

    const canCapture =
      UNIT_TYPES[unit.type].canCapture &&
      battle.objectives.some(
        (o) => o.kind === "capture" && o.owner !== "player" && o.x === unit.x && o.y === unit.y,
      );
    const canUndo = this.session.canUndoMove();
    const resupplyAllies = unit.type === "logistics" ? this.session.resupplyAllies() : [];

    const buttons: string[] = [];
    for (const ally of resupplyAllies) {
      buttons.push(
        `<button class="btn btn--primary" data-action="unit-resupply" data-value="${esc(ally.id)}" ${locked ? "disabled" : ""} title="回复生命、降低疲劳，并恢复弹药">补充 ${esc(ally.name)}</button>`,
      );
    }
    if (canCapture) {
      buttons.push(
        `<button class="btn btn--primary" data-action="unit-capture" data-value="${unit.id}" ${locked ? "disabled" : ""}>${ico(UI_ICON.actCapture, "ico ico--btn")}占领</button>`,
      );
    }
    if (canUndo) {
      buttons.push(
        `<button class="btn" data-action="unit-undo-move" ${locked ? "disabled" : ""} title="仅可撤销本次移动">撤销</button>`,
      );
    }
    buttons.push(
      `<button class="btn" data-action="unit-wait" data-value="${unit.id}" ${locked ? "disabled" : ""} title="结束本单位行动并降低疲劳">休整</button>`,
    );

    const hint =
      unit.type === "logistics" && resupplyAllies.length === 0
        ? `<div class="action-dock__hint">靠近伤员或疲劳友军后可补充</div>`
        : "";

    dock.hidden = false;
    dock.innerHTML = `
      <div class="action-dock__label">${esc(unit.name)}</div>
      ${hint}
      <div class="action-dock__row">${buttons.join("")}</div>`;
  }

  private positionActionDock(state: SessionState, battle: GameState): void {
    const dock = this.regions["action-dock"];
    const map = this.regions.map;
    if (!dock || !map || dock.hidden) return;

    const unit = this.session.selectedUnit;
    const preview = this.session.attackPreview();
    let anchorX = unit?.x ?? state.inspectedTile?.x;
    let anchorY = unit?.y ?? state.inspectedTile?.y;
    if (preview && unit && preview.attackerId === unit.id) {
      const defender = battle.units.find((u) => u.id === preview.defenderId);
      if (defender) {
        anchorX = defender.x;
        anchorY = defender.y;
      }
    }
    if (anchorX === undefined || anchorY === undefined) return;

    const rect = this.board.tileCssRect(anchorX, anchorY);
    if (!rect) return;

    const pad = 8;
    const gap = 8;
    const dockW = Math.min(dock.offsetWidth || 220, map.clientWidth - pad * 2);
    const dockH = dock.offsetHeight || 72;
    const maxLeft = Math.max(pad, map.clientWidth - dockW - pad);
    const maxTop = Math.max(pad, map.clientHeight - dockH - pad);

    // 候选：下/上/右/左及斜角，优先躲开可走/可攻等蓝色高亮
    const raw: Array<{ left: number; top: number }> = [
      { left: rect.left + rect.width / 2 - dockW / 2, top: rect.top + rect.height + gap },
      { left: rect.left + rect.width / 2 - dockW / 2, top: rect.top - dockH - gap },
      { left: rect.left + rect.width + gap, top: rect.top + rect.height / 2 - dockH / 2 },
      { left: rect.left - dockW - gap, top: rect.top + rect.height / 2 - dockH / 2 },
      { left: rect.left + rect.width + gap, top: rect.top + rect.height + gap },
      { left: rect.left - dockW - gap, top: rect.top + rect.height + gap },
      { left: rect.left + rect.width + gap, top: rect.top - dockH - gap },
      { left: rect.left - dockW - gap, top: rect.top - dockH - gap },
    ];

    const moveTiles = this.session.moveTiles();
    const blocked = new Set<number>([
      ...moveTiles,
      ...this.session.attackTiles(),
      ...this.session.resupplyTargets(),
      ...this.session.itemTiles(),
    ]);
    // 选中格本身也不宜被操作条盖住，方便再点取消/切单位
    blocked.add(anchorY * battle.width + anchorX);

    const clamp = (left: number, top: number) => ({
      left: Math.max(pad, Math.min(left, maxLeft)),
      top: Math.max(pad, Math.min(top, maxTop)),
    });

    const overlapScore = (left: number, top: number): number => {
      let score = 0;
      for (const key of blocked) {
        const x = key % battle.width;
        const y = Math.floor(key / battle.width);
        const tile = this.board.tileCssRect(x, y);
        if (!tile) continue;
        const overlapX = Math.max(
          0,
          Math.min(left + dockW, tile.left + tile.width) - Math.max(left, tile.left),
        );
        const overlapY = Math.max(
          0,
          Math.min(top + dockH, tile.top + tile.height) - Math.max(top, tile.top),
        );
        if (overlapX > 0 && overlapY > 0) {
          // 可走格权重更高：宁可挡一点旁白区域，也不挡蓝色移动区
          const weight = moveTiles.has(key) ? 4 : 1;
          score += overlapX * overlapY * weight;
        }
      }
      // 轻微偏好更靠近锚点的方案
      const cx = left + dockW / 2;
      const cy = top + dockH / 2;
      const ax = rect.left + rect.width / 2;
      const ay = rect.top + rect.height / 2;
      score += Math.hypot(cx - ax, cy - ay) * 0.02;
      return score;
    };

    let best = clamp(raw[0]!.left, raw[0]!.top);
    let bestScore = overlapScore(best.left, best.top);
    for (const candidate of raw.slice(1)) {
      const next = clamp(candidate.left, candidate.top);
      const score = overlapScore(next.left, next.top);
      if (score < bestScore) {
        best = next;
        bestScore = score;
      }
    }

    dock.style.left = `${Math.round(best.left)}px`;
    dock.style.top = `${Math.round(best.top)}px`;
  }

  /** 花名册一行：出战勾选 + 武器对比 + 携行配额 */
  private armoryRow(state: SessionState, unit: RosterUnit, deployed: Set<string>): string {
    const options = equippableWeapons(state.campaign, unit.id);
    const current = WEAPONS[unit.weapon];
    const history = WEAPON_HISTORY[unit.weapon];
    const bonus = [
      current.stats.might ? `武+${current.stats.might}` : "",
      current.stats.intellect ? `智+${current.stats.intellect}` : "",
      current.stats.leadership ? `统+${current.stats.leadership}` : "",
      current.stats.stamina ? `耐+${current.stats.stamina}` : "",
      current.stats.agility ? `敏+${current.stats.agility}` : "",
      current.rangeBonus ? `射程+${current.rangeBonus}` : "",
      current.defenseBonus ? `减伤+${Math.round(current.defenseBonus * 100)}%` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const selected = deployed.has(unit.id);
    const loadout = state.campaign.pendingLoadout?.[unit.id] ?? {};
    const stock = state.campaign.inventory;
    const used = this.session.loadoutTotals();
    const itemControls = ITEM_IDS.filter((id) => (stock[id] ?? 0) > 0 || (loadout[id] ?? 0) > 0)
      .map((id) => {
        const count = loadout[id] ?? 0;
        const remain = Math.max(0, (stock[id] ?? 0) - (used[id] ?? 0));
        return `<div class="loadout__item">
          <span>${esc(ITEMS[id].name)} ×${count}</span>
          <button type="button" class="btn btn--tiny" data-action="loadout-adj" data-roster="${esc(unit.id)}" data-item="${id}" data-delta="-1" data-value="${esc(unit.id)}:${id}:-" ${count <= 0 ? "disabled" : ""}>−</button>
          <button type="button" class="btn btn--tiny" data-action="loadout-adj" data-roster="${esc(unit.id)}" data-item="${id}" data-delta="1" data-value="${esc(unit.id)}:${id}:+" ${remain <= 0 || !selected ? "disabled" : ""}>+</button>
        </div>`;
      })
      .join("");

    return `<li class="armory__row${selected ? " is-deployed" : ""}">
      <label class="armory__deploy">
        <input type="checkbox" data-action="toggle-deploy" data-value="${esc(unit.id)}" ${selected ? "checked" : ""} ${unit.keyUnit ? "disabled" : ""} />
        <span>${unit.keyUnit ? "主力" : selected ? "出战" : "待命"}</span>
      </label>
      ${ico(WEAPON_ICON[unit.weapon], "armory__weapon")}
      <div class="armory__who">
        <strong>${esc(unit.commanderName)}${unit.keyUnit ? " · 主角" : " · 真实人物"}</strong>
        <small>${esc(unit.duty ?? "直属作战分队")} · 战斗 Lv.${unit.level} · ${esc(UNIT_TYPES[unit.type].name)}</small>
        ${unit.bio ? `<small class="armory__bio">${esc(unit.bio)}</small>` : ""}
      </div>
      <div class="armory__pick">
        <select data-action="equip-weapon" data-value="${esc(unit.id)}" aria-label="${esc(unit.name)}的武器">
          ${options
            .map((id) => {
              const w = WEAPONS[id];
              const h = WEAPON_HISTORY[id];
              const mark = id === unit.weapon ? "✓ " : "";
              return `<option value="${id}"${id === unit.weapon ? " selected" : ""}>${mark}${esc(w.name)} · 评分${w.score} · 射程修正${w.rangeBonus >= 0 ? "+" : ""}${w.rangeBonus} · ${esc(h.caliber)}</option>`;
            })
            .join("")}
        </select>
        <small>${esc(`${history.origin} · ${history.caliber}`)} · 当前评分 ${current.score}</small>
        <small>${esc(bonus || "无额外加成")}${unit.manualWeapon ? " · 手动锁定" : ""}</small>
        <div class="loadout" title="从战役库存分配本关携行；不分配则默认整库带入">
          <strong>本关携行</strong>
          ${itemControls || "<small>库存为空，或保持默认整库带入</small>"}
        </div>
      </div>
    </li>`;
  }

  private renderOverlay(state: SessionState): void {
    const overlay = this.regions.overlay!;
    const sameScreen = this.overlayScreen === state.screen;
    const scrollTop = sameScreen ? overlay.scrollTop : 0;
    const focused = document.activeElement as HTMLElement | null;
    const focusAction = sameScreen && overlay.contains(focused)
      ? focused?.dataset.action ?? null
      : null;
    const focusValue = sameScreen && overlay.contains(focused)
      ? focused?.dataset.value ?? null
      : null;
    const content = this.overlayContent(state);
    overlay.hidden = content === null;
    overlay.innerHTML = content ?? "";
    this.overlayScreen = state.screen;
    if (sameScreen && content !== null) {
      overlay.scrollTop = scrollTop;
      if (focusAction) {
        const candidates = overlay.querySelectorAll<HTMLElement>(`[data-action="${focusAction}"]`);
        const target = [...candidates].find((candidate) =>
          focusValue === null || candidate.dataset.value === focusValue,
        );
        target?.focus({ preventScroll: true });
      }
    }
  }

  private overlayContent(state: SessionState): string | null {
    switch (state.screen) {
      case "title":
        return `<div class="sheet sheet--title">
          <div class="title-hero">
            <img class="title-hero__portrait" src="${COMMANDER_PORTRAIT[CHAPTER_ONE.protagonist.portrait]}" alt="高大全肖像" />
            <div><p class="sheet__eyebrow">历史战役篇 · 1950—1953</p><h1>高大全</h1><p class="title-hero__rank">${esc(CHAPTER_ONE.protagonist.title)}</p></div>
          </div>
          <p class="sheet__lead">${esc(CHAPTER_ONE.protagonist.bio)} 你要做的不是旁观历史，而是打完眼前这一战。</p>
          <div class="sheet__actions">
            <button class="btn btn--primary" data-action="new-campaign">新的战役</button>
            ${state.hasSave ? `<button class="btn" data-action="continue">继续（第 ${state.campaign.missionIndex + 1} 关）</button>` : ""}
          </div>
        </div>`;

      case "brief": {
        const mission = CHAPTER_ONE.missions[state.campaign.missionIndex];
        if (!mission) return null;
        const goals = briefVictoryLines(mission);
        const weather = mission.weather ?? { options: ["clear" as Weather], label: "晴", detail: "" };
        const commandersById = new Map((mission.commanders ?? []).map((c) => [c.id, c]));
        const eliteEnemies = mission.enemies.filter(
          (enemy) => enemy.commanderId || enemy.title || (enemy.dropOptions?.length ?? 0) > 0,
        );
        const deployed = new Set(this.session.deployedIds());
        const cap = this.session.deployCap();
        const loadoutUsed = this.session.loadoutTotals();
        const hasManualLoadout = ITEM_IDS.some((id) => (loadoutUsed[id] ?? 0) > 0);
        return `<div class="sheet sheet--brief">
          <div class="brief-head">
            <img class="brief-head__portrait" src="${COMMANDER_PORTRAIT[CHAPTER_ONE.protagonist.portrait]}" alt="高大全肖像" />
            <div class="brief-head__copy">
              <p class="sheet__eyebrow">作战简报 · 第 ${state.campaign.missionIndex + 1} / ${CHAPTER_ONE.missions.length} 关 · ${esc(mission.date ?? "")}</p>
              <h1>${esc(mission.name)}</h1>
              <p class="brief-head__location">${esc(mission.location ?? "")}</p>
              <p class="sheet__lead">${esc(mission.brief)}</p>
            </div>
          </div>

          <section class="brief-block">
            <h3>任务</h3>
            <ul class="sheet__goals">
              ${goals.map((goal) => `<li>${ico(UI_ICON.objPending, "ico ico--sm")}${esc(goal)}</li>`).join("")}
            </ul>
            <div class="brief-facts">
              <article><strong>天气</strong><span>${esc(weather.label)}</span><small>${esc(weather.detail)}</small></article>
              <article><strong>地图</strong><span>${esc(mission.mapNote ?? "战术抽象地图")}</span></article>
              <article><strong>时间压力</strong><span>${mission.maxTurns} 回合</span><small>${esc(mission.historicalOutcome ?? "")}</small></article>
              ${(mission.scripted ?? []).length
                ? `<article><strong>战场规则</strong><span>${esc(
                    (mission.scripted ?? []).map((rule) => rule.note).join("；"),
                  )}</span></article>`
                : ""}
            </div>
          </section>

          <section class="brief-block">
            <h3>敌军威胁</h3>
            <p class="sheet__hint">下列主将与精锐就在本关棋盘上；击溃后可在原地缴获精英道具。</p>
            <div class="threat-strip">
              ${eliteEnemies
                .map((enemy) => {
                  const linked = enemy.commanderId ? commandersById.get(enemy.commanderId) : undefined;
                  const name = linked?.name ?? enemy.name ?? UNIT_TYPES[enemy.type].name;
                  const role = enemy.title ?? linked?.role ?? "精锐部队";
                  const formation = linked?.formation ?? enemy.equipment ?? UNIT_TYPES[enemy.type].name;
                  const portrait =
                    linked?.portrait && COMMANDER_PORTRAIT[linked.portrait]
                      ? COMMANDER_PORTRAIT[linked.portrait]
                      : null;
                  const drops = (enemy.dropOptions ?? []).map((id) => ITEMS[id].name).join(" / ");
                  return `<article class="threat-card">
                    ${portrait ? `<img src="${portrait}" alt="${esc(name)}肖像" />` : `<span class="threat-card__fallback">${esc(name.slice(0, 1))}</span>`}
                    <div>
                      <strong>${esc(name)}</strong>
                      <small>${esc(formation)} · ${esc(role)}</small>
                      <em>${drops ? `缴获：${esc(drops)}` : "精锐编制"}</em>
                    </div>
                  </article>`;
                })
                .join("")}
            </div>
          </section>

          <section class="brief-block">
            <h3>我方兵力</h3>
            <p class="sheet__hint">出战名额 ${deployed.size} / ${cap}（含主力高大全）。本关临时配属为真实人物，战后不进入花名册。</p>
            <ul class="sheet__roster">
              ${(mission.storyAllies ?? [])
                .map(
                  (ally, index) =>
                    `<li>${ico(unitIdentityPortrait("pva", state.campaign.roster.length + index), "ico ico--sm")}<span>${esc(ally.commander)}${esc(UNIT_TYPES[ally.type].name)} · 临时配属</span><span>${esc(ally.duty ?? `Lv.${ally.level}`)}</span></li>`,
                )
                .join("")}
            </ul>
          </section>

          <section class="brief-block brief-block--armory">
            <h3>军械库 · 编制与携行</h3>
            <p class="sheet__hint">勾选出战、分配武器与携行物资。不分配物资时默认把战役库存整库带入本关；分配后未带出的物资会留在库存。</p>
            <p class="sheet__hint">${hasManualLoadout ? `已分配携行：${ITEM_IDS.filter((id) => (loadoutUsed[id] ?? 0) > 0).map((id) => `${ITEMS[id].name}×${loadoutUsed[id]}`).join("、")}` : "当前：默认整库带入"}</p>
            <ul class="armory">
              ${state.campaign.roster.map((unit) => this.armoryRow(state, unit, deployed)).join("")}
            </ul>
          </section>

          <p class="sheet__note">${esc(mission.historicalNote ?? "地图和单位数量均为战术抽象。")}</p>
          <div class="sheet__actions"><button class="btn btn--primary" data-action="begin-mission">进入战场</button></div>
        </div>`;
      }

      case "result": {
        const outcome = state.outcome;
        if (!outcome) return null;
        const won = outcome.status === "won";
        const mission =
          state.mission ?? CHAPTER_ONE.missions.find((entry) => entry.id === outcome.missionId) ?? null;
        const historical = mission?.historicalOutcome ?? "";
        return `<div class="sheet">
          <div class="sheet__result">${ico(won ? UI_ICON.resultWin : UI_ICON.resultLose, "ico ico--result")}</div>
          <p class="sheet__eyebrow">${won ? "任务完成" : "任务失败"}</p>
          <h1>${esc(outcome.reason)}</h1>
          <div class="result-compare">
            <article>
              <strong>本关结果</strong>
              <span>${won ? "你完成了战术目标" : "你未能完成战术目标"}：${esc(outcome.reason)}</span>
            </article>
            <article>
              <strong>史实对照</strong>
              <span>${esc(historical || "本关未收录史实结局。")}</span>
            </article>
          </div>
          <ul class="sheet__stats">
            <li><span>使用回合</span><strong>${outcome.turnsUsed}</strong></li>
            <li><span>志愿军溃散</span><strong>${outcome.playerRouted}</strong></li>
            <li><span>联合军溃散</span><strong>${outcome.enemyRouted}</strong></li>
            <li><span>撤离</span><strong>${outcome.evacuated}</strong></li>
            <li><span>永久损失</span><strong>${outcome.permanentLosses.length}</strong></li>
            <li><span>归队</span><strong>${outcome.returningUnits.length}</strong></li>
            <li><span>3级以上老兵</span><strong>${outcome.veteransAfter}</strong></li>
            <li><span>缴获武器</span><strong>${outcome.weaponsGained.length}</strong></li>
          </ul>
          ${outcome.permanentLossNames.length > 0 ? `<p class="result-detail"><strong>永久损失：</strong>${esc(outcome.permanentLossNames.join("、"))}</p>` : ""}
          ${outcome.returningUnitNames.length > 0 ? `<p class="result-detail"><strong>重伤归队：</strong>${esc(outcome.returningUnitNames.join("、"))}</p>` : ""}
          ${outcome.replacementNames.length > 0 ? `<p class="result-detail"><strong>补充编入：</strong>${esc(outcome.replacementNames.join("、"))}</p>` : ""}
          ${outcome.weaponsGained.length > 0 ? `<p class="result-detail"><strong>缴获/奖励：</strong>${esc(outcome.weaponsGained.map((id) => WEAPONS[id].name).join("、"))}</p>` : ""}
          <p class="sheet__note">${
            outcome.permanentLosses.length > 0
              ? "被击溃的伴随部队里有一部分永远回不来了。剧情将领本关结算后离开编制。"
              : "这一仗没有永久损失。剧情将领本关结束后离开编制。"
          }</p>
          <div class="sheet__actions">
            <button class="btn btn--primary" data-action="proceed">继续</button>
            <button class="btn" data-action="download-replay">导出回放</button>
          </div>
        </div>`;
      }

      case "chapterEnd": {
        const history = state.campaign.history;
        const won = history.filter((h) => h.status === "won").length;
        const veterans = state.campaign.roster.filter((u) => u.level >= 6);
        return `<div class="sheet">
          <p class="sheet__eyebrow">章节结束</p>
          <h1>通过 ${won}/${history.length} 场</h1>
          <h3>幸存伴随将领</h3>
          <ul class="sheet__roster">
            ${state.campaign.roster
              .map(
                (unit, index) =>
                  `<li>${ico(unit.keyUnit ? COMMANDER_PORTRAIT["gao-daquan"]! : unitIdentityPortrait("pva", index), "ico ico--sm")}<span>${esc(unit.name)}</span><span>${esc(unit.duty ?? "直属作战分队")} · 战斗 Lv.${unit.level} · 参战 ${unit.missionsSurvived} 次</span></li>`,
              )
              .join("")}
          </ul>
          <p class="sheet__note">其中 ${veterans.length} 人达到战斗 Lv.6 以上——他们是这一章真正的产出。等级代表战斗资历，不等同历史军衔或职务晋升。</p>
          <div class="sheet__actions">
            <button class="btn btn--primary" data-action="new-campaign">再打一遍</button>
            <button class="btn" data-action="download-replay">导出回放</button>
          </div>
        </div>`;
      }

      default:
        return null;
    }
  }
}
