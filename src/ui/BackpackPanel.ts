/**
 * 背包面板（Phase 0.25，DOM 覆盖层）
 *
 * 设计：和 ShopPanel 一样，盖在地图上的全屏 UI 窗口。
 * 模块级单例：DOM 只创建一次，open/close 切显隐。
 *
 * 交互：
 *   按 B 键 → MapScene 调 open() → 玩家移动/时间冻结
 *   关闭：B 键再次 / Esc 键 / 关闭按钮
 *
 * 不实现：拖拽、使用、丢弃、排序（MVP 范围）
 */

import { getCoins } from '../data/Economy';
import { getNonEmptyItems, ITEM_DEFS } from '../data/Inventory';
import { getSeedCount } from '../data/FarmState';

/** 关店回调 */
type OnClose = () => void;

// ===== 模块级单例 =====
let panelEl: HTMLDivElement | null = null;
let domCreated = false;
let open = false;
let onClose: OnClose | null = null;

/** 关闭面板（模块级，B/Esc/按钮都走这里） */
function closePanel(): void {
  if (!open) return;
  open = false;
  if (panelEl) panelEl.style.display = 'none';
  onClose?.();
}

/** 创建 DOM（模块级，只创建一次） */
function createDom(): void {
  if (domCreated) return;
  if (document.getElementById('backpack-panel')) {
    domCreated = true;
    return;
  }
  domCreated = true;

  panelEl = document.createElement('div');
  panelEl.id = 'backpack-panel';
  panelEl.style.cssText =
    'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,0.55);z-index:210;user-select:none;-webkit-user-select:none';

  panelEl.innerHTML = `
    <div style="width:min(400px,90vw);background:#3d3226;border:3px solid #8a6a45;border-radius:10px;padding:18px;color:#fff;font-family:Arial;box-shadow:0 4px 20px rgba(0,0,0,0.6)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-size:18px;font-weight:bold;">背包</span>
        <span id="bp-coins" style="font-size:14px;color:#ffe082;"></span>
      </div>
      <div id="bp-grid" style="display:flex;flex-wrap:wrap;gap:10px;min-height:80px;margin-bottom:12px;"></div>
      <div style="text-align:center;">
        <button data-action="close" style="font-size:14px;padding:6px 24px;background:#8a6a45;border:none;border-radius:4px;color:#fff;cursor:pointer;">关闭 (B/Esc)</button>
      </div>
    </div>
  `;
  document.body.appendChild(panelEl);

  // 事件委托
  panelEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.dataset?.action === 'close') {
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

/** 刷新面板内容 */
function refresh(): void {
  if (!panelEl) return;
  const items = getNonEmptyItems();
  const coins = getCoins();
  const seeds = getSeedCount();

  // 金币
  const coinsEl = panelEl.querySelector('#bp-coins');
  if (coinsEl) {
    coinsEl.textContent = `金币 ${coins}G`;
  }

  // 物品网格
  const gridEl = panelEl.querySelector('#bp-grid');
  if (!gridEl) return;

  if (items.length === 0 && seeds === 0) {
    gridEl.innerHTML =
      '<div style="width:100%;text-align:center;color:#9a8a72;padding:20px;font-size:14px;">背包空空如也</div>';
    return;
  }

  const cellStyle =
    'width:100px;background:#4a3626;border-radius:6px;padding:10px;text-align:center;' +
    'border:2px solid #5b4430;';

  let html = '';

  for (const { count, def } of items) {
    html += `
      <div style="${cellStyle}">
        <div style="font-size:28px;margin-bottom:4px;">${def.icon}</div>
        <div style="font-size:13px;font-weight:bold;color:#e0d5c1;">${def.name}</div>
        <div style="font-size:12px;color:#a5d6a7;">×${count}</div>
      </div>
    `;
  }

  // 种子（来自 FarmState，不在 Inventory 里）
  if (seeds > 0) {
    const seedDef = ITEM_DEFS.seed;
    html += `
      <div style="${cellStyle}">
        <div style="font-size:28px;margin-bottom:4px;">${seedDef.icon}</div>
        <div style="font-size:13px;font-weight:bold;color:#e0d5c1;">${seedDef.name}</div>
        <div style="font-size:12px;color:#a5d6a7;">×${seeds}</div>
      </div>
    `;
  }

  gridEl.innerHTML = html;
}

export class BackpackPanel {
  constructor(onCloseCb?: OnClose) {
    if (onCloseCb) onClose = onCloseCb;
    if (!domCreated) createDom();
  }

  /** 打开背包 */
  open(): void {
    open = true;
    if (panelEl) {
      refresh();
      panelEl.style.display = 'flex';
    }
  }

  /** 关闭背包 */
  close(): void {
    closePanel();
  }

  /** 是否打开 */
  isOpen(): boolean {
    return open;
  }
}