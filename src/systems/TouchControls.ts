/**
 * 触屏控件（Phase M3，DOM 实现）
 *
 * 虚拟摇杆（左下角）+ 交互按钮（右下角"交互"）。
 * 用 DOM 元素覆盖在 canvas 上，不受 Phaser 摄像机 zoom/scroll 影响。
 *
 * 关键设计：所有状态和 DOM 都是模块级单例。
 * 原因：MapScene 每个场景都会 new TouchControls()，但 DOM 只能创建一次。
 * 如果状态放在实例里，场景切换后新实例的 dragging 永远是 false，
 * 而 DOM 事件绑定在旧实例上 → 新场景摇杆失效，玩家无法移动（卡死）。
 * 改成模块级后，所有场景共用同一套 dragging/joystickBase，事件绑定到模块函数，
 * 每场景只更新 currentInput 引用即可。
 *
 * 架构：控件只操作 InputManager，不直接碰 Player/MapScene。
 *   摇杆拖动 → currentInput.moveX / moveY
 *   按钮按下 → currentInput.queueAction()
 *
 * currentInput 是模块级引用，每场景 create 时更新为当前活跃场景的 InputManager，
 * 保证 DOM 事件（全局）操作的是当前场景的输入。
 */

import { InputManager } from './InputManager';
import { isTouchDevice } from '../config';

/** 当前活跃场景的 InputManager（DOM 事件回调操作它） */
let currentInput: InputManager | null = null;

// ===== 模块级摇杆状态（所有场景共用） =====
let dragging = false;
let lastPX = 0;
let lastPY = 0;
/** 死区（像素），小于此距离不触发方向 */
const deadzone = 10;
let joystickBase: HTMLDivElement | null = null;
let joystickThumb: HTMLDivElement | null = null;
/** 背包按钮（移动端显示，对应键盘 B） */
let backpackBtn: HTMLDivElement | null = null;
let backpackHandler: (() => void) | null = null;
/** 任务按钮（移动端显示，对应键盘 J） */
let questBtn: HTMLDivElement | null = null;
let questHandler: (() => void) | null = null;
/** 主交互按钮（移动端显示；桌面端用键盘 E/空格） */
let mainBtn: HTMLDivElement | null = null;
/** 摇杆容器（移动端显示；桌面端用 WASD） */
let joystickEl: HTMLDivElement | null = null;
/** DOM 是否已创建（防止重复创建） */
let domCreated = false;

