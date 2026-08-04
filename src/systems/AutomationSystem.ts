/**
 * 自动化农业系统（v0.6 庄园自动化 MVP）
 *
 * 庄园设备"自动农业机器人"：
 *   放置：在农场使用机器人道具（auto_farmer_robot）→ 部署在农田附近
 *   每日清晨：扫描机器人范围内农田 → 自动浇水 / 自动收获 / 自动补种
 *
 * 设计约束（制作人验收）：
 *   - 不修改 SaveSystem 核心结构（存档用可选字段 farm.automation，旧档无此字段正常运行）
 *   - 不修改 CropSystem 核心逻辑 / Map 数据 / 输入系统
 *   - 不复制种植逻辑：浇水/收获/播种复用 FarmState.setTileState/setCrop + Inventory.addItem/removeItem
 *   - 不触发玩家经验/每日任务（机器人劳作 ≠ 玩家劳作，避免刷经验/刷任务）
 *
 * 存档序列化：getAutomationSave / restoreAutomation（与 FarmRestore 同模式）
 */

import { addItem, getItemCount, type ItemType } from '../data/Inventory';
import { getCrop, getTileState, setCrop, setTileState, CropType, CROP_DEFS, CROP_TYPES } from '../data/FarmState';
import { getTime } from '../data/TimeSystem';

/** 机器人状态 */
export interface RobotData {
  id: string;
  /** 放置的瓦片坐标 */
  col: number;
  row: number;
  /** 扫描半径（瓦片数，Chebyshev 距离） */
  range: number;
}

/** 每日自动化结果报告 */
export interface AutomationReport {
  watered: number;
  harvested: { cropType: CropType; count: number }[];
  seeded: number;
}

/** 默认扫描半径（瓦片）。机器人放置在农田附近，默认覆盖 2*range+1 见方 */
export const DEFAULT_ROBOT_RANGE = 3;

/** 全局等级：1/2/3 */
const GLOBAL_LEVEL = { value: 1 };

/** 机器人列表（模块级单例） */
const robots: RobotData[] = [];
let seq = 0;

/** 获取全局机器人等级 */
export function getRobotLevel(): number {
  return GLOBAL_LEVEL.value;
}

/** 设置全局机器人等级 */
export function setRobotLevel(lv: number): void {
  GLOBAL_LEVEL.value = Math.max(1, Math.min(3, Math.floor(lv)));
}

/** 获取升级钻耗（返回 0 表示已满级） */
export function getUpgradeCost(): number {
  if (GLOBAL_LEVEL.value === 1) return 40;
  if (GLOBAL_LEVEL.value === 2) return 60;
  return 0;
}

/** 获取升级后的效果描述 */
export function getUpgradeEffect(): string {
  if (GLOBAL_LEVEL.value === 1) return 'Lv2：自动播种 + 范围 +1';
  if (GLOBAL_LEVEL.value === 2) return 'Lv3：处理作物数 ×2 + 范围 +2';
  return '已满级';
}

/** 按全局等级获取当前机器人扫描半径 */
export function getCurrentRange(): number {
  return DEFAULT_ROBOT_RANGE + (GLOBAL_LEVEL.value >= 3 ? 2 : GLOBAL_LEVEL.value >= 2 ? 1 : 0);
}

/** 读取所有机器人 */
export function getRobots(): RobotData[] {
  return robots;
}

/** 机器人数量 */
export function getRobotCount(): number {
  return robots.length;
}

/** 某瓦片是否已有机器人 */
export function getRobotAt(col: number, row: number): RobotData | undefined {
  return robots.find(r => r.col === col && r.row === row);
}

/** 部署机器人 */
export function addRobot(col: number, row: number, range = DEFAULT_ROBOT_RANGE): RobotData {
  const robot: RobotData = { id: `robot-${++seq}`, col, row, range };
  robots.push(robot);
  return robot;
}

/**
 * 每日自动化 tick（由 MapScene.trySleep 在 timeNextDay 后调用）
 *
 * 按全局等级扩展：
 *   Lv1：自动浇水 + 收获（DEFAULT_RANGE）
 *   Lv2：自动播种 + 范围 +1
 *   Lv3：处理作物数 ×2 + 范围 +2
 *
 * 种子优先级：radish → tomato → corn → strawberry（从低到高，用完一种换下一种）。
 * 注意：不调用 addXp / onDQ*，机器人劳作不计入玩家经验与每日任务进度。
 */
