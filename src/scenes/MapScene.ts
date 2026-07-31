import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { MAP_EXITS, MAP_NAMES } from '../data/exits';
import {
  FARM_AREA,
  TILE_SIZE,
  getTileState,
  isInFarmArea,
  setTileState,
} from '../data/FarmState';

interface SceneInitData {
  spawn?: { x: number; y: number };
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
  // 农田格子覆盖层（仅 farm 场景使用），key = "col,row"
  private tileRects = new Map<string, Phaser.GameObjects.Rectangle>();
  // E 键：锄地交互
  private keyE!: Phaser.Input.Keyboard.Key;

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

    // HUD：当前区域名 + 操作提示（农场额外提示锄地）
    const name = MAP_NAMES[this.mapKey] ?? this.mapKey;
    const hint =
      this.mapKey === 'farm'
        ? 'WASD 移动 | E 锄地 | 走到出口切换区域'
        : 'WASD 移动 | 走到出口切换区域';
    this.add
      .text(this.scale.width / 2, 24, `${name}  |  ${hint}`, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100);

    // 农场场景：渲染农田格子覆盖层
    if (this.mapKey === 'farm') {
      this.setupFarmTiles();
    }

    // E 键：锄地交互（所有场景注册，仅 farm 场景生效）
    this.keyE = this.input.keyboard!.addKey('E');
  }

  update(): void {
    this.player.update();

    // E 键锄地（切换中不响应，避免离开农场瞬间误触）
    if (!this.transitioning && Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.tryTill();
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
  }

  /**
   * 渲染农田可耕区域的格子覆盖层
   * 状态非 empty 的格子显示深棕色方块（覆盖在 soil 瓦片之上）
   * 场景切换回来时，从全局 FarmState 恢复已锄地块的显示
   */
  private setupFarmTiles(): void {
    for (let r = FARM_AREA.row0; r <= FARM_AREA.row1; r++) {
      for (let c = FARM_AREA.col0; c <= FARM_AREA.col1; c++) {
        const rect = this.add.rectangle(
          c * TILE_SIZE + TILE_SIZE / 2,
          r * TILE_SIZE + TILE_SIZE / 2,
          TILE_SIZE,
          TILE_SIZE,
          0x6b4423,
          0.75
        );
        rect.setDepth(2);
        // 从全局状态恢复显示（场景切换回来时保留已锄地块）
        rect.setVisible(getTileState(c, r) !== 'empty');
        this.tileRects.set(`${c},${r}`, rect);
      }
    }
  }

  /**
   * 锄地：玩家面前一格若为农田空地，翻为耕地
   * 作用方向由 Player.facing 决定
   */
  private tryTill(): void {
    if (this.mapKey !== 'farm') return;

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
    // 仅空地可锄
    if (getTileState(tc, tr) !== 'empty') return;

    setTileState(tc, tr, 'tilled');
    const rect = this.tileRects.get(`${tc},${tr}`);
    if (rect) rect.setVisible(true);
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
