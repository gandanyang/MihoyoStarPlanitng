/**
 * Demo 结算界面（DOM 覆盖层）
 *
 * 设计：与 ShopPanel 相同模式——模块级单例、DOM 只创建一次、open/close 切显隐。
 * 触发：观星收尾剧情播放完成后由 MapScene 调 open()。
 * 内容：游玩天数 / 等级 / 金币 / 钻石 / 收集统计，点击「继续自由游玩」关闭。
 * 关闭后不再重复触发（storyStep = 'observatory_complete' 持久化判重）。
 */

import { getTime } from '../data/TimeSystem';
import { getLevel } from '../data/FarmProgress';
import { getItemCount, itemIconHtml } from '../data/Inventory';
import { generateIslandReport } from '../systems/IslandReportSystem';

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
    'background:rgba(5,8,28,0.82);z-index:250;user-select:none;-webkit-user-select:none;';

  panelEl.innerHTML = `
    <div style="width:min(460px,92vw);background:#1b2240;border:3px solid #4a5a9e;border-radius:12px;padding:22px;color:#e8ecff;font-family:Arial;text-align:center;box-shadow:0 0 40px rgba(90,110,220,0.35)">
      <div style="font-size:13px;letter-spacing:2px;color:#8fa2e8;margin-bottom:4px;">✦ 归星岛复苏报告 ✦</div>
      <div style="font-size:20px;font-weight:bold;margin-bottom:6px;color:#fff;">星之碎片（1/…）</div>
      <div style="font-size:13px;color:#b6c2f0;margin-bottom:16px;">岛屿的秘密，才刚刚开始。感谢游玩！</div>
      <div id="ending-report" style="text-align:left;margin-bottom:18px;"></div>
      <div id="ending-stats" style="text-align:left;background:#141b38;border-radius:8px;padding:12px 16px;font-size:12px;line-height:1.8;margin-bottom:18px;color:#8fa2e8;"></div>
      <button data-action="continue" style="font-size:15px;padding:10px 34px;background:#5a6ad8;border:none;border-radius:6px;color:#fff;cursor:pointer;box-shadow:0 3px 12px rgba(90,106,216,0.5);">继续自由游玩</button>
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

/** 刷新报告内容（生活化复苏报告 + 极简数据脚注） */
function refresh(): void {
  if (!panelEl) return;
  const report = generateIslandReport();

  // 报告主体：土地 / 居民 / 农业 / 未来
  const reportEl = panelEl.querySelector('#ending-report');
  if (reportEl) {
    reportEl.innerHTML = report.sections
      .map(
        (s, i) => `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:8px;margin-bottom:6px;background:rgba(255,255,255,0.04);${i === 0 ? 'border-left:3px solid #7eb8da;' : i === report.sections.length - 1 ? 'border-left:3px solid #8fa2e8;' : 'border-left:3px solid #6ab88a;'}">
        <span style="font-size:18px;line-height:1.2;">${s.icon}</span>
        <div style="flex:1;">
          <div style="display:flex;align-items:baseline;justify-content:space-between;">
            <span style="font-size:14px;font-weight:bold;color:#cdeafa;">${s.title}</span>
            <span style="font-size:12px;color:#8fd6ff;">${s.verdict}</span>
          </div>
          <div style="font-size:13px;color:#cbd2d6;margin-top:3px;line-height:1.5;">${s.desc}</div>
        </div>
      </div>`,
      )
      .join('');
  }

  // 极简数据脚注（不再是主菜，仅一行）
  const statsEl = panelEl.querySelector('#ending-stats');
  if (statsEl) {
    const t = getTime();
    const crops = getItemCount('radish') + getItemCount('tomato') + getItemCount('corn') + getItemCount('strawberry');
    statsEl.innerHTML = `第 ${t.day} 天 · 农业 Lv.${getLevel()} · 收获作物 ${crops} 个 · ${itemIconHtml('diamond', 14)} ${getItemCount('diamond')}`;
  }
}

export class EndingPanel {
  constructor(onCloseCb?: () => void) {
    if (onCloseCb) onClose = onCloseCb;
    if (!domCreated) createDom();
  }

  /** 打开结算界面 */
  open(): void {
    open = true;
    if (panelEl) {
      refresh();
      panelEl.style.display = 'flex';
    }
  }

  /** 关闭结算界面 */
  close(): void {
    closePanel();
  }

  /** 结算界面是否打开 */
  isOpen(): boolean {
    return open;
  }
}
