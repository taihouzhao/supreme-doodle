import type { GameEvent, GameState, Vec2 } from "../core/types";

export interface VisualFrame {
  busy: boolean;
  /** 连续棋盘坐标（格心插值）；busy 时应覆盖所有仍需绘制的单位 */
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
  /** 开火瞬间双方格子；击溃推进留到后续 moved 片段 */
  attackerFrom: Vec2;
  defenderFrom: Vec2;
  duration: number;
};

export type FxClip = MoveClip | AttackClip | PromoteClip;

/** 一批事件开播前的棋盘真相种子（动作执行前状态） */
export interface TimelineSeed {
  positions: Record<string, { x: number; y: number }>;
  hp: Record<string, number>;
  /** 开播时仍应绘制的单位（含稍后才会在时间线上溃散的） */
  present: Record<string, boolean>;
}

export interface Timeline {
  clips: FxClip[];
  seed: TimelineSeed;
}

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

function seedFromState(state: GameState): TimelineSeed {
  const positions: TimelineSeed["positions"] = {};
  const hp: TimelineSeed["hp"] = {};
  const present: TimelineSeed["present"] = {};
  for (const unit of state.units) {
    if (unit.evacuated) continue;
    positions[unit.id] = { x: unit.x, y: unit.y };
    hp[unit.id] = unit.hp;
    present[unit.id] = unit.alive;
  }
  return { positions, hp, present };
}

/**
 * 从动作前状态 + 有序事件编演出时间线。
 * 粘性世界从 prev 起步；路径只用事件自带 path，绝不在终局占位上重新寻路。
 */
export function buildTimeline(prev: GameState, events: GameEvent[]): Timeline {
  const seed = seedFromState(prev);
  const clips: FxClip[] = [];
  let index = 0;

  for (const event of events) {
    const scale = index === 0 ? 1 : FX_TIMING.chainedScale;
    if (event.type === "moved") {
      const relocated = event.from.x !== event.to.x || event.from.y !== event.to.y;
      if (!relocated) continue;
      const path =
        event.path.length >= 2 ? event.path : [event.from, event.to];
      const duration =
        Math.min(
          FX_TIMING.moveMaxMs,
          Math.max(FX_TIMING.moveMinMs, (path.length - 1) * FX_TIMING.moveStepMs),
        ) * scale;
      clips.push({ kind: "move", unitId: event.unitId, path, duration });
      index += 1;
    } else if (event.type === "attacked") {
      const hasCounter = event.counterDamage > 0;
      const defenderDies = event.defenderRouted;
      const attackerDies = event.attackerRouted;
      const deathPad = defenderDies || attackerDies ? FX_TIMING.attackDeathPadMs : 0;
      const base = hasCounter ? FX_TIMING.attackCounterMs : FX_TIMING.attackBaseMs;
      const duration = Math.min(FX_TIMING.attackMaxMs, (base + deathPad) * scale);
      // 确保目标在终局已死后，前几击仍能绘制
      seed.present[event.defenderId] = true;
      seed.present[event.attackerId] = true;
      if (seed.hp[event.defenderId] === undefined) {
        seed.hp[event.defenderId] = event.defenderHpFrom;
      }
      if (seed.hp[event.attackerId] === undefined) {
        seed.hp[event.attackerId] = event.attackerHpFrom;
      }
      if (!seed.positions[event.defenderId]) {
        seed.positions[event.defenderId] = { ...event.defenderFrom };
      }
      if (!seed.positions[event.attackerId]) {
        seed.positions[event.attackerId] = { ...event.attackerFrom };
      }
      clips.push({
        kind: "attack",
        attackerId: event.attackerId,
        defenderId: event.defenderId,
        damage: event.damage,
        counterDamage: event.counterDamage,
        defenderHpFrom: event.defenderHpFrom,
        defenderHpTo: event.defenderHpTo,
        attackerHpFrom: event.attackerHpFrom,
        attackerHpTo: event.attackerHpTo,
        defenderDies,
        attackerDies,
        attackerFrom: event.attackerFrom,
        defenderFrom: event.defenderFrom,
        duration,
      });
      index += 1;
    } else if (event.type === "levelUp") {
      const unit = prev.units.find((u) => u.id === event.unitId);
      // 仅玩家晋升上屏；敌方静默
      if (unit && unit.faction !== "player") continue;
      // 终局里也可能已不在 prev（极少见）；有事件就播
      clips.push({
        kind: "promote",
        unitId: event.unitId,
        text: `晋升 ${event.rank}`,
        duration: FX_TIMING.promoteMs,
      });
      index += 1;
    }
  }

  return { clips, seed };
}

/** @deprecated 使用 buildTimeline；保留兼容旧测试入口 */
export function clipsFromEvents(state: GameState, events: GameEvent[]): FxClip[] {
  // 旧接口没有 prev，只能用终局种子；路径仍优先读事件字段
  return buildTimeline(state, events).clips;
}

export class Presentation {
  private queue: FxClip[] = [];
  private raf = 0;
  private frame: VisualFrame = idleFrame();
  private speed = 1;
  private readonly onChange: () => void;
  private readonly onIdle: () => void;

