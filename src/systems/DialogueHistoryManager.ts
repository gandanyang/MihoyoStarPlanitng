/**
 * 剧情回顾历史管理器（FEATURE-040，模块级单例，内存环形缓冲）
 *
 * 职责：记录对话期间显示的每一行，供「剧情回顾」面板只读回看。
 * - 不写存档（SaveData 零改动），随页面刷新自然重置，服务"一次游戏体验"
 * - 会话级累计：不随 play() 自动清空（可回看本局之前几段对话）
 * - 选项行（options）不记录
 *
 * 红线：本模块不依赖 StorySystem.ts 的运行状态，仅复用 DialogueLine 的结构字段。
 */

export interface DialogueHistoryEntry {
  speaker: string;
  text: string;
  /** 内心独白（面板内斜体灰字） */
  inner?: boolean;
  /** 说话人颜色（沿用 DialogueLine.color） */
  color?: string;
  /** 记录时间戳 */
  ts: number;
}

/** 最大保留条数（超出挤出最旧） */
export const HISTORY_MAX = 50;

/** 环形缓冲（模块级单例） */
let buffer: DialogueHistoryEntry[] = [];

/** 记录一条对话；超上限时挤出最旧 */
export function addEntry(entry: DialogueHistoryEntry): void {
  buffer.push(entry);
  if (buffer.length > HISTORY_MAX) {
    buffer = buffer.slice(buffer.length - HISTORY_MAX);
  }
}

/** 按时间正序返回全部历史（副本，避免外部修改） */
export function getHistory(): DialogueHistoryEntry[] {
  return [...buffer];
}

/** 清空历史（v1 预留：章节切换/新游戏时可调用；当前无调用点） */
export function clearHistory(): void {
  buffer = [];
}

/** 当前条数 */
export function historyCount(): number {
  return buffer.length;
}
