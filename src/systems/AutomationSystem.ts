/**
 * 自动化农业系统（v0.6 庄园自动化 MVP）
 *
 * 庄园设备"自动农业机器人"：
 *   放置：在农场使用机器人道具（auto_farmer_robot）→ 部署在农田附近
 *   每日清晨：扫描机器人范围内农田 → 自动浇水 / 自动收获
 *
 * 设计约束（制作人验收）：
 *   - 不修改 SaveSystem 核心结构（存档用可选字段 farm.automation，旧档无此字段正常运行）
 *   - 不修改 CropSystem 核心逻辑 / Map 数据 / 输入系统
 *   - 不复制种植逻辑：浇水/收获复用 FarmState.setTileState/setCrop + Inventory.addItem
 *   - 不触发玩家经验/每日任务（机器人劳作 ≠ 玩家劳作，避免刷经验/刷任务）
 *
 * 存档序列化：getAutomationSave / restoreAutomation（与 FarmRestore 同模式）
 */

import { addItem } from '../data/Inventory';
import { getCrop, getTileState, setCrop, setTileState, CropType } from '../data/FarmState';

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
}

/** 默认扫描半径（瓦片）。机器人放置在农田附近，默认覆盖 2*range+1 见方 */
export const DEFAULT_ROBOT_RANGE = 3;

/** 机器人列表（模块级单例） */
const robots: RobotData[] = [];
let seq = 0;

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
 * 扫描每个机器人范围内的农田格：
 *   planted（已种植未浇水）→ 浇水 → watered
 *   grown（成熟）→ 收获 → 背包 +1 作物
 *
 * 注意：不调用 addXp / onDQ*，机器人劳作不计入玩家经验与每日任务进度。
 */
export function runDailyAutomation(): AutomationReport {
  const report: AutomationReport = { watered: 0, harvested: [] };
  const harvestMap = new Map<CropType, number>();

  for (const robot of robots) {
    for (let c = robot.col - robot.range; c <= robot.col + robot.range; c++) {
      for (let r = robot.row - robot.range; r <= robot.row + robot.range; r++) {
        const state = getTileState(c, r);
        if (state === 'planted') {
          // 已种植未浇水 → 自动浇水
          setTileState(c, r, 'watered');
          const crop = getCrop(c, r);
          if (crop) setCrop(c, r, { ...crop, watered: true });
          report.watered++;
        } else if (state === 'grown') {
          // 成熟 → 自动收获（复用玩家收获逻辑的数据层）
          const crop = getCrop(c, r);
          const cropType = crop?.cropType ?? 'radish';
          setTileState(c, r, 'tilled');
          setCrop(c, r, undefined);
          addItem(cropType, 1);
          harvestMap.set(cropType, (harvestMap.get(cropType) ?? 0) + 1);
        }
      }
    }
  }

  for (const [cropType, count] of harvestMap) {
    report.harvested.push({ cropType, count });
  }
  return report;
}

/** 获取所有机器人条目（存档序列化用） */
export function getAutomationSave(): { robots: RobotData[] } {
  return { robots: robots.map(r => ({ ...r })) };
}

/** 恢复机器人状态（存档加载用，entries 缺失 → 无机器人） */
export function restoreAutomation(data: { robots?: RobotData[] } | undefined): void {
  robots.length = 0;
  seq = 0;
  if (!data || !Array.isArray(data.robots)) return;
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
