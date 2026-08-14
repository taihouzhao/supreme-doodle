import { suggestBattleAction } from "../battle/engine";
import { renderTextGrid } from "./text-grid";
import { currentLocation, knownLocationList, sceneInteractables } from "./scene";
import { ITEM_LABELS, STRINGS } from "../content/strings";
import { lianchengContent } from "../content/liancheng";
import { dispatch } from "../core/dispatch";
import { createInitialWorld } from "../core/state";
import type { GameAction, WorldState } from "../core/types";

const content = lianchengContent;
let world: WorldState = createInitialWorld(content, 1);
const log: string[] = ["这是公开攻略重建的文本壳，不是原作导入，也还没有原版贴图。"];

export function mountPlayShell(root: HTMLElement): void {
  root.innerHTML = "";
  const shell = document.createElement("main");
  shell.className = "shell";
  root.append(shell);
  draw(shell);

  shell.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest("button[data-action]");
    if (!(button instanceof HTMLButtonElement)) return;
    const raw = button.dataset.action;
    if (!raw) return;
    const action = JSON.parse(raw) as GameAction;
    apply(shell, action);
  });
}

function apply(shell: HTMLElement, action: GameAction): void {
  const result = dispatch(world, action, content);
  world = result.state;
  for (const id of result.presentation.dialogue) {
    log.push(STRINGS[id] ?? id);
  }
  if (result.presentation.dialogue.length === 0 && result.presentation.animation.length > 0) {
    log.push(result.presentation.animation.at(-1) ?? "");
  }
  draw(shell);
}

function draw(shell: HTMLElement): void {
  const location = currentLocation(world, content);
  const title = location ? `${location.title}（${location.worldX},${location.worldY}）` : world.locationId;
  const items = Object.entries(world.inventory)
    .map(([id, qty]) => `${ITEM_LABELS[id] ?? id}×${qty}`)
    .join("、");
  const people = sceneInteractables(world, content);
  const places = knownLocationList(world, content);

  shell.innerHTML = `
    <p class="shell-banner">攻略重建 / 无原作资源 · 品德 ${world.moral} · 天书 ${world.heavenBooks.length}/14</p>
    <h1>金庸群侠传</h1>
    <p class="lede">${title}</p>
    <pre class="grid" aria-label="状态">${escapeHtml(renderTextGrid(world))}</pre>
    <p class="inv">行囊：${escapeHtml(items || "空")}</p>
    <section>
      <h2>已知道的地方</h2>
      <div class="row">
        ${places
          .map((place) =>
            actionButton(`${place.title} ${place.worldX},${place.worldY}`, {
              type: "GO_TO",
              locationId: place.id,
            }),
          )
          .join("")}
      </div>
    </section>
    ${world.battle?.result === "ongoing" ? battlePanel() : interactPanel(people)}
    <section>
      <h2>记录</h2>
      <ul class="log">${log
        .slice(-12)
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join("")}</ul>
    </section>
    <nav class="links">
      <a href="./index.html">返回说明页</a>
      <a href="../games/index.html">游戏目录</a>
    </nav>
  `;
}

function interactPanel(people: ReturnType<typeof sceneInteractables>): string {
  const talks = people.filter((entry) => entry.kind === "npc");
  const objects = people.filter((entry) => entry.kind === "object");
  const poetry = (world.inventory.tang_poetry ?? 0) > 0;
  return `
    <section>
      <h2>交谈</h2>
      <div class="row">
        ${talks.map((entry) => actionButton(labelOf(entry.id), { type: "TALK", actorId: entry.id })).join("") || "<p class='muted'>没有可交谈的人。</p>"}
      </div>
    </section>
    <section>
      <h2>搜查</h2>
      <div class="row">
        ${objects.map((entry) => actionButton(labelOf(entry.id), { type: "INTERACT", targetId: entry.id })).join("") || "<p class='muted'>没有可搜查的物件。</p>"}
      </div>
    </section>
    ${
      poetry
        ? `<section><h2>使用唐诗选辑</h2><div class="row">${objects
            .map((entry) =>
              actionButton(`对${labelOf(entry.id)}使用`, {
                type: "USE_ITEM",
                itemId: "tang_poetry",
                targetId: entry.id,
              }),
            )
            .join("")}</div></section>`
        : ""
    }
  `;
}

function battlePanel(): string {
  const suggestion = suggestBattleAction(world);
  return `
    <section>
      <h2>战斗（公式未对照原版）</h2>
      <div class="row">
        ${suggestion ? actionButton("按当前格行动", suggestion) : ""}
      </div>
    </section>
  `;
}

function actionButton(label: string, action: GameAction): string {
  return `<button type="button" data-action='${JSON.stringify(action)}'>${escapeHtml(label)}</button>`;
}

function labelOf(id: string): string {
  const labels: Record<string, string> = {
    home_chest: "箱柜",
    waiter: "店小二",
    inn_crowd: "客栈闲人",
    nanxian: "南贤",
    nanxian_cabinet: "柜子",
    nanxian_mirror: "镜子",
    cave_trail: "南面隐径",
    cave_poetry: "洞中书册",
    diyun_cell: "牢房",
    diyun: "狄云",
    beichou: "北丑",
    basin: "清水盆",
    statue_back: "佛像背后",
  };
  return labels[id] ?? id;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
