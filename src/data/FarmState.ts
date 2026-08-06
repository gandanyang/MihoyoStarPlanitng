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

/** 作物类型 */
export type CropType = 'radish' | 'tomato' | 'corn' | 'strawberry';

/** 作物基础属性 */
export interface CropDef {
  name: string;
  icon: string;
  /** 种子物品 ID */
  seedItem: string;
  /** 成熟所需天数（浇水后） */
  growthDays: number;
  /** 种子商店价格 */
  seedPrice: number;
  /** 作物出售价格 */
  sellPrice: number;
}

/** 作物属性表 */
export const CROP_DEFS: Record<CropType, CropDef> = {
  radish: { name: '萝卜', icon: '🥕', seedItem: 'radish_seed', growthDays: 1, seedPrice: 10, sellPrice: 15 },
  tomato: { name: '番茄', icon: '🍅', seedItem: 'tomato_seed', growthDays: 2, seedPrice: 20, sellPrice: 35 },
  corn: { name: '玉米', icon: '🌽', seedItem: 'corn_seed', growthDays: 3, seedPrice: 15, sellPrice: 25 },
  strawberry: { name: '草莓', icon: '🍓', seedItem: 'strawberry_seed', growthDays: 3, seedPrice: 50, sellPrice: 80 },
};

/** 所有作物类型列表（按索引顺序，与 spritesheet 行对应） */
export const CROP_TYPES: CropType[] = ['radish', 'tomato', 'corn', 'strawberry'];

/** 获取作物类型在 spritesheet 中的行索引（0=radish, 1=tomato, 2=corn） */
export function getCropTypeIndex(cropType: CropType): number {
  return CROP_TYPES.indexOf(cropType);
}

/**
 * 农田可耕区域（瓦片坐标，闭区间）
 * 与 tools/gen_map_assets.py 中 gen_farm 的 G_SOIL 填充一致：
 *   fill_farm_rect(ground, 12, 8, 28, 16, G_SOIL)
 */
