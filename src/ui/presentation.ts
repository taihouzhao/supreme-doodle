import { findPath } from "../core/grid";
import type { GameEvent, GameState, Vec2 } from "../core/types";

export interface VisualFrame {
  busy: boolean;
  /** 连续棋盘坐标（格心插值） */
  unitPositions: Record<string, { x: number; y: number }>;
  /** 覆盖显示用的当前生命 */
  hpDisplay: Record<string, number>;
  /** 结算后已死亡但仍需绘制的单位（交战动画期间） */
  lingerUnits: Record<string, { hp: number; alpha: number }>;
  /** 溃散飘字 */
  routBurst: { unitId: string; text: string; alpha: number } | null;
  impact: { x: number; y: number; text: string; alpha: number } | null;
  impactUnitId: string | null;
  strikeLine: { fromId: string; toId: string; alpha: number } | null;
  trail: { x: number; y: number; alpha: number }[];
  flashUnitId: string | null;
}

type MoveClip = {
  kind: "move";
  unitId: string;
  path: Vec2[];
  duration: number;
};

type AttackClip = {
  kind: "attack";
  attackerId: string;
  defenderId: string;
  damage: number;
  counterDamage: number;
  defenderHpFrom: number;
  defenderHpTo: number;
  attackerHpFrom: number;
  attackerHpTo: number;
  defenderDies: boolean;
  attackerDies: boolean;
  duration: number;
};

export type FxClip = MoveClip | AttackClip;

