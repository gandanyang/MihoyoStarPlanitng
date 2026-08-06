/**
 * 天气系统（BUG-048 v0.10-lite）
 *
 * 世界反馈层：让归星岛"会随着时间变化"。v0.10 只做雨天，
 * 雾天/星夜/正式季节循环延后（见 归星岛环境循环系统-v0.1.md）。
 *
 * 设计约束（制作人拍板）：
 * - 零存档字段：天气按 world.day 纯函数派生，不入档 → 旧档天然兼容
 * - 事件表脚本化：不做随机概率（测试成本高、反馈不可控）
 * - 跨场景一致：同一天任何地图 getWeather(day) 结果相同
 *
 * 事件表（v0.10-lite）：
 *   Day 1 晴 → Day 2 小雨 → Day 3+ 晴（雾/星夜延后 P2）
 */

import { getTime } from '../data/TimeSystem';

/** 天气类型 */
export type Weather = 'clear' | 'rain';

/** 按游戏日派生当天天气（纯函数，不依赖任何状态） */
export function getWeather(day: number): Weather {
  // Day 2 小雨：玩家睡过第一夜后，归星岛迎来第一场雨
  return day === 2 ? 'rain' : 'clear';
}

/** 是否为雨天（带时间范围：Day2 10:00-16:00） */
export function isRainy(day: number, hour: number): boolean {
  return day === 2 && hour >= 10 && hour < 16;
}

/** 获取当前天气（基于当前时间） */
export function getCurrentWeather(): Weather {
  const { day, hour } = getTime();
  return isRainy(day, hour) ? 'rain' : 'clear';
}

/** 当前是否下雨 */
export function isCurrentlyRaining(): boolean {
  return getCurrentWeather() === 'rain';
}
