import { ITEMS } from "../content/items";
import { CHAPTER_ONE } from "../content/chapter";
import { TERRAIN } from "../content/terrain";
import { PROGRESS, levelFromExp } from "../content/progress";
import { UNIT_TYPES } from "../content/units";
import { WEAPONS } from "../content/weapons";
import { equippableWeapons } from "../core/campaign";
import { effectiveStats } from "../core/commander";
import { attackRange, livingUnits, unitAt } from "../core/grid";
import { isEvacTile, movementBudget, type RosterUnit } from "../core/mission";
import type { GameState, ItemId, Unit, WeaponId, Weather } from "../core/types";
import { COMMANDER_PORTRAIT, ITEM_ICON, TERRAIN_ICON, UI_ICON, UNIT_ICON } from "./assets";
import { Board, terrainName } from "./board";
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

/** 物资固定 6 格，空位画虚线占位，布局不会随库存跳动 */
const ITEM_SLOT_COUNT = 6;

function itemSlots(
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
      `<button type="button" class="slot${active}" data-action="use-item" data-value="${entry.id}" title="${esc(def.name)}：${esc(def.description)}" ${locked ? "disabled" : ""}>` +
        `<img class="slot__ico" src="${ITEM_ICON[entry.id]}" alt="" draggable="false" />` +
        `<span class="slot__count">${entry.count}</span>` +
        `<span class="slot__effect">${esc(itemEffectLabel(entry.id))}</span>` +
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
  const attack = Math.round(
    def.attack * (1 + (primary - 40) * 0.005) * (1 + weapon.attackBonus) *
      (1 + (unit.level - 1) * PROGRESS.attackPerLevel),
  );
  const defence = Math.round(
    (terrain.defense + weapon.defenseBonus + (unit.level - 1) * PROGRESS.defensePerLevel) * 100,
  );

  return [
    { label: "攻击", value: String(attack), hint: `兵种底火 ${def.attack} × 将领与武器加成` },
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
        <canvas data-region="canvas" aria-label="战场棋盘"></canvas>
        <aside class="hud-sheet" data-region="panel" hidden></aside>
        <div class="notice" data-region="notice" hidden></div>
      </div>
    </div>
  </div>
  <div class="overlay" data-region="overlay" hidden></div>
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
    // 空格快进正在播放的交战动画
    window.addEventListener("keydown", (event) => {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (!this.session.current.fxBusy) return;
      event.preventDefault();
      this.session.skipFx();
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
        default:
          break;
      }
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
      this.renderNotice(state);
      const endBtn = this.root.querySelector<HTMLButtonElement>('[data-action="end-turn"]');
      if (endBtn) endBtn.disabled = state.fxBusy;
      this.paintBoard(state, state.battle);
    }

    this.renderOverlay(state);
  }

  /** 动画帧只重绘棋盘 */
  renderBoard(): void {
    const state = this.session.current;
    if (state.screen !== "battle" || !state.battle) return;
    this.paintBoard(state, state.battle);
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

  private renderHudTop(state: SessionState, battle: GameState): void {
    const lines = objectiveLines(battle, state.mission);
    const goals = lines
      .map((line) => {
        const active = state.highlightObjectiveId === line.id ? " is-active" : "";
        return `<button type="button" class="hud-top__obj${line.done ? " is-done" : ""}${active}" data-action="focus-objective" data-value="${esc(line.id)}" title="${esc(line.detail)}">${ico(line.done ? UI_ICON.objDone : UI_ICON.objPending, "ico ico--xs")}<span>${esc(line.name)}</span></button>`;
      })
      .join("");
    const weather = weatherPresentation(battle.weather);
    this.regions["hud-top"]!.innerHTML = `
      <div class="hud-top__left">
        <strong class="hud-top__name">${esc(state.mission?.name ?? "")}</strong>
        <div class="hud-top__goals">${goals}</div>
      </div>
      <div class="hud-top__meta">
        <span>T<strong>${battle.turn}</strong>/${battle.maxTurns}</span>
        <span class="hud-top__pill" title="${esc(state.mission?.weather?.detail ?? "")}">${ico(weather.icon, "ico ico--xs ico--badge")}${weather.label}</span>
        <span class="hud-top__pill">${ico(UI_ICON.factionPva, "ico ico--xs ico--badge")}${livingUnits(battle, "player").length}</span>
        <span class="hud-top__pill">${ico(UI_ICON.factionUn, "ico ico--xs ico--badge")}${livingUnits(battle, "enemy").length}</span>
        <button type="button" class="hud-top__pill hud-top__speed" data-action="cycle-fx-speed" title="交战动画倍速">${state.fxSpeed}×</button>
        ${state.fxBusy ? `<button type="button" class="hud-top__pill hud-top__skip" data-action="skip-fx">跳过</button>` : ""}
      </div>
      <button class="btn btn--primary hud-top__end" data-action="end-turn">
        ${ico(UI_ICON.actEndTurn, "ico ico--btn")}结束回合
      </button>
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
      ? UNIT_ICON[occupant.type][occupant.faction]
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
    const canCapture =
      def.canCapture &&
      battle.objectives.some(
        (o) => o.kind === "capture" && o.owner !== "player" && o.x === unit.x && o.y === unit.y,
      );
    const isMine = unit.faction === "player";
    const items = this.session.availableItems();
    const locked = state.fxBusy;
    const hpPct = Math.max(0, Math.min(100, Math.round((unit.hp / unit.maxHp) * 100)));
    const level = levelFromExp(unit.exp);
    const floor = PROGRESS.expForLevel(level);
    const next = level >= PROGRESS.maxLevel ? floor : PROGRESS.expForLevel(level + 1);
    const xpPct =
      next <= floor ? 100 : Math.max(0, Math.min(100, Math.round(((unit.exp - floor) / (next - floor)) * 100)));
    const portrait =
      unit.commanderName === "高大全"
        ? COMMANDER_PORTRAIT["gao-daquan"]
        : UNIT_ICON[unit.type][unit.faction];
    const kind =
      unit.commanderKind === "story" ? "剧情" : unit.commanderKind === "companion" ? "伴随" : "敌军";

    const combat = combatSummary(battle, unit);
    const slots = !isMine
      ? ""
      : `<div class="slots" role="group" aria-label="随行物资">
          ${itemSlots(items, state.pendingItem, locked || unit.hasActed)}
        </div>`;

    const canUndo = isMine && !unit.hasActed && this.session.canUndoMove();
    const actions = !isMine
      ? ""
      : unit.hasActed
        ? `<p class="card__dim">本回合已行动</p>`
        : `<div class="actions">
          ${canCapture ? `<button class="btn btn--primary" data-action="unit-capture" data-value="${unit.id}" ${locked ? "disabled" : ""}>${ico(UI_ICON.actCapture, "ico ico--btn")}占领</button>` : ""}
          ${canUndo ? `<button class="btn" data-action="unit-undo-move" ${locked ? "disabled" : ""} title="退回本次移动前的位置">撤销</button>` : ""}
          <button class="btn" data-action="unit-wait" data-value="${unit.id}" ${locked ? "disabled" : ""} title="结束本单位行动并降低疲劳">休整</button>
        </div>`;

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
          <div class="card__meta"><span>${esc(unit.rank)}</span><span>Lv.${unit.level}</span><span>${esc(def.name)}</span><span>${esc(kind)}</span></div>
        </div>
        <button class="card__more" data-action="toggle-detail" type="button" title="详细说明">${state.detailExpanded ? "收起" : "详"}</button>
      </div>
      <div class="card__bars">
        <div class="bar bar--hp" title="生命 ${unit.hp}/${unit.maxHp}"><i style="width:${hpPct}%"></i><span>${unit.hp}/${unit.maxHp}</span></div>
        <div class="bar bar--xp" title="经验 ${Math.round(unit.exp)} → Lv.${Math.min(PROGRESS.maxLevel, level + 1)}"><i style="width:${xpPct}%"></i><span>EXP</span></div>
      </div>
      <div class="card__combat">
        ${combat.map((cell) => `<div class="stat" title="${esc(cell.hint)}"><span>${esc(cell.label)}</span><b>${esc(cell.value)}</b></div>`).join("")}
      </div>
      <div class="card__gear" title="${esc(weapon.name)}">${ico(UNIT_ICON[unit.type][unit.faction], "ico ico--xs")}<span>${esc(weapon.name)}</span><span class="card__range">${range.min}–${range.max}格</span></div>
      ${slots}
      ${detail}
      ${actions}
    </section>`;
  }


  /** 花名册一行：将领 + 可选武器下拉 + 该武器带来的加成 */
  private armoryRow(state: SessionState, unit: RosterUnit): string {
    const options = equippableWeapons(state.campaign, unit.id);
    const current = WEAPONS[unit.weapon];
    const bonus = [
      current.stats.might ? `武+${current.stats.might}` : "",
      current.stats.intellect ? `智+${current.stats.intellect}` : "",
      current.stats.leadership ? `统+${current.stats.leadership}` : "",
      current.stats.stamina ? `耐+${current.stats.stamina}` : "",
      current.stats.agility ? `敏+${current.stats.agility}` : "",
      current.attackBonus ? `攻+${Math.round(current.attackBonus * 100)}%` : "",
      current.rangeBonus ? `射程+${current.rangeBonus}` : "",
      current.defenseBonus ? `减伤+${Math.round(current.defenseBonus * 100)}%` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    return `<li class="armory__row">
      ${ico(UNIT_ICON[unit.type].player, "ico ico--sm")}
      <div class="armory__who">
        <strong>${esc(unit.name)}${unit.keyUnit ? " · 主角" : ""}</strong>
        <small>${esc(unit.rank)} Lv.${unit.level} · ${esc(UNIT_TYPES[unit.type].name)}</small>
      </div>
      <div class="armory__pick">
        <select data-action="equip-weapon" data-value="${esc(unit.id)}" aria-label="${esc(unit.name)}的武器">
          ${options
            .map(
              (id) =>
                `<option value="${id}"${id === unit.weapon ? " selected" : ""}>${esc(WEAPONS[id].name)}（评分 ${WEAPONS[id].score}）</option>`,
            )
            .join("")}
        </select>
        <small>${esc(bonus || "无额外加成")}${unit.manualWeapon ? " · 手动锁定" : ""}</small>
      </div>
    </li>`;
  }

  private renderOverlay(state: SessionState): void {
    const overlay = this.regions.overlay!;
    const content = this.overlayContent(state);
    overlay.hidden = content === null;
    overlay.innerHTML = content ?? "";
  }

  private overlayContent(state: SessionState): string | null {
    switch (state.screen) {
      case "title":
        return `<div class="sheet sheet--title">
          <div class="title-hero">
            <img class="title-hero__portrait" src="${COMMANDER_PORTRAIT[CHAPTER_ONE.protagonist.portrait]}" alt="高大全肖像" />
            <div><p class="sheet__eyebrow">历史战役篇 · 1950—1953</p><h1>高大全</h1><p class="title-hero__rank">${esc(CHAPTER_ONE.protagonist.title)}</p></div>
          </div>
          <p class="sheet__lead">沿十二场关键战役走过运动战与阵地战。高大全和直属部队是虚构角色；战役时间、主要地形、参战编制、历史将领与代表性装备按公开战史还原。</p>
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
        const historicalCommanders = mission.commanders ?? [];
        return `<div class="sheet sheet--brief">
          <div class="brief-head">
            <img class="brief-head__portrait" src="${COMMANDER_PORTRAIT[CHAPTER_ONE.protagonist.portrait]}" alt="高大全肖像" />
            <div class="brief-head__copy">
              <p class="sheet__eyebrow">第 ${state.campaign.missionIndex + 1} / ${CHAPTER_ONE.missions.length} 关 · ${esc(mission.date ?? "")}</p>
              <h1>${esc(mission.name)}</h1>
              <p class="brief-head__location">${esc(mission.location ?? "")}</p>
              <p class="sheet__lead">${esc(mission.brief)}</p>
            </div>
          </div>
          <div class="brief-facts">
            <article><strong>天气</strong><span>${esc(weather.label)}</span><small>${esc(weather.detail)}</small></article>
            <article><strong>地图</strong><span>${esc(mission.mapNote ?? "战术抽象地图")}</span></article>
            <article><strong>史实结局</strong><span>${esc(mission.historicalOutcome ?? "")}</span></article>
            ${(mission.scripted ?? []).length
              ? `<article><strong>战史规则</strong><span>${esc(
                  (mission.scripted ?? []).map((rule) => rule.note).join("；"),
                )}</span></article>`
              : ""}
          </div>
          <h3>历史指挥体系</h3>
          <div class="commander-strip">
            ${historicalCommanders.map((commander) => `<article class="commander-card">
              ${commander.portrait && COMMANDER_PORTRAIT[commander.portrait] ? `<img src="${COMMANDER_PORTRAIT[commander.portrait]}" alt="${esc(commander.name)}肖像" />` : `<span class="commander-card__fallback">${esc(commander.name.slice(0, 1))}</span>`}
              <div><strong>${esc(commander.name)}</strong><small>${esc(commander.formation)} · ${esc(commander.role)}</small></div>
            </article>`).join("")}
          </div>
          <h3>任务目标</h3>
          <ul class="sheet__goals">
            ${goals.map((goal) => `<li>${ico(UI_ICON.objPending, "ico ico--sm")}${esc(goal)}</li>`).join("")}
          </ul>
          <h3>军械库配装</h3>
          <p class="sheet__hint">缴获的武器会进军械库，出击前可以自行分配；手动选过的武器之后不会被自动换装顶掉。</p>
          <ul class="armory">
            ${state.campaign.roster.map((unit) => this.armoryRow(state, unit)).join("")}
          </ul>
          <h3>本关剧情将领</h3>
          <ul class="sheet__roster">
            ${(mission.storyAllies ?? [])
              .map(
                (ally) =>
                  `<li>${ico(UNIT_ICON[ally.type].player, "ico ico--sm")}<span>${esc(ally.commander)}${esc(UNIT_TYPES[ally.type].name)} · 剧情</span><span>Lv.${ally.level} · 本关配属</span></li>`,
              )
              .join("")}
          </ul>
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
            <li><span>志愿军溃散</span><strong>${outcome.playerRouted}</strong></li>
            <li><span>联合军溃散</span><strong>${outcome.enemyRouted}</strong></li>
            <li><span>撤离</span><strong>${outcome.evacuated}</strong></li>
            <li><span>永久损失</span><strong>${outcome.permanentLosses.length}</strong></li>
            <li><span>归队</span><strong>${outcome.returningUnits.length}</strong></li>
            <li><span>少尉以上</span><strong>${outcome.veteransAfter}</strong></li>
            <li><span>缴获武器</span><strong>${outcome.weaponsGained.length}</strong></li>
          </ul>
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
                (unit) =>
                  `<li>${ico(UNIT_ICON[unit.type].player, "ico ico--sm")}<span>${esc(unit.name)}</span><span>${esc(unit.rank)} Lv.${unit.level} · 参战 ${unit.missionsSurvived} 次</span></li>`,
              )
              .join("")}
          </ul>
          <p class="sheet__note">其中 ${veterans.length} 人已晋升至少尉以上——他们是这一章真正的产出。</p>
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
