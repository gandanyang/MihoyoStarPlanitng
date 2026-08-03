/**
 * 归星记录面板（DOM 覆盖层）
 *
 * 设计：与 ShopPanel 相同模式——模块级单例、DOM 只创建一次、open/close 切显隐。
 * 触发：观星收尾剧情播放完成后由 MapScene 调 open()。
 * 内容：五段归星记录（🌱土地/🌸记忆/🏡庄园/👥羁绊/⭐评价）+ 变化对比 + 极简数据脚注。
 * 关闭后不再重复触发（storyStep = 'observatory_complete' 持久化判重）。
 *
 * 设计原则（制作人寄语）：
 *   核心目标不是评价玩家效率，而是记录玩家对归星岛造成的改变。
 *   不做排行榜/百分比/效率评价。
 */

import { getTime } from '../data/TimeSystem';
import { getLevel } from '../data/FarmProgress';
import { getItemCount, itemIconHtml } from '../data/Inventory';
import { generateGuiXingRecord, type GuiXingSection } from '../systems/GuiXingRecordSystem';

// ===== 模块级单例状态 =====
let panelEl: HTMLDivElement | null = null;
let domCreated = false;
let open = false;
let onClose: (() => void) | null = null;

/** 关闭面板 */
function closePanel(): void {
  if (!open) return;
  open = false;
  if (panelEl) panelEl.style.display = 'none';
  onClose?.();
}

/** 创建面板 DOM（模块级，只创建一次） */
function createDom(): void {
  if (domCreated) return;
  if (document.getElementById('ending-panel')) {
    domCreated = true;
    return;
  }
  domCreated = true;

  panelEl = document.createElement('div');
  panelEl.id = 'ending-panel';
  panelEl.style.cssText =
    'position:fixed;top:0;right:0;bottom:0;left:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(5,8,28,0.88);z-index:250;user-select:none;-webkit-user-select:none;overflow-y:auto;';

  panelEl.innerHTML = `
    <div style="width:min(480px,94vw);background:#1b2240;border:2px solid #3a4a8e;border-radius:12px;padding:24px 20px;color:#e8ecff;font-family:Arial;box-shadow:0 0 50px rgba(80,100,200,0.3);">
      <div id="gx-header" style="text-align:center;margin-bottom:18px;"></div>
      <div id="gx-change" style="display:none;margin-bottom:16px;"></div>
      <div id="gx-sections" style="margin-bottom:16px;"></div>
      <div id="gx-stats" style="text-align:center;background:#141b38;border-radius:8px;padding:10px 14px;font-size:11px;line-height:1.7;margin-bottom:14px;color:#6a7ab8;"></div>
      <div style="text-align:center;">
        <button data-action="continue" style="font-size:14px;padding:10px 32px;background:#4a5a9e;border:none;border-radius:6px;color:#e8ecff;cursor:pointer;box-shadow:0 2px 10px rgba(80,100,200,0.4);transition:background 0.2s;">继续自由游玩</button>
      </div>
    </div>
  `;
  document.body.appendChild(panelEl);

  panelEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.dataset?.action === 'continue') {
      closePanel();
    }
  });
}

/** 渲染单个段落 */
function renderSection(s: GuiXingSection, index: number): string {
  const borderColors = ['#7eb8da', '#e8a0c8', '#8fd6a8', '#d6b87e', '#c8b8e8'];
  const borderColor = borderColors[index % borderColors.length];

  const entriesHtml = s.entries.length > 0
    ? `<div style="margin-top:6px;font-size:12px;color:#8fa2c8;line-height:1.6;">${s.entries.map((e) => `· ${e}`).join('<br>')}</div>`
    : '';

  // 换行符转 <br>
  const narrativeHtml = s.narrative.replace(/\n/g, '<br>');

  return `
    <div style="border-left:3px solid ${borderColor};padding:12px 14px;margin-bottom:10px;background:rgba(255,255,255,0.03);border-radius:0 8px 8px 0;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="font-size:16px;">${s.icon}</span>
        <span style="font-size:14px;font-weight:bold;color:#dde4ff;">${s.title}</span>
      </div>
      <div style="font-size:13px;color:#b8c4e0;line-height:1.6;white-space:pre-line;">${narrativeHtml}</div>
      ${entriesHtml}
    </div>
  `;
}

/** 刷新报告内容（归星记录五段展示） */
function refresh(): void {
  if (!panelEl) return;
  const record = generateGuiXingRecord();

  // 标题
  const headerEl = panelEl.querySelector('#gx-header');
  if (headerEl) {
    headerEl.innerHTML = `
      <div style="font-size:12px;letter-spacing:3px;color:#6a7ab8;margin-bottom:6px;">📖 归星记录</div>
      <div style="font-size:18px;font-weight:bold;color:#fff;">第一章：重新开始</div>
      <div style="font-size:12px;color:#8090c0;margin-top:4px;">第 ${record.day} 天</div>
    `;
  }

  // 变化对比（仅在有显著变化时显示）
  const changeEl = panelEl.querySelector('#gx-change') as HTMLElement;
  if (changeEl && record.changeHighlight) {
    const ch = record.changeHighlight;
    changeEl.style.display = 'block';
    changeEl.innerHTML = `
      <div style="background:#141b38;border-radius:8px;padding:12px 14px;text-align:center;">
        <div style="font-size:12px;color:#6a7ab8;margin-bottom:6px;">你做出的改变</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;">
          <span style="font-size:13px;color:#8fa2c8;">${ch.before}</span>
          <span style="font-size:16px;color:#c8b8e8;">→</span>
          <span style="font-size:13px;color:#e8ecff;font-weight:bold;">${ch.after}</span>
        </div>
        <div style="font-size:12px;color:#8fa2c8;margin-top:6px;white-space:pre-line;">${ch.summary}</div>
      </div>
    `;
  } else if (changeEl) {
    changeEl.style.display = 'none';
  }

  // 五段内容
  const sectionsEl = panelEl.querySelector('#gx-sections');
  if (sectionsEl) {
    sectionsEl.innerHTML = record.sections
      .map((s, i) => renderSection(s, i))
      .join('');
  }

  // 极简数据脚注
  const statsEl = panelEl.querySelector('#gx-stats');
  if (statsEl) {
    const t = getTime();
    const crops = getItemCount('radish') + getItemCount('tomato') + getItemCount('corn') + getItemCount('strawberry');
    statsEl.innerHTML = `第 ${t.day} 天 · 农业 Lv.${getLevel()} · 收获 ${crops} 个 · ${itemIconHtml('diamond', 12)} ${getItemCount('diamond')}`;
  }
}

export class EndingPanel {
  constructor(onCloseCb?: () => void) {
    if (onCloseCb) onClose = onCloseCb;
    if (!domCreated) createDom();
  }

  /** 打开归星记录 */
  open(): void {
    open = true;
    if (panelEl) {
      refresh();
      panelEl.style.display = 'flex';
    }
  }

  /** 关闭归星记录 */
  close(): void {
    closePanel();
  }

  /** 归星记录是否打开 */
  isOpen(): boolean {
    return open;
  }
}
