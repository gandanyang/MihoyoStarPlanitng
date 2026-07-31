/**
 * 农场等级/经验系统（Phase 0.2 扩展）
 *
 * 模块级单例：经验和等级跨场景保留，刷新页面后重置（同 Economy / FarmState 约定）。
 * 当前 MVP 范围：仅经验获取和升级，无技能树、无奖励、无复杂 UI。
 *
 * 经验规则：
 *   播种 +3  |  浇水 +1  |  收获萝卜 +10  |  完成任务 +30
 *
 * 等级阈值（下标 0-based = 等级-1，即 Lv1 对应 [0]、Lv2 对应 [1]）：
 *   Lv1:   0 XP
 *   Lv2: 100 XP
 *   Lv3: 250 XP
 *   Lv4: 500 XP
 *   Lv5: 900 XP
 */

import { play } from '../systems/AudioSystem';

/** 经验来源类型（调试/日志用） */
export type XpSource = 'plant' | 'water' | 'harvest' | 'quest';

/** 等级阈值：下标 0→Lv1, 1→Lv2, 2→Lv3, 3→Lv4, 4→Lv5 */
const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900];

/** 最大等级 */
const MAX_LEVEL = LEVEL_THRESHOLDS.length;

// ===== 模块级状态 =====
let level = 1;
let xp = 0;

/** 升级回调（MapScene 注册：显示升级通知） */
let onLevelUp: ((newLevel: number) => void) | null = null;

/** 注册升级回调 */
export function setOnLevelUp(cb: (newLevel: number) => void): void {
  onLevelUp = cb;
}

/** 当前等级 */
export function getLevel(): number {
  return level;
}

/** 当前经验 */
export function getXp(): number {
  return xp;
}

/** 直接设置等级（存档恢复用） */
export function setLevel(n: number): void {
  level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(n)));
}

/** 直接设置经验（存档恢复用） */
export function setXp(n: number): void {
  xp = Math.max(0, Math.floor(n));
  // 确保经验不超过当前等级上限
  if (level < MAX_LEVEL && xp >= LEVEL_THRESHOLDS[level]) {
    xp = LEVEL_THRESHOLDS[level] - 1;
  }
}

/** 距下一级还需多少经验（满级返回 0） */
export function getXpToNext(): number {
  if (level >= MAX_LEVEL) return 0;
  return LEVEL_THRESHOLDS[level] - xp; // level 是 1-based，LEVEL_THRESHOLDS[level] 对应下一级阈值
}

/**
 * 增加经验，自动检测升级。
 * @param amount  经验量
 * @param source  来源标识（调试/日志用）
 */
export function addXp(amount: number, source: XpSource): void {
  if (level >= MAX_LEVEL) return; // 满级不累计

  xp += amount;
  console.log(`[FarmProgress] +${amount} XP (${source}) → ${xp}/${LEVEL_THRESHOLDS[level] ?? 'MAX'}`);

  // 循环检测升级（可能一次性跨越多级，但当前经验量不足以触发此场景，保留健壮性）
  while (level < MAX_LEVEL && xp >= LEVEL_THRESHOLDS[level]) {
    level++;
    console.log(`[FarmProgress] 升级！Lv.${level}`);
    onLevelUp?.(level);
    play('levelup');
  }
}