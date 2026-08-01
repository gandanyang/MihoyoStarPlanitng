// 全局游戏配置
export const GAME_CONFIG = {
  // 画布尺寸
  width: 800,
  height: 600,
  // 画布背景色
  backgroundColor: '#2d2d2d',
  // 时间流速：1现实分钟 ≈ 2游戏小时（一天约8分钟现实时间）
  timeScale: 2,
};

// 游戏标题
export const GAME_TITLE = '归星物语';

/**
 * 判断是否为移动端布局（小屏）。
 * 用于 HUD 等 UI 自适应：移动端精简信息、PC 保留完整提示。
 * 注意：输入控件（摇杆/按钮）PC 和手机都显示，不依赖此判断。
 * 统一入口，避免到处散落 window.innerWidth 判断。
 */
export function isMobileLayout(): boolean {
  return window.innerWidth < 800;
}

/**
 * 判断是否为触屏设备（用触屏能力判断，而非窗口宽度）。
 * 用于"移动端专属控件"（背包按钮等）——手机横屏宽度可能 ≥800，不能用 isMobileLayout。
 * 统一入口（原 TouchControls 内部 isTouchDevice，已收敛到此处）。
 */
export function isTouchDevice(): boolean {
  return typeof navigator !== 'undefined'
    && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
}
