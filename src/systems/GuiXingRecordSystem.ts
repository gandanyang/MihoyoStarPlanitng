/**
 * 《归星记录》系统（v0.6 · 制作人定稿 v0.4）
 *
 * 定位：不是"结算"，是"记录"——像爷爷留下来的笔记本。
 * 核心目标不是评价玩家效率，而是记录玩家对归星岛造成的改变。
 *
 * 设计约束（制作人拍板）：
 *   - 零新存档字段：只聚合现有数据
 *   - 纯计算：generateRecord() 无副作用
 *   - 叙事文案 = 制作人定稿，Agent 不得自行扩写
 *   - 不做排行榜/百分比/效率评价
 */

import { getRestoreEntries } from '../data/FarmRestore';
import { getItemCount } from '../data/Inventory';
import { getAllTileEntries } from '../data/FarmState';
import { getDailyQuests } from './DailyQuestSystem';
import { getTime } from '../data/TimeSystem';

// ============ 事件标签系统 ============

/** 归星记录事件标签（替代数值权重，由游戏行为自然触发） */
export type GuiXingTag =
  | 'first_plant'
  | 'first_harvest'
  | 'restore_garden'
  | 'help_resident'
  | 'stargaze_night'
  | 'obtain_manor_key'
  | 'has_crops'
  | 'has_robot'
  | 'old_tree_memory';

// ============ 数据结构 ============

/** 归星记录的一个段落 */
export interface GuiXingSection {
  icon: string;
  title: string;
  narrative: string;
  entries: string[];
}

/** 归星印象（情感称号，不用 S/A/B/C 评分） */
export interface GuiXingImpression {
  title: string;
  desc: string;
}

/** 昨日→今日变化高亮 */
export interface GuiXingChangeHighlight {
  before: string;
  after: string;
  summary: string;
}

/** 完整归星记录 */
export interface GuiXingRecord {
  day: number;
  sections: GuiXingSection[];
  impression: GuiXingImpression;
  changeHighlight?: GuiXingChangeHighlight;
}

// ============ 事件标签追踪（运行时，不入存档） ============

const triggeredTags = new Set<GuiXingTag>();

/** 触发事件标签（MapScene 在对应事件发生时调用） */
export function triggerTag(tag: GuiXingTag): void {
  triggeredTags.add(tag);
}

/** 获取已触发的标签（只读） */
export function getTriggeredTags(): ReadonlySet<GuiXingTag> {
  return triggeredTags;
}

/** 清空标签（新一天/重新开始时调用） */
export function clearTags(): void {
  triggeredTags.clear();
}

// ============ 辅助计算 ============

/** 计算耕种进度（已开垦格 / 总 12 格） */
function getFarmProgress(): number {
  const tilled = getAllTileEntries().filter(([, state]) => state === 'tilled' || state === 'planted' || state === 'watered' || state === 'grown').length;
  return tilled / 12;
}

/** 获取背包作物总数 */
function getCropTotal(): number {
  return getItemCount('radish') + getItemCount('tomato') + getItemCount('corn') + getItemCount('strawberry');
}

// ============ 印象计算（三档递进 + 动态扩展空间） ============

/**
 * 计算归星印象。
 * 三档基础：初见希望 → 新的开始 → 归星之地
 * 后期可按 tag 组合扩展动态印象。
 */
export function getImpression(tags: GuiXingTag[]): GuiXingImpression {
  const gardenRestored = tags.includes('restore_garden');
  const farmProgress = getFarmProgress();
  const npcHelped = tags.includes('help_resident');

  // 归星之地：花园恢复 + 帮助居民 + 耕种过半
  if (gardenRestored && npcHelped && farmProgress >= 0.5) {
    return {
      title: '归星之地',
      desc: '你让一座沉睡的庄园重新有了灯火。这里不再只是爷爷留下的土地，而是属于你的家园。',
    };
  }

  // 新的开始：花园恢复 OR 耕种过半
  if (gardenRestored || farmProgress >= 0.5) {
    return {
      title: '新的开始',
      desc: '爷爷曾经走过的路，今天又有人继续走下去了。',
    };
  }

  // 初见希望：默认
  return {
    title: '初见希望',
    desc: '你修复了一片荒废的土地。过去，你习惯让机器替你完成一切。但今天，你发现：有些事情，只有亲手完成才有意义。',
  };
}

