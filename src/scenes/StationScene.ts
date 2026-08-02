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
import { addItem } from '../data/Inventory';

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
  private introSkipped = false;
  private trainInterval: ReturnType<typeof setInterval> | null = null;

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
      // 注意：此处必须读存档里的 storyStep，而不是 getStoryStep()
      // reload 后模块级 currentStep 仍是初始值 'station_intro'，apply() 前判断会永远跳过恢复
      if (saveData && saveData.story.storyStep !== 'station_intro') {
        apply(saveData);
        // 坏档自愈：存档场景是 farm 但剧情卡在"大门阶段"（历史版本物理返回键传送所致，
        // 真机反馈：教程被跳过 → 任务卡进度 → 不让睡觉）。推进到 clear_land 并补锄头，
        // 保证锄地教程可继续，避免永久卡死。
        const gateSteps = ['arrive_manor', 'xiya_talk', 'get_key', 'gate_opened'];
        if (saveData.player.scene === 'farm' && gateSteps.includes(getStoryStep())) {
          setStoryStep('clear_land');
          addItem('old_hoe', 1);
        }
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

    // ---- 玩家（从站台中央出发，站在站台地面上） ----
    this.player = new Player(this, 200, 460, this.inputManager);

    // 物理世界边界：限制在站台区域（y 轴对齐站台地面，x 轴留出出口空间）
    this.physics.world.setBounds(80, 440, W - 160, 80);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
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

    // ── 星黎庄园远景 ──
    this.drawManorInDistance();

    // ── 站台外草地 ──
    const field = this.add.graphics();
    field.fillStyle(0x2a3a18, 1);
    field.fillRect(0, 370, W, 75);
    field.setScrollFactor(0.5);
    // 草地纹理
    for (let x = 0; x < W; x += 8) {
      field.fillStyle(0x2a4a10, 0.3);
      field.fillRect(x, 370 + (x % 16), 4, 10);
    }

    // ── 站台地面 ──
    const platformGfx = this.add.graphics();
    // 站台主体
    platformGfx.fillStyle(0x4a4540, 1);
    platformGfx.fillRect(0, 445, W, 155);
    // 站台边缘（浅色镶边）
    platformGfx.fillStyle(0x6a6560, 1);
    platformGfx.fillRect(0, 445, W, 4);
    // 站台砖缝纹理
    platformGfx.lineStyle(1, 0x3a3530, 0.3);
    for (let x = 0; x < W; x += 32) {
      platformGfx.lineBetween(x, 449, x, 600);
    }
    for (let y = 449; y < 600; y += 32) {
      platformGfx.lineBetween(0, y, W, y);
    }
    // 站台边缘警戒线（黄色虚线）
    platformGfx.lineStyle(2, 0x8a7a3a, 0.6);
    for (let x = 0; x < W; x += 16) {
      platformGfx.lineBetween(x, 449, x + 8, 449);
    }

    // ── 铁路轨道（站台左侧下方） ──
    this.drawRailway();

    // ── 列车（左侧停靠） ──
    this.drawTrain();

    // ── 站台设施 ──
    this.drawPlatformFixtures();

    // ── 站牌 ──
    this.drawStationSign();

    // ── 树木（背景层） ──
    this.drawTrees();

    // ── 站台装饰细节 ──
    this.drawPlatformDetails();

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
    const arrow = this.add.text(W - 80, 420, '▶ 庄园', {
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
    // 碎石路基（在站台左侧，与站台平齐）
    gfx.fillStyle(0x3a3530, 1);
    gfx.fillRect(0, 410, 180, 30);
    // 铁轨
    gfx.fillStyle(0x5a4a3a, 1);
    gfx.fillRect(0, 420, 180, 3);
    gfx.fillRect(0, 432, 180, 3);
    // 枕木
    for (let x = 5; x < 180; x += 15) {
      gfx.fillStyle(0x4a3a2a, 1);
      gfx.fillRect(x, 418, 4, 18);
    }
  }

  /** 列车（左侧） */
  private drawTrain(): void {
    const gfx = this.add.graphics();
    const tx = 20;
    const ty = 380;
    // 车厢主体
    gfx.fillStyle(0x2a4a2a, 1);
    gfx.fillRect(tx, ty, 100, 36);
    // 车顶
    gfx.fillStyle(0x1a3a1a, 1);
    gfx.fillRect(tx - 2, ty - 5, 104, 6);
    // 窗户
    for (let wx = tx + 10; wx < tx + 90; wx += 22) {
      gfx.fillStyle(0x8ac8e8, 0.5);
      gfx.fillRect(wx, ty + 6, 14, 14);
      gfx.lineStyle(1, 0x1a3a1a, 0.8);
      gfx.strokeRect(wx, ty + 6, 14, 14);
    }
    // 车轮
    for (let wx = tx + 15; wx < tx + 85; wx += 30) {
      gfx.fillStyle(0x1a1a1a, 1);
      gfx.fillCircle(wx, ty + 38, 5);
      gfx.fillStyle(0x4a4a4a, 1);
      gfx.fillCircle(wx, ty + 38, 2);
    }
    // 列车标签
    this.add.text(tx + 50, ty - 12, '星火站', {
      fontSize: '8px',
      color: '#8a9a8a',
    }).setOrigin(0.5);
  }

  /** 站牌 */
  private drawStationSign(): void {
    const sx = 620;
    const sy = 395;
    // 柱子
    const pole = this.add.graphics();
    pole.fillStyle(0x6a5a4a, 1);
    pole.fillRect(sx + 18, sy, 4, 55);
    // 牌子
    const sign = this.add.graphics();
    sign.fillStyle(0x3a5a3a, 1);
    sign.fillRoundedRect(sx, sy + 8, 40, 22, 3);
    sign.lineStyle(2, 0x1a3a1a, 1);
    sign.strokeRoundedRect(sx, sy + 8, 40, 22, 3);
    this.add.text(sx + 20, sy + 19, '星火镇', {
      fontSize: '10px',
      color: '#d0c8b0',
    }).setOrigin(0.5);
  }

  /** 树木 */
  private drawTrees(): void {
    const treePositions = [
      { x: 300, y: 380, h: 50 },
      { x: 420, y: 385, h: 40 },
      { x: 520, y: 380, h: 55 },
      { x: 760, y: 378, h: 45 },
      { x: 850, y: 382, h: 50 },
      { x: 980, y: 380, h: 42 },
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

  /** 站台设施：路灯、长椅、信息牌 */
  private drawPlatformFixtures(): void {
    const fixtures: { x: number; type: 'lamp' | 'bench' | 'signboard' | 'trash' }[] = [
      { x: 350, type: 'lamp' },
      { x: 500, type: 'bench' },
      { x: 650, type: 'lamp' },
      { x: 780, type: 'signboard' },
      { x: 900, type: 'lamp' },
    ];
    for (const f of fixtures) {
      if (f.type === 'lamp') {
        // 路灯柱
        const pole = this.add.graphics();
        pole.fillStyle(0x5a5a5a, 1);
        pole.fillRect(f.x, 430, 4, 28);
        // 灯
        pole.fillStyle(0x8a8a6a, 0.8);
        pole.fillCircle(f.x + 2, 428, 5);
        pole.fillStyle(0xaaa88a, 0.3);
        pole.fillCircle(f.x + 2, 428, 3);
      } else if (f.type === 'bench') {
        // 长椅
        const bench = this.add.graphics();
        bench.fillStyle(0x6a5a3a, 1);
        bench.fillRect(f.x, 448, 24, 5);
        bench.fillStyle(0x5a4a2a, 1);
        bench.fillRect(f.x + 3, 453, 4, 6);
        bench.fillRect(f.x + 17, 453, 4, 6);
      } else if (f.type === 'signboard') {
        // 信息牌
        const board = this.add.graphics();
        board.fillStyle(0x4a4a4a, 1);
        board.fillRect(f.x + 8, 430, 2, 26);
        board.fillStyle(0x2a3a4a, 1);
        board.fillRect(f.x, 428, 18, 12);
        this.add.text(f.x + 9, 434, '→', {
          fontSize: '8px', color: '#8ac8ff',
        }).setOrigin(0.5);
      } else if (f.type === 'trash') {
        // 垃圾桶
        const trash = this.add.graphics();
        trash.fillStyle(0x3a3a3a, 1);
        trash.fillRect(f.x, 445, 10, 12);
        trash.fillStyle(0x4a4a4a, 1);
        trash.fillRect(f.x - 1, 444, 12, 3);
      }
    }
  }

  /** 站台装饰细节：地砖缝隙、落叶、鸽子 */
  private drawPlatformDetails(): void {
    // 地砖裂缝
    const cracks = this.add.graphics();
    cracks.lineStyle(1, 0x3a3530, 0.2);
    // 随机裂缝
    for (let i = 0; i < 8; i++) {
      const cx = Phaser.Math.Between(100, W - 50);
      const cy = Phaser.Math.Between(455, 500);
      cracks.lineBetween(cx, cy, cx + Phaser.Math.Between(-15, 15), cy + Phaser.Math.Between(5, 20));
    }

    // 落叶
    for (let i = 0; i < 10; i++) {
      const lx = Phaser.Math.Between(50, W - 30);
      const ly = Phaser.Math.Between(450, 520);
      this.add.circle(lx, ly, Phaser.Math.Between(1, 2), 0x6a5a2a, 0.5);
    }

    // 鸽子（简单动画）
    for (let i = 0; i < 2; i++) {
      const bx = Phaser.Math.Between(400, 800);
      const by = 455 + i * 15;
      const bird = this.add.circle(bx, by, 3, 0x5a4a3a, 1);
      bird.setDepth(6);
      this.tweens.add({
        targets: bird,
        x: bird.x + Phaser.Math.Between(-80, -40),
        y: bird.y + Phaser.Math.Between(-20, -10),
        alpha: 0,
        duration: Phaser.Math.Between(4000, 6000),
        delay: Phaser.Math.Between(0, 2000),
        onComplete: () => {
          bird.x = Phaser.Math.Between(600, 900);
          bird.y = 455 + i * 15;
          bird.alpha = 1;
          this.tweens.add({ targets: bird, x: bird.x - 60, y: bird.y - 15, alpha: 0, duration: 5000 });
        },
      });
    }
  }

  // ============ 开场动画 ============

  private playOpeningSequence(): void {
    // 跳过按钮（开场全程显示，点击后跳过所有动画直接进入可玩状态）
    this.createSkipButton();

    // 阶段1：黑屏 + 列车声
    this.time.delayedCall(800, () => {
      if (this.introSkipped) return;
      this.showTrainSoundText(() => {
        if (this.introSkipped) return;
        // 阶段2：淡入
        this.cameras.main.fadeIn(1200, 0, 0, 0);
        this.time.delayedCall(1200, () => {
          if (this.introSkipped) return;
          // 阶段3：手机通知
          this.showPhoneNotification(() => {
            if (this.introSkipped) return;
            this.playStationDialogue();
          });
        });
      });
    });
  }

  /** 创建跳过按钮（DOM，右上角） */
  private createSkipButton(): void {
    const btn = document.createElement('div');
    btn.id = 'intro-skip-btn';
    Object.assign(btn.style, {
      position: 'fixed', top: '16px', right: '16px',
      padding: '8px 20px', background: 'rgba(0,0,0,0.6)',
      color: '#ccc', fontSize: '14px', fontFamily: 'monospace',
      border: '1px solid #555', borderRadius: '4px',
      cursor: 'pointer', zIndex: '800',
      userSelect: 'none', transition: 'background 0.2s',
    });
    btn.textContent = '跳过开场';
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(80,80,80,0.8)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(0,0,0,0.6)'; });
    // 触屏兼容：pointerdown 立即响应 + click 兜底（skipIntro 有 introSkipped 防重）
    btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.skipIntro(); });
    btn.addEventListener('click', (e) => { e.stopPropagation(); this.skipIntro(); });
    document.body.appendChild(btn);
  }

  /** 跳过开场动画，直接进入可玩状态 */
  private skipIntro(): void {
    if (this.introSkipped) return;
    this.introSkipped = true;

    // 清除列车声定时器
    if (this.trainInterval) { clearInterval(this.trainInterval); this.trainInterval = null; }
    // 移除列车声遮罩
    const trainOverlay = document.getElementById('intro-train-overlay');
    if (trainOverlay) trainOverlay.remove();
    // 移除手机通知
    if (this.phoneOverlay) { this.phoneOverlay.remove(); this.phoneOverlay = null as any; }
    // 移除跳过按钮
    const skipBtn = document.getElementById('intro-skip-btn');
    if (skipBtn) skipBtn.remove();

    // 立即淡入（消除黑屏）
    this.cameras.main.fadeIn(300, 0, 0, 0);
    // 进入可玩状态
    this.canMove = true;
    setStoryStep('station_move');
    this.showMoveHint();
  }

  /** 列车进站声（纯文字动画） */
  private showTrainSoundText(onDone: () => void): void {
    const overlay = document.createElement('div');
    overlay.id = 'intro-train-overlay';
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
    this.trainInterval = setInterval(() => {
      count++;
      if (count === 1) text.textContent = '哐当……哐当……';
      else if (count === 2) text.textContent = '哐当…哐当…';
      else if (count === 3) text.textContent = '哐当..哐当..';
      else if (count === 4) {
        text.textContent = '—— 哧 ——';
        if (this.trainInterval) { clearInterval(this.trainInterval); this.trainInterval = null; }
        setTimeout(() => {
          if (this.introSkipped) return;
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
    // P1-2：世界内表达——这是公司人事发来的通知，不是"系统"通知
    title.textContent = '人事通知';

    const msg = document.createElement('div');
    Object.assign(msg.style, { color: '#7eb8ff', fontSize: '15px', lineHeight: '1.6' });
    msg.textContent = '因业务流程智能化调整，您的岗位职责将进行重新分配。';

    const hint = document.createElement('div');
    Object.assign(hint.style, { color: '#333', fontSize: '11px', marginTop: '12px', textAlign: 'center' });
    hint.textContent = '点击关闭';

    this.phoneOverlay.appendChild(title);
    this.phoneOverlay.appendChild(msg);
    this.phoneOverlay.appendChild(hint);
    document.body.appendChild(this.phoneOverlay);

    requestAnimationFrame(() => { if (this.phoneOverlay) this.phoneOverlay.style.opacity = '1'; });

    this.phoneOverlay.addEventListener('click', () => {
      if (!this.phoneOverlay) return;
      this.phoneOverlay.style.opacity = '0';
      setTimeout(() => {
        // 竞态保护：若期间已被 skipIntro 移除并置 null，跳过重复移除
        if (this.phoneOverlay) {
          this.phoneOverlay.remove();
          this.phoneOverlay = null as any;
        }
        onClose();
      }, 400);
    });
  }

  // ============ 对话 ============

  private playStationDialogue(): void {
    this.storyDialogue.play(STATION_DIALOGUE, () => {
      advanceStory(); // → station_move
      this.canMove = true;
      this.hideSkipButton(); // P2：剧情对话结束后隐藏跳过按钮
      this.showMoveHint();
    });
  }

  /** 隐藏跳过开场按钮 */
  private hideSkipButton(): void {
    const btn = document.getElementById('intro-skip-btn');
    if (btn) btn.remove();
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
        // 教程未完成时先进入大门地图，否则直接进农场
        const isGate = getStoryStep() === 'arrive_manor';
        const target = isGate ? 'gate' : 'farm';
        // 注意：农场顶部出口区域 y∈[0,48]，出生点必须 > 48，否则一帧内被弹回
        const spawn = isGate ? { x: 15 * TILE, y: 17 * TILE } : { x: 15 * TILE, y: 6 * TILE };
        this.scene.start(target, { spawn });
      });
    }
  }
}
