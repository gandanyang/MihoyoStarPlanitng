/**
 * 存档系统（v0.5）
 *
 * 使用 localStorage 持久化游戏进度，刷新页面后恢复。
 * 保存内容按分组组织：player / world / farm / story。
 *
 * 触发时机：
 *   睡觉时自动保存（MapScene.trySleep）
 *   页面关闭/刷新前保存（beforeunload 事件）
 *
 * 版本升级策略：
 *   加载时若存档 version !== SAVE_VERSION，则调用 migrate() 迁移。
 *   当前 v0.5 的迁移策略：直接清空旧存档 —— 宁可重新开始，也不让旧格式污染新结构。
 *   后续版本升级时，在 migrate() 中编写逐字段搬移的真实迁移逻辑。
 */

import { getCoins, setCoins } from '../data/Economy';
import { getLevel, getXp, setLevel, setXp } from '../data/FarmProgress';
import {
  clearAllTiles,
  getAllCropEntries,
  getAllTileEntries,
  getAllTreeEntries,
  restoreCropEntries,
  restoreTileEntries,
  restoreTreeEntries,
  type CropData,
  type TileState,
  type TreeState,
} from '../data/FarmState';
import { getAllInventoryEntries, restoreAllInventory, type ItemType } from '../data/Inventory';
import { getTime, setTimeFull } from '../data/TimeSystem';
import { getStamina, setStamina as restoreStamina } from '../data/Stamina';
import { getMinedOreIds, restoreMinedOres } from '../data/MineState';
import { getStoryStep, setStoryStep, isCh1TownIntroDone, markCh1TownIntroDone, STORY_STEPS, type StoryStep } from '../systems/StorySystem';
import { getQuestState, setQuestState, type QuestState } from '../systems/QuestSystem';
import { getDailyQuestSaveData, restoreDailyQuests, type DailyQuestSaveData } from '../systems/DailyQuestSystem';

/** 当前存档格式版本（格式变更时递增；不匹配时走 migrate()） */
export const SAVE_VERSION = '0.5';

/** 存档 key */
const STORAGE_KEY = 'return_star_save';

/** 存档数据结构（v0.5 分组格式） */
export interface SaveData {
  version: string;
  /** 现实保存时间（ISO 格式，便于 UI 显示） */
  savedAt: string;
  /** Unix 时间戳（内部使用） */
  timestamp: number;
  /** 玩家：位置 + 背包 */
  player: {
    x: number;
    y: number;
    scene: string;
    facing: string;
    inventory: Record<ItemType, number>;
  };
  /** 世界：时间 / 经济 / 进度 */
  world: {
    day: number;
    hour: number;
    minute: number;
    coins: number;
    level: number;
    xp: number;
    stamina: number;
    minedOres: string[];
    questState: QuestState;
    dailyQuest?: DailyQuestSaveData;
  };
  /** 农场：土地 / 作物 / 树木 */
  farm: {
    tiles: [string, TileState][];
    crops: [string, CropData][];
    trees: [string, TreeState][];
  };
  /** 剧情进度 */
  story: {
    storyStep: StoryStep;
    ch1TownIntroDone?: boolean;
  };
}