export const FARM_AREA = {
  col0: 12,
  row0: 8,
  col1: 28,
  row1: 16,
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

// ---------------- 种子库存（已迁移到 Inventory 系统） ----------------

/** @deprecated 请使用 Inventory.addItem/getItemCount */
export function getSeedCount(): number { return 0; }
export function useSeed(): boolean { return false; }
export function addSeeds(_n: number): void { /* no-op */ }
export function setSeedCount(_n: number): void { /* no-op */ }

// ---------------- 作物数据（Phase 3.2 起） ----------------

/**
 * 作物数据
 * plantDay：播种时的游戏天数
 * cropType：作物类型
 * watered：当天是否已浇水（成长条件）
 */
export interface CropData {
  cropType: CropType;
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

// ---------------- 存档序列化 ----------------

/** 树木状态 */
export interface TreeState {
  col: number;
  row: number;
  health: number;
  isStump: boolean;
}

/** 树木最大生命值（砍 3 次倒下） */
export const TREE_MAX_HEALTH = 3;

/** 树桩刷新间隔（每 3 天树桩恢复为树） */
export const TREE_REFRESH_INTERVAL = 3;

/** 农场树木固定位置（28 棵，沿边缘自然分布，农田区域保持开阔） */
export const FARM_TREE_POSITIONS: { col: number; row: number }[] = [
  // ── 西北角（密集，形成自然边界） ──
  { col: 1, row: 2 }, { col: 2, row: 3 }, { col: 3, row: 2 },
  { col: 1, row: 5 }, { col: 3, row: 6 },
  // ── 北侧边缘（稀疏散落） ──
  { col: 8, row: 2 }, { col: 15, row: 2 }, { col: 25, row: 2 },
  { col: 32, row: 3 },
  // ── 东北角 ──
  { col: 37, row: 2 }, { col: 38, row: 3 }, { col: 37, row: 5 },
  // ── 西侧边缘（沿墙） ──
  { col: 1, row: 8 }, { col: 2, row: 12 }, { col: 1, row: 16 },
  { col: 2, row: 20 },
  // ── 东侧边缘（通往小镇方向） ──
  { col: 39, row: 5 }, { col: 38, row: 10 }, { col: 39, row: 15 },
  { col: 38, row: 19 },
  // ── 南侧（室内入口两侧） ──
  { col: 3, row: 20 }, { col: 8, row: 21 }, { col: 13, row: 20 },
  { col: 30, row: 21 }, { col: 35, row: 20 }, { col: 39, row: 21 },
];

/** 树木状态表：key = "col,row" */
const trees = new Map<string, TreeState>();

/** 初始化所有树木为满血状态 */
export function initTrees(): void {
  trees.clear();
  for (const pos of FARM_TREE_POSITIONS) {
    trees.set(`${pos.col},${pos.row}`, {
      col: pos.col,
      row: pos.row,
      health: TREE_MAX_HEALTH,
      isStump: false,
    });
  }
}

/** 获取某棵树的状态 */
export function getTree(col: number, row: number): TreeState | undefined {
  return trees.get(`${col},${row}`);
}

/** 砍树：减少生命值，返回是否砍倒 */
export function chopTree(col: number, row: number): boolean {
  const tree = trees.get(`${col},${row}`);
  if (!tree || tree.isStump) return false;
  tree.health--;
  if (tree.health <= 0) {
    tree.isStump = true;
    return true; // 树倒了
  }
  return false; // 还没倒
}

/** 刷新所有树桩为满血树（每 TREE_REFRESH_INTERVAL 天调用一次） */
export function refreshStumps(): void {
  for (const tree of trees.values()) {
    if (tree.isStump) {
      tree.isStump = false;
      tree.health = TREE_MAX_HEALTH;
    }
  }
}

/** 获取所有树木条目（存档序列化用） */
export function getAllTreeEntries(): [string, TreeState][] {
  return Array.from(trees.entries());
}

/** 恢复树木状态（存档恢复用） */
export function restoreTreeEntries(entries: [string, TreeState][]): void {
  for (const [key, state] of entries) {
    trees.set(key, state);
  }
}

/** 获取所有土地状态条目（存档序列化用） */
export function getAllTileEntries(): [string, TileState][] {
  return Array.from(tiles.entries());
}

/** 获取所有作物条目（存档序列化用） */
export function getAllCropEntries(): [string, CropData][] {
  return Array.from(crops.entries());
}

/** 清空所有土地和作物状态（存档恢复前调用） */
export function clearAllTiles(): void {
  tiles.clear();
  crops.clear();
}

/** 恢复土地状态（存档恢复用） */
export function restoreTileEntries(entries: [string, TileState][]): void {
  for (const [key, state] of entries) {
    tiles.set(key, state);
  }
}

/** 恢复作物状态（存档恢复用） */
export function restoreCropEntries(entries: [string, CropData][]): void {
  for (const [key, crop] of entries) {
    crops.set(key, crop);
  }
}

// ---------------- 成长结算 ----------------

/**
 * 每日成长结算接口（由 TimeSystem.nextDay 调用）
 *
 * 成长规则：
 *   每种作物需 plantDay + growthDays <= newDay 且 watered=true 才成熟
 *
 * @param newDay 推进后的新天数
 */
export function advanceDay(newDay: number): void {
  for (const [key, crop] of crops) {
    const def = CROP_DEFS[crop.cropType];
    const [col, row] = key.split(',').map(Number);
    if (crop.watered && crop.plantDay + def.growthDays <= newDay) {
      if (getTileState(col, row) !== 'grown') {
        setTileState(col, row, 'grown');
      }
    } else if (crop.watered) {
      // 多日作物：已浇水但未成熟，重置为 planted 以便次日再浇水
      setTileState(col, row, 'planted');
      setCrop(col, row, { ...crop, watered: false });
    }
  }
}