/** 创建 DOM 控件（模块级，只创建一次） */
function createDom(): void {
  if (domCreated) return;
  // HMR 时模块重载 domCreated 会归 false，但旧 DOM 可能还在，避免重复
  if (document.getElementById('touch-controls')) {
    domCreated = true;
    return;
  }
  domCreated = true;

  const container = document.createElement('div');
  container.id = 'touch-controls';
  // 相对 #game-container（画布区域）定位：画布居中时摇杆/按钮不偏到 FIT 黑边区（横屏）
  container.style.cssText =
    'position:absolute;inset:0;pointer-events:none;z-index:100;user-select:none;-webkit-user-select:none';

  // 摇杆容器（左下角）
  const joy = document.createElement('div');
  joy.className = 'tc-joystick';
  joystickEl = joy;
  joy.style.cssText =
    'position:absolute;left:30px;bottom:30px;width:130px;height:130px;display:none;';
  joystickBase = document.createElement('div');
  joystickBase.className = 'tc-joystick-base';
  joystickBase.style.cssText =
    'position:absolute;inset:0;';
  joystickThumb = document.createElement('div');
  joystickThumb.className = 'tc-joystick-thumb';
  joystickThumb.style.cssText =
    'position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px;';
  joy.appendChild(joystickBase);
  joy.appendChild(joystickThumb);

  // 摇杆事件（touch + mouse 兼容，绑定到模块级函数）
  joy.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  });
  joy.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    drag(t.clientX, t.clientY);
  });
  joy.addEventListener('touchend', (e) => {
    e.preventDefault();
    endDrag();
  });
  joy.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  });
  // mousemove/up 监听 window，避免移出摇杆区域就失效
  window.addEventListener('mousemove', (e) => {
    if (dragging) drag(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => {
    if (dragging) endDrag();
  });

  // 交互按钮（右下角）
  // 事件策略（兼容小米等国产浏览器）：
  //   pointerdown — 现代统一指针事件（触屏+鼠标统一，优先）
  //   touchstart  — 旧触屏兜底
  //   mousedown   — 旧鼠标兜底
  //   click       — 终极兜底（所有浏览器都支持）
  // 防抖：同一手势 150ms 内只触发一次（touchstart→mousedown 跨帧双击发防护）
  const btn = document.createElement('div');
  btn.className = 'tc-btn tc-btn-main';
  mainBtn = btn;
  btn.style.cssText =
    'position:absolute;right:24px;bottom:24px;width:74px;height:74px;' +
    'touch-action:none;display:none;';
  // 稳定标识：探针/测试按 data-action 查找按钮，不依赖文字（文字会随场景变化）
  btn.dataset.action = 'interact';
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20 12.5v-7a1.5 1.5 0 0 0-3 0v6"/><path d="M17 11.5V6.5a1.5 1.5 0 0 0-3 0"/><path d="M14 11.5v-8a1.5 1.5 0 0 0-3 0v10"/>' +
    '<path d="M11 13.5V11a1.5 1.5 0 0 0-3 0v4.5"/><path d="M8 15.5V14a1.5 1.5 0 0 0-3 0v5.5c0 1.8 1.2 3 3.5 3.5l3.5.6c1.6.2 3.1-.4 4.2-1.6l2.7-3.1c.7-.8.6-2-.2-2.7-.8-.7-2-.6-2.7.2l-2.5 2.5"/>' +
    '</svg>' +
    '<span class="tc-btn-label" style="display:none;">使用工具</span>';
  let lastActionTime = 0;
  // 防抖：同一手势 150ms 内只触发一次（touchstart→mousedown 跨帧双击发防护）
  // 注：500ms 过慢会拖累连锄/连种手感，150ms 既防双击又保持流畅
  const ACTION_DEBOUNCE_MS = 150;
  const pressBtn = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastActionTime < ACTION_DEBOUNCE_MS) return;
    lastActionTime = now;
    console.log('[TouchControls] 交互按钮触发', e.type);
    if (currentInput) currentInput.queueAction();
  };
  btn.addEventListener('pointerdown', pressBtn);
  btn.addEventListener('touchstart', pressBtn);
  btn.addEventListener('mousedown', pressBtn);
  btn.addEventListener('click', pressBtn);

  // 背包按钮（仅移动端显示；桌面端用键盘 B）
  backpackBtn = document.createElement('div');
  backpackBtn.className = 'tc-btn tc-btn-backpack';
  backpackBtn.style.cssText =
    'position:absolute;right:30px;bottom:110px;width:58px;height:58px;' +
    'touch-action:none;display:none;';
  backpackBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z"/>' +
    '<path d="M8 6V5a3 3 0 0 1 6 0v1"/><path d="M4 13h16"/>' +
    '</svg>' +
    '<span class="tc-btn-label" style="display:none;">背包</span>';
  let lastBackpackTime = 0;
  const BP_DEBOUNCE_MS = 300;
  const pressBackpack = (e: Event) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastBackpackTime < BP_DEBOUNCE_MS) return;
    lastBackpackTime = now;
    if (backpackHandler) backpackHandler();
  };
  backpackBtn.addEventListener('touchstart', pressBackpack);
  backpackBtn.addEventListener('mousedown', pressBackpack);
  container.appendChild(backpackBtn);
  updateBackpackVisibility();
  window.addEventListener('resize', updateBackpackVisibility);

  // 任务按钮（仅移动端显示；桌面端用键盘 J）
  questBtn = document.createElement('div');
  questBtn.id = 'quest-btn';
  questBtn.className = 'tc-btn tc-btn-quest';
  // 制作人需求：任务按钮移到左上角偏下（避开左上角时间/经验条；safe-area 避开状态栏/挖孔屏；仅触屏显示）
  questBtn.style.cssText =
    'position:absolute;left:8px;top:calc(90px + env(safe-area-inset-top, 0px));width:58px;height:58px;' +
    'touch-action:none;display:none;';
  questBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>' +
    '</svg>' +
    '<span class="tc-btn-label" style="display:none;">任务</span>';
  let lastQuestTime = 0;
  const questPress = (e: Event) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastQuestTime < BP_DEBOUNCE_MS) return;
    lastQuestTime = now;
    if (questHandler) questHandler();
  };
  questBtn.addEventListener('touchstart', questPress);
  questBtn.addEventListener('mousedown', questPress);
  container.appendChild(questBtn);
  updateQuestVisibility();
  window.addEventListener('resize', updateQuestVisibility);

  container.appendChild(joy);
  container.appendChild(btn);
  // 挂到画布容器（横屏黑边场景下 UI 与画布对齐）；兜底 body
  const host = document.getElementById('game-container') ?? document.body;
  host.appendChild(container);

  // 统一可见性：所有控件只在移动端显示
  updateControlsVisibility();
  window.addEventListener('resize', updateControlsVisibility);
  window.addEventListener('orientationchange', updateControlsVisibility);
}

