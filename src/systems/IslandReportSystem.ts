/**
 * 归星岛复苏报告（v0.6 第一章体验收尾，制作人 2026-08-03 拍板进入实现）
 *
 * 定位：不是数值结算（不要 金币+500 / 等级+2），而是
 *   "告诉玩家：你的行为改变了世界。"
 * 二游化 / 生活化：分土地 / 居民 / 农业 / 未来 四段，每段一段白描 + 一个评价。
 *
 * 设计约束（制作人拍板）：
 *   - 零新存档字段：只聚合现有数据（farmRestore / 背包作物 / 每日任务领奖 / 开垦格 / 等级 / 天数）
 *   - 纯计算：generateIslandReport()，无副作用，无 IO
 *   - 评价文案遵循剧情权限：本文件为制作人定稿文案，Agent 不得自行扩写
 */

import { getRestoreEntries } from '../data/FarmRestore';
import { getItemCount } from '../data/Inventory';
import { getDailyQuests } from './DailyQuestSystem';
import { getLevel } from '../data/FarmProgress';
import { getTime } from '../data/TimeSystem';

/** 报告的一段：标题 + 白描 + 评价 */
export interface IslandReportSection {
  /** 段标题（土地 / 居民 / 农业 / 未来） */
  title: string;
  /** 段标题下的装饰图标 */
  icon: string;
  /** 一段白描（描述玩家做了什么） */
  desc: string;
  /** 评价（制作人定稿文案） */
  verdict: string;
}

/** 完整复苏报告 */
export interface IslandReport {
  sections: IslandReportSection[];
}

/**
 * 生成归星岛复苏报告（纯计算，零副作用）。
 * 所有数据来自现有模块状态，不新增存档字段。
 */
export function generateIslandReport(): IslandReport {
  const restore = getRestoreEntries();
  const gardenRestored = restore['garden'] === true;

  // 背包作物总数（当前持有，作为"土地上长出了东西"的代理）
  const cropTotal =
    getItemCount('radish') + getItemCount('tomato') + getItemCount('corn') + getItemCount('strawberry');

  // 帮助居民 = 已领奖的对话任务数（talk_* claimed = 与居民建立了互动）
  const quests = getDailyQuests();
  const npcHelped = quests.filter((q) => q.claimed && q.objective.type === 'talk_npc').length;
  const questsDone = quests.filter((q) => q.claimed).length;

  const level = getLevel();
  const day = getTime().day;

  // ============ 四段报告 ============

  // 土地：花园恢复 → 新生；未恢复 → 还在等待
  const landSection: IslandReportSection = gardenRestored
    ? {
        title: '土地',
        icon: '🌱',
        desc: '曾经荒废的旧花园，重新开出了花。',
        verdict: '新生',
      }
    : {
        title: '土地',
        icon: '🌱',
        desc: '你洒下的第一批种子，正在泥土里醒来。',
        verdict: '萌芽',
      };

  // 居民：有对话互动 → 有人回来了；没有 → 还在结识
  const residentSection: IslandReportSection =
    npcHelped > 0 || questsDone > 0
      ? {
          title: '居民',
          icon: '🏡',
          desc: npcHelped > 0
            ? `你重新让沉寂的小岛恢复了交流。`
            : `你已经开始在这座岛留下足迹。`,
          verdict: '有人回来了',
        }
      : {
          title: '居民',
          icon: '🏡',
          desc: '这座小岛的故事，正等待被倾听。',
          verdict: '初见',
        };

  // 农业：有作物/等级 → 初具规模；没有 → 播种之日
  const farmSection: IslandReportSection =
    cropTotal > 0 || level > 1
      ? {
          title: '农业',
          icon: '🌾',
          desc: '从一片空地，到能够孕育生命的庄园。',
          verdict: '初具规模',
        }
      : {
          title: '农业',
          icon: '🌾',
          desc: '第一片田已经翻好，等待种子。',
          verdict: '播种之日',
        };

  // 未来：固定展望（制作人定稿）
  const futureSection: IslandReportSection = {
    title: '未来',
    icon: '🌌',
    desc: `还有更多地方等待被发现。第 ${day} 天，故事仍在继续。`,
    verdict: '未完待续',
  };

  return {
    sections: [landSection, residentSection, farmSection, futureSection],
  };
}
