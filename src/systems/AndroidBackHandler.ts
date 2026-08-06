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
import { StationScene } from '../scenes/StationScene';
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
  elder_house: 'town',
};

/** 回退兜底出生点：农场顶部入口（15,6）瓦片 */
const FALLBACK_SPAWN = { x: 15 * 16, y: 6 * 16 };

/** 退出确认框状态（防重复弹出/便于返回键关闭） */
let exitConfirmOpen = false;
let exitConfirmEl: HTMLDivElement | null = null;

/** 关闭退出确认框（继续游戏 / 已处理完动作） */
function closeExitConfirm(): void {
  exitConfirmOpen = false;
  if (exitConfirmEl) {
    exitConfirmEl.remove();
    exitConfirmEl = null;
  }
}

/**
 * 弹出退出确认框（Android 返回手势不再直接退 App）。
 * 按钮：继续游戏 / 回到主菜单（仅地图场景显示）/ 退出游戏。
 * 点击遮罩空白处 = 继续游戏。
 *
 * 导出供 PC 端 Esc 菜单复用（行为一致：无面板可关时弹出系统菜单）。
 */
export function showExitConfirm(game: Phaser.Game, scene: Phaser.Scene): void {
  if (exitConfirmOpen) return;
  exitConfirmOpen = true;

  const el = document.createElement('div');
  exitConfirmEl = el;
  el.id = 'exit-confirm';
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.55)',
    zIndex: '950',
    userSelect: 'none',
    pointerEvents: 'auto',
  });

  const card =
    'width:min(300px,85vw);background:#3d3226;border:3px solid #8a6a45;' +
    'border-radius:10px;padding:18px 16px;color:#fff;font-family:Arial;' +
    'text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.6);';
  const btnBase =
    'display:block;width:100%;margin-top:10px;padding:12px 0;font-size:16px;' +
    'border:none;border-radius:6px;cursor:pointer;color:#fff;';
  const isMap = scene instanceof MapScene;

  el.innerHTML = `
    <div style="${card}">
      <div style="font-size:17px;font-weight:bold;margin-bottom:6px;">确定要退出游戏吗？</div>
      <div style="font-size:12px;color:#b8a88a;margin-bottom:4px;">当前进度已自动存档</div>
      <button data-act="resume" style="${btnBase}background:#8a6a45;">继续游戏</button>
      ${isMap ? `<button data-act="title" style="${btnBase}background:#5a6a8a;">回到主菜单</button>` : ''}
      <button data-act="exit" style="${btnBase}background:#a04030;">退出游戏</button>
    </div>`;
  document.body.appendChild(el);

  // 触屏：pointerup 主处理，click 兜底去重（同 TitleScene 清除存档按钮）
  let pointerHandled = false;
  const doAction = (act: string | undefined): void => {
    if (act === 'exit') {
      closeExitConfirm();
      if (Capacitor.isNativePlatform()) {
        void App.exitApp();
      } else {
        // PC 网页端：关闭标签页（部分浏览器允许）或提示手动关闭
        window.close();
        // 部分浏览器 window.close() 被阻止，给个提示
        setTimeout(() => {
          const hint = document.createElement('div');
          Object.assign(hint.style, {
            position: 'fixed', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.9)', color: '#fff',
            padding: '20px 30px', borderRadius: '10px',
            fontFamily: 'Arial', fontSize: '14px', textAlign: 'center',
            zIndex: '9999',
          });
          hint.innerHTML = '请手动关闭浏览器标签页<br><span style="font-size:12px;color:#aaa;">（Ctrl+W 或点击标签页×按钮）</span>';
          document.body.appendChild(hint);
          setTimeout(() => hint.remove(), 3000);
        }, 100);
      }
    } else if (act === 'title') {
      closeExitConfirm();
      if (Capacitor.isNativePlatform()) {
        // Android：直接切场景（MapScene SHUTDOWN 会清理）
        game.scene.start('title');
      } else {
        // PC 网页端：reload 回标题页（彻底清理所有监听器，避免删档复活等问题）
        location.reload();
      }
    } else {
      closeExitConfirm(); // resume / 空白遮罩 → 继续游戏
    }
  };
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
  });
  el.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    e.preventDefault();
    pointerHandled = true;
    const btn = (e.target as HTMLElement).closest?.('button[data-act]') as HTMLElement | null;
    doAction(btn?.dataset.act);
  });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (pointerHandled) { pointerHandled = false; return; }
    const btn = (e.target as HTMLElement).closest?.('button[data-act]') as HTMLElement | null;
    doAction(btn?.dataset.act);
  });
}

export function initAndroidBackHandler(game: Phaser.Game): void {
  // 仅 Android 原生（WebView）环境注册；浏览器调试走 PC 键盘 Esc
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

  void App.addListener('backButton', () => {
    const scene = game.scene.getScenes(true)[0];
    if (!scene) {
      void App.exitApp();
      return;
    }

    // 0. 退出确认框已打开 → 返回键关闭它（最高优先级，等于"继续游戏"）
    if (exitConfirmOpen) {
      closeExitConfirm();
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
        // 无回退目标（农场/大门等）→ 弹退出确认框，不再直接退 App
        showExitConfirm(game, scene);
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

    // 4. Title / Station 等非地图场景 → 弹退出确认框，不再直接退 App
    showExitConfirm(game, scene);
  });
}

/**
 * PC 端 Esc 键系统菜单（浏览器/桌面端）。
 *
 * 行为与 Android 返回键一致（AndroidBackHandler 的 1-2 级）：
 *   - 有对话/面板可关 → 优先关闭（复用 MapScene.handleBackButton）
 *   - 教程完成前 → 只消费不弹菜单（防止误触中断教程剧情）
 *   - 无面板可关 → 弹出系统菜单（继续 / 回到主菜单 / 退出游戏）
 *
 * 注意：面板自身的 Esc 监听（背包/任务/商店）已各自关闭，本监听只处理
 * "没有面板打开"时的菜单入口，避免重复关闭。
 */
export function initPcEscapeHandler(game: Phaser.Game): void {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // 0. 系统菜单已打开 → Esc 关闭它（与 Android 返回键一致）
    if (exitConfirmOpen) {
      closeExitConfirm();
      return;
    }
    const scene = game.scene.getScenes(true)[0];
    if (!scene) return;

    if (scene instanceof MapScene) {
      // 1. 有关 UI 可关 → 关闭最上层
      if (scene.handleBackButton()) return;
      // 2. 教程完成前：Esc 只消费、不弹菜单
      if (!isTutorialDone()) return;
      // 3. 无 UI → 系统菜单
      showExitConfirm(game, scene);
      return;
    }
    if (scene instanceof StationScene) {
      // 车站没有面板层级，教程完成前不弹菜单；完成后可弹（继续/退出）
      if (!isTutorialDone()) return;
      showExitConfirm(game, scene);
    }
    // Title 等场景：Esc 不响应（已有开始游戏提示）
  });
}
