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
import { hasSave, deleteSave } from '../systems/SaveSystem';
import { play } from '../systems/AudioSystem';
import { isMobileLayout } from '../config';
import { MusicSystem } from '../audio/MusicSystem';

// BUG-027 修复：移除标题画面主角头像（linchen_avatar.png）
// 封面图 title_bg.jpg 本身已有主角形象，右侧小头像冗余且位置突兀
// 头像保留在 public/assets/portraits/ 下，待未来其他场景复用

export class TitleScene extends Phaser.Scene {
  private startPrompt!: Phaser.GameObjects.Text;
  private canStart = false;

  constructor() {
    super('title');
  }

  preload(): void {
    // 加载标题背景图
    this.load.image('title_bg', 'assets/images/title_bg.jpg');
    this.load.image('logo_mark', 'assets/images/logo_mark.png');
  }

  create(): void {
    this.cameras?.main?.fadeIn(500, 0, 0, 0);
    MusicSystem.play('title');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => MusicSystem.stop());

    const W = 800;
    const H = 600;

    // ── 背景 ──
    const bg = this.add.image(W / 2, H / 2, 'title_bg');
    bg.setDisplaySize(W, H);

    // 暗色叠加层，让文字更清晰
    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.35);
    overlay.setDepth(1);

    // —— 标题 Logo（星+庄园图形标）+ 游戏名文字 ——
    const logo = this.add.image(W / 2, 150, 'logo_mark').setDepth(2);
    logo.setDisplaySize(140, 140);
    logo.setAlpha(0);
    this.tweens.add({ targets: logo, alpha: 1, duration: 1800, delay: 300, ease: 'Power2' });

    const title = this.add.text(W / 2, 235, '归星物语', {
      fontSize: '56px',
      fontFamily: '"Microsoft YaHei", "SimHei", sans-serif',
      color: '#ffd97a',
      stroke: '#3a2a1a',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(2);
    title.setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, duration: 1800, delay: 450, ease: 'Power2' });

    // 游戏名文字（v0.9 独立 Logo 方案：图形标 + 文字标题，封面不再烧字）
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
    this.add.text(W - 12, H - 12, 'v0.5.3', {
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

      // 调试专用：一键清除存档按钮（真机测试用，正式版移除）
      this.createClearSaveButton();
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

  /** 清除存档按钮（有存档时显示，居中于开始提示下方；二次点击确认防误删） */
  private createClearSaveButton(): void {
    const btn = document.createElement('div');
    btn.id = 'clear-save-btn';
    Object.assign(btn.style, {
      position: 'fixed',
      left: '50%',
      bottom: '90px',
      transform: 'translateX(-50%)',
      padding: '10px 24px',
      background: 'rgba(120,30,30,0.75)',
      color: '#ffb0a0',
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      borderRadius: '6px',
      cursor: 'pointer',
      border: '1px solid rgba(255,150,120,0.35)',
      zIndex: '900',
      pointerEvents: 'auto',
      userSelect: 'none',
      textShadow: '1px 1px 0 #000',
    });
    btn.textContent = '清除存档（重新开始）';
    let confirming = false;
    let confirmTimer: ReturnType<typeof setTimeout> | null = null;

    const resetConfirm = (): void => {
      confirming = false;
      if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null; }
      btn.textContent = '清除存档（重新开始）';
      btn.style.background = 'rgba(120,30,30,0.75)';
      btn.style.color = '#ffb0a0';
    };

    // 单击逻辑（pointerup 优先，click 兜底；pointerHandled 去重防双触发）
    let pointerHandled = false;
    const handleTap = (): void => {
      if (!confirming) {
        confirming = true;
        btn.textContent = '再次点击确认删除';
        btn.style.background = 'rgba(200,40,40,0.9)';
        btn.style.color = '#fff';
        confirmTimer = setTimeout(resetConfirm, 3000);
        return;
      }
      deleteSave();
      location.reload();
    };

    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    btn.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      e.preventDefault();
      pointerHandled = true;
      handleTap();
    });
    // click 兜底（极旧浏览器无 pointer 事件时；有 pointerup 时跳过防误删）
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (pointerHandled) { pointerHandled = false; return; }
      handleTap();
    });
    document.body.appendChild(btn);
  }

  private startGame(): void {
    if (!this.canStart) return;
    this.canStart = false;

    // 移除清除存档按钮，避免跨场景残留挡住游戏内交互键
    const clearBtn = document.getElementById('clear-save-btn');
    if (clearBtn) clearBtn.remove();

    play('levelup');
    // 淡出后切换到车站场景
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('station');
    });
  }
}
