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
import { play } from '../systems/AudioSystem';
import { VoiceBank } from '../audio/VoiceBank';
import { isMobileLayout } from '../config';

// 场景宽度：基准 1120（比 4:3 屏幕宽，可滚动）；屏幕适配升级后逻辑宽度随
// 屏幕比例扩展（main.ts applyAdaptiveLogicalSize），超宽屏下世界同宽延伸，
// 避免相机视野超出世界露出背景（玩家镜头始终完整）
const W = Math.max(1120, typeof window !== 'undefined' ? window.innerWidth / window.innerHeight * 600 : 1120);
const H = 600;
const TILE = 16;

/** 手机通知第 1 页短信播报文案（与 tools/gen_mainline_voice.py T 清单 hr_station_01 / voicebank 映射精确一致） */
const PHONE_NOTIFY_VOICE_TEXT = '因业务流程智能化调整，您的岗位职责将进行重新分配。';
/** 手机通知第 2 页短信播报文案（翻页后播报，每页只读第一句） */
const PHONE_NOTIFY_PAGE2_VOICE_TEXT = '随着智能化系统升级，公司将对部分岗位进行调整。';

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
  private interactHintEl: HTMLDivElement | null = null;
  private nearestInteractable: { x: number; y: number; text: string } | null = null;

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
        // 坏档自愈：gate 地图存档中 step 卡在 xiya_talk（对话被打断）→ 回退到 arrive_manor
        if (saveData.player.scene === 'gate' && getStoryStep() === 'xiya_talk') {
          setStoryStep('arrive_manor');
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
    // ── 天空（晨光渐变，更丰富的色彩层次） ──
    const skyGfx = this.add.graphics();
    // 主天空渐变（深蓝到浅蓝）
    skyGfx.fillGradientStyle(0x0a1a2a, 0x0a1a2a, 0x2a4a5a, 0x4a6a7a, 1);
    skyGfx.fillRect(0, 0, W, 320);
    skyGfx.setScrollFactor(0);

    // 朝霞光带（更温暖的橙色）
    const dawnGfx = this.add.graphics();
    dawnGfx.fillGradientStyle(0x000000, 0x000000, 0x8a5a2a, 0xaa7a3a, 0.2);
    dawnGfx.fillRect(0, 180, W, 180);
    dawnGfx.setScrollFactor(0);

    // 地平线光晕（更明显的晨光）
    const horizonGfx = this.add.graphics();
    horizonGfx.fillGradientStyle(0x000000, 0x000000, 0xccaa66, 0xddcc88, 0.12);
    horizonGfx.fillRect(0, 300, W, 80);
    horizonGfx.setScrollFactor(0);

    // ── 云朵（静态，增加层次感） ──
    this.drawClouds();

    // ── 远山（三层视差，更丰富的颜色） ──
    this.drawMountains(0x0a1a0a, 280, 0.1, 50, 80);   // 最远（深绿）
    this.drawMountains(0x1a2a10, 300, 0.2, 35, 60);    // 中（中绿）
    this.drawMountains(0x2a3a18, 320, 0.3, 25, 50);    // 近（浅绿）

    // ── 星黎庄园远景 ──
    this.drawManorInDistance();

    // ── 站台外草地（更自然的绿色） ──
    const field = this.add.graphics();
    field.fillStyle(0x2a4a18, 1);
    field.fillRect(0, 370, W, 75);
    field.setScrollFactor(0.5);
    // 草地纹理（更自然的草丛）
    for (let x = 0; x < W; x += 6) {
      field.fillStyle(0x3a5a20, 0.4);
      field.fillRect(x, 370 + (x % 12), 3, 8 + (x % 5));
      // 随机小草
      if (x % 18 === 0) {
        field.fillStyle(0x4a6a30, 0.3);
        field.fillRect(x + 2, 368, 2, 6);
      }
    }

    // ── 站台地面（更真实的石砖质感） ──
    const platformGfx = this.add.graphics();
    // 站台主体（深灰色石砖）
    platformGfx.fillStyle(0x3a3535, 1);
    platformGfx.fillRect(0, 445, W, 155);
    // 站台边缘（浅色镶边，更明显）
    platformGfx.fillStyle(0x5a5555, 1);
    platformGfx.fillRect(0, 445, W, 5);
    // 站台砖缝纹理（更细的网格）
    platformGfx.lineStyle(1, 0x2a2525, 0.4);
    for (let x = 0; x < W; x += 24) {
      platformGfx.lineBetween(x, 450, x, 600);
    }
    for (let y = 450; y < 600; y += 24) {
      platformGfx.lineBetween(0, y, W, y);
    }
    // 站台边缘警戒线（更明显的黄色虚线）
    platformGfx.lineStyle(3, 0x9a8a3a, 0.7);
    for (let x = 0; x < W; x += 20) {
      platformGfx.lineBetween(x, 449, x + 10, 449);
    }

    // ── 铁路轨道（站台左侧下方） ──
    this.drawRailway();

    // ── 列车（左侧停靠，更真实的绿皮火车） ──
    this.drawTrain();

    // ── 站台设施（更丰富的细节） ──
    this.drawPlatformFixtures();

    // ── 站牌（更显眼的木质站牌） ──
    this.drawStationSign();

    // ── 树木（背景层，更自然的树木） ──
    this.drawTrees();

    // ── 站台装饰细节（落叶、鸽子、水洼） ──
    this.drawPlatformDetails();

    // ── 新增交互物视觉（车站场景升级） ──
    this.drawNewInteractables();

    // ── 晨雾粒子（更柔和的雾气） ──
    for (let i = 0; i < 15; i++) {
      const fog = this.add.rectangle(
        Phaser.Math.Between(0, W),
        Phaser.Math.Between(320, 440),
        Phaser.Math.Between(80, 200),
        Phaser.Math.Between(20, 40),
        0xcce0d0,
        0.05
      );
      fog.setScrollFactor(0.2);
      fog.setBlendMode(Phaser.BlendModes.ADD);
      this.mistParticles.push(fog);
      this.tweens.add({
        targets: fog,
        x: fog.x + Phaser.Math.Between(-40, 40),
        alpha: 0.02,
        duration: Phaser.Math.Between(4000, 7000),
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

  /** 绘制云朵（静态，增加天空层次感） */
  private drawClouds(): void {
    const clouds = [
      { x: 150, y: 80, w: 120, h: 30 },
      { x: 400, y: 60, w: 150, h: 35 },
      { x: 700, y: 90, w: 100, h: 25 },
      { x: 950, y: 70, w: 130, h: 28 },
    ];
    for (const c of clouds) {
      const gfx = this.add.graphics();
      gfx.fillStyle(0xffffff, 0.08);
      // 云朵主体（椭圆）
      gfx.fillEllipse(c.x, c.y, c.w, c.h);
      // 云朵凸起
      gfx.fillEllipse(c.x - c.w * 0.25, c.y - 5, c.w * 0.5, c.h * 0.7);
      gfx.fillEllipse(c.x + c.w * 0.2, c.y - 3, c.w * 0.4, c.h * 0.6);
      gfx.setScrollFactor(0.05);
    }
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

  /** 列车（左侧停靠，更真实的绿皮火车） */
  private drawTrain(): void {
    const gfx = this.add.graphics();
    const tx = 20;
    const ty = 380;
    // 车厢主体（深绿色）
    gfx.fillStyle(0x1a3a1a, 1);
    gfx.fillRect(tx, ty, 120, 40);
    // 车顶（弧形，更真实）
    gfx.fillStyle(0x0a2a0a, 1);
    gfx.fillRect(tx - 3, ty - 6, 126, 7);
    gfx.fillEllipse(tx + 60, ty - 6, 126, 10);
    // 车窗（更真实的窗户）
    for (let wx = tx + 12; wx < tx + 108; wx += 24) {
      // 窗框
      gfx.fillStyle(0x2a4a2a, 1);
      gfx.fillRect(wx - 1, ty + 5, 18, 18);
      // 玻璃（带反光）
      gfx.fillStyle(0x8ac8e8, 0.6);
      gfx.fillRect(wx, ty + 6, 16, 16);
      // 窗户反光
      gfx.fillStyle(0xffffff, 0.2);
      gfx.fillRect(wx + 2, ty + 8, 4, 12);
    }
    // 车门（更真实）
    gfx.fillStyle(0x2a4a2a, 1);
    gfx.fillRect(tx + 105, ty + 8, 10, 28);
    gfx.fillStyle(0x1a3a1a, 1);
    gfx.fillRect(tx + 107, ty + 10, 6, 24);
    // 车轮（更真实）
    for (let wx = tx + 18; wx < tx + 100; wx += 35) {
      gfx.fillStyle(0x1a1a1a, 1);
      gfx.fillCircle(wx, ty + 42, 6);
      gfx.fillStyle(0x3a3a3a, 1);
      gfx.fillCircle(wx, ty + 42, 3);
      gfx.fillStyle(0x5a5a5a, 1);
      gfx.fillCircle(wx, ty + 42, 1);
    }
    // 列车标签（更显眼）
    this.add.text(tx + 60, ty - 14, '星火站', {
      fontSize: '9px',
      color: '#aaccaa',
      stroke: '#000',
      strokeThickness: 1,
    }).setOrigin(0.5);
  }

  /** 站牌（更显眼的木质站牌） */
  private drawStationSign(): void {
    const sx = 620;
    const sy = 395;
    // 柱子（木质纹理）
    const pole = this.add.graphics();
    pole.fillStyle(0x5a4a3a, 1);
    pole.fillRect(sx + 18, sy, 5, 55);
    pole.fillStyle(0x6a5a4a, 0.5);
    pole.fillRect(sx + 19, sy, 2, 55);
    // 牌子（木质牌子，更显眼）
    const sign = this.add.graphics();
    sign.fillStyle(0x3a5a3a, 1);
    sign.fillRoundedRect(sx - 5, sy + 5, 50, 28, 4);
    sign.lineStyle(2, 0x1a3a1a, 1);
    sign.strokeRoundedRect(sx - 5, sy + 5, 50, 28, 4);
    // 牌子边框装饰
    sign.lineStyle(1, 0x5a7a5a, 0.5);
    sign.strokeRoundedRect(sx - 2, sy + 8, 44, 22, 2);
    this.add.text(sx + 20, sy + 19, '青禾镇', {
      fontSize: '12px',
      color: '#e0d8c0',
      stroke: '#000',
      strokeThickness: 1,
    }).setOrigin(0.5);
  }

  /** 树木（更自然的树木） */
  private drawTrees(): void {
    const treePositions = [
      { x: 300, y: 380, h: 55, w: 18 },
      { x: 420, y: 385, h: 45, w: 15 },
      { x: 520, y: 380, h: 60, w: 20 },
      { x: 760, y: 378, h: 50, w: 16 },
      { x: 850, y: 382, h: 55, w: 18 },
      { x: 980, y: 380, h: 48, w: 17 },
    ];
    for (const t of treePositions) {
      const gfx = this.add.graphics();
      // 树干（更自然的棕色）
      gfx.fillStyle(0x4a3a2a, 1);
      gfx.fillRect(t.x - 4, t.y - 12, 8, 24);
      gfx.fillStyle(0x5a4a3a, 0.5);
      gfx.fillRect(t.x - 2, t.y - 12, 3, 24);
      // 树冠（多层三角形，更自然）
      gfx.fillStyle(0x1a3a10, 0.9);
      gfx.fillTriangle(t.x - t.w, t.y - 12, t.x + t.w, t.y - 12, t.x, t.y - t.h);
      gfx.fillStyle(0x2a4a15, 0.7);
      gfx.fillTriangle(t.x - t.w + 4, t.y - 6, t.x + t.w - 4, t.y - 6, t.x, t.y - t.h + 12);
      gfx.fillStyle(0x3a5a20, 0.5);
      gfx.fillTriangle(t.x - t.w + 8, t.y, t.x + t.w - 8, t.y, t.x, t.y - t.h + 20);
      gfx.setScrollFactor(0.4);
    }
  }

  /** 站台设施：路灯、长椅、信息牌（更丰富的细节） */
  private drawPlatformFixtures(): void {
    const fixtures: { x: number; type: 'lamp' | 'bench' | 'signboard' | 'trash' | 'flower' }[] = [
      { x: 350, type: 'lamp' },
      { x: 450, type: 'flower' },
      { x: 500, type: 'bench' },
      { x: 650, type: 'lamp' },
      { x: 720, type: 'flower' },
      { x: 780, type: 'signboard' },
      { x: 900, type: 'lamp' },
    ];
    for (const f of fixtures) {
      if (f.type === 'lamp') {
        // 路灯柱（更真实的金属质感）
        const pole = this.add.graphics();
        pole.fillStyle(0x4a4a4a, 1);
        pole.fillRect(f.x, 428, 5, 30);
        pole.fillStyle(0x5a5a5a, 0.5);
        pole.fillRect(f.x + 1, 428, 2, 30);
        // 灯罩
        pole.fillStyle(0x6a6a6a, 1);
        pole.fillEllipse(f.x + 2, 426, 12, 6);
        // 灯光（暖黄色）
        pole.fillStyle(0xffeeaa, 0.4);
        pole.fillCircle(f.x + 2, 426, 4);
        pole.fillStyle(0xffeeaa, 0.15);
        pole.fillCircle(f.x + 2, 426, 8);
      } else if (f.type === 'bench') {
        // 长椅（更真实的木质长椅）
        const bench = this.add.graphics();
        bench.fillStyle(0x6a5a3a, 1);
        bench.fillRect(f.x, 448, 30, 6);
        bench.fillStyle(0x7a6a4a, 0.5);
        bench.fillRect(f.x + 1, 449, 28, 2);
        bench.fillStyle(0x5a4a2a, 1);
        bench.fillRect(f.x + 4, 454, 5, 7);
        bench.fillRect(f.x + 21, 454, 5, 7);
        // 靠背
        bench.fillStyle(0x6a5a3a, 1);
        bench.fillRect(f.x, 442, 30, 4);
        bench.fillStyle(0x7a6a4a, 0.5);
        bench.fillRect(f.x + 1, 443, 28, 1);
      } else if (f.type === 'signboard') {
        // 信息牌（更真实的站牌）
        const board = this.add.graphics();
        board.fillStyle(0x4a4a4a, 1);
        board.fillRect(f.x + 8, 428, 3, 28);
        board.fillStyle(0x2a3a4a, 1);
        board.fillRect(f.x - 2, 426, 22, 14);
        board.lineStyle(1, 0x3a4a5a, 0.5);
        board.strokeRect(f.x - 2, 426, 22, 14);
        this.add.text(f.x + 9, 433, '→', {
          fontSize: '9px', color: '#8ac8ff',
        }).setOrigin(0.5);
      } else if (f.type === 'trash') {
        // 垃圾桶（更真实）
        const trash = this.add.graphics();
        trash.fillStyle(0x3a3a3a, 1);
        trash.fillRect(f.x, 445, 12, 14);
        trash.fillStyle(0x4a4a4a, 0.5);
        trash.fillRect(f.x + 1, 446, 10, 12);
        trash.fillStyle(0x5a5a5a, 1);
        trash.fillRect(f.x - 1, 444, 14, 3);
      } else if (f.type === 'flower') {
        // 花盆（增加生活气息）
        const flower = this.add.graphics();
        // 花盆
        flower.fillStyle(0x8a5a3a, 1);
        flower.fillRect(f.x, 448, 10, 8);
        flower.fillStyle(0x9a6a4a, 0.5);
        flower.fillRect(f.x + 1, 449, 8, 6);
        // 花朵
        flower.fillStyle(0xff6a8a, 0.8);
        flower.fillCircle(f.x + 5, 445, 3);
        flower.fillStyle(0xff8aa0, 0.6);
        flower.fillCircle(f.x + 3, 443, 2);
        flower.fillCircle(f.x + 7, 444, 2);
        // 叶子
        flower.fillStyle(0x4a8a3a, 0.7);
        flower.fillEllipse(f.x + 2, 447, 4, 2);
        flower.fillEllipse(f.x + 8, 447, 4, 2);
      }
    }
  }

  /** 站台装饰细节：地砖缝隙、落叶、鸽子、水洼 */
  private drawPlatformDetails(): void {
    // 地砖裂缝（更自然）
    const cracks = this.add.graphics();
    cracks.lineStyle(1, 0x2a2525, 0.3);
    for (let i = 0; i < 10; i++) {
      const cx = Phaser.Math.Between(100, W - 50);
      const cy = Phaser.Math.Between(455, 520);
      cracks.lineBetween(cx, cy, cx + Phaser.Math.Between(-20, 20), cy + Phaser.Math.Between(8, 25));
    }

    // 落叶（更多，更自然）
    for (let i = 0; i < 15; i++) {
      const lx = Phaser.Math.Between(50, W - 30);
      const ly = Phaser.Math.Between(450, 530);
      const leaf = this.add.circle(lx, ly, Phaser.Math.Between(1, 3), 0x7a6a2a, 0.5);
      leaf.setAngle(Phaser.Math.Between(0, 360));
    }

    // 鸽子（更真实，带简单动画）
    for (let i = 0; i < 3; i++) {
      const bx = Phaser.Math.Between(400, 800);
      const by = 455 + i * 12;
      const bird = this.add.graphics();
      // 身体
      bird.fillStyle(0x6a5a4a, 1);
      bird.fillEllipse(bx, by, 6, 4);
      // 头
      bird.fillStyle(0x7a6a5a, 1);
      bird.fillCircle(bx + 3, by - 1, 2);
      // 嘴
      bird.fillStyle(0x8a7a5a, 1);
      bird.fillRect(bx + 5, by - 1, 2, 1);
      bird.setDepth(6);
      this.tweens.add({
        targets: bird,
        x: bird.x + Phaser.Math.Between(-100, -50),
        y: bird.y + Phaser.Math.Between(-25, -15),
        alpha: 0,
        duration: Phaser.Math.Between(5000, 7000),
        delay: Phaser.Math.Between(0, 2000),
        onComplete: () => {
          bird.x = Phaser.Math.Between(600, 900);
          bird.y = 455 + i * 12;
          bird.alpha = 1;
          this.tweens.add({ targets: bird, x: bird.x - 70, y: bird.y - 18, alpha: 0, duration: 6000 });
        },
      });
    }

    // 水洼（反射晨光）
    for (let i = 0; i < 3; i++) {
      const wx = Phaser.Math.Between(200, W - 100);
      const wy = Phaser.Math.Between(460, 520);
      const puddle = this.add.graphics();
      puddle.fillStyle(0x4a6a8a, 0.15);
      puddle.fillEllipse(wx, wy, Phaser.Math.Between(15, 30), Phaser.Math.Between(6, 12));
      // 反光
      puddle.fillStyle(0x8abacc, 0.1);
      puddle.fillEllipse(wx - 2, wy - 1, Phaser.Math.Between(8, 15), Phaser.Math.Between(3, 6));
    }
  }

  // ============ 交互物 ============

  /** 绘制新增交互物的视觉元素（自动售货机/旧报纸/公共电话/站台时钟/旧行李箱） */
  private drawNewInteractables(): void {
    // ── 自动售货机（x=150，站台左侧） ──
    const vm = this.add.graphics();
    // 机身
    vm.fillStyle(0x4a5a6a, 1);
    vm.fillRect(140, 420, 24, 30);
    vm.fillStyle(0x3a4a5a, 0.5);
    vm.fillRect(141, 421, 22, 28);
    // 玻璃窗
    vm.fillStyle(0x8ac8e8, 0.3);
    vm.fillRect(143, 423, 18, 14);
    // 饮料瓶（彩色小点）
    const bottleColors = [0xff6a6a, 0x6aff6a, 0x6a6aff, 0xffff6a];
    for (let i = 0; i < 4; i++) {
      vm.fillStyle(bottleColors[i], 0.6);
      vm.fillRect(145 + i * 4, 426, 3, 8);
    }
    // 投币口
    vm.fillStyle(0x2a2a2a, 1);
    vm.fillRect(144, 440, 6, 3);
    // 价格标签（手写感）
    vm.fillStyle(0xffffff, 0.5);
    vm.fillRect(155, 442, 8, 4);

    // ── 旧报纸（x=280，地面） ──
    const paper = this.add.graphics();
    paper.fillStyle(0xd4c8a0, 0.7);
    paper.fillRect(272, 452, 16, 12);
    paper.lineStyle(1, 0x8a7a5a, 0.4);
    paper.strokeRect(272, 452, 16, 12);
    // 文字线条
    for (let i = 0; i < 3; i++) {
      paper.fillStyle(0x5a5a5a, 0.3);
      paper.fillRect(274, 454 + i * 3, 12, 1);
    }

    // ── 公共电话（x=560，墙上） ──
    const phone = this.add.graphics();
    // 电话盒
    phone.fillStyle(0x3a5a8a, 1);
    phone.fillRect(555, 420, 14, 16);
    phone.fillStyle(0x2a4a7a, 0.5);
    phone.fillRect(556, 421, 12, 14);
    // 听筒
    phone.fillStyle(0x2a2a2a, 1);
    phone.fillRect(558, 422, 8, 4);
    phone.fillRect(558, 428, 8, 4);
    // 连接线
    phone.lineStyle(1, 0x1a1a1a, 0.6);
    phone.lineBetween(562, 426, 562, 428);
    // 电话标志
    phone.fillStyle(0xffffff, 0.4);
    phone.fillCircle(562, 432, 2);

    // ── 站台时钟（x=700，杆上） ──
    const clock = this.add.graphics();
    // 时钟杆
    clock.fillStyle(0x4a4a4a, 1);
    clock.fillRect(698, 420, 4, 30);
    // 时钟面
    clock.fillStyle(0xfafaf0, 1);
    clock.fillCircle(700, 418, 10);
    clock.lineStyle(1, 0x3a3a3a, 0.8);
    clock.strokeCircle(700, 418, 10);
    // 指针（停在6:42）
    clock.lineStyle(2, 0x2a2a2a, 1);
    clock.lineBetween(700, 418, 700, 412); // 时针（近似6点位置）
    clock.lineStyle(1, 0x2a2a2a, 1);
    clock.lineBetween(700, 418, 706, 415); // 分针（42分位置）
    // 中心点
    clock.fillStyle(0x2a2a2a, 1);
    clock.fillCircle(700, 418, 1);

    // ── 旧行李箱（x=830，地面角落） ──
    const suitcase = this.add.graphics();
    // 箱体
    suitcase.fillStyle(0x6a4a2a, 1);
    suitcase.fillRect(822, 452, 18, 12);
    suitcase.fillStyle(0x7a5a3a, 0.5);
    suitcase.fillRect(823, 453, 16, 10);
    // 拉链
    suitcase.lineStyle(1, 0x3a3a3a, 0.6);
    suitcase.lineBetween(822, 458, 840, 458);
    // 提手
    suitcase.fillStyle(0x4a3a2a, 1);
    suitcase.fillRect(828, 450, 6, 2);
    // 锁扣
    suitcase.fillStyle(0x8a8a6a, 0.6);
    suitcase.fillRect(829, 457, 4, 2);
  }

  /** 交互物定义：位置 + 交互文本 */
  private readonly interactables: { x: number; y: number; text: string }[] = [
    { x: 500, y: 448, text: '一张旧长椅，木纹已经被岁月磨得光滑。\n（坐了一会儿，想起小时候爷爷也有一把这样的椅子。）' },
    { x: 450, y: 445, text: '花盆里种着几株不知名的小花，\n在晨光里安静地开着。' },
    { x: 620, y: 395, text: '站牌上写着「青禾镇」，\n字迹有些褪色，但还认得出来。' },
    { x: 780, y: 426, text: '站台信息牌，上面的时刻表已经泛黄。\n下一班车……大概不会来了吧。' },
    { x: 20, y: 380, text: '绿皮列车安静地停靠在站台旁。\n车门紧闭，车内空无一人。\n（这就是我坐了一夜的车吗。）' },
    { x: 350, y: 428, text: '站台的路灯还亮着，在晨光里显得有些多余。' },
    { x: 900, y: 428, text: '路灯下有几只鸽子，看到我走近就扑棱棱飞走了。' },
    // ── 新增交互物（车站场景升级） ──
    { x: 150, y: 440, text: '一台老旧的自动售货机，玻璃上蒙着薄薄的灰。\n里面的饮料瓶歪歪斜斜，价格标签还是手写的。\n（城市里早就换成了扫码支付。这里连硬币都还留着。）' },
    { x: 280, y: 450, text: '一张被风吹到地上的旧报纸，日期是三个月前。\n头条写着「青禾镇入选省级传统村落保护名录」。\n（三个月前的消息……这里的时间，好像真的慢一些。）' },
    { x: 560, y: 440, text: '墙上的公共电话，听筒歪斜地挂着。\n拿起来，听筒里传来细微的嗡嗡声。\n（还能打通。但是……我该打给谁呢。）' },
    { x: 700, y: 425, text: '站台上的时钟，指针停在 6:42。\n不知道是昨天停的，还是更早。\n（反正下一班车，也不会准时来吧。）' },
    { x: 830, y: 450, text: '一个被遗忘在角落的旧行李箱，拉链已经生锈。\n不知道是谁留下的，又带走了什么。\n（和我一样，带着一堆东西来到这里。只不过我的还在身上。）' },
  ];

  /** 检测玩家是否靠近某个交互物 */
  private checkInteractable(): void {
    const px = this.player.x;
    const py = this.player.y;
    let nearest: typeof this.nearestInteractable = null;
    let minDist = 50; // 交互检测半径

    for (const obj of this.interactables) {
      const dx = px - obj.x;
      const dy = py - obj.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        nearest = obj;
      }
    }

    this.nearestInteractable = nearest;

    // 显示/隐藏交互提示
    if (nearest && this.canMove && !this.storyDialogue.isOpen()) {
      this.showInteractHint();
    } else {
      this.hideInteractHint();
    }
  }

  /** 显示交互提示（E 键 / 触屏交互按钮） */
  private showInteractHint(): void {
    if (this.interactHintEl) return;
    const hint = document.createElement('div');
    Object.assign(hint.style, {
      position: 'fixed', bottom: '180px', left: '50%',
      transform: 'translateX(-50%)', color: '#ffffff', fontSize: '13px',
      background: 'rgba(0,0,0,0.65)', padding: '6px 16px', borderRadius: '6px',
      zIndex: '400', pointerEvents: 'none',
      textShadow: '0 0 4px rgba(0,0,0,0.8)',
    });
    hint.textContent = isMobileLayout() ? '点击「交互」查看' : '按 [E] 查看';
    document.body.appendChild(hint);
    this.interactHintEl = hint;
  }

  /** 隐藏交互提示 */
  private hideInteractHint(): void {
    if (this.interactHintEl) {
      this.interactHintEl.remove();
      this.interactHintEl = null;
    }
  }

  /** 触发交互：显示对话 */
  private triggerInteract(): void {
    if (!this.nearestInteractable) return;
    if (this.storyDialogue.isOpen()) return;
    this.storyDialogue.play([
      { speaker: '', color: '#aaaaaa', text: this.nearestInteractable.text },
    ]);
    this.hideInteractHint();
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
        this.cameras?.main?.fadeIn(1200, 0, 0, 0);
        this.time.delayedCall(1200, () => {
          if (this.introSkipped) return;
          // 阶段2.5：音量提示（建议打开声音游玩）
          this.showSoundPrompt(() => {
            if (this.introSkipped) return;
            // 阶段3：手机通知
            this.showPhoneNotification(() => {
              if (this.introSkipped) return;
              this.playStationDialogue();
            });
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
    if (this.phoneOverlay) {
      VoiceBank.stop(); // 短信播报停止（跳过开场）
      this.phoneOverlay.remove();
      this.phoneOverlay = null as any;
    }
    // 移除跳过按钮
    const skipBtn = document.getElementById('intro-skip-btn');
    if (skipBtn) skipBtn.remove();

    // 立即淡入（消除黑屏）
    this.cameras?.main?.fadeIn(300, 0, 0, 0);
    // 进入可玩状态
    this.canMove = true;
    // 对话进行中跳过开场：静默关闭对话（reset 不触发 onComplete），
    // 防止对话完成回调再 advanceStory 使 storyStep 越过 arrive_manor → 出站分流误判跳过 gate
    if (this.storyDialogue.isOpen()) this.storyDialogue.reset();
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

    // 模拟列车减速（哐当节奏 + 到站蒸汽声，试玩-14 演出音效）
    let count = 0;
    const clack = (gap = 0.25) => {
      play('train');
      this.time.delayedCall(gap * 1000, () => { if (!this.introSkipped) play('train'); });
    };
    this.trainInterval = setInterval(() => {
      count++;
      if (count === 1) {
        text.textContent = '哐当……哐当……';
        clack();
      }
      else if (count === 2) {
        text.textContent = '哐当…哐当…';
        clack();
      }
      else if (count === 3) {
        text.textContent = '哐当..哐当..';
        clack();
      }
      else if (count === 4) {
        text.textContent = '—— 哧 ——';
        clack(0.18);
        this.time.delayedCall(500, () => { if (!this.introSkipped) play('train_hiss'); });
        if (this.trainInterval) { clearInterval(this.trainInterval); this.trainInterval = null; }
        setTimeout(() => {
          if (this.introSkipped) return;
          overlay.style.opacity = '0';
          setTimeout(() => { overlay.remove(); onDone(); }, 600);
        }, 500);
      }
    }, 600);
  }

  // ============ 音量提示 ============

  /** 建议玩家打开声音游玩（手机通知前） */
  private showSoundPrompt(onDone: () => void): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', left: '50%', top: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(0,0,0,0.85)',
      borderRadius: '12px', border: '1px solid rgba(255,215,0,0.3)',
      padding: '24px 32px',
      zIndex: '650', cursor: 'pointer',
      maxWidth: '320px', fontFamily: 'monospace',
      textAlign: 'center',
      opacity: '0', transition: 'opacity 0.6s',
    });

    const icon = document.createElement('div');
    icon.textContent = '🔊';
    Object.assign(icon.style, { fontSize: '32px', marginBottom: '12px' });

    const title = document.createElement('div');
    title.textContent = '建议打开声音游玩';
    Object.assign(title.style, {
      color: '#ffd700', fontSize: '16px', fontWeight: 'bold', marginBottom: '8px',
    });

    const sub = document.createElement('div');
    sub.textContent = '本游戏包含剧情配音与环境音效';
    Object.assign(sub.style, {
      color: '#aaa', fontSize: '13px', marginBottom: '16px',
    });

    const hint = document.createElement('div');
    hint.textContent = '（点击继续）';
    Object.assign(hint.style, {
      color: '#666', fontSize: '11px',
    });

    el.appendChild(icon);
    el.appendChild(title);
    el.appendChild(sub);
    el.appendChild(hint);
    document.body.appendChild(el);

    requestAnimationFrame(() => { el.style.opacity = '1'; });

    el.addEventListener('click', () => {
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); onDone(); }, 400);
    });
  }

  // ============ 手机通知（v0.7 两页） ============

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
      maxHeight: '70vh', overflowY: 'auto',
      opacity: '0', transition: 'opacity 0.8s',
    });

    // === 第 1 页：裁员 + 中性感谢 ===
    const page1 = document.createElement('div');

    const title1 = document.createElement('div');
    Object.assign(title1.style, { color: '#4a9eff', fontSize: '12px', marginBottom: '8px' });
    title1.textContent = '人事通知';

    const msg1 = document.createElement('div');
    Object.assign(msg1.style, { color: '#7eb8ff', fontSize: '15px', lineHeight: '1.6' });
    msg1.textContent = '因业务流程智能化调整，您的岗位职责将进行重新分配。';

    const msg1b = document.createElement('div');
    Object.assign(msg1b.style, { color: '#7eb8ff', fontSize: '15px', lineHeight: '1.6', marginTop: '8px' });
    msg1b.textContent = '您参与开发的相关成果，将继续服务于智能化系统升级。';

    const hint1 = document.createElement('div');
    Object.assign(hint1.style, { color: '#556', fontSize: '11px', marginTop: '14px', textAlign: 'center' });
    hint1.textContent = '（点击翻页）';

    page1.appendChild(title1);
    page1.appendChild(msg1);
    page1.appendChild(msg1b);
    page1.appendChild(hint1);

    // === 第 2 页：选择权 ===
    const page2 = document.createElement('div');
    page2.style.display = 'none';

    const title2 = document.createElement('div');
    Object.assign(title2.style, { color: '#4a9eff', fontSize: '12px', marginBottom: '8px' });
    title2.textContent = '人事通知 · 职业转换支持计划';

    const msg2 = document.createElement('div');
    Object.assign(msg2.style, { color: '#7eb8ff', fontSize: '14px', lineHeight: '1.7' });
    msg2.textContent =
      '随着智能化系统升级，公司将对部分岗位进行调整。\n\n' +
      '根据员工意愿，您可以选择：\n\n' +
      '1. 转入 AI 协作相关岗位（智能生态部门），继续参与公司业务\n' +
      '2. 接受职业转换支持计划（含离职补偿），自行安排后续\n\n' +
      '请您于 7 个工作日内回复意向。';

    const hint2 = document.createElement('div');
    Object.assign(hint2.style, { color: '#556', fontSize: '11px', marginTop: '14px', textAlign: 'center' });
    hint2.textContent = '（点击关闭）';

    page2.appendChild(title2);
    page2.appendChild(msg2);
    page2.appendChild(hint2);

    this.phoneOverlay.appendChild(page1);
    this.phoneOverlay.appendChild(page2);
    document.body.appendChild(this.phoneOverlay);

    requestAnimationFrame(() => { if (this.phoneOverlay) this.phoneOverlay.style.opacity = '1'; });

    // 短信播报：弹窗出现即朗读第 1 页文案（豆包音色克隆 + 电话感 EQ，与 hr_station_02 同风格）。
    // 无手势被 autoplay 拒绝时由 VoiceBank 全局解锁兜底：玩家点击翻页（pointerdown）自动补播；
    // 翻页不打断播报（短信朗读不阻断阅读），关闭/跳过时 stop。
    VoiceBank.play('', PHONE_NOTIFY_VOICE_TEXT);

    // 两页交互：第 1 页点击 → 翻页；第 2 页点击 → 关闭
    this.phoneOverlay.addEventListener('click', () => {
      if (!this.phoneOverlay) return;
      if (page1.style.display !== 'none') {
        // 翻到第 2 页（并播报第 2 页第一句；无手势被拒时由 VoiceBank 手势解锁兜底补播）
        page1.style.display = 'none';
        page2.style.display = 'block';
        VoiceBank.play('', PHONE_NOTIFY_PAGE2_VOICE_TEXT);
        return;
      }
      // 第 2 页点击 → 关闭
      VoiceBank.stop();
      this.phoneOverlay.style.opacity = '0';
      setTimeout(() => {
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
    hint.textContent = isMobileLayout()
      ? '→ 使用屏幕左下角摇杆移动，向右走出车站'
      : '→ 使用 WASD 移动，向右走出车站';
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

    // 交互物检测
    this.checkInteractable();
    if (this.inputManager.consumeAction() && this.nearestInteractable) {
      this.triggerInteract();
    }

    // 检测到达出口
    if (!this.exitTriggered && this.player.x >= W - 160) {
      this.exitTriggered = true;
      this.canMove = false;
      this.hideInteractHint();
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

  /** 场景销毁时清理 DOM 元素 */
  shutdown(): void {
    this.hideInteractHint();
    const moveHint = document.getElementById('station-move-hint');
    if (moveHint) moveHint.remove();
  }
}
