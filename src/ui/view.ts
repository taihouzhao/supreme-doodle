import { ITEMS } from "../content/items";
import { CHAPTER_ONE } from "../content/chapter";
import { TERRAIN } from "../content/terrain";
import { UNIT_TYPES } from "../content/units";
import { WEAPONS } from "../content/weapons";
import { livingUnits, unitAt } from "../core/grid";
import { isEvacTile } from "../core/mission";
import type { GameState, ItemId, Unit, Weather } from "../core/types";
import { COMMANDER_PORTRAIT, ITEM_ICON, TERRAIN_ICON, UI_ICON, UNIT_ICON } from "./assets";
import { Board, terrainName } from "./board";
import { factionLabel } from "./format";
import { briefVictoryLines, objectiveLines } from "./objectives";
import type { Session, SessionState } from "./session";
import { downloadReplay, loadReplays } from "./storage";

const SKELETON = `
  <div class="battle" data-region="battle">
    <div class="stage" data-region="stage">
      <header class="hud-top" data-region="hud-top"></header>
      <div class="stage__map" data-region="map">
        <canvas data-region="canvas" aria-label="战场棋盘"></canvas>
        <aside class="hud-sheet" data-region="panel" hidden></aside>
        <div class="notice" data-region="notice" hidden></div>
      </div>
      <nav class="hud-roster" data-region="roster" aria-label="志愿军部队"></nav>
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
        case "clear-focus":
          this.session.clearFocus();
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
        const title = `${unit.name} · ${unit.rank}Lv${unit.level}${unit.commanderKind === "story" ? "·剧情" : ""} · ${ratio}%`;
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

    return `<section class="card card--compact">
      <header class="card__head"><h2 class="card__title">${ico(titleIcon, "ico ico--sm")}${esc(title)}</h2></header>
      <p class="card__sub">${ico(TERRAIN_ICON[terrainId], "ico ico--xs")}${esc(terrain.name)} · 移 ${terrain.moveCost}${terrain.defense ? ` · ${esc(defenseText(terrain.defense))}` : ""}${occupant ? ` · ${esc(UNIT_TYPES[occupant.type].name)} ${occupant.hp}/${occupant.maxHp}` : " · 无人"}${evac ? " · 撤离带" : ""}${extras}</p>
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
        <h2 class="card__title">${ico(UNIT_ICON[unit.type][unit.faction], "ico ico--sm")}${esc(unit.name)}${unit.keyUnit ? ` ${ico(UI_ICON.keyUnit, "ico ico--xs")}` : ""}</h2>
        <span class="tag ${isMine ? "tag--player" : "tag--enemy"}">${esc(factionLabel(unit.faction))}</span>
      </header>
      <p class="card__sub">${esc(def.name)} · ${esc(unit.rank)} Lv.${unit.level}${unit.commanderKind === "story" ? " · 剧情" : unit.commanderKind === "companion" ? " · 伴随" : ""} · ${esc(terrain)} · ${unit.hp}/${unit.maxHp}</p>
      <p class="card__equipment">${esc(unit.equipment)} · 统${unit.stats.leadership} 智${unit.stats.intellect} 武${unit.stats.might} 耐${unit.stats.stamina} 敏${unit.stats.agility}</p>
      ${actions}
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
          <h3>伴随将领</h3>
          <ul class="sheet__roster">
            ${state.campaign.roster
              .map(
                (unit) =>
                  `<li>${ico(UNIT_ICON[unit.type].player, "ico ico--sm")}<span>${esc(unit.name)}${unit.keyUnit ? " · 主角" : " · 伴随"}</span><span>${esc(unit.rank)} Lv.${unit.level} · ${esc(WEAPONS[unit.weapon].name)} · 武${unit.stats.might}</span></li>`,
              )
              .join("")}
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
