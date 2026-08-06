/**
 * 归星岛复兴：建设点/恢复点状态（M1-3 + FEATURE-037）
 *
 * 玩家通过交互完成建设/恢复，环境变化后持久化到存档。
 * FEATURE-037（制作人 2026-08-06 拍板）将原"单一恢复点"指令扩展为 3 个建设点：
 *   garden    —— 爷爷旧花园（清理三阶段，M1-3 既有流程，无资源需求）
 *   oldHouse  —— 老屋修复（木材+石头+金币）
 *   forestRoad—— 后山道路修复（石头+金币）
 *
 * 状态：已恢复（restored）↔ 未记录（默认未恢复）
 * 存档序列化：getRestoreEntries / restoreRestoreEntries
 *
 * 与 SaveSystem 的约定（FEATURE-037 决策 5：SaveData.worldRestore，可选字段，向后兼容）：
 *   - 新档写入顶层 worldRestore（不塞 farm.restore，避免变成垃圾桶）
 *   - 旧档仅 farm.restore（M1-3 garden）→ 加载时一次性迁移合并进 worldRestore（不回退）
 *   - 两者皆无 → 视为全部未恢复
 *   - 版本号不递增
 */

/** 恢复点/建设点 key 集合 */
export const RESTORE_KEYS = ['garden', 'oldHouse', 'forestRoad'] as const;

/** 恢复点 key 类型 */
export type RestoreKey = (typeof RESTORE_KEYS)[number];

/** 建设点项目配置 */
export interface RestoreProject {
  id: RestoreKey;
  /** 显示名（交互标记/提示用） */
  name: string;
  /** 建设需求（garden 为清理流，无资源需求 → 缺省） */
  requirements?: { wood?: number; stone?: number; gold?: number };
}

/** 建设点配置表（需求为提案值，施工时按日收入量级平衡） */
export const RESTORE_PROJECTS: Record<RestoreKey, RestoreProject> = {
  garden: { id: 'garden', name: '爷爷旧花园' },
  oldHouse: { id: 'oldHouse', name: '老屋', requirements: { wood: 30, stone: 20, gold: 100 } },
  forestRoad: { id: 'forestRoad', name: '后山道路', requirements: { stone: 50, gold: 200 } },
};

/**
 * 计算建设点当前缺少的资源提示（纯函数，可单测）。
 * have 为玩家当前持有量；无资源需求（如 garden）→ 返回空数组。
 * 返回示例：['木头×5', '金币×40']
 */
export function getProjectShortfall(
  key: RestoreKey,
  have: { wood: number; stone: number; gold: number },
): string[] {
  const req = RESTORE_PROJECTS[key].requirements;
  if (!req) return [];
  const missing: string[] = [];
  if ((req.wood ?? 0) > have.wood) missing.push(`木头×${req.wood! - have.wood}`);
  if ((req.stone ?? 0) > have.stone) missing.push(`石头×${req.stone! - have.stone}`);
  if ((req.gold ?? 0) > have.gold) missing.push(`金币×${req.gold! - have.gold}`);
  return missing;
}

/** 恢复状态表：key = 建设点 */
const restored = new Map<string, boolean>();

/** 该建设点是否已恢复（未记录视为未恢复） */
export function isRestored(key: string): boolean {
  return restored.get(key) === true;
}

/** 标记建设点已恢复 */
export function markRestored(key: string): void {
  restored.set(key, true);
}

/** 获取所有恢复条目（存档序列化用） */
export function getRestoreEntries(): Record<string, boolean> {
  return Object.fromEntries(restored.entries());
}

/** 恢复状态（存档加载用，entries 缺失 → 全部未恢复） */
export function restoreRestoreEntries(entries: Record<string, boolean> | undefined): void {
  restored.clear();
  if (!entries) return;
  for (const [key, val] of Object.entries(entries)) {
    if (val === true) restored.set(key, true);
  }
}