// ============ 五段记录生成 ============

/**
 * 生成归星记录（纯计算，零副作用）。
 * 触发时机：观星完成后，次日清晨弹出。
 */
export function generateGuiXingRecord(): GuiXingRecord {
  const day = getTime().day;
  const tags = Array.from(triggeredTags);
  const restore = getRestoreEntries();
  const gardenRestored = restore['garden'] === true;

  // 统计数据
  const cropTotal = getCropTotal();
  const quests = getDailyQuests();
  const npcHelped = quests.filter((q) => q.claimed && q.objective.type === 'talk_npc').length;
  const questsDone = quests.filter((q) => q.claimed).length;
  const hasManorKey = getItemCount('manor_key') > 0;

  // ============ 🌱 土地 ============
  const landSection: GuiXingSection = gardenRestored
    ? {
        icon: '🌱',
        title: '土地',
        narrative: '曾经荒废的土地，重新迎来了第一颗种子。',
        entries: [
          `恢复农田 × 1`,
          `收获作物 × ${cropTotal}`,
        ].filter((e) => !e.endsWith('× 0')),
      }
    : {
        icon: '🌱',
        title: '土地',
        narrative: '你洒下的第一批种子，正在泥土里醒来。',
        entries: [
          `收获作物 × ${cropTotal}`,
        ].filter((e) => !e.endsWith('× 0')),
      };

  // ============ 🌸 记忆 ============
  const oldTreeFound = tags.includes('old_tree_memory');
  const memorySection: GuiXingSection = {
    icon: '🌸',
    title: '记忆',
    narrative: '有些地方，并不是坏掉了。\n只是等待有人重新走进去。',
    entries: [
      ...(gardenRestored ? ['完成：爷爷的旧花园'] : []),
      ...(oldTreeFound ? ['发现：爷爷种下的老树'] : []),
    ],
  };

  // ============ 🏡 庄园 ============
  const manorSection: GuiXingSection =
    hasManorKey || gardenRestored
      ? {
          icon: '🏡',
          title: '庄园',
          narrative: '这座沉睡许久的庄园，终于有了第一盏灯。',
          entries: [],
        }
      : {
          icon: '🏡',
          title: '庄园',
          narrative: '庄园的门还关着。也许，是时候找一把钥匙了。',
          entries: [],
        };

  // ============ 👥 羁绊 ============
  const bondSection: GuiXingSection =
    npcHelped > 0 || questsDone > 0
      ? {
          icon: '👥',
          title: '羁绊',
          narrative: '他们开始相信，这个突然出现的年轻人，\n也许真的能改变这里。',
          entries: npcHelped > 0 ? [`帮助居民 × ${npcHelped}`] : [],
        }
      : {
          icon: '👥',
          title: '羁绊',
          narrative: '这座小岛的故事，正等待被倾听。',
          entries: [],
        };

  // ============ ⭐ 评价 ============
  const impression = getImpression(tags);
  const impressionSection: GuiXingSection = {
    icon: '⭐',
    title: '评价',
    narrative: `「${impression.title}」\n\n${impression.desc}`,
    entries: [],
  };

  // ============ 变化高亮 ============
  const changeHighlight = buildChangeHighlight(tags, npcHelped, cropTotal);

  return {
    day,
    sections: [landSection, memorySection, manorSection, bondSection, impressionSection],
    impression,
    changeHighlight,
  };
}

// ============ 变化对比（昨日→今日） ============

function buildChangeHighlight(
  tags: GuiXingTag[],
  npcHelped: number,
  cropTotal: number,
): GuiXingChangeHighlight | undefined {
  const gardenRestored = tags.includes('restore_garden');
  // 只在有显著变化时显示
  if (!gardenRestored && npcHelped === 0 && cropTotal === 0) return undefined;

  const changes: string[] = [];
  if (gardenRestored) changes.push('+1 处空间恢复');
  if (npcHelped > 0) changes.push(`+${npcHelped} 位居民记住这里`);
  if (cropTotal > 0) changes.push(`收获了 ${cropTotal} 个作物`);

  return {
    before: gardenRestored ? '🌱 荒废花园' : '🌱 荒芜土地',
    after: gardenRestored ? '🌸 花园重新开放' : '🌿 土地开始苏醒',
    summary: changes.join('\n'),
  };
}
