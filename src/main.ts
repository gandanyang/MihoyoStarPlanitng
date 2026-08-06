import Phaser from 'phaser';
import './ui/ui-theme.css';
import { GAME_CONFIG, GAME_TITLE } from './config';
import { TitleScene } from './scenes/TitleScene';
import { MapScene } from './scenes/MapScene';
import { StationScene } from './scenes/StationScene';
import { getTime, nextDay as timeNextDay, setTime as setGameTime, formatTime } from './data/TimeSystem';
import { refreshSchedule } from './systems/NPCSystem';
import { refreshDailyQuests as refreshDQ, getDailyQuestSaveData, onWoodcut as dqOnWoodcut, getDailyQuests } from './systems/DailyQuestSystem';
import { getQuestState, setQuestState } from './systems/QuestSystem';
import { resetStamina } from './data/Stamina';
import { resetOres } from './data/MineState';
import { save } from './systems/SaveSystem';
import { advanceStory, getStoryStep, setStoryStep, isObservatoryComplete } from './systems/StorySystem';
import { initAndroidBackHandler, initPcEscapeHandler } from './systems/AndroidBackHandler';
import { addItem } from './data/Inventory';
import { getRobotCount, runDailyAutomation } from './systems/AutomationSystem';
import { setTileState as farmSetTile, setCrop as farmSetCrop, getTileState as farmGetTile } from './data/FarmState';
import { isTouchDevice } from './config';

// 桌面端标记：禁用竖屏提示层（避免开发者工具窄窗口误触发）
// 触屏设备竖屏时由 CSS @media (orientation:portrait) 显示提示
if (!isTouchDevice()) {
  document.body.classList.add('desktop');
}

// 临时调试入口：URL 带 ?reset=1 时启动前强制清除本地存档（用于移动端真机测试清档）
// 仅前端操作 localStorage，不进存档逻辑、不属于正式功能
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('reset')) {
  try {
    localStorage.removeItem('return_star_save');
    console.log('[reset] 已清除本地存档');
  } catch (e) {
    console.warn('[reset] 清档失败', e);
  }
}

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
      // 物理调试已关闭（美术升级后不再需要可视化碰撞体）
      debug: false,
    },
  },
  scene: [
    new TitleScene(),
    new StationScene(),
    new MapScene('gate'),
    new MapScene('farm'),
    new MapScene('town'),
    new MapScene('forest'),
    new MapScene('mine'),
    new MapScene('house'),
    new MapScene('elder_house'),
  ],
});

// 开发阶段把 game 实例挂到 window，便于浏览器控制台调试与自动化测试
(window as unknown as { __game: Phaser.Game }).__game = game;

// Android 物理返回键层级处理（仅 Capacitor 原生环境生效；浏览器内无副作用）
initAndroidBackHandler(game);
// PC 端 Esc 系统菜单（浏览器/桌面端；与 Android 返回键行为一致）
initPcEscapeHandler(game);

/**
 * 让 #game-container 尺寸 = 画布实际显示尺寸。
 * 原因：FIT 模式下画布居中于屏幕（横屏两侧黑边），若容器占满全屏，
 * 相对容器定位的 DOM UI（摇杆/按钮/HUD）会偏到黑边区。容器贴合画布后，
 * 所有 DOM UI 与画布对齐（黑边在容器外，由 body 背景填充）。
 *
 * 加固（P0 横屏触控布局修复）：
 * - 读取尺寸前先刷新 game.scale 的父尺寸，避免旋转/地址栏变化后取到旧 displaySize
 * - 多信号触发：Phaser resize + orientationchange + window resize（安卓 WebView 旋转时
 *   Phaser resize 偶发不触发，需 window resize 兜底）
 */
function syncGameContainer(): void {
  const c = document.getElementById('game-container');
  if (!c) return;
  try {
    game.scale.refresh();
  } catch { /* 忽略刷新异常，继续用当前 displaySize */ }
  const size = game.scale.displaySize;
  c.style.width = `${size.width}px`;
  c.style.height = `${size.height}px`;
}
game.scale.on('resize', syncGameContainer);
window.addEventListener('orientationchange', () => {
  // 旋转瞬间 displaySize 可能仍是旧方向（安卓 WebView 时序不稳定），双延迟覆盖过渡态
  setTimeout(syncGameContainer, 300);
  setTimeout(syncGameContainer, 700);
});
window.addEventListener('resize', syncGameContainer);
// visualViewport 变化（安卓地址栏收起/展开影响视口高度）也触发同步
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncGameContainer);
  window.visualViewport.addEventListener('scroll', syncGameContainer);
}
syncGameContainer();

