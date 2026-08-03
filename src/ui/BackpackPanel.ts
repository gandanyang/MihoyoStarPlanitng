/**
 * 背包面板（Phase 0.25，DOM 覆盖层）
 *
 * 设计：和 ShopPanel 一样，盖在地图上的全屏 UI 窗口。
 * 模块级单例：DOM 只创建一次，open/close 切显隐。
 *
 * 交互：
 *   按 B 键 → MapScene 调 open() → 玩家移动/时间冻结
 *   关闭：B 键再次 / Esc 键 / 关闭按钮
 *   出售：物品格「出售」按钮 → 按 Economy 价格卖出 → 金币+1 / 物品-1
 *
 * 不实现：拖拽、丢弃、排序（MVP 范围）
 */

import { getCoins, addCoins, SELLABLE_ITEMS, hasSellableItems, sellAllSellable } from '../data/Economy';
import { getNonEmptyItems, itemIconHtml, addItem, ItemType } from '../data/Inventory';
import { play } from '../systems/AudioSystem';
import { showConfirmDialog } from './ConfirmDialog';

/** 关店回调 */
type OnClose = () => void;
/** 使用钥匙回调 */
type OnUseKey = () => boolean;
/** 使用机器人回调（部署自动农业机器人，成功返回 true 关闭面板） */
type OnUseRobot = () => boolean;
/** 数据变更回调（出售物品后更新 HUD） */
type OnDataChange = () => void;

// ===== 模块级单例 =====
let panelEl: HTMLDivElement | null = null;
let domCreated = false;
let open = false;
let onClose: OnClose | null = null;
let onUseKey: OnUseKey | null = null;
let onUseRobot: OnUseRobot | null = null;
let onDataChange: OnDataChange | null = null;

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
    'position:fixed;top:0;right:0;bottom:0;left:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,0.55);z-index:210;user-select:none;-webkit-user-select:none';

  panelEl.innerHTML = `
    <div style="position:relative;width:min(400px,90vw);background:#3d3226;border:3px solid #8a6a45;border-radius:10px;padding:18px;color:#fff;font-family:Arial;box-shadow:0 4px 20px rgba(0,0,0,0.6)">
      <div id="bp-toast" style="position:absolute;left:50%;top:-2px;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#7ef0a0;font-size:13px;padding:4px 14px;border-radius:6px;display:none;pointer-events:none;white-space:normal;line-height:1.5;text-align:center;z-index:2;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-size:18px;font-weight:bold;color:#ffd700;letter-spacing:1px;">背包</span>
        <span id="bp-coins" style="font-size:14px;color:#ffe082;"></span>
      </div>
      <div id="bp-grid" style="display:flex;flex-wrap:wrap;gap:10px;min-height:80px;margin-bottom:12px;"></div>
      <div style="text-align:center;">
        <button data-action="sell-all" style="font-size:14px;padding:6px 20px;background:#c49a2a;border:none;border-radius:4px;color:#fff;cursor:pointer;">全部出售</button>
        <button data-action="close" style="font-size:14px;padding:6px 24px;background:#8a6a45;border:none;border-radius:4px;color:#fff;cursor:pointer;margin-left:8px;">关闭 (B/Esc)</button>
        <button data-action="return-title" style="font-size:12px;padding:4px 14px;background:#5a4030;border:1px solid #6a5040;border-radius:4px;color:#ccc;cursor:pointer;margin-left:8px;">返回标题</button>
      </div>
    </div>
  `;
  document.body.appendChild(panelEl);

  // 事件委托
  panelEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.dataset?.action === 'close') {
      closePanel();
    } else if (target.dataset?.action === 'return-title') {
      // 返回标题画面（标题画面有删档/重置存档按钮）
      // reload 会触发 beforeunload/pagehide 自动存档，重载后标题画面 hasSave()=true 显示删档按钮
      closePanel();
      location.reload();
    } else if (target.dataset?.action === 'use-key') {
      // 使用庄园钥匙
      if (onUseKey?.()) {
        closePanel();
      }
    } else if (target.dataset?.action === 'use-robot') {
      // 部署自动农业机器人
      if (onUseRobot?.()) {
        closePanel();
      }
    } else if (target.dataset?.action === 'sell') {
      // 背包出售：卖 1 个
      const itemId = target.dataset?.item as ItemType | undefined;
      if (itemId && SELLABLE_ITEMS[itemId] !== undefined) {
        const price = SELLABLE_ITEMS[itemId]!;
        addItem(itemId, -1);
        addCoins(price);
        play('sell');
        refresh();
        onDataChange?.();
      }
    } else if (target.dataset?.action === 'sell-all') {
      // 一键出售：二次确认后卖出全部可售物品
      if (!hasSellableItems()) {
        showToast('背包里没有可出售的物品');
        play('invalid');
        return;
      }
      showConfirmDialog('确认卖出全部可售物品？', () => {
        const result = sellAllSellable();
        play('sell');
        refresh();
        onDataChange?.();
        const detail = result.sold.map(s => `${s.name}×${s.count}`).join('、');
        showToast(`卖出全部，获得 ${result.totalCoins}G<br>${detail}`);
      });
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

/** 出售/提示 toast（面板内短暂提示） */
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(msg: string): void {
  if (!panelEl) return;
  const t = panelEl.querySelector('#bp-toast') as HTMLElement | null;
  if (!t) return;
  t.innerHTML = msg;
  t.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.display = 'none'; }, 1600);
}

