/**
 * 物品库存（Phase 0.25 背包系统）
 *
 * 模块级单例：物品数量跨场景保留。
 */

/** 物品类型 */
export type ItemType = 'radish' | 'tomato' | 'corn' | 'strawberry' | 'radish_seed' | 'tomato_seed' | 'corn_seed' | 'strawberry_seed' | 'star_shard' | 'diamond' | 'stone' | 'copper' | 'iron' | 'manor_key' | 'old_hoe' | 'old_watering_can' | 'old_axe' | 'wood' | 'auto_farmer_robot';

/** 出售优先级标签（FEATURE-039 智能出售） */
export type SellPriority = 'normal' | 'reserve' | 'forbidden';

/** 物品定义 */
export interface ItemDef {
  id: ItemType;
  name: string;
  /** 描述（背包悬浮提示用，暂不显示） */
  desc: string;
  /** 物品图标 emoji（后续替换为像素图） */
  icon: string;
  /** 出售优先级：normal=正常出售 / reserve=保留（不自动卖，可手动卖）/ forbidden=不可售 */
  sellPriority: SellPriority;
}

/** 物品定义表 */
export const ITEM_DEFS: Record<ItemType, ItemDef> = {
  radish: { id: 'radish', name: '萝卜', desc: '农场种植的普通萝卜，可出售换取金币。', icon: '🥕', sellPriority: 'normal' },
  tomato: { id: 'tomato', name: '番茄', desc: '红润饱满的番茄，比萝卜更值钱。', icon: '🍅', sellPriority: 'normal' },
  corn: { id: 'corn', name: '玉米', desc: '金黄饱满的玉米，生长周期较长。', icon: '🌽', sellPriority: 'normal' },
  strawberry: { id: 'strawberry', name: '草莓', desc: '鲜红香甜的草莓，稀有作物价值很高。', icon: '🍓', sellPriority: 'normal' },
  radish_seed: { id: 'radish_seed', name: '萝卜种子', desc: '种在锄过的土地上，浇水后1天成熟。', icon: '🌱', sellPriority: 'forbidden' },
  tomato_seed: { id: 'tomato_seed', name: '番茄种子', desc: '种在锄过的土地上，浇水后2天成熟。', icon: '🌱', sellPriority: 'forbidden' },
  corn_seed: { id: 'corn_seed', name: '玉米种子', desc: '种在锄过的土地上，浇水后3天成熟。', icon: '🌱', sellPriority: 'forbidden' },
  strawberry_seed: { id: 'strawberry_seed', name: '草莓种子', desc: '稀有种子，浇水后3天成熟，价值极高。', icon: '🌱', sellPriority: 'forbidden' },
  star_shard: { id: 'star_shard', name: '星之碎片', desc: '星辰岛心脏的碎片，散发着微光。', icon: '💎', sellPriority: 'forbidden' },
  diamond: { id: 'diamond', name: '钻石', desc: '完成每日任务获得的稀有货币，可在特殊商店兑换稀有物品。', icon: '💠', sellPriority: 'forbidden' },
  stone: { id: 'stone', name: '石头', desc: '矿洞中开采的普通石材，可用于建筑或出售。', icon: '🪨', sellPriority: 'reserve' },
  copper: { id: 'copper', name: '铜矿', desc: '铜色矿石，可用于工具升级或出售。', icon: '🟤', sellPriority: 'normal' },
  iron: { id: 'iron', name: '铁矿', desc: '稀有的铁矿石，价值较高。', icon: '⚪', sellPriority: 'reserve' },
  manor_key: { id: 'manor_key', name: '庄园钥匙', desc: '打开星黎庄园大门的钥匙。', icon: '🗝️', sellPriority: 'forbidden' },
  old_hoe: { id: 'old_hoe', name: '旧锄头', desc: '一把老旧的锄头，用来翻地足够了。', icon: '⚒️', sellPriority: 'forbidden' },
  old_watering_can: { id: 'old_watering_can', name: '旧水壶', desc: '给作物浇水用的旧水壶。', icon: '🚿', sellPriority: 'forbidden' },
  old_axe: { id: 'old_axe', name: '旧斧头', desc: '一把生锈的斧头，砍几棵树应该没问题。', icon: '🪓', sellPriority: 'forbidden' },
  wood: { id: 'wood', name: '木材', desc: '砍树获得的木材，可用于建筑或出售。', icon: '🪵', sellPriority: 'reserve' },
  auto_farmer_robot: { id: 'auto_farmer_robot', name: '自动农业机器人', desc: '放置在农田附近，每天清晨自动浇水、自动收获成熟作物。', icon: '🤖', sellPriority: 'forbidden' },
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
  auto_farmer_robot: 0,
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
  // 先清零所有物品（避免旧默认值残留，如 radish_seed: 5）
  for (const id of Object.keys(ITEM_DEFS) as ItemType[]) {
    inventory[id] = 0;
  }
  // 再从存档覆盖
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

// ── FEATURE-039：物品锁定（防止一键出售卖掉关键资源） ──
const lockedItems = new Set<ItemType>();

/** 切换物品锁定状态 */
export function toggleItemLock(item: ItemType): boolean {
  if (lockedItems.has(item)) {
    lockedItems.delete(item);
    return false;
  }
  lockedItems.add(item);
  return true;
}

/** 查询物品是否已锁定 */
export function isItemLocked(item: ItemType): boolean {
  return lockedItems.has(item);
}

/** 获取所有已锁定物品 ID（存档序列化用） */
export function getLockedItems(): ItemType[] {
  return Array.from(lockedItems);
}

/** 恢复锁定状态（存档恢复用） */
export function restoreLockedItems(items: string[]): void {
  lockedItems.clear();
  for (const id of items) {
    if (id in ITEM_DEFS) {
      lockedItems.add(id as ItemType);
    }
  }
}