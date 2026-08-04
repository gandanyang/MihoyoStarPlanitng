/**
 * 场景出口与出生点配置
 * 4 区域连通拓扑：
 *   森林 ──── 矿洞
 *     │        │
 *   农场 ──── 小镇
 *
 * 每个出口定义：触发区域(像素) + 目标场景 + 在目标场景的出生点(像素)
 * 出生点放在出口内侧 3 格，避免切换后立刻触发反向出口
 */

export interface ExitZone {
  /** 触发区域左上角 x（像素） */
  x: number;
  /** 触发区域左上角 y（像素） */
  y: number;
  /** 触发区域宽（像素） */
  w: number;
  /** 触发区域高（像素） */
  h: number;
  /** 目标场景 key */
  target: string;
  /** 在目标场景的出生点（像素） */
  spawn: { x: number; y: number };
}

/** 瓦片尺寸，用于把瓦片坐标换算成像素 */
const T = 16;

export const MAP_EXITS: Record<string, ExitZone[]> = {
  // 门厅：底→车站，顶→农场
  gate: [
    { x: 14 * T, y: 0,       w: 3 * T, h: 3 * T, target: 'farm',   spawn: { x: 15 * T, y: 6 * T } },
  ],
  // 农场：顶→森林，右→小镇，左下木屋门→室内
  // 出口区域 3x3 格，方便玩家触发
  farm: [
    { x: 14 * T, y: 0,       w: 3 * T, h: 3 * T, target: 'forest', spawn: { x: 15 * T, y: 17 * T } },
    { x: 37 * T, y: 9 * T,   w: 3 * T, h: 3 * T, target: 'town',   spawn: { x: 3 * T,  y: 10 * T } },
    { x: 5 * T,  y: 18 * T,  w: 3 * T, h: 3 * T, target: 'house',  spawn: { x: 10 * T, y: 12 * T } },
  ],
  // 森林：底→农场，右→矿洞
  // 注意：返回农场的出生点 y 必须 > 农场顶部出口区域下边界(48px)，否则一帧内被弹回
  forest: [
    { x: 14 * T, y: 18 * T,  w: 2 * T, h: 2 * T, target: 'farm',   spawn: { x: 15 * T, y: 6 * T } },
    { x: 28 * T, y: 9 * T,   w: 2 * T, h: 2 * T, target: 'mine',   spawn: { x: 3 * T,  y: 10 * T } },
  ],
  // 小镇：左→农场，顶→矿洞
  town: [
    { x: 0,      y: 9 * T,   w: 2 * T, h: 2 * T, target: 'farm',   spawn: { x: 27 * T, y: 10 * T } },
    { x: 14 * T, y: 0,       w: 2 * T, h: 2 * T, target: 'mine',   spawn: { x: 15 * T, y: 17 * T } },
  ],
  // 矿洞：底→小镇，左→森林
  mine: [
    { x: 14 * T, y: 18 * T,  w: 2 * T, h: 2 * T, target: 'town',   spawn: { x: 15 * T, y: 3 * T } },
    { x: 0,      y: 9 * T,   w: 2 * T, h: 2 * T, target: 'forest', spawn: { x: 27 * T, y: 10 * T } },
  ],
  // 室内：底部门→农场
  house: [
    { x: 9 * T,  y: 14 * T,  w: 2 * T, h: 1 * T, target: 'farm',   spawn: { x: 7 * T,  y: 10 * T } },
  ],
};

/** 场景 key → 中文名称（HUD 显示用） */
export const MAP_NAMES: Record<string, string> = {
  farm: '农场',
  town: '青禾镇',
  forest: '后山',
  mine: '矿洞',
  house: '家中',
};
