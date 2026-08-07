/**
 * 全局平衡参数。规则核心只读取这里，不写死数值，
 * 便于模拟器批量试不同配置。
 */
export const BALANCE = {
  /** 战斗抖动区间：窄区间保证单次随机不能决定胜负 */
  jitter: { min: 0.92, max: 1.08 },
  /** 反击伤害比例 */
  counterRatio: 0.4,
  /** 阵营伤害系数，用来整体调节难度 */
  factionDamage: { player: 1, enemy: 0.9 },
  /** 主力承伤减免，配合「主力阵亡即败」规则 */
  keyUnitDamageTaken: 0.4,
  /** 相邻友军带来的集火加成 */
  flank: { perAlly: 0.06, cap: 0.18 },
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
