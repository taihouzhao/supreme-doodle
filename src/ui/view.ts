import { ITEMS } from "../content/items";
import { CHAPTER_ONE } from "../content/chapter";
import { TERRAIN } from "../content/terrain";
import { UNIT_TYPES, veterancyName } from "../content/units";
import { livingUnits, unitAt } from "../core/grid";
import { isEvacTile } from "../core/mission";
import type { GameState, ItemId, Unit } from "../core/types";
import { ITEM_ICON, TERRAIN_ICON, UI_ICON, UNIT_ICON } from "./assets";
import { Board, terrainName } from "./board";
import { breakdownFactors, factionLabel, unitLabel } from "./format";
import { briefVictoryLines, objectiveLines } from "./objectives";
import type { Session, SessionState } from "./session";
import { downloadReplay, loadReplays } from "./storage";

const SKELETON = `
  <div class="battle" data-region="battle">
    <div class="stage" data-region="stage">
      <canvas data-region="canvas" aria-label="战场棋盘"></canvas>
      <header class="hud-top" data-region="hud-top"></header>
      <nav class="hud-roster" data-region="roster" aria-label="志愿军部队"></nav>
      <aside class="hud-sheet" data-region="panel" hidden></aside>
      <div class="notice" data-region="notice" hidden></div>
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

export class View {
  private readonly root: HTMLElement;
  private readonly session: Session;
  private readonly board: Board;
  private readonly regions: Record<string, HTMLElement>;
  private logCollapsed = true;

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
    window.addEventListener("resize", () => this.render(this.session.current));
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
        case "unit-wait":
          if (value) this.session.dispatch({ kind: "wait", unitId: value });
          break;
        case "unit-capture":
          if (value) this.session.dispatch({ kind: "capture", unitId: value });
          break;
        case "use-item":
          this.handleItem(value as ItemId);
          break;
        case "download-replay":
          this.downloadLatestReplay();
          break;
        case "toggle-log":
          this.logCollapsed = !this.logCollapsed;
          this.render(this.session.current);
          break;
        default:
          break;
      }
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
      this.renderRoster(state, state.battle);
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
        itemTiles: this.session.itemTiles(),
        inspected: state.inspectedTile,
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
      .map(
        (line) =>
          `<span class="hud-top__obj${line.done ? " is-done" : ""}" title="${esc(line.detail)}">${ico(line.done ? UI_ICON.objDone : UI_ICON.objPending, "ico ico--xs")}<span>${esc(line.name)}</span></span>`,
      )
      .join("");
    const weatherSrc =
      battle.weather === "rain" ? UI_ICON.weatherRain : UI_ICON.weatherClear;
    this.regions["hud-top"]!.innerHTML = `
      <div class="hud-top__left">
        <strong class="hud-top__name">${esc(state.mission?.name ?? "")}</strong>
        <div class="hud-top__goals">${goals}</div>
      </div>
      <div class="hud-top__meta">
        <span>T<strong>${battle.turn}</strong>/${battle.maxTurns}</span>
        <span class="hud-top__pill">${ico(weatherSrc, "ico ico--xs ico--badge")}${battle.weather === "rain" ? "雨" : "晴"}</span>
        <span class="hud-top__pill">${ico(UI_ICON.factionPva, "ico ico--xs ico--badge")}${livingUnits(battle, "player").length}</span>
        <span class="hud-top__pill">${ico(UI_ICON.factionUn, "ico ico--xs ico--badge")}${livingUnits(battle, "enemy").length}</span>
      </div>
      <button class="btn btn--primary hud-top__end" data-action="end-turn">
        ${ico(UI_ICON.actEndTurn, "ico ico--btn")}结束回合
      </button>
    `;
  }

  private renderRoster(state: SessionState, battle: GameState): void {
    const units = livingUnits(battle, "player");
    this.regions.roster!.innerHTML = units
      .map((unit) => {
        const active = unit.id === state.selectedUnitId ? " is-active" : "";
        const done = unit.hasActed ? " is-done" : "";
        const ratio = Math.max(0, Math.min(100, Math.round((unit.hp / unit.maxHp) * 100)));
        const title = `${unit.name} · ${UNIT_TYPES[unit.type].name} · ${veterancyName(unit.exp)} · ${ratio}%`;
        return `<button class="token${active}${done}" data-action="select-unit" data-value="${unit.id}" title="${esc(title)}" aria-label="${esc(title)}">
          ${ico(UNIT_ICON[unit.type].player, "ico ico--token")}
          ${unit.keyUnit ? ico(UI_ICON.keyUnit, "ico ico--token-key") : ""}
          <span class="token__hp"><i style="width:${ratio}%"></i></span>
        </button>`;
      })
      .join("");
  }

  private renderSheet(state: SessionState, battle: GameState): void {
    const unit = this.session.selectedUnit;
    const hasFocus = Boolean(unit || state.inspectedTile || state.lastStrike);
    const panel = this.regions.panel!;

    if (!hasFocus) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }

    const bits: string[] = [];
    if (unit) bits.push(this.unitCard(state, battle, unit));
    else if (state.inspectedTile) {
      bits.push(this.inspectCard(battle, state.inspectedTile.x, state.inspectedTile.y));
    }
    if (state.lastStrike) bits.push(this.strikeCard(state, battle));
    bits.push(this.logCard(state));

    panel.hidden = false;
    panel.innerHTML = bits.join("");
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

    const bits: string[] = [];
    bits.push(
      `<p class="card__sub">${ico(TERRAIN_ICON[terrainId], "ico ico--sm")}${esc(terrain.name)} · 移动 ${terrain.moveCost} · ${esc(defenseText(terrain.defense))}</p>`,
    );
    if (terrain.regen) bits.push(`<p class="card__dim">驻留回复 ${terrain.regen}</p>`);
    if (terrain.rangeBonus) bits.push(`<p class="card__dim">射程 +${terrain.rangeBonus}</p>`);
    if (objective) {
      const owner =
        objective.owner === "player"
          ? "志愿军控制"
          : objective.owner === "enemy"
            ? "联合军控制"
            : "中立";
      bits.push(
        `<p><span class="tag ${objective.owner === "player" ? "tag--player" : "tag--enemy"}">${esc(objective.name)}</span> ${owner}</p>`,
      );
    }
    if (evac)
      bits.push(
        `<p>${ico(UI_ICON.evac, "ico ico--sm")}<span class="tag tag--player">撤离带</span> 进入即撤离</p>`,
      );
    if (fieldItem)
      bits.push(
        `<p class="card__dim">${ico(ITEM_ICON[fieldItem.item], "ico ico--sm")}地面补给：${esc(ITEMS[fieldItem.item].name)}</p>`,
      );
    if (occupant) {
      bits.push(
        `<p>${ico(UNIT_ICON[occupant.type][occupant.faction], "ico ico--sm")}${esc(factionLabel(occupant.faction))} · ${esc(UNIT_TYPES[occupant.type].name)} · ${esc(veterancyName(occupant.exp))} · ${occupant.hp}/${occupant.maxHp}${occupant.keyUnit ? ` · ${ico(UI_ICON.keyUnit, "ico ico--xs")}主力` : ""}</p>`,
      );
    } else {
      bits.push(`<p class="card__dim">无人驻守</p>`);
    }

    return `<section class="card">
      <header class="card__head"><h2 class="card__title">${ico(titleIcon, "ico ico--title")}${esc(title)}</h2></header>
      ${bits.join("")}
    </section>`;
  }

  private unitCard(state: SessionState, battle: GameState, unit: Unit): string {
    const def = UNIT_TYPES[unit.type];
    const terrain = terrainName(battle, unit.x, unit.y);
    const canCapture =
      def.canCapture &&
      battle.objectives.some(
        (o) => o.kind === "capture" && o.owner !== "player" && o.x === unit.x && o.y === unit.y,
      );
    const isMine = unit.faction === "player";
    const items = this.session.availableItems();
    const locked = state.fxBusy;

    const actions = !isMine
      ? `<p class="card__dim">${esc(factionLabel("enemy"))}单位。</p>`
      : unit.hasActed
        ? `<p class="card__dim">本回合已行动。</p>`
        : `<div class="actions">
          ${canCapture ? `<button class="btn btn--primary" data-action="unit-capture" data-value="${unit.id}" ${locked ? "disabled" : ""}>${ico(UI_ICON.actCapture, "ico ico--btn")}占领</button>` : ""}
          <button class="btn" data-action="unit-wait" data-value="${unit.id}" ${locked ? "disabled" : ""}>待命</button>
          ${items
            .map(
              ({ id, count }) =>
                `<button class="btn btn--item${state.pendingItem === id ? " is-active" : ""}" data-action="use-item" data-value="${id}" ${locked ? "disabled" : ""}>${ico(ITEM_ICON[id], "ico ico--btn")}${esc(ITEMS[id].name)} ×${count}</button>`,
            )
            .join("")}
        </div>
        ${state.pendingItem ? `<p class="card__dim">${esc(ITEMS[state.pendingItem].description)}</p>` : ""}`;

    return `<section class="card card--compact">
      <header class="card__head">
        <h2 class="card__title">${ico(UNIT_ICON[unit.type][unit.faction], "ico ico--title")}${esc(unit.name)}${unit.keyUnit ? ` ${ico(UI_ICON.keyUnit, "ico ico--sm")}<span class="tag tag--key">主力</span>` : ""}</h2>
        <span class="tag ${isMine ? "tag--player" : "tag--enemy"}">${esc(factionLabel(unit.faction))}</span>
      </header>
      <p class="card__sub">${esc(def.name)} · ${esc(veterancyName(unit.exp))} · ${esc(terrain)} · ${unit.hp}/${unit.maxHp} · 移 ${unit.mpLeft}/${def.move}</p>
      ${actions}
    </section>`;
  }

  private strikeCard(state: SessionState, battle: GameState): string {
    const strike = state.lastStrike!;
    const factors = breakdownFactors(strike.breakdown);
    return `<section class="card card--strike">
      <h3>上一次交火</h3>
      <p class="card__sub">${esc(unitLabel(battle, strike.attackerId))} → ${esc(unitLabel(battle, strike.defenderId))}</p>
      <p class="strike__total">造成 <strong>${strike.damage}</strong> 伤害${strike.counterDamage > 0 ? `，被反击 <strong>${strike.counterDamage}</strong>` : ""}</p>
      <ul class="factors">
        ${factors
          .map(
            (factor) =>
              `<li class="${factor.favourable ? "is-up" : "is-down"}"><span>${esc(factor.label)}</span><strong>×${factor.value.toFixed(2)}</strong></li>`,
          )
          .join("")}
      </ul>
    </section>`;
  }

  private logCard(state: SessionState): string {
    const entries = state.log
      .slice(-8)
      .reverse()
      .map(
        (entry) =>
          `<li class="log__item log__item--${entry.tone}"><span class="log__turn">T${entry.turn}</span>${esc(entry.text)}</li>`,
      )
      .join("");
    return `<section class="card card--log">
      <button class="log__toggle" data-action="toggle-log" type="button">
        战斗记录 ${this.logCollapsed ? "▸" : "▾"}
      </button>
      ${this.logCollapsed ? "" : `<ul class="log">${entries}</ul>`}
    </section>`;
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
          <div class="sheet__brands">${ico(UI_ICON.factionPva, "ico ico--hero")}${ico(UI_ICON.factionUn, "ico ico--hero")}</div>
          <p class="sheet__eyebrow">战棋纵向切片</p>
          <h1>入朝</h1>
          <p class="sheet__lead">三场连续任务：云山伏击、长津阻击、北撤掩护。部队带着伤势与经验走进下一场——主力若阵亡，战役即告失败。</p>
          <div class="sheet__actions">
            <button class="btn btn--primary" data-action="new-campaign">新的战役</button>
            ${state.hasSave ? `<button class="btn" data-action="continue">继续（第 ${state.campaign.missionIndex + 1} 关）</button>` : ""}
          </div>
        </div>`;

      case "brief": {
        const mission = CHAPTER_ONE.missions[state.campaign.missionIndex];
        if (!mission) return null;
        const goals = briefVictoryLines(mission);
        return `<div class="sheet">
          <p class="sheet__eyebrow">第 ${state.campaign.missionIndex + 1} / ${CHAPTER_ONE.missions.length} 关</p>
          <h1>${esc(mission.name)}</h1>
          <p class="sheet__lead">${esc(mission.brief)}</p>
          <h3>任务目标</h3>
          <ul class="sheet__goals">
            ${goals.map((goal) => `<li>${ico(UI_ICON.objPending, "ico ico--sm")}${esc(goal)}</li>`).join("")}
          </ul>
          <h3>可用部队</h3>
          <ul class="sheet__roster">
            ${state.campaign.roster
              .map(
                (unit) =>
                  `<li>${ico(UNIT_ICON[unit.type].player, "ico ico--sm")}<span>${esc(unit.name)}</span><span>${esc(UNIT_TYPES[unit.type].name)} · ${esc(veterancyName(unit.exp))} · ${unit.hp}/${unit.maxHp}</span></li>`,
              )
              .join("")}
          </ul>
          <div class="sheet__actions"><button class="btn btn--primary" data-action="begin-mission">出发</button></div>
        </div>`;
      }

      case "result": {
        const outcome = state.outcome;
        if (!outcome) return null;
        const won = outcome.status === "won";
        return `<div class="sheet">
          <div class="sheet__result">${ico(won ? UI_ICON.resultWin : UI_ICON.resultLose, "ico ico--result")}</div>
          <p class="sheet__eyebrow">${won ? "任务完成" : "任务失败"}</p>
          <h1>${esc(outcome.reason)}</h1>
          <ul class="sheet__stats">
            <li><span>志愿军溃散</span><strong>${outcome.playerRouted}</strong></li>
            <li><span>联合军溃散</span><strong>${outcome.enemyRouted}</strong></li>
            <li><span>撤离</span><strong>${outcome.evacuated}</strong></li>
            <li><span>永久损失</span><strong>${outcome.permanentLosses.length}</strong></li>
            <li><span>归队</span><strong>${outcome.returningUnits.length}</strong></li>
            <li><span>现役老兵</span><strong>${outcome.veteransAfter}</strong></li>
          </ul>
          <p class="sheet__note">${
            outcome.permanentLosses.length > 0
              ? "被击溃的部队里有一部分永远回不来了。撤下来的单位则完整保留。"
              : "这一仗没有永久损失。"
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
        const veterans = state.campaign.roster.filter((u) => u.exp >= 150);
        return `<div class="sheet">
          <p class="sheet__eyebrow">章节结束</p>
          <h1>通过 ${won}/${history.length} 场</h1>
          <h3>幸存部队</h3>
          <ul class="sheet__roster">
            ${state.campaign.roster
              .map(
                (unit) =>
                  `<li>${ico(UNIT_ICON[unit.type].player, "ico ico--sm")}<span>${esc(unit.name)}</span><span>${esc(UNIT_TYPES[unit.type].name)} · ${esc(veterancyName(unit.exp))} · 参战 ${unit.missionsSurvived} 次</span></li>`,
              )
              .join("")}
          </ul>
          <p class="sheet__note">其中 ${veterans.length} 支是老兵或精锐——他们是这一章真正的产出。</p>
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
