/**
 * 任务面板（v0.5.3-B，DOM 覆盖层）
 *
 * 制作人 P0「任务入口化」：像背包一样，点任务图标打开任务面板。
 * 面板拿到任务按钮点击 → open() 冻结玩家；关闭恢复。
 *
 * 分类：主线 / 支线 / 日常 / 好感
 *   - 主线：读取 QuestSystem.getQuestState()/getQuestObjective()
 *   - 支线：读取支线任务 + 居民需求（按进度解锁；flags 由 MapScene 构造时注入，避免循环依赖）
 *   - 日常：读取 DailyQuestSystem.getDailyQuests()
 *   - 好感：当前无数据源，灰色占位（"敬请期待"）
 *
 * 红点：日常有 completed && !claimed 任务 → 入口按钮角标显示数量
 * 不改变存档结构：只读渲染，领奖走 claimReward()
 */

import { getQuestState, getQuestObjective } from '../systems/QuestSystem';
import { getDailyQuests, claimReward, getTalkNpcHomeHint, type DailyQuestInstance } from '../systems/DailyQuestSystem';
import { getResidentRequests, isRequestDone, canFulfillRequest } from '../systems/ResidentRequestSystem';
import { play } from '../systems/AudioSystem';
import { triggerTag } from '../systems/GuiXingRecordSystem';
import { showMemoryMoment } from './MemoryMoment';
import { panelFadeIn, panelFadeOut } from './dom-anim';

type OnClose = () => void;
type OnClaim = () => void;

/** 支线任务状态（MapScene 构造时注入；结构化类型避免 import MapScene 造成循环依赖） */
export interface QuestFlags {
  sideXiyaGardenAsked?: boolean;
  sideXiyaGardenDone?: boolean;
  sideElderTeaAsked?: boolean;
  sideElderStarDone?: boolean;
  sideXiyaPhotoAsked?: boolean;
  sideXiyaPhotoDone?: boolean;
  sideMinerLampAsked?: boolean;
  sideMinerLampDone?: boolean;
  sideGardenerPlumAsked?: boolean;
  sideGardenerPlumDone?: boolean;
}

/** 支线任务定义（解锁/进行中/完成判定基于注入 flags） */
interface SideQuestDef {
  id: string;
  title: string;
  /** 未解锁时提示 */
  lockHint: string;
  /** 进行中目标文案 */
  objective: string;
  isUnlocked: (f: QuestFlags) => boolean;
  isAsked: (f: QuestFlags) => boolean;
  isDone: (f: QuestFlags) => boolean;
}

/** 支线任务清单（2026-08-07 加入任务面板；解锁条件与 MapScene 触发一致） */
const SIDE_QUESTS: SideQuestDef[] = [
  {
    id: 'xiya_garden',
    title: '院子有人照顾',
    lockHint: '完成「整理旧花园」后解锁',
    objective: '帮夏雅修复花田边的旧藤架（交付木材×3）',
    isUnlocked: (f) => f.sideXiyaGardenAsked === true,
    isAsked: (f) => f.sideXiyaGardenAsked === true,
    isDone: (f) => f.sideXiyaGardenDone === true,
  },
  {
    id: 'elder_star',
    title: '看星星的地方',
    lockHint: '完成观星夜后解锁',
    objective: '夜晚带壶茶，去农田边坐坐（替爷爷看看星星）',
    isUnlocked: (f) => f.sideElderTeaAsked === true,
    isAsked: (f) => f.sideElderTeaAsked === true,
    isDone: (f) => f.sideElderStarDone === true,
  },
  {
    id: 'xiya_photo',
    title: '整理旧照片',
    lockHint: '完成「老屋修复」后解锁',
    objective: '在老屋门口，帮夏雅整理旧照片',
    isUnlocked: (f) => f.sideXiyaPhotoAsked === true,
    isAsked: (f) => f.sideXiyaPhotoAsked === true,
    isDone: (f) => f.sideXiyaPhotoDone === true,
  },
  {
    id: 'miner_lamp',
    title: '矿洞里的灯',
    lockHint: '进入矿洞后解锁',
    objective: '为矿洞点亮旧矿灯（交付铜矿×2）',
    isUnlocked: (f) => f.sideMinerLampAsked === true,
    isAsked: (f) => f.sideMinerLampAsked === true,
    isDone: (f) => f.sideMinerLampDone === true,
  },
  {
    id: 'gardener_plum',
    title: '一株小梅花',
    lockHint: '抵达小镇花圃后解锁',
    objective: '在小梅的花圃旁种下一株小梅花',
    isUnlocked: (f) => f.sideGardenerPlumAsked === true,
    isAsked: (f) => f.sideGardenerPlumAsked === true,
    isDone: (f) => f.sideGardenerPlumDone === true,
  },
];

