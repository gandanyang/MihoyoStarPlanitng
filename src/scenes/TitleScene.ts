/**
 * 标题画面场景 — 归星物语
 *
 * 进入游戏前展示的标题画面，包含：
 *   1. 星空庄园背景
 *   2. 游戏标题「归星物语」
 *   3. 副标题与操作提示
 *   4. 按任意键/点击开始游戏
 */

import Phaser from 'phaser';
import { hasSave } from '../systems/SaveSystem';
import { play } from '../systems/AudioSystem';
import { isMobileLayout } from '../config';

export class TitleScene extends Phaser.Scene {
  private startPrompt!: Phaser.GameObjects.Text;
  private canStart = false;

  constructor() {
    super('title');
  }

  preload(): void {
    // 加载标题背景图
    this.load.image('title_bg', 'assets/images/title_bg.jpg');
  }

  create(): void {
    this.cameras.main.fadeIn(500, 0, 0, 0);

    const W = 800;
    const H = 600;

    // ── 背景 ──
    const bg = this.add.image(W / 2, H / 2, 'title_bg');
    bg.setDisplaySize(W, H);

    // 暗色叠加层，让文字更清晰
    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.35);
    overlay.setDepth(1);

    // 游戏名已包含在封面图内，不再叠加文字
    // ── 副标题 ──
    const subtitle = this.add.text(W / 2, 300, '星黎庄园的归乡之旅', {
      fontSize: '18px',
      fontFamily: '"Microsoft YaHei", "SimHei", sans-serif',
      color: '#b8a88a',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2);
    subtitle.setAlpha(0);
    this.tweens.add({
      targets: subtitle,
      alpha: 1,
      duration: 2000,
      delay: 600,
      ease: 'Power2',
    });

    // ── 版本号 ──
    this.add.text(W - 12, H - 12, 'v0.3', {
      fontSize: '12px',
      color: '#666',
      stroke: '#000',
      strokeThickness: 1,
    }).setOrigin(1, 1).setDepth(2);

    // ── 存档提示 ──
    if (hasSave()) {
      this.add.text(W / 2, 300, '检测到存档，将自动继续游戏', {
        fontSize: '13px',
        color: '#8a8',
        stroke: '#000',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(2);
    }

    // ── 操作提示 ──
    this.startPrompt = this.add.text(W / 2, 380, isMobileLayout() ? '点按屏幕 开始游戏' : '按 Enter 或点击 开始游戏', {
      fontSize: '20px',
      fontFamily: '"Microsoft YaHei", "SimHei", sans-serif',
      color: '#ffcc44',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(2);

    // 闪烁动画
    this.tweens.add({
      targets: this.startPrompt,
      alpha: 0.3,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    // ── 版权信息 ──
    this.add.text(W / 2, H - 40, '© 2026 归星物语', {
      fontSize: '11px',
      color: '#555',
      stroke: '#000',
      strokeThickness: 1,
    }).setOrigin(0.5).setDepth(2);

    // ── 输入 ──
    // 按 Enter 或点击开始
    this.canStart = true;

    this.input.keyboard!.on('keydown-ENTER', () => this.startGame());
    this.input.keyboard!.on('keydown-SPACE', () => this.startGame());
    this.input.once('pointerdown', () => this.startGame());

    // 触摸安全：点击画面同样触发
    this.input.once('pointerup', () => this.startGame());
  }

  private startGame(): void {
    if (!this.canStart) return;
    this.canStart = false;

    play('levelup');

    // 淡出后切换到车站场景
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('station');
    });
  }
}