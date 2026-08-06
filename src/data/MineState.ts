/**
 * 矿洞状态（挖矿 Phase）
 *
 * 定义矿脉位置、类型、产出，以及当日开采状态。
 * 矿脉每日刷新（睡觉后恢复），当日已开采的矿脉不再产出。
 */

import { ItemType } from './Inventory';

/** 矿石类型 */
export type OreType = 'stone' | 'copper' | 'iron';

/** 矿脉定义 */
export interface OreDeposit {
  /** 唯一 ID（用于追踪开采状态） */
  id: string;
  /** 矿石类型 */
  oreType: OreType;
  /** 瓦片坐标 col */
  col: number;
  /** 瓦片坐标 row */
  row: number;
  /** 消耗体力 */
  staminaCost: number;
  /** 产出物品及数量 */
  drops: { item: ItemType; count: number }[];
  /** 颜色（Phaser 渲染用） */
  color: number;
}

/** 矿脉布局（矿洞地图 30x20） */
export const ORE_DEPOSITS: OreDeposit[] = [
  // 石头矿脉（3处，灰色）
  // 注：s1 原位于 (6,5)，在左上石簇(4-6,4-6)碰撞区内，玩家无法靠近采集 → 移到石簇右侧 (7,5)
  { id: 's1', oreType: 'stone', col: 7, row: 5, staminaCost: 5, color: 0x9e9e9e, drops: [{ item: 'stone', count: 3 }] },
  { id: 's2', oreType: 'stone', col: 22, row: 6, staminaCost: 5, color: 0x9e9e9e, drops: [{ item: 'stone', count: 3 }] },
  { id: 's3', oreType: 'stone', col: 8, row: 14, staminaCost: 5, color: 0x9e9e9e, drops: [{ item: 'stone', count: 3 }] },
  // 铜矿矿脉（2处，橙色）
  { id: 'c1', oreType: 'copper', col: 20, row: 13, staminaCost: 10, color: 0xcc7755, drops: [{ item: 'copper', count: 1 }, { item: 'stone', count: 1 }] },
  { id: 'c2', oreType: 'copper', col: 5, row: 12, staminaCost: 10, color: 0xcc7755, drops: [{ item: 'copper', count: 1 }, { item: 'stone', count: 1 }] },
  // 铁矿矿脉（1处，银白色，稀有）
  // 注：i1 原位于 (24,14)，在右下石簇(23-25,13-15)碰撞区内，玩家无法靠近采集 → 移到石簇右侧 (26,13)
  { id: 'i1', oreType: 'iron', col: 26, row: 13, staminaCost: 15, color: 0xc0c0c0, drops: [{ item: 'iron', count: 1 }] },
];

/** 当日已开采的矿脉 ID 集合 */
const minedOres = new Set<string>();

/** 检查矿脉是否已开采 */
export function isOreMined(id: string): boolean {
  return minedOres.has(id);
}

/** 标记矿脉已开采 */
export function markMined(id: string): void {
  minedOres.add(id);
}

/** 重置所有矿脉（睡觉/跨天调用） */
export function resetOres(): void {
  minedOres.clear();
}

/** 获取已开采矿脉 ID 列表（存档用） */
export function getMinedOreIds(): string[] {
  return Array.from(minedOres);
}

/** 恢复已开采矿脉（存档恢复用） */
export function restoreMinedOres(ids: string[]): void {
  minedOres.clear();
  for (const id of ids) minedOres.add(id);
}