// ===== 模块级单例 =====
let panelEl: HTMLDivElement | null = null;
let domCreated = false;
let open = false;
let onClose: OnClose | null = null;
let onClaim: OnClaim | null = null;
let badgeEl: HTMLDivElement | null = null;
/** 支线任务 flags provider（MapScene 构造时注入；null 时支线页签显示加载提示） */
let flagsProvider: (() => QuestFlags | null) | null = null;

type Tab = 'main' | 'side' | 'daily' | 'affinity';
const TABS: { key: Tab; label: string }[] = [
  { key: 'main', label: '主线' },
  { key: 'side', label: '支线' },
  { key: 'daily', label: '日常' },
  { key: 'affinity', label: '好感' },
];

/** 简易 HTML 转义（防止任务名/提示文案破坏面板结构） */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

/** 每日任务行渲染（含进度 + 领奖 + 已领） */function dailyRowHtml(q: DailyQuestInstance): string {
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
  // B-1（制作人拍板 2026-08-03）：NPC 已回家（不渲染）时，对未完成对话任务追加友好提示
  if (!q.claimed && !q.completed && q.objective.type === 'talk_npc') {
    const home = getTalkNpcHomeHint(q.objective.npcId, q.objective.npcName);
    if (home) {
      return `<div style="display:flex;align-items:center;padding:4px 10px;margin-bottom:4px;color:#d8d2c8;background:rgba(255,255,255,0.04);border-radius:6px;">
        <span>⬜ ${q.desc}${progress}</span>
      </div>
      <div style="padding:2px 10px 6px 10px;margin-top:-4px;color:#8a7a62;font-size:12px;">🌙 ${home.hint}</div>`;
    }
  }
  return `<div style="display:flex;align-items:center;padding:4px 10px;margin-bottom:4px;color:#d8d2c8;background:rgba(255,255,255,0.04);border-radius:6px;">
    <span>⬜ ${q.desc}${progress}</span>
  </div>`;
}

/** 支线任务行渲染：未解锁 / 进行中 / 已完成 */
function sideQuestRowHtml(q: SideQuestDef, f: QuestFlags): string {
  if (!q.isUnlocked(f)) {
    return `<div style="padding:6px 10px;margin-bottom:6px;color:#7a7262;background:rgba(255,255,255,0.02);border-radius:6px;opacity:0.85;">
      <div style="font-size:13px;color:#a09880;">🔒 ${escapeHtml(q.title)}</div>
      <div style="font-size:11px;color:#6a6355;margin-top:2px;">${escapeHtml(q.lockHint)}</div>
    </div>`;
  }
  if (q.isDone(f)) {
    return `<div style="padding:6px 10px;margin-bottom:6px;color:#6a8a6a;background:rgba(126,220,126,0.10);border-radius:6px;">
      <div style="font-size:13px;color:#7ec87e;">✅ ${escapeHtml(q.title)}</div>
      <div style="font-size:12px;color:#8aa88a;margin-top:2px;">已完成</div>
    </div>`;
  }
  return `<div style="padding:8px 10px;margin-bottom:6px;background:rgba(126,184,218,0.12);border-radius:6px;border-left:3px solid #7eb8da;">
    <div style="font-size:13px;font-weight:bold;color:#cdeafa;">${escapeHtml(q.title)} <span style="font-size:11px;color:#8fd6ff;">进行中</span></div>
    <div style="font-size:12px;color:#cbd2d6;margin-top:2px;">${escapeHtml(q.objective)}</div>
  </div>`;
}