export function runDailyAutomation(): AutomationReport {
  const report: AutomationReport = { watered: 0, harvested: [], seeded: 0 };
  const harvestMap = new Map<CropType, number>();
  const level = GLOBAL_LEVEL.value;

  for (const robot of robots) {
    // 使用全局等级调整后的范围（但 RobotData.range 保持原始值，用于存档兼容）
    const effectiveRange = DEFAULT_ROBOT_RANGE + (level >= 3 ? 2 : level >= 2 ? 1 : 0);
    // 第一轮：浇水 + 收获
    const tilledAfterHarvest: [number, number][] = [];
    for (let c = robot.col - effectiveRange; c <= robot.col + effectiveRange; c++) {
      for (let r = robot.row - effectiveRange; r <= robot.row + effectiveRange; r++) {
        const state = getTileState(c, r);
        if (state === 'planted') {
          setTileState(c, r, 'watered');
          const crop = getCrop(c, r);
          if (crop) setCrop(c, r, { ...crop, watered: true });
          report.watered++;
        } else if (state === 'grown') {
          const crop = getCrop(c, r);
          const cropType = crop?.cropType ?? 'radish';
          setTileState(c, r, 'tilled');
          setCrop(c, r, undefined);
          addItem(cropType, 1);
          harvestMap.set(cropType, (harvestMap.get(cropType) ?? 0) + 1);
          tilledAfterHarvest.push([c, r]);
        }
      }
    }
    // 收获后的空地立刻尝试补种
    for (const [c, r] of tilledAfterHarvest) {
      if (tryAutoSeed(c, r)) report.seeded++;
    }

    // Lv2+: 第二轮：已有空地（玩家锄地未种 / 上轮补种后的 tilled）也尝试播种
    if (level >= 2) {
      for (let c = robot.col - effectiveRange; c <= robot.col + effectiveRange; c++) {
        for (let r = robot.row - effectiveRange; r <= robot.row + effectiveRange; r++) {
          if (getTileState(c, r) === 'tilled') {
            if (tryAutoSeed(c, r)) report.seeded++;
          }
        }
      }
    }

    // 第三轮：新播种的 planted → 浇水（让它们第二天就能生长）
    for (let c = robot.col - effectiveRange; c <= robot.col + effectiveRange; c++) {
      for (let r = robot.row - effectiveRange; r <= robot.row + effectiveRange; r++) {
        if (getTileState(c, r) === 'planted') {
          const crop = getCrop(c, r);
          if (crop && !crop.watered) {
            setTileState(c, r, 'watered');
            setCrop(c, r, { ...crop, watered: true });
            report.watered++;
          }
        }
      }
    }
  }

  // Lv3: 处理作物数翻倍（水+播种不翻倍，仅收获翻倍）
  if (level >= 3) {
    for (const [cropType, count] of harvestMap) {
      addItem(cropType, count); // 再加一份
    }
  }

  for (const [cropType, count] of harvestMap) {
    report.harvested.push({ cropType, count });
  }
  return report;
}

/**
 * 自动播种：在指定格子种背包里最便宜的可用种子。
 * 优先级 radish → tomato → corn → strawberry。成功消耗 1 颗种子，返回 true。
 */
function tryAutoSeed(col: number, row: number): boolean {
  for (const ct of CROP_TYPES) {
    const seedItem = CROP_DEFS[ct].seedItem as ItemType;
    if (getItemCount(seedItem) > 0) {
      addItem(seedItem, -1);
      setTileState(col, row, 'planted');
      setCrop(col, row, { cropType: ct, plantDay: getTime().day, watered: false });
      return true;
    }
  }
  return false;
}

/** 获取所有机器人条目（存档序列化用） */
export function getAutomationSave(): { level: number; robots: RobotData[] } {
  return { level: GLOBAL_LEVEL.value, robots: robots.map(r => ({ ...r })) };
}

/** 恢复机器人状态（存档加载用，entries 缺失 → 无机器人，level 缺失 → Lv1） */
export function restoreAutomation(data: { level?: number; robots?: RobotData[] } | undefined): void {
  robots.length = 0;
  seq = 0;
  GLOBAL_LEVEL.value = 1;
  if (!data) return;
  if (typeof data.level === 'number' && data.level >= 1 && data.level <= 3) {
    GLOBAL_LEVEL.value = Math.floor(data.level);
  }
  if (!Array.isArray(data.robots)) return;
  for (const r of data.robots) {
    if (!r || typeof r.col !== 'number' || typeof r.row !== 'number') continue;
    robots.push({
      id: typeof r.id === 'string' ? r.id : `robot-${++seq}`,
      col: Math.floor(r.col),
      row: Math.floor(r.row),
      range: typeof r.range === 'number' && r.range > 0 ? Math.floor(r.range) : DEFAULT_ROBOT_RANGE,
    });
    seq = Math.max(seq, robots.length);
  }
}
