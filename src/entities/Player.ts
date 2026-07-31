import Phaser from 'phaser';
import { InputManager } from '../systems/InputManager';

/**
 * 玩家实体
 * Phase 1：WASD 移动 + 朝向记录
 * Phase M1：输入解耦，从 InputManager 读 moveX/moveY，不再直接引用键盘
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  // 移动速度（像素/秒）
  private readonly speed = 200;

  // 玩家朝向（交互作用方向判定用）
  public facing: 'up' | 'down' | 'left' | 'right' = 'down';

  // 输入管理器引用
  private inputMgr: InputManager;

  constructor(scene: Phaser.Scene, x: number, y: number, inputMgr: InputManager) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 碰到物理世界边界停下
    this.setCollideWorldBounds(true);
    // 调整碰撞体略小于贴图，手感更好
    this.body!.setSize(12, 12).setOffset(2, 2);

    this.inputMgr = inputMgr;
  }

  /**
   * 每帧调用：从 InputManager 读取移动向量，设置速度与朝向
   * 由 MapScene.update() 调用
   */
  update(): void {
    const mx = this.inputMgr.moveX;
    const my = this.inputMgr.moveY;

    let vx = 0;
    let vy = 0;

    // 水平移动（与原逻辑一致：先水平后垂直，垂直覆盖水平朝向）
    if (mx < 0) {
      vx = -this.speed;
      this.facing = 'left';
    } else if (mx > 0) {
      vx = this.speed;
      this.facing = 'right';
    }

    // 垂直移动
    if (my < 0) {
      vy = -this.speed;
      this.facing = 'up';
    } else if (my > 0) {
      vy = this.speed;
      this.facing = 'down';
    }

    this.setVelocity(vx, vy);
  }
}