  /** 跨片段粘性棋盘真相：片段之间不回落到终局 battle */
  private stickyPositions: Record<string, { x: number; y: number }> = {};
  private stickyHp: Record<string, number> = {};
  private stickyPresent: Record<string, boolean> = {};

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
    this.clearSticky();
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
    this.clearSticky();
    this.frame = idleFrame();
  }

  enqueue(clips: FxClip[], seed?: TimelineSeed): void {
    if (clips.length === 0) {
      this.onIdle();
      return;
    }
    if (seed && !this.raf && this.queue.length === 0) {
      this.stickyPositions = { ...seed.positions };
      this.stickyHp = { ...seed.hp };
      this.stickyPresent = { ...seed.present };
    }
    this.queue.push(...clips);
    if (!this.raf) this.kick();
  }

  enqueueTimeline(timeline: Timeline): void {
    this.enqueue(timeline.clips, timeline.seed);
  }

  private clearSticky(): void {
    this.stickyPositions = {};
    this.stickyHp = {};
    this.stickyPresent = {};
  }

  /** 新片段开场：保留粘性姿态/血量，只清瞬时特效 */
  private baseBusyFrame(): VisualFrame {
    const lingerUnits: VisualFrame["lingerUnits"] = {};
    for (const [id, on] of Object.entries(this.stickyPresent)) {
      if (!on) continue;
      // 终局已死但时间线尚未溃散的单位，靠 linger 强制绘制
      const hp = this.stickyHp[id] ?? 0;
      lingerUnits[id] = { hp, alpha: 1 };
    }
    return {
      ...idleFrame(),
      busy: true,
      unitPositions: { ...this.stickyPositions },
      hpDisplay: { ...this.stickyHp },
      lingerUnits,
    };
  }

  private kick(): void {
    const clip = this.queue.shift();
    if (!clip) {
      this.clearSticky();
      this.frame = idleFrame();
      this.raf = 0;
      this.onChange();
      this.onIdle();
      return;
    }
    this.frame = this.baseBusyFrame();
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
        this.commitClipEnd(clip);
        this.raf = 0;
        this.kick();
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** 片段结束时把姿态/血量写入粘性世界，供后续片段继承 */
  private commitClipEnd(clip: FxClip): void {
    if (clip.kind === "move") {
      const end = clip.path[clip.path.length - 1];
      if (end) this.stickyPositions[clip.unitId] = { x: end.x, y: end.y };
      return;
    }
    if (clip.kind === "promote") return;
    this.stickyPositions[clip.attackerId] = {
      x: clip.attackerFrom.x,
      y: clip.attackerFrom.y,
    };
    this.stickyPositions[clip.defenderId] = {
      x: clip.defenderFrom.x,
      y: clip.defenderFrom.y,
    };
    this.stickyHp[clip.defenderId] = clip.defenderHpTo;
    this.stickyHp[clip.attackerId] = clip.attackerHpTo;
    if (clip.defenderDies) {
      this.stickyPresent[clip.defenderId] = false;
      this.stickyHp[clip.defenderId] = 0;
    }
    if (clip.attackerDies) {
      this.stickyPresent[clip.attackerId] = false;
      this.stickyHp[clip.attackerId] = 0;
    }
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

    this.frame.unitPositions = { ...this.stickyPositions };
    this.frame.unitPositions[clip.unitId] = {
      x: lerp(a.x, b.x, local),
      y: lerp(a.y, b.y, local),
    };
    this.frame.hpDisplay = { ...this.stickyHp };
    this.frame.lingerUnits = lingerFromSticky(this.stickyPresent, this.stickyHp);
    this.frame.promoteBurst = null;
    this.frame.routBurst = null;
    this.frame.impact = null;
    this.frame.impactUnitId = null;
    this.frame.strikeLine = null;
    this.frame.flashUnitId = null;

    const trail: VisualFrame["trail"] = [];
    for (let p = 0; p <= i; p += 1) {
      const tile = path[p]!;
      trail.push({ x: tile.x, y: tile.y, alpha: 0.18 + 0.32 * (1 - t) });
    }
    this.frame.trail = trail;
    this.frame.busy = true;
  }

  /** 晋升提示：钉在粘性坐标上，不暴露击溃推进后的终局格 */
  private applyPromote(clip: PromoteClip, t: number): void {
    this.frame.busy = true;
    this.frame.unitPositions = { ...this.stickyPositions };
    this.frame.hpDisplay = { ...this.stickyHp };
    this.frame.lingerUnits = lingerFromSticky(this.stickyPresent, this.stickyHp);
    this.frame.trail = [];
    this.frame.strikeLine = null;
    this.frame.impact = null;
    this.frame.impactUnitId = null;
    this.frame.flashUnitId = null;
    this.frame.routBurst = null;
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
    this.frame.unitPositions = { ...this.stickyPositions };
    // 整段交战钉在开火瞬间的格子上；击溃推进由后续 moved 片段播放
    this.frame.unitPositions[clip.attackerId] = {
      x: clip.attackerFrom.x,
      y: clip.attackerFrom.y,
    };
    this.frame.unitPositions[clip.defenderId] = {
      x: clip.defenderFrom.x,
      y: clip.defenderFrom.y,
    };
    this.frame.hpDisplay = { ...this.stickyHp };
    this.frame.lingerUnits = lingerFromSticky(this.stickyPresent, this.stickyHp);
    this.frame.promoteBurst = null;
    this.frame.trail = [];
    this.frame.flashUnitId = t >= beats.aimEnd && t < beats.flashEnd ? clip.attackerId : null;
    this.frame.routBurst = null;

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
      this.frame.hpDisplay[clip.defenderId] = clip.defenderHpFrom;
      this.frame.impact = null;
      this.frame.impactUnitId = null;
      this.frame.lingerUnits[clip.defenderId] = {
        hp: clip.defenderHpFrom,
        alpha: 1,
      };
      this.frame.lingerUnits[clip.attackerId] = {
        hp: clip.attackerHpFrom,
        alpha: 1,
      };
      return;
    }

    if (t < beats.mainHoldEnd) {
      const drain = Math.min(
        1,
        (t - beats.flashEnd) / Math.max(0.001, beats.drainEnd - beats.flashEnd),
      );
      const hp = lerp(clip.defenderHpFrom, clip.defenderHpTo, easeInOut(drain));
      this.frame.hpDisplay[clip.defenderId] = hp;
      this.frame.lingerUnits[clip.defenderId] = { hp, alpha: 1 };
      this.frame.lingerUnits[clip.attackerId] = {
        hp: clip.attackerHpFrom,
        alpha: 1,
      };
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
      this.frame.lingerUnits[clip.attackerId] = { hp, alpha: 1 };
      this.frame.lingerUnits[clip.defenderId] = {
        hp: clip.defenderHpTo,
        alpha: clip.defenderDies ? lingerAlpha(false) : 1,
      };
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

    const routLocal = Math.max(0, (t - beats.routStart) / Math.max(0.001, 1 - beats.routStart));
    const burstAlpha =
      routLocal < 0.6 ? Math.min(1, routLocal / 0.15) : Math.max(0, 1 - (routLocal - 0.6) / 0.4);
    if (clip.defenderDies) {
      this.frame.lingerUnits[clip.defenderId] = { hp: 0, alpha: lingerAlpha(t >= 1) };
      if (t >= beats.routStart) {
        this.frame.routBurst = { unitId: clip.defenderId, text: "溃散", alpha: burstAlpha };
      }
    } else {
      this.frame.lingerUnits[clip.defenderId] = {
        hp: clip.defenderHpTo,
        alpha: 1,
      };
    }
    if (clip.attackerDies) {
      this.frame.lingerUnits[clip.attackerId] = { hp: 0, alpha: lingerAlpha(t >= 1) };
      if (t >= beats.routStart && !this.frame.routBurst) {
        this.frame.routBurst = { unitId: clip.attackerId, text: "溃散", alpha: burstAlpha };
      }
    } else {
      this.frame.lingerUnits[clip.attackerId] = {
        hp: hasCounter ? clip.attackerHpTo : clip.attackerHpFrom,
        alpha: 1,
      };
    }
  }
}

