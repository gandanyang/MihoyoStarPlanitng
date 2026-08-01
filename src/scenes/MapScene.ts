import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { MAP_EXITS, MAP_NAMES } from '../data/exits';
import { isMobileLayout } from '../config';
import {
  FARM_AREA,
  TILE_SIZE,
  getCrop,
  getSeedCount,
  getTileState,
  isInFarmArea,
  setCrop,
  setTileState,
  useSeed,
} from '../data/FarmState';
import { addItem, getItemCount } from '../data/Inventory';
import { formatTime, getTime, nextDay as timeNextDay, tick as timeTick } from '../data/TimeSystem';
import { getCoins } from '../data/Economy';
import { addXp, getLevel, getXp, getXpToNext, setOnLevelUp } from '../data/FarmProgress';
import { NPC } from '../entities/NPC';
import { getNPCsForScene, refreshSchedule, updateNPCs } from '../systems/NPCSystem';
import { collectShard, getElderDialogue, getQuestObjective, getQuestState } from '../systems/QuestSystem';
import { InputManager } from '../systems/InputManager';
import { TouchControls } from '../systems/TouchControls';
import { ShopPanel } from '../ui/ShopPanel';
import { BackpackPanel } from '../ui/BackpackPanel';
import { hasSave, load, apply, save, getLastIncompatibleVersion, clearIncompatibleVersion } from '../systems/SaveSystem';
import { play } from '../systems/AudioSystem';

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
  // 模块级 beforeunload 回调引用（避免重复注册）
  private static _beforeUnload: (() => void) | null = null;

  private readonly mapKey: string;
  private player!: Player;
  private wallsLayer!: Phaser.Tilemaps.TilemapLayer;
  private spawn: { x: number; y: number } | undefined;
  // 切换中标记，防止同一帧重复触发
  private transitioning = false;
  // 农田格子视觉对象（仅 farm 场景使用），key = "col,row"
  private tileRects = new Map<string, TileVisual>();
  // 输入管理器（统一键盘/触屏输入，Player 和交互共用）
  private inputManager!: InputManager;
  // 触屏控件（摇杆+交互按钮，DOM 单例，PC 和手机都显示）
  private touchControls!: TouchControls;
  // 商店面板（Phase 0.2，DOM 覆盖层，非独立场景）
  private shopPanel!: ShopPanel;
  // 背包面板（Phase 0.25，DOM 覆盖层，B 键开启）
  private backpackPanel!: BackpackPanel;
  // DOM HUD 元素（替代 Phaser 文本，避免 scrollFactor + zoom 渲染问题）
  private hudDom!: HTMLDivElement;
  private hudTimeDom!: HTMLDivElement;
  private hudAreaDom!: HTMLDivElement;
  private hudQuestDom!: HTMLDivElement;
  // XP 经验条 DOM 元素
  private xpBarFill!: HTMLDivElement;
  private xpBarLabel!: HTMLDivElement;
  // 农田选中高亮（淡黄色边框，显示当前面向的格子）
  private targetHighlight!: Phaser.GameObjects.Rectangle;
  // 上一帧时间戳（ms），用于计算 dt 调用 TimeSystem.tick
  private lastFrameTime = 0;
  // 当前场景中的 NPC 列表（create 时从 NPCSystem 查询并创建 sprite）
  private npcList: NPC[] = [];
  // 对话框（靠近 NPC 按 E 显示，3 秒后消失）
  private dialogueText: Phaser.GameObjects.Text | null = null;
  // 对话框消失计时器
  private dialogueTimer: Phaser.Time.TimerEvent | null = null;
  // 森林采集点：星之碎片（accepted 状态时显示，采集后销毁）
  private shardSprite: Phaser.GameObjects.Ellipse | null = null;

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
    // tileset 图片：每个地图使用自己的主题瓦片
    // 移除旧瓦片纹理（切换场景时避免纹理冲突）
    if (this.textures.exists('tiles')) {
      this.textures.remove('tiles');
    }
    this.load.image('tiles', `assets/tiles/${this.mapKey}_tileset.png?v=6`);
    // 玩家 spritesheet（4方向×4帧 run 动画，每帧 32x32，显示时缩放 0.5 与 16x16 瓦片协调）
    if (!this.textures.exists('player')) {
      this.load.spritesheet('player', 'assets/sprites/player.png', { frameWidth: 32, frameHeight: 32 });
    }
    // NPC 贴图（3 张 32x32 单帧，显示时缩放 0.5 与 16x16 瓦片协调）
    if (!this.textures.exists('npc_elder')) this.load.image('npc_elder', 'assets/sprites/npc_elder.png');
    if (!this.textures.exists('npc_merchant')) this.load.image('npc_merchant', 'assets/sprites/npc_merchant.png');
    if (!this.textures.exists('npc_girl')) this.load.image('npc_girl', 'assets/sprites/npc_girl.png');
  }

  create(): void {
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

    // 存档恢复：仅在农场场景首次进入时检查
    // 若存档存在则加载数据，若玩家上次在其他场景则切换过去
    if (this.mapKey === 'farm' && hasSave() && !this.spawn) {
      const saveData = load();
      if (saveData) {
        apply(saveData);
        if (saveData.player.scene !== 'farm') {
          this.scene.start(saveData.player.scene, {
            spawn: { x: saveData.player.x, y: saveData.player.y },
          });
          return;
        }
        // 农场场景：直接设置出生点
        this.spawn = { x: saveData.player.x, y: saveData.player.y };
      } else {
        // 版本不兼容：显示提示，清除旧存档
        const oldVer = getLastIncompatibleVersion();
        if (oldVer) {
          this.showDialogueText(
            `存档版本不兼容（v${oldVer}→v0.3），已自动重置。`,
          );
          clearIncompatibleVersion();
        }
      }
    }

    // 输入管理器（统一键盘/触屏输入）
    this.inputManager = new InputManager(this.input.keyboard!);

    // 玩家出生点：传入的 spawn 或地图中央
    const sx = this.spawn?.x ?? map.widthInPixels / 2;
    const sy = this.spawn?.y ?? map.heightInPixels / 2;
    this.player = new Player(this, sx, sy, this.inputManager);
    this.player.setDepth(10);

    // 玩家与墙体碰撞
    this.physics.add.collider(this.player, this.wallsLayer);

    // 物理世界边界
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // 摄像机：跟随 + 限制在地图内 + 放大2倍
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(2);

    // DOM HUD 覆盖层（扛 zoom + scrollFactor 兼容问题，和 ShopPanel 一样走 DOM）
    // 先移除旧 HUD（场景切换时避免 DOM 泄漏）
    const oldHud = document.getElementById('hud-overlay');
    if (oldHud) oldHud.remove();

    const container = document.getElementById('game-container')!;
    this.hudDom = document.createElement('div');
    this.hudDom.id = 'hud-overlay';
    this.hudDom.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:0;pointer-events:none;z-index:5;font-family:Arial,sans-serif';
    container.appendChild(this.hudDom);

    // 左上角：时间 + 经验条
    this.hudTimeDom = document.createElement('div');
    this.hudTimeDom.style.cssText =
      'position:absolute;top:4px;left:8px;color:#fff;font-size:13px;text-shadow:1px 1px 0 #000';
    this.hudDom.appendChild(this.hudTimeDom);

    // XP 经验条容器（时间下方）
    const xpBar = document.createElement('div');
    xpBar.style.cssText =
      'position:absolute;top:22px;left:8px;width:180px;height:8px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);border-radius:2px;overflow:hidden';
    this.hudDom.appendChild(xpBar);

    this.xpBarFill = document.createElement('div');
    this.xpBarFill.style.cssText =
      'width:0%;height:100%;background:linear-gradient(90deg,#4caf50,#8bc34a);transition:width 0.3s';
    xpBar.appendChild(this.xpBarFill);

    this.xpBarLabel = document.createElement('div');
    this.xpBarLabel.style.cssText =
      'position:absolute;top:20px;left:192px;color:#ffe082;font-size:10px;text-shadow:1px 1px 0 #000;white-space:nowrap';
    this.hudDom.appendChild(this.xpBarLabel);

    // 中上：区域名 + 操作提示
    this.hudAreaDom = document.createElement('div');
    this.hudAreaDom.style.cssText =
      'position:absolute;top:24px;left:50%;transform:translateX(-50%);color:#fff;font-size:13px;text-shadow:1px 1px 0 #000;white-space:nowrap';
    this.hudDom.appendChild(this.hudAreaDom);

    // 右上：任务目标
    this.hudQuestDom = document.createElement('div');
    this.hudQuestDom.style.cssText =
      'position:absolute;top:4px;right:8px;color:#ffe082;font-size:12px;text-shadow:1px 1px 0 #000;text-align:right';
    this.hudDom.appendChild(this.hudQuestDom);

    this.updateHUD();

    // 记录初始帧时间戳
    this.lastFrameTime = this.time.now;

    // 农场场景：渲染农田格子覆盖层
    if (this.mapKey === 'farm') {
      this.setupFarmTiles();

      // 农田选中高亮（淡黄色边框，跟随玩家面向的格子）
      this.targetHighlight = this.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE, 0xfff176, 0.15);
      this.targetHighlight.setStrokeStyle(1, 0xfff176, 0.7);
      this.targetHighlight.setDepth(8);
      this.targetHighlight.setVisible(false);
    }

    // 创建当前场景的 NPC（根据 TimeSystem 时间判定 location）
    this.setupNPCs();

    // 森林场景：创建星之碎片采集点（仅 accepted 状态显示）
    if (this.mapKey === 'forest') {
      this.setupShard();
    }

    // 触屏控件（摇杆+交互按钮，DOM 单例，PC 和手机都显示）
    this.touchControls = new TouchControls(this, this.inputManager);
    // 商店面板（DOM 覆盖层；数据变化时刷新 HUD 金币显示；关店时清理输入残留）
    this.shopPanel = new ShopPanel(
      () => this.updateHUD(),
      () => {
        // 关店清理：丢弃开店期间残留的 E 键，防止下帧立即重开商店
        this.inputManager.clearAction();
        // 重置帧计时，防止关店后时间跳跃（lastFrameTime 仍停在开店前）
        this.lastFrameTime = performance.now();
      },
    );

    // 背包面板（DOM 覆盖层；关包时清理 B 键残留）
    this.backpackPanel = new BackpackPanel(() => {
      this.inputManager.clearAction();
      this.lastFrameTime = performance.now();
    });
    // 农场升级通知（升级时显示气泡提示）
    setOnLevelUp((newLevel: number) => {
      this.showDialogueText(`农场升级！Lv.${newLevel}`);
      this.updateTimeHUD();
    });

    // 离开页面前自动存档（beforeunload，只注册一次，后续场景切换复用）
    if (MapScene._beforeUnload) {
      window.removeEventListener('beforeunload', MapScene._beforeUnload);
    }
    MapScene._beforeUnload = () => {
      if (this.player && this.player.active) {
        save({ x: this.player.x, y: this.player.y, scene: this.mapKey, facing: this.player.facing });
      }
    };
    window.addEventListener('beforeunload', MapScene._beforeUnload);
  }

  update(timeMs: number): void {
    // 商店打开：冻结时间/玩家移动/NPC/交互，只响应关闭
    // 关闭方式：E/空格/回车（consumeAction）或 Esc（ShopPanel DOM 监听）
    if (this.shopPanel.isOpen()) {
      // 冻结玩家物理：防止开店前残留的速度让角色在商店界面背后滑动
      this.player.setVelocity(0, 0);
      if (this.inputManager.consumeAction()) {
        this.shopPanel.close();
      }
      return;
    }

    // 背包打开：冻结时间/玩家移动/NPC/交互，只响应关闭
    if (this.backpackPanel.isOpen()) {
      this.player.setVelocity(0, 0);
      // B 键关闭
      if (Phaser.Input.Keyboard.JustDown(this.inputManager.keyB)) {
        this.backpackPanel.close();
      }
      return;
    }

    // B 键打开背包（仅在未与其他面板交互时）
    if (Phaser.Input.Keyboard.JustDown(this.inputManager.keyB)) {
      this.inputManager.clearAction();
      this.backpackPanel.open();
      return;
    }

    // 计算 dt（ms），推进游戏时间；上限 1000ms 防止切后台回来一次性跳太多
    const rawDt = timeMs - this.lastFrameTime;
    const dtMs = Math.max(0, Math.min(rawDt, 1000));
    this.lastFrameTime = timeMs;
    timeTick(dtMs);

    // 每帧更新输入（从键盘读移动向量到 moveX/moveY）
    this.inputManager.update();
    // 触屏摇杆拖动时覆盖键盘值（在 inputManager.update 之后、player.update 之前）
    this.touchControls.update();

    this.player.update();

    // NPC 插值移动（仅对当前场景有 sprite 的 NPC 生效）
    updateNPCs(dtMs);

    // 农田选中高亮：跟随玩家面向的格子（仅农场）
    this.updateTargetHighlight();

    // 交互：消费一次动作输入（按一次只触发一次，不会连发）
    if (!this.transitioning && this.inputManager.consumeAction()) {
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
   * 刷新左上角时间 + 经验 HUD（DOM）
   */
  updateTimeHUD(): void {
    const t = getTime().day;
    const timeStr = isMobileLayout() ? formatTime() : `Day ${t}  ${formatTime()}`;
    this.hudTimeDom.textContent = timeStr;

    // 经验条（仅农场场景有 DOM 元素）
    if (!this.xpBarFill) return;
    const lv = getLevel();
    const xp = getXp();
    const next = getXpToNext();
    if (next <= 0) {
      this.xpBarFill.style.width = '100%';
      this.xpBarLabel.textContent = `Lv.${lv} MAX`;
    } else {
      const total = xp + next;
      const pct = Math.round((xp / total) * 100);
      this.xpBarFill.style.width = `${pct}%`;
      this.xpBarLabel.textContent = `Lv.${lv}  ${xp}/${total}`;
    }
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
      // NPC 精灵贴图（32x32，缩放 0.5 后显示为 16x16，与瓦片协调）
      const sprite = this.add.image(npc.targetX, npc.targetY, npc.textureKey);
      sprite.setScale(0.5);
      sprite.setDepth(5);
      npc.sprite = sprite;
      // 名字标签（32x32 缩放 0.5 后，标签上移 10 像素贴头顶）
      const label = this.add.text(npc.targetX, npc.targetY - 10, npc.name, {
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
   * 创建森林星之碎片采集点
   * 仅任务状态为 accepted 时显示（紫色发光椭圆）
   * 采集后销毁
   */
  private setupShard(): void {
    if (getQuestState() !== 'accepted') return;
    // 采集点位置：森林 (20, 10) 瓦片中心
    const cx = 20 * TILE_SIZE + TILE_SIZE / 2;
    const cy = 10 * TILE_SIZE + TILE_SIZE / 2;
    this.shardSprite = this.add.ellipse(cx, cy, 14, 14, 0xb388ff, 1);
    this.shardSprite.setDepth(5);
  }

  /**
   * 刷新任务目标 HUD（右上角）
   */
  updateQuestHUD(): void {
    this.hudQuestDom.textContent = `任务：${getQuestObjective()}`;
  }

  /**
   * 显示自定义文字对话框（3 秒后自动消失）
   * 用于任务对话/采集提示等非 NPC 固定台词
   * PC：玩家头顶跟随（不变）
   * 移动端：屏幕底部固定居中（setScrollFactor 0），避开摇杆/按钮
   */
  private showDialogueText(text: string): void {
    if (this.dialogueText) {
      this.dialogueText.destroy();
      this.dialogueText = null;
    }
    if (this.dialogueTimer) {
      this.dialogueTimer.remove();
      this.dialogueTimer = null;
    }
    const mobile = isMobileLayout();
    // 移动端：屏幕底部居中；PC：玩家头顶跟随
    const x = mobile ? this.scale.width / 2 : this.player.x;
    const y = mobile ? this.scale.height - 180 : this.player.y - 24;
    const originX = 0.5;
    const originY = mobile ? 1 : 0.5;
    const scrollFactor = mobile ? 0 : 1;
    const fontSize = mobile ? '14px' : '12px';
    const wrapWidth = mobile ? this.scale.width - 80 : 300;

    this.dialogueText = this.add
      .text(x, y, text, {
        fontFamily: 'Arial',
        fontSize,
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 6, y: 4 },
        wordWrap: { width: wrapWidth },
      })
      .setOrigin(originX, originY)
      .setScrollFactor(scrollFactor)
      .setDepth(200);
    this.dialogueTimer = this.time.delayedCall(4000, () => {
      if (this.dialogueText) {
        this.dialogueText.destroy();
        this.dialogueText = null;
      }
      this.dialogueTimer = null;
    });
  }

  /**
   * 显示对话框（靠近 NPC 按 E 触发，3 秒后自动消失）
   * PC：玩家头顶跟随（不变）
   * 移动端：屏幕底部固定居中（setScrollFactor 0），避开摇杆/按钮
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
    const mobile = isMobileLayout();
    const text = `${npc.name}：${npc.dialogue}`;
    // 移动端：屏幕底部居中；PC：玩家头顶跟随
    const x = mobile ? this.scale.width / 2 : this.player.x;
    const y = mobile ? this.scale.height - 180 : this.player.y - 24;
    const originX = 0.5;
    const originY = mobile ? 1 : 0.5;
    const scrollFactor = mobile ? 0 : 1;
    const fontSize = mobile ? '14px' : '12px';
    const wrapWidth = mobile ? this.scale.width - 80 : 300;

    this.dialogueText = this.add
      .text(x, y, text, {
        fontFamily: 'Arial',
        fontSize,
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 6, y: 4 },
        wordWrap: { width: wrapWidth },
      })
      .setOrigin(originX, originY)
      .setScrollFactor(scrollFactor)
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
   * 刷新 HUD 文本（区域名 + 天数 + 金币 + 操作提示，农场额外显示种子/萝卜）
   * PC：完整单行（含操作提示 WASD/E/出口切换）
   * 移动端：精简两行，删除操作提示（摇杆+按钮已是教学）
   *   农场：第一行 区域名+天数，第二行 种子/萝卜/金币
   *   其他：第一行 区域名+天数，第二行 金币
   */
  private updateHUD(): void {
    const name = MAP_NAMES[this.mapKey] ?? this.mapKey;
    const day = `第${getTime().day}天`;
    const coins = `金币:${getCoins()}`;
    const lv = `Lv.${getLevel()}`;
    if (isMobileLayout()) {
      if (this.mapKey === 'farm') {
        this.hudAreaDom.textContent = `${name} ${day} ${lv} | 种子${getSeedCount()} 萝卜${getItemCount('radish')} ${coins}`;
      } else {
        this.hudAreaDom.textContent = `${name} ${day} ${lv} | ${coins}`;
      }
    } else {
      if (this.mapKey === 'farm') {
        this.hudAreaDom.textContent =
          `${name} | ${day} | ${lv} | WASD/E交互 | 种子:${getSeedCount()} 萝卜:${getItemCount('radish')} | ${coins} | 出口切换`;
      } else {
        this.hudAreaDom.textContent = `${name} | ${day} | ${lv} | WASD 移动 | ${coins} | 出口切换`;
      }
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
   * 交互入口（动作键触发，consumeAction 消费一次）：
   *   0. 若玩家靠近 NPC（所有场景）→ 显示对话
   *   0.5 森林靠近星之碎片（accepted 状态）→ 采集
   *   1. 若玩家在农场睡觉区域内 → 尝试睡觉（任何时间都可以，不强制到 22:00）
   *   2. 否则 → 农田交互（锄地/播种/浇水/收获）
   */
  private tryInteract(): void {
    // 1. 睡觉点检测（农场专有，优先于 NPC 交互，避免 NPC 站在入口挡住）
    if (this.mapKey === 'farm') {
      const pc = Math.floor(this.player.x / TILE_SIZE);
      const pr = Math.floor(this.player.y / TILE_SIZE);
      if (pc >= 2 && pc <= 4 && pr >= 12 && pr <= 14) {
        this.trySleep();
        return;
      }
    }

    // 2. 优先检测靠近 NPC（所有场景）：取交互范围内最近的一个
    // 注意：不能用数组顺序取第一个，否则多个 NPC 靠近时 elder 永远先被触发
    let nearest: NPC | null = null;
    let nearestDist = 24 * 24;
    for (const npc of this.npcList) {
      if (!npc.sprite) continue;
      const dx = this.player.x - npc.sprite.x;
      const dy = this.player.y - npc.sprite.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestDist) {
        nearestDist = d2;
        nearest = npc;
      }
    }
    if (nearest) {
      // 村长对话由 QuestSystem 根据任务状态决定（含接受/交付推进）
      if (nearest.id === 'elder') {
        this.showDialogueText(getElderDialogue());
        this.updateQuestHUD();
      } else if (nearest.id === 'shopkeeper') {
        // 商人：打开商店面板（Phase 0.2）；先清空本次 E 键队列，防止开门即关
        this.inputManager.clearAction();
        this.shopPanel.open();
      } else {
        this.showDialogue(nearest);
      }
      return;
    }

    // 0.5 森林采集点：accepted 状态靠近星之碎片 E 键采集
    if (this.mapKey === 'forest' && this.shardSprite && this.shardSprite.visible) {
      const dx = this.player.x - this.shardSprite.x;
      const dy = this.player.y - this.shardSprite.y;
      if (dx * dx + dy * dy < 24 * 24) {
        collectShard();
        this.shardSprite.destroy();
        this.shardSprite = null;
        addItem('star_shard', 1);
        this.showDialogueText('采集到「星之碎片」！返回村长交付任务。');
        this.updateQuestHUD();
        return;
      }
    }

    if (this.mapKey !== 'farm') return;

    // 农田交互：根据面前格子状态自动判断锄地/播种/浇水/收获
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
    this.rebuildNPCs();
    // 睡觉后自动存档
    save({ x: this.player.x, y: this.player.y, scene: this.mapKey, facing: this.player.facing });
    this.showDialogueText('已保存 Zzz...');
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
   * 更新农田选中高亮（每帧跟随玩家面向的格子）
   * 仅农场场景生效，非农场或目标不在耕地区时隐藏
   */
  private updateTargetHighlight(): void {
    if (this.mapKey !== 'farm' || !this.targetHighlight) return;
    const pc = Math.floor(this.player.x / TILE_SIZE);
    const pr = Math.floor(this.player.y / TILE_SIZE);
    let tc = pc;
    let tr = pr;
    switch (this.player.facing) {
      case 'up': tr = pr - 1; break;
      case 'down': tr = pr + 1; break;
      case 'left': tc = pc - 1; break;
      case 'right': tc = pc + 1; break;
    }
    if (!isInFarmArea(tc, tr)) {
      this.targetHighlight.setVisible(false);
      return;
    }
    this.targetHighlight.setVisible(true);
    this.targetHighlight.setPosition(tc * TILE_SIZE + TILE_SIZE / 2, tr * TILE_SIZE + TILE_SIZE / 2);
  }

  /**
   * 农田交互（按 Player.facing 决定面前格子）：
   *   empty   → tilled   （锄地）
   *   tilled  → planted  （播种，消耗一颗萝卜种子，记录 CropData）
   *   planted → watered  （浇水，标记 watered=true）
   *   grown   → tilled   （收获，土地保留可重新播种，清除作物，获得萝卜 +1）
   *   watered → 暂不处理（等待次日成长判定）
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
      play('hoe');
    } else if (state === 'tilled') {
      // 播种：耕地 → 已种，消耗一颗萝卜种子
      if (!useSeed()) return; // 种子不足，静默不处理
      setTileState(tc, tr, 'planted');
      setCrop(tc, tr, { cropType: 'radish', plantDay: getTime().day, watered: false });
      addXp(3, 'plant');
      play('plant');
    } else if (state === 'planted') {
      // 浇水：已种 → 已浇水（成长前置条件）
      setTileState(tc, tr, 'watered');
      const crop = getCrop(tc, tr);
      if (crop) setCrop(tc, tr, { ...crop, watered: true });
      addXp(1, 'water');
      play('water');
    } else if (state === 'grown') {
      // 收获：成熟 → 耕地（保留已耕状态，可重新播种），清除作物，获得萝卜 +1
      setTileState(tc, tr, 'tilled');
      setCrop(tc, tr, undefined);
      addItem('radish', 1);
      addXp(10, 'harvest');
      play('harvest');
    } else {
      // watered 已浇水未成熟，暂不处理
      return;
    }

    // 刷新该格视觉 + HUD 种子数
    const visual = this.tileRects.get(`${tc},${tr}`);
    if (visual) this.updateTileVisual(tc, tr, visual);
    this.updateHUD();
  }
}
