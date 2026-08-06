/**
 * 体力系统（挖矿 Phase）
 *
 * 每日 100 体力，挖矿消耗，睡觉恢复满。
 * 体力为 0 时无法挖矿。
 */

/** 体力上限 */
export const MAX_STAMINA = 100;

let stamina = MAX_STAMINA;

/** 读取当前体力 */
export function getStamina(): number {
  return stamina;
}

/** 消耗体力，返回是否成功（不足时返回 false 且不扣） */
export function consumeStamina(n: number): boolean {
  if (stamina < n) return false;
  stamina -= n;
  return true;
}

/** 恢复满体力（睡觉时调用） */
export function resetStamina(): void {
  stamina = MAX_STAMINA;
}

/** 直接设置体力（存档恢复用） */
export function setStamina(n: number): void {
  stamina = Math.max(0, Math.min(MAX_STAMINA, Math.floor(n)));
}
