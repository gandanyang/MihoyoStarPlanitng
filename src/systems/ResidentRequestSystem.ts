/**
 * 居民需求板系统（FEATURE-038 · v0.10 · 林澈=连接者）
 *
 * 定位：信息连接者的玩法化——需求板展示村民需要什么，玩家交付后岛屿生活感增强。
 * 设计约束（任务卡红线）：
 *   - 固定脚本需求，不做动态生成 / 经济模拟
 *   - 独立于 QuestSystem 主线状态机
 *   - 不新建「归星助手」大系统（归星记录 GuiXingRecordSystem 已存在，复用）
 *
 * 数据流：
 *   - 需求数据为静态表（本模块）
 *   - 完成状态经 EventManager（gameState.triggeredEvents）持久化，旧档默认空 → 兼容
 *   - 交付 = 面板内一键交付：扣资源 → markTriggered → 反馈对白（StoryDialogue）→ triggerTag('help_resident')
 *
 * 食物聚合规则：food 类需求用 萝卜/番茄/玉米/草莓 任一组合扣除（按固定顺序先扣存量多的）。
 */

import { getItemCount, addItem, type ItemType } from '../data/Inventory';
import { markTriggered, hasTriggered } from './EventManager';

/** 需求物品类别：wood=木材 / food=食物（聚合） */
export type RequestItemKind = 'wood' | 'food';

/** 一条居民需求（静态数据 + 完成态经 EventManager 查询，不入本模块） */
export interface ResidentRequest {
  /** 一次性事件 id（EventManager 持久化键，同时是需求唯一 id） */
  id: string;
  npcId: string;
  npcName: string;
  /** NPC 对白颜色（反馈对白 speaker 用，与 NPCSystem 一致） */
  npcColor: string;
  itemKind: RequestItemKind;
  count: number;
  /** 交付后 NPC 反馈（制作人定稿，Agent 不得扩写） */
  rewardDialogue: string;
}

/** 食物聚合物品池（扣除顺序：萝卜 → 番茄 → 玉米 → 草莓） */
const FOOD_ITEMS: ItemType[] = ['radish', 'tomato', 'corn', 'strawberry'];

/** 食物聚合显示名（不足提示用） */
const FOOD_LABEL = '食物（萝卜/番茄/玉米/草莓）';

// ============ 需求数据（任务卡定稿，制作人拍板数值与文案） ============

const REQUESTS: ResidentRequest[] = [
  {
    id: 'resident_req_gardener_wood',
    npcId: 'gardener',
    npcName: '花匠小梅',
    npcColor: '#a0d888',
    itemKind: 'wood',
    count: 10,
    rewardDialogue: '谢谢！有了这些木头，花架终于能搭起来了。',
  },
  {
    id: 'resident_req_miner_food',
    npcId: 'miner',
    npcName: '矿工老张',
    npcColor: '#d8a050',
    itemKind: 'food',
    count: 5,
    rewardDialogue: '正好下矿前垫垫肚子。谢了，小子。',
  },
];

// ============ 查询 ============

/** 读取全部需求（只读；done 状态动态查询，不入静态数据） */
export function getResidentRequests(): readonly ResidentRequest[] {
  return REQUESTS;
}

/** 按 id 查需求 */
export function getRequestById(id: string): ResidentRequest | undefined {
  return REQUESTS.find((r) => r.id === id);
}

/** 需求是否已完成（经 EventManager 持久化） */
export function isRequestDone(id: string): boolean {
  return hasTriggered(id);
}

// ============ 交付判定 ============

/** 背包是否足够交付该需求 */
export function canFulfillRequest(req: ResidentRequest): boolean {
  if (req.itemKind === 'wood') return getItemCount('wood') >= req.count;
  return FOOD_ITEMS.reduce((sum, it) => sum + getItemCount(it), 0) >= req.count;
}

/** 资源不足提示文案（明确缺什么） */
export function getRequestShortageText(req: ResidentRequest): string {
  if (req.itemKind === 'wood') {
    return `木材不足，还差 ${req.count - getItemCount('wood')} 个`;
  }
  const have = FOOD_ITEMS.reduce((sum, it) => sum + getItemCount(it), 0);
  return `${FOOD_LABEL}不足，还差 ${req.count - have} 份`;
}

// ============ 交付 ============

/** 交付结果 */
export type FulfillResult = 'success' | 'insufficient' | 'done_already' | 'not_found';

/**
 * 一键交付：扣资源 → 标记完成（EventManager）。
 * 调用方负责：成功后播放反馈对白 + triggerTag('help_resident') + save()。
 */
export function fulfillRequest(id: string): FulfillResult {
  const req = getRequestById(id);
  if (!req) return 'not_found';
  if (isRequestDone(id)) return 'done_already';
  if (!canFulfillRequest(req)) return 'insufficient';

  if (req.itemKind === 'wood') {
    addItem('wood', -req.count);
  } else {
    deductFood(req.count);
  }
  markTriggered(id);
  return 'success';
}

/** 食物聚合扣除：按固定顺序从各作物里取够 count（调用前已校验总量足够） */
function deductFood(count: number): void {
  for (const item of FOOD_ITEMS) {
    if (count <= 0) break;
    const have = getItemCount(item);
    const take = Math.min(have, count);
    if (take > 0) {
      addItem(item, -take);
      count -= take;
    }
  }
}
