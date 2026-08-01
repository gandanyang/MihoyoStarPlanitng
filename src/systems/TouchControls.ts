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
import { isMobileLayout } from '../config';

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
  container.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:100;user-select:none;-webkit-user-select:none';

  // 摇杆容器（左下角）
  const joy = document.createElement('div');
  joy.style.cssText =
    'position:absolute;left:30px;bottom:30px;width:130px;height:130px;pointer-events:auto;touch-action:none';
  joystickBase = document.createElement('div');
  joystickBase.style.cssText =
    'position:absolute;inset:0;border-radius:50%;background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.4)';
  joystickThumb = document.createElement('div');
  joystickThumb.style.cssText =
    'position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px;border-radius:50%;background:rgba(255,255,255,0.6)';
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
  const btn = document.createElement('div');
  btn.style.cssText =
    'position:absolute;right:30px;bottom:30px;width:90px;height:90px;border-radius:50%;background:rgba(76,175,80,0.5);border:2px solid rgba(255,255,255,0.6);pointer-events:auto;display:flex;align-items:center;justify-content:center;color:#fff;font:bold 18px Arial;touch-action:none;cursor:pointer';
  btn.textContent = '交互';
  const pressBtn = (e: Event) => {
    e.preventDefault();
    if (currentInput) currentInput.queueAction();
  };
  btn.addEventListener('touchstart', pressBtn);
  btn.addEventListener('mousedown', pressBtn);

  // 背包按钮（仅移动端显示；桌面端用键盘 B）
  backpackBtn = document.createElement('div');
  backpackBtn.style.cssText =
    'position:absolute;right:30px;bottom:135px;width:64px;height:64px;border-radius:50%;background:rgba(33,150,243,0.5);border:2px solid rgba(255,255,255,0.6);pointer-events:auto;display:none;align-items:center;justify-content:center;color:#fff;font:bold 15px Arial;touch-action:none;cursor:pointer';
  backpackBtn.textContent = '背包';
  const pressBackpack = (e: Event) => {
    e.preventDefault();
    if (backpackHandler) backpackHandler();
  };
  backpackBtn.addEventListener('touchstart', pressBackpack);
  backpackBtn.addEventListener('mousedown', pressBackpack);
  container.appendChild(backpackBtn);
  updateBackpackVisibility();
  window.addEventListener('resize', updateBackpackVisibility);

  container.appendChild(joy);
  container.appendChild(btn);
  document.body.appendChild(container);
}

/** 背包按钮仅移动端显示（桌面有 B 键） */
function updateBackpackVisibility(): void {
  if (!backpackBtn) return;
  backpackBtn.style.display = isMobileLayout() ? 'flex' : 'none';
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
  constructor(_scene: Phaser.Scene, input: InputManager, onBackpack?: () => void) {
    // 更新当前活跃 InputManager（场景切换时由新场景更新）
    currentInput = input;
    backpackHandler = onBackpack ?? null;
    // DOM 只创建一次，后续场景切换只更新 currentInput
    if (!domCreated) {
      createDom();
    } else {
      updateBackpackVisibility();
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
