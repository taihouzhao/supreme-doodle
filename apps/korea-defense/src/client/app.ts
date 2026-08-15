import { DEFENSE_VARIANT_LABELS, TOWER_DEFINITIONS } from "../content/wonjeong";
import { calculateStars, createDefenseState, dispatchCommand, getTowerDefinition, snapshot, stepSimulation } from "../core/engine";
import { applyMissionResult, buyArmoryUpgrade, loadProfile, resetArmory, saveProfile, type DefenseProfileV1 } from "../core/profile";
import type { DefenseCommand, DefenseMode, DefenseState, TowerType } from "../core/types";
import { WONJEONG_MISSION } from "../content/wonjeong";
import { SoundBank } from "./audio";
import type { PresentationState } from "./renderer";
import { DefenseScene } from "./scene";

const rootElement = document.querySelector<HTMLElement>("#app");
if (!rootElement) throw new Error("缺少 #app");
const root: HTMLElement = rootElement;

type View = "home" | "mission";

export class DefenseApp {
  private profile: DefenseProfileV1 = loadProfile();
  private state: DefenseState | null = null;
  private scene: DefenseScene | null = null;
  private sound = new SoundBank();
  private selectedTowerType: TowerType = "infantry";
  private selectedNodeId: string | null = null;
  private selectedTowerId: string | null = null;
  private tutorialStep = 0;
  private view: View = "home";
  private resultRecorded = false;
  private selectionSignature = "";
  private frameHandle = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private lastProjectileEffectId = 0;
  private lastHitEffectId = 0;
  private lastLeaks = 0;

  mount(): void {
    this.renderHome();
    this.bindHomeEvents();
  }

  private renderHome(): void {
    this.view = "home";
    this.scene?.dispose();
    this.scene = null;
    root.innerHTML = `
      <main class="defense-home">
        <header class="home-hero">
          <div class="eyebrow"><img src="/assets/ui/faction-pva.png" alt="志愿军" /> 大杰游戏 · 防御战试作</div>
          <h1>决战朝鲜：<em>塔防</em></h1>
          <p>温井防御战 · 固定路线、部署火力、守住指挥所</p>
        </header>
        <section class="brief-card" aria-labelledby="brief-title">
          <div class="brief-card__heading"><div><span class="kicker">垂直切片 01</span><h2 id="brief-title">温井防御战</h2></div><img src="/assets/ui/weather-snow.svg" alt="雪夜" /></div>
          <p>${WONJEONG_MISSION.historicalNote}</p>
          <div class="brief-meta"><span>6 波敌军</span><span>20 Hz 固定模拟</span><span>离线存档</span></div>
        </section>
        <section class="mode-grid" aria-label="选择难度">
          <button class="mode-card" data-action="start-normal">
            <span class="mode-card__label">普通模式</span><strong>温井守备</strong><small>120 部署点 · 六波推进</small><b>${this.profile.stars.normal} / 3 星</b>
          </button>
          <button class="mode-card" data-action="start-hard" ${this.profile.hardUnlocked ? "" : "disabled"}>
            <span class="mode-card__label">困难模式</span><strong>温井决战</strong><small>${this.profile.hardUnlocked ? "新增支路 · 混合编成 · 更短间隔" : "先在普通模式完成任务解锁"}</small><b>${this.profile.stars.hard} / 3 星</b>
          </button>
        </section>
        <section class="armory-card" aria-labelledby="armory-title">
          <div class="section-heading"><div><span class="kicker">局外军械</span><h2 id="armory-title">温井军械库</h2></div><strong class="medal-count">${this.profile.medals} 枚勋章</strong></div>
          <div class="armory-grid">${this.armoryMarkup()}</div>
          <div class="armory-actions"><button data-action="reset-armory" class="secondary-button">免费重置</button><span>每级消耗 1 枚勋章；伤害、射程、价格依次强化。</span></div>
        </section>
        <section class="settings-card" aria-label="游戏设置"><span class="kicker">设置</span><label>画质 <select data-action="quality"><option value="high" ${this.profile.settings.quality === "high" ? "selected" : ""}>高</option><option value="low" ${this.profile.settings.quality === "low" ? "selected" : ""}>低</option></select></label><label class="check-label"><input type="checkbox" data-action="sound" ${this.profile.settings.soundEnabled ? "checked" : ""} /> 音效</label><label>音量 <input type="range" min="0" max="1" step="0.05" value="${this.profile.settings.volume}" data-action="volume" /></label></section>
        <p class="home-footnote">本作是根据温井地形与参战编成进行的塔防玩法改编，不宣称复原历史胜负。建议横屏游玩，也支持竖屏滚动控制。</p>
      </main>`;
  }

