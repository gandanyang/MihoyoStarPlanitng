import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { MAP_EXITS, MAP_NAMES } from '../data/exits';
import { isMobileLayout, isTouchDevice } from '../config';
import {
  FARM_AREA,
  TILE_SIZE,
  CropType,
  CROP_TYPES,
  CROP_DEFS,
  getCrop,
  getTileState,
  isInFarmArea,
  setCrop,
  setTileState,
  FARM_TREE_POSITIONS,
  TREE_MAX_HEALTH,
  TREE_REFRESH_INTERVAL,
  initTrees,
  getTree,
  chopTree,
  refreshStumps,
  getAllCropEntries,
} from '../data/FarmState';
import { isRestored, markRestored } from '../data/FarmRestore';
import { addItem, getItemCount, itemIconHtml } from '../data/Inventory';
import { formatTime, getTime, nextDay as timeNextDay, tick as timeTick } from '../data/TimeSystem';
import { getCoins } from '../data/Economy';
import { addXp, getLevel, getXp, getXpToNext, setOnLevelUp } from '../data/FarmProgress';
import { getStamina, consumeStamina, resetStamina, MAX_STAMINA } from '../data/Stamina';
import { ORE_DEPOSITS, OreDeposit, isOreMined, markMined, resetOres } from '../data/MineState';
import { NPC } from '../entities/NPC';
import { getNPCsForScene, refreshSchedule, updateNPCs, getDailyNpcLine, getMysteryAfterObservatory } from '../systems/NPCSystem';
import { collectShard, getElderDialogue, getQuestObjective, getQuestState } from '../systems/QuestSystem';
import {
  getDailyQuests,
  refreshDailyQuests,
  onHarvest as onDQHarvest,
  onWater as onDQWater,
  onPlant as onDQPlant,
  onCollect as onDQCollect,
  onTalkNpc as onDQTAlkNpc,
  onBuyShop as onDQBuyShop,
  onSellShop as onDQSellShop,
  onMine as onDQMine,
  onWoodcut as onDQWoodcut,
  claimReward,
  getDailyQuestSaveData,
  injectGuideQuests,
} from '../systems/DailyQuestSystem';
import { InputManager } from '../systems/InputManager';
import { TouchControls, setActionButtonLabel } from '../systems/TouchControls';
import { ShopPanel } from '../ui/ShopPanel';
import { BackpackPanel } from '../ui/BackpackPanel';
import { QuestPanel } from '../ui/QuestPanel';
import { StoryDialogue } from '../ui/StoryDialogue';
import { EndingPanel } from '../ui/EndingPanel';
import {
  getStoryStep, setStoryStep, advanceStory, isTutorialDone,
  isCh1TownIntroDone, markCh1TownIntroDone,
  isObservatoryComplete, markObservatoryComplete,
  getEndingChoice, setEndingChoice, type EndingChoice, type DialogueLine,
  XIYA_DIALOGUE, GATE_OPENED_DIALOGUE, SOW_SEEDS_DIALOGUE,
  WATER_CROPS_DIALOGUE, EVENING_DIALOGUE, TOWN_INTRO_DIALOGUE,
  FOREST_SHARD_DIALOGUE, DEMO_ENDING_DIALOGUE, DEMO_ENDING_BRANCHES, DEMO_ENDING_FINALE,
  WOODCUT_TIP_DIALOGUE, MINE_TIP_DIALOGUE, XIYA_DAWN_DIALOGUE, XIYA_EVENING_DIALOGUE, getGrandpaNote,
  GARDEN_RESTORED_XIYA_DIALOGUE,
  FIRST_HARVEST_DIALOGUE,
} from '../systems/StorySystem';
import { hasSave, load, apply, save, getLastIncompatibleVersion, clearIncompatibleVersion, SAVE_VERSION } from '../systems/SaveSystem';
import { play } from '../systems/AudioSystem';

interface SceneInitData {
  spawn?: { x: number; y: number };
}

/** 农田格子的视觉对象：土地底色 + 作物标记 */
interface TileVisual {
  rect: Phaser.GameObjects.Rectangle;
  crop: Phaser.GameObjects.Image;
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
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private spawn: { x: number; y: number } | undefined;
  // 切换中标记，防止同一帧重复触发
  private transitioning = false;
  // create 阶段是否抛错（抛错时显示错误遮罩并停止更新，避免黑屏）
  private createFailed = false;
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
  private questPanel!: QuestPanel;
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
  // 森林碎片对话已播放（首次交互先播对话，结束后自动采集）
  private shardDialoguePlayed = false;
  // 睡觉判定格集合：house 场景为真实床铺（Ground gid 9）；farm 场景为木屋地板（Walls gid 6）
  // 说明：教程提示"回到床前按 E 睡觉"显示在 farm，玩家在木屋内按 E 也应能睡（无需先进屋）
  private bedTiles = new Set<string>();
  // 防重复睡觉：移动端触屏双击发防护（touchstart→mousedown 跨帧触发两次 trySleep）
  private sleeping = false;
  // 矿洞矿脉精灵列表（mine 场景，id → sprite）
  private oreSprites: { deposit: OreDeposit; sprite: Phaser.GameObjects.Image }[] = [];
  // 农场树木精灵列表（farm 场景，key = "col,row"）
  private treeSprites = new Map<string, Phaser.GameObjects.Image>();
  // 首次引导标志
  private woodcutTipShown = false;
  private mineTipShown = false;
  // 当前选中的种子类型（R 键切换，用于播种）
  private selectedCropType: CropType = 'radish';
  // 种子类型切换冷却（防连发）
  private seedSwitchCooldown = 0;
  // 种子选择器 DOM
  private seedSelectorEl: HTMLDivElement | null = null;
  // 农场触屏：种子切换按钮（点击弹作物选择器预选播种作物；桌面用 R 键）
  private seedSwitchBtn: HTMLDivElement | null = null;
  // 作物选择器（预选播种作物，不播种）
  private cropPickerEl: HTMLDivElement | null = null;
  // 移动端点击种田：点击操作后的短暂反馈高亮（key = "col,row"，至 tapFlashUntil 过期）
  private tapFlashKey = '';
  private tapFlashUntil = 0;
  // 剧情对话 UI
  private storyDialogue: StoryDialogue | null = null;
  // 教程：大门墙壁（物理矩形，钥匙使用后销毁）
  private gateWall: Phaser.GameObjects.Rectangle | null = null;
  // 教程：夏雅精灵
  private xiyaSprite: Phaser.GameObjects.Sprite | null = null;
  // v0.5.3 剧情密度 E1：清晨偶遇的夏雅（教程完成后，清晨 06-08 时在农场出现）
  private dawnXiya: Phaser.GameObjects.Sprite | null = null;
  private dawnXiyaLabel: Phaser.GameObjects.Text | null = null;
  // E1 当天是否已触发过（跨天重置：由 onDayChange 清空）
  private dawnXiyaDay = 0;
  // v0.5.3 剧情密度 E9：傍晚关心的夏雅（教程完成后，傍晚 18-20 时在农场出现）
  private eveningXiya: Phaser.GameObjects.Sprite | null = null;
  private eveningXiyaLabel: Phaser.GameObjects.Text | null = null;
  // E9 当天是否已触发过（跨天重置）
  private eveningXiyaDay = 0;
  // v0.5.3 剧情密度 E5：爷爷的笔记（庄园角落可读物件）
  private grandpaNote: Phaser.GameObjects.Text | null = null;
  // 爷爷笔记交互基准坐标（椭圆实际位置，label 有 -8px 偏移）
  private grandpaNotePos: { x: number; y: number } = { x: 0, y: 0 };
  // M1-3 爷爷旧花园恢复点（farm 左下角木屋旁）：三阶段清理交互状态
  private gardenRestore: {
    /** 0=未清理 1=已清倒木 2=已清破花架 3=已恢复 */
    stage: number;
    /** 恢复前装饰分 3 组（倒木/破花架/荒草），每组 Graphics，按阶段销毁 */
    debris: Phaser.GameObjects.Graphics[];
    /** 恢复后蝴蝶 */
    butterflies: Phaser.GameObjects.Container[];
    /** 交互提示标记（未恢复时显示） */
    mark: Phaser.GameObjects.Text | null;
    /** 交互基准点（区域中心像素坐标） */
    pos: { x: number; y: number };
  } | null = null;
  // M1-3 夏雅见证：花园恢复完成后，夏雅在花园旁出现，靠近触发 GARDEN_RESTORED_XIYA_DIALOGUE
  private gardenXiya: Phaser.GameObjects.Sprite | null = null;
  private gardenXiyaLabel: Phaser.GameObjects.Text | null = null;
  // v0.5.3 剧情密度 E2：第一次收获反馈（一次性，内存 flag，不进存档）
  private firstHarvestShown = false;
  // 教程提示 DOM
  private tutorialHint: HTMLDivElement | null = null;
  // 教程进度计数（锄地/播种/浇水各需3次）
  private tutorialProgress = 0;
  private readonly TUTORIAL_TARGET = 3;
  // Demo 结尾：结算界面
  private endingPanel: EndingPanel | null = null;
  // Demo 结尾：观星点视觉（farm 右下空地，像素坐标）
  private readonly STARGAZE_POS = { x: 504, y: 232 };
  private stargazeSprites: Phaser.GameObjects.Ellipse[] = [];
  private stargazeMark: Phaser.GameObjects.Text | null = null;
  // 农场商店摊位（v0.6 商店入口：农田旁空地，靠近按 E 打开 ShopPanel）
  private farmShop: {
    mark: Phaser.GameObjects.Text;
    stall: Phaser.GameObjects.Graphics;
    pos: { x: number; y: number };
  } | null = null;

  constructor(key: string) {
    super(key);
    this.mapKey = key;
  }

  init(data: SceneInitData): void {
    this.spawn = data?.spawn;
    this.transitioning = false;
    this.createFailed = false;
  }

  /** 场景停止/切换时清理挂载在 document.body 上的 DOM 残留（提示条/种子选择器等） */
  private cleanupSceneDom(): void {
    this.removeTutorialHint();
    this.closeSeedSelector();
    this.closeCropPicker();
    // 背包/任务面板跨场景清理（防止残留打开态）
    this.backpackPanel?.close();
    this.questPanel?.close();
    // 对话残留跨场景传递会导致新场景按交互被对话拦截（reset 不触发 onComplete，安全）
    this.storyDialogue?.reset();
    // E1/E9 夏雅精灵清理（场景切换时销毁，防止残留）
    this.clearDawnXiya();
    this.clearEveningXiya();
    // M1-3 夏雅见证精灵清理（场景切换时销毁，防止残留）
    this.clearGardenXiya();
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
    if (!this.textures.exists('npc_xiya')) this.load.image('npc_xiya', 'assets/sprites/npc_xiya.png');
    if (!this.textures.exists('npc_miner')) this.load.image('npc_miner', 'assets/sprites/npc_miner.png');
    if (!this.textures.exists('npc_gardener')) this.load.image('npc_gardener', 'assets/sprites/npc_gardener.png');
    if (!this.textures.exists('npc_adventurer')) this.load.image('npc_adventurer', 'assets/sprites/npc_adventurer.png');
    // 矿脉贴图（矿洞场景：石/铜/铁）
    if (this.mapKey === 'mine') {
      if (!this.textures.exists('ore_stone')) this.load.image('ore_stone', 'assets/sprites/ore_stone.png');
      if (!this.textures.exists('ore_copper')) this.load.image('ore_copper', 'assets/sprites/ore_copper.png');
      if (!this.textures.exists('ore_iron')) this.load.image('ore_iron', 'assets/sprites/ore_iron.png');
    }
    // 道具贴图（农场砍树相关：旧斧头/木材）
    if (this.mapKey === 'farm') {
      if (!this.textures.exists('old_axe')) this.load.image('old_axe', 'assets/sprites/old_axe.png');
      if (!this.textures.exists('wood')) this.load.image('wood', 'assets/sprites/wood.png');
    }
    if (this.mapKey === 'farm' && !this.textures.exists('crops')) {
      this.load.spritesheet('crops', 'assets/sprites/crops.png', { frameWidth: 32, frameHeight: 32 });
    }
    // 砍树贴图：树1（阔叶）/树2（松树）/树桩（农场场景）
    if (this.mapKey === 'farm') {
      if (!this.textures.exists('tree1')) this.load.image('tree1', 'assets/sprites/tree1.png');
      if (!this.textures.exists('tree2')) this.load.image('tree2', 'assets/sprites/tree2.png');
      if (!this.textures.exists('stump')) this.load.image('stump', 'assets/sprites/stump.png');
    }
  }

