/**
 * 居民需求板面板（FEATURE-038 · v0.10 · 轻量 DOM 覆盖层）
 *
 * - 一键交付：面板内点「交付」→ 扣资源 → 标记完成 → 回调 onDeliver（由 MapScene 播放反馈对白）
 * - 资源不足：卡片内红字提示缺什么（不关闭面板）
 * - 已完成：显示 ✓ 已完成，交付按钮置灰
 * - 复用 panelFadeIn/panelFadeOut；Esc / 关闭按钮 / 点空白关闭
 *
 * 数据源：src/systems/ResidentRequestSystem.ts（静态需求表 + 交付逻辑）
 */

import {
  getResidentRequests,
  canFulfillRequest,
  fulfillRequest,
  isRequestDone,
  getRequestShortageText,
  getRequestById,
  type ResidentRequest,
} from '../systems/ResidentRequestSystem';
import { getItemCount, itemIconHtml, type ItemType } from '../data/Inventory';
import { panelFadeIn, panelFadeOut } from './dom-anim';

// ===== 模块级单例 =====
let panelEl: HTMLDivElement | null = null;
let domCreated = false;
let open = false;
let onDeliverCb: ((reqId: string) => void) | null = null;

/** 关闭面板 */
function closePanel(): void {
  if (!open) return;
  open = false;
  if (panelEl) panelFadeOut(panelEl, 150);
}

/** 简易 HTML 转义（与相簿面板一致，防文案破坏结构） */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 需求展示文案（含图标） */
function needText(req: ResidentRequest): string {
  if (req.itemKind === 'wood') return `${itemIconHtml('wood', 16)} 木材`;
  return '🍽️ 食物（萝卜/番茄/玉米/草莓）';
}

/** 持有数量文案 */
function haveText(req: ResidentRequest): string {
  if (req.itemKind === 'wood') {
    return `持有：木材 ${getItemCount('wood')}`;
  }
  const food = (['radish', 'tomato', 'corn', 'strawberry'] as ItemType[])
    .reduce((sum, it) => sum + getItemCount(it), 0);
  return `持有：食物 ${food} 份`;
}

/** 创建 DOM（只创建一次） */
function createDom(): void {
  if (domCreated) return;
  if (document.getElementById('resident-board-panel')) {
    domCreated = true;
    return;
  }
  domCreated = true;

  panelEl = document.createElement('div');
  panelEl.id = 'resident-board-panel';
  panelEl.style.cssText =
    'position:fixed;top:0;right:0;bottom:0;left:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(5,8,28,0.85);z-index:220;user-select:none;-webkit-user-select:none;';

  panelEl.innerHTML = `
    <div style="width:min(420px,94vw);max-height:86vh;background:rgba(20,24,46,0.97);border:2px solid #3a4a8e;border-radius:12px;padding:16px;color:#e8ecff;font-family:Arial;box-shadow:0 4px 30px rgba(0,0,0,0.6);display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-shrink:0;">
        <span style="font-size:12px;letter-spacing:3px;color:#6a7ab8;">📌 居民需求板</span>
        <button data-action="close" style="width:30px;height:30px;border-radius:50%;background:#3a4a8e;border:none;color:#fff;font-size:16px;cursor:pointer;line-height:1;">×</button>
      </div>
      <div style="font-size:12px;color:#8090c0;margin-bottom:14px;flex-shrink:0;">镇上的人把需要的东西写在上面，帮忙捎一捎。</div>
      <div id="rb-list" style="overflow-y:auto;flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;"></div>
    </div>
  `;
  document.body.appendChild(panelEl);

  // 点空白关闭
  panelEl.addEventListener('click', (e) => {
    if (e.target === panelEl) closePanel();
  });
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
  // 事件委托：交付按钮
  panelEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-action="deliver"]') as HTMLElement | null;
    if (!btn) return;
    e.stopPropagation();
    const id = btn.getAttribute('data-id');
    if (!id) return;
    const req = getRequestById(id);
    if (!req || isRequestDone(id)) return;
    const result = fulfillRequest(id);
    if (result === 'success') {
      onDeliverCb?.(id);
      return;
    }
    if (result === 'insufficient') {
      // 注意：按钮自身也带 data-id，closest('[data-id]') 会命中按钮，必须用 .rb-card 容器向上找
      const card = btn.closest('.rb-card') as HTMLElement | null;
      const err = card?.querySelector('[data-err]') as HTMLElement | null;
      if (err) {
        err.style.display = 'block';
        err.textContent = '❌ ' + getRequestShortageText(req);
      }
    }
  });
}

/** 单张需求卡片 */
function renderCard(req: ResidentRequest): string {
  const done = isRequestDone(req.id);
  const enough = canFulfillRequest(req);
  const statusBadge = done
    ? '<span style="color:#7ef0a0;font-size:12px;">✓ 已完成</span>'
    : '<span style="color:#e8c070;font-size:12px;">待交付</span>';
  const button = done
    ? '<button disabled style="padding:5px 14px;border-radius:6px;border:none;background:#3a4a6e;color:#6a7ab8;font-size:12px;cursor:default;">已完成</button>'
    : `<button data-action="deliver" data-id="${req.id}" style="padding:5px 14px;border-radius:6px;border:none;background:#4a6ab8;color:#fff;font-size:12px;cursor:pointer;${enough ? '' : 'opacity:0.7;'}">交付</button>`;

  return `
    <div class="rb-card" data-id="${req.id}" style="background:rgba(255,255,255,0.03);border-radius:10px;padding:12px;border-left:3px solid #7eb8da;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:15px;font-weight:bold;color:#dde4ff;">${escapeHtml(req.npcName)}</span>
        ${statusBadge}
      </div>
      <div style="font-size:13px;color:#b8c4e0;line-height:1.7;">
        需求：${needText(req)} ×${req.count}<br>
        ${haveText(req)}
      </div>
      <div data-err style="display:none;font-size:12px;color:#ff8a8a;margin-top:6px;"></div>
      <div style="margin-top:10px;text-align:right;">${button}</div>
    </div>
  `;
}

/** 刷新面板内容（打开时调用） */
function refresh(): void {
  if (!panelEl) return;
  const list = panelEl.querySelector('#rb-list');
  if (list) {
    list.innerHTML = getResidentRequests().map(renderCard).join('');
  }
}

export class ResidentBoardPanel {
  constructor(onDeliver?: (reqId: string) => void) {
    if (onDeliver) onDeliverCb = onDeliver;
    if (!domCreated) createDom();
  }

  /** 打开需求板 */
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
