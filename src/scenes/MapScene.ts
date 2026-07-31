import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { MAP_EXITS, MAP_NAMES } from '../data/exits';
import {
  FARM_AREA,
  TILE_SIZE,
  getCrop,
  getCurrentDay,
  getSeedCount,
  getTileState,
  isInFarmArea,
  setCrop,
  setTileState,
  useSeed,
} from '../data/FarmState';
import { addItem, getItemCount } from '../data/Inventory';
import { formatTime, nextDay as timeNextDay, tick as timeTick } from '../data/TimeSystem';
import { NPC } from '../entities/NPC';
import { getNPCsForScene, refreshSchedule, updateNPCs } from '../systems/NPCSystem';

interface SceneInitData {
  spawn?: { x: number; y: number };
}

/** 农田格子的视觉对象：土地底色 + 作物标记 */
interface TileVisual {
  rect: Phaser.GameObjects.Rectangle;
  crop: Phaser.GameObjects.Ellipse;
}

/**
 * 通用地图场景
 * 一个类承载 4 个区域（农场/小镇/森林/矿洞），通过 scene key 决定加载哪张地图。
 * 玩家走到出口区域 → 切换到目标场景并放置在对应出生点。
 */
export class MapScene extends Phaser.Scene {
  private readonly mapKey: string;
  private player!: Player;
  private wallsLayer!: Phaser.Tilemaps.TilemapLayer;
  private spawn: { x: number; y: number } | undefined;
  // 切换中标记，防止同一帧重复触发
  private transitioning = false;
  // 农田格子视觉对象（仅 farm 场景使用），key = "col,row"
  private tileRects = new Map<string, TileVisual>();
  // E 键：锄地/播种/浇水/收获/睡觉
  private keyE!: Phaser.Input.Keyboard.Key;
  // HUD 文本引用（主 HUD：区域名/天数/种子/萝卜）
  private hudText!: Phaser.GameObjects.Text;
  // HUD 文本引用（左上角时间：Day N / HH:MM）
  private timeText!: Phaser.GameObjects.Text;
  // 上一帧时间戳（ms），用于计算 dt 调用 TimeSystem.tick
  private lastFrameTime = 0;
  // 当前场景中的 NPC 列表（create 时从 NPCSystem 查询并创建 sprite）
  private npcList: NPC[] = [];
  // 对话框（靠近 NPC 按 E 显示，3 秒后消失）
  private dialogueText: Phaser.GameObjects.Text | null = null;
  // 对话框消失计时器
  private dialogueTimer: Phaser.Time.TimerEvent | null = null;

  constructor(key: string) {
    super(key);
    this.mapKey = key;
  }

  init(data: SceneInitData): void {
    this.spawn = data?.spawn;
    this.transitioning = false;
  }

  preload(): void {
    // 加载当前场景对应的 Tiled 地图 JSON
    this.load.tilemapTiledJSON(this.mapKey, `assets/maps/${this.mapKey}.json`);
    // tileset 图片全局共用，已缓存则跳过
    if (!this.textures.exists('tiles')) {
      this.load.image('tiles', 'assets/tiles/placeholder_tileset.png');
    }
  }

