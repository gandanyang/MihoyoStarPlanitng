/**
 * Android 物理返回键处理（仅 Capacitor 原生环境生效）
 *
 * 返回键层级（优先级从高到低）：
 *   1. 关闭对话（跳过整段，剧情状态正常推进）
 *   2. 关闭种子选择器
 *   3. 关闭结算 / 商店 / 任务 / 背包面板
 *   4. 无 UI 可关 → 回退场景（子区域回农场；mine 回 forest）
 *   5. 农场 / 标题 / 车站 → 退出 App
 *
 * 说明：注册 backButton 监听后，Capacitor 会抑制默认的"直接退出"行为，
 * 必须显式调用 App.exitApp() 才会退出——这正是本模块想要的层级控制。
 */
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import Phaser from 'phaser';
import { MapScene } from '../scenes/MapScene';
import { MAP_EXITS } from '../data/exits';
import { isTutorialDone } from './StorySystem';

/** 场景回退目标表：子区域按返回 → 离农场更近的节点（与 MAP_EXITS 拓扑一致） */
const BACK_TARGET: Record<string, string> = {
  gate: 'farm',
  house: 'farm',
  forest: 'farm',
  town: 'farm',
  // mine 与 farm 不相邻（拓扑：farm-forest-mine / farm-town-mine），回退到 forest
  mine: 'forest',
};

/** 回退兜底出生点：农场顶部入口（15,6）瓦片 */
const FALLBACK_SPAWN = { x: 15 * 16, y: 6 * 16 };

export function initAndroidBackHandler(game: Phaser.Game): void {
  // 仅 Android 原生（WebView）环境注册；浏览器调试走 PC 键盘 Esc
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

  void App.addListener('backButton', () => {
    const scene = game.scene.getScenes(true)[0];
    if (!scene) {
      void App.exitApp();
      return;
    }

    if (scene instanceof MapScene) {
      // 1. 有关 UI 可关 → 关闭最上层
      if (scene.handleBackButton()) return;

      // 2. 教程完成前：返回键只消费、不切场景不退出（防止传送跳过教程剧情导致存档卡死）
      if (!isTutorialDone()) return;

      // 3. 无 UI → 回退场景（如有回退目标）
      const to = BACK_TARGET[scene.scene.key];
      if (!to) {
        void App.exitApp();
        return;
      }
      const exit = MAP_EXITS[scene.scene.key]?.find((e) => e.target === to);
      const target = { spawn: exit?.spawn ?? FALLBACK_SPAWN };
      // 回退切换先淡出再切（与正常出口切图一致），避免返回手势/左滑触发时硬切黑屏窗口
      let started = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const go = (): void => {
        if (started) return;
        started = true;
        if (timer) clearTimeout(timer);
        game.scene.start(to, target);
      };
      timer = setTimeout(go, 1500); // 兜底：fade 事件异常时 1.5s 后仍切换
      scene.cameras.main.fadeOut(250, 0, 0, 0);
      scene.cameras.main.once('camerafadeoutcomplete', go);
      return;
    }

    // 4. Title / Station 等非地图场景 → 退出
    void App.exitApp();
  });
}
