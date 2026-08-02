/**
 * 主线任务系统（Phase 6）
 *
 * 唯一主线任务：星之碎片
 * 5 步流程：村长接受 → 前往森林 → 采集星之碎片 → 返回村长 → 触发剧情
 *
 * 状态机：
 *   not_started → accepted → collected → completed
 *      (村长对话)   (森林采集)   (村长交付)
 *
 * TimeSystem 是天数唯一来源，任务状态跨场景保留（模块级单例）。
 */

import { addXp } from '../data/FarmProgress';
import { COLORS, ELDER_QUEST_DIALOGUE, SHARD_DELIVER_DIALOGUE, type DialogueLine } from './StorySystem';

/** 任务状态 */
export type QuestState = 'not_started' | 'accepted' | 'collected' | 'completed';

/** 当前任务状态（模块级单例） */
let questState: QuestState = 'not_started';

/** 读取当前任务状态 */
export function getQuestState(): QuestState {
  return questState;
}

/** 直接设置任务状态（存档恢复用） */
export function setQuestState(state: QuestState): void {
  questState = state;
}

/** 接受任务：not_started → accepted（与村长对话触发） */
export function acceptQuest(): void {
  if (questState === 'not_started') {
    questState = 'accepted';
  }
}

/** 采集星之碎片：accepted → collected（森林采集点 E 键触发） */
export function collectShard(): void {
  if (questState === 'accepted') {
    questState = 'collected';
  }
}

/** 交付任务：collected → completed（与村长对话触发，附带剧情） */
export function deliverQuest(): void {
  if (questState === 'collected') {
    questState = 'completed';
    addXp(30, 'quest');
  }
}

/**
 * 根据任务状态返回村长对话剧本
 * 不同状态对话不同，接受/交付在获取剧本时自动推进状态
 * 返回 DialogueLine[] 供 StoryDialogue 全屏播放
 */
export function getElderDialogue(): DialogueLine[] {
  console.log('[DEBUG] getElderDialogue called, questState=', questState);
  switch (questState) {
    case 'not_started':
      acceptQuest();
      return ELDER_QUEST_DIALOGUE;
    case 'accepted':
      return [{ speaker: '村长', color: COLORS.elder, text: '去森林找到发光的星之碎片吧，孩子。' }];
    case 'collected':
      deliverQuest();
      return SHARD_DELIVER_DIALOGUE;
    case 'completed':
      return [{ speaker: '村长', color: COLORS.elder, text: '星辰岛的秘密才刚刚揭开……期待你的下一次冒险。' }];
  }
}

/**
 * 返回当前任务目标提示文字（HUD 显示用）
 */
export function getQuestObjective(): string {
  switch (questState) {
    case 'not_started':
      return '与村长对话（农场/小镇）';
    case 'accepted':
      return '前往森林采集星之碎片';
    case 'collected':
      return '返回村长交付任务';
    case 'completed':
      return '主线任务完成！';
  }
}