  create(): void {
    // 玩家占位纹理（全局共用，已存在则跳过）
    this.createPlaceholderTexture('player', 0x4488ff, 0x224488);

    // 创建 tilemap 并关联 tileset
    const map = this.make.tilemap({ key: this.mapKey });
    const tileset = map.addTilesetImage('placeholder', 'tiles');
    if (!tileset) {
      console.error(`[MapScene:${this.mapKey}] tileset "placeholder" 关联失败`);
      return;
    }

    // 渲染图层
    const groundLayer = map.createLayer('Ground', tileset, 0, 0);
    this.wallsLayer = map.createLayer('Walls', tileset, 0, 0)!;
    groundLayer?.setDepth(0);
    this.wallsLayer.setDepth(1);

    // 碰撞：石墙(gid 3) 与水(gid 4)
    this.wallsLayer.setCollisionBetween(3, 4);

    // 玩家出生点：传入的 spawn 或地图中央
    const sx = this.spawn?.x ?? map.widthInPixels / 2;
    const sy = this.spawn?.y ?? map.heightInPixels / 2;
    this.player = new Player(this, sx, sy);
    this.player.setDepth(10);

    // 玩家与墙体碰撞
    this.physics.add.collider(this.player, this.wallsLayer);

    // 物理世界边界
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // 摄像机：跟随 + 限制在地图内 + 放大2倍
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(2);

    // HUD：当前区域名 + 操作提示（农场额外显示种子数）
    this.hudText = this.add
      .text(this.scale.width / 2, 24, '', {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100);
    this.updateHUD();

    // 时间 HUD（左上角）：Day N / HH:MM
    this.timeText = this.add
      .text(12, 12, '', {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.updateTimeHUD();

    // 记录初始帧时间戳
    this.lastFrameTime = this.time.now;

    // 农场场景：渲染农田格子覆盖层
    if (this.mapKey === 'farm') {
      this.setupFarmTiles();
    }

    // E 键：锄地/播种/浇水/收获/睡觉/对话（所有场景注册）
    this.keyE = this.input.keyboard!.addKey('E');

    // 创建当前场景的 NPC（根据 TimeSystem 时间判定 location）
    this.setupNPCs();
  }

  update(timeMs: number): void {
    // 计算 dt（ms），推进游戏时间；上限 1000ms 防止切后台回来一次性跳太多
    const rawDt = timeMs - this.lastFrameTime;
    const dtMs = Math.max(0, Math.min(rawDt, 1000));
    this.lastFrameTime = timeMs;
    timeTick(dtMs);

    this.player.update();

    // NPC 插值移动（仅对当前场景有 sprite 的 NPC 生效）
    updateNPCs(dtMs);

    // E 键农田交互：锄地/播种（切换中不响应，避免离开农场瞬间误触）
    if (!this.transitioning && Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.tryInteract();
    }

    // 切换中则不再检测出口
    if (this.transitioning) return;

    const exits = MAP_EXITS[this.mapKey] ?? [];
    for (const ex of exits) {
      // 玩家中心点是否落在出口区域内
      if (
        this.player.x >= ex.x &&
        this.player.x <= ex.x + ex.w &&
        this.player.y >= ex.y &&
        this.player.y <= ex.y + ex.h
      ) {
        this.transitioning = true;
        this.scene.start(ex.target, { spawn: ex.spawn });
        return;
      }
    }

    // 每帧刷新时间 HUD（时间在流逝）
    this.updateTimeHUD();
  }

  /**
   * 刷新左上角时间 HUD（Day N / HH:MM）
   */
  updateTimeHUD(): void {
    const t = getCurrentDay();
    this.timeText.setText(`Day ${t}  ${formatTime()}`);
  }

  /**
   * 创建当前场景中的 NPC 精灵
   * 根据 TimeSystem 当前时间判定 NPC location，仅渲染在本场景的 NPC
   */
  private setupNPCs(): void {
    // 先刷新日程（确保 currentLocation 与当前时间一致）
    refreshSchedule();
    this.npcList = getNPCsForScene(this.mapKey);
    for (const npc of this.npcList) {
      // 占位方块（颜色区分），尺寸 12x12
      const sprite = this.add.rectangle(npc.targetX, npc.targetY, 12, 12, npc.color, 1);
      sprite.setDepth(5);
      npc.sprite = sprite;
      // 名字标签
      const label = this.add.text(npc.targetX, npc.targetY - 14, npc.name, {
        fontFamily: 'Arial',
        fontSize: '10px',
        color: '#ffffff',
      });
      label.setOrigin(0.5).setDepth(6).setScrollFactor(1);
      npc.label = label;
      // 立即吸附到目标位置（避免从原点滑过来）
      npc.snapToTarget();
    }
  }

  /**
   * 显示对话框（靠近 NPC 按 E 触发，3 秒后自动消失）
   */
  private showDialogue(npc: NPC): void {
    // 已有对话框则先清除
    if (this.dialogueText) {
      this.dialogueText.destroy();
      this.dialogueText = null;
    }
    if (this.dialogueTimer) {
      this.dialogueTimer.remove();
      this.dialogueTimer = null;
    }
    const text = `${npc.name}：${npc.dialogue}`;
    this.dialogueText = this.add
      .text(this.player.x, this.player.y - 24, text, {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(200);
    this.dialogueTimer = this.time.delayedCall(3000, () => {
      if (this.dialogueText) {
        this.dialogueText.destroy();
        this.dialogueText = null;
      }
      this.dialogueTimer = null;
    });
  }

  /**
   * 渲染农田可耕区域的格子覆盖层
   * 状态非 empty 的格子显示深棕色方块（覆盖在 soil 瓦片之上）
   * 场景切换回来时，从全局 FarmState 恢复已锄地块的显示
   */
  private setupFarmTiles(): void {
    for (let r = FARM_AREA.row0; r <= FARM_AREA.row1; r++) {
      for (let c = FARM_AREA.col0; c <= FARM_AREA.col1; c++) {
        const cx = c * TILE_SIZE + TILE_SIZE / 2;
        const cy = r * TILE_SIZE + TILE_SIZE / 2;
        // 土地底色方块（覆盖在 soil 瓦片上）
        const rect = this.add.rectangle(cx, cy, TILE_SIZE, TILE_SIZE, 0x6b4423, 0.8);
        rect.setDepth(2);
        // 作物标记（绿色小椭圆，planted/watered/grown 时显示）
        const crop = this.add.ellipse(cx, cy, 6, 6, 0x4caf50, 0.95);
        crop.setDepth(3);
        const visual: TileVisual = { rect, crop };
        // 从全局状态恢复显示（场景切换回来时保留已锄/已种地块）
        this.updateTileVisual(c, r, visual);
        this.tileRects.set(`${c},${r}`, visual);
      }
    }
  }

  /**
   * 根据土地状态刷新单格视觉
   * empty: 全部隐藏
   * tilled: 深棕土地，无作物
   * watered: 湿润深棕土地 + 作物（若已种）
   * planted/grown: 土地 + 作物标记（grown 更大更深）
   */
  private updateTileVisual(col: number, row: number, visual: TileVisual): void {
    const state = getTileState(col, row);
    if (state === 'empty') {
      visual.rect.setVisible(false);
      visual.crop.setVisible(false);
      return;
    }
    visual.rect.setVisible(true);
    // 浇水后土地更深更湿
    visual.rect.setFillStyle(
      state === 'watered' ? 0x3d2817 : 0x6b4423,
      0.85
    );
    // 作物标记：planted/watered/grown 显示幼苗
    const hasCrop = state === 'planted' || state === 'watered' || state === 'grown';
    visual.crop.setVisible(hasCrop);
    if (hasCrop) {
      if (state === 'grown') {
        visual.crop.setSize(11, 11);
        visual.crop.setFillStyle(0x2e7d32, 0.95);
      } else {
        visual.crop.setSize(6, 6);
        visual.crop.setFillStyle(0x4caf50, 0.95);
      }
    }
  }

  /**
   * 刷新 HUD 文本（区域名 + 天数 + 操作提示，农场额外显示种子数）
   */
  private updateHUD(): void {
    const name = MAP_NAMES[this.mapKey] ?? this.mapKey;
    const day = `第${getCurrentDay()}天`;
    if (this.mapKey === 'farm') {
      this.hudText.setText(
        `${name} | ${day} | WASD/E交互 | 种子:${getSeedCount()} 萝卜:${getItemCount('radish')} | 出口切换`
      );
    } else {
      this.hudText.setText(`${name} | ${day} | WASD 移动 | 出口切换`);
    }
  }

  /**
   * 刷新所有农田格子的视觉（public，供 debug.nextDay 成长判定后调用）
   * 遍历 tileRects 重新读取 FarmState 状态并刷新显示
   */
  refreshFarmVisual(): void {
    for (const [key, visual] of this.tileRects) {
      const [col, row] = key.split(',').map(Number);
      this.updateTileVisual(col, row, visual);
    }
    this.updateHUD();
  }

  /**
   * E 键统一交互入口：
   *   0. 若玩家靠近 NPC（所有场景）→ 显示对话
   *   1. 若玩家在农场睡觉区域内 → 尝试睡觉（任何时间都可以，不强制到 22:00）
   *   2. 否则 → 农田交互（锄地/播种/浇水/收获）
   */
  private tryInteract(): void {
    // 0. 优先检测靠近 NPC（所有场景）：距离 < 24 像素则显示对话
    for (const npc of this.npcList) {
      if (!npc.sprite) continue;
      const dx = this.player.x - npc.sprite.x;
      const dy = this.player.y - npc.sprite.y;
      if (dx * dx + dy * dy < 24 * 24) {
        this.showDialogue(npc);
        return;
      }
    }

    if (this.mapKey !== 'farm') return;

    // 1. 睡觉点检测：农场左下方木屋区域（瓦片 col 2-4, row 13-14）
    // 进入该区域任意位置按 E 都可睡觉
    const pc = Math.floor(this.player.x / TILE_SIZE);
    const pr = Math.floor(this.player.y / TILE_SIZE);
    if (pc >= 2 && pc <= 4 && pr >= 13 && pr <= 14) {
      this.trySleep();
      return;
    }

    // 2. 农田交互：根据面前格子状态自动判断锄地/播种/浇水/收获
    this.tryFarmInteract();
  }

  /**
   * 睡觉：TimeSystem.nextDay() → FarmState.advanceDay()
   * 时间重置为次日 06:00，作物成长结算
   * 同时刷新 NPC 日程（次日 06:00 NPC 回到 farm 出生点）
   */
  private trySleep(): void {
    timeNextDay();
    // 刷新农田视觉（成长后 grown 作物变大）和 HUD
    this.refreshFarmVisual();
    // 刷新 NPC 日程：次日 06:00，所有 NPC 应在 farm
    // 当前在 farm 场景，重建本场景 NPC（其他场景进入时会自动 setupNPCs）
    this.rebuildNPCs();
  }

  /**
   * 重建当前场景的 NPC（睡觉/时间跳变后调用）
   * 销毁旧 sprite，按新日程重新创建
   */
  rebuildNPCs(): void {
    for (const npc of this.npcList) {
      if (npc.sprite) {
        npc.sprite.destroy();
        npc.sprite = null;
      }
      if (npc.label) {
        npc.label.destroy();
        npc.label = null;
      }
    }
    this.setupNPCs();
  }

  /**
   * 农田交互（按 Player.facing 决定面前格子）：
   *   empty   → tilled   （锄地）
   *   tilled  → planted  （播种，消耗一颗萝卜种子，记录 CropData）
   *   planted → watered  （浇水，标记 watered=true）
   *   grown   → tilled   （收获，土地保留可重新播种，清除作物，获得萝卜 +1）
   */
  private tryFarmInteract(): void {
    // 玩家所在瓦片坐标
    const pc = Math.floor(this.player.x / TILE_SIZE);
    const pr = Math.floor(this.player.y / TILE_SIZE);
    // 面前一格坐标
    let tc = pc;
    let tr = pr;
    switch (this.player.facing) {
      case 'up':
        tr = pr - 1;
        break;
      case 'down':
        tr = pr + 1;
        break;
      case 'left':
        tc = pc - 1;
        break;
      case 'right':
        tc = pc + 1;
        break;
    }
    // 必须在农田可耕区域内
    if (!isInFarmArea(tc, tr)) return;

    const state = getTileState(tc, tr);
    if (state === 'empty') {
      // 锄地：空地 → 耕地
      setTileState(tc, tr, 'tilled');
    } else if (state === 'tilled') {
      // 播种：耕地 → 已种，消耗一颗萝卜种子
      if (!useSeed()) return; // 种子不足，静默不处理
      setTileState(tc, tr, 'planted');
      setCrop(tc, tr, { cropType: 'radish', plantDay: getCurrentDay(), watered: false });
    } else if (state === 'planted') {
      // 浇水：已种 → 已浇水（成长前置条件）
      setTileState(tc, tr, 'watered');
      const crop = getCrop(tc, tr);
      if (crop) setCrop(tc, tr, { ...crop, watered: true });
    } else if (state === 'grown') {
      // 收获：成熟 → 耕地（保留已耕状态，可重新播种），清除作物，获得萝卜 +1
      setTileState(tc, tr, 'tilled');
      setCrop(tc, tr, undefined);
      addItem('radish', 1);
    } else {
      // watered 已浇水未成熟，暂不处理
      return;
    }

    // 刷新该格视觉 + HUD 种子数
    const visual = this.tileRects.get(`${tc},${tr}`);
    if (visual) this.updateTileVisual(tc, tr, visual);
    this.updateHUD();
  }

  /**
   * 生成占位纹理：实心方块 + 边框（无美术资源阶段的兜底）
   */
  private createPlaceholderTexture(
    key: string,
    fillColor: number,
    borderColor: number
  ): void {
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(fillColor);
    g.fillRect(0, 0, 16, 16);
    g.lineStyle(2, borderColor);
    g.strokeRect(0, 0, 16, 16);
    g.generateTexture(key, 16, 16);
    g.destroy();
  }
}