  private armoryMarkup(): string {
    return (Object.keys(TOWER_DEFINITIONS) as TowerType[]).map((type) => {
      const definition = TOWER_DEFINITIONS[type];
      const levels = this.profile.armory[type];
      const next = levels.findIndex((level) => level === 0);
      const label = next < 0 ? "已满级" : next === 0 ? "伤害 +8%" : next === 1 ? "射程 +8%" : "部署价 -10%";
      return `<article class="armory-row"><img src="${definition.icon}" alt="" /><div><strong>${definition.name}</strong><span>${levels.map((value) => `<i class="${value ? "is-on" : ""}"></i>`).join("")}</span></div><button data-action="buy-armory" data-type="${type}" ${next < 0 || this.profile.medals < 1 ? "disabled" : ""}>${label}</button></article>`;
    }).join("");
  }

  private bindHomeEvents(): void {
    root.querySelector<HTMLButtonElement>('[data-action="start-normal"]')?.addEventListener("click", () => this.startMission("normal"));
    root.querySelector<HTMLButtonElement>('[data-action="start-hard"]')?.addEventListener("click", () => this.startMission("hard"));
    root.querySelector<HTMLButtonElement>('[data-action="reset-armory"]')?.addEventListener("click", () => {
      resetArmory(this.profile);
      saveProfile(this.profile);
      this.renderHome();
      this.bindHomeEvents();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-action="buy-armory"]').forEach((button) => button.addEventListener("click", () => {
      const type = button.dataset.type as TowerType | undefined;
      if (!type) return;
      if (buyArmoryUpgrade(this.profile, type)) {
        saveProfile(this.profile);
        this.renderHome();
        this.bindHomeEvents();
      }
    }));
    root.querySelector<HTMLSelectElement>('[data-action="quality"]')?.addEventListener("change", (event) => {
      const value = (event.target as HTMLSelectElement).value;
      this.profile.settings.quality = value === "low" ? "low" : "high";
      saveProfile(this.profile);
    });
    root.querySelector<HTMLInputElement>('[data-action="sound"]')?.addEventListener("change", (event) => {
      this.profile.settings.soundEnabled = (event.target as HTMLInputElement).checked;
      saveProfile(this.profile);
    });
    root.querySelector<HTMLInputElement>('[data-action="volume"]')?.addEventListener("input", (event) => {
      this.profile.settings.volume = Number((event.target as HTMLInputElement).value);
      saveProfile(this.profile);
    });
  }

  private startMission(mode: DefenseMode): void {
    if (mode === "hard" && !this.profile.hardUnlocked) return;
    this.view = "mission";
    const seed = Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
    this.state = createDefenseState({ mode, armory: this.profile.armory, seed });
    this.resultRecorded = false;
    this.selectedNodeId = null;
    this.selectedTowerId = null;
    this.selectedTowerType = "infantry";
    this.selectionSignature = "";
    this.lastProjectileEffectId = 0;
    this.lastHitEffectId = 0;
    this.lastLeaks = 0;
    this.sound.configure(this.profile.settings.soundEnabled, this.profile.settings.volume);
    root.innerHTML = this.missionMarkup(mode);
    const canvasHost = root.querySelector<HTMLElement>("[data-region=\"battlefield\"]");
    if (!canvasHost) throw new Error("缺少战场容器");
    this.scene = new DefenseScene(canvasHost, WONJEONG_MISSION, { quality: this.profile.settings.quality, onMapSelect: (selection) => this.selectMap(selection?.nodeId ?? null) });
    this.bindMissionEvents();
    if (!this.profile.tutorialCompleted) this.showTutorial();
    this.renderMission();
    this.lastFrame = performance.now();
    this.accumulator = 0;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = requestAnimationFrame((now) => this.frame(now));
  }

  private missionMarkup(mode: DefenseMode): string {
    const variant = DEFENSE_VARIANT_LABELS[this.state?.variant ?? "road-raids"];
    return `
      <main class="defense-game" data-mode="${mode}">
        <header class="game-topbar">
          <div class="game-title"><span class="eyebrow">温井防御战 · ${mode === "hard" ? "困难" : "普通"} · ${variant.name}</span><h1>${WONJEONG_MISSION.name}</h1></div>
          <div class="topbar-stats"><span><img src="/assets/ui/faction-pva.png" alt="" />指挥所 <b data-testid="integrity">100</b></span><span>部署点 <b data-testid="points">120</b></span><span>时间 <b data-testid="time">00:00</b></span></div>
          <button class="icon-button" data-action="back-home" aria-label="返回军械库">×</button>
        </header>
        <section class="game-layout">
          <div class="battlefield-wrap"><div class="battlefield" data-region="battlefield"></div><div class="battlefield-caption"><span>北 ↑</span><span>固定路线 · 点击金色节点部署</span></div></div>
          <aside class="control-panel" aria-label="部署与战斗控制">
            <div class="wave-card"><div><span class="kicker">防线状态</span><strong data-testid="wave-status">准备开始</strong><small data-testid="variant-copy">${variant.description}</small></div><span class="wave-count" data-testid="wave-count">0 / 6</span></div>
            <div class="integrity-bar"><span data-testid="integrity-bar" style="width:100%"></span></div>
            <p class="notice" data-testid="notice" role="status" aria-live="polite">选择部署点，或开始第一波。</p>
            <section class="deploy-section"><div class="section-heading"><h2>部署火力</h2><span class="muted">点选节点后部署</span></div><div class="tower-list">${this.deployMarkup()}</div><div class="node-list" aria-label="部署节点">${WONJEONG_MISSION.buildNodes.map((node) => `<button data-action="select-node" data-node-id="${node.id}">${node.label}</button>`).join("")}</div></section>
            <section class="selected-card" data-testid="selection"><span class="muted">未选择节点</span><strong>点击战场上的金色节点</strong></section>
            <div class="battle-controls"><button class="primary-button" data-action="start-wave">开始下一波</button><button class="secondary-button" data-action="pause">暂停</button><div class="speed-buttons"><button data-action="speed" data-speed="1" class="is-active">1×</button><button data-action="speed" data-speed="2">2×</button></div></div>
            <p class="mobile-hint">拖动战场平移，滚轮缩放。暂停时不会计入三星计时。</p>
          </aside>
        </section>
        <div class="tutorial" data-region="tutorial" hidden><div class="tutorial-card"><span class="kicker">首次出击</span><h2 data-testid="tutorial-title">先选择部署点</h2><p data-testid="tutorial-copy">点击战场上的金色节点，先选定要守住的道路或高地。教学可随时跳过。</p><div><button class="secondary-button" data-action="skip-tutorial">跳过教学</button><button class="primary-button" data-action="next-tutorial">知道了，继续</button></div></div></div>
        <div class="result-overlay" data-region="result" hidden><div class="result-card"><img data-testid="result-icon" src="/assets/ui/result-win.png" alt="" /><span class="kicker" data-testid="result-kicker">防线结果</span><h2 data-testid="result-title"></h2><p data-testid="result-copy"></p><div class="result-stars" data-testid="result-stars"></div><button class="primary-button" data-action="play-again">返回军械库</button></div></div>
      </main>`;
  }

  private deployMarkup(): string {
    return (Object.keys(TOWER_DEFINITIONS) as TowerType[]).map((type) => {
      const definition = getTowerDefinition(type, 1, this.profile.armory);
      return `<button class="tower-card ${type === this.selectedTowerType ? "is-selected" : ""}" data-action="select-tower" data-type="${type}"><img src="${definition.icon}" alt="" /><span><strong>${definition.name}</strong><small>${definition.description}</small></span><b>${definition.cost}</b></button>`;
    }).join("");
  }

  private bindMissionEvents(): void {
    root.querySelectorAll<HTMLButtonElement>('[data-action="select-tower"]').forEach((button) => button.addEventListener("click", () => {
      const type = button.dataset.type as TowerType | undefined;
      if (!type) return;
      this.selectedTowerType = type;
      root.querySelectorAll('[data-action="select-tower"]').forEach((item) => item.classList.toggle("is-selected", item === button));
      this.renderSelection();
    }));
    root.querySelectorAll<HTMLButtonElement>('[data-action="select-node"]').forEach((button) => button.addEventListener("click", () => {
      this.selectMap(button.dataset.nodeId ?? null);
    }));
    root.querySelector<HTMLButtonElement>('[data-action="start-wave"]')?.addEventListener("click", () => this.command({ type: "START_WAVE" }));
    root.querySelector<HTMLButtonElement>('[data-action="pause"]')?.addEventListener("click", () => this.command({ type: "PAUSE" }));
    root.querySelectorAll<HTMLButtonElement>('[data-action="speed"]').forEach((button) => button.addEventListener("click", () => {
      const speed = Number(button.dataset.speed) as 1 | 2;
      this.command({ type: "SET_SPEED", speed });
    }));
    root.querySelector<HTMLButtonElement>('[data-action="back-home"]')?.addEventListener("click", () => this.goHome());
    root.querySelector<HTMLButtonElement>('[data-action="skip-tutorial"]')?.addEventListener("click", () => this.finishTutorial());
    root.querySelector<HTMLButtonElement>('[data-action="next-tutorial"]')?.addEventListener("click", () => this.advanceTutorial());
    root.querySelector<HTMLButtonElement>('[data-action="play-again"]')?.addEventListener("click", () => this.goHome());
  }

  private selectMap(nodeId: string | null): void {
    this.selectedNodeId = nodeId;
    const tower = nodeId ? this.state?.towers.find((candidate) => candidate.nodeId === nodeId) : undefined;
    this.selectedTowerId = tower?.id ?? null;
    this.renderSelection();
  }

  private renderSelection(): void {
    const selection = root.querySelector<HTMLElement>('[data-testid="selection"]');
    if (!selection || !this.state) return;
    if (!this.selectedNodeId) {
      selection.innerHTML = `<span class="muted">未选择节点</span><strong>点击战场上的金色节点</strong>`;
      return;
    }
    const node = WONJEONG_MISSION.buildNodes.find((candidate) => candidate.id === this.selectedNodeId);
    const tower = this.state.towers.find((candidate) => candidate.id === this.selectedTowerId);
    const signature = `${this.selectedNodeId ?? ""}|${this.selectedTowerType}|${tower?.id ?? ""}|${tower?.level ?? 0}|${tower?.invested ?? 0}`;
    if (signature === this.selectionSignature) return;
    this.selectionSignature = signature;
    if (!tower) {
      const definition = getTowerDefinition(this.selectedTowerType, 1, this.profile.armory);
      selection.innerHTML = `<span class="muted">${node?.label ?? "部署点"}</span><strong>部署${definition.name}</strong><button class="primary-button compact" data-action="deploy-selected">部署 · ${definition.cost}</button>`;
      selection.querySelector<HTMLButtonElement>('[data-action="deploy-selected"]')?.addEventListener("click", () => this.command({ type: "DEPLOY", towerType: this.selectedTowerType, nodeId: this.selectedNodeId ?? "" }));
      return;
    }
    const nextLevel = tower.level < 3 ? (tower.level + 1) as 2 | 3 : null;
    const upgradeButton = nextLevel ? `<button class="primary-button compact" data-action="upgrade-selected">升级到 ${nextLevel} 级</button>` : `<span class="muted">已达到三级</span>`;
    selection.innerHTML = `<span class="muted">${node?.label ?? "部署点"}</span><strong>${TOWER_DEFINITIONS[tower.type].name} · ${tower.level} 级</strong><div class="selection-actions">${upgradeButton}<button class="secondary-button compact" data-action="sell-selected">撤回 · 返还 ${Math.floor(tower.invested * 0.7)}</button></div>`;
    selection.querySelector<HTMLButtonElement>('[data-action="upgrade-selected"]')?.addEventListener("click", () => this.command({ type: "UPGRADE", towerId: tower.id }));
    selection.querySelector<HTMLButtonElement>('[data-action="sell-selected"]')?.addEventListener("click", () => this.command({ type: "SELL", towerId: tower.id }));
  }

  private command(command: DefenseCommand): void {
    if (!this.state) return;
    const beforeKills = this.state.kills;
    const beforeLeaks = this.state.leaks;
    const accepted = dispatchCommand(this.state, command);
    if (!accepted) return;
    if (command.type === "DEPLOY") {
      this.selectedTowerId = this.state.towers.find((tower) => tower.nodeId === command.nodeId)?.id ?? null;
      this.sound.play("deploy");
    }
    if (command.type === "START_WAVE") this.sound.play("shot");
    if (this.state.kills > beforeKills) this.sound.play("hit");
    if (this.state.leaks > beforeLeaks) this.sound.play("leak");
    this.renderMission();
  }

  private renderMission(): void {
    if (!this.state) return;
    const current = snapshot(this.state);
    const integrity = root.querySelector<HTMLElement>('[data-testid="integrity"]');
    const points = root.querySelector<HTMLElement>('[data-testid="points"]');
    const time = root.querySelector<HTMLElement>('[data-testid="time"]');
    const waveStatus = root.querySelector<HTMLElement>('[data-testid="wave-status"]');
    const waveCount = root.querySelector<HTMLElement>('[data-testid="wave-count"]');
    const notice = root.querySelector<HTMLElement>('[data-testid="notice"]');
    const bar = root.querySelector<HTMLElement>('[data-testid="integrity-bar"]');
    if (integrity) integrity.textContent = `${current.commandPostIntegrity}`;
    if (points) points.textContent = `${current.deploymentPoints}`;
    if (time) time.textContent = this.formatTime(current.simulationSeconds);
    if (waveStatus) waveStatus.textContent = current.activeWave ? `第 ${current.currentWave} 波 · ${WONJEONG_MISSION.waves[current.currentWave - 1]?.label ?? "推进中"}` : current.result === "playing" && current.intermissionTicks > 0 ? `下一波将在 ${Math.ceil(current.intermissionTicks / 20)} 秒后自动开始` : current.result === "playing" ? "准备下一波" : current.result === "won" ? "防线守住" : "指挥所失守";
    if (waveCount) waveCount.textContent = `${current.currentWave} / ${WONJEONG_MISSION.waves.length}`;
    if (notice) notice.textContent = current.notice;
    if (bar) bar.style.width = `${current.commandPostIntegrity}%`;
    root.querySelector<HTMLButtonElement>('[data-action="pause"]')?.replaceChildren(document.createTextNode(current.paused ? "继续" : "暂停"));
    root.querySelectorAll<HTMLButtonElement>('[data-action="speed"]').forEach((button) => button.classList.toggle("is-active", Number(button.dataset.speed) === current.speed));
    const start = root.querySelector<HTMLButtonElement>('[data-action="start-wave"]');
    if (start) start.disabled = Boolean(current.activeWave) || current.result !== "playing";
    const newestProjectileId = current.projectiles.at(-1)?.id ?? 0;
    if (newestProjectileId > this.lastProjectileEffectId) {
      this.lastProjectileEffectId = newestProjectileId;
      this.sound.play("shot");
    }
    const newestHitId = current.hitEffects.at(-1)?.id ?? 0;
    if (newestHitId > this.lastHitEffectId) {
      this.lastHitEffectId = newestHitId;
      this.sound.play("hit");
    }
    if (current.leaks > this.lastLeaks) {
      this.lastLeaks = current.leaks;
      this.sound.play("leak");
    }
    this.scene?.render(current, this.presentationState());
    const battlefield = root.querySelector<HTMLElement>('[data-region="battlefield"]');
    const resources = this.scene?.resourceCounts();
    const diagnostics = this.scene?.diagnostics();
    if (battlefield && resources && diagnostics) {
      battlefield.dataset.resourceGeometries = `${resources.geometries}`;
      battlefield.dataset.resourceTextures = `${resources.textures}`;
      battlefield.dataset.renderer = diagnostics.renderer;
      battlefield.dataset.resourceAssets = `${diagnostics.loadedAssets}`;
      battlefield.dataset.staticCacheBuilds = `${diagnostics.staticCacheBuilds}`;
      battlefield.dataset.failedAssets = `${diagnostics.failedAssets.length}`;
      battlefield.dataset.activeEnemies = `${current.enemies.length}`;
      battlefield.dataset.activeTowers = `${current.towers.length}`;
    }
    this.renderSelection();
    if (!this.resultRecorded && current.result !== "playing") this.showResult(current.result);
  }

  private presentationState(): PresentationState {
    return {
      selectedNodeId: this.selectedNodeId,
      selectedTowerId: this.selectedTowerId,
      selectedTowerType: this.selectedTowerType,
      mode: this.state?.mode ?? "normal",
      variant: this.state?.variant ?? "road-raids",
      quality: this.profile.settings.quality,
      armory: this.profile.armory,
      reducedMotion: typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    };
  }

  private frame(now: number): void {
    if (this.view !== "mission") return;
    const elapsed = Math.min(0.25, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.accumulator += elapsed * 20;
    while (this.accumulator + 1e-9 >= 1) {
      if (this.state) stepSimulation(this.state, 1);
      this.accumulator -= 1;
    }
    this.renderMission();
    this.frameHandle = requestAnimationFrame((next) => this.frame(next));
  }

  private showTutorial(): void {
    this.tutorialStep = 0;
    if (!this.state) return;
    this.state.paused = true;
    const tutorial = root.querySelector<HTMLElement>('[data-region="tutorial"]');
    if (tutorial) tutorial.hidden = false;
  }

  private advanceTutorial(): void {
    const title = root.querySelector<HTMLElement>('[data-testid="tutorial-title"]');
    const copy = root.querySelector<HTMLElement>('[data-testid="tutorial-copy"]');
    if (this.tutorialStep === 0) {
      this.tutorialStep = 1;
      if (title) title.textContent = "部署第一支部队";
      if (copy) copy.textContent = "选择步兵班，再点击部署。步兵射程稳定，适合先守住北线公路。";
      return;
    }
    if (this.tutorialStep === 1) {
      this.tutorialStep = 2;
      if (title) title.textContent = "升级已部署部队";
      if (copy) copy.textContent = "点击已部署的步兵节点，在下方选择升级。二级会提升伤害和射程。";
      return;
    }
    if (this.tutorialStep === 2) {
      this.tutorialStep = 3;
      if (title) title.textContent = "开始第一波";
      if (copy) copy.textContent = "部队会自动瞄准距离终点最近的敌人。点击开始下一波，守住 85% 完整度并在 12 分钟内完成可得三星。";
      return;
    }
    this.finishTutorial();
  }

  private finishTutorial(): void {
    this.profile.tutorialCompleted = true;
    saveProfile(this.profile);
    const tutorial = root.querySelector<HTMLElement>('[data-region="tutorial"]');
    if (tutorial) tutorial.hidden = true;
    if (this.state) this.state.paused = false;
    this.renderMission();
  }

  private showResult(result: "won" | "lost"): void {
    if (!this.state) return;
    this.resultRecorded = true;
    const stars = calculateStars(this.state);
    applyMissionResult(this.profile, this.state.mode, stars);
    saveProfile(this.profile);
    this.sound.play(result === "won" ? "win" : "lose");
    const overlay = root.querySelector<HTMLElement>('[data-region="result"]');
    const title = root.querySelector<HTMLElement>('[data-testid="result-title"]');
    const copy = root.querySelector<HTMLElement>('[data-testid="result-copy"]');
    const starsElement = root.querySelector<HTMLElement>('[data-testid="result-stars"]');
    const icon = root.querySelector<HTMLImageElement>('[data-testid="result-icon"]');
    if (overlay) overlay.hidden = false;
    if (title) title.textContent = result === "won" ? "温井防线守住了" : "指挥所失守";
    if (copy) copy.textContent = result === "won" ? `完整度 ${this.state.commandPostIntegrity}% · 用时 ${this.formatTime(this.state.simulationSeconds)} · 击杀 ${this.state.kills}` : `敌军突破 ${this.state.leaks} 次，指挥所完整度归零。`;
    if (starsElement) starsElement.textContent = result === "won" ? `${"★".repeat(stars.stars)}${"☆".repeat(3 - stars.stars)}` : "☆☆☆";
    if (icon) icon.src = result === "won" ? "/assets/ui/result-win.png" : "/assets/ui/result-lose.png";
  }

  private formatTime(seconds: number): string {
    const total = Math.floor(seconds);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  private goHome(): void {
    cancelAnimationFrame(this.frameHandle);
    this.scene?.dispose();
    this.scene = null;
    this.state = null;
    this.renderHome();
    this.bindHomeEvents();
  }
}
