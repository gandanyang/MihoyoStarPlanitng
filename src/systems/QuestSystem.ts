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
import { getTime } from '../data/TimeSystem';
import { hasTriggered } from './EventManager';
import { COLORS, ELDER_QUEST_DIALOGUE, ELDER_BUSY_DIALOGUE, ELDER_BUSY_SHORT_DIALOGUE, SHARD_DELIVER_DIALOGUE, ELDER_WHY_FARM_DIALOGUE, type DialogueLine, getStoryStep, isTutorialDone, isObservatoryComplete } from './StorySystem';

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
 * f7：第一天村长是否处于「暂时有事」状态（未接主线 + 当天为 day 1）
 * 供 MapScene 决定是否在对话结束后发放启动资源大礼包
 */
export function isElderBusyDay(): boolean {
  return questState === 'not_started' && getTime().day < 2;
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
      // f7（2026-08-07 制作人拍板）：第一天村长「暂时有事」，主线委托推迟到第二天才接；
      // 大礼包已给过 → 简短提醒，避免重复长篇
      if (getTime().day < 2) {
        return hasTriggered('elder_starter_gift')
          ? ELDER_BUSY_SHORT_DIALOGUE
          : ELDER_BUSY_DIALOGUE;
      }
      acceptQuest();
      return ELDER_QUEST_DIALOGUE;
    case 'accepted':
      return [{ speaker: '村长', color: COLORS.elder, text: '去你爷爷以前常去的后山看看吧，孩子。' }];
    case 'collected':
      deliverQuest();
      // T2 改动 2：交付完成后追加村长「为什么种田」（制作人 2026-08-06 定稿），一次性连播
      return [...SHARD_DELIVER_DIALOGUE, ...ELDER_WHY_FARM_DIALOGUE];
    case 'completed':
      return [{ speaker: '村长', color: COLORS.elder, text: '星辰岛的秘密才刚刚揭开……期待你的下一次冒险。' }];
  }
}

/**
 * 返回当前任务目标提示文字（HUD 显示用）
 * E-05：教程期（主线未完成）优先显示当前教程步骤目标，避免「与村长对话」与教程动作冲突
 */
export function getQuestObjective(): string {
  if (!isTutorialDone()) return tutorialObjective();
  switch (questState) {
    case 'not_started':
      return '与村长对话（农场/小镇）';
    case 'accepted':
      return '去爷爷以前常去的后山看看';
    case 'collected':
      return '返回村长交付任务';
    case 'completed':
      if (!isObservatoryComplete()) {
        return '前往农场观星点（白天可靠近坐等天黑）';
      }
      return 'Demo 体验完成！';
  }
}

/** E-05：教程步骤 → 目标文案（跟随 showTutorialHint 的引导，让 HUD 与教程动作一致） */
function tutorialObjective(): string {
  switch (getStoryStep()) {
    case 'station_intro':
    case 'station_move':
    case 'arrive_manor':
      return '前往庄园（跟着夏雅走）';
    case 'xiya_talk':
      return '与夏雅对话';
    case 'get_key':
      return '获得庄园钥匙';
    case 'gate_opened':
      return '进入庄园';
    case 'clear_land':
      return '清理土地（锄地）';
    case 'sow_seeds':
      return '播种萝卜种子';
    case 'water_crops':
      return '给作物浇水';
    case 'evening_talk':
      return '回屋睡觉，结束第一天';
    default:
      return '与村长对话（农场/小镇）';
  }
}