/** 上一次加载时遇到的不匹配版本号（用于 UI 提示） */
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
    player: {
      x: player.x,
      y: player.y,
      scene: player.scene,
      facing: player.facing,
      inventory: Object.fromEntries(getAllInventoryEntries()) as Record<ItemType, number>,
    },
    world: {
      day: t.day,
      hour: t.hour,
      minute: t.minute,
      coins: getCoins(),
      level: getLevel(),
      xp: getXp(),
      stamina: getStamina(),
      minedOres: getMinedOreIds(),
      questState: getQuestState(),
      dailyQuest: player.dailyQuest ?? getDailyQuestSaveData(),
    },
    farm: {
      tiles: getAllTileEntries(),
      crops: getAllCropEntries(),
      trees: getAllTreeEntries(),
    },
    story: {
      storyStep: getStoryStep(),
      ch1TownIntroDone: isCh1TownIntroDone(),
    },
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log('[SaveSystem] 存档已保存', {
      version: SAVE_VERSION,
      savedAt: data.savedAt,
      day: t.day,
      time: `${t.hour}:${String(t.minute).padStart(2, '0')}`,
      coins: data.world.coins,
      level: data.world.level,
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

/** 获取上一次加载时遇到的不匹配版本号 */
export function getLastIncompatibleVersion(): string | null {
  return lastIncompatibleVersion;
}

/** 清除不匹配版本记录 */
export function clearIncompatibleVersion(): void {
  lastIncompatibleVersion = null;
}

/** 读取存档（返回 null 表示无存档、版本不匹配或数据损坏） */
export function load(): SaveData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SaveData>;

    // 版本检查：不匹配 → 执行迁移（当前 v0.5 策略为清空旧存档）
    const saveVersion = data.version ?? 'unknown';
    if (saveVersion !== SAVE_VERSION) {
      lastIncompatibleVersion = saveVersion;
      console.warn(
        `[SaveSystem] 存档版本不匹配：当前 ${SAVE_VERSION}，存档 ${saveVersion}，执行迁移。`,
      );
      migrate(saveVersion);
      return null;
    }

    // 结构完整性校验
    if (!data.player || !data.world || !data.farm || !data.story) {
      console.warn('[SaveSystem] 存档数据不完整，忽略');
      return null;
    }

    // 边界保护（v0.5.2 P0）：非法枚举/非数值字段降级为安全默认，防止坏档导致崩溃
    sanitize(data as SaveData);
    return data as SaveData;
  } catch {
    console.warn('[SaveSystem] 存档读取失败，数据可能损坏');
    return null;
  }
}

/**
 * 加载时边界保护：不改存档结构、不升版本号，只把非法值收敛为安全默认。
 * JSON 解析保证数值有限或缺失（缺失字段用默认值兜底）。
 */
function sanitize(data: SaveData): void {
  // 剧情步骤：不在白名单内 → 降级为 done（教程已完成态，避免未知步骤破坏状态机）
  if (!STORY_STEPS.includes(data.story.storyStep)) {
    data.story.storyStep = 'done';
  }
  // 主线任务状态：非法值 → not_started
  const questStates: readonly string[] = ['not_started', 'accepted', 'collected', 'completed'];
  if (!questStates.includes(data.world.questState)) {
    data.world.questState = 'not_started';
  }
  // 数值字段：非有限数/缺失 → 默认值（setter 会再做 clamp）
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  data.world.day = num(data.world.day, 1);
  data.world.hour = num(data.world.hour, 6);
  data.world.minute = num(data.world.minute, 0);
  data.world.coins = num(data.world.coins, 100);
  data.world.level = num(data.world.level, 1);
  data.world.xp = num(data.world.xp, 0);
  data.world.stamina = num(data.world.stamina, 100);
  // 每日任务：progress 非数值 → 0
  if (data.world.dailyQuest) {
    for (const q of data.world.dailyQuest.quests) {
      q.progress = num(q.progress, 0);
      q.completed = !!q.completed;
      q.claimed = !!q.claimed;
    }
  }
}

/**
 * 存档迁移：加载时 version 与 SAVE_VERSION 不一致时调用。
 * v0.5 起始策略：直接清空旧存档 —— 宁可重新开始，也不让旧格式数据污染新分组结构。
 * 后续版本升级时，在此处编写逐字段搬移的真实迁移逻辑。
 */
function migrate(oldVersion: string): void {
  console.warn(`[SaveSystem] 迁移 ${oldVersion} → ${SAVE_VERSION}：清空旧存档`);
  localStorage.removeItem(STORAGE_KEY);
}

/** 应用存档到各模块（读取后调用） */
export function apply(data: SaveData): void {
  // 世界：时间 / 金币 / 经验 / 体力 / 矿脉 / 任务
  setTimeFull(data.world.day, data.world.hour, data.world.minute);
  setCoins(data.world.coins);
  setLevel(data.world.level);
  setXp(data.world.xp);
  restoreStamina(data.world.stamina ?? 100);
  restoreMinedOres(data.world.minedOres ?? []);
  setQuestState(data.world.questState as QuestState);
  if (data.world.dailyQuest) restoreDailyQuests(data.world.dailyQuest);
  // 农场：土地 / 作物 / 树木
  clearAllTiles();
  restoreTileEntries(data.farm.tiles as [string, TileState][]);
  restoreCropEntries(data.farm.crops as [string, CropData][]);
  restoreTreeEntries((data.farm.trees as [string, TreeState][]) ?? []);
  // 剧情
  setStoryStep(data.story.storyStep ?? 'done');
  if (data.story.ch1TownIntroDone) markCh1TownIntroDone();
  // 背包
  restoreAllInventory(data.player.inventory);
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