/** 居民需求行渲染（复用 ResidentRequestSystem；完成态经 EventManager） */
function residentRequestRowHtml(): string {
  const reqs = getResidentRequests();
  if (reqs.length === 0) return '';
  return reqs.map((r) => {
    const done = isRequestDone(r.id);
    const enough = canFulfillRequest(r);
    if (done) {
      return `<div style="padding:6px 10px;margin-bottom:6px;color:#6a8a6a;background:rgba(126,220,126,0.10);border-radius:6px;">
        <div style="font-size:13px;color:#7ec87e;">✅ ${escapeHtml(r.npcName)}的请求</div>
        <div style="font-size:12px;color:#8aa88a;margin-top:2px;">已完成 · 需求已送达</div>
      </div>`;
    }
    return `<div style="padding:8px 10px;margin-bottom:6px;background:rgba(255,215,0,0.08);border-radius:6px;border-left:3px solid #c8a83a;">
      <div style="font-size:13px;font-weight:bold;color:#e8d8a0;">📌 ${escapeHtml(r.npcName)}的请求 <span style="font-size:11px;color:#d0b860;">待交付</span></div>
      <div style="font-size:12px;color:#cbd2d6;margin-top:2px;">${r.itemKind === 'wood' ? `交付木材 ×${r.count}` : '交付食物（萝卜/番茄/玉米/草莓）'}${enough ? '' : '<span style="color:#ff9a6a;">（资源不足）</span>'}</div>
      <div style="font-size:11px;color:#8a7a62;margin-top:2px;">可在小镇需求板交付</div>
    </div>`;
  }).join('');
}

/** 刷新面板内容（按当前激活分类） */
function refresh(active: Tab = 'daily'): void {
  if (!panelEl) return;
  const body = panelEl.querySelector('#qp-body');
  if (!body) return;

  // 页签
  const tabsHtml = TABS.map(t => {
    const disabled = (t.key === 'affinity') ? 'opacity:0.35;pointer-events:none;' : '';
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
    const flags = flagsProvider?.() ?? null;
    const sideHtml = flags
      ? SIDE_QUESTS.map((q) => sideQuestRowHtml(q, flags)).join('')
      : '<div style="text-align:center;color:#8a7a62;padding:12px 10px;font-size:12px;">任务数据加载中…</div>';
    const residentHtml = residentRequestRowHtml();
    if (sideHtml && residentHtml) {
      html = sideHtml + '<div style="margin:6px 0 4px;font-size:12px;color:#8a7a62;">—— 居民需求 ——</div>' + residentHtml;
    } else {
      html = sideHtml + residentHtml;
    }
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
  // A4 动效：面板 fadeOut
  if (panelEl) panelFadeOut(panelEl, 150);
  onClose?.();
}

function createDom(): void {
  if (domCreated) return;
  if (document.getElementById('quest-panel')) { domCreated = true; return; }
  domCreated = true;

  panelEl = document.createElement('div');
  panelEl.id = 'quest-panel';
  panelEl.style.cssText =
    'position:fixed;top:0;right:0;bottom:0;left:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,0.55);z-index:215;user-select:none;-webkit-user-select:none';
  panelEl.innerHTML = `
    <div style="width:min(380px,90vw);max-height:85vh;overflow-y:auto;background:#3d3226;border:3px solid #8a6a45;border-radius:10px;padding:16px;color:#fff;font-family:Arial;box-shadow:0 4px 20px rgba(0,0,0,0.6)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-size:18px;font-weight:bold;color:#ffd700;letter-spacing:1px;">任务</span>
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
        // 小结算：帮助居民时触发事件标签
        const quest = getDailyQuests().find((q) => q.id === claim);
        if (quest && quest.objective.type === 'talk_npc') {
          triggerTag('help_resident');
          showMemoryMoment('有些门，不是打不开，只是需要一个人先敲响。');
        }
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
  constructor(onCloseCb?: OnClose, onClaimCb?: OnClaim, flagsCb?: () => QuestFlags | null) {
    if (onCloseCb) onClose = onCloseCb;
    if (onClaimCb) onClaim = onClaimCb;
    if (flagsCb) flagsProvider = flagsCb;
    if (!domCreated) createDom();
  }

  open(): void {
    open = true;
    if (panelEl) {
      refresh('daily');
      // A4 动效：面板 fadeIn
      panelFadeIn(panelEl, 180);
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