/**
 * 剧情回顾面板（FEATURE-040，DOM 覆盖层，只读）
 *
 * 半透明深色背景 + 居中滚动列表，顶部标题「剧情回顾」+ 关闭按钮。
 * 点空白或关闭按钮均可关闭；内心独白斜体灰字；最多展示最近 50 条。
 * 复用 panelFadeIn/panelFadeOut。
 *
 * 模式同 ShopPanel/BackpackPanel：模块级单例，DOM 只创建一次。
 */

import { getHistory, type DialogueHistoryEntry } from '../systems/DialogueHistoryManager';
import { panelFadeIn, panelFadeOut } from './dom-anim';

// ===== 模块级单例 =====
let panelEl: HTMLDivElement | null = null;
let domCreated = false;
let open = false;
/** 关闭回调（StoryDialogue 用来恢复冻结的当前行） */
let onCloseCb: (() => void) | null = null;

/** 关闭面板 */
function closePanel(): void {
  if (!open) return;
  open = false;
  if (panelEl) panelFadeOut(panelEl, 150);
  onCloseCb?.();
}

/** 创建 DOM（只创建一次） */
function createDom(): void {
  if (domCreated) return;
  if (document.getElementById('dialogue-history-panel')) {
    domCreated = true;
    return;
  }
  domCreated = true;

  panelEl = document.createElement('div');
  panelEl.id = 'dialogue-history-panel';
  panelEl.style.cssText =
    'position:fixed;top:0;right:0;bottom:0;left:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(5,8,18,0.72);z-index:560;user-select:none;-webkit-user-select:none;';

  panelEl.innerHTML = `
    <div style="position:relative;width:min(560px,94vw);max-height:82vh;background:rgba(20,18,30,0.96);border:2px solid #3a3a5e;border-radius:12px;padding:14px 16px;color:#e8ecff;font-family:Arial;box-shadow:0 4px 30px rgba(0,0,0,0.6);display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0;">
        <span style="font-size:16px;font-weight:bold;color:#b8c8ff;letter-spacing:1px;">剧情回顾</span>
        <button data-action="close" style="font-size:13px;padding:4px 14px;background:rgba(255,255,255,0.08);color:#9aa0c0;border:1px solid rgba(255,255,255,0.15);border-radius:6px;cursor:pointer;">关闭 ✕</button>
      </div>
      <div id="dh-list" style="overflow-y:auto;flex:1;min-height:0;font-size:13px;line-height:1.7;"></div>
    </div>
  `;
  document.body.appendChild(panelEl);

  // 点空白关闭
  panelEl.addEventListener('click', (e) => {
    if (e.target === panelEl) closePanel();
  });
  // 关闭按钮
  const closeBtn = panelEl.querySelector('[data-action="close"]') as HTMLElement | null;
  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closePanel();
  });
  // Esc 关闭
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      closePanel();
    }
  });
}

/** 渲染一条历史（含说话人/文本；内心独白斜体灰字） */
function renderEntry(entry: DialogueHistoryEntry, index: number): string {
  const name = entry.inner
    ? '<span style="color:#8a8aa8;font-style:italic;">（内心）</span>'
    : entry.speaker
      ? `<span style="color:${entry.color || '#c0c0e0'};font-weight:bold;">${escapeHtml(entry.speaker)}</span>`
      : '<span style="color:#7a7a9a;">（旁白）</span>';
  const textStyle = entry.inner
    ? 'color:#9a9ab8;font-style:italic;'
    : entry.speaker
      ? 'color:#e8ecff;'
      : 'color:#b0b0d0;';
  const bg = index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
  return `<div style="padding:6px 10px;border-radius:6px;background:${bg};display:flex;gap:8px;align-items:flex-start;">
    <span style="flex-shrink:0;min-width:56px;">${name}</span>
    <span style="${textStyle};word-break:break-word;">${escapeHtml(entry.text)}</span>
  </div>`;
}

/** 简易 HTML 转义（防止台词中的 < > & 破坏面板结构） */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 刷新列表内容（最新在最下，滚动到底部） */
function refresh(): void {
  if (!panelEl) return;
  const list = panelEl.querySelector('#dh-list') as HTMLElement | null;
  if (!list) return;
  const history = getHistory();
  list.innerHTML = history.length === 0
    ? '<div style="color:#7a7a9a;text-align:center;padding:24px 0;">还没有对话记录。</div>'
    : history.map(renderEntry).join('');
  list.scrollTop = list.scrollHeight; // 滚动到底（最新）
}

export class DialogueHistoryPanel {
  constructor(closeCb?: () => void) {
    if (closeCb) onCloseCb = closeCb;
    if (!domCreated) createDom();
  }

  /** 打开回顾面板 */
  open(): void {
    open = true;
    if (panelEl) {
      refresh();
      panelFadeIn(panelEl, 180);
    }
  }

  /** 关闭 */
  close(): void {
    closePanel();
  }

  /** 是否打开 */
  isOpen(): boolean {
    return open;
  }
}
