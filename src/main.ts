import Phaser from 'phaser';
import { GAME_CONFIG, GAME_TITLE } from './config';
import { MapScene } from './scenes/MapScene';
import { getTime, nextDay as timeNextDay, setTime as setGameTime, formatTime } from './data/TimeSystem';
import { refreshSchedule } from './systems/NPCSystem';

// 创建 Phaser 游戏实例
// 4 个区域各注册一个 MapScene 实例，首个（农场）自动启动
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_CONFIG.width,
  height: GAME_CONFIG.height,
  backgroundColor: GAME_CONFIG.backgroundColor,
  title: GAME_TITLE,
  // 画布自适应：保持内部分辨率 800×600，等比缩放填满屏幕并居中
  // 地图坐标/碰撞/NPC 位置都基于 800×600 世界坐标，不改内部尺寸
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
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

// Debug API（Phase 4 仍保留，供测试用）
// 用法：
//   window.debug.nextDay()          结束今日，推进到次日 06:00（TimeSystem.nextDay → FarmState.advanceDay）
//   window.debug.setTime(21, 50)      设置当前时间（hour, minute（小时0-23 / 分钟0-59
(window as unknown as { debug: { nextDay: () => number; setTime: (h: number, m: number) => void } }).debug = {
  nextDay: () => {
    // Phase 4 起统一走 TimeSystem.nextDay，它内调 FarmState.advanceDay
    const newDay = timeNextDay();
    const scene = game.scene.getScenes(true)[0] as MapScene | undefined;
    if (scene && typeof scene.refreshFarmVisual === 'function') {
      scene.refreshFarmVisual();
    }
    console.log(`[debug] nextDay → Day ${newDay} 06:00`);
    return newDay;
  },
  setTime: (hour: number, minute: number) => {
    setGameTime(hour, minute);
    // 时间跳变后刷新 NPC 日程并重建当前场景 NPC
    refreshSchedule();
    const scene = game.scene.getScenes(true)[0] as MapScene | undefined;
    if (scene && typeof scene.rebuildNPCs === 'function') {
      scene.rebuildNPCs();
    }
    console.log(`[debug] setTime → Day ${getTime().day} ${formatTime()}`);
  },
};

export default game;
