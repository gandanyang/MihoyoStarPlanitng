/**
 * 任务面板（v0.5.3-B，DOM 覆盖层）
 *
 * 制作人 P0「任务入口化」：像背包一样，点任务图标打开任务面板。
 * 面板拿到任务按钮点击 → open() 冻结玩家；关闭恢复。
 *
 * 分类：主线 / 支线 / 日常 / 好感
 *   - 主线：读取 QuestSystem.getQuestState()/getQuestObjective()
 *   - 日常：读取 DailyQuestSystem.getDailyQuests()
 *   - 支线/好感：当前无数据源，灰色占位（"敬请期待"）
 *
 * 红点：日常有 completed && !claimed 任务 → 入口按钮角标显示数量
 * 不改变存档结构：只读渲染，领奖走 claimReward()
 */

import { getQuestState, getQuestObjective } from '../systems/QuestSystem';
import { getDailyQuests, claimReward, type DailyQuestInstance } from '../systems/DailyQuestSystem';
import { play } from '../systems/AudioSystem';

type OnClose = () => void;
type OnClaim = () => void;

// ===== 模块级单例 =====
let panelEl: HTMLDivElement | null = null;
let domCreated = false;
let open = false;
let onClose: OnClose | null = null;
let onClaim: OnClaim | null = null;
let badgeEl: HTMLDivElement | null = null;

type Tab = 'main' | 'side' | 'daily' | 'affinity';
const TABS: { key: Tab; label: string }[] = [
  { key: 'main', label: '主线' },
  { key: 'side', label: '支线' },
  { key: 'daily', label: '日常' },
  { key: 'affinity', label: '好感' },
];

/** 主线程任务行渲染 */
function mainRowHtml(): string {
  const state = getQuestState();
  const objective = getQuestObjective();
  const stateLabel: Record<string, string> = {
    accepted: '进行中',
    collected: '前往交付',
    completed: '已完成 👑',
    not_started: '可接取',
  };
  return `<div style="padding:8px 10px;margin-bottom:6px;background:rgba(126,184,218,0.12);border-radius:6px;border-left:3px solid #7eb8da;">
    <div style="font-size:13px;font-weight:bold;color:#cdeafa;">星之碎片 <span style="font-size:11px;color:#8fd6ff;">${stateLabel[state] ?? ''}</span></div>
    <div style="font-size:12px;color:#cbd2d6;margin-top:2px;">${objective}</div>
  </div>`;
}

/** 每日任务行渲染（含进度 + 领奖 + 已领） */
function dailyRowHtml(q: DailyQuestInstance): string {
  const progress = q.progress >= q.target ? '' : ` <span style="color:#aaa;">${q.progress}/${q.target}</span>`;
  if (q.claimed) {
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;margin-bottom:4px;color:#777;background:rgba(255,255,255,0.03);border-radius:6px;">
      <span>✅ ${q.desc}</span><span style="font-size:10px;">已领奖</span>
    </div>`;
  }
  if (q.completed) {
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;margin-bottom:4px;color:#ffd700;background:rgba(255,215,0,0.14);border-radius:6px;">
      <span>🎁 ${q.desc}${progress}</span>
      <button data-claim="${q.id}" style="font-size:11px;padding:3px 10px;background:#ffd700;color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">领奖</button>
    </div>`;
  }
  return `<div style="display:flex;align-items:center;padding:4px 10px;margin-bottom:4px;color:#d8d2c8;background:rgba(255,255,255,0.04);border-radius:6px;">
    <span>⬜ ${q.desc}${progress}</span>
  </div>`;
}

/** 刷新面板内容（按当前激活分类） */
function refresh(active: Tab = 'daily'): void {
  if (!panelEl) return;
  const body = panelEl.querySelector('#qp-body');
  if (!body) return;

  // 页签
  const tabsHtml = TABS.map(t => {
    const disabled = (t.key === 'side' || t.key === 'affinity') ? 'opacity:0.35;pointer-events:none;' : '';
    const activeStyle = t.key === active
      ? 'background:#8a6a45;color:#fff;'
      : 'background:rgba(138,106,69,0.25);color:#d8c2a0;';
    return `<button data-tab="${t.key}" style="flex:1;padding:6px 0;border:none;border-radius:5px;cursor:pointer;font-size:12px;${activeStyle}${disabled}">${t.label}</button>`;
  }).join('');
  panelEl.querySelector('#qp-tabs')!.innerHTML = tabsHtml;

  let html = '';
  if (active === 'main') {
    html = mainRowHtml();
  } else if (active === 'side') {
    html = '<div style="text-align:center;color:#8a7a62;padding:30px 10px;font-size:13px;">敬请期待 · 支线任务即将上线</div>';
  } else if (active === 'daily') {
    const quests = getDailyQuests();
    if (quests.length === 0) {
      html = '<div style="text-align:center;color:#8a7a62;padding:30px 10px;font-size:13px;">今日任务已完成</div>';
    } else {
      html = quests.map(dailyRowHtml).join('');
    }
  } else {
    html = '<div style="text-align:center;color:#8a7a62;padding:30px 10px;font-size:13px;">敬请期待 · 好感系统</div>';
  }
  body.innerHTML = html;
  syncBadge();
}

