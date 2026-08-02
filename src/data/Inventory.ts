/**
 * 物品库存（Phase 0.25 背包系统）
 *
 * 模块级单例：物品数量跨场景保留。
 */

/** 物品类型 */
export type ItemType = 'radish' | 'tomato' | 'corn' | 'strawberry' | 'radish_seed' | 'tomato_seed' | 'corn_seed' | 'strawberry_seed' | 'star_shard' | 'diamond' | 'stone' | 'copper' | 'iron' | 'manor_key' | 'old_hoe' | 'old_watering_can' | 'old_axe' | 'wood';

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
  tomato: { id: 'tomato', name: '番茄', desc: '红润饱满的番茄，比萝卜更值钱。', icon: '🍅' },
  corn: { id: 'corn', name: '玉米', desc: '金黄饱满的玉米，生长周期较长。', icon: '🌽' },
  strawberry: { id: 'strawberry', name: '草莓', desc: '鲜红香甜的草莓，稀有作物价值很高。', icon: '🍓' },
  radish_seed: { id: 'radish_seed', name: '萝卜种子', desc: '种在锄过的土地上，浇水后1天成熟。', icon: '🌱' },
  tomato_seed: { id: 'tomato_seed', name: '番茄种子', desc: '种在锄过的土地上，浇水后2天成熟。', icon: '🌱' },
  corn_seed: { id: 'corn_seed', name: '玉米种子', desc: '种在锄过的土地上，浇水后3天成熟。', icon: '🌱' },
  strawberry_seed: { id: 'strawberry_seed', name: '草莓种子', desc: '稀有种子，浇水后3天成熟，价值极高。', icon: '🌱' },
  star_shard: { id: 'star_shard', name: '星之碎片', desc: '星辰岛心脏的碎片，散发着微光。', icon: '💎' },
  diamond: { id: 'diamond', name: '钻石', desc: '完成每日任务获得的稀有货币，可在特殊商店兑换稀有物品。', icon: '💠' },
  stone: { id: 'stone', name: '石头', desc: '矿洞中开采的普通石材，可用于建筑或出售。', icon: '🪨' },
  copper: { id: 'copper', name: '铜矿', desc: '铜色矿石，可用于工具升级或出售。', icon: '🟤' },
  iron: { id: 'iron', name: '铁矿', desc: '稀有的铁矿石，价值较高。', icon: '⚪' },
  manor_key: { id: 'manor_key', name: '庄园钥匙', desc: '打开星黎庄园大门的钥匙。', icon: '🗝️' },
  old_hoe: { id: 'old_hoe', name: '旧锄头', desc: '一把老旧的锄头，用来翻地足够了。', icon: '⚒️' },
  old_watering_can: { id: 'old_watering_can', name: '旧水壶', desc: '给作物浇水用的旧水壶。', icon: '🚿' },
  old_axe: { id: 'old_axe', name: '旧斧头', desc: '一把生锈的斧头，砍几棵树应该没问题。', icon: '🪓' },
  wood: { id: 'wood', name: '木材', desc: '砍树获得的木材，可用于建筑或出售。', icon: '🪵' },
};

/** 库存数据：物品类型 → 数量 */
const inventory: Record<ItemType, number> = {
  radish: 0,
  tomato: 0,
  corn: 0,
  strawberry: 0,
  radish_seed: 5,
  tomato_seed: 0,
  corn_seed: 0,
  strawberry_seed: 0,
  star_shard: 0,
  diamond: 0,
  stone: 0,
  copper: 0,
  iron: 0,
  manor_key: 0,
  old_hoe: 0,
  old_watering_can: 0,
  old_axe: 0,
  wood: 0,
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

/**
 * 物品图标 HTML（16×16 像素图标替换 emoji 渲染）
 * @param id     物品 ID（对应 public/assets/icons/{id}.png）
 * @param size   显示尺寸（px，默认 18）
 */
export function itemIconHtml(id: string, size = 18): string {
  return `<img src="assets/icons/${id}.png" alt="" style="width:${size}px;height:${size}px;vertical-align:middle;image-rendering:pixelated;">`;
}