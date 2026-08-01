/**
 * 商店面板（Phase 0.2，DOM 覆盖层）
 *
 * 设计：不是独立 Scene，而是盖在当前地图上的全屏 UI 窗口
 * （同 TouchControls 的 DOM 模式，模块级单例、DOM 只创建一次）。
 * 理由：商店只是 UI，地图/时间/NPC 无需切换；
 *       未来背包/任务/设置面板沿用同一套 src/ui/ 结构。
 *
 * 交互流程：
 *   靠近商人按 E → MapScene 调 open() → 玩家移动/时间冻结（由 MapScene.update 控制）
 *   面板内点击 买种子/卖作物 → 操作 Economy/Inventory → 回调 onDataChange 刷新 HUD
 *   关闭：Esc（DOM keydown）或 关闭按钮；MapScene.update 里 E 也会触发 close()
 *
 * 模块级单例：open/close 只切显隐，DOM 只建一次。
 */

import {
  addCoins,
  getCoins,
  RADISH_PRICE,
  TOMATO_PRICE,
  CORN_PRICE,
  STRAWBERRY_PRICE,
  STONE_PRICE,
  COPPER_PRICE,
  IRON_PRICE,
  WOOD_PRICE,
  spendCoins,
} from '../data/Economy';
import { addItem, getItemCount } from '../data/Inventory';
import { play } from '../systems/AudioSystem';

/** 商店商品配置 */
interface ShopItem {
  id: string;
  label: string;
  price: number;
  action: string;
  /** 购买/出售 */
  type: 'buy' | 'sell';
  /** 检查是否可操作 */
  canDo: () => boolean;
  /** 执行操作 */
  do: () => void;
}

const SHOP_ITEMS: ShopItem[] = [
  // 出售（作物 → 金币）
  {
    id: 'radish', label: '🥕 萝卜', price: RADISH_PRICE, action: 'sell-radish', type: 'sell',
    canDo: () => getItemCount('radish') > 0,
    do: () => { addItem('radish', -1); addCoins(RADISH_PRICE); },
  },
  {
    id: 'tomato', label: '🍅 番茄', price: TOMATO_PRICE, action: 'sell-tomato', type: 'sell',
    canDo: () => getItemCount('tomato') > 0,
    do: () => { addItem('tomato', -1); addCoins(TOMATO_PRICE); },
  },
  {
    id: 'corn', label: '🌽 玉米', price: CORN_PRICE, action: 'sell-corn', type: 'sell',
    canDo: () => getItemCount('corn') > 0,
    do: () => { addItem('corn', -1); addCoins(CORN_PRICE); },
  },
  {
    id: 'strawberry', label: '🍓 草莓', price: STRAWBERRY_PRICE, action: 'sell-strawberry', type: 'sell',
    canDo: () => getItemCount('strawberry') > 0,
    do: () => { addItem('strawberry', -1); addCoins(STRAWBERRY_PRICE); },
  },
  // 出售矿石
  {
    id: 'stone', label: '🪨 石头', price: STONE_PRICE, action: 'sell-stone', type: 'sell',
    canDo: () => getItemCount('stone') > 0,
    do: () => { addItem('stone', -1); addCoins(STONE_PRICE); },
  },
  {
    id: 'copper', label: '🟤 铜矿', price: COPPER_PRICE, action: 'sell-copper', type: 'sell',
    canDo: () => getItemCount('copper') > 0,
    do: () => { addItem('copper', -1); addCoins(COPPER_PRICE); },
  },
  {
    id: 'iron', label: '⚪ 铁矿', price: IRON_PRICE, action: 'sell-iron', type: 'sell',
    canDo: () => getItemCount('iron') > 0,
    do: () => { addItem('iron', -1); addCoins(IRON_PRICE); },
  },
  // 出售木材
  {
    id: 'wood', label: '🪵 木材', price: WOOD_PRICE, action: 'sell-wood', type: 'sell',
    canDo: () => getItemCount('wood') > 0,
    do: () => { addItem('wood', -1); addCoins(WOOD_PRICE); },
  },
  // 购买（金币 → 种子）
  {
    id: 'radish_seed', label: '🌱 萝卜种子', price: 10, action: 'buy-radish-seed', type: 'buy',
    canDo: () => getCoins() >= 10,
    do: () => { if (spendCoins(10)) addItem('radish_seed', 1); },
  },
  {
    id: 'tomato_seed', label: '🌱 番茄种子', price: 20, action: 'buy-tomato-seed', type: 'buy',
    canDo: () => getCoins() >= 20,
    do: () => { if (spendCoins(20)) addItem('tomato_seed', 1); },
  },
  {
    id: 'corn_seed', label: '🌱 玉米种子', price: 15, action: 'buy-corn-seed', type: 'buy',
    canDo: () => getCoins() >= 15,
    do: () => { if (spendCoins(15)) addItem('corn_seed', 1); },
  },
  {
    id: 'strawberry_seed', label: '🍓 草莓种子', price: 50, action: 'buy-strawberry-seed', type: 'buy',
    canDo: () => getCoins() >= 50,
    do: () => { if (spendCoins(50)) addItem('strawberry_seed', 1); },
  },
];

/** 数据变化回调（MapScene 用它刷新 HUD 金币显示） */
type OnDataChange = () => void;

