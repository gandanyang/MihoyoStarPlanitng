/**
 * 统一一次性事件状态（2026-08-06 制作人拍板：存档系统审查后的小修）
 *
 * 问题：多 Agent 并行开发后，各功能自行维护"是否已触发"（mapFlags 布尔、会话字段、
 *      背包检查、相簿幂等……），缺少统一收口，容易出现"重新进入后旧任务重复触发"。
 *
 * 方案：所有"只该发生一次"的剧情 / 记忆 / 相簿 / 支线 / NPC 事件，统一走
 *      `triggerOnce(id, fn)`；状态随存档持久化（SaveData.gameState.triggeredEvents），
 *      旧档无该字段默认空，不触发任何历史事件。
 *
 * 用法：
 *   import { triggerOnce } from './EventManager';
 *   triggerOnce('xiya_garden_done', () => { runEvent(); save(); });
 */

/** 一次性事件状态的存档结构 */
export interface GameEventSaveData {
  triggeredEvents: Record<string, boolean>;
}

/** 模块级状态（内存 + 存档双源，apply 时整体恢复） */
let triggeredEvents: Record<string, boolean> = {};

/**
 * 触发一次：未触发过 → 执行 fn 并记录；已触发过 → 直接跳过（返回 false）。
 * 调用方负责在 fn 内做必要的存档（save），本模块不隐式存档。
 */
export function triggerOnce(id: string, fn: () => void): boolean {
  if (triggeredEvents[id]) return false;
  fn();
  triggeredEvents[id] = true;
  return true;
}

/** 是否已触发过（只读） */
export function hasTriggered(id: string): boolean {
  return !!triggeredEvents[id];
}

/** 手动标记已触发（不执行事件；用于迁移/调试/恢复历史状态） */
export function markTriggered(id: string): void {
  triggeredEvents[id] = true;
}

/** 序列化（SaveSystem.save 调用） */
export function getGameEventSaveData(): GameEventSaveData {
  return { triggeredEvents: { ...triggeredEvents } };
}

/** 恢复（SaveSystem.apply 调用；旧档无字段 → 空状态） */
export function restoreGameEventSaveData(data?: GameEventSaveData): void {
  triggeredEvents =
    data && data.triggeredEvents && typeof data.triggeredEvents === 'object'
      ? { ...data.triggeredEvents }
      : {};
}
