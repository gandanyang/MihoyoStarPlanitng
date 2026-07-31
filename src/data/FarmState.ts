/**
 * 农田土地状态（Phase 3.1）
 *
 * 全局模块级单例：场景切换离开农场再回来，已锄/已种的地块状态保留。
 * 刷新页面后重置（0.1 版本不做 localStorage 持久化）。
 *
 * 状态流转（Phase 3 全流程）：
 *   empty → tilled → planted → watered → grown → (收获回 empty)
 *   Phase 3.1 仅实现 empty ↔ tilled。
 */

/** 土地格子状态 */
export type TileState = 'empty' | 'tilled' | 'watered' | 'planted' | 'grown';

/**
 * 农田可耕区域（瓦片坐标，闭区间）
 * 与 tools/gen_map_assets.py 中 gen_farm 的 G_SOIL 填充一致：
 *   fill_rect(ground, 11, 8, 18, 12, G_SOIL)
 */
export const FARM_AREA = {
  col0: 11,
  row0: 8,
  col1: 18,
  row1: 12,
};

/** 瓦片尺寸（像素） */
export const TILE_SIZE = 16;

/** 判断某瓦片坐标是否在农田可耕区域内 */
export function isInFarmArea(col: number, row: number): boolean {
  return (
    col >= FARM_AREA.col0 &&
    col <= FARM_AREA.col1 &&
    row >= FARM_AREA.row0 &&
    row <= FARM_AREA.row1
  );
}

/** 瓦片坐标 → 存储 key */
function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** 全局土地状态表：key = "col,row" */
const tiles = new Map<string, TileState>();

/** 读取某格状态，未记录视为 empty */
export function getTileState(col: number, row: number): TileState {
  return tiles.get(tileKey(col, row)) ?? 'empty';
}

/** 设置某格状态 */
export function setTileState(
  col: number,
  row: number,
  state: TileState
): void {
  tiles.set(tileKey(col, row), state);
}

// ---------------- 作物数据（Phase 3.2 起） ----------------

/**
 * 作物数据
 * plantDay：播种时的游戏天数（Phase 4 时间系统接入后由时间系统传入，0.1 暂记 0）
 * cropType：作物类型（0.1 只有萝卜 radish）
 * watered：当天是否已浇水（成长条件，Phase 3.3 起）
 */
export interface CropData {
  cropType: 'radish';
  plantDay: number;
  watered: boolean;
}

/** 作物数据表：key = "col,row"，仅 planted/watered/grown 状态有值 */
const crops = new Map<string, CropData>();

/** 读取某格作物数据 */
export function getCrop(col: number, row: number): CropData | undefined {
  return crops.get(tileKey(col, row));
}

/** 设置某格作物数据（传 undefined 清除） */
export function setCrop(
  col: number,
  row: number,
  crop: CropData | undefined
): void {
  if (crop) {
    crops.set(tileKey(col, row), crop);
  } else {
    crops.delete(tileKey(col, row));
  }
}

// ---------------- 种子库存（Phase 3.2） ----------------

/** 初始萝卜种子数量（写死，0.1 不做背包/商店） */
const INITIAL_SEEDS = 5;

/** 当前萝卜种子数量 */
let seedCount = INITIAL_SEEDS;

/** 读取当前种子数量 */
export function getSeedCount(): number {
  return seedCount;
}

/**
 * 消耗一颗种子播种
 * @returns true 成功；false 种子不足
 */
export function useSeed(): boolean {
  if (seedCount <= 0) return false;
  seedCount -= 1;
  return true;
}

// ---------------- 日期与成长（Phase 3.4） ----------------

/**
 * 当前游戏天数（默认第 1 天）
 * Phase 3.4 仅提供简单日期状态与 debug 推进接口；
 * Phase 4 将由 TimeSystem 驱动真实时间流逝与跨天。
 */
let currentDay = 1;

/** 读取当前天数 */
export function getCurrentDay(): number {
  return currentDay;
}

/**
 * 推进到下一天（Debug 用，Phase 4 将由 TimeSystem 驱动）
 * 同时做作物成长判定：
 *   萝卜：plantDay + 1 <= currentDay 且 watered=true → 状态变 grown
 *   （即播种次日且已浇水即成熟）
 * @returns 新的当前天数
 */
export function advanceDay(): number {
  currentDay += 1;
  // 成长判定：遍历所有作物，满足条件则置为 grown
  for (const [key, crop] of crops) {
    if (crop.watered && crop.plantDay + 1 <= currentDay) {
      const [col, row] = key.split(',').map(Number);
      if (getTileState(col, row) !== 'grown') {
        setTileState(col, row, 'grown');
      }
    }
  }
  return currentDay;
}
