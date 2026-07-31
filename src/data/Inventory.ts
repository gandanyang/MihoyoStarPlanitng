/**
 * 物品库存（Phase 0.25 背包系统）
 *
 * 模块级单例：物品数量跨场景保留。
 * 当前支持：萝卜、种子、星之碎片。
 */

/** 物品类型 */
export type ItemType = 'radish' | 'seed' | 'star_shard';

/** 物品定义 */
export interface ItemDef {
  id: ItemType;
  name: string;
  /** 描述（背包悬浮提示用，暂不显示） */
  desc: string;
  /** 物品图标 emoji（后续替换为像素图） */
  icon: string;
}

/** 物品定义表 */
export const ITEM_DEFS: Record<ItemType, ItemDef> = {
  radish: { id: 'radish', name: '萝卜', desc: '农场种植的普通萝卜，可出售换取金币。', icon: '🥕' },
  seed: { id: 'seed', name: '萝卜种子', desc: '种在锄过的土地上，浇水后第二天成熟。', icon: '🌱' },
  star_shard: { id: 'star_shard', name: '星之碎片', desc: '星辰岛心脏的碎片，散发着微光。', icon: '💎' },
};

/** 库存数据：物品类型 → 数量 */
const inventory: Record<ItemType, number> = {
  radish: 0,
  seed: 5,
  star_shard: 0,
};

/** 读取某物品数量 */
export function getItemCount(item: ItemType): number {
  return inventory[item] ?? 0;
}

/** 增加物品数量（默认 +1，支持负数减少） */
export function addItem(item: ItemType, count = 1): void {
  inventory[item] = (inventory[item] ?? 0) + count;
  if (inventory[item] < 0) inventory[item] = 0;
}

/** 直接设置物品数量（存档恢复用） */
export function setItemCount(item: ItemType, count: number): void {
  inventory[item] = Math.max(0, Math.floor(count));
}

/** 获取物品定义 */
export function getItemDef(item: ItemType): ItemDef {
  return ITEM_DEFS[item];
}

/** 获取所有非零库存物品（背包显示用） */
export function getNonEmptyItems(): { item: ItemType; count: number; def: ItemDef }[] {
  return (Object.keys(ITEM_DEFS) as ItemType[])
    .filter((id) => inventory[id] > 0)
    .map((id) => ({ item: id, count: inventory[id], def: ITEM_DEFS[id] }));
}

/** 获取所有物品条目（存档序列化用） */
export function getAllInventoryEntries(): [ItemType, number][] {
  return (Object.keys(ITEM_DEFS) as ItemType[]).map((id) => [id, inventory[id]]);
}

/** 恢复所有物品数量（存档恢复用） */
export function restoreAllInventory(data: Partial<Record<ItemType, number>>): void {
  for (const id of Object.keys(ITEM_DEFS) as ItemType[]) {
    if (data[id] !== undefined) {
      inventory[id] = Math.max(0, Math.floor(data[id]));
    }
  }
}