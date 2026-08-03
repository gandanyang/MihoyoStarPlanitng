/**
 * 记忆节点浮层（MemoryMoment）
 *
 * 首次事件仪式感：屏幕微暗 + 居中文字 + 淡入淡出。
 * 不冻结玩家操作（与 showDialogueText 不同）。
 *
 * 设计原则：
 *   首次事件 = 人生节点（记忆）
 *   后续事件 = 生活反馈（飘字）
 */

let overlayEl: HTMLDivElement | null = null;
let textEl: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function ensureDom(): void {
  if (overlayEl) return;

  overlayEl = document.createElement('div');
  overlayEl.id = 'memory-moment-overlay';
  overlayEl.style.cssText =
    'position:fixed;top:0;right:0;bottom:0;left:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(5,8,28,0);z-index:300;pointer-events:none;transition:background 0.8s ease;';

  textEl = document.createElement('div');
  textEl.style.cssText =
    'max-width:min(420px,85vw);text-align:center;color:#e8ecff;font-family:Arial,sans-serif;' +
    'font-size:16px;line-height:1.8;letter-spacing:0.5px;opacity:0;transition:opacity 0.8s ease;' +
    'text-shadow:0 1px 8px rgba(0,0,0,0.6);padding:0 20px;';

  overlayEl.appendChild(textEl);
  document.body.appendChild(overlayEl);
}

/**
 * 显示记忆节点浮层
 * @param text 居中显示的文字
 * @param durationMs 显示时长（默认 4000ms）
 */
export function showMemoryMoment(text: string, durationMs = 4000): void {
  ensureDom();
  if (!overlayEl || !textEl) return;

  // 清除上一个
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  // 设置文字
  textEl.textContent = text;

  // 显示：先 display flex，再淡入背景和文字
  overlayEl.style.display = 'flex';
  // 强制 reflow 以触发 CSS transition
  void overlayEl.offsetHeight;
  overlayEl.style.background = 'rgba(5,8,28,0.45)';
  textEl.style.opacity = '1';

  // 定时淡出
  hideTimer = setTimeout(() => {
    if (textEl) textEl.style.opacity = '0';
    if (overlayEl) overlayEl.style.background = 'rgba(5,8,28,0)';
    setTimeout(() => {
      if (overlayEl) overlayEl.style.display = 'none';
    }, 800); // 等待淡出动画完成
  }, durationMs);
}

/** 立即隐藏（页面切换/场景切换时调用） */
export function hideMemoryMoment(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (textEl) textEl.style.opacity = '0';
  if (overlayEl) {
    overlayEl.style.background = 'rgba(5,8,28,0)';
    setTimeout(() => {
      if (overlayEl) overlayEl.style.display = 'none';
    }, 300);
  }
}
