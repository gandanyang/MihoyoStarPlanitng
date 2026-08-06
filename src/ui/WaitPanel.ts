/**
 * 等待面板（E-09 消磨时间）
 *
 * DOM 覆盖层，模块级单例（与 BackpackPanel/QuestPanel 同模式）。
 * 玩家主动选择跳过一段时间，而不是干等。
 *
 * 交互：
 *   按 T 键（桌面）/ 等待按钮（移动端）→ MapScene 调 open()
 *   选择等待时长/目标时段 → onWait(targetHour) 回调（MapScene 执行遮罩 + setTime）
 *   关闭：关闭按钮 / Esc
 *
 * 不实现：自动加速播放（消磨=主动跳过，非倍速）。
 */

import { getTime } from '../data/TimeSystem';
import { panelFadeIn, panelFadeOut } from './dom-anim';

/** 等待选项：目标小时（22:00 为上限，不跨天） */
interface WaitOption {
  label: string;
  desc: string;
  targetHour: number;
}

/** 等待选项列表（按场景痛点：等 18:00 NPC / 20:00 观星 / 快速推进） */
const WAIT_OPTIONS: WaitOption[] = [
  { label: '小憩 2 小时', desc: '安静地坐一会儿', targetHour: 2 },
  { label: '睡个午觉', desc: '休息 4 小时', targetHour: 4 },
  { label: '等到傍晚', desc: '到 18:00，村民们快回来了', targetHour: 18 },
  { label: '等到入夜', desc: '到 20:00，星星该亮了', targetHour: 20 },
];

type OnWait = (targetHour: number) => void;

// ===== 模块级单例 =====
let panelEl: HTMLDivElement | null = null;
let domCreated = false;
let open = false;
let onWait: OnWait | null = null;
let onClose: OnClose | null = null;

type OnClose = () => void;

/** 关闭面板（模块级，Esc/关闭按钮走这里） */
function closePanel(): void {
  if (!open) return;
  open = false;
  if (panelEl) panelFadeOut(panelEl, 150);
  onClose?.();
}

/** 创建 DOM（模块级，只创建一次） */
function createDom(): void {
  if (domCreated) return;
  if (document.getElementById('wait-panel')) {
    domCreated = true;
    return;
  }
  domCreated = true;

  panelEl = document.createElement('div');
  panelEl.id = 'wait-panel';
  panelEl.style.cssText =
    'position:fixed;inset:0;z-index:210;display:none;align-items:center;justify-content:center;' +
    'background:rgba(8,12,28,0.72);user-select:none;-webkit-user-select:none;';

  const card = document.createElement('div');
  card.style.cssText =
    'background:linear-gradient(180deg,#22314f,#18243c);border:1px solid rgba(255,255,255,0.12);' +
    'border-radius:14px;padding:20px 22px;width:280px;max-width:88vw;box-shadow:0 8px 30px rgba(0,0,0,0.45);';
  panelEl.appendChild(card);

  const title = document.createElement('div');
  title.style.cssText =
    'color:#ffe9b0;font-size:16px;font-weight:600;text-align:center;margin-bottom:4px;letter-spacing:1px;';
  title.textContent = '等待一会儿';
  card.appendChild(title);

  const sub = document.createElement('div');
  sub.style.cssText =
    'color:#9fb0c8;font-size:12px;text-align:center;margin-bottom:14px;';
  sub.textContent = '时间会悄悄过去，夜晚 22:00 前会停住';
  card.appendChild(sub);

  for (const opt of WAIT_OPTIONS) {
    const btn = document.createElement('div');
    btn.style.cssText =
      'padding:10px 14px;margin-bottom:8px;border-radius:10px;cursor:pointer;' +
      'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);' +
      'transition:background 0.15s;';
    btn.innerHTML =
      `<div style="color:#f0e6cf;font-size:14px;font-weight:500;">${opt.label}</div>` +
      `<div style="color:#8fa0ba;font-size:11px;margin-top:2px;">${opt.desc}</div>`;
    const pressOption = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      if (onWait) {
        closePanel();
        onWait(opt.targetHour);
      }
    };
    btn.addEventListener('pointerdown', pressOption);
    btn.addEventListener('mousedown', pressOption);
    btn.addEventListener('click', pressOption);
    card.appendChild(btn);
  }

  const hint = document.createElement('div');
  hint.style.cssText =
    'color:#72839e;font-size:11px;text-align:center;margin-top:8px;';
  hint.textContent = '当前时间：' + formatNow() + ' ｜ Esc 关闭';
  card.appendChild(hint);

  document.body.appendChild(panelEl);

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      closePanel();
    }
  };
  window.addEventListener('keydown', escHandler);
}

/** 格式化当前游戏时间（HH:MM） */
function formatNow(): string {
  const t = getTime();
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

/** 打开面板 */
export function openWaitPanel(cb: OnWait, closeCb: OnClose): void {
  createDom();
  onWait = cb;
  onClose = closeCb;
  if (open || !panelEl) return;
  open = true;
  panelEl.style.display = 'flex';
  panelFadeIn(panelEl, 160);
}

/** 关闭面板 */
export function closeWaitPanel(): void {
  closePanel();
}

/** 面板是否打开 */
export function isWaitPanelOpen(): boolean {
  return open;
}
