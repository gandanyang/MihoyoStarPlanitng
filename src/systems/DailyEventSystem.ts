/**
 * 日常事件系统（归星岛复兴循环 v0.10）
 *
 * 每天有概率触发随机事件，让世界感觉更生动。
 * 事件基于 岛屿状态 × 关系状态 触发。
 */

import { type DialogueLine, COLORS } from './StorySystem';
import { getTime } from '../data/TimeSystem';
import { isRestored } from '../data/FarmRestore';
import { getQuestState } from './QuestSystem';

/** 日常事件定义 */
export interface DailyEvent {
  /** 事件唯一 ID */
  id: string;
  /** 显示名（调试用） */
  name: string;
  /** 触发条件（返回 true 才能触发） */
  condition: () => boolean;
  /** 事件对话 */
  dialogue: DialogueLine[];
  /** 事件效果（触发后执行） */
  effect?: () => void;
  /** 触发权重（越高越容易触发，默认 1） */
  weight?: number;
}

/** 获取村民信任度（简化版，基于完成的日常任务数量） */
function getVillagerTrust(): number {
  // 临时实现：基于主线进度
  const state = getQuestState();
  if (state === 'completed') return 100;
  if (state === 'collected') return 60;
  if (state === 'accepted') return 30;
  return 0;
}

/** 日常事件池 */
export const DAILY_EVENTS: DailyEvent[] = [
  // ── 村长事件 ──
  {
    id: 'elder_morning',
    name: '村长晨间问候',
    condition: () => {
      const t = getTime();
      return t.hour >= 8 && t.hour < 10 && getVillagerTrust() >= 20;
    },
    dialogue: [
      { speaker: '村长', color: COLORS.elder, text: '早啊，小林。今天天气不错，适合干活。' },
      { speaker: '村长', color: COLORS.elder, text: '有什么需要帮忙的随时来找我。' },
    ],
    weight: 2,
  },
  {
    id: 'elder_garden_complete',
    name: '村长评价花园',
    condition: () => isRestored('garden') && getVillagerTrust() >= 50,
    dialogue: [
      { speaker: '村长', color: COLORS.elder, text: '花园修好了？不错不错。' },
      { speaker: '村长', color: COLORS.elder, text: '你爷爷以前最喜欢在这里种花了。' },
    ],
    weight: 1,
  },
  // ── 夏雅事件 ──
  {
    id: 'xiya_afternoon',
    name: '夏雅午后散步',
    condition: () => {
      const t = getTime();
      return t.hour >= 14 && t.hour < 16 && getVillagerTrust() >= 30;
    },
    dialogue: [
      { speaker: '夏雅', color: COLORS.xiya, text: '下午好呀～今天过得怎么样？' },
      { speaker: '夏雅', color: COLORS.xiya, text: '要不要一起走走？' },
    ],
    weight: 2,
  },
  {
    id: 'xiya_old_house',
    name: '夏雅回忆老屋',
    condition: () => isRestored('oldHouse') && getVillagerTrust() >= 60,
    dialogue: [
      { speaker: '夏雅', color: COLORS.xiya, text: '老屋修好了……' },
      { speaker: '夏雅', color: COLORS.xiya, text: '我记得小时候，爷爷经常在这里给我讲故事。' },
    ],
    weight: 1,
  },
  // ── 小梅事件 ──
  {
    id: 'gardener_flower',
    name: '小梅照料花圃',
    condition: () => {
      const t = getTime();
      return t.hour >= 7 && t.hour < 9 && isRestored('garden');
    },
    dialogue: [
      { speaker: '小梅', color: COLORS.gardener, text: '早安～花儿们今天状态很好呢。' },
      { speaker: '小梅', color: COLORS.gardener, text: '你要不要也来照顾一下？' },
    ],
    weight: 2,
  },
  // ── 老张事件 ──
  {
    id: 'miner_morning',
    name: '老张出发挖矿',
    condition: () => {
      const t = getTime();
      return t.hour >= 8 && t.hour < 10;
    },
    dialogue: [
      { speaker: '老张', color: COLORS.miner, text: '早，小林。今天去矿洞看看。' },
      { speaker: '老张', color: COLORS.miner, text: '有什么需要的矿石，跟我说。' },
    ],
    weight: 1,
  },
  // ── 阿风事件 ──
  {
    id: 'adventurer_forest',
    name: '阿风后山探险',
    condition: () => {
      const t = getTime();
      return t.hour >= 10 && t.hour < 14 && getVillagerTrust() >= 40;
    },
    dialogue: [
      { speaker: '阿风', color: COLORS.adventurer, text: '嘿！今天后山发现了一些有趣的东西。' },
      { speaker: '阿风', color: COLORS.adventurer, text: '要不要一起去看看？' },
    ],
    weight: 1,
  },
  // NPC-01 阿风小事件（2026-08-06）：冒险日志借出归还——核心意象 + 生活幽默，纯文本无存档
  {
    id: 'adventurer_logbook',
    name: '阿风借出冒险日志',
    condition: () => {
      const t = getTime();
      return t.hour >= 15 && t.hour < 19 && getVillagerTrust() >= 40;
    },
    dialogue: [
      { speaker: '阿风', color: COLORS.adventurer, text: '嘿，来得正好。' },
      { speaker: '阿风', color: COLORS.adventurer, text: '这本冒险日志借你翻翻——上面记着后山、矿洞，还有我踩过的每条路。' },
      { speaker: '林澈', color: COLORS.linche, text: '……这字迹，真难认。' },
      { speaker: '阿风', color: COLORS.adventurer, text: '（挠头）写的时候光顾着赶路，确实潦草了点。' },
      { speaker: '阿风', color: COLORS.adventurer, text: '不过你看——每一页都画了星星。走到哪儿，晚上抬头，记一笔。' },
      { speaker: '阿风', color: COLORS.adventurer, text: '这座岛啊，白天是给干活的人看的，晚上是给记得它的人看的。' },
    ],
    weight: 1,
  },
];

/** 今日已触发的事件 ID（每天重置） */
const triggeredToday = new Set<string>();

/** 重置今日事件（跨天调用） */
export function resetDailyEvents(): void {
  triggeredToday.clear();
}

/** 获取今日可触发的事件列表 */
export function getAvailableEvents(): DailyEvent[] {
  return DAILY_EVENTS.filter(e => 
    !triggeredToday.has(e.id) && e.condition()
  );
}

/** 触发一个随机事件 */
export function triggerRandomEvent(): DailyEvent | null {
  const available = getAvailableEvents();
  if (available.length === 0) return null;

  // 按权重随机选择
  const totalWeight = available.reduce((sum, e) => sum + (e.weight ?? 1), 0);
  let random = Math.random() * totalWeight;
  
  for (const event of available) {
    random -= event.weight ?? 1;
    if (random <= 0) {
      triggeredToday.add(event.id);
      event.effect?.();
      return event;
    }
  }
  
  return null;
}

/** 检查是否有可触发的事件 */
export function hasAvailableEvents(): boolean {
  return getAvailableEvents().length > 0;
}
