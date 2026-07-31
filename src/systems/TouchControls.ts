/**
 * 触屏控件（Phase M3）
 *
 * 虚拟摇杆（左下角）+ 交互按钮（右下角"交互"）。
 * 自动检测触屏设备：触屏设备显示，纯 PC 隐藏。
 *
 * 架构：控件只操作 InputManager，不直接碰 Player/MapScene。
 *   摇杆拖动 → inputManager.moveX / moveY
 *   按钮按下 → inputManager.queueAction()
 *
 * 8 方向移动（与键盘 WASD 行为一致），死区防误触。
 * 控件固定在屏幕上（setScrollFactor 0），不随摄像机移动。
 */

import Phaser from 'phaser';
import { InputManager } from './InputManager';

export class TouchControls {
  private scene: Phaser.Scene;
  private input: InputManager;

  // 是否触屏设备（决定是否显示控件）
  private enabled: boolean;

  // 摇杆
  private base!: Phaser.GameObjects.Arc;
  private thumb!: Phaser.GameObjects.Arc;
  // 摇杆拖动状态
  private dragging = false;
  // 最近手指位置（屏幕坐标），update 每帧据此重设方向
  private lastPX = 0;
  private lastPY = 0;
  // 摇杆中心点（屏幕坐标）
  private readonly baseX = 90;
  private readonly baseY = 510;
  private readonly baseRadius = 42;
  // 死区（像素），小于此距离不触发方向
  private readonly deadzone = 10;

  // 交互按钮
  private actionBtn!: Phaser.GameObjects.Arc;
  private readonly btnX = 710;
  private readonly btnY = 510;
  private readonly btnRadius = 38;

  constructor(scene: Phaser.Scene, input: InputManager) {
    this.scene = scene;
    this.input = input;
    this.enabled = this.isTouchDevice();

    if (!this.enabled) return;

    this.createJoystick();
    this.createActionButton();
  }

  /** 检测触屏设备 */
  private isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  /** 创建虚拟摇杆 */
  private createJoystick(): void {
    this.base = this.scene.add
      .circle(this.baseX, this.baseY, this.baseRadius, 0xffffff, 0.15)
      .setStrokeStyle(2, 0xffffff, 0.4)
      .setScrollFactor(0)
      .setDepth(1000);
    this.thumb = this.scene.add
      .circle(this.baseX, this.baseY, 18, 0xffffff, 0.5)
      .setScrollFactor(0)
      .setDepth(1001);

    // 摇杆区域可交互
    this.base.setInteractive(
      new Phaser.Geom.Circle(this.baseX, this.baseY, this.baseRadius + 20),
      Phaser.Geom.Circle.Contains,
    );

    // 按下摇杆开始拖动
    this.base.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.lastPX = pointer.x;
      this.lastPY = pointer.y;
      this.updateJoystick(pointer.x, pointer.y);
    });

    // 全局监听拖动与抬起（避免手指移出 base 就失效）
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.dragging) {
        this.lastPX = pointer.x;
        this.lastPY = pointer.y;
        this.updateJoystick(pointer.x, pointer.y);
      }
    });
    this.scene.input.on('pointerup', () => {
      if (this.dragging) {
        this.dragging = false;
        this.resetJoystick();
      }
    });
  }

  /** 根据手指位置更新摇杆方向 */
  private updateJoystick(px: number, py: number): void {
    let dx = px - this.baseX;
    let dy = py - this.baseY;
    // 限制 thumb 在 base 半径内
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = this.baseRadius;
    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }
    this.thumb.setPosition(this.baseX + dx, this.baseY + dy);

    // 计算 8 方向（与键盘一致：-1/0/1），死区防误触
    this.input.moveX = dx > this.deadzone ? 1 : dx < -this.deadzone ? -1 : 0;
    this.input.moveY = dy > this.deadzone ? 1 : dy < -this.deadzone ? -1 : 0;
  }

  /** 摇杆归位，停止移动 */
  private resetJoystick(): void {
    this.thumb.setPosition(this.baseX, this.baseY);
    this.input.moveX = 0;
    this.input.moveY = 0;
  }

  /** 创建交互按钮 */
  private createActionButton(): void {
    this.actionBtn = this.scene.add
      .circle(this.btnX, this.btnY, this.btnRadius, 0x4caf50, 0.5)
      .setStrokeStyle(2, 0xffffff, 0.6)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive();

    this.scene.add
      .text(this.btnX, this.btnY, '交互', {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001);

    // 按下触发动作（消费语义由 InputManager.consumeAction 保证只触发一次）
    this.actionBtn.on('pointerdown', () => {
      this.input.queueAction();
      // 视觉反馈：按下缩小
      this.actionBtn.setScale(0.9);
    });
    this.actionBtn.on('pointerup', () => {
      this.actionBtn.setScale(1);
    });
    this.actionBtn.on('pointerout', () => {
      this.actionBtn.setScale(1);
    });
  }

  /**
   * 每帧调用（在 inputManager.update() 之后、player.update() 之前）
   * 摇杆拖动时每帧重设方向，防止 inputManager.update() 用键盘值覆盖（触屏设备键盘为 0）
   * 未拖动时不干预（保留键盘输入）
   */
  update(): void {
    if (!this.enabled || !this.dragging) return;
    this.updateJoystick(this.lastPX, this.lastPY);
  }

  /** 场景销毁时清理（Phaser 场景切换自动销毁游戏对象，无需手动） */
}
