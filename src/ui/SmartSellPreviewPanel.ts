/**
 * 智能出售预览面板（FEATURE-039，DOM 覆盖层）
 *
 * 一键出售前弹出预览：显示将卖什么、将保留什么、预计获得多少金币。
 * 玩家确认后才真正执行出售。
 *
 * 模式同 ShopPanel/BackpackPanel：模块级单例，DOM 只创建一次。
 */

import { previewSellAll, sellAllSellable, type SellAllResult } from '../data/Economy';
import { itemIconHtml } from '../data/Inventory';
import { play } from '../systems/AudioSystem';
import { panelFadeIn, panelFadeOut } from './dom-anim';

// ===== 模块级单例 =====
let panelEl: HTMLDivElement | null = null;
let domCreated = false;
let open = false;
/** 确认出售回调（通知调用方刷新 HUD / 每日任务） */
let onConfirm: ((result: SellAllResult) => void) | null = null;

/** 关闭面板 */
function closePanel(): void {
  if (!open) return;
  open = false;
  if (panelEl) panelFadeOut(panelEl, 150);
}

/** 创建 DOM（只创建一次） */
function createDom(): void {
  if (domCreated) return;
  if (document.getElementById('smart-sell-panel')) {
    domCreated = true;
    return;
  }
  domCreated = true;

  panelEl = document.createElement('div');
  panelEl.id = 'smart-sell-panel';
  panelEl.style.cssText =
    'position:fixed;top:0;right:0;bottom:0;left:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,0.55);z-index:220;user-select:none;-webkit-user-select:none';

  panelEl.innerHTML = `
    <div style="position:relative;width:min(420px,92vw);max-height:85vh;overflow-y:auto;background:#3d3226;border:3px solid #8a6a45;border-radius:10px;padding:16px;color:#fff;font-family:Arial;box-shadow:0 4px 20px rgba(0,0,0,0.6)">
      <div style="text-align:center;font-size:18px;font-weight:bold;margin-bottom:12px;color:#ffd700;letter-spacing:1px;">出售预览</div>
      <div id="ss-coins" style="text-align:center;font-size:16px;margin-bottom:12px;color:#ffe082;"></div>
      <div id="ss-sold" style="margin-bottom:10px;"></div>
      <div id="ss-skipped" style="margin-bottom:12px;"></div>
      <div style="display:flex;gap:12px;justify-content:center;">
        <button data-action="confirm" style="font-size:14px;padding:6px 24px;background:#c49a2a;border:none;border-radius:4px;color:#fff;cursor:pointer;">确认出售</button>
        <button data-action="cancel" style="font-size:14px;padding:6px 24px;background:#8a6a45;border:none;border-radius:4px;color:#fff;cursor:pointer;">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(panelEl);

  panelEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const action = target.dataset?.action;
    if (action === 'cancel') {
      closePanel();
    } else if (action === 'confirm') {
      const result = sellAllSellable();
      play('sell');
      onConfirm?.(result);
      closePanel();
    }
  });

  // Esc 关闭
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      closePanel();
    }
  });
}

/** 刷新预览内容 */
function refresh(): void {
  if (!panelEl) return;
  const preview = previewSellAll();

  // 预计金币
  const coinsEl = panelEl.querySelector('#ss-coins');
  if (coinsEl) {
    if (preview.totalCoins > 0) {
      coinsEl.innerHTML = `${itemIconHtml('coin', 18)} 预计获得 <b style="font-size:18px;">${preview.totalCoins}</b> G`;
    } else {
      coinsEl.innerHTML = '<span style="color:#9a8a72;">没有可出售的物品</span>';
    }
  }

  // 将出售列表
  const soldEl = panelEl.querySelector('#ss-sold');
  if (soldEl) {
    if (preview.sold.length > 0) {
      soldEl.innerHTML = '<div style="font-size:13px;font-weight:bold;color:#a5d6a7;margin-bottom:4px;">将出售</div>' +
        preview.sold.map(s => `<div style="font-size:13px;display:flex;justify-content:space-between;padding:2px 0;">
          <span>${itemIconHtml(s.item, 16)} ${s.name} ×${s.count}</span>
          <span style="color:#ffe082;">${s.earned}G</span>
        </div>`).join('');
    } else {
      soldEl.innerHTML = '';
    }
  }

  // 将保留列表
  const skippedEl = panelEl.querySelector('#ss-skipped');
  if (skippedEl) {
    if (preview.skipped.length > 0) {
      skippedEl.innerHTML = '<div style="font-size:13px;font-weight:bold;color:#ffab91;margin-bottom:4px;">将保留（不自动出售）</div>' +
        preview.skipped.map(s => `<div style="font-size:12px;color:#c4b59a;padding:2px 0;display:flex;justify-content:space-between;">
          <span>${itemIconHtml(s.item, 14)} ${s.name} ×${s.count}</span>
          <span style="color:#9a8a72;">${s.reason === 'locked' ? '🔒 已锁定' : '保留资源'}</span>
        </div>`).join('');
    } else {
      skippedEl.innerHTML = '';
    }
  }

  // 确认按钮：没有可卖物品时置灰
  const confirmBtn = panelEl.querySelector('[data-action="confirm"]') as HTMLElement | null;
  if (confirmBtn) {
    const canSell = preview.totalCoins > 0;
    confirmBtn.style.opacity = canSell ? '1' : '0.45';
    confirmBtn.style.cursor = canSell ? 'pointer' : 'not-allowed';
  }
}

export class SmartSellPreviewPanel {
  constructor(confirmCb?: (result: SellAllResult) => void) {
    if (confirmCb) onConfirm = confirmCb;
    if (!domCreated) createDom();
  }

  /** 打开预览面板 */
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
