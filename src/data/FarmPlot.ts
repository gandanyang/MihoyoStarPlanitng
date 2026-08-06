/**
 * 农田区域（FarmPlot）定义（种植区域交互优化 v0.1）
 *
 * FarmPlot 是"玩家看到的一整块田"的交互概念层：
 *   把 17×9 的 FARM_AREA 划分成 2×2 网格 4 块（A/B/C/D）。
 *
 * 设计原则：
 *   - 纯静态定义，不新增数据表、不落存档 → 原存档天然兼容。
 *   - 底层仍是 Tile 级数据结构（FarmState 的 tiles/crops），Plot 只是交互视图。
 *   - CropData / TileState 完全不变。
 *
 * 分区（与 FARM_AREA = col 12-28, row 8-16 完全吻合，无缝隙无重叠）：
 *   A: col 12-20, row 8-12  → 9×5 = 45 格
 *   B: col 21-28, row 8-12  → 8×5 = 40 格
 *   C: col 12-20, row 13-16 → 9×4 = 36 格
 *   D: col 21-28, row 13-16 → 8×4 = 32 格
 *   总计 153 格
 */

import {
  FARM_AREA,
  TILE_SIZE,
  getTileState,
  isInFarmArea,
  type TileState,
} from './FarmState';

/** 农田区域 ID */
export type FarmPlotId = 'A' | 'B' | 'C' | 'D';

/** Plot 瓦片范围（闭区间） */
export interface FarmPlotBounds {
  col0: number;
  row0: number;
  col1: number;
  row1: number;
}

/** 所有 Plot 定义（2×2 网格） */
export const FARM_PLOTS: Record<FarmPlotId, FarmPlotBounds> = {
  A: { col0: 12, row0: 8, col1: 20, row1: 12 },
  B: { col0: 21, row0: 8, col1: 28, row1: 12 },
  C: { col0: 12, row0: 13, col1: 20, row1: 16 },
  D: { col0: 21, row0: 13, col1: 28, row1: 16 },
};

/** 固定遍历顺序 */
export const PLOT_IDS: FarmPlotId[] = ['A', 'B', 'C', 'D'];

/** 世界坐标瓦片 → 所属 Plot（不在农田区域返回 null） */
export function getPlotAt(col: number, row: number): FarmPlotId | null {
  if (!isInFarmArea(col, row)) return null;
  for (const id of PLOT_IDS) {
    const b = FARM_PLOTS[id];
    if (col >= b.col0 && col <= b.col1 && row >= b.row0 && row <= b.row1) return id;
  }
  return null;
}

/** 获取 Plot 内所有瓦片坐标（行优先） */
export function getPlotTiles(plotId: FarmPlotId): { col: number; row: number }[] {
  const b = FARM_PLOTS[plotId];
  const tiles: { col: number; row: number }[] = [];
  for (let r = b.row0; r <= b.row1; r++) {
    for (let c = b.col0; c <= b.col1; c++) {
      tiles.push({ col: c, row: r });
    }
  }
  return tiles;
}

/** Plot 状态统计（供批量路由判定优先级与配色） */
export interface PlotSummary {
  empty: number;
  tilled: number;
  planted: number;
  watered: number;
  grown: number;
  total: number;
  /** 有可收获的成熟作物 */
  hasGrown: boolean;
  /** 有已播种待浇水的作物 */
  hasPlanted: boolean;
  /** 有锄好待播种的地 */
  hasTilled: boolean;
  /** 有空地可锄 */
  hasEmpty: boolean;
}

/** 统计某 Plot 内各状态格数（实时读取 FarmState，不缓存） */
export function getPlotSummary(plotId: FarmPlotId): PlotSummary {
  const s: PlotSummary = {
    empty: 0, tilled: 0, planted: 0, watered: 0, grown: 0,
    total: 0, hasGrown: false, hasPlanted: false, hasTilled: false, hasEmpty: false,
  };
  for (const { col, row } of getPlotTiles(plotId)) {
    const st: TileState = getTileState(col, row);
    if (st === 'empty') s.empty++;
    else if (st === 'tilled') s.tilled++;
    else if (st === 'planted') s.planted++;
    else if (st === 'watered') s.watered++;
    else if (st === 'grown') s.grown++;
    s.total++;
  }
  s.hasGrown = s.grown > 0;
  s.hasPlanted = s.planted > 0;
  s.hasTilled = s.tilled > 0;
  s.hasEmpty = s.empty > 0;
  return s;
}

/** Plot 像素矩形（世界坐标，含 1px 描边外扩空间） */
export function getPlotRect(plotId: FarmPlotId): { x: number; y: number; width: number; height: number } {
  const b = FARM_PLOTS[plotId];
  return {
    x: b.col0 * TILE_SIZE,
    y: b.row0 * TILE_SIZE,
    width: (b.col1 - b.col0 + 1) * TILE_SIZE,
    height: (b.row1 - b.row0 + 1) * TILE_SIZE,
  };
}

/** Plot 中心像素坐标（飘字/特效基准点） */
export function getPlotCenter(plotId: FarmPlotId): { x: number; y: number } {
  const r = getPlotRect(plotId);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** 自检：四个 Plot 是否恰好覆盖 FARM_AREA（开发期校验，防止分区漂移） */
export function validatePlotCoverage(): { ok: boolean; message: string } {
  const total = PLOT_IDS.reduce((sum, id) => sum + getPlotTiles(id).length, 0);
  const area = (FARM_AREA.col1 - FARM_AREA.col0 + 1) * (FARM_AREA.row1 - FARM_AREA.row0 + 1);
  if (total !== area) return { ok: false, message: `Plot 格数 ${total} ≠ 农田面积 ${area}` };
  for (let r = FARM_AREA.row0; r <= FARM_AREA.row1; r++) {
    for (let c = FARM_AREA.col0; c <= FARM_AREA.col1; c++) {
      if (!getPlotAt(c, r)) return { ok: false, message: `(${c},${r}) 无归属 Plot` };
    }
  }
  return { ok: true, message: `Plot 覆盖校验通过（${total} 格）` };
}
