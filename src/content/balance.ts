/**
 * 全局平衡参数。规则核心只读取这里，不写死数值，
 * 便于模拟器批量试不同配置。
 */
export const BALANCE = {
  /** 战斗抖动区间：保留可解释性，同时让相同阵型不再每次同伤害。 */
  jitter: { min: 0.92, max: 1.08 },
  /** 反击伤害比例 */
  counterRatio: 0.4,
  /** 阵营伤害系数，用来整体调节难度 */
  factionDamage: { player: 1, enemy: 1.1 },
  /** 主力承伤减免，配合「主力阵亡即败」规则 */
  keyUnitDamageTaken: 0.55,
  /** 相邻友军带来的集火加成 */
  flank: { perAlly: 0.06, cap: 0.18 },
  /** 可覆盖同一目标的友军带来的火力呼应。 */
  coordination: { perAlly: 0.04, cap: 0.16 },
  /** 守方相邻/可反击单位带来的互相掩护。 */
  defensiveSupport: { perAlly: 0.045, cap: 0.16 },
  /** 击溃敌军后俘虏小部分兵员的确定性随机参数。 */
  prisoners: { chance: 0.45, min: 2, max: 8 },
  /** 疲劳影响 */
  fatigue: {
    perMoveCost: 0.5,
    perAttack: 8,
    perWait: -12,
    attackPenalty: 0.25,
    movePenalty: 0.25,
    min: 0,
    max: 100,
  },
  /** 伤害下限，避免完全无效的攻击 */
  minDamage: 1,
};
