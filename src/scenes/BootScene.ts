import Phaser from 'phaser';

/**
 * 启动场景（BootScene）
 * Phase 0 仅用于验证项目初始化是否成功。
 * 后续 Phase 会在此场景加载资源后跳转到 MainScene。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const { width, height } = this.scale;

    // 启动验证文字
    this.add.text(width / 2, height / 2, '星露谷二游 0.1 - Boot OK', {
      fontFamily: 'Arial',
      fontSize: '32px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // 状态副标题
    this.add.text(width / 2, height / 2 + 50, 'Phase 0 初始化完成', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#aaaaaa',
    }).setOrigin(0.5);
  }
}
