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
 *   面板内点击 买种子/卖萝卜 → 操作 Economy/FarmState → 回调 onDataChange 刷新 HUD
 *   关闭：Esc（DOM keydown）或 关闭按钮；MapScene.update 里 E 也会触发 close()
 *
 * 模块级单例：open/close 只切显隐，DOM 只建一次。
 */

import {
  addCoins,
  getCoins,
  RADISH_PRICE,
  SEED_PRICE,
  spendCoins,
} from '../data/Economy';
import { addItem, getItemCount } from '../data/Inventory';
import { addSeeds, getSeedCount } from '../data/FarmState';
import { play } from '../systems/AudioSystem';

/** 数据变化回调（MapScene 用它刷新 HUD 金币显示） */
type OnDataChange = () => void;

// ===== 模块级单例状态 =====
let panelEl: HTMLDivElement | null = null;
let domCreated = false;
let open = false;
let onDataChange: OnDataChange | null = null;
/** 关店回调（MapScene 注册：清除残留 E 键 + 重置帧计时） */
let onClose: (() => void) | null = null;

/** 关闭面板（模块级，事件监听器和 ShopPanel.close() 都走这里） */
function closePanel(): void {
  if (!open) return; // 防止重复关闭（E 键 + Esc 双路径可能同时触发）
  open = false;
  if (panelEl) panelEl.style.display = 'none';
  // 通知外部：清理 InputManager 残留 E 键、重置帧计时
  onClose?.();
}

/** 创建面板 DOM（模块级，只创建一次） */
function createDom(): void {
  if (domCreated) return;
  // HMR 时模块重载 domCreated 会归 false，但旧 DOM 可能还在，避免重复
  if (document.getElementById('shop-panel')) {
    domCreated = true;
    return;
  }
  domCreated = true;

  // 全屏遮罩（flex 居中子面板）
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

  // 事件委托：所有按钮走 data-action 分发（innerHTML 重建不丢事件）
  panelEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const action = target.dataset?.action;
    if (action === 'sell-radish') {
      sellRadish();
    } else if (action === 'buy-seed') {
      buySeed();
    } else if (action === 'close') {
      closePanel();
    }
  });

  // Esc 关闭（只在面板打开时响应）
  // preventDefault：防止浏览器把 Esc 解释为"停止加载/退出全屏"，
  // 避免面板关闭瞬间整页白屏（页面加载时按 Esc 会被浏览器截走）
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      closePanel();
    }
  });
}

/** 卖出 1 个萝卜：得金币 */
function sellRadish(): void {
  if (getItemCount('radish') <= 0) return;
  addItem('radish', -1);
  addCoins(RADISH_PRICE);
  play('sell');
  refresh();
}

/** 购买 1 颗种子：花金币 */
function buySeed(): void {
  if (!spendCoins(SEED_PRICE)) return; // 余额不足静默（按钮已置灰）
  addSeeds(1);
  play('buy');
  refresh();
}

/** 刷新面板显示（余额/数量/按钮置灰），并通知外部刷新 HUD */
function refresh(): void {
  if (!panelEl) return;
  const coins = getCoins();
  const radish = getItemCount('radish');
  const seeds = getSeedCount();

  const coinsEl = panelEl.querySelector('#shop-coins');
  if (coinsEl) {
    coinsEl.textContent = `金币 ${coins} G   |   萝卜 ${radish} 个   |   种子 ${seeds} 颗`;
  }

  const btnBase = 'font-size:13px;padding:3px 12px;border:none;border-radius:4px;cursor:pointer;';
  const btnActive = `${btnBase}background:#c79a5b;color:#fff;`;
  const btnDisabled = `${btnBase}background:#6b573f;color:#9a8a72;cursor:not-allowed;`;

  // 出售栏（萝卜）
  const sellEl = panelEl.querySelector('#shop-sell');
  if (sellEl) {
    const canSell = radish > 0;
    sellEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span>萝卜 ×${radish}</span>
        <button data-action="sell-radish" ${canSell ? '' : 'disabled'} style="${canSell ? btnActive : btnDisabled}">卖 ${RADISH_PRICE}G</button>
      </div>
    `;
  }

  // 购买栏（种子）
  const buyEl = panelEl.querySelector('#shop-buy');
  if (buyEl) {
    const canBuy = coins >= SEED_PRICE;
    buyEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span>萝卜种子</span>
        <button data-action="buy-seed" ${canBuy ? '' : 'disabled'} style="${canBuy ? btnActive : btnDisabled}">买 ${SEED_PRICE}G</button>
      </div>
    `;
  }

  // 数据可能已变化（买卖后），通知外部（MapScene）刷新 HUD
  onDataChange?.();
}

export class ShopPanel {
  constructor(onChange: OnDataChange, onCloseCb?: () => void) {
    onDataChange = onChange;
    if (onCloseCb) onClose = onCloseCb;
    if (!domCreated) createDom();
  }

  /** 打开商店（由 MapScene 在靠近商人按 E 时调用） */
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

  /** 商店是否打开（MapScene.update 据此冻结玩家/时间） */
  isOpen(): boolean {
    return open;
  }
}
