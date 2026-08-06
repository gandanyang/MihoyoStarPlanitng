/**
 * 经济系统（Phase 0.2）
 *
 * 金币 + 商品价格。0.2 版本形成「种萝卜 → 收获 → 卖钱 → 买种子」正循环：
 *   买 1 颗种子 10G → 收 1 个萝卜卖 15G → 净赚 5G
 *
 * 全局模块级单例：金币跨场景保留，刷新页面后重置（同 FarmState 约定）。
 */

import { addItem, getItemCount, getItemDef, isItemLocked, ItemType } from './Inventory';

/** 初始金币 */
const INITIAL_COINS = 100;

/** 当前金币 */
let coins = INITIAL_COINS;

/** 读取当前金币 */
export function getCoins(): number {
  return coins;
}

/** 增加金币（卖萝卜等收入） */
export function addCoins(n: number): void {
  coins += n;
}

/**
 * 消费金币
 * @returns true 成功；false 余额不足（不扣款）
 */
export function spendCoins(n: number): boolean {
  if (coins < n) return false;
  coins -= n;
  return true;
}

/** 直接设置金币数（存档恢复用） */
export function setCoins(n: number): void {
  coins = Math.max(0, Math.floor(n));
}

// ---- 商品价格（集中配置，方便调整） ----
/** 萝卜种子售价 */
export const SEED_PRICE = 10;
/** 萝卜收购价 */
export const RADISH_PRICE = 15;
/** 番茄种子售价 */
export const TOMATO_SEED_PRICE = 20;
/** 番茄收购价 */
export const TOMATO_PRICE = 35;
/** 玉米种子售价 */
export const CORN_SEED_PRICE = 15;
/** 玉米收购价 */
export const CORN_PRICE = 25;
/** 草莓种子售价 */
export const STRAWBERRY_SEED_PRICE = 50;
/** 草莓收购价 */
export const STRAWBERRY_PRICE = 80;
/** 石头收购价 */
export const STONE_PRICE = 5;
/** 铜矿收购价 */
export const COPPER_PRICE = 15;
/** 铁矿收购价 */
export const IRON_PRICE = 30;
/** 木材收购价 */
export const WOOD_PRICE = 8;

/**
 * 可出售物品 → 收购价（一键出售用）。
 * 价格全部复用上方 Economy 常量，与 ShopPanel 现有出售同一价格源，不新增第四价格源。
 * 不可售（不在表中）：种子/工具（旧锄头/旧水壶/旧斧头）/庄园钥匙/星之碎片/钻石/自动农业机器人。
 */
export const SELLABLE_ITEMS: Partial<Record<ItemType, number>> = {
  radish: RADISH_PRICE,
  tomato: TOMATO_PRICE,
  corn: CORN_PRICE,
  strawberry: STRAWBERRY_PRICE,
  stone: STONE_PRICE,
  copper: COPPER_PRICE,
  iron: IRON_PRICE,
  wood: WOOD_PRICE,
};

/** 一键出售结果 */
export interface SellAllResult {
  /** 卖出金币总额 */
  totalCoins: number;
  /** 已卖物品明细 */
  sold: { item: ItemType; name: string; count: number; earned: number }[];
  /** 跳过物品明细（FEATURE-039：reserve=保留资源 / locked=玩家锁定） */
  skipped: { item: ItemType; name: string; count: number; reason: 'reserve' | 'locked' }[];
}

/** 是否存在可出售物品（空背包/无可售时按钮禁用或提示） */
export function hasSellableItems(): boolean {
  for (const id of Object.keys(SELLABLE_ITEMS) as ItemType[]) {
    if (getItemCount(id) > 0) return true;
  }
  return false;
}

/**
 * 智能一键出售（FEATURE-039）：
 * - forbidden：不在 SELLABLE_ITEMS 中，天然跳过
 * - locked：玩家锁定的物品，跳过
 * - reserve：保留类资源（木材/石头/铁矿），跳过不自动卖
 * - normal：正常出售
 * 返回出售明细 + 跳过明细，供预览面板/ toast 使用。
 */
export function previewSellAll(): SellAllResult {
  const sold: SellAllResult['sold'] = [];
  const skipped: SellAllResult['skipped'] = [];
  let totalCoins = 0;
  for (const id of Object.keys(SELLABLE_ITEMS) as ItemType[]) {
    const count = getItemCount(id);
    if (count <= 0) continue;
    const def = getItemDef(id);
    if (isItemLocked(id)) {
      skipped.push({ item: id, name: def.name, count, reason: 'locked' });
      continue;
    }
    if (def.sellPriority === 'reserve') {
      skipped.push({ item: id, name: def.name, count, reason: 'reserve' });
      continue;
    }
    const price = SELLABLE_ITEMS[id]!;
    totalCoins += price * count;
    sold.push({ item: id, name: def.name, count, earned: price * count });
  }
  return { totalCoins, sold, skipped };
}

/** 执行智能一键出售（实际扣物品+加金币） */
export function sellAllSellable(): SellAllResult {
  const sold: SellAllResult['sold'] = [];
  const skipped: SellAllResult['skipped'] = [];
  let totalCoins = 0;
  for (const id of Object.keys(SELLABLE_ITEMS) as ItemType[]) {
    const count = getItemCount(id);
    if (count <= 0) continue;
    const def = getItemDef(id);
    // 玩家锁定的物品跳过
    if (isItemLocked(id)) {
      skipped.push({ item: id, name: def.name, count, reason: 'locked' });
      continue;
    }
    // reserve 类资源跳过（不自动卖，但保留在 SELLABLE_ITEMS 中供手动单个卖）
    if (def.sellPriority === 'reserve') {
      skipped.push({ item: id, name: def.name, count, reason: 'reserve' });
      continue;
    }
    // normal：正常出售
    const price = SELLABLE_ITEMS[id]!;
    addItem(id, -count);
    addCoins(price * count);
    totalCoins += price * count;
    sold.push({ item: id, name: def.name, count, earned: price * count });
  }
  return { totalCoins, sold, skipped };
}