  create(): void {
    // 场景停止/切换时清理 DOM 残留（提示条/种子选择器等），防止跨场景泄漏
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.cleanupSceneDom, this);
    // 兜底：create 阶段任何未预期的异常（贴图缺失/地图数据异常等）都不允许演变成黑屏，
    // 统一捕获并显示错误遮罩 + 刷新按钮
    try {
      this.createScene();
    } catch (err) {
      this.createFailed = true;
      console.error(`[MapScene:${this.mapKey}] create() 抛出异常，已阻止黑屏`, err);
      this.showFatalError(err);
    }
  }

  private createScene(): void {
    // 创建 tilemap 并关联 tileset
    const map = this.make.tilemap({ key: this.mapKey });
    // 屋内/木屋场景：收集睡觉判定格（house=床铺 gid 9；farm=木屋地板 gid 6）
    if (this.mapKey === 'house' || this.mapKey === 'farm') {
      this.collectBedTiles(map);
    }
    let tileset = map.addTilesetImage('placeholder', 'tiles');
    if (!tileset) {
      // 兜底：tileset 纹理加载失败时用程序生成的占位瓦片，避免整个场景黑屏
      console.error(`[MapScene:${this.mapKey}] tileset "placeholder" 关联失败，使用占位瓦片`);
      this.createFallbackTilesTexture();
      tileset = map.addTilesetImage('placeholder', 'fallback_tiles');
      if (!tileset) {
        console.error(`[MapScene:${this.mapKey}] 兜底 tileset 也失败，无法渲染地图`);
        this.showDialogueText('地图资源加载失败，请刷新页面重试');
        return;
      }
    }

    // 渲染图层
    this.groundLayer = map.createLayer('Ground', tileset, 0, 0)!;
    this.wallsLayer = map.createLayer('Walls', tileset, 0, 0)!;
    this.groundLayer.setDepth(0);
    this.wallsLayer.setDepth(1);

    // 碰撞：仅石墙(3)、水(4)、树木(9-12)、树桩(13) 参与碰撞
    // 土壤(5)、木地板(6)、小路(7)、花(8) 不碰撞（木地板/花仅装饰）
    // v0.6 地图重排：town 扩展瓦片 9(屋顶)/10(墙面)/11(门)/12(窗)/13(井)/14(栅栏) 全碰撞，
    //               mine 扩展瓦片 9(岩壁)/10(矿柱)/12(矿石堆)/13(木箱) 碰撞，11(轨道)/14(木板)/15(碎石)/16(矿车) 不碰撞
    this.wallsLayer.setCollisionBetween(3, 4);
    if (this.mapKey === 'mine') {
      this.wallsLayer.setCollision([9, 10, 12, 13]);
    } else if (this.mapKey === 'town') {
      this.wallsLayer.setCollisionBetween(9, 14);
    } else {
      this.wallsLayer.setCollisionBetween(9, 13);
    }

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
            `存档版本不兼容（v${oldVer}→v${SAVE_VERSION}），已自动重置。`,
          );
          clearIncompatibleVersion();
        }
      }
    }

    // 输入管理器（统一键盘/触屏输入）
    this.inputManager = new InputManager(this.input.keyboard!);

    // 物理世界边界（必须在玩家创建之前设置，否则 setCollideWorldBounds 使用默认 800x600）
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // 玩家出生点：传入的 spawn 或地图中央
    const sx = this.spawn?.x ?? map.widthInPixels / 2;
    const sy = this.spawn?.y ?? map.heightInPixels / 2;
    this.player = new Player(this, sx, sy, this.inputManager);
    this.player.setDepth(10);

    // 玩家与墙体碰撞
    this.physics.add.collider(this.player, this.wallsLayer);

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

    // 农场触屏：种子切换按钮（点击弹作物选择器预选播种作物；桌面保留 R 键）
    if (this.mapKey === 'farm') {
      this.seedSwitchBtn = document.createElement('div');
      this.seedSwitchBtn.id = 'seed-switch-btn';
      this.seedSwitchBtn.style.cssText =
        'position:absolute;top:46px;left:8px;pointer-events:auto;cursor:pointer;' +
        'background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.35);border-radius:6px;' +
        'color:#fff;font-size:12px;padding:3px 8px;text-shadow:1px 1px 0 #000;' +
        'user-select:none;-webkit-user-select:none';
      this.seedSwitchBtn.textContent = '';
      this.seedSwitchBtn.addEventListener('click', () => this.showCropPicker());
      this.hudDom.appendChild(this.seedSwitchBtn);
    }

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
      // 砍树：创建树木精灵 + 兼容旧存档赠送斧头
      this.setupTrees();
      if (isTutorialDone() && getItemCount('old_axe') === 0) {
        addItem('old_axe', 1);
      }

      // Demo 结尾：观星点视觉（主线完成 + 夜晚时显示）
      this.createStargazePoint();

      // 农田选中高亮（亮黄色边框 + 填充，跟随玩家面向的格子；可操作时才显示）
      this.targetHighlight = this.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE, 0xfff176, 0.35);
      this.targetHighlight.setStrokeStyle(2, 0xffffff, 0.9);
      this.targetHighlight.setDepth(8);
      this.targetHighlight.setVisible(false);
    }

    // 出口指示箭头（所有地图场景，帮助玩家找到出口）
    this.setupExitIndicators();

    // 创建当前场景的 NPC（根据 TimeSystem 时间判定 location）
    this.setupNPCs();

    // M1-2 农场动态氛围（方案 B：水塘涟漪 / 花草摆动 / 暖色光斑，零资源纯代码）
    if (this.mapKey === 'farm') {
      this.setupFarmAmbience();
    }

    // M1-3 爷爷旧花园恢复点（玩家清理荒废角落 → 环境变化 + 存档持久化）
    if (this.mapKey === 'farm') {
      this.setupGardenRestore();
    }

    // 农场商店摊位（靠近按 E 打开 ShopPanel，买种子不用跑小镇）
    if (this.mapKey === 'farm') {
      this.setupFarmShop();
    }

    // 第一章：首次进入小镇触发剧情（教程完成后、且从未触发过）
    if (this.mapKey === 'town' && isTutorialDone() && !isCh1TownIntroDone()) {
      if (!this.storyDialogue) this.storyDialogue = new StoryDialogue();
      markCh1TownIntroDone();
      this.time.delayedCall(600, () => {
        this.storyDialogue!.play(TOWN_INTRO_DIALOGUE, () => {
          this.updateHUD();
        });
      });
    }

    // 森林场景：创建星之碎片采集点（仅 accepted 状态显示）
    if (this.mapKey === 'forest') {
      this.setupShard();
    }

    // 矿洞场景：创建矿脉精灵
    if (this.mapKey === 'mine') {
      this.setupOres();
    }

    // 教程设置（大门地图 + 农场）
    if ((this.mapKey === 'gate' || this.mapKey === 'farm') && !isTutorialDone()) {
      this.setupTutorial();
    }

    // v0.5.3 剧情密度 E1：教程完成后，清晨（06-08 时）在农场出现夏雅（纯陪伴事件，非任务）
    if (this.mapKey === 'farm' && isTutorialDone()) {
      this.setupDawnXiya();
      this.setupEveningXiya();
    }

    // v0.5.3 剧情密度 E5：爷爷的笔记（庄园角落可读物件，多条轮换、不解释）
    if (this.mapKey === 'farm') {
      this.setupGrandpaNote();
    }

    // 触屏控件（摇杆+交互按钮，DOM 单例；移动端额外显示背包按钮）
    this.touchControls = new TouchControls(this, this.inputManager, () => this.tryOpenBackpack(), () => this.tryOpenQuest());
    // 农场场景操作按钮语义为「使用工具」，其余场景保持「交互」（仅影响按钮文字，逻辑不变）
    setActionButtonLabel(this.mapKey === 'farm' ? '使用工具' : '交互');
    // 移动端点击种田：触屏设备在农场点击可操作的农田格子 → 直接执行操作
    // （DOM 按钮/摇杆区域 pointer-events:auto 会拦截事件，不会落到此处）
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handleFarmTap(pointer);
    });
    // 商店面板（DOM 覆盖层；数据变化时刷新 HUD 金币显示；关店时清理输入残留）
    this.shopPanel = new ShopPanel(
      () => this.updateHUD(),
      () => {
        // 关店清理：丢弃开店期间残留的 E 键，防止下帧立即重开商店
        this.inputManager.clearAction();
        // 重置帧计时，防止关店后时间跳跃（lastFrameTime 仍停在开店前）
        this.lastFrameTime = performance.now();
      },
      // 购买回调：通知每日任务 + 自动选中刚买的种子（HUD「种子」按钮立即显示新种子）
      (itemId: string, _count: number) => {
        onDQBuyShop(1);
        this.updateDailyQuestPanel();
        const bought = itemId.replace(/_seed$/, '') as CropType;
        if (CROP_TYPES.includes(bought)) this.selectedCropType = bought;
        this.updateHUD();
      },
      // 卖出回调：通知每日任务
      (count: number) => { onDQSellShop(count); this.updateDailyQuestPanel(); },
    );

    // 背包面板（DOM 覆盖层；关包时清理 B 键残留；使用钥匙回调）
    this.backpackPanel = new BackpackPanel(
      () => {
        this.inputManager.clearAction();
        this.lastFrameTime = performance.now();
      },
      () => this.useManorKey(),
      () => this.updateHUD(),
    );
    // 任务面板（v0.5.3-B 任务入口化；关面板清理 J 键残留）
    this.questPanel = new QuestPanel(
      () => {
        this.inputManager.clearAction();
        this.lastFrameTime = performance.now();
      },
      () => {
        this.updateHUD();
        this.updateDailyQuestPanel();
      },
    );
    // 农场升级通知（升级时显示气泡提示）
    setOnLevelUp((newLevel: number) => {
      this.showDialogueText(`农场升级！Lv.${newLevel}`);
      this.updateTimeHUD();
    });

    // 每日任务：刷新并渲染面板
    refreshDailyQuests();
    this.createDailyQuestPanel();

    // 离开页面前自动存档（beforeunload + pagehide；pagehide 兜底移动端，只注册一次）
    if (MapScene._beforeUnload) {
      window.removeEventListener('beforeunload', MapScene._beforeUnload);
      window.removeEventListener('pagehide', MapScene._beforeUnload);
    }
    MapScene._beforeUnload = () => {
      if (this.player && this.player.active) {
        save({
          x: this.player.x, y: this.player.y,
          scene: this.mapKey, facing: this.player.facing,
          dailyQuest: getDailyQuestSaveData(),
        });
      }
    };
    window.addEventListener('beforeunload', MapScene._beforeUnload);
    window.addEventListener('pagehide', MapScene._beforeUnload);

    // 淡入过渡（与出口切换的 fadeOut 配对，避免切图瞬间黑屏）
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  update(timeMs: number): void {
    // create 失败：停止每帧逻辑（错误遮罩已显示，避免空引用持续抛错）
    if (this.createFailed) {
      console.log(`[DEBUG] update skipped: createFailed at ${this.mapKey}`);
      return;
    }

    // Demo 结算界面打开：冻结移动/交互，等待「继续自由游玩」
    if (this.endingPanel?.isOpen()) {
      this.player.setVelocity(0, 0);
      this.inputManager.clearAction();
      return;
    }

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

    // 任务面板打开：冻结时间/玩家移动/NPC/交互，只响应关闭
    if (this.questPanel.isOpen()) {
      this.player.setVelocity(0, 0);
      // J 键关闭
      if (Phaser.Input.Keyboard.JustDown(this.inputManager.keyJ)) {
        this.questPanel.close();
      }
      return;
    }

    // B 键打开背包（仅在未与其他面板交互时）
    if (Phaser.Input.Keyboard.JustDown(this.inputManager.keyB)) {
      this.inputManager.clearAction();
      this.backpackPanel.open();
      return;
    }

    // J 键打开任务面板
    if (Phaser.Input.Keyboard.JustDown(this.inputManager.keyJ)) {
      this.inputManager.clearAction();
      this.questPanel.open();
      return;
    }

    // R 键切换种子类型（仅农场，300ms 冷却）
    if (this.mapKey === 'farm' && Phaser.Input.Keyboard.JustDown(this.inputManager.keyR) && this.seedSwitchCooldown <= 0) {
      this.seedSwitchCooldown = 300;
      const idx = CROP_TYPES.indexOf(this.selectedCropType);
      this.selectedCropType = CROP_TYPES[(idx + 1) % CROP_TYPES.length];
      this.updateHUD();
    }

    // 计算 dt（ms），推进游戏时间；上限 1000ms 防止切后台回来一次性跳太多
    const rawDt = timeMs - this.lastFrameTime;
    const dtMs = Math.max(0, Math.min(rawDt, 1000));
    this.lastFrameTime = timeMs;
    timeTick(dtMs);
    // 种子切换冷却递减
    if (this.seedSwitchCooldown > 0) this.seedSwitchCooldown -= dtMs;

    // 观星点显隐 + 呼吸动画（主线完成 + 夜晚时显示）
    this.updateStargaze();

    // 剧情对话打开时：禁止移动，E/空格推进对话
    if (this.storyDialogue) {
      if (this.storyDialogue.isOpen()) {
        this.inputManager.update();
        this.player.setVelocity(0, 0);
        if (this.inputManager.consumeAction()) {
          this.storyDialogue.advance();
        }
        return;
      }
    }

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
    if (!this.transitioning) {
      const consumed = this.inputManager.consumeAction();
      if (consumed) {
        console.log(`[DEBUG] update consumeAction=true, calling tryInteract at ${this.mapKey}`);
        this.tryInteract();
      }
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
        console.log(`[Exit] 触发出口: ${this.mapKey} → ${ex.target}`, {
          player: { x: this.player.x, y: this.player.y },
          zone: { x: ex.x, y: ex.y, w: ex.w, h: ex.h },
        });
        this.transitioning = true;
        // 淡出过渡后切换场景，避免瞬间黑屏
        this.cameras.main.fadeOut(250, 0, 0, 0);
        const target = ex.target;
        const spawn = ex.spawn;
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start(target, { spawn });
        });
        // 兜底：fade 事件异常时强制切换；超时后无论如何重置标志防止软锁死
        this.time.delayedCall(1500, () => {
          if (this.transitioning && this.scene.isActive()) {
            this.scene.start(target, { spawn });
          }
          this.transitioning = false;
        });
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
      // 名字标签（32x32 缩放 0.5 后，标签上移 14 像素贴头顶）
      // 角色主题色 + 黑描边 + 阴影 + 半透明黑底：深/浅背景都清晰，且能区分角色
      const label = this.add.text(npc.targetX, npc.targetY - 14, npc.name, {
        fontFamily: 'Arial',
        fontSize: '13px',
        color: npc.nameColor,
        stroke: '#000000',
        strokeThickness: 3,
        backgroundColor: 'rgba(0,0,0,0.45)',
        padding: { x: 3, y: 2 },
      });
      label.setShadow(0, 1, '#000000', 2);
      label.setOrigin(0.5).setDepth(6).setScrollFactor(1);
      npc.label = label;
      // 立即吸附到目标位置（避免从原点滑过来）
      npc.snapToTarget();
      // v0.6 阶段 2a：启动视觉生活动作（单帧 Tween 模拟）
      npc.startIdleAnimation(this);
    }
  }

  /**
   * v0.5.3 剧情密度 E1：清晨偶遇的夏雅
   * 教程完成后，清晨 06-08 时进入农场时在庄园出现；玩家靠近按 E 播放 XIYA_DAWN_DIALOGUE。
   * 当天触发过一次后不再出现（dawnXiyaDay 记录，跨天由 onDayChange 重置）。
   * 纯陪伴事件：无任务、无奖励、不影响主线/教程。
   */
  private setupDawnXiya(): void {
    const t = getTime();
    if (t.hour < 6 || t.hour >= 8) return;
    if (this.dawnXiyaDay === t.day) return;

    const dx = 8 * TILE_SIZE + TILE_SIZE / 2;
    const dy = 11 * TILE_SIZE + TILE_SIZE / 2;
    this.dawnXiya = this.add.sprite(dx, dy, 'npc_xiya');
    this.dawnXiya.setScale(0.5).setDepth(5);
    this.dawnXiyaLabel = this.add.text(dx, dy - 14, '夏雅', {
      fontSize: '13px', color: '#f0a050',
      stroke: '#000000', strokeThickness: 3,
      backgroundColor: 'rgba(0,0,0,0.45)',
      padding: { x: 3, y: 2 },
    }).setShadow(0, 1, '#000000', 2).setOrigin(0.5).setDepth(6);
  }

  /** 与清晨夏雅交互（靠近按 E → 播放偶遇对话） */
  private tryDawnXiyaInteract(): boolean {
    if (!this.dawnXiya || !this.dawnXiya.visible) return false;
    if (getTime().hour < 6 || getTime().hour >= 8) return false;
    const dx = this.player.x - this.dawnXiya.x;
    const dy = this.player.y - this.dawnXiya.y;
    if (dx * dx + dy * dy > 28 * 28) return false;

    this.dawnXiyaDay = getTime().day;
    this.dawnXiya.destroy();
    this.dawnXiya = null;
    if (this.dawnXiyaLabel) { this.dawnXiyaLabel.destroy(); this.dawnXiyaLabel = null; }
    if (!this.storyDialogue) this.storyDialogue = new StoryDialogue();
    this.storyDialogue.play(XIYA_DAWN_DIALOGUE, () => {
      this.updateHUD();
    });
    return true;
  }

  /**
   * v0.5.3 剧情密度 E9：傍晚关心的夏雅
   * 教程完成后，傍晚 18-20 时进入农场时在庄园出现；玩家靠近按 E 播放 XIYA_EVENING_DIALOGUE。
   * 当天触发过一次后不再出现（eveningXiyaDay 记录，跨天重置）。
   * 纯陪伴事件：无任务、无奖励、不影响主线/教程。
   */
  private setupEveningXiya(): void {
    const t = getTime();
    if (t.hour < 18 || t.hour >= 20) return;
    if (this.eveningXiyaDay === t.day) return;

    const dx = 14 * TILE_SIZE + TILE_SIZE / 2;
    const dy = 6 * TILE_SIZE + TILE_SIZE / 2;
    this.eveningXiya = this.add.sprite(dx, dy, 'npc_xiya');
    this.eveningXiya.setScale(0.5).setDepth(5);
    this.eveningXiya.setFlipX(true);
    this.eveningXiyaLabel = this.add.text(dx, dy - 14, '夏雅', {
      fontSize: '13px', color: '#f0a050',
      stroke: '#000000', strokeThickness: 3,
      backgroundColor: 'rgba(0,0,0,0.45)',
      padding: { x: 3, y: 2 },
    }).setShadow(0, 1, '#000000', 2).setOrigin(0.5).setDepth(6);
  }

  /** 与傍晚夏雅交互（靠近按 E → 播放关心对话） */
  private tryEveningXiyaInteract(): boolean {
    if (!this.eveningXiya || !this.eveningXiya.visible) return false;
    if (getTime().hour < 18 || getTime().hour >= 20) return false;
    const dx = this.player.x - this.eveningXiya.x;
    const dy = this.player.y - this.eveningXiya.y;
    if (dx * dx + dy * dy > 28 * 28) return false;

    this.eveningXiyaDay = getTime().day;
    this.eveningXiya.destroy();
    this.eveningXiya = null;
    if (this.eveningXiyaLabel) { this.eveningXiyaLabel.destroy(); this.eveningXiyaLabel = null; }
    if (!this.storyDialogue) this.storyDialogue = new StoryDialogue();
    this.storyDialogue.play(XIYA_EVENING_DIALOGUE, () => {
      this.updateHUD();
    });
    return true;
  }

  /** 清除傍晚夏雅精灵（场景切换/跨天时调用） */
  private clearEveningXiya(): void {
    if (this.eveningXiya) { this.eveningXiya.destroy(); this.eveningXiya = null; }
    if (this.eveningXiyaLabel) { this.eveningXiyaLabel.destroy(); this.eveningXiyaLabel = null; }
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
   * 创建矿洞矿脉精灵
   * 已开采的矿脉不显示（当日不可重复开采）
   */
  private setupOres(): void {
    this.oreSprites = [];
    for (const deposit of ORE_DEPOSITS) {
      if (isOreMined(deposit.id)) continue;
      const cx = deposit.col * TILE_SIZE + TILE_SIZE / 2;
      const cy = deposit.row * TILE_SIZE + TILE_SIZE / 2;
      // 矿石贴图（32x32，按类型缩放显示：石头 12 / 铜 14 / 铁 16 像素）
      const textureKey = `ore_${deposit.oreType}`;
      const size = deposit.oreType === 'iron' ? 16 : deposit.oreType === 'copper' ? 14 : 12;
      const sprite = this.add.image(cx, cy, textureKey);
      sprite.setScale(size / 32);
      sprite.setDepth(5);
      this.oreSprites.push({ deposit, sprite });
    }
  }

  /**
   * 创建程序化占位瓦片纹理（tileset 图片加载失败时兜底，防止黑屏）
   * 14 个瓦片（16x16），简单配色模拟地面/墙/水/树
   */
  private createFallbackTilesTexture(): void {
    if (this.textures.exists('fallback_tiles')) return;
    const tex = this.textures.createCanvas('fallback_tiles', 14 * 16, 16);
    if (!tex) return;
    const ctx = tex.getContext();
    const colors = [
      '#3a5a3a', '#4a6a4a', '#4a4a4a', '#3a3a6a', // 1-4: 地面/深地/石墙/水
      '#5a4a2a', '#8a7a5a', '#6a6a4a', '#2a8a2a', // 5-8: 土壤/木地板/小路/花
      '#2a5a2a', '#2a6a2a', '#2a4a2a', '#1a4a2a', // 9-12: 树
      '#5a4a3a', '#3a3a3a',                        // 13-14: 树桩/矿
    ];
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = colors[i];
      ctx.fillRect(i * 16, 0, 16, 16);
    }
    tex.refresh();
  }

  /**
   * 致命错误遮罩（DOM）：场景构建异常时显示，避免黑屏且无任何反馈
   * 提供错误信息 + 刷新按钮，便于用户自救与排查
   */
  private showFatalError(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    let el = document.getElementById('fatal-error-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fatal-error-overlay';
      el.style.cssText =
        'position:fixed;top:0;right:0;bottom:0;left:0;background:#000;z-index:9999;' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'font-family:Arial,sans-serif;text-align:center;padding:20px';
      document.body.appendChild(el);
    }
    el.innerHTML = '';
    const title = document.createElement('div');
    title.textContent = '地图加载出错了';
    title.style.cssText = 'font-size:18px;color:#ffe082;margin-bottom:12px';
    el.appendChild(title);
    const detail = document.createElement('div');
    detail.textContent = msg;
    detail.style.cssText = 'font-size:13px;color:#aaa;max-width:80%;word-break:break-all;margin-bottom:16px';
    el.appendChild(detail);
    const reloadBtn = document.createElement('button');
    reloadBtn.textContent = '刷新页面重试';
    reloadBtn.style.cssText = 'padding:8px 20px;font-size:14px;cursor:pointer';
    reloadBtn.addEventListener('click', () => location.reload());
    el.appendChild(reloadBtn);
  }

  /**
   * M1-2 农场动态氛围（方案 B，v0.6 视觉增强）
   * 零资源纯代码：水塘涟漪 + 花草摆动 + 暖色光斑。
   * 仅 farm 场景调用；纯视觉装饰，不触碰碰撞/存档/出口/玩法逻辑。
   * tween 随场景 shutdown 自动销毁，无需手动清理。
   */
  private setupFarmAmbience(): void {
    const T = TILE_SIZE; // 16

    // 1) 水塘涟漪：Walls 层水塘区 (cols 31-33, rows 19-22)，3 个错落扩散光斑
    const pond: Array<{ c: number; r: number }> = [
      { c: 31, r: 20 }, { c: 32, r: 21 }, { c: 33, r: 19 },
    ];
    pond.forEach((p, i) => {
      const ring = this.add.graphics();
      ring.fillStyle(0x9fd8f5, 0.32);
      ring.fillCircle(0, 0, 4);
      ring.setPosition(p.c * T + T / 2, p.r * T + T / 2);
      ring.setDepth(2);
      this.tweens.add({
        targets: ring,
        scale: { from: 0.3, to: 1.15 },
        alpha: { from: 0.55, to: 0 },
        duration: 2200,
        delay: i * 700,
        repeat: -1,
        ease: 'Quad.Out',
      });
    });

    // 2) 花草摆动：花园/森林入口/住宅右侧花丛上方叠动态花精灵（瓦片纹理 gid 8）
    //    位置与 FARM_TREE_POSITIONS、木屋石墙、农田、路径均无重叠
    //    注意：addTilesetImage 不生成 tileset 纹理（'tiles' 仍是 image），需手动切 spritesheet。
    //    ⚠️ Phaser 3.80：addSpriteSheet 的 source 传 Texture 对象会把 key 覆盖为源纹理 key 并直接返回，
    //    不会创建新纹理 —— 必须传 HTMLImageElement（getSourceImage()）才会走 create 分支。
    if (!this.textures.exists('tiles_fs')) {
      const tilesImg = this.textures.get('tiles').getSourceImage() as HTMLImageElement;
      this.textures.addSpriteSheet('tiles_fs', tilesImg, {
        frameWidth: TILE_SIZE,
        frameHeight: TILE_SIZE,
      });
    }
    const flowerSpots: Array<[number, number]> = [
      [4, 3], [7, 4], [5, 3], // 花园区
      [12, 2], [17, 3],       // 森林入口两侧
      [10, 22],               // 住宅右侧
    ];
    flowerSpots.forEach(([c, r], i) => {
      const f = this.add.sprite(c * T + T / 2, r * T + T / 2, 'tiles_fs', 7);
      f.setDepth(4);
      f.setAlpha(0.92);
      this.tweens.add({
        targets: f,
        angle: { from: -8, to: 8 },
        duration: 1500 + i * 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    });

    // 3) 暖色光斑：农田上空缓慢漂移（低透明度大圆，模拟日光斑驳）
    const glow = this.add.graphics();
    glow.fillStyle(0xffeec8, 0.13);
    glow.fillCircle(0, 0, 34);
    glow.setPosition(20 * T, 12 * T);
    glow.setDepth(2);
    this.tweens.add({
      targets: glow,
      x: { from: 20 * T - 26, to: 20 * T + 26 },
      y: { from: 12 * T - 14, to: 12 * T + 14 },
      duration: 6000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  /**
   * 创建农场树木精灵
   * 新游戏无存档时初始化树木状态；有存档时 FarmState 已由 apply() 恢复
   * 树木贴图 32x32，缩放 0.5 与 16x16 瓦片协调；附带静态碰撞体
   */
  private setupTrees(): void {
    // 新游戏：树木状态表为空时初始化（有存档时 apply() 已恢复）
    if (!getTree(FARM_TREE_POSITIONS[0].col, FARM_TREE_POSITIONS[0].row)) {
      initTrees();
    }
    // 按位置创建精灵（根据存档状态决定显示树或树桩）
    for (const pos of FARM_TREE_POSITIONS) {
      const tree = getTree(pos.col, pos.row);
      if (!tree) continue;
      const cx = pos.col * TILE_SIZE + TILE_SIZE / 2;
      const cy = pos.row * TILE_SIZE + TILE_SIZE / 2;
      const textureKey = tree.isStump
        ? 'stump'
        : (pos.col + pos.row) % 2 === 0 ? 'tree1' : 'tree2';
      const sprite = this.add.image(cx, cy, textureKey);
      sprite.setScale(0.5);
      sprite.setDepth(4);
      // 树木碰撞（静态物理体）；树桩保留碰撞避免穿模
      this.physics.add.existing(sprite, true);
      this.physics.add.collider(this.player, sprite);
      this.treeSprites.set(`${pos.col},${pos.row}`, sprite);
    }
  }

  /** 出口指示箭头：在每个出口区域边缘显示方向 + 目标名称 */
  private setupExitIndicators(): void {
    const exits = MAP_EXITS[this.mapKey] ?? [];
    for (const ex of exits) {
      const targetName = MAP_NAMES[ex.target] ?? ex.target;
      const cx = ex.x + ex.w / 2;
      const cy = ex.y + ex.h / 2;

      // 根据出口在地图边缘的位置决定箭头方向
      let arrow: string;
      let labelY = cy;
      if (ex.y <= 0) {
        // 顶部出口 → 向上箭头，文字在下方
        arrow = '▲';
        labelY = cy + 14;
      } else if (ex.y + ex.h >= this.physics.world.bounds.height) {
        // 底部出口 → 向下箭头，文字在上方
        arrow = '▼';
        labelY = cy - 14;
      } else if (ex.x <= 0) {
        // 左侧出口 → 向左箭头
        arrow = '◀';
      } else if (ex.x + ex.w >= this.physics.world.bounds.width) {
        // 右侧出口 → 向右箭头
        arrow = '▶';
      } else {
        arrow = '◆';
      }

      const txt = this.add.text(cx, labelY, `${arrow} ${targetName}`, {
        fontSize: '10px',
        color: '#ffcc44',
        stroke: '#000',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(9);

      // 闪烁动画吸引注意
      this.tweens.add({
        targets: txt,
        alpha: 0.4,
        duration: 600,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  // ============ 新手教程 ============

  /**
   * 教程设置：根据当前场景和步骤创建门/夏雅/提示
   */
  private setupTutorial(): void {
    // 复用 StoryDialogue 实例，避免场景切换时 DOM 累积
    if (!this.storyDialogue) this.storyDialogue = new StoryDialogue();
    this.tutorialProgress = 0;
    const step = getStoryStep();

    if (this.mapKey === 'gate') {
      this.setupGateTutorial(step);
    } else if (this.mapKey === 'farm') {
      this.setupFarmTutorial(step);
    }
  }

  /** 大门地图教程：门墙 + 夏雅 */
  private setupGateTutorial(step: string): void {
    // 庄园大门墙壁（物理阻挡，使用钥匙后销毁）
    const stepsBeforeGate = ['station_intro', 'station_move', 'arrive_manor', 'xiya_talk', 'get_key'];
    if (stepsBeforeGate.includes(step)) {
      // 大门在门柱之间（cols 14-15, rows 8-9），2格宽×2格高木门
      const gateX = 15 * TILE_SIZE;  // 中心 x
      const gateY = 9 * TILE_SIZE;   // 中心 y（row 9 = rows 8-9 中点）
      this.gateWall = this.add.rectangle(gateX, gateY, 2 * TILE_SIZE, 2 * TILE_SIZE, 0x8b4513, 0.9);
      this.gateWall.setDepth(4);
      this.physics.add.existing(this.gateWall, true);
      this.physics.add.collider(this.player, this.gateWall);
      // 门锁标志
      this.add.text(gateX, gateY, '🔒', {
        fontSize: '12px',
      }).setOrigin(0.5).setDepth(5);
    }

    // 夏雅 NPC（开门前显示在门南侧，row 11-12）
    if (step === 'arrive_manor' || step === 'xiya_talk' || step === 'get_key') {
      const xiyaX = 15 * TILE_SIZE + TILE_SIZE / 2;
      const xiyaY = 11 * TILE_SIZE + TILE_SIZE / 2;
      this.xiyaSprite = this.add.sprite(xiyaX, xiyaY, 'npc_xiya');
      this.xiyaSprite.setScale(0.5).setDepth(5);
      this.add.text(xiyaX, xiyaY - 14, '夏雅', {
        fontSize: '13px', color: '#f0a050',
        stroke: '#000000', strokeThickness: 3,
        backgroundColor: 'rgba(0,0,0,0.45)',
        padding: { x: 3, y: 2 },
      }).setShadow(0, 1, '#000000', 2).setOrigin(0.5).setDepth(6);
    }

    // 提示
    const hints: Partial<Record<string, string>> = {
      arrive_manor: this.hintText('→ 靠近夏雅，按 [E] 键对话', '→ 靠近夏雅，点「交互」对话'),
      get_key: this.hintText('→ 按 [B] 键打开背包，选择钥匙使用', '→ 点按右下角「背包」按钮，选择钥匙使用'),
    };
    if (hints[step]) this.showTutorialHint(hints[step]!);
  }

  /** 农场教程：锄地/播种/浇水/睡觉 */
  private setupFarmTutorial(step: string): void {
    const hints: Partial<Record<string, string>> = {
      clear_land: this.hintText('→ 对着农田区域按 [E] 锄地，清理 3 块土地', '→ 对着农田区域点「交互」锄地，清理 3 块土地'),
      sow_seeds: this.hintText('→ 按 [R] 切换到萝卜种子，播种 3 块土地', '→ 对着锄过的土地点「交互」播种萝卜（默认种子），播种 3 块土地'),
      water_crops: this.hintText('→ 对已播种的土地按 [E] 浇水', '→ 对已播种的土地点「交互」浇水'),
      evening_talk: this.hintText('→ 回到床前按 [E] 睡觉，结束第一天', '→ 回到屋内床前点「交互」睡觉，结束第一天'),
    };
    if (hints[step]) this.showTutorialHint(hints[step]!);
  }

  /** 显示教程提示 */
  private showTutorialHint(text: string): void {
    this.removeTutorialHint();
    this.tutorialHint = document.createElement('div');
    Object.assign(this.tutorialHint.style, {
      position: 'fixed', bottom: '80px', left: '50%',
      transform: 'translateX(-50%)', color: '#ffcc00', fontSize: '14px',
      background: 'rgba(0,0,0,0.7)', padding: '8px 20px', borderRadius: '8px',
      zIndex: '400', pointerEvents: 'none',
      border: '1px solid rgba(255,204,0,0.3)',
      textShadow: '0 0 4px rgba(0,0,0,0.8)',
    });
    this.tutorialHint.textContent = text;
    document.body.appendChild(this.tutorialHint);
  }

  private removeTutorialHint(): void {
    if (this.tutorialHint) { this.tutorialHint.remove(); this.tutorialHint = null; }
  }

  /** 与夏雅交互 */
  private tryXiyaInteract(): boolean {
    if (!this.xiyaSprite || !this.xiyaSprite.visible) return false;
    const dx = this.player.x - this.xiyaSprite.x;
    const dy = this.player.y - this.xiyaSprite.y;
    if (dx * dx + dy * dy > 28 * 28) return false;

    if (getStoryStep() === 'arrive_manor') {
      setStoryStep('xiya_talk');
      this.storyDialogue!.play(XIYA_DIALOGUE, () => {
        addItem('manor_key', 1);
        advanceStory(); // → get_key
        this.showTutorialHint(this.hintText('→ 按 [B] 键打开背包，选择钥匙使用', '→ 点按右下角「背包」按钮，选择钥匙使用'));
        this.updateHUD();
      });
      return true;
    }
    return false;
  }

  /** 使用庄园钥匙（BackpackPanel 调用） */
  useManorKey(): boolean {
    if (getStoryStep() !== 'get_key') return false;

    // 销毁大门物理墙
    if (this.gateWall) {
      this.gateWall.destroy();
      this.gateWall = null;
    }
    if (this.xiyaSprite) { this.xiyaSprite.destroy(); this.xiyaSprite = null; }
    this.removeTutorialHint();
    play('harvest');
    addItem('manor_key', -1);
    advanceStory(); // → gate_opened

    this.storyDialogue!.play(GATE_OPENED_DIALOGUE, () => {
      addItem('old_hoe', 1);
      advanceStory(); // → clear_land
      this.tutorialProgress = 0;
      // 大门地图 → 提示去农场；农场地图 → 提示锄地
      if (this.mapKey === 'gate') {
        this.showTutorialHint('→ 大门已开，穿过大门前往庄园');
      } else {
        this.showTutorialHint(this.hintText('→ 对着农田区域按 [E] 锄地，清理 3 块土地', '→ 对着农田区域点「交互」锄地，清理 3 块土地'));
      }
      this.updateHUD();
    });
    return true;
  }

  /** 教程中锄地/播种/浇水的进度检测 */
  private checkTutorialProgress(action: 'till' | 'sow' | 'water'): void {
    const step = getStoryStep();
    if (step === 'done') return;

    if (step === 'clear_land' && action === 'till') {
      this.tutorialProgress++;
      this.showTutorialHint(`→ 清理土地 ${this.tutorialProgress}/${this.TUTORIAL_TARGET}`);
      if (this.tutorialProgress >= this.TUTORIAL_TARGET) {
        this.removeTutorialHint();
        this.tutorialProgress = 0;
        addItem('radish_seed', 3);
        advanceStory(); // → sow_seeds
        this.storyDialogue!.play(SOW_SEEDS_DIALOGUE, () => {
          this.showTutorialHint(this.hintText('→ 按 [R] 切换到萝卜种子，播种 3 块土地', '→ 对着锄过的土地点「交互」播种萝卜（默认种子），播种 3 块土地'));
          this.updateHUD();
        });
      }
      return;
    }

    if (step === 'sow_seeds' && action === 'sow') {
      this.tutorialProgress++;
      this.showTutorialHint(`→ 播种 ${this.tutorialProgress}/${this.TUTORIAL_TARGET}`);
      if (this.tutorialProgress >= this.TUTORIAL_TARGET) {
        this.removeTutorialHint();
        this.tutorialProgress = 0;
        addItem('old_watering_can', 1);
        advanceStory(); // → water_crops
        this.storyDialogue!.play(WATER_CROPS_DIALOGUE, () => {
          this.showTutorialHint(this.hintText('→ 对已播种的土地按 [E] 键浇水', '→ 对已播种的土地点「交互」浇水'));
          this.updateHUD();
        });
      }
      return;
    }

    if (step === 'water_crops' && action === 'water') {
      this.tutorialProgress++;
      this.showTutorialHint(`→ 浇水 ${this.tutorialProgress}/${this.TUTORIAL_TARGET}`);
      if (this.tutorialProgress >= this.TUTORIAL_TARGET) {
        this.removeTutorialHint();
        advanceStory(); // → evening_talk
        this.storyDialogue!.play(EVENING_DIALOGUE, () => {
          this.showTutorialHint(this.hintText('→ 回到床前按 [E] 睡觉，结束第一天', '→ 回到屋内床前点「交互」睡觉，结束第一天'));
          this.updateHUD();
        });
      }
      return;
    }
  }

  /** 教程晚间睡觉 */
  private tryTutorialSleep(): boolean {
    if (getStoryStep() !== 'evening_talk') return false;
    this.sleeping = true;
    try {
      advanceStory(); // → done
      addItem('old_axe', 1); // 完成教程赠送斧头（解锁砍树玩法）
      this.removeTutorialHint();
      this.showDialogueText('第一天：归乡 — 游戏保存中…');
      timeNextDay();
      resetStamina();
      resetOres();
      refreshDailyQuests();
      injectGuideQuests(); // 教程完成 → 投放挖矿/砍树引导任务（此时已获得斧头）
      this.createDailyQuestPanel();
      this.refreshFarmVisual();
      this.rebuildNPCs();
      save({
        x: this.player.x, y: this.player.y,
        scene: this.mapKey, facing: this.player.facing,
        dailyQuest: getDailyQuestSaveData(),
      } as any);
      this.updateHUD();
      return true;
    } finally {
      this.sleeping = false;
    }
  }

  /**
   * 刷新任务目标 HUD（右上角）
   */
  updateQuestHUD(): void {
    this.hudQuestDom.textContent = `任务：${getQuestObjective()}`;
  }

  /** 触屏背包按钮：对话/面板/切图期间不响应（对应键盘 B） */
  private tryOpenBackpack(): void {
    if (this.transitioning) return;
    if (this.storyDialogue && this.storyDialogue.isOpen()) return;
    if (this.shopPanel.isOpen() || this.backpackPanel.isOpen() || this.questPanel.isOpen()) return;
    this.inputManager.clearAction();
    this.backpackPanel.open();
  }

  /** 触屏任务按钮：对话/面板/切图期间不响应（对应键盘 J，打开任务面板 QuestPanel） */
  private tryOpenQuest(): void {
    if (this.transitioning) return;
    if (this.storyDialogue && this.storyDialogue.isOpen()) return;
    if (this.shopPanel.isOpen() || this.backpackPanel.isOpen()) return;
    this.inputManager.clearAction();
    this.questPanel.open();
  }

  /** 教程提示文案：移动端（无键盘）与桌面端差异 */
  private hintText(pc: string, mob: string): string {
    return isMobileLayout() ? mob : pc;
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
    const wrapWidth = mobile ? this.scale.width - 120 : 300;

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
   * BUG-026 A1：无效操作反馈——目标格短暂红闪 + 低音（区分成功反馈）
   * 用独立闪烁矩形叠加，不改原 rect 的 fillStyle，避免破坏格子恢复逻辑
   */
  private flashTileError(col: number, row: number): void {
    const cx = col * TILE_SIZE + TILE_SIZE / 2;
    const cy = row * TILE_SIZE + TILE_SIZE / 2;
    const flash = this.add
      .rectangle(cx, cy, TILE_SIZE, TILE_SIZE, 0xff6b5e, 0.55)
      .setDepth(4)
      .setScrollFactor(1);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 260,
      onComplete: () => flash.destroy(),
    });
    play('invalid');
  }

  /**
   * BUG-026 A2：格子处成功飘字（播种/收获/浇水等奖励瞬间）
   * 在世界坐标格子处上浮淡出；带描边保证可读性
   */
  private showFloatText(worldX: number, worldY: number, text: string, color = '#ffe082'): void {
    const t = this.add
      .text(worldX, worldY - 4, text, {
        fontFamily: 'Arial',
        fontSize: '13px',
        fontStyle: 'bold',
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(201)
      .setScrollFactor(1);
    this.tweens.add({
      targets: t,
      y: t.y - 22,
      alpha: 0,
      duration: 900,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  /** v0.5.3：NPC 每日随机句的"当天已说过"内存标记（不进入存档） */
  private npcDailySaid = new Map<string, number>();

  /**
   * 播放 NPC 对话（靠近 NPC 按 E 触发，全屏打字机剧本）
   * 使用 StoryDialogue 全屏播放 npc.dialogues
   * v0.5.3：当日首次对话时，在固定对白之后追加一句随机生活台词
   */
  private showDialogue(npc: NPC): void {
    if (!this.storyDialogue) this.storyDialogue = new StoryDialogue();
    // v0.5.3 剧情密度：当日首次对话时追加随机生活句（只对老张/小梅/阿风）
    let lines = npc.dialogues;
    const today = getTime().day;
    if (this.npcDailySaid.get(npc.id) !== today) {
      const daily = getDailyNpcLine(npc.id, today);
      if (daily) {
        lines = [...npc.dialogues, ...daily];
        this.npcDailySaid.set(npc.id, today);
      }
    }
    // v0.5.3 剧情密度 E6：观星夜后少女追加一句（仅观星完成，追加到固定对话末尾）
    if (npc.id === 'mystery' && isObservatoryComplete()) {
      lines = [...lines, ...getMysteryAfterObservatory()];
    }
    this.storyDialogue.play(lines, () => {
      // 商店老板：对话结束后自动打开商店
      if (npc.id === 'shopkeeper') {
        this.inputManager.clearAction();
        this.shopPanel.open();
      }
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
        const crop = this.add.image(cx, cy, 'crops', 0);
        crop.setScale(0.5);
        crop.setDepth(3);
        crop.setVisible(false);
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
    // 作物标记：planted/watered/grown 显示像素作物
    const hasCrop = state === 'planted' || state === 'watered' || state === 'grown';
    visual.crop.setVisible(hasCrop);
    if (hasCrop) {
      const cropData = getCrop(col, row);
      const cropType = cropData?.cropType ?? 'radish';
      const cropIdx = CROP_TYPES.indexOf(cropType);
      if (state === 'grown') {
        visual.crop.setFrame(cropIdx * 3 + 2);
      } else if (state === 'watered') {
        visual.crop.setFrame(cropIdx * 3 + 1);
      } else {
        visual.crop.setFrame(cropIdx * 3 + 0);
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
    const coins = `${itemIconHtml('coin', 13)}${getCoins()}`;
    const diamonds = `${itemIconHtml('diamond', 13)}${getItemCount('diamond')}`;
    const stamina = `${itemIconHtml('stamina', 13)}${getStamina()}/${MAX_STAMINA}`;
    const lv = `Lv.${getLevel()}`;
    const seedDef = CROP_DEFS[this.selectedCropType];
    const seedItem = seedDef.seedItem as any;
    const seedInfo = `${itemIconHtml(seedItem, 13)}${seedDef.name}:${getItemCount(seedItem)}`;
    // 农场触屏：种子切换按钮显示当前种子 + 库存（仅触屏设备）
    if (this.seedSwitchBtn) {
      const show = isTouchDevice() && this.mapKey === 'farm';
      this.seedSwitchBtn.style.display = show ? 'block' : 'none';
      if (show) this.seedSwitchBtn.innerHTML = `${itemIconHtml(seedItem, 14)} ${seedDef.name} ×${getItemCount(seedItem)} ▾`;
    }
    if (isMobileLayout()) {
      if (this.mapKey === 'farm') {
        this.hudAreaDom.innerHTML = `${name} ${day} ${lv} | ${seedInfo} ${coins} ${diamonds}`;
      } else {
        this.hudAreaDom.innerHTML = `${name} ${day} ${lv} | ${stamina} ${coins} ${diamonds}`;
      }
    } else {
      if (this.mapKey === 'farm') {
        this.hudAreaDom.innerHTML =
          `${name} | ${day} | ${lv} | WASD/E交互 | R切换:${seedInfo} | ${coins} | ${diamonds} | 出口切换`;
      } else {
        this.hudAreaDom.innerHTML = `${name} | ${day} | ${lv} | ${stamina} | WASD 移动 | ${coins} | ${diamonds} | 出口切换`;
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
    // 1. 睡觉点检测：
    //    house → 真实床铺（Ground gid 9）；farm → 木屋地板（Walls gid 6）
    //    判定：站在床格上，或站在床格相邻 1 格内即可（触屏操作精度宽容，无需精确面向）
    if (this.mapKey === 'house' || this.mapKey === 'farm') {
      const pc = Math.floor(this.player.x / TILE_SIZE);
      const pr = Math.floor(this.player.y / TILE_SIZE);
      const onBed = this.bedTiles.has(`${pc},${pr}`);
      // BUG-032 修复：farm 木屋地板整体即睡觉区（6×5=30 格，触屏精度足够），必须站在地板上（onBed）
      // 才能睡；"相邻 1 格"放宽仅保留给 house 真实床铺（2×2 小区域，且 house 为封闭场景无外扩风险），
      // 避免判定外扩到石墙外——玩家站在木屋旁（row 18 屋外 / 门口外侧）误触睡觉跨天。
      const nearBed = this.mapKey === 'house' && this.isNearBedTile(pc, pr);
      if (onBed || nearBed) {
        console.log(`[MapScene] 床交互触发 player=(${this.player.x},${this.player.y}) tile=(${pc},${pr}) onBed=${onBed} nearBed=${nearBed} step=${getStoryStep()} sleeping=${this.sleeping}`);
        // 防重复睡觉（移动端触屏双击发防护）
        if (this.sleeping) {
          console.log('[MapScene] 睡觉中，忽略重复触发');
          return;
        }
        // 教程中：只有 evening_talk 允许睡觉；提前睡觉不跨天（防止存档卡死：
        // 播种后未浇水就睡 → 次日作物已熟/无种子，教程永久无法完成）
        if (!isTutorialDone() && getStoryStep() !== 'evening_talk') {
          this.showDialogueText('还不到睡觉的时候……先把今天的农活做完吧。');
          return;
        }
        // 教程：晚间睡觉 → 结束教程
        if (!isTutorialDone() && this.tryTutorialSleep()) return;
        this.trySleep();
        return;
      }
    }

    // 1.5 Demo 结尾：观星点（主线完成 + 夜晚 + 靠近观星点按 E）
    if (this.tryStargaze()) return;

    // 0.3 教程：夏雅交互（大门地图优先于普通 NPC）
    if ((this.mapKey === 'gate' || this.mapKey === 'farm') && this.xiyaSprite) {
      if (this.tryXiyaInteract()) return;
    }

    // v0.5.3 剧情密度 E1：清晨偶遇夏雅（教程完成后，仅清晨 06-08 时）
    if (this.mapKey === 'farm' && this.dawnXiya) {
      if (this.tryDawnXiyaInteract()) return;
    }

    // v0.5.3 剧情密度 E9：傍晚关心夏雅（教程完成后，仅傍晚 18-20 时）
    if (this.mapKey === 'farm' && this.eveningXiya) {
      if (this.tryEveningXiyaInteract()) return;
    }

    // v0.5.3 剧情密度 E5：爷爷的笔记（庄园角落可读物件）
    if (this.mapKey === 'farm' && this.grandpaNote) {
      if (this.tryGrandpaNoteInteract()) return;
    }

    // M1-3 爷爷旧花园恢复点（未恢复时靠近按 E 三阶段清理）
    if (this.mapKey === 'farm' && this.gardenRestore && this.gardenRestore.stage < 3) {
      if (this.tryGardenRestoreInteract()) return;
    }

    // M1-3 夏雅见证（花园恢复后，夏雅在花园旁，靠近按 E 播放生活记忆对白）
    if (this.mapKey === 'farm' && this.gardenXiya) {
      if (this.tryGardenXiyaInteract()) return;
    }

    // 农场商店摊位（靠近按 E 打开 ShopPanel，优先于 NPC/农田交互）
    if (this.mapKey === 'farm' && this.farmShop) {
      if (this.tryFarmShopInteract()) return;
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
      console.log(`[DEBUG] tryInteract NPC: ${nearest.id} at (${nearest.sprite?.x},${nearest.sprite?.y})`);
      // 通知每日任务：与 NPC 对话 + 刷新面板
      onDQTAlkNpc(nearest.id);
      this.updateDailyQuestPanel();
      // 村长对话：根据任务状态播放完整剧情剧本（StoryDialogue 全屏）
      if (nearest.id === 'elder') {
        if (!this.storyDialogue) this.storyDialogue = new StoryDialogue();
        this.storyDialogue.play(getElderDialogue(), () => {
          this.updateQuestHUD();
          this.updateHUD();
          // 里程碑保存（v0.5.2 P0）：主线交付后立即入档
          save({
            x: this.player.x, y: this.player.y,
            scene: this.mapKey, facing: this.player.facing,
            dailyQuest: getDailyQuestSaveData(),
          });
        });
      } else if (nearest.id === 'shopkeeper') {
        // 商人：先播放欢迎剧本，对话结束后自动打开商店
        this.showDialogue(nearest);
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
        // 首次交互先播"程序员能力展示"对话，结束后自动采集（无需二次按键）
        if (!this.shardDialoguePlayed) {
          this.shardDialoguePlayed = true;
          if (!this.storyDialogue) this.storyDialogue = new StoryDialogue();
          this.storyDialogue.play(FOREST_SHARD_DIALOGUE, () => {
            this.doCollectShard();
          });
        }
        return;
      }
    }

    // 0.6 矿洞挖矿：靠近矿脉 E 键开采
    if (this.mapKey === 'mine') {
      // 挖矿引导（仅第一次在矿脉旁交互时触发，对话结束后本次不开采，需再按一次）
      const nearOre = this.oreSprites.some((e) => {
        if (!e.sprite.visible) return false;
        const dx = this.player.x - e.sprite.x;
        const dy = this.player.y - e.sprite.y;
        return dx * dx + dy * dy < 24 * 24;
      });
      if (nearOre && !this.mineTipShown) {
        this.mineTipShown = true;
        if (!this.storyDialogue) this.storyDialogue = new StoryDialogue();
        this.storyDialogue.play(MINE_TIP_DIALOGUE);
        return;
      }
      this.tryMine();
      return;
    }

    if (this.mapKey !== 'farm') return;

    // 砍树检测（农场树木，靠近按 E 砍伐，优先于农田交互）
    if (this.tryChopTree()) return;

    // 农田交互：根据面前格子状态自动判断锄地/播种/浇水/收获
    this.tryFarmInteract();
  }

  /**
   * 睡觉：TimeSystem.nextDay() → FarmState.advanceDay()
   * 时间重置为次日 06:00，作物成长结算
   * 同时刷新 NPC 日程（次日 06:00 NPC 回到 farm 出生点）
   */
  private trySleep(): void {
    this.sleeping = true;
    try {
      timeNextDay();
      resetStamina();
      resetOres();
      let treesRefreshed = false;
      if (getTime().day % TREE_REFRESH_INTERVAL === 0) {
        refreshStumps();
        if (this.mapKey === 'farm') this.refreshTreeVisuals();
        treesRefreshed = true;
      }
      refreshDailyQuests();
      injectGuideQuests(); // 引导任务（挖矿/砍树）未完成时跨天保留补发，旧存档玩家也能拿到
      this.createDailyQuestPanel();
      this.refreshFarmVisual();
      this.rebuildNPCs();
      save({
        x: this.player.x, y: this.player.y,
        scene: this.mapKey, facing: this.player.facing,
        dailyQuest: getDailyQuestSaveData(),
      } as any);
      this.showDialogueText(treesRefreshed ? '已保存 Zzz... 树木也生长恢复了！' : '已保存 Zzz...');
      // P2：检查是否有成熟作物可收获
      if (this.mapKey === 'farm') {
        const readyCrops = getAllCropEntries().filter(([, c]) => {
          const def = CROP_DEFS[c.cropType];
          return def && getTime().day >= c.plantDay + def.growthDays;
        });
        if (readyCrops.length > 0) {
          setTimeout(() => this.showDialogueText(`🌱 有 ${readyCrops.length} 块作物成熟了，快去收获吧！`), 1200);
        }
      }
    } finally {
      this.sleeping = false;
    }
  }

  /**
   * 创建观星点视觉（双层光圈 + ✦ 标记，初始隐藏）
   * 主线完成 + 夜晚时由 updateStargaze 显示
   */
  private createStargazePoint(): void {
    const { x, y } = this.STARGAZE_POS;
    const outer = this.add.ellipse(x, y, 46, 46, 0x8a9bd6, 0.12);
    const inner = this.add.ellipse(x, y, 22, 22, 0xaebff5, 0.28);
    outer.setDepth(5);
    inner.setDepth(6);
    this.stargazeMark = this.add.text(x, y - 6, '✦', {
      fontFamily: 'Arial', fontSize: '20px', color: '#e8ecff',
    }).setOrigin(0.5).setDepth(7);
    this.stargazeSprites = [outer, inner];
    this.setStargazeVisible(false);
  }

  /** 控制观星点整体显隐 */
  private setStargazeVisible(visible: boolean): void {
    for (const s of this.stargazeSprites) s.setVisible(visible);
    if (this.stargazeMark) this.stargazeMark.setVisible(visible);
  }

  /** 观星点显隐 + 呼吸闪烁（每帧，仅 farm 且主线完成 + 夜晚时显示） */
  private updateStargaze(): void {
    if (this.mapKey !== 'farm' || this.stargazeSprites.length === 0) return;
    const eligible = getQuestState() === 'completed' && getTime().hour >= 20 && !isObservatoryComplete();
    const show = eligible && !(this.storyDialogue && this.storyDialogue.isOpen());
    this.setStargazeVisible(show);
    if (!show) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 400);
    this.stargazeSprites[0].setAlpha(0.08 + 0.1 * pulse);
    this.stargazeSprites[1].setAlpha(0.22 + 0.14 * pulse);
    if (this.stargazeMark) this.stargazeMark.setAlpha(0.6 + 0.4 * pulse);
  }

  /**
   * 观星交互：主线完成（第一章收束）+ 夜晚 20:00 后 + 靠近观星点按 E
   * → 播放观星收尾剧情 → 打开 Demo 结算界面（只触发一次）
   */
  private tryStargaze(): boolean {
    if (this.mapKey !== 'farm') return false;
    if (getQuestState() !== 'completed' || getTime().hour < 20 || isObservatoryComplete()) return false;
    const dx = this.player.x - this.STARGAZE_POS.x;
    const dy = this.player.y - this.STARGAZE_POS.y;
    if (dx * dx + dy * dy > 48 * 48) return false;
    if (!this.storyDialogue) this.storyDialogue = new StoryDialogue();
    markObservatoryComplete();
    this.storyDialogue.play(
      DEMO_ENDING_DIALOGUE,
      () => this.finishStargaze(),
      (index: number) => {
        const choice: EndingChoice = index === 0 ? 'try_stay' : index === 1 ? 'unknown' : 'tonight';
        setEndingChoice(choice);
        this.playStargazeAfter(DEMO_ENDING_BRANCHES[choice]);
      },
    );
    return true;
  }

  /** 观星夜跳过/未选择时走默认分支 */
  private finishStargaze(): void {
    if (getEndingChoice()) return;
    setEndingChoice('try_stay');
    this.playStargazeAfter(DEMO_ENDING_BRANCHES['try_stay']);
  }

  /** 观星夜：分支独白 → 次日清晨 → 结算面板 + 存档 */
  private playStargazeAfter(branch: DialogueLine[]): void {
    if (!this.storyDialogue) return;
    this.storyDialogue.play(branch, () => {
      this.storyDialogue!.play(DEMO_ENDING_FINALE, () => {
        this.updateHUD();
        if (!this.endingPanel) this.endingPanel = new EndingPanel();
        save({ x: this.player.x, y: this.player.y, scene: this.mapKey, facing: this.player.facing } as any);
        this.endingPanel.open();
      });
    });
  }

  /** 采集星之碎片（森林对话结束后自动执行） */
  private doCollectShard(): void {
    collectShard();
    this.shardSprite?.destroy();
    this.shardSprite = null;
    addItem('star_shard', 1);
    onDQCollect('star_shard');
    this.updateDailyQuestPanel();
    this.showDialogueText('采集到「星之碎片」！返回村长交付任务。');
    this.updateQuestHUD();
    // 里程碑保存（v0.5.2 P0）：碎片采集后立即入档
    save({
      x: this.player.x, y: this.player.y,
      scene: this.mapKey, facing: this.player.facing,
      dailyQuest: getDailyQuestSaveData(),
    });
  }

  /**
   * 收集屋内真实床铺格（Ground 层 gid 9）。
   * 扫描睡觉判定格：
   *   house → Ground 层 gid 9（真实床铺）
   *   farm  → Walls 层 gid 6（木屋地板；教程提示在 farm，玩家在木屋内按 E 即可睡觉）
   * 扫描失败时回退到已知区域（house cols 2-3, rows 2-3；farm cols 3-8, rows 19-23），保证睡觉判定不失效。
   */
  private collectBedTiles(map: Phaser.Tilemaps.Tilemap): void {
    this.bedTiles.clear();
    // house: Ground 层 gid 9；farm: Walls 层 gid 6
    const targetLayerName = this.mapKey === 'house' ? 'Ground' : 'Walls';
    const targetGid = this.mapKey === 'house' ? 9 : 6;
    for (const layerData of map.layers) {
      if (layerData?.name !== targetLayerName) continue;
      const data = layerData?.data;
      if (!data) continue;
      for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
          if (data[r][c]?.index === targetGid) {
            this.bedTiles.add(`${c},${r}`);
          }
        }
      }
    }
    if (this.bedTiles.size === 0) {
      if (this.mapKey === 'house') {
        for (let c = 2; c <= 3; c++) {
          for (let r = 2; r <= 3; r++) {
            this.bedTiles.add(`${c},${r}`);
          }
        }
      } else {
        for (let c = 3; c <= 8; c++) {
          for (let r = 19; r <= 23; r++) {
            this.bedTiles.add(`${c},${r}`);
          }
        }
      }
    }
    console.log(`[MapScene:${this.mapKey}] 睡觉判定格 ${this.bedTiles.size} 个`);
  }

  /** 玩家所在格是否在任一床铺格的相邻 1 格内（含床格本身） */
  private isNearBedTile(pc: number, pr: number): boolean {
    for (const key of this.bedTiles) {
      const [c, r] = key.split(',').map(Number);
      if (Math.abs(pc - c) <= 1 && Math.abs(pr - r) <= 1) return true;
    }
    return false;
  }

  /**
   * 刷新树木视觉（树桩恢复为树后更新贴图）
   * 仅更新当前贴图为 stump 但状态已恢复的精灵
   */
  private refreshTreeVisuals(): void {
    for (const [key, sprite] of this.treeSprites) {
      const [col, row] = key.split(',').map(Number);
      const tree = getTree(col, row);
      if (!tree) continue;
      if (!tree.isStump && sprite.texture.key === 'stump') {
        const textureKey = (col + row) % 2 === 0 ? 'tree1' : 'tree2';
        sprite.setTexture(textureKey);
      }
    }
  }

  /**
   * 重建当前场景的 NPC（睡觉/时间跳变后调用）
   * 销毁旧 sprite，按新日程重新创建
   */
  rebuildNPCs(): void {
    for (const npc of this.npcList) {
      // v0.6 阶段 2a：销毁前先停止 idle tween（防止 sprite 引用失效后崩溃）
      npc.stopIdleAnimation();
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
    // v0.5.3 E1：跨天后重新判断清晨夏雅（清空旧精灵 + 按新天数重建）
    this.clearDawnXiya();
    // v0.5.3 E9：跨天后重新判断傍晚夏雅
    this.clearEveningXiya();
    if (this.mapKey === 'farm' && isTutorialDone()) {
      this.setupDawnXiya();
      this.setupEveningXiya();
    }
    // v0.5.3 E5：跨天后刷新爷爷笔记（按新天数轮换，重建精灵保持坐标）
    if (this.mapKey === 'farm') {
      this.clearGrandpaNote();
      this.setupGrandpaNote();
    }
  }

  /** 清除清晨夏雅精灵（场景切换/跨天时调用） */
  private clearDawnXiya(): void {
    if (this.dawnXiya) { this.dawnXiya.destroy(); this.dawnXiya = null; }
    if (this.dawnXiyaLabel) { this.dawnXiyaLabel.destroy(); this.dawnXiyaLabel = null; }
  }

  /** v0.5.3 剧情密度 E5：创建爷爷的笔记（庄园左上角落可读物件，纸面风 label） */
  private setupGrandpaNote(): void {
    if (this.mapKey !== 'farm') return;
    // 位置 (1,6)：远离第一棵树 (2,3)（原 (1,3) 距树仅 17.9px，会抢占砍树引导）
    const nx = 1 * TILE_SIZE + TILE_SIZE / 2;
    const ny = 6 * TILE_SIZE + TILE_SIZE / 2;
    const note = this.add.ellipse(nx, ny, 16, 16, 0xe8d8a8, 0.55);
    note.setDepth(3);
    const mark = this.add.text(nx, ny - 8, '笔记', {
      fontFamily: 'Arial', fontSize: '10px', color: '#e8d8a8',
    }).setOrigin(0.5).setDepth(4);
    // 交互基准用椭圆实际坐标（label 相对偏移 -8px，用它判定会偏上）
    this.grandpaNote = mark;
    this.grandpaNotePos = { x: nx, y: ny };
  }

  /** 与爷爷笔记交互（靠近按 E → 播放当天一条笔记） */
  private tryGrandpaNoteInteract(): boolean {
    if (!this.grandpaNote || !this.grandpaNote.visible) return false;
    const p = this.grandpaNotePos;
    const dx = this.player.x - p.x;
    const dy = this.player.y - p.y;
    if (dx * dx + dy * dy > 28 * 28) return false;
    if (!this.storyDialogue) this.storyDialogue = new StoryDialogue();
    const note = getGrandpaNote(getTime().day);
    this.storyDialogue.play([note], () => {
      this.updateHUD();
    });
    return true;
  }

  /** 清除爷爷笔记精灵（场景切换/跨天时调用） */
  private clearGrandpaNote(): void {
    if (this.grandpaNote) { this.grandpaNote.destroy(); this.grandpaNote = null; }
  }

  // ============ M1-3 爷爷旧花园恢复点 ============

  /**
   * 初始化爷爷旧花园恢复点（farm 木屋左侧 col 1 / rows 18-22）。
   * 注意：实际地图木屋石墙（Walls gid 3 碰撞）在 col 2（rows 19-23），
   * 花园可用空间仅 col 1 一列，交互锚点必须选在可走格、且距床铺格（gid 6）≥2 格，
   * 否则 tryInteract 的床铺分支（优先于花园分支）会拦截按 E。
   * 恢复前：荒土瓦片（gid 2）+ 倒木/破花架/荒草（Graphics）
   * 恢复后：花丛（gid 8）+ 小路（gid 7）+ 蝴蝶
   * 状态持久化：FarmRestore.isRestored('garden')，刷新/重进保持恢复态。
   */
  private setupGardenRestore(): void {
    if (this.mapKey !== 'farm') return;
    const T = TILE_SIZE;
    const restored = isRestored('garden');
    this.gardenRestore = {
      stage: restored ? 3 : 0,
      debris: [],
      butterflies: [],
      mark: null,
      // 区域中心（col 1, row 20）作交互基准：可走格，距床格 (3,20) 两格
      pos: { x: 1 * T + T / 2, y: 20 * T + T / 2 },
    };
    if (restored) {
      this.buildGardenRestored();
    } else {
      this.buildGardenRuined();
    }
  }

  /** 恢复前视觉：荒土瓦片 + 三组装饰（倒木/破花架/荒草）+ 交互提示标记 */
  private buildGardenRuined(): void {
    const g = this.gardenRestore;
    if (!g) return;
    const T = TILE_SIZE;
    // 荒土（gid 2）：col 1, rows 18-22（col 2 是木屋石墙，不可占用）
    for (let r = 18; r <= 22; r++) {
      this.groundLayer.putTileAt(2, 1, r);
    }
    // 组1 倒木：横躺木段 ×2
    const log = this.add.graphics();
    log.fillStyle(0x8d6e4a, 1);
    log.fillRoundedRect(-9, -3, 18, 6, 3);
    log.setPosition(1 * T + T / 2, 18 * T + T / 2);
    log.setRotation(-0.25);
    log.setDepth(3);
    // 组2 破花架：歪斜木架（两竖 + 横梁）
    const frame = this.add.graphics();
    frame.fillStyle(0x9c7b52, 1);
    frame.fillRect(-1, -7, 2, 14);
    frame.fillRect(5, -7, 2, 14);
    frame.fillRect(-1, -7, 8, 2);
    frame.setPosition(1 * T + T / 2, 21 * T + T / 2);
    frame.setRotation(0.3);
    frame.setDepth(3);
    // 组3 荒草：绿色短线 ×5
    const weeds = this.add.graphics();
    weeds.fillStyle(0x7a9a4a, 1);
    for (let i = 0; i < 5; i++) {
      weeds.fillRect(-12 + i * 6, 0, 1, 4 + (i % 3) * 2);
    }
    weeds.setPosition(1 * T + T / 2, 22 * T + T / 2);
    weeds.setDepth(3);
    g.debris = [log, frame, weeds];
    // 交互提示标记
    g.mark = this.add.text(g.pos.x, g.pos.y - 10, '旧花圃', {
      fontFamily: 'Arial', fontSize: '10px', color: '#e8d8a8',
    }).setOrigin(0.5).setDepth(4);
  }

  /** 恢复后视觉：清除荒土 → 花丛 + 小路 + 蝴蝶 */
  private buildGardenRestored(): void {
    const T = TILE_SIZE;
    // 荒土（gid 2）→ 草地（gid 1）：col 1, rows 18-22
    for (let r = 18; r <= 22; r++) {
      this.groundLayer.putTileAt(1, 1, r);
    }
    // 小路（gid 7）：col 1, rows 19-21
    for (let r = 19; r <= 21; r++) {
      this.groundLayer.putTileAt(7, 1, r);
    }
    // 花丛（gid 8）：col 1 交错 3 朵（不可放 col 2，会覆盖木屋石墙 gid 3 破坏碰撞）
    const flowerSpots: [number, number][] = [
      [1, 18], [1, 20], [1, 22],
    ];
    for (const [c, r] of flowerSpots) {
      this.wallsLayer.putTileAt(8, c, r);
    }
    // 提示标记消失
    if (this.gardenRestore?.mark) {
      this.gardenRestore.mark.destroy();
      this.gardenRestore.mark = null;
    }
    // 蝴蝶 ×2（花丛间飞）
    this.createButterfly(1 * T + T / 2, 18 * T + T / 2);
    this.createButterfly(1 * T + T / 2, 22 * T + T / 2);
  }

  /** 创建一只蝴蝶（Graphics 双翼 + 扇动/绕飞 tween，随场景 shutdown 自动销毁） */
  private createButterfly(x: number, y: number): void {
    const wings = this.add.graphics();
    wings.fillStyle(0xffd6a5, 1);
    wings.fillEllipse(-3, 0, 6, 4);
    wings.fillEllipse(3, 0, 6, 4);
    wings.fillStyle(0xff9e80, 1);
    wings.fillCircle(0, 0, 1);
    const c = this.add.container(x, y, [wings]);
    c.setDepth(4);
    this.tweens.add({
      targets: wings,
      scaleX: { from: 1, to: 0.25 },
      duration: 130, yoyo: true, repeat: -1,
    });
    this.tweens.add({
      targets: c,
      x: x + 8, y: y - 6,
      duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
    this.gardenRestore?.butterflies.push(c);
  }

  /** 与旧花园交互：未恢复时靠近按 E，三阶段清理推进（0→1 倒木 →2 破花架 →3 花丛） */
  private tryGardenRestoreInteract(): boolean {
    const g = this.gardenRestore;
    if (!g || g.stage >= 3) return false;
    const dx = this.player.x - g.pos.x;
    const dy = this.player.y - g.pos.y;
    if (dx * dx + dy * dy > 34 * 34) return false;

    const next = g.stage + 1;
    const msgs = [
      '这里乱糟糟的……像是很久没人打理了。',
      '把破花架也收拾一下吧。',
      '重新翻土，种上花。',
    ];
    this.showDialogueText(msgs[next - 1]);
    g.debris[next - 1]?.destroy();
    g.stage = next;
    if (next === 3) {
      this.buildGardenRestored();
      markRestored('garden');
      // 里程碑入档：恢复完成后立即保存（刷新/重进保持恢复态）
      save({
        x: this.player.x, y: this.player.y,
        scene: this.mapKey, facing: this.player.facing,
        dailyQuest: getDailyQuestSaveData(),
      } as any);
      setTimeout(() => this.showDialogueText('爷爷的花园又活过来了！🌼'), 1400);
      // M1-3 夏雅见证：恢复完成的瞬间，夏雅走到花园旁（无需等待特定时段）
      this.spawnGardenXiya();
    }
    return true;
  }

  /**
   * M1-3 夏雅见证：花园恢复完成后，夏雅在花园旁出现（col 2, row 20 东侧空地），
   * 玩家靠近按 E 播放 GARDEN_RESTORED_XIYA_DIALOGUE（生活记忆对白，A/B 类，无任务/存档字段）。
   * 一次性：触发后销毁，跨天/重进不重复（依赖 isRestored('garden') 已在存档）。
   */
  private spawnGardenXiya(): void {
    if (this.mapKey !== 'farm' || this.gardenXiya) return;
    const T = TILE_SIZE;
    const dx = 2 * T + T / 2;
    const dy = 20 * T + T / 2;
    this.gardenXiya = this.add.sprite(dx, dy, 'npc_xiya');
    this.gardenXiya.setScale(0.5).setDepth(5);
    this.gardenXiya.setFlipX(true);
    this.gardenXiyaLabel = this.add.text(dx, dy - 14, '夏雅', {
      fontSize: '13px', color: '#f0a050',
      stroke: '#000000', strokeThickness: 3,
      backgroundColor: 'rgba(0,0,0,0.45)',
      padding: { x: 3, y: 2 },
    }).setShadow(0, 1, '#000000', 2).setOrigin(0.5).setDepth(6);
  }

  /** 与花园旁夏雅交互（靠近按 E → 播放见证对白，一次性销毁） */
  private tryGardenXiyaInteract(): boolean {
    if (!this.gardenXiya || !this.gardenXiya.visible) return false;
    const dx = this.player.x - this.gardenXiya.x;
    const dy = this.player.y - this.gardenXiya.y;
    if (dx * dx + dy * dy > 28 * 28) return false;

    this.gardenXiya.destroy();
    this.gardenXiya = null;
    if (this.gardenXiyaLabel) { this.gardenXiyaLabel.destroy(); this.gardenXiyaLabel = null; }
    if (!this.storyDialogue) this.storyDialogue = new StoryDialogue();
    this.storyDialogue.play(GARDEN_RESTORED_XIYA_DIALOGUE, () => {
      this.updateHUD();
    });
    return true;
  }

  /** 清除花园旁夏雅精灵（场景切换/跨天时调用） */
  private clearGardenXiya(): void {
    if (this.gardenXiya) { this.gardenXiya.destroy(); this.gardenXiya = null; }
    if (this.gardenXiyaLabel) { this.gardenXiyaLabel.destroy(); this.gardenXiyaLabel = null; }
  }

  // ============ 农场商店摊位 ============

  /**
   * 创建农场商店摊位（v0.6 商店入口：靠近按 E 打开 ShopPanel）
   * 位置：农田右下方空地 (col 24, row 18)，与农田（rows 8-16）隔开约 2 格，
   *   避开玩家出生点 (col 20, row 18.75) / 树木 / 水塘，摊位主体不压在土地上。
   * 纯视觉（Graphics 柜台 + 文字标签），不放瓦片——
   * 原因：Walls 层 gid 6 是睡觉判定格（会误判睡觉）、gid 3 石墙会挡路挡碰撞。
   */
  private setupFarmShop(): void {
    const T = TILE_SIZE;
    const x = 24 * T + T / 2; // 392
    const y = 18 * T + T / 2; // 296
    const g = this.add.graphics();
    g.setDepth(3);
    // 遮阳棚（红底 + 白条纹）
    g.fillStyle(0xc0392b, 1);
    g.fillRect(x - 22, y - 16, 44, 7);
    g.fillStyle(0xf5f5f5, 1);
    g.fillRect(x - 16, y - 16, 6, 7);
    g.fillRect(x - 4, y - 16, 6, 7);
    g.fillRect(x + 8, y - 16, 6, 7);
    // 支撑柱（左右）
    g.fillStyle(0x6b4a2a, 1);
    g.fillRect(x - 20, y - 9, 3, 15);
    g.fillRect(x + 17, y - 9, 3, 15);
    // 柜台（木色桌面 + 深色台沿）
    g.fillStyle(0x8a5a33, 1);
    g.fillRect(x - 22, y - 8, 44, 9);
    g.fillStyle(0x6b4423, 1);
    g.fillRect(x - 22, y - 1, 44, 2);
    // 柜台货品（萝卜红 / 叶绿 / 玉米黄 三色点）
    g.fillStyle(0xe74c3c, 1);
    g.fillCircle(x - 12, y - 3, 2.5);
    g.fillStyle(0x2ecc71, 1);
    g.fillCircle(x - 2, y - 3, 2.5);
    g.fillStyle(0xf1c40f, 1);
    g.fillCircle(x + 8, y - 3, 2.5);
    // 标签（放摊位下方空地，不压农田）
    const mark = this.add.text(x, y + 16, '商店', {
      fontFamily: 'Arial',
      fontSize: '10px',
      color: '#ffe082',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(4);
    this.farmShop = { mark, stall: g, pos: { x, y } };
  }

  /** 与农场商店摊位交互（靠近按 E → 打开 ShopPanel） */
  private tryFarmShopInteract(): boolean {
    if (!this.farmShop) return false;
    const dx = this.player.x - this.farmShop.pos.x;
    const dy = this.player.y - this.farmShop.pos.y;
    // 半径 32px（约 2 格）：农田 row 16 面向下、摊位两侧走道均能触发
    if (dx * dx + dy * dy > 32 * 32) return false;
    this.inputManager.clearAction();
    this.shopPanel.open();
    return true;
  }

  /**
   * 更新农田选中高亮（每帧跟随玩家面向的格子）
   * 仅农场场景生效，且仅在目标格可执行操作时显示（锄地/播种/浇水/收获）
   * 移动端：让玩家明确"当前操作会影响哪一格"
   */
  private updateTargetHighlight(): void {
    if (this.mapKey !== 'farm' || !this.targetHighlight) return;
    // 点击种田后的短暂反馈高亮（不被每帧面向高亮覆盖）
    if (this.tapFlashUntil > this.time.now && this.tapFlashKey) {
      const [fc, fr] = this.tapFlashKey.split(',').map(Number);
      if (this.targetHighlight.active) {
        this.targetHighlight.setVisible(true);
        this.targetHighlight.setPosition(fc * TILE_SIZE + TILE_SIZE / 2, fr * TILE_SIZE + TILE_SIZE / 2);
        const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 150);
        this.targetHighlight.setAlpha(0.45 + 0.25 * pulse);
      }
      return;
    }
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
    // 不在耕地区或该格当前无操作可执行 → 隐藏高亮
    if (!isInFarmArea(tc, tr) || !this.isTileActionable(tc, tr)) {
      this.targetHighlight.setVisible(false);
      return;
    }
    this.targetHighlight.setVisible(true);
    this.targetHighlight.setPosition(tc * TILE_SIZE + TILE_SIZE / 2, tr * TILE_SIZE + TILE_SIZE / 2);
    // 呼吸脉动：让目标框更醒目（玩家注意力集中在目标格）
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 220);
    this.targetHighlight.setAlpha(0.35 + 0.2 * pulse);
  }

  /**
   * 目标格当前是否可执行操作（与 tryFarmInteract 的判定一致）：
   *   empty   → 可锄地
   *   tilled  → 有种子才可播种
   *   planted → 可浇水
   *   grown   → 可收获
   *   watered → 等待次日成长，不可操作
   */
  private isTileActionable(col: number, row: number): boolean {
    const state = getTileState(col, row);
    if (state === 'empty') return true;
    if (state === 'tilled') {
      // 播种需要至少一种种子库存（与 tryFarmInteract 的播种分支一致）
      for (const ct of CROP_TYPES) {
        if (getItemCount(CROP_DEFS[ct].seedItem as any) > 0) return true;
      }
      return false;
    }
    if (state === 'planted') return true;
    if (state === 'grown') return true;
    return false;
  }

  /**
   * 挖矿：靠近矿脉按 E 开采
   * 消耗体力 → 获得矿石 → 矿脉消失（当日不再刷新）
   */
  private tryMine(): void {
    // 找最近的矿脉（24px 范围内）
    let target: { deposit: OreDeposit; sprite: Phaser.GameObjects.Image } | null = null;
    let minDist = 24 * 24;
    for (const entry of this.oreSprites) {
      if (!entry.sprite.visible) continue;
      const dx = this.player.x - entry.sprite.x;
      const dy = this.player.y - entry.sprite.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minDist) {
        minDist = d2;
        target = entry;
      }
    }
    if (!target) return;

    // 体力检查
    if (!consumeStamina(target.deposit.staminaCost)) {
      this.showDialogueText('体力不足，无法开采！');
      return;
    }

    // 产出矿石
    const dropsText: string[] = [];
    for (const drop of target.deposit.drops) {
      addItem(drop.item, drop.count);
      dropsText.push(`${drop.count}个${drop.item === 'stone' ? '石头' : drop.item === 'copper' ? '铜矿' : '铁矿'}`);
    }
    addXp(5, 'harvest');
    play('harvest');

    // 矿脉消失 + 标记已开采 + 从待开采列表移除（防止同一矿脉被重复开采/重复销毁）
    target.sprite.destroy();
    const minedId = target.deposit.id;
    markMined(minedId);
    this.oreSprites = this.oreSprites.filter((e) => e.deposit.id !== minedId);

    this.showDialogueText(`开采成功！获得 ${dropsText.join('、')}  体力 -${target.deposit.staminaCost}`);
    // 挖矿引导任务进度
    onDQMine();
    this.updateDailyQuestPanel();
    this.updateHUD();
  }

  /**
   * 砍树：靠近树按 E 砍伐
   * 需要背包内有「旧斧头」；每砍一次扣 1 血，3 次砍倒 → 掉落木材 + 变树桩
   * @returns true 表示消费了本次动作（树在范围内）；false 表示附近没有可砍的树
   */
  private tryChopTree(): boolean {
    // 找最近的可砍树木（24px 范围内，树桩跳过）
    let targetPos: { col: number; row: number } | null = null;
    let minDist = 24 * 24;
    for (const pos of FARM_TREE_POSITIONS) {
      const tree = getTree(pos.col, pos.row);
      if (!tree || tree.isStump) continue;
      const cx = pos.col * TILE_SIZE + TILE_SIZE / 2;
      const cy = pos.row * TILE_SIZE + TILE_SIZE / 2;
      const dx = this.player.x - cx;
      const dy = this.player.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < minDist) {
        minDist = d2;
        targetPos = pos;
      }
    }
    if (!targetPos) return false; // 附近没有可砍的树

    // 斧头检查：无斧头时不吞交互（教程期玩家本无斧头，让操作落到农田交互）
    if (getItemCount('old_axe') <= 0) {
      return false;
    }

    // 砍树引导（仅第一次触发）
    if (!this.woodcutTipShown) {
      this.woodcutTipShown = true;
      if (!this.storyDialogue) this.storyDialogue = new StoryDialogue();
      this.storyDialogue.play(WOODCUT_TIP_DIALOGUE);
      return true;
    }

    // 体力检查（每次砍击扣 5 点，一棵树 3 次 = 15 点）
    if (!consumeStamina(5)) {
      this.showDialogueText('体力不足，砍不动树！');
      return true;
    }

    // 砍伐：扣血，满 3 次砍倒
    const chopped = chopTree(targetPos.col, targetPos.row);
    const key = `${targetPos.col},${targetPos.row}`;
    const sprite = this.treeSprites.get(key);

    if (chopped) {
      // 树倒了：掉落 2 个木材 + 变树桩
      addItem('wood', 2);
      addXp(5, 'harvest');
      play('tree_fall');
      if (sprite) sprite.setTexture('stump');
      this.showDialogueText('砍倒了树！获得木材 ×2');
      // 砍树引导任务进度
      onDQWoodcut();
      this.updateDailyQuestPanel();
    } else {
      // 还没倒：扣血 + 砍击音效
      play('chop');
      const tree = getTree(targetPos.col, targetPos.row)!;
      this.showDialogueText(`砍树中… (剩余 ${tree.health}/${TREE_MAX_HEALTH})`);
    }
    this.updateHUD();
    return true;
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
    this.tryFarmInteractAt(tc, tr);
  }

  /**
   * 移动端点击种田：触屏设备在农场点击可操作的农田格子 → 直接执行操作
   * 面板/对话打开时忽略；非触屏设备忽略（桌面保留 WASD + E 交互）
   */
  private handleFarmTap(pointer: Phaser.Input.Pointer): void {
    if (!isTouchDevice()) return;
    if (this.mapKey !== 'farm') return;
    if (this.transitioning) return;
    // 面板/对话/种子选择器打开时忽略点击
    if (this.storyDialogue?.isOpen()) return;
    if (this.shopPanel.isOpen()) return;
    if (this.backpackPanel.isOpen()) return;
    if (this.endingPanel?.isOpen()) return;
    if (this.seedSelectorEl) return;
    if (this.cropPickerEl) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    // 移动端点击商店摊位 → 直接打开商店（不误判为"不能在这里"）
    if (this.farmShop) {
      const dx = world.x - this.farmShop.pos.x;
      const dy = world.y - this.farmShop.pos.y;
      if (dx * dx + dy * dy <= 26 * 26) {
        this.inputManager.clearAction();
        this.shopPanel.open();
        return;
      }
    }
    const col = Math.floor(world.x / TILE_SIZE);
    const row = Math.floor(world.y / TILE_SIZE);
    if (!isInFarmArea(col, row)) {
      this.flashTileError(col, row);
      this.showFloatText(col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2, '不能在这里', '#ff8a80');
      return;
    }
    if (!this.isTileActionable(col, row)) {
      this.flashTileError(col, row);
      const state = getTileState(col, row);
      const msg = state === 'watered' ? '还没成熟' : '没有种子';
      this.showFloatText(col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2, msg, '#ff8a80');
      return;
    }
    this.tryFarmInteractAt(col, row);
    // 点击反馈：目标格短暂高亮 + 触屏振动
    this.tapFlashKey = `${col},${row}`;
    this.tapFlashUntil = this.time.now + 500;
    if (isTouchDevice()) {
      try { navigator.vibrate(15); } catch {}
    }
  }

  /**
   * 对指定农田格执行操作（锄地/播种/浇水/收获）
   * 由 tryFarmInteract（面前一格）与 handleFarmTap（点击格）复用
   */
  private tryFarmInteractAt(col: number, row: number): void {
    // 必须在农田可耕区域内
    if (!isInFarmArea(col, row)) return;

    const state = getTileState(col, row);
    const tileCenterX = col * TILE_SIZE + TILE_SIZE / 2;
    const tileCenterY = row * TILE_SIZE + TILE_SIZE / 2;
    if (state === 'empty') {
      // 锄地：空地 → 耕地
      setTileState(col, row, 'tilled');
      play('hoe');
      this.showFloatText(tileCenterX, tileCenterY, '锄地');
      this.checkTutorialProgress('till');
    } else if (state === 'tilled') {
      // 播种：优先使用 R 键选中的种子，不足时才弹出选择器
      const selectedSeedItem = CROP_DEFS[this.selectedCropType].seedItem as any;
      const selectedCount = getItemCount(selectedSeedItem);
      if (selectedCount > 0) {
        // 选中的种子有库存，直接种
        this.doPlant(col, row, this.selectedCropType);
      } else {
        // 选中的种子没了，检查其他种子
        const availableSeeds: { cropType: CropType; count: number }[] = [];
        for (const ct of CROP_TYPES) {
          const seedItem = CROP_DEFS[ct].seedItem as any;
          const count = getItemCount(seedItem);
          if (count > 0) availableSeeds.push({ cropType: ct, count });
        }
        if (availableSeeds.length === 0) {
          // Commit 3：无任何种子 → 明确引导（不弹选择器，不打断节奏）
          this.flashTileError(col, row);
          this.showFloatText(tileCenterX, tileCenterY, '没有种子，去商店看看吧', '#ff8a80');
          this.showDialogueText('没有种子了……去商店买一些吧！');
          return;
        }
        if (availableSeeds.length === 1) {
          // 只有一种可用种子 → 直接种（不打断）
          this.doPlant(col, row, availableSeeds[0].cropType);
        } else {
          // 多种可用种子 → 不弹全屏选择器，飘字提示可用种子 + 引导切换
          const names = availableSeeds.map(s => CROP_DEFS[s.cropType].name).join('、');
          this.flashTileError(col, row);
          this.showFloatText(tileCenterX, tileCenterY, `可用种子：${names}`, '#ffe082');
          this.showDialogueText(this.hintText(`按 [R] 切换种子后播种（可用：${names}）`, `点左上角「种子」按钮切换后播种（可用：${names}）`));
          return;
        }
      }
    } else if (state === 'planted') {
      // 浇水：已种 → 已浇水（成长前置条件）
      setTileState(col, row, 'watered');
      const crop = getCrop(col, row);
      if (crop) setCrop(col, row, { ...crop, watered: true });
      addXp(1, 'water');
      play('water');
      this.showFloatText(tileCenterX, tileCenterY, '浇水');
      onDQWater();
      this.updateDailyQuestPanel();
      this.checkTutorialProgress('water');
    } else if (state === 'grown') {
      // 收获：成熟 → 耕地，获得作物
      const crop = getCrop(col, row);
      const cropType = crop?.cropType ?? 'radish';
      setTileState(col, row, 'tilled');
      setCrop(col, row, undefined);
      addItem(cropType, 1);
      addXp(10, 'harvest');
      play('harvest');
      this.showFloatText(tileCenterX, tileCenterY, `+1 ${CROP_DEFS[cropType].icon}`, '#7ef0a0');
      onDQHarvest(cropType);
      this.updateDailyQuestPanel();
      // v0.5.3 剧情密度 E2：第一次收获反馈（一次性，夏雅口头肯定，不影响收获本身）
      if (!this.firstHarvestShown) {
        this.firstHarvestShown = true;
        if (!this.storyDialogue) this.storyDialogue = new StoryDialogue();
        this.storyDialogue.play(FIRST_HARVEST_DIALOGUE, () => {
          this.updateHUD();
        });
      }
    } else {
      // watered 已浇水未成熟，暂不处理 → 给无效反馈
      this.flashTileError(col, row);
      this.showFloatText(tileCenterX, tileCenterY, '还没成熟', '#ff8a80');
      return;
    }

    // 刷新该格视觉 + HUD
    const visual = this.tileRects.get(`${col},${row}`);
    if (visual) this.updateTileVisual(col, row, visual);
    this.updateHUD();
  }

  /** 执行播种 */
  private doPlant(col: number, row: number, cropType: CropType): void {
    const seedItem = CROP_DEFS[cropType].seedItem as any;
    addItem(seedItem, -1);
    setTileState(col, row, 'planted');
    setCrop(col, row, { cropType, plantDay: getTime().day, watered: false });
    addXp(3, 'plant');
    play('plant');
    this.showFloatText(col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2, `${CROP_DEFS[cropType].icon} ${CROP_DEFS[cropType].name}`);
    onDQPlant();
    this.updateDailyQuestPanel();
    this.checkTutorialProgress('sow');
    const visual = this.tileRects.get(`${col},${row}`);
    if (visual) this.updateTileVisual(col, row, visual);
    this.updateHUD();
  }

  /** 关闭种子选择器 */
  private closeSeedSelector(): void {
    this.seedSelectorEl?.remove();
    this.seedSelectorEl = null;
  }

  /**
   * Android 物理返回键处理：按"最上层 UI"优先级逐个关闭。
   * 安全规则：剧情对话打开时只消费返回键、不做任何事——防止误触跳过关键剧情
   * （真机反馈：返回键曾直接跳过夏雅对话/传送到农场导致教程卡死）。
   * @returns true=已消费返回键；false=无 UI 可关（应退场景或退出 App）
   */
  public handleBackButton(): boolean {
    // 剧情对话中：返回键被消费但不跳过（重要剧情不得被返回键破坏）
    if (this.storyDialogue && this.storyDialogue.isOpen()) {
      return true;
    }
    if (this.seedSelectorEl) {
      this.closeSeedSelector();
      return true;
    }
    if (this.endingPanel?.isOpen()) { this.endingPanel.close(); return true; }
    if (this.shopPanel?.isOpen()) { this.shopPanel.close(); return true; }
    if (this.questPanel?.isOpen()) { this.questPanel.close(); return true; }
    if (this.backpackPanel?.isOpen()) { this.backpackPanel.close(); return true; }
    return false;
  }

  /** 农场触屏：作物选择器（预选播种作物，仅切换 selectedCropType，不播种） */
  private showCropPicker(): void {
    this.closeCropPicker();

    const el = document.createElement('div');
    el.id = 'crop-picker';
    el.style.cssText =
      'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.5);z-index:225;user-select:none;';

    const cardStyle =
      'width:min(300px,85vw);background:#3d3226;border:3px solid #8a6a45;border-radius:10px;' +
      'padding:16px;color:#fff;font-family:Arial;box-shadow:0 4px 20px rgba(0,0,0,0.6);';

    let itemsHtml = '';
    for (const ct of CROP_TYPES) {
      const def = CROP_DEFS[ct];
      const count = getItemCount(def.seedItem as any);
      const sel = ct === this.selectedCropType;
      const border = sel ? '2px solid #ffd700' : '2px solid rgba(255,255,255,0.15)';
      const countColor = count > 0 ? '#ffe082' : '#888';
      itemsHtml += `<div class="crop-pick-opt" data-crop="${ct}" style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;margin-bottom:6px;border:${border};border-radius:6px;cursor:pointer;background:rgba(255,255,255,0.06);">
        <span style="font-size:15px;">${itemIconHtml(ct, 18)} ${def.name}</span>
        <span style="font-size:13px;color:${countColor};">×${count}${sel ? ' ✓' : ''}</span>
      </div>`;
    }

    el.innerHTML = `<div style="${cardStyle}">
      <div style="text-align:center;font-size:16px;font-weight:bold;margin-bottom:10px;">选择播种作物</div>
      ${itemsHtml}
      <div style="text-align:center;margin-top:10px;">
        <button id="crop-pick-close" style="font-size:13px;padding:5px 20px;background:#8a6a45;border:none;border-radius:4px;color:#fff;cursor:pointer;">取消 (Esc)</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    this.cropPickerEl = el;

    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'crop-pick-close') { this.closeCropPicker(); return; }
      const opt = target.closest('.crop-pick-opt') as HTMLElement | null;
      if (opt?.dataset.crop) {
        this.selectedCropType = opt.dataset.crop as CropType;
        this.closeCropPicker();
        this.updateHUD();
      }
    });

    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); this.closeCropPicker(); window.removeEventListener('keydown', escHandler); }
    };
    window.addEventListener('keydown', escHandler);
  }

  /** 关闭作物选择器 */
  private closeCropPicker(): void {
    this.cropPickerEl?.remove();
    this.cropPickerEl = null;
  }

  /** 创建/刷新每日任务面板（public：debug API 调用） */
  createDailyQuestPanel(): void {
    const old = document.getElementById('daily-quest-panel');
    if (old) old.remove();

    const quests = getDailyQuests();
    if (quests.length === 0) return;

    const el = document.createElement('div');
    el.id = 'daily-quest-panel';
    // 触屏设备：左上（避开右侧背包/交互按钮区）；桌面：右上
    // BUG-031：触屏端 top 下移避开状态栏/挖孔屏（env safe-area-inset-top，桌面环境恒为 0 无副作用）
    const panelPos = isTouchDevice()
      ? 'position:fixed;left:8px;top:calc(90px + env(safe-area-inset-top, 0px));'
      : 'position:fixed;right:4px;top:70px;';
    el.style.cssText =
      panelPos + 'width:min(190px,38vw);background:rgba(25,20,15,0.92);' +
      'border:1px solid rgba(138,106,69,0.6);border-radius:10px;padding:6px 8px;color:#fff;font-size:11px;' +
      'font-family:Arial;z-index:10;user-select:none;pointer-events:auto;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);' +
      'display:none;';

    // 分离：可领奖 / 进行中 / 已领奖
    const canClaim = quests.filter(q => q.completed && !q.claimed);
    const active = quests.filter(q => !q.completed && !q.claimed);
    const claimed = quests.filter(q => q.claimed);

    let html = '<div style="text-align:center;font-weight:bold;font-size:12px;margin-bottom:5px;color:#ffd700;letter-spacing:1px;">💠 每日任务</div>';

    // 可领奖（高亮）
    for (const q of canClaim) {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 4px;margin-bottom:2px;background:rgba(255,215,0,0.12);border-radius:5px;">
        <span style="color:#ffd700;">🎁 ${q.desc}</span>
        <button class="dq-claim" data-id="${q.id}" style="font-size:10px;padding:2px 6px;background:#ffd700;color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">领奖</button>
      </div>`;
    }

    // 进行中
    for (const q of active) {
      const progress = q.target > 1 ? ` <span style="color:#aaa;">${q.progress}/${q.target}</span>` : '';
      html += `<div style="display:flex;align-items:center;padding:3px 4px;margin-bottom:2px;color:#ccc;">
        <span style="margin-right:4px;">⬜</span><span>${q.desc}${progress}</span>
      </div>`;
    }

    // 已领奖（折叠）
    if (claimed.length > 0) {
      html += `<div style="margin-top:3px;padding-top:3px;border-top:1px solid rgba(255,255,255,0.08);color:#555;font-size:10px;text-align:center;">已完成 ${claimed.length}/${quests.length}</div>`;
    }

    el.innerHTML = html;
    document.body.appendChild(el);

    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('dq-claim')) {
        const id = target.dataset.id!;
        if (claimReward(id)) {
          this.updateDailyQuestPanel();
          this.updateHUD();
          this.showDialogueText('💠 奖励已领取！');
        }
      }
    });
  }

  /** 刷新每日任务面板 */
  private updateDailyQuestPanel(): void {
    this.createDailyQuestPanel();
    if (this.questPanel) this.questPanel.refresh();
  }
}