function lingerFromSticky(
  present: Record<string, boolean>,
  hp: Record<string, number>,
): VisualFrame["lingerUnits"] {
  const linger: VisualFrame["lingerUnits"] = {};
  for (const [id, on] of Object.entries(present)) {
    if (!on) continue;
    linger[id] = { hp: hp[id] ?? 0, alpha: 1 };
  }
  return linger;
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

/**
 * 纯函数：按片段顺序推演粘性姿态，供测试断言「时间线不穿帮」。
 * 不驱动 RAF，只验证 commit 语义。
 */
export function projectStickyAfterClips(
  seed: TimelineSeed,
  clips: FxClip[],
): { positions: Record<string, { x: number; y: number }>; hp: Record<string, number>; present: Record<string, boolean> } {
  const positions = { ...seed.positions };
  const hp = { ...seed.hp };
  const present = { ...seed.present };
  for (const clip of clips) {
    if (clip.kind === "move") {
      const end = clip.path[clip.path.length - 1];
      if (end) positions[clip.unitId] = { x: end.x, y: end.y };
    } else if (clip.kind === "attack") {
      positions[clip.attackerId] = { x: clip.attackerFrom.x, y: clip.attackerFrom.y };
      positions[clip.defenderId] = { x: clip.defenderFrom.x, y: clip.defenderFrom.y };
      hp[clip.defenderId] = clip.defenderHpTo;
      hp[clip.attackerId] = clip.attackerHpTo;
      if (clip.defenderDies) {
        present[clip.defenderId] = false;
        hp[clip.defenderId] = 0;
      }
      if (clip.attackerDies) {
        present[clip.attackerId] = false;
        hp[clip.attackerId] = 0;
      }
    }
  }
  return { positions, hp, present };
}
