import { ITEMS } from "../content/items";
import { CHAPTER_ONE } from "../content/chapter";
import { TERRAIN } from "../content/terrain";
import { UNIT_TYPES, veterancyName } from "../content/units";
import { livingUnits, unitAt } from "../core/grid";
import { isEvacTile } from "../core/mission";
import type { GameState, ItemId, Unit } from "../core/types";
import { Board, terrainName } from "./board";
import { breakdownFactors, factionLabel, unitLabel } from "./format";
import { briefVictoryLines, objectiveLines } from "./objectives";
import type { Session, SessionState } from "./session";
import { downloadReplay, loadReplays } from "./storage";

const SKELETON = `
  <div class="battle" data-region="battle">
    <header class="topbar">
      <div class="topbar__mission" data-region="mission"></div>
      <div class="topbar__status" data-region="status"></div>
      <button class="btn btn--primary topbar__end" data-action="end-turn">结束回合</button>
    </header>
    <div class="stage" data-region="stage">
      <canvas data-region="canvas" aria-label="战场棋盘"></canvas>
      <div class="notice" data-region="notice" hidden></div>
    </div>
    <aside class="panel" data-region="panel"></aside>
  </div>
  <div class="overlay" data-region="overlay" hidden></div>
`;

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

    const canvas = this.regions.canvas as HTMLCanvasElement;
    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const tile = this.board.toTile(event.clientX, event.clientY);
      if (tile) this.session.clickTile(tile);
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
      this.renderTopbar(state, state.battle);
      this.renderPanel(state, state.battle);
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
    this.board.render(battle, {
      selectedUnitId: state.selectedUnitId,
      moveTiles: this.session.moveTiles(),
      attackTiles: this.session.attackTiles(),
      itemTiles: this.session.itemTiles(),
      inspected: state.inspectedTile,
      visual: this.session.presentation.visual,
      objectiveDone: (o) => o.owner === "player",
    });
  }

  private renderNotice(state: SessionState): void {
    const notice = this.regions.notice!;
    notice.hidden = !state.notice;
    notice.textContent = state.notice ?? "";
  }

  private renderTopbar(state: SessionState, battle: GameState): void {
    const lines = objectiveLines(battle, state.mission);
    const summary = lines
      .map((line) => `${line.done ? "✓" : "□"}${line.name}`)
      .join(" · ");
    this.regions.mission!.innerHTML = `
      <span class="topbar__name">${esc(state.mission?.name ?? "")}</span>
      <span class="topbar__goal">${esc(summary)}</span>
    `;
    this.regions.status!.innerHTML = `
      <span>回合 <strong>${battle.turn}/${battle.maxTurns}</strong></span>
      <span>${battle.weather === "rain" ? "雨" : "晴"}</span>
      <span>志愿军 ${livingUnits(battle, "player").length}</span>
      <span>联合军 ${livingUnits(battle, "enemy").length}</span>
    `;
  }

  private renderPanel(state: SessionState, battle: GameState): void {
    const unit = this.session.selectedUnit;
    const sections: string[] = [];

    sections.push(this.objectivesCard(state, battle));
    sections.push(`<div class="roster">${this.rosterChips(state, battle)}</div>`);

    if (unit) {
      sections.push(this.unitCard(state, battle, unit));
    } else if (state.inspectedTile) {
      sections.push(this.inspectCard(battle, state.inspectedTile.x, state.inspectedTile.y));
    } else {
      sections.push(`<section class="card card--quiet"><p class="card__dim">点击棋盘查看地形与单位。</p></section>`);
    }

    if (state.lastStrike) sections.push(this.strikeCard(state, battle));
    sections.push(this.logCard(state));

    this.regions.panel!.innerHTML = sections.join("");
  }

  private objectivesCard(state: SessionState, battle: GameState): string {
    const lines = objectiveLines(battle, state.mission);
    if (lines.length === 0) return "";
    return `<section class="card card--objectives">
      <h3>任务目标</h3>
      <ul class="objectives">
        ${lines
          .map(
            (line) =>
              `<li class="objectives__item${line.done ? " is-done" : ""}">
                <span class="objectives__mark" aria-hidden="true">${line.done ? "✓" : "□"}</span>
                <span class="objectives__body">
                  <strong>${esc(line.name)}</strong>
                  <span>${esc(line.detail)}</span>
                </span>
              </li>`,
          )
          .join("")}
      </ul>
    </section>`;
  }

  private rosterChips(state: SessionState, battle: GameState): string {
    return livingUnits(battle, "player")
      .map((unit) => {
        const active = unit.id === state.selectedUnitId ? " is-active" : "";
        const done = unit.hasActed ? " is-done" : "";
        const ratio = Math.round((unit.hp / unit.maxHp) * 100);
        return `<button class="chip${active}${done}" data-action="select-unit" data-value="${unit.id}">
          <span class="chip__name">${esc(unit.name)}${unit.keyUnit ? " ★" : ""}</span>
          <span class="chip__meta">${esc(UNIT_TYPES[unit.type].name)} ${ratio}%</span>
        </button>`;
      })
      .join("");
  }

  private inspectCard(battle: GameState, x: number, y: number): string {
    const terrainId = battle.tiles[y * battle.width + x]!;
    const terrain = TERRAIN[terrainId];
    const occupant = unitAt(battle, x, y);
    const objective = battle.objectives.find((o) => o.x === x && o.y === y);
    const fieldItem = battle.fieldItems.find((i) => i.x === x && i.y === y);
    const evac = isEvacTile(battle, x, y);

    const bits: string[] = [];
    bits.push(`<p class="card__sub">${esc(terrain.name)} · 移动消耗 ${terrain.moveCost} · ${esc(defenseText(terrain.defense))}</p>`);
    if (terrain.regen) bits.push(`<p class="card__dim">驻留回复 ${terrain.regen}</p>`);
    if (terrain.rangeBonus) bits.push(`<p class="card__dim">射程 +${terrain.rangeBonus}</p>`);
    if (objective) {
      bits.push(
        `<p><span class="tag ${objective.owner === "player" ? "tag--player" : "tag--enemy"}">${esc(objective.name)}</span> ${objective.owner === "player" ? "志愿军控制" : objective.owner === "enemy" ? "联合军控制" : "中立"}</p>`,
      );
    }
    if (evac) bits.push(`<p><span class="tag tag--player">撤离带</span></p>`);
    if (fieldItem) bits.push(`<p class="card__dim">地面补给：${esc(ITEMS[fieldItem.item].name)}</p>`);
    if (occupant) {
      bits.push(
        `<p><strong>${esc(occupant.name)}</strong> · ${esc(factionLabel(occupant.faction))} · ${esc(UNIT_TYPES[occupant.type].name)} · ${occupant.hp}/${occupant.maxHp}</p>`,
      );
    } else {
      bits.push(`<p class="card__dim">空地</p>`);
    }

    return `<section class="card">
      <header class="card__head"><h2>格子 ${x},${y}</h2></header>
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
          ${canCapture ? `<button class="btn btn--primary" data-action="unit-capture" data-value="${unit.id}" ${locked ? "disabled" : ""}>占领</button>` : ""}
          <button class="btn" data-action="unit-wait" data-value="${unit.id}" ${locked ? "disabled" : ""}>待命</button>
          ${items
            .map(
              ({ id, count }) =>
                `<button class="btn btn--item${state.pendingItem === id ? " is-active" : ""}" data-action="use-item" data-value="${id}" ${locked ? "disabled" : ""}>${esc(ITEMS[id].name)} ×${count}</button>`,
            )
            .join("")}
        </div>
        ${state.pendingItem ? `<p class="card__dim">${esc(ITEMS[state.pendingItem].description)}</p>` : ""}`;

    return `<section class="card">
      <header class="card__head">
        <h2>${esc(unit.name)}${unit.keyUnit ? " <span class=\"tag tag--key\">主力</span>" : ""}</h2>
        <span class="tag ${isMine ? "tag--player" : "tag--enemy"}">${esc(factionLabel(unit.faction))}</span>
      </header>
      <p class="card__sub">${esc(def.name)} · ${esc(veterancyName(unit.exp))} · ${esc(terrain)}</p>
      <div class="stats">
        <div><span>生命</span><strong>${unit.hp}/${unit.maxHp}</strong></div>
        <div><span>攻击</span><strong>${def.attack}</strong></div>
        <div><span>射程</span><strong>${def.minRange}-${def.maxRange}</strong></div>
        <div><span>移动</span><strong>${unit.mpLeft}/${def.move}</strong></div>
        <div><span>疲劳</span><strong>${Math.round(unit.fatigue)}</strong></div>
        <div><span>经验</span><strong>${Math.round(unit.exp)}</strong></div>
      </div>
      <p class="card__role">${esc(def.role)}</p>
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
          <p class="sheet__eyebrow">战棋纵向切片</p>
          <h1>云山</h1>
          <p class="sheet__lead">三场连续任务。志愿军会带着伤势、经验和疲劳走进下一场——撤下来的人才是你的。</p>
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
            ${goals.map((goal) => `<li>${esc(goal)}</li>`).join("")}
          </ul>
          <h3>可用部队</h3>
          <ul class="sheet__roster">
            ${state.campaign.roster
              .map(
                (unit) =>
                  `<li><span>${esc(unit.name)}</span><span>${esc(UNIT_TYPES[unit.type].name)} · ${esc(veterancyName(unit.exp))} · ${unit.hp}/${unit.maxHp}</span></li>`,
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
                  `<li><span>${esc(unit.name)}</span><span>${esc(UNIT_TYPES[unit.type].name)} · ${esc(veterancyName(unit.exp))} · 参战 ${unit.missionsSurvived} 次</span></li>`,
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
