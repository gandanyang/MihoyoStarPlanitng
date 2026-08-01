/**
 * 存档系统（Phase 0.3）
 *
 * 使用 localStorage 持久化游戏进度，刷新页面后恢复。
 * 保存内容：时间、金币、背包、种子、农田、作物、经验等级、任务状态、玩家位置。
 *
 * 触发时机：
 *   睡觉时自动保存（MapScene.trySleep）
 *   页面关闭/刷新前保存（beforeunload 事件）
 *   手动保存（预留接口）
 *
 * 版本号：存档格式变更时递增，旧版本加载时提示不兼容。
 */

import { getCoins, setCoins } from '../data/Economy';
import { getLevel, getXp, setLevel, setXp } from '../data/FarmProgress';
import {
  clearAllTiles,
  getAllCropEntries,
  getAllTileEntries,
  restoreCropEntries,
  restoreTileEntries,
  type CropData,
  type TileState,
} from '../data/FarmState';
import { getAllInventoryEntries, restoreAllInventory, type ItemType } from '../data/Inventory';
import { getTime, setTimeFull } from '../data/TimeSystem';
import { getStamina, setStamina as restoreStamina } from '../data/Stamina';
import { getMinedOreIds, restoreMinedOres } from '../data/MineState';
import { getStoryStep, setStoryStep, type StoryStep } from '../systems/StorySystem';
import { getQuestState, setQuestState, type QuestState } from '../systems/QuestSystem';
import { getDailyQuestSaveData, restoreDailyQuests, type DailyQuestSaveData } from '../systems/DailyQuestSystem';

/** 当前存档格式版本（语义化：格式不兼容时递增） */
export const SAVE_VERSION = '0.3';

/** 存档 key */
const STORAGE_KEY = 'starvalley_save';

/** 存档数据结构 */
export interface SaveData {
  version: string;
  /** 现实保存时间（ISO 格式，便于 UI 显示） */
  savedAt: string;
  /** Unix 时间戳（内部使用） */
  timestamp: number;
  time: { day: number; hour: number; minute: number };
  coins: number;
  inventory: Record<ItemType, number>;
  tiles: [string, TileState][];
  crops: [string, CropData][];
  level: number;
  xp: number;
  questState: QuestState;
  dailyQuest?: DailyQuestSaveData;
  stamina: number;
  minedOres: string[];
  storyStep: StoryStep;
  player: { x: number; y: number; scene: string; facing: string };
}

/** 上一次加载时遇到的不兼容版本号（用于 UI 提示） */
let lastIncompatibleVersion: string | null = null;

/** 格式化时间为可读字符串 */
function formatSavedAt(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

/** 保存游戏（序列化所有模块状态 → localStorage） */
export function save(player: {
  x: number;
  y: number;
  scene: string;
  facing: string;
  dailyQuest?: DailyQuestSaveData;
}): void {
  const t = getTime();
  const now = new Date();
  const data: SaveData = {
    version: SAVE_VERSION,
    savedAt: formatSavedAt(now),
    timestamp: now.getTime(),
    time: { day: t.day, hour: t.hour, minute: t.minute },
    coins: getCoins(),
    inventory: Object.fromEntries(getAllInventoryEntries()) as Record<ItemType, number>,
    tiles: getAllTileEntries(),
    crops: getAllCropEntries(),
    level: getLevel(),
    xp: getXp(),
    questState: getQuestState(),
    dailyQuest: player.dailyQuest ?? getDailyQuestSaveData(),
    stamina: getStamina(),
    minedOres: getMinedOreIds(),
    storyStep: getStoryStep(),
    player: { x: player.x, y: player.y, scene: player.scene, facing: player.facing },
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log('[SaveSystem] 存档已保存', {
      version: SAVE_VERSION,
      savedAt: data.savedAt,
      day: t.day,
      time: `${t.hour}:${String(t.minute).padStart(2, '0')}`,
      coins: data.coins,
      level: data.level,
    });
  } catch (e) {
    console.warn('[SaveSystem] 存档保存失败（localStorage 可能已满）', e);
  }
}

/** 读取存档元信息（不完整解析，仅版本号 + 保存时间） */
export function getSaveMeta(): { version: string; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SaveData>;
    return {
      version: data.version ?? 'unknown',
      savedAt: data.savedAt ?? '未知',
    };
  } catch {
    return null;
  }
}