function idleFrame(): VisualFrame {
  return {
    busy: false,
    unitPositions: {},
    hpDisplay: {},
    lingerUnits: {},
    routBurst: null,
    impact: null,
    impactUnitId: null,
    strikeLine: null,
    trail: [],
    flashUnitId: null,
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hpBeforeDamage(currentHp: number, damage: number): number {
  if (damage <= 0) return currentHp;
  return Math.max(damage, currentHp + damage);
}

/**
 * 把规则事件编成表现片段。`state` 为结算后的状态；路径在其上按 from→to 重建。
 */
export function clipsFromEvents(state: GameState, events: GameEvent[]): FxClip[] {
  const clips: FxClip[] = [];
  let index = 0;

  for (const event of events) {
    const scale = index === 0 ? 1 : 0.6;
    if (event.type === "moved" && event.cost > 0) {
      const unit = state.units.find((u) => u.id === event.unitId);
      if (!unit) continue;
      const path = findPath(state, unit, event.to, event.from) ?? [event.from, event.to];
      const duration = Math.min(800, Math.max(180, (path.length - 1) * 140)) * scale;
      clips.push({ kind: "move", unitId: event.unitId, path, duration });
      index += 1;
    } else if (event.type === "attacked") {
      const attacker = state.units.find((u) => u.id === event.attackerId);
      const defender = state.units.find((u) => u.id === event.defenderId);
      if (!attacker || !defender) continue;
      const defenderDies = !defender.alive;
      const attackerDies = !attacker.alive;
      const defenderHpTo = defenderDies ? 0 : defender.hp;
      const attackerHpTo = attackerDies ? 0 : attacker.hp;
      const defenderHpFrom = hpBeforeDamage(defenderHpTo, event.damage);
      const attackerHpFrom = hpBeforeDamage(attackerHpTo, event.counterDamage);
      const hasCounter = event.counterDamage > 0;
      // 有击溃时多留溃散展示阶段
      const deathPad = defenderDies || attackerDies ? 1.35 : 1;
      const duration = Math.min(2200, (hasCounter ? 1600 : 1100) * scale * deathPad);
      clips.push({
        kind: "attack",
        attackerId: event.attackerId,
        defenderId: event.defenderId,
        damage: event.damage,
        counterDamage: event.counterDamage,
        defenderHpFrom,
        defenderHpTo,
        attackerHpFrom,
        attackerHpTo,
        defenderDies,
        attackerDies,
        duration,
      });
      index += 1;
    }
  }

  return clips;
}

export class Presentation {
  private queue: FxClip[] = [];
  private raf = 0;
  private frame: VisualFrame = idleFrame();
  private readonly onChange: () => void;
  private readonly onIdle: () => void;

  constructor(onChange: () => void, onIdle: () => void) {
    this.onChange = onChange;
    this.onIdle = onIdle;
  }

  get busy(): boolean {
    return this.frame.busy || this.queue.length > 0 || this.raf !== 0;
  }

  get visual(): VisualFrame {
    return this.frame;
  }

  reset(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.queue = [];
    this.frame = idleFrame();
  }

  enqueue(clips: FxClip[]): void {
    if (clips.length === 0) {
      this.onIdle();
      return;
    }
    this.queue.push(...clips);
    if (!this.raf) this.kick();
  }

  private kick(): void {
    const clip = this.queue.shift();
    if (!clip) {
      this.frame = idleFrame();
      this.raf = 0;
      this.onChange();
      this.onIdle();
      return;
    }
    this.frame = { ...idleFrame(), busy: true };
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / Math.max(1, clip.duration));
      if (clip.kind === "move") this.applyMove(clip, t);
      else this.applyAttack(clip, t);
      this.onChange();
      if (t < 1) {
        this.raf = requestAnimationFrame(tick);
      } else {
        this.raf = 0;
        this.kick();
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  private applyMove(clip: MoveClip, t: number): void {
    const path = clip.path;
    if (path.length === 0) return;
    const eased = easeInOut(t);
    const segments = Math.max(1, path.length - 1);
    const cursor = eased * segments;
    const i = Math.min(segments - 1, Math.floor(cursor));
    const local = cursor - i;
    const a = path[i]!;
    const b = path[i + 1] ?? a;
    this.frame.unitPositions = {
      [clip.unitId]: { x: lerp(a.x, b.x, local), y: lerp(a.y, b.y, local) },
    };
    const trail: VisualFrame["trail"] = [];
    for (let p = 0; p <= i; p += 1) {
      const tile = path[p]!;
      trail.push({ x: tile.x, y: tile.y, alpha: 0.18 + 0.32 * (1 - t) });
    }
    this.frame.trail = trail;
    this.frame.busy = true;
  }

  private applyAttack(clip: AttackClip, t: number): void {
    const hasCounter = clip.counterDamage > 0;
    const hasDeath = clip.defenderDies || clip.attackerDies;
    // 时间轴：闪光 → 主伤害掉血 → 反击掉血 → 溃散淡出
    const phaseFlash = 0.12;
    const phaseMainEnd = hasCounter ? 0.48 : hasDeath ? 0.55 : 0.85;
    const phaseCounterEnd = hasCounter ? (hasDeath ? 0.72 : 0.92) : phaseMainEnd;
    const phaseRoutStart = hasDeath ? phaseCounterEnd : 1;

    this.frame.busy = true;
    this.frame.flashUnitId = t < phaseFlash ? clip.attackerId : null;
    this.frame.hpDisplay = {};
    this.frame.lingerUnits = {};
    this.frame.routBurst = null;

    // 死亡单位全程留影，直到溃散阶段淡出
    const lingerAlpha = (dies: boolean, done: boolean) => {
      if (!dies) return 1;
      if (t < phaseRoutStart) return 1;
      if (done) return 0;
      return Math.max(0, 1 - (t - phaseRoutStart) / Math.max(0.001, 1 - phaseRoutStart));
    };

    if (t < phaseMainEnd) {
      this.frame.strikeLine = {
        fromId: clip.attackerId,
        toId: clip.defenderId,
        alpha:
          t < phaseFlash
            ? t / phaseFlash
            : Math.max(0, 1 - (t - phaseFlash) / Math.max(0.001, phaseMainEnd - phaseFlash)),
      };
    } else if (t < phaseCounterEnd && hasCounter) {
      this.frame.strikeLine = {
        fromId: clip.defenderId,
        toId: clip.attackerId,
        alpha: Math.max(
          0,
          1 - (t - phaseMainEnd) / Math.max(0.001, phaseCounterEnd - phaseMainEnd),
        ),
      };
    } else {
      this.frame.strikeLine = null;
    }

    if (t >= phaseFlash && t < phaseMainEnd) {
      const local = (t - phaseFlash) / Math.max(0.001, phaseMainEnd - phaseFlash);
      const hp = lerp(clip.defenderHpFrom, clip.defenderHpTo, easeInOut(local));
      this.frame.hpDisplay[clip.defenderId] = hp;
      if (clip.defenderDies) {
        this.frame.lingerUnits[clip.defenderId] = { hp, alpha: 1 };
      }
      this.frame.impact = {
        x: 0,
        y: 0,
        text: `-${clip.damage}`,
        alpha: local < 0.75 ? 1 : 1 - (local - 0.75) / 0.25,
      };
      this.frame.impactUnitId = clip.defenderId;
    } else if (t >= phaseMainEnd && t < phaseCounterEnd && hasCounter) {
      const local = (t - phaseMainEnd) / Math.max(0.001, phaseCounterEnd - phaseMainEnd);
      this.frame.hpDisplay[clip.defenderId] = clip.defenderHpTo;
      if (clip.defenderDies) {
        this.frame.lingerUnits[clip.defenderId] = {
          hp: 0,
          alpha: lingerAlpha(true, false),
        };
      }
      const hp = lerp(clip.attackerHpFrom, clip.attackerHpTo, easeInOut(local));
      this.frame.hpDisplay[clip.attackerId] = hp;
      if (clip.attackerDies) {
        this.frame.lingerUnits[clip.attackerId] = { hp, alpha: 1 };
      }
      this.frame.impact = {
        x: 0,
        y: 0,
        text: `-${clip.counterDamage}`,
        alpha: local < 0.75 ? 1 : 1 - (local - 0.75) / 0.25,
      };
      this.frame.impactUnitId = clip.attackerId;
    } else {
      this.frame.hpDisplay[clip.defenderId] = clip.defenderHpTo;
      if (hasCounter) this.frame.hpDisplay[clip.attackerId] = clip.attackerHpTo;
      this.frame.impact = null;
      this.frame.impactUnitId = null;

      if (clip.defenderDies) {
        const alpha = lingerAlpha(true, t >= 1);
        this.frame.lingerUnits[clip.defenderId] = { hp: 0, alpha };
        if (t >= phaseRoutStart) {
          this.frame.routBurst = {
            unitId: clip.defenderId,
            text: "溃散",
            alpha: Math.min(1, (t - phaseRoutStart) / 0.15) * alpha,
          };
        }
      }
      if (clip.attackerDies) {
        const alpha = lingerAlpha(true, t >= 1);
        this.frame.lingerUnits[clip.attackerId] = { hp: 0, alpha };
        if (t >= phaseRoutStart && !this.frame.routBurst) {
          this.frame.routBurst = {
            unitId: clip.attackerId,
            text: "溃散",
            alpha: Math.min(1, (t - phaseRoutStart) / 0.15) * alpha,
          };
        }
      }
    }
  }
}
