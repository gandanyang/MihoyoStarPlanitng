/**
 * 经济系统（Phase 0.2）
 *
 * 金币 + 商品价格。0.2 版本形成「种萝卜 → 收获 → 卖钱 → 买种子」正循环：
 *   买 1 颗种子 10G → 收 1 个萝卜卖 15G → 净赚 5G
 *
 * 全局模块级单例：金币跨场景保留，刷新页面后重置（同 FarmState 约定）。
 */

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