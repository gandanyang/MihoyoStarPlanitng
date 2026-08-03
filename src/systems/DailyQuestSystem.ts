/**
 * 每日任务系统
 *
 * 每日从任务池随机抽取 4 个任务，玩家完成可领钻石奖励。
 * 隔天睡觉后自动刷新，未完成的任务也会被替换。
 */

import { addItem, ItemType } from '../data/Inventory';
import { getTime } from '../data/TimeSystem';
import { isTutorialDone } from './StorySystem';
import { isMobileLayout } from '../config';
import { isNpcFindable } from './NPCSystem';

/** 操作提示文案：移动端（触屏）与桌面端（键盘）差异 */
function hint(pc: string, mob: string): string {
  return isMobileLayout() ? mob : pc;
}

// ============ 任务类型定义 ============

/** 任务目标类型 */
export type QuestObjective =
  | { type: 'harvest'; cropType?: ItemType; count: number }
  | { type: 'water'; count: number }
  | { type: 'plant'; count: number }
  | { type: 'collect'; item: ItemType; count: number }
  | { type: 'talk_npc'; npcId: string; npcName: string }
  | { type: 'buy_shop'; count: number }
  | { type: 'sell_shop'; count: number }
  | { type: 'mine'; count: number }
  | { type: 'woodcut'; count: number };

/** 任务模板 */
export interface DailyQuestTemplate {
  id: string;
  title: string;
  desc: string;
  objective: QuestObjective;
  reward: number; // 钻石数量
}

/** 每日任务实例（含进度） */
export interface DailyQuestInstance {
  id: string;
  title: string;
  desc: string;
  objective: QuestObjective;
  reward: number;
  progress: number; // 当前进度
  target: number; // 目标数量
  completed: boolean; // 已完成（可领奖）
  claimed: boolean; // 已领奖
}

// ============ 任务池 ============

const QUEST_POOL: DailyQuestTemplate[] = [
  // --- 收获类 ---
  { id: 'harvest_radish_3', title: '萝卜丰收', desc: '收获 3 个萝卜', objective: { type: 'harvest', cropType: 'radish', count: 3 }, reward: 2 },
  { id: 'harvest_tomato_2', title: '番茄采摘', desc: '收获 2 个番茄', objective: { type: 'harvest', cropType: 'tomato', count: 2 }, reward: 3 },
  { id: 'harvest_corn_2', title: '玉米丰收', desc: '收获 2 个玉米', objective: { type: 'harvest', cropType: 'corn', count: 2 }, reward: 4 },
  { id: 'harvest_any_5', title: '大丰收', desc: '收获任意作物 5 个', objective: { type: 'harvest', count: 5 }, reward: 3 },

  // --- 浇水类 ---
  { id: 'water_3', title: '细心浇灌', desc: '浇水 3 次', objective: { type: 'water', count: 3 }, reward: 1 },
  { id: 'water_5', title: '勤劳园丁', desc: '浇水 5 次', objective: { type: 'water', count: 5 }, reward: 2 },

  // --- 播种类 ---
  { id: 'plant_2', title: '播种希望', desc: '播种 2 颗种子', objective: { type: 'plant', count: 2 }, reward: 1 },
  { id: 'plant_4', title: '开荒先锋', desc: '播种 4 颗种子', objective: { type: 'plant', count: 4 }, reward: 2 },

  // --- 睡觉类 ---
  // 已移除：睡觉会触发 nextDay → refreshDailyQuests，任务在领奖前就被刷新，逻辑上无法完成

  // --- 采集类 ---
  { id: 'collect_star', title: '星之碎片', desc: '收集 1 个星之碎片', objective: { type: 'collect', item: 'star_shard', count: 1 }, reward: 3 },

  // --- 挖矿/砍树引导类（首次刷新固定出现，见 refreshDailyQuests） ---
  { id: 'mine_1', title: '初入矿洞', desc: hint('挖矿 1 次（矿洞可从小镇进入，靠近发光矿脉按 E）', '挖矿 1 次（矿洞可从小镇进入，靠近发光矿脉点「交互」）'), objective: { type: 'mine', count: 1 }, reward: 2 },
  { id: 'woodcut_2', title: '伐木初体验', desc: hint('砍倒 2 棵树（庄园里靠近树按 E，用旧斧头）', '砍倒 2 棵树（庄园里靠近树点「交互」，用旧斧头）'), objective: { type: 'woodcut', count: 2 }, reward: 2 },

  // --- 对话类 ---
  { id: 'talk_elder', title: '拜访村长', desc: '与村长对话', objective: { type: 'talk_npc', npcId: 'elder', npcName: '村长' }, reward: 1 },
  { id: 'talk_shopkeeper', title: '光顾商店', desc: '与商店老板对话', objective: { type: 'talk_npc', npcId: 'shopkeeper', npcName: '商店老板' }, reward: 1 },
  { id: 'talk_miner', title: '矿工闲谈', desc: '与矿工老张对话', objective: { type: 'talk_npc', npcId: 'miner', npcName: '矿工老张' }, reward: 1 },
  { id: 'talk_gardener', title: '花匠私语', desc: '与花匠小梅对话', objective: { type: 'talk_npc', npcId: 'gardener', npcName: '花匠小梅' }, reward: 1 },
  { id: 'talk_adventurer', title: '冒险传说', desc: '与冒险家阿风对话', objective: { type: 'talk_npc', npcId: 'adventurer', npcName: '冒险家阿风' }, reward: 1 },

  // --- 商店类 ---
  { id: 'buy_1', title: '小小消费', desc: '在商店购买 1 件物品', objective: { type: 'buy_shop', count: 1 }, reward: 1 },
  { id: 'buy_3', title: '购物达人', desc: '在商店购买 3 件物品', objective: { type: 'buy_shop', count: 3 }, reward: 2 },
  { id: 'sell_3', title: '小本生意', desc: '在商店卖出 3 个作物', objective: { type: 'sell_shop', count: 3 }, reward: 2 },
  { id: 'sell_5', title: '贸易达人', desc: '在商店卖出 5 个作物', objective: { type: 'sell_shop', count: 5 }, reward: 3 },
];