// ===== 模块级单例状态 =====
let panelEl: HTMLDivElement | null = null;
let domCreated = false;
let open = false;
let onDataChange: OnDataChange | null = null;
/** 关店回调（MapScene 注册：清除残留 E 键 + 重置帧计时） */
let onClose: (() => void) | null = null;
/** 购买回调（每日任务通知） */
let onBuyCallback: ((count: number) => void) | undefined;
/** 卖出回调（每日任务通知） */
let onSellCallback: ((count: number) => void) | undefined;

/** 关闭面板（模块级，事件监听器和 ShopPanel.close() 都走这里） */
function closePanel(): void {
  if (!open) return;
  open = false;
  if (panelEl) panelEl.style.display = 'none';
  onClose?.();
}

/** 创建面板 DOM（模块级，只创建一次） */
function createDom(): void {
  if (domCreated) return;
  if (document.getElementById('shop-panel')) {
    domCreated = true;
    return;
  }
  domCreated = true;

  panelEl = document.createElement('div');
  panelEl.id = 'shop-panel';
  panelEl.style.cssText =
    'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,0.55);z-index:200;user-select:none;-webkit-user-select:none';

  panelEl.innerHTML = `
    <div style="width:min(440px,92vw);background:#5b4430;border:3px solid #8a6a45;border-radius:8px;padding:16px;color:#fff;font-family:Arial;box-shadow:0 4px 16px rgba(0,0,0,0.5)">
      <div style="text-align:center;font-size:18px;font-weight:bold;margin-bottom:8px;">星辰杂货店</div>
      <div id="shop-coins" style="text-align:center;font-size:14px;margin-bottom:12px;color:#ffe082;"></div>
      <div style="display:flex;gap:12px;">
        <div style="flex:1;background:#4a3626;border-radius:6px;padding:10px;">
          <div style="text-align:center;font-weight:bold;margin-bottom:8px;color:#ffab91;">出售</div>
          <div id="shop-sell" style="font-size:13px;"></div>
        </div>
        <div style="flex:1;background:#4a3626;border-radius:6px;padding:10px;">
          <div style="text-align:center;font-weight:bold;margin-bottom:8px;color:#a5d6a7;">购买</div>
          <div id="shop-buy" style="font-size:13px;"></div>
        </div>
      </div>
      <div style="text-align:center;margin-top:14px;">
        <button data-action="close" style="font-size:14px;padding:6px 26px;background:#8a6a45;border:none;border-radius:4px;color:#fff;cursor:pointer;">关闭 (Esc)</button>
      </div>
    </div>
  `;
  document.body.appendChild(panelEl);

  // 事件委托：所有按钮走 data-action 分发
  panelEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const action = target.dataset?.action;
    if (action === 'close') {
      closePanel();
      return;
    }
    const item = SHOP_ITEMS.find(i => i.action === action);
    if (item) {
      item.do();
      if (item.type === 'buy') onBuyCallback?.(1);
      else if (item.type === 'sell') onSellCallback?.(1);
      play(item.type === 'sell' ? 'sell' : 'buy');
      refresh();
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

/** 刷新面板显示 */
function refresh(): void {
  if (!panelEl) return;
  const coins = getCoins();

  const coinsEl = panelEl.querySelector('#shop-coins');
  if (coinsEl) {
    coinsEl.textContent = `金币 ${coins} G`;
  }

  const btnBase = 'font-size:12px;padding:3px 10px;border:none;border-radius:4px;cursor:pointer;';
  const btnActive = `${btnBase}background:#c79a5b;color:#fff;`;
  const btnDisabled = `${btnBase}background:#6b573f;color:#9a8a72;cursor:not-allowed;`;

  // 出售栏
  const sellEl = panelEl.querySelector('#shop-sell');
  if (sellEl) {
    const sellItems = SHOP_ITEMS.filter(i => i.type === 'sell');
    sellEl.innerHTML = sellItems.map(item => {
      const canSell = item.canDo();
      return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span>${item.label}</span>
        <button data-action="${item.action}" ${canSell ? '' : 'disabled'} style="${canSell ? btnActive : btnDisabled}">卖 ${item.price}G</button>
      </div>`;
    }).join('');
  }

  // 购买栏
  const buyEl = panelEl.querySelector('#shop-buy');
  if (buyEl) {
    const buyItems = SHOP_ITEMS.filter(i => i.type === 'buy');
    buyEl.innerHTML = buyItems.map(item => {
      const canBuy = item.canDo();
      return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span>${item.label}</span>
        <button data-action="${item.action}" ${canBuy ? '' : 'disabled'} style="${canBuy ? btnActive : btnDisabled}">买 ${item.price}G</button>
      </div>`;
    }).join('');
  }

  onDataChange?.();
}

export class ShopPanel {
  constructor(onChange: OnDataChange, onCloseCb?: () => void, onBuy?: (count: number) => void, onSell?: (count: number) => void) {
    onDataChange = onChange;
    if (onCloseCb) onClose = onCloseCb;
    onBuyCallback = onBuy;
    onSellCallback = onSell;
    if (!domCreated) createDom();
  }

  /** 打开商店 */
  open(): void {
    open = true;
    if (panelEl) {
      refresh();
      panelEl.style.display = 'flex';
    }
  }

  /** 关闭商店 */
  close(): void {
    closePanel();
  }

  /** 商店是否打开 */
  isOpen(): boolean {
    return open;
  }
}