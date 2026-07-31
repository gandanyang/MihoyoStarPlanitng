/**
 * 简易物品库存（Phase 3.5 起）
 * 0.1 版本只有萝卜一种物品，不做完整背包/商店/金币系统。
 * 后续 Phase 可扩展更多物品字段。
 */

/** 物品类型（0.1 只有萝卜） */
export type ItemType = 'radish';

/** 库存数据：物品类型 → 数量 */
const inventory: Record<ItemType, number> = {
  radish: 0,
};

/** 读取某物品数量 */
export function getItemCount(item: ItemType): number {
  return inventory[item] ?? 0;
}

/** 增加物品数量（默认 +1） */
export function addItem(item: ItemType, count = 1): void {
  inventory[item] = (inventory[item] ?? 0) + count;
}