// ============ 每日任务状态 ============

let dailyQuests: DailyQuestInstance[] = [];
let currentDay: number = 0;

/** 随机选取 n 个不重复的任务 */
function pickRandom(n: number, opts?: { allowTalk?: boolean }): DailyQuestTemplate[] {
  const pool = [...QUEST_POOL];
  // B-1（制作人拍板 2026-08-03）：晚间 NPC 回家，不生成新的对话任务
  // 避免"接了 talk_* 才发现 NPC 找不到"。仅在明确允许时保留 talk 任务。
  if (opts?.allowTalk !== true) {
    const filtered = pool.filter((t) => t.objective.type !== 'talk_npc');
    pool.length = 0;
    pool.push(...filtered);
  }
  const result: DailyQuestTemplate[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}

/** 从模板创建实例 */
function createInstance(t: DailyQuestTemplate): DailyQuestInstance {
  const target = (t.objective as any).count ?? 1;
  return {
    id: t.id,
    title: t.title,
    desc: t.desc,
    objective: { ...t.objective } as QuestObjective,
    reward: t.reward,
    progress: 0,
    target,
    completed: false,
    claimed: false,
  };
}

/** 引导任务 ID（挖矿/砍树，首次初始化固定出现，未完成时跨天保留） */
const GUIDE_QUEST_IDS = new Set(['mine_1', 'woodcut_2']);

/** 刷新每日任务（隔天调用；引导任务在教程完成后才投放，未完成时跨天保留） */
export function refreshDailyQuests(): void {
  const day = getTime().day;
  if (day === currentDay && dailyQuests.length > 0) return; // 同一天不重复刷新
  const isFirstInit = dailyQuests.length === 0; // 从未初始化（首次进入地图场景）
  // B-1（制作人拍板 2026-08-03）：晚间 NPC 回家，不生成新 talk 任务
  const isEvening = getTime().hour >= 18;
  const allowTalk = !isEvening;
  // 保留未领奖的引导任务 + 已完成未领奖的任务（避免过夜丢失奖励）；领奖后消失
  const keepGuide = dailyQuests.filter((q) => (GUIDE_QUEST_IDS.has(q.id) || q.completed) && !q.claimed);
  currentDay = day;
  if (isFirstInit) {
    // 首次：教程完成后才固定投放引导任务（挖矿/砍树）；
    // 教程未完成时玩家还没有斧头/未解锁矿洞，提前投放会导致"按E无法推进任务"
    const guide = isTutorialDone() ? QUEST_POOL.filter((t) => GUIDE_QUEST_IDS.has(t.id)) : [];
    const rest = pickRandom(4 - guide.length, { allowTalk });
    dailyQuests = [...guide, ...rest].map(createInstance);
  } else {
    const rest = pickRandom(4 - keepGuide.length, { allowTalk });
    dailyQuests = [...keepGuide, ...rest.map(createInstance)];
  }
}

/** 获取当前每日任务 */
export function getDailyQuests(): readonly DailyQuestInstance[] {
  return dailyQuests;
}

/**
 * 教程完成后注入引导任务（挖矿/砍树）。
 * 在 tryTutorialSleep（睡觉完成 → storyStep=done）时调用；
 * 已出现在面板中的引导任务（含已领奖）不重复添加；
 * 面板总数保持 4：引导任务占前位，尾部随机任务被裁掉。
 */
export function injectGuideQuests(): void {
  for (const t of QUEST_POOL) {
    if (!GUIDE_QUEST_IDS.has(t.id)) continue;
    if (dailyQuests.some((q) => q.id === t.id)) continue;
    dailyQuests.unshift(createInstance(t));
  }
  if (dailyQuests.length > 4) {
    dailyQuests.length = 4;
  }
}

/** 获取每日任务天数 */
export function getDailyQuestDay(): number {
  return currentDay;
}

/** NPC 回家时段提示（B-1，制作人拍板 2026-08-03）
 * NPC 在家（home 虚拟位置）或隐藏时段时不渲染 → talk 任务无法完成 → 面板友好提示。
 * 返回该 NPC 当前是否已回家 + 明早可找的提示语。
 */
export function getTalkNpcHomeHint(npcId: string, npcName: string): { home: boolean; hint: string } | null {
  if (isNpcFindable(npcId)) return null;
  return { home: true, hint: `${npcName}已经回家休息，明天再去找她吧。` };
}

// ============ 进度更新 ============

/** 通知收获作物 */
export function onHarvest(cropType: ItemType, count = 1): void {
  for (const q of dailyQuests) {
    if (q.claimed) continue;
    const obj = q.objective;
    if (obj.type === 'harvest') {
      if (obj.cropType && obj.cropType !== cropType) continue;
      q.progress = Math.min(q.target, q.progress + count);
      if (q.progress >= q.target) q.completed = true;
    }
  }
}

/** 通知浇水 */
export function onWater(): void {
  for (const q of dailyQuests) {
    if (q.claimed || q.completed) continue;
    if (q.objective.type === 'water') {
      q.progress = Math.min(q.target, q.progress + 1);
      if (q.progress >= q.target) q.completed = true;
    }
  }
}

/** 通知播种 */
export function onPlant(): void {
  for (const q of dailyQuests) {
    if (q.claimed || q.completed) continue;
    if (q.objective.type === 'plant') {
      q.progress = Math.min(q.target, q.progress + 1);
      if (q.progress >= q.target) q.completed = true;
    }
  }
}

/** 通知采集物品 */
export function onCollect(item: ItemType, count = 1): void {
  for (const q of dailyQuests) {
    if (q.claimed || q.completed) continue;
    if (q.objective.type === 'collect' && q.objective.item === item) {
      q.progress = Math.min(q.target, q.progress + count);
      if (q.progress >= q.target) q.completed = true;
    }
  }
}

/** 通知挖矿（每开采成功一次计 1） */
export function onMine(): void {
  for (const q of dailyQuests) {
    if (q.claimed || q.completed) continue;
    if (q.objective.type === 'mine') {
      q.progress = Math.min(q.target, q.progress + 1);
      if (q.progress >= q.target) q.completed = true;
    }
  }
}

/** 通知砍树（每砍倒一棵计 1） */
export function onWoodcut(): void {
  for (const q of dailyQuests) {
    if (q.claimed || q.completed) continue;
    if (q.objective.type === 'woodcut') {
      q.progress = Math.min(q.target, q.progress + 1);
      if (q.progress >= q.target) q.completed = true;
    }
  }
}

/** 通知与 NPC 对话 */
export function onTalkNpc(npcId: string): void {
  for (const q of dailyQuests) {
    if (q.claimed || q.completed) continue;
    if (q.objective.type === 'talk_npc' && q.objective.npcId === npcId) {
      q.progress = 1;
      q.completed = true;
    }
  }
}

/** 通知商店购买 */
export function onBuyShop(count = 1): void {
  for (const q of dailyQuests) {
    if (q.claimed || q.completed) continue;
    if (q.objective.type === 'buy_shop') {
      q.progress = Math.min(q.target, q.progress + count);
      if (q.progress >= q.target) q.completed = true;
    }
  }
}

/** 通知商店卖出 */
export function onSellShop(count = 1): void {
  for (const q of dailyQuests) {
    if (q.claimed || q.completed) continue;
    if (q.objective.type === 'sell_shop') {
      q.progress = Math.min(q.target, q.progress + count);
      if (q.progress >= q.target) q.completed = true;
    }
  }
}

// ============ 领奖 ============

/** 领取任务奖励，返回是否成功 */
export function claimReward(questId: string): boolean {
  const q = dailyQuests.find((dq) => dq.id === questId);
  if (!q || !q.completed || q.claimed) return false;
  q.claimed = true;
  addItem('diamond', q.reward);
  return true;
}

// ============ 存档 ============

export interface DailyQuestSaveData {
  currentDay: number;
  quests: { id: string; progress: number; completed: boolean; claimed: boolean }[];
}

/** 导出存档数据 */
export function getDailyQuestSaveData(): DailyQuestSaveData {
  return {
    currentDay,
    quests: dailyQuests.map((q) => ({
      id: q.id,
      progress: q.progress,
      completed: q.completed,
      claimed: q.claimed,
    })),
  };
}

/** 恢复存档数据 */
export function restoreDailyQuests(data: DailyQuestSaveData): void {
  currentDay = data.currentDay;
  dailyQuests = data.quests.map((sq) => {
    const tpl = QUEST_POOL.find((t) => t.id === sq.id);
    if (!tpl) return null!;
    const inst = createInstance(tpl);
    inst.progress = sq.progress;
    inst.completed = sq.completed;
    inst.claimed = sq.claimed;
    return inst;
  }).filter(Boolean);
}