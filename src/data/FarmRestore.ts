/**
 * 农场环境恢复状态（M1-3）
 *
 * 玩家通过交互清理"荒废角落"，环境变化后持久化到存档。
 * 制作人指令：范围严格限定为"爷爷旧花园复苏试点"，不做多恢复点系统。
 *
 * 状态：已恢复（restored）↔ 未记录（默认未恢复）
 * 存档序列化：getRestoreEntries / restoreRestoreEntries
 *
 * 与 SaveSystem 的约定（SaveData.farm.restore，可选字段，向后兼容）：
 *   - 旧存档无 restore 字段 → 视为全部未恢复
 *   - 版本号不递增
 */

/** 恢复点 key 集合（M1-3 仅 garden 一个示范点） */
export const RESTORE_KEYS = ['garden'] as const;

/** 恢复点 key 类型 */
export type RestoreKey = (typeof RESTORE_KEYS)[number];

/** 恢复状态表：key = 恢复点 */
const restored = new Map<string, boolean>();

/** 该恢复点是否已恢复（未记录视为未恢复） */
export function isRestored(key: string): boolean {
  return restored.get(key) === true;
}

/** 标记恢复点已恢复 */
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