// Debug API（Phase 4 仍保留，供测试用）
// 用法：
//   window.debug.nextDay()          结束今日，推进到次日 06:00
//   window.debug.setTime(21, 50)    设置当前时间（hour, minute）
//   window.debug.advanceStory()     推进教程剧情一步
//   window.debug.setStoryStep(s)    设置教程剧情步骤
//   window.debug.getStoryStep()     获取当前教程步骤
//   window.debug.getQuestState()     获取任务状态
//   window.debug.setQuestState(s)    设置任务状态
(window as unknown as { debug: { nextDay: () => number; setTime: (h: number, m: number) => void; advanceStory: () => void; setStoryStep: (s: string) => void; getStoryStep: () => string; getQuestState: () => string; setQuestState: (s: string) => void; getObservatoryComplete: () => boolean; getTimeStr: () => string; giveRobot: (n?: number) => void; robotCount: () => number; giveItem: (item: string, count: number) => void; farm: { setTileState: (col: number, row: number, state: string) => void; setCrop: (col: number, row: number, crop: { cropType: string; plantDay: number; watered: boolean } | undefined) => void; getTileState: (col: number, row: number) => string } } }).debug = {
  nextDay: () => {
    // Phase 4 起统一走 TimeSystem.nextDay，它内调 FarmState.advanceDay
    const newDay = timeNextDay();
    // v0.6 庄园自动化：机器人每日清晨自动浇水/收获
    runDailyAutomation();
    // 体力恢复 + 矿脉刷新 + 每日任务刷新
    resetStamina();
    resetOres();
    refreshDQ();
    const scene = game.scene.getScenes(true)[0] as MapScene | undefined;
    if (scene) {
      if (typeof scene.createDailyQuestPanel === 'function') {
        scene.createDailyQuestPanel();
      }
      if (typeof scene.refreshFarmVisual === 'function') {
        scene.refreshFarmVisual();
      }
    }
    // 睡觉后自动存档（含每日任务数据）
    if (scene) {
      const player = (scene as unknown as { player?: { x: number; y: number; facing: string } })?.player;
      if (player) {
        save({
          x: player.x, y: player.y,
          scene: scene.scene.key, facing: player.facing,
          dailyQuest: getDailyQuestSaveData(),
        } as any);
      }
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
  advanceStory: () => {
    advanceStory();
    console.log(`[debug] advanceStory → ${getStoryStep()}`);
  },
  setStoryStep: (s: string) => {
    setStoryStep(s as any);
    console.log(`[debug] setStoryStep → ${s}`);
  },
  getStoryStep: () => {
    return getStoryStep();
  },
  getQuestState: () => {
    return getQuestState();
  },
  setQuestState: (s: string) => {
    setQuestState(s as any);
    console.log(`[debug] setQuestState → ${s}`);
  },
  getObservatoryComplete: () => {
    return isObservatoryComplete();
  },
  getTimeStr: () => {
    return formatTime();
  },
  giveRobot: (n = 1) => {
    addItem('auto_farmer_robot', n);
    console.log(`[debug] giveRobot → +${n} auto_farmer_robot`);
  },
  robotCount: () => {
    return getRobotCount();
  },
  giveItem: (item: string, count: number) => {
    addItem(item as any, count);
    console.log(`[debug] giveItem → ${item} ×${count}`);
  },
  // 农场状态钩子：指向游戏真实 FarmState 实例（绕过 Vite dev 双模块问题，供自动化测试驱动）
  farm: {
    setTileState: (col, row, state) => {
      farmSetTile(col, row, state as never);
      console.log(`[debug] farm.setTileState(${col},${row}) → ${state}`);
    },
    setCrop: (col, row, crop) => {
      farmSetCrop(col, row, crop as never);
      console.log(`[debug] farm.setCrop(${col},${row})`);
    },
    getTileState: (col, row) => {
      return farmGetTile(col, row);
    },
  },
};

// 每日任务 debug 挂载（指向游戏真实实例，供自动化测试驱动红点生命周期，绕过 dev 双模块问题）
(window as unknown as {
  dailyQuest: {
    onWoodcut: () => void;
    getClaimable: () => string[];
    // 测试辅助：强制第一条可完成任务置为已完成未领奖（仅测试，不属产品逻辑）
    forceClaimableFirst: () => boolean;
  }
}).dailyQuest = {
  onWoodcut: () => dqOnWoodcut(),
  getClaimable: () => getDailyQuests().filter(q => q.completed && !q.claimed).map(q => q.id),
  forceClaimableFirst: () => {
    const q = getDailyQuests().find(x => !x.completed && !x.claimed);
    if (!q) return false;
    q.progress = q.target;
    q.completed = true;
    return true;
  },
};

export default game;
