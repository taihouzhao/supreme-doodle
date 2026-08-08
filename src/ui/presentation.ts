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
  /** 晋升提示 */
  promoteBurst: { unitId: string; text: string; alpha: number; scale: number } | null;
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

type PromoteClip = {
  kind: "promote";
  unitId: string;
  text: string;
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

export type FxClip = MoveClip | AttackClip | PromoteClip;

/**
 * 交战节奏。一次攻击约 3 秒，让瞄准、命中、掉血、反击、溃散各自看得清；
 * 想快进用 `Presentation.setSpeed` / `skip`。
 */
export const FX_TIMING = {
  moveStepMs: 200,
  moveMinMs: 300,
  moveMaxMs: 1200,
  attackBaseMs: 3000,
  attackCounterMs: 3600,
  attackDeathPadMs: 600,
  attackMaxMs: 4800,
  promoteMs: 1400,
  /** 同一批动作里后续片段稍快，避免敌方回合过长 */
  chainedScale: 0.85,
};

function idleFrame(): VisualFrame {
  return {
    busy: false,
    unitPositions: {},
    hpDisplay: {},
    lingerUnits: {},
    routBurst: null,
    promoteBurst: null,
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
    const scale = index === 0 ? 1 : FX_TIMING.chainedScale;
    const isRelocation =
      event.type === "moved" && (event.from.x !== event.to.x || event.from.y !== event.to.y);
    if (event.type === "moved" && isRelocation) {
      const unit = state.units.find((u) => u.id === event.unitId);
      if (!unit) continue;
      const path = findPath(state, unit, event.to, event.from) ?? [event.from, event.to];
      const duration =
        Math.min(
          FX_TIMING.moveMaxMs,
          Math.max(FX_TIMING.moveMinMs, (path.length - 1) * FX_TIMING.moveStepMs),
        ) * scale;
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
      const deathPad = defenderDies || attackerDies ? FX_TIMING.attackDeathPadMs : 0;
      const base = hasCounter ? FX_TIMING.attackCounterMs : FX_TIMING.attackBaseMs;
      const duration = Math.min(FX_TIMING.attackMaxMs, (base + deathPad) * scale);
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
    } else if (event.type === "levelUp") {
      const unit = state.units.find((u) => u.id === event.unitId);
      if (!unit || unit.faction !== "player") continue;
      clips.push({
        kind: "promote",
        unitId: event.unitId,
        text: `晋升 ${event.rank}`,
        duration: FX_TIMING.promoteMs,
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
  private speed = 1;
  private readonly onChange: () => void;
  private readonly onIdle: () => void;

  constructor(onChange: () => void, onIdle: () => void) {
    this.onChange = onChange;
    this.onIdle = onIdle;
  }

  get busy(): boolean {
    return this.frame.busy || this.queue.length > 0 || this.raf !== 0;
  }

  /** 播放倍速；1 为默认节奏 */
  setSpeed(speed: number): void {
    this.speed = Math.max(0.25, speed);
  }

  /** 立即跳到结算结果，丢掉剩余片段 */
  skip(): void {
    if (!this.busy) return;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.queue = [];
    this.frame = idleFrame();
    this.onChange();
    this.onIdle();
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
    const span = Math.max(1, clip.duration / this.speed);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / span);
      if (clip.kind === "move") this.applyMove(clip, t);
      else if (clip.kind === "promote") this.applyPromote(clip, t);
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

  /** 晋升提示：先弹出放大，末段淡出 */
  private applyPromote(clip: PromoteClip, t: number): void {
    this.frame.busy = true;
    const pop = t < 0.25 ? t / 0.25 : 1;
    this.frame.promoteBurst = {
      unitId: clip.unitId,
      text: clip.text,
      alpha: t < 0.75 ? Math.min(1, t / 0.15) : Math.max(0, 1 - (t - 0.75) / 0.25),
      scale: 0.7 + 0.3 * easeInOut(pop),
    };
  }

  private applyAttack(clip: AttackClip, t: number): void {
    const hasCounter = clip.counterDamage > 0;
    const hasDeath = clip.defenderDies || clip.attackerDies;
    const beats = attackBeats(hasCounter, hasDeath);

    this.frame.busy = true;
    this.frame.flashUnitId = t >= beats.aimEnd && t < beats.flashEnd ? clip.attackerId : null;
    this.frame.hpDisplay = {};
    this.frame.lingerUnits = {};
    this.frame.routBurst = null;

    // 死亡单位全程留影，直到溃散阶段淡出
    const lingerAlpha = (done: boolean) => {
      if (t < beats.routStart) return 1;
      if (done) return 0;
      return Math.max(0, 1 - (t - beats.routStart) / Math.max(0.001, 1 - beats.routStart));
    };

    // 射击线：先由攻方指向守方，反击阶段反向
    if (t < beats.mainHoldEnd) {
      const rampIn = Math.min(1, t / Math.max(0.001, beats.aimEnd));
      const fade =
        t < beats.drainEnd
          ? 1
          : Math.max(0, 1 - (t - beats.drainEnd) / Math.max(0.001, beats.mainHoldEnd - beats.drainEnd));
      this.frame.strikeLine = {
        fromId: clip.attackerId,
        toId: clip.defenderId,
        alpha: Math.min(rampIn, fade),
      };
    } else if (hasCounter && t < beats.counterHoldEnd) {
      const local = (t - beats.mainHoldEnd) / Math.max(0.001, beats.counterHoldEnd - beats.mainHoldEnd);
      this.frame.strikeLine = {
        fromId: clip.defenderId,
        toId: clip.attackerId,
        alpha: local < 0.5 ? Math.min(1, local / 0.2) : Math.max(0, 1 - (local - 0.5) / 0.5),
      };
    } else {
      this.frame.strikeLine = null;
    }

    if (t < beats.flashEnd) {
      // 瞄准与命中闪光：还没有掉血
      this.frame.hpDisplay[clip.defenderId] = clip.defenderHpFrom;
      this.frame.impact = null;
      this.frame.impactUnitId = null;
      if (clip.defenderDies) {
        this.frame.lingerUnits[clip.defenderId] = { hp: clip.defenderHpFrom, alpha: 1 };
      }
      return;
    }

    if (t < beats.mainHoldEnd) {
      // 掉血 + 数字停留：数字在血条走完后仍完整显示一段时间
      const drain = Math.min(
        1,
        (t - beats.flashEnd) / Math.max(0.001, beats.drainEnd - beats.flashEnd),
      );
      const hp = lerp(clip.defenderHpFrom, clip.defenderHpTo, easeInOut(drain));
      this.frame.hpDisplay[clip.defenderId] = hp;
      if (clip.defenderDies) this.frame.lingerUnits[clip.defenderId] = { hp, alpha: 1 };
      const holdLocal =
        t < beats.drainEnd
          ? 0
          : (t - beats.drainEnd) / Math.max(0.001, beats.mainHoldEnd - beats.drainEnd);
      this.frame.impact = {
        x: 0,
        y: 0,
        text: `-${clip.damage}`,
        alpha: holdLocal < 0.7 ? 1 : Math.max(0, 1 - (holdLocal - 0.7) / 0.3),
      };
      this.frame.impactUnitId = clip.defenderId;
      return;
    }

    this.frame.hpDisplay[clip.defenderId] = clip.defenderHpTo;

    if (hasCounter && t < beats.counterHoldEnd) {
      const drain = Math.min(
        1,
        (t - beats.mainHoldEnd) / Math.max(0.001, beats.counterDrainEnd - beats.mainHoldEnd),
      );
      const hp = lerp(clip.attackerHpFrom, clip.attackerHpTo, easeInOut(drain));
      this.frame.hpDisplay[clip.attackerId] = hp;
      if (clip.attackerDies) this.frame.lingerUnits[clip.attackerId] = { hp, alpha: 1 };
      if (clip.defenderDies) {
        this.frame.lingerUnits[clip.defenderId] = { hp: 0, alpha: lingerAlpha(false) };
      }
      const holdLocal =
        t < beats.counterDrainEnd
          ? 0
          : (t - beats.counterDrainEnd) /
            Math.max(0.001, beats.counterHoldEnd - beats.counterDrainEnd);
      this.frame.impact = {
        x: 0,
        y: 0,
        text: `-${clip.counterDamage}`,
        alpha: holdLocal < 0.7 ? 1 : Math.max(0, 1 - (holdLocal - 0.7) / 0.3),
      };
      this.frame.impactUnitId = clip.attackerId;
      return;
    }

    if (hasCounter) this.frame.hpDisplay[clip.attackerId] = clip.attackerHpTo;
    this.frame.impact = null;
    this.frame.impactUnitId = null;

    // 溃散阶段：先亮出提示，再淡出留影
    const routLocal = Math.max(0, (t - beats.routStart) / Math.max(0.001, 1 - beats.routStart));
    const burstAlpha = routLocal < 0.6 ? Math.min(1, routLocal / 0.15) : Math.max(0, 1 - (routLocal - 0.6) / 0.4);
    if (clip.defenderDies) {
      this.frame.lingerUnits[clip.defenderId] = { hp: 0, alpha: lingerAlpha(t >= 1) };
      if (t >= beats.routStart) {
        this.frame.routBurst = { unitId: clip.defenderId, text: "溃散", alpha: burstAlpha };
      }
    }
    if (clip.attackerDies) {
      this.frame.lingerUnits[clip.attackerId] = { hp: 0, alpha: lingerAlpha(t >= 1) };
      if (t >= beats.routStart && !this.frame.routBurst) {
        this.frame.routBurst = { unitId: clip.attackerId, text: "溃散", alpha: burstAlpha };
      }
    }
  }
}

interface AttackBeats {
  aimEnd: number;
  flashEnd: number;
  drainEnd: number;
  mainHoldEnd: number;
  counterDrainEnd: number;
  counterHoldEnd: number;
  routStart: number;
}

/** 归一化时间轴：瞄准 → 命中闪光 → 掉血 → 数字停留 → 反击 → 溃散 */
export function attackBeats(hasCounter: boolean, hasDeath: boolean): AttackBeats {
  const aimEnd = 0.1;
  const flashEnd = 0.17;
  if (hasCounter) {
    const drainEnd = 0.34;
    const mainHoldEnd = 0.46;
    const counterDrainEnd = 0.62;
    const counterHoldEnd = hasDeath ? 0.74 : 0.94;
    return {
      aimEnd,
      flashEnd,
      drainEnd,
      mainHoldEnd,
      counterDrainEnd,
      counterHoldEnd,
      routStart: hasDeath ? counterHoldEnd : 1,
    };
  }
  const drainEnd = 0.42;
  const mainHoldEnd = hasDeath ? 0.62 : 0.94;
  return {
    aimEnd,
    flashEnd,
    drainEnd,
    mainHoldEnd,
    counterDrainEnd: mainHoldEnd,
    counterHoldEnd: mainHoldEnd,
    routStart: hasDeath ? mainHoldEnd : 1,
  };
}
