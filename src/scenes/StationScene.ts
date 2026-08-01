/**
 * 车站开场场景 — 序章：归乡
 *
 * 流程：
 *   1. 全黑 → 列车进站声 → 淡入车站画面
 *   2. 手机通知（DOM 弹窗）
 *   3. 内心独白（StoryDialogue）
 *   4. 玩家走到右侧出口 → 切换到农场
 *
 * 纯 Phaser 图形 + DOM 叠加，不使用 Tiled 地图。
 */

import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { InputManager } from '../systems/InputManager';
import { TouchControls } from '../systems/TouchControls';
import { StoryDialogue } from '../ui/StoryDialogue';
import {
  STATION_DIALOGUE,
  advanceStory,
  getStoryStep,
  setStoryStep,
} from '../systems/StorySystem';
import { hasSave, load, apply } from '../systems/SaveSystem';

const W = 1120;   // 场景宽度（比屏幕宽，可滚动）
const H = 600;
const TILE = 16;

export class StationScene extends Phaser.Scene {
  private player!: Player;
  private inputManager!: InputManager;
  private touchControls!: TouchControls;
  private storyDialogue!: StoryDialogue;
  private phoneOverlay!: HTMLDivElement;
  private exitTriggered = false;
  private canMove = false;
  private mistParticles: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super('station');
  }

  preload(): void {
    // 加载 player 纹理（StationScene 是首个场景，MapScene 尚未启动）
    if (!this.textures.exists('player')) {
      this.load.spritesheet('player', 'assets/sprites/player.png', { frameWidth: 32, frameHeight: 32 });
    }
  }

  create(): void {
    // 有存档且教程已过车站 → 跳过
    if (hasSave()) {
      const saveData = load();
      if (saveData && getStoryStep() !== 'station_intro') {
        apply(saveData);
        const targetScene = saveData.player.scene || 'farm';
        this.scene.start(targetScene, {
          spawn: { x: saveData.player.x, y: saveData.player.y },
        });
        return;
      }
    }

    this.cameras.main.setBackgroundColor('#000000');

    // ---- 绘制车站场景 ----
    this.drawStation();

    // ---- 输入 ----
    this.inputManager = new InputManager(this.input.keyboard!);
    this.touchControls = new TouchControls(this, this.inputManager);

    // ---- 玩家（从列车旁出发） ----
    this.player = new Player(this, 160, 400, this.inputManager);
    // 注意：Player 自身已设置 physics + collideWorldBounds + body size
    // 这里不再重复 setSize，避免覆盖默认 24x24 碰撞盒

    // 世界边界：留出出口空间让玩家走到出口触发区域
    this.physics.world.setBounds(120, 350, W - 120, 210);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setBounds(0, 0, W, H);

    // ---- 剧情对话 ----
    this.storyDialogue = new StoryDialogue();

    // ---- 开场动画 ----
    if (getStoryStep() === 'station_intro') {
      this.playOpeningSequence();
      // 安全兜底：30 秒后无论如何允许移动
      this.time.delayedCall(30000, () => {
        if (!this.canMove) {
          console.warn('[StationScene] 安全超时：强制允许移动');
          this.canMove = true;
        }
      });
    } else {
      this.canMove = true;
      setStoryStep('station_move');
      this.showMoveHint();
    }
  }

  // ============ 绘制 ============

  private drawStation(): void {
    // ── 天空（晨光渐变） ──
    const skyGfx = this.add.graphics();
    skyGfx.fillGradientStyle(0x1a2a3a, 0x1a2a3a, 0x3a5a6a, 0x5a7a8a, 1);
    skyGfx.fillRect(0, 0, W, 320);
    skyGfx.setScrollFactor(0);

    // 朝霞光带
    const dawnGfx = this.add.graphics();
    dawnGfx.fillGradientStyle(0x000000, 0x000000, 0x6a4a3a, 0x8a5a3a, 0.15);
    dawnGfx.fillRect(0, 200, W, 160);
    dawnGfx.setScrollFactor(0);

    // ── 远山（三层视差） ──
    this.drawMountains(0x1a2a1a, 280, 0.1, 50, 80);   // 最远
    this.drawMountains(0x1a2a20, 300, 0.2, 35, 60);    // 中
    this.drawMountains(0x2a3a20, 320, 0.3, 25, 50);    // 近

    // ── 星黎庄园远景（模糊小房子） ──
    this.drawManorInDistance();

    // ── 田野（站台外的草地） ──
    const field = this.add.graphics();
    field.fillStyle(0x2a3a18, 1);
    field.fillRect(0, 370, W, 120);
    field.setScrollFactor(0.5);

    // 田野纹理
    for (let x = 0; x < W; x += 8) {
      field.fillStyle(0x2a4a10, 0.3);
      field.fillRect(x, 370 + (x % 16), 4, 10);
    }

    // ── 站台主体 ──
    const platformGfx = this.add.graphics();
    // 站台水泥面
    platformGfx.fillStyle(0x4a4540, 1);
    platformGfx.fillRect(0, 430, W, 170);
    // 站台边缘
    platformGfx.fillStyle(0x5a5550, 1);
    platformGfx.fillRect(0, 430, W, 4);
    // 站台砖缝
    platformGfx.lineStyle(1, 0x3a3530, 0.5);
    for (let x = 0; x < W; x += 32) {
      platformGfx.lineBetween(x, 430, x, 600);
    }
    for (let y = 430; y < 600; y += 32) {
      platformGfx.lineBetween(0, y, W, y);
    }

    // ── 铁路轨道（左下方） ──
    this.drawRailway();

    // ── 列车（左侧） ──
    this.drawTrain();

    // ── 站牌 ──
    this.drawStationSign();

    // ── 树木 ──
    this.drawTrees();

    // ── 青苔 ──
    for (let i = 0; i < 30; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(435, 590);
      this.add.circle(x, y, Phaser.Math.Between(2, 6), 0x2a4a2a, 0.5);
    }

    // ── 晨雾粒子 ──
    for (let i = 0; i < 12; i++) {
      const fog = this.add.rectangle(
        Phaser.Math.Between(0, W),
        Phaser.Math.Between(320, 440),
        Phaser.Math.Between(60, 150),
        Phaser.Math.Between(15, 35),
        0xdde8e0,
        0.06
      );
      fog.setScrollFactor(0.2);
      fog.setBlendMode(Phaser.BlendModes.ADD);
      this.mistParticles.push(fog);
      this.tweens.add({
        targets: fog,
        x: fog.x + Phaser.Math.Between(-30, 30),
        alpha: 0.03,
        duration: Phaser.Math.Between(3000, 6000),
        yoyo: true,
        repeat: -1,
      });
    }

    // ── 出口箭头（右侧） ──
    const arrow = this.add.text(W - 60, 370, '▶ 庄园', {
      fontSize: '14px',
      color: '#ffcc44',
      stroke: '#000',
      strokeThickness: 3,
    }).setDepth(10);
    this.tweens.add({
      targets: arrow,
      alpha: 0.4,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
  }

  /** 绘制远山轮廓 */
  private drawMountains(color: number, baseY: number, scrollX: number, minH: number, maxH: number): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(color, 0.8);
    let x = 0;
    gfx.beginPath();
    gfx.moveTo(0, baseY);
    while (x < W + 60) {
      const h = Phaser.Math.Between(minH, maxH);
      gfx.lineTo(x, baseY - h);
      x += Phaser.Math.Between(30, 70);
    }
    gfx.lineTo(W, baseY);
    gfx.closePath();
    gfx.fillPath();
    gfx.setScrollFactor(scrollX);
  }

  /** 星黎庄园远景 */
  private drawManorInDistance(): void {
    const gfx = this.add.graphics();
    gfx.setScrollFactor(0.2);
    // 房子主体
    gfx.fillStyle(0x3a2a1a, 0.6);
    gfx.fillRect(680, 310, 40, 30);
    // 屋顶
    gfx.fillStyle(0x5a1a1a, 0.6);
    gfx.fillTriangle(670, 310, 730, 310, 700, 290);
    // 烟囱
    gfx.fillStyle(0x3a2a1a, 0.5);
    gfx.fillRect(710, 295, 6, 15);
    // 标签
    this.add.text(700, 345, '星黎庄园', {
      fontSize: '9px',
      color: '#7a6a5a',
    }).setOrigin(0.5).setScrollFactor(0.2).setAlpha(0.6);
  }

  /** 铁路轨道 */
  private drawRailway(): void {
    const gfx = this.add.graphics();
    // 碎石路基
    gfx.fillStyle(0x3a3530, 1);
    gfx.fillRect(0, 395, 200, 40);
    // 铁轨
    gfx.fillStyle(0x5a4a3a, 1);
    gfx.fillRect(0, 405, 200, 3);
    gfx.fillRect(0, 425, 200, 3);
    // 枕木
    for (let x = 5; x < 200; x += 15) {
      gfx.fillStyle(0x4a3a2a, 1);
      gfx.fillRect(x, 403, 4, 24);
    }
  }

  /** 列车（左侧） */
  private drawTrain(): void {
    const gfx = this.add.graphics();
    const tx = 20;
    const ty = 365;
    // 车厢主体
    gfx.fillStyle(0x2a4a2a, 1);
    gfx.fillRect(tx, ty, 100, 40);
    // 车顶
    gfx.fillStyle(0x1a3a1a, 1);
    gfx.fillRect(tx - 2, ty - 6, 104, 8);
    // 窗户
    for (let wx = tx + 10; wx < tx + 90; wx += 22) {
      gfx.fillStyle(0x8ac8e8, 0.5);
      gfx.fillRect(wx, ty + 8, 14, 16);
      gfx.lineStyle(1, 0x1a3a1a, 0.8);
      gfx.strokeRect(wx, ty + 8, 14, 16);
    }
    // 车轮
    for (let wx = tx + 15; wx < tx + 85; wx += 30) {
      gfx.fillStyle(0x1a1a1a, 1);
      gfx.fillCircle(wx, ty + 42, 5);
      gfx.fillStyle(0x4a4a4a, 1);
      gfx.fillCircle(wx, ty + 42, 2);
    }
    // 列车标签
    this.add.text(tx + 50, ty - 14, '星火站', {
      fontSize: '8px',
      color: '#8a9a8a',
    }).setOrigin(0.5);
  }

  /** 站牌 */
  private drawStationSign(): void {
    const sx = 620;
    const sy = 380;
    // 柱子
    const pole = this.add.graphics();
    pole.fillStyle(0x5a4a3a, 1);
    pole.fillRect(sx + 18, sy, 4, 55);
    // 牌子
    const sign = this.add.graphics();
    sign.fillStyle(0x3a5a3a, 1);
    sign.fillRoundedRect(sx, sy + 10, 40, 20, 3);
    sign.lineStyle(2, 0x1a3a1a, 1);
    sign.strokeRoundedRect(sx, sy + 10, 40, 20, 3);
    this.add.text(sx + 20, sy + 20, '星火镇', {
      fontSize: '9px',
      color: '#d0c8b0',
    }).setOrigin(0.5);
  }

  /** 树木 */
  private drawTrees(): void {
    const treePositions = [
      { x: 300, y: 370, h: 50 },
      { x: 400, y: 375, h: 40 },
      { x: 550, y: 370, h: 55 },
      { x: 800, y: 368, h: 45 },
      { x: 900, y: 372, h: 50 },
      { x: 1000, y: 370, h: 42 },
    ];
    for (const t of treePositions) {
      const gfx = this.add.graphics();
      // 树干
      gfx.fillStyle(0x4a3a2a, 1);
      gfx.fillRect(t.x - 3, t.y - 10, 6, 20);
      // 树冠
      gfx.fillStyle(0x1a3a10, 0.8);
      gfx.fillTriangle(t.x - 15, t.y - 10, t.x + 15, t.y - 10, t.x, t.y - t.h);
      gfx.fillStyle(0x2a4a10, 0.6);
      gfx.fillTriangle(t.x - 12, t.y - 5, t.x + 12, t.y - 5, t.x, t.y - t.h + 10);
      gfx.setScrollFactor(0.4);
    }
  }

  // ============ 开场动画 ============

  private playOpeningSequence(): void {
    // 阶段1：黑屏 + 列车声
    this.time.delayedCall(800, () => {
      this.showTrainSoundText(() => {
        // 阶段2：淡入
        this.cameras.main.fadeIn(1200, 0, 0, 0);
        this.time.delayedCall(1200, () => {
          // 阶段3：手机通知
          this.showPhoneNotification(() => {
            this.playStationDialogue();
          });
        });
      });
    });
  }

  /** 列车进站声（纯文字动画） */
  private showTrainSoundText(onDone: () => void): void {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
      background: '#000', zIndex: '700',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', transition: 'opacity 0.6s',
    });
    const text = document.createElement('div');
    text.textContent = '哐当……哐当……';
    Object.assign(text.style, {
      color: '#666', fontSize: '18px', fontFamily: 'monospace',
      letterSpacing: '4px',
    });
    overlay.appendChild(text);
    document.body.appendChild(overlay);

    // 模拟列车减速
    let count = 0;
    const interval = setInterval(() => {
      count++;
      if (count === 1) text.textContent = '哐当……哐当……';
      else if (count === 2) text.textContent = '哐当…哐当…';
      else if (count === 3) text.textContent = '哐当..哐当..';
      else if (count === 4) {
        text.textContent = '—— 哧 ——';
        clearInterval(interval);
        setTimeout(() => {
          overlay.style.opacity = '0';
          setTimeout(() => { overlay.remove(); onDone(); }, 600);
        }, 500);
      }
    }, 600);
  }

  // ============ 手机通知 ============

  private showPhoneNotification(onClose: () => void): void {
    this.phoneOverlay = document.createElement('div');
    Object.assign(this.phoneOverlay.style, {
      position: 'fixed', left: '50%', top: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
      borderRadius: '16px', border: '2px solid #0f3460',
      padding: '24px 32px',
      boxShadow: '0 0 30px rgba(0,100,255,0.3)',
      zIndex: '600', cursor: 'pointer',
      maxWidth: '380px', fontFamily: 'monospace',
      opacity: '0', transition: 'opacity 0.8s',
    });

    const title = document.createElement('div');
    Object.assign(title.style, { color: '#4a9eff', fontSize: '12px', marginBottom: '8px' });
    title.textContent = '系统通知';

    const msg = document.createElement('div');
    Object.assign(msg.style, { color: '#7eb8ff', fontSize: '15px', lineHeight: '1.6' });
    msg.textContent = '由于公司业务调整，您的岗位将由新的智能化系统接替。';

    const hint = document.createElement('div');
    Object.assign(hint.style, { color: '#333', fontSize: '11px', marginTop: '12px', textAlign: 'center' });
    hint.textContent = '点击关闭';

    this.phoneOverlay.appendChild(title);
    this.phoneOverlay.appendChild(msg);
    this.phoneOverlay.appendChild(hint);
    document.body.appendChild(this.phoneOverlay);

    requestAnimationFrame(() => { this.phoneOverlay!.style.opacity = '1'; });

    this.phoneOverlay.addEventListener('click', () => {
      this.phoneOverlay!.style.opacity = '0';
      setTimeout(() => {
        this.phoneOverlay!.remove();
        this.phoneOverlay = null as any;
        onClose();
      }, 400);
    });
  }

  // ============ 对话 ============

  private playStationDialogue(): void {
    this.storyDialogue.play(STATION_DIALOGUE, () => {
      advanceStory(); // → station_move
      this.canMove = true;
      this.showMoveHint();
    });
  }

  private showMoveHint(): void {
    const hint = document.createElement('div');
    Object.assign(hint.style, {
      position: 'fixed', bottom: '140px', left: '50%',
      transform: 'translateX(-50%)', color: '#ffffff', fontSize: '14px',
      background: 'rgba(0,0,0,0.6)', padding: '8px 20px', borderRadius: '8px',
      zIndex: '400', pointerEvents: 'none',
      textShadow: '0 0 4px rgba(0,0,0,0.8)',
    });
    hint.textContent = '→ 使用 WASD 移动，向右走出车站';
    hint.id = 'station-move-hint';
    document.body.appendChild(hint);

    this.time.delayedCall(5000, () => {
      hint.style.transition = 'opacity 1s';
      hint.style.opacity = '0';
      setTimeout(() => hint.remove(), 1000);
    });
  }

  // ============ 每帧 ============

  update(): void {
    // 对话打开时禁止移动
    if (this.storyDialogue.isOpen()) {
      this.inputManager.update();
      this.player.setVelocity(0, 0);
      if (this.inputManager.consumeAction()) {
        this.storyDialogue.advance();
      }
      return;
    }

    if (!this.canMove) {
      this.player.setVelocity(0, 0);
      return;
    }

    this.inputManager.update();
    this.touchControls.update();
    this.player.update();

    // 检测到达出口
    if (!this.exitTriggered && this.player.x >= W - 160) {
      this.exitTriggered = true;
      this.canMove = false;
      this.cameras.main.fadeOut(800, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        const hint = document.getElementById('station-move-hint');
        if (hint) hint.remove();
        advanceStory(); // station_move → arrive_manor
        this.scene.start('farm', { spawn: { x: 15 * TILE, y: 3 * TILE } });
      });
    }
  }
}