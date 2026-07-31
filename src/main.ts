import Phaser from 'phaser';
import { GAME_CONFIG, GAME_TITLE } from './config';
import { MapScene } from './scenes/MapScene';
import { advanceDay } from './data/FarmState';

// 创建 Phaser 游戏实例
// 4 个区域各注册一个 MapScene 实例，首个（农场）自动启动
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_CONFIG.width,
  height: GAME_CONFIG.height,
  backgroundColor: GAME_CONFIG.backgroundColor,
  title: GAME_TITLE,
  // 启用 Arcade 物理系统（场景内 this.physics 依赖此配置）
  physics: {
    default: 'arcade',
    arcade: {
      // Phase 1 临时开启调试，可视化碰撞体，验收后关闭
      debug: true,
    },
  },
  scene: [
    new MapScene('farm'),
    new MapScene('town'),
    new MapScene('forest'),
    new MapScene('mine'),
  ],
});

// 开发阶段把 game 实例挂到 window，便于浏览器控制台调试与自动化测试
(window as unknown as { __game: Phaser.Game }).__game = game;

// Debug API：快速推进一天，触发作物成长判定（Phase 3.4 测试用，Phase 4 由 TimeSystem 驱动）
// 用法：浏览器控制台执行 window.debug.nextDay()
(window as unknown as { debug: { nextDay: () => number } }).debug = {
  nextDay: () => {
    const newDay = advanceDay();
    // 刷新当前活跃场景的农田视觉（farm 场景重绘 grown 作物；其他场景仅刷新 HUD 天数）
    const scene = game.scene.getScenes(true)[0] as MapScene | undefined;
    if (scene && typeof scene.refreshFarmVisual === 'function') {
      scene.refreshFarmVisual();
    }
    console.log(`[debug] nextDay → 第${newDay}天`);
    return newDay;
  },
};

export default game;