/** 刷新面板内容 */
function refresh(): void {
  if (!panelEl) return;
  const items = getNonEmptyItems();
  const coins = getCoins();

  // 金币
  const coinsEl = panelEl.querySelector('#bp-coins');
  if (coinsEl) {
    coinsEl.innerHTML = `${itemIconHtml('coin', 16)} ${coins}G`;
  }

  // 一键出售按钮：无可售物品时置灰
  const sellAllBtn = panelEl.querySelector('[data-action="sell-all"]') as HTMLElement | null;
  if (sellAllBtn) {
    const can = hasSellableItems();
    sellAllBtn.style.opacity = can ? '1' : '0.45';
    sellAllBtn.style.cursor = can ? 'pointer' : 'not-allowed';
  }

  // 物品网格
  const gridEl = panelEl.querySelector('#bp-grid');
  if (!gridEl) return;

  if (items.length === 0) {
    gridEl.innerHTML =
      '<div style="width:100%;text-align:center;color:#9a8a72;padding:20px;font-size:14px;">背包空空如也</div>';
    return;
  }

  const cellStyle =
    'width:100px;background:#4a3626;border-radius:6px;padding:10px;text-align:center;' +
    'border:2px solid #5b4430;';

  let html = '';

  for (const { item, count, def } of items) {
    const isKey = def.id === 'manor_key';
    const isRobot = def.id === 'auto_farmer_robot';
    const useBtn = isKey || isRobot
      ? `<button data-action="${isRobot ? 'use-robot' : 'use-key'}" style="margin-top:6px;font-size:12px;padding:4px 12px;background:#6a8a45;border:none;border-radius:4px;color:#fff;cursor:pointer;">${isRobot ? '部署' : '使用'}</button>`
      : '';
    const sellPrice = SELLABLE_ITEMS[item];
    const sellBtn = sellPrice !== undefined
      ? `<button data-action="sell" data-item="${item}" style="margin-top:6px;font-size:12px;padding:4px 10px;background:#c49a2a;border:none;border-radius:4px;color:#fff;cursor:pointer;">卖 ${sellPrice}G</button>`
      : '';
    html += `
      <div style="${cellStyle}">
        <div style="margin-bottom:4px;line-height:1;">${itemIconHtml(def.id, 28)}</div>
        <div style="font-size:13px;font-weight:bold;color:#e0d5c1;">${def.name}</div>
        <div style="font-size:12px;color:#a5d6a7;">×${count}</div>
        ${useBtn}${sellBtn}
      </div>
    `;
  }

  gridEl.innerHTML = html;
}

export class BackpackPanel {
  constructor(onCloseCb?: OnClose, onUseKeyCb?: OnUseKey, onDataChangeCb?: OnDataChange, onUseRobotCb?: OnUseRobot) {
    if (onCloseCb) onClose = onCloseCb;
    if (onUseKeyCb) onUseKey = onUseKeyCb;
    if (onDataChangeCb) onDataChange = onDataChangeCb;
    if (onUseRobotCb) onUseRobot = onUseRobotCb;
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