/** 是否触屏设备（统一入口在 config.ts，用触屏能力判断，而非窗口宽度——手机横屏宽度可能 ≥800） */

/** 设置交互/使用工具按钮语义标签（场景切换时更新隐藏 label；SVG 图标语义化文字） */
export function setActionButtonLabel(label: string): void {
  const btn = document.querySelector<HTMLElement>('#touch-controls [data-action="interact"]');
  const labelEl = btn?.querySelector<HTMLElement>('.tc-btn-label');
  if (labelEl) labelEl.textContent = label;
}

/** 是否移动端显示：主按钮/摇杆/背包/任务只在真移动设备显示（BUG-030：桌面触屏笔记本不显示） */
function updateControlsVisibility(): void {
  const show = isTouchDevice();
  if (mainBtn) mainBtn.style.display = show ? 'flex' : 'none';
  if (joystickEl) joystickEl.style.display = show ? 'block' : 'none';
  if (backpackBtn) backpackBtn.style.display = show ? 'flex' : 'none';
  if (questBtn) questBtn.style.display = show ? 'flex' : 'none';
}

/** 背包按钮仅触屏设备显示（竖屏/横屏/平板都显示；桌面无触屏时用键盘 B） */
function updateBackpackVisibility(): void {
  if (!backpackBtn) return;
  backpackBtn.style.display = isTouchDevice() ? 'flex' : 'none';
}

/** 任务按钮仅触屏设备显示 */
function updateQuestVisibility(): void {
  if (!questBtn) return;
  questBtn.style.display = isTouchDevice() ? 'flex' : 'none';
}

/** 开始拖动摇杆 */
function startDrag(px: number, py: number): void {
  dragging = true;
  lastPX = px;
  lastPY = py;
  applyDirection();
}

/** 拖动中 */
function drag(px: number, py: number): void {
  lastPX = px;
  lastPY = py;
  applyDirection();
}

/** 结束拖动，归零 */
function endDrag(): void {
  dragging = false;
  if (currentInput) {
    currentInput.moveX = 0;
    currentInput.moveY = 0;
  }
  if (joystickThumb) {
    joystickThumb.style.left = '50%';
    joystickThumb.style.top = '50%';
  }
}

/** 根据手指位置计算 8 方向，设 moveX/moveY，移动 thumb */
function applyDirection(): void {
  if (!currentInput || !joystickBase || !joystickThumb) return;
  const rect = joystickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = lastPX - cx;
  let dy = lastPY - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const max = rect.width / 2;
  if (dist > max) {
    dx = (dx / dist) * max;
    dy = (dy / dist) * max;
  }
  // 移动 thumb
  joystickThumb.style.left = `${rect.width / 2 + dx}px`;
  joystickThumb.style.top = `${rect.height / 2 + dy}px`;
  // 8 方向（与键盘 WASD 一致），死区防误触
  currentInput.moveX = dx > deadzone ? 1 : dx < -deadzone ? -1 : 0;
  currentInput.moveY = dy > deadzone ? 1 : dy < -deadzone ? -1 : 0;
}

export class TouchControls {
  constructor(_scene: Phaser.Scene, input: InputManager, onBackpack?: () => void, onQuest?: () => void) {
    // 更新当前活跃 InputManager（场景切换时由新场景更新）
    currentInput = input;
    backpackHandler = onBackpack ?? null;
    questHandler = onQuest ?? null;
    // DOM 只创建一次，后续场景切换只更新 currentInput
    if (!domCreated) {
      createDom();
    } else {
      updateControlsVisibility();
    }
  }

  /**
   * 每帧调用（在 inputManager.update() 之后、player.update() 之前）
   * 拖动中每帧重设方向，防止 inputManager.update() 用键盘值覆盖
   * 使用模块级 dragging，保证跨场景一致
   */
  update(): void {
    if (!dragging) return;
    applyDirection();
  }
}
