import Phaser from 'phaser';

/**
 * 玩家实体
 * Phase 1：WASD 移动 + 朝向记录
 * 后续 Phase 会扩展工具使用、动画等
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  // 移动速度（像素/秒）
  private readonly speed = 200;

  // 玩家朝向（后续工具作用方向判定用）
  public facing: 'up' | 'down' | 'left' | 'right' = 'down';

  // 输入按键
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 碰到物理世界边界停下
    this.setCollideWorldBounds(true);
    // 调整碰撞体略小于贴图，手感更好
    this.body!.setSize(12, 12).setOffset(2, 2);

    this.setupInput();
  }

  private setupInput(): void {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    this.cursors = keyboard.createCursorKeys();
    this.keyW = keyboard.addKey('W');
    this.keyA = keyboard.addKey('A');
    this.keyS = keyboard.addKey('S');
    this.keyD = keyboard.addKey('D');
  }

  /**
   * 每帧调用：读取输入设置速度
   * 由 MainScene.update() 调用
   */
  update(): void {
    if (!this.cursors) return;

    let vx = 0;
    let vy = 0;

    // 水平移动
    if (this.keyA.isDown || this.cursors.left.isDown) {
      vx = -this.speed;
      this.facing = 'left';
    } else if (this.keyD.isDown || this.cursors.right.isDown) {
      vx = this.speed;
      this.facing = 'right';
    }

    // 垂直移动
    if (this.keyW.isDown || this.cursors.up.isDown) {
      vy = -this.speed;
      this.facing = 'up';
    } else if (this.keyS.isDown || this.cursors.down.isDown) {
      vy = this.speed;
      this.facing = 'down';
    }

    this.setVelocity(vx, vy);
  }
}
