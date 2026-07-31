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