/** 获取上一次加载时遇到的不兼容版本号 */
export function getLastIncompatibleVersion(): string | null {
  return lastIncompatibleVersion;
}

/** 清除不兼容版本记录 */
export function clearIncompatibleVersion(): void {
  lastIncompatibleVersion = null;
}

/** 读取存档（返回 null 表示无存档或版本不兼容） */
export function load(): SaveData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SaveData>;

    // 版本检查
    const saveVersion = data.version ?? 'unknown';
    if (saveVersion !== SAVE_VERSION) {
      lastIncompatibleVersion = saveVersion;
      console.warn(
        `[SaveSystem] 存档版本不兼容：当前 ${SAVE_VERSION}，存档 ${saveVersion}。` +
          '请手动删除旧存档后重新开始。',
      );
      return null;
    }

    // 结构完整性校验
    if (!data.player || !data.time || data.coins === undefined) {
      console.warn('[SaveSystem] 存档数据不完整，忽略');
      return null;
    }

    return data as SaveData;
  } catch {
    console.warn('[SaveSystem] 存档读取失败，数据可能损坏');
    return null;
  }
}

/**
 * 向后兼容：将旧存档格式的背包数据迁移到新格式
 *
 * 旧格式：{ radish, seed, star_shard }
 * 新格式：{ radish, tomato, corn, radish_seed, tomato_seed, corn_seed, star_shard }
 *
 * 迁移规则：
 *   1. old 'seed' → 'radish_seed'
 *   2. 新物品（tomato, corn, tomato_seed, corn_seed）缺失时补 0
 */
function migrateInventory(
  inventory: Record<string, number>,
): Partial<Record<ItemType, number>> {
  const migrated: Record<string, number> = { ...inventory };

  // 旧格式 'seed' → 'radish_seed'
  if (migrated['seed'] !== undefined) {
    if (migrated['radish_seed'] === undefined) {
      migrated['radish_seed'] = migrated['seed'];
    }
    delete migrated['seed'];
  }

  // 为新物品设置默认值（如果存档中没有）
  const defaultItems: ItemType[] = ['tomato', 'corn', 'tomato_seed', 'corn_seed', 'stone', 'copper', 'iron', 'manor_key', 'old_hoe', 'old_watering_can'];
  for (const item of defaultItems) {
    if (migrated[item] === undefined) {
      migrated[item] = 0;
    }
  }

  return migrated as Partial<Record<ItemType, number>>;
}

/** 应用存档到各模块（读取后调用） */
export function apply(data: SaveData): void {
  // 时间
  setTimeFull(data.time.day, data.time.hour, data.time.minute);
  // 金币
  setCoins(data.coins);
  // 背包（兼容旧存档格式迁移）
  const migratedInventory = migrateInventory(data.inventory as Record<string, number>);
  restoreAllInventory(migratedInventory);
  // 农田
  clearAllTiles();
  restoreTileEntries(data.tiles as [string, TileState][]);
  restoreCropEntries(data.crops as [string, CropData][]);
  // 经验等级
  setLevel(data.level);
  setXp(data.xp);
  // 任务
  setQuestState(data.questState as QuestState);
  if (data.dailyQuest) restoreDailyQuests(data.dailyQuest);
  // 体力 + 矿脉
  restoreStamina(data.stamina ?? 100);
  restoreMinedOres(data.minedOres ?? []);
  // 剧情进度
  setStoryStep(data.storyStep ?? 'done');
  // 玩家位置（由 MapScene 读取后设置 spawn）
}

/** 是否存在存档 */
export function hasSave(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/** 获取存档中的玩家数据（用于决定出生点） */
export function getPlayerData(): { x: number; y: number; scene: string; facing: string } | null {
  const data = load();
  return data?.player ?? null;
}

/** 删除存档 */
export function deleteSave(): void {
  localStorage.removeItem(STORAGE_KEY);
  console.log('[SaveSystem] 存档已删除');
}