/** 同步任务按钮红点（日常有可领奖） */
function syncBadge(): void {
  // 若角标未挂载（早期场景未建 quest-btn），尝试重挂
  const btn = document.getElementById('quest-btn');
  if (!badgeEl && btn) refreshBadgeElement();
  if (!badgeEl) return;
  const claimable = getDailyQuests().filter(q => q.completed && !q.claimed).length;
  badgeEl.textContent = claimable > 0 ? String(claimable) : '';
  badgeEl.style.display = claimable > 0 ? 'flex' : 'none';
}

function closePanel(): void {
  if (!open) return;
  open = false;
  if (panelEl) panelEl.style.display = 'none';
  onClose?.();
}

function createDom(): void {
  if (domCreated) return;
  if (document.getElementById('quest-panel')) { domCreated = true; return; }
  domCreated = true;

  panelEl = document.createElement('div');
  panelEl.id = 'quest-panel';
  panelEl.style.cssText =
    'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,0.55);z-index:215;user-select:none;-webkit-user-select:none';
  panelEl.innerHTML = `
    <div style="width:min(380px,90vw);background:#3d3226;border:3px solid #8a6a45;border-radius:10px;padding:16px;color:#fff;font-family:Arial;box-shadow:0 4px 20px rgba(0,0,0,0.6)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-size:18px;font-weight:bold;">📋 任务</span>
        <div style="position:relative;">
          <button data-action="close" style="width:30px;height:30px;border-radius:50%;background:#8a6a45;border:none;color:#fff;font-size:16px;cursor:pointer;line-height:1;">×</button>
        </div>
      </div>
      <div id="qp-tabs" style="display:flex;background:rgba(0,0,0,0.25);border-radius:6px;padding:3px;margin-bottom:10px;"></div>
      <div id="qp-body" style="max-height:50vh;overflow-y:auto;"></div>
    </div>
  `;
  // 红点（任务按钮角标，由 TouchControls 查询挂载）
  document.body.appendChild(panelEl);

  panelEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.dataset?.action === 'close') { closePanel(); return; }
    const tab = target.dataset?.tab as Tab | undefined;
    if (tab) refresh(tab);
    const claim = target.dataset?.claim;
    if (claim) {
      if (claimReward(claim)) {
        play('levelup');
        refresh('daily');
        onClaim?.();
      }
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) { e.preventDefault(); closePanel(); }
  });
  // 更新任务按钮红点角标
  refreshBadgeElement();
}

/** 创建/更新任务按钮角标（触摸右侧操作区新增"任务"按钮） */
export function refreshBadgeElement(): void {
  const btn = document.getElementById('quest-btn');
  if (!btn) return;
  let badge = btn.querySelector<HTMLDivElement>('.q-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'q-badge';
    badge.style.cssText =
      'position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:9px;' +
      'background:#e04444;color:#fff;font:bold 11px Arial;display:none;align-items:center;justify-content:center;' +
      'border:2px solid #fff;box-sizing:border-box;';
    btn.appendChild(badge);
  }
  badgeEl = badge as HTMLDivElement;
  syncBadge();
}

export class QuestPanel {
  constructor(onCloseCb?: OnClose, onClaimCb?: OnClaim) {
    if (onCloseCb) onClose = onCloseCb;
    if (onClaimCb) onClaim = onClaimCb;
    if (!domCreated) createDom();
  }

  open(): void {
    open = true;
    if (panelEl) {
      refresh('daily');
      panelEl.style.display = 'flex';
    }
  }

  close(): void { closePanel(); }
  isOpen(): boolean { return open; }
  /** 刷新红点（每次调用先确保角标挂载，避免早期场景未建 quest-btn 导致 badge 丢失） */
  refresh(): void {
    refreshBadgeElement();
    syncBadge();
  }
  /** 可领奖任务数（供探针/调试验证红点生命周期） */
  claimableCount(): number {
    return getDailyQuests().filter(q => q.completed && !q.claimed).length;
  }
}