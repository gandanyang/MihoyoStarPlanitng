/**
 * 记忆闪回组件（MemoryFlashback）
 *
 * 童年记忆演出：暖色调渐变背景 + 场景描述文字 + 缓慢淡入淡出。
 * 用于星之碎片采集触发的童年回忆场景。
 *
 * 与 MemoryMoment 区别：
 *   MemoryMoment = 轻量浮层（不冻结操作）
 *   MemoryFlashback = 沉浸式演出（冻结操作，需点击/按键推进）
 *
 * 用法：
 *   import { playMemoryFlashback } from './MemoryFlashback';
 *   playMemoryFlashback(FLASHBACK_LINES, () => { console.log('闪回结束'); });
 */

import { DialogueLine } from '../systems/StorySystem';
import { isMobileLayout } from '../config';
import { VoiceBank } from '../audio/VoiceBank';

let containerEl: HTMLDivElement | null = null;
let sceneEl: HTMLDivElement | null = null;
let textEl: HTMLParagraphElement | null = null;
let hintEl: HTMLDivElement | null = null;
let lines: DialogueLine[] = [];
let index = 0;
let typing = false;
let typeTimer: number | null = null;
let onComplete: (() => void) | null = null;
let completed = false;
/** 可选背景图 URL（为空则用默认暖色渐变） */
let bgUrl: string | null = null;

function ensureDom(): void {
  if (containerEl) return;

  // 全屏容器
  containerEl = document.createElement('div');
  containerEl.id = 'memory-flashback-overlay';
  containerEl.style.cssText =
    'position:fixed;top:0;right:0;bottom:0;left:0;display:none;flex-direction:column;' +
    'align-items:center;justify-content:center;z-index:550;pointer-events:auto;' +
    'background:linear-gradient(180deg, #1a120a 0%, #2a1f14 30%, #1a120a 100%);' +
    'opacity:0;transition:opacity 1.2s ease;';

  // 暗角效果（vignette）
  const vignette = document.createElement('div');
  vignette.style.cssText =
    'position:absolute;top:0;right:0;bottom:0;left:0;z-index:2;' +
    'background:radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%);' +
    'pointer-events:none;';
  containerEl.appendChild(vignette);

  // 可选背景图（盖在渐变之上、暗角之下，保持文字可读；无图时保持透明）
  const bgImg = document.createElement('div');
  bgImg.id = 'memory-flashback-bg';
  bgImg.style.cssText =
    'position:absolute;top:0;right:0;bottom:0;left:0;' +
    'background-size:cover;background-position:center;' +
    'opacity:0;transition:opacity 1.2s ease;pointer-events:none;';
  containerEl.appendChild(bgImg);

  // 场景描述区域（position:relative 提升到背景图之上——#27：bgImg 为 absolute，
  // 绘制在普通流元素之上，会把文字盖住；z-index:1 保证文字在 bgImg 上、暗角下）
  sceneEl = document.createElement('div');
  sceneEl.style.cssText =
    'position:relative;z-index:1;max-width:min(480px,85vw);text-align:center;padding:0 24px;' +
    'opacity:0;transition:opacity 1.0s ease 0.3s;';

  // 主文字
  textEl = document.createElement('p');
  textEl.style.cssText =
    'color:#e8d8c0;font-family:"Georgia","SimSun",serif;font-size:17px;' +
    'line-height:2.0;letter-spacing:0.8px;margin:0 0 16px 0;' +
    'text-shadow:0 2px 12px rgba(0,0,0,0.8);font-style:italic;';

  // 提示文字
  hintEl = document.createElement('div');
  hintEl.style.cssText =
    'color:#8a7a6a;font-size:12px;letter-spacing:1px;margin-top:20px;' +
    'opacity:0;transition:opacity 0.6s ease 1.5s;';

  sceneEl.appendChild(textEl);
  sceneEl.appendChild(hintEl);
  containerEl.appendChild(sceneEl);

  document.body.appendChild(containerEl);
}

/** 打字机效果 */
function typeText(el: HTMLParagraphElement, text: string, callback: () => void): void {
  typing = true;
  el.textContent = '';
  let i = 0;
  const speed = 40; // 每字符间隔（ms）

  const tick = (): void => {
    if (i < text.length) {
      el.textContent += text[i];
      i++;
      typeTimer = window.setTimeout(tick, speed);
    } else {
      typing = false;
      callback();
    }
  };
  tick();
}

/** 推进到下一行 */
function advance(): void {
  if (completed) return;

  // 打字中 → 跳过打字，直接显示全文
  if (typing && typeTimer !== null) {
    clearTimeout(typeTimer);
    typeTimer = null;
    if (textEl && index < lines.length) {
      textEl.textContent = lines[index].text;
    }
    typing = false;
    return;
  }

  index++;

  // 所有行播放完毕
  if (index >= lines.length) {
    close();
    return;
  }

  // 播放下一行
  showCurrentLine();
}

/** 显示当前行 */
function showCurrentLine(): void {
  if (!textEl || index >= lines.length) return;

  const line = lines[index];

  // 渐隐当前文字
  textEl.style.opacity = '0';

  setTimeout(() => {
    if (!textEl) return;

    // 台词语音：按 (speaker, text) 映射播放；旁白/找不到音频静默跳过，不阻塞演出
    VoiceBank.play(line.speaker, line.text, !!line.inner);
    // 预加载下一句语音，消除推进时的起播延迟（与 StoryDialogue 的 BUG-039 优化一致）
    const nextLine = lines[index + 1];
    if (nextLine) {
      VoiceBank.preload(nextLine.speaker, nextLine.text);
    }

    // 根据行类型调整样式
    if (line.inner) {
      // 内心独白：更柔和的斜体
      textEl.style.color = '#c8b8a0';
      textEl.style.fontStyle = 'italic';
    } else {
      // 场景描述
      textEl.style.color = '#e8d8c0';
      textEl.style.fontStyle = 'italic';
    }

    // 打字机显示
    typeText(textEl, line.text, () => {
      // 打字完成，显示提示
      if (hintEl) {
        hintEl.textContent = isMobileLayout() ? '（点击继续）' : '（按 E 或空格继续）';
        hintEl.style.opacity = '1';
      }
    });

    // 渐显
    textEl.style.opacity = '1';
  }, 300);
}

/** 关闭闪回 */
function close(): void {
  completed = true;
  VoiceBank.stop();

  // 渐隐
  if (sceneEl) sceneEl.style.opacity = '0';
  const bgEl = document.getElementById('memory-flashback-bg') as HTMLDivElement | null;
  if (bgEl) bgEl.style.opacity = '0';
  if (containerEl) containerEl.style.opacity = '0';

  setTimeout(() => {
    if (containerEl) containerEl.style.display = 'none';
    if (sceneEl) sceneEl.style.opacity = '0';
    if (hintEl) hintEl.style.opacity = '0';
    const bgEl2 = document.getElementById('memory-flashback-bg') as HTMLDivElement | null;
    if (bgEl2) {
      bgEl2.style.backgroundImage = '';
      bgEl2.style.opacity = '0';
    }

    // 清理事件监听
    document.removeEventListener('keydown', handleKey);
    if (containerEl) containerEl.removeEventListener('pointerdown', handlePointer);

    onComplete?.();
  }, 1200);
}

/** 键盘事件处理 */
function handleKey(e: KeyboardEvent): void {
  if (e.key === 'e' || e.key === 'E' || e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    advance();
  }
}

/** 触屏事件处理 */
function handlePointer(e: PointerEvent): void {
  e.preventDefault();
  advance();
}

/**
 * 播放记忆闪回
 * @param flashbackLines 闪回对话行（speaker 留空即可）
 * @param callback 闪回结束回调
 * @param backgroundImage 可选背景图 URL（如剧情插图）；不传则用默认暖色渐变
 */
export function playMemoryFlashback(
  flashbackLines: DialogueLine[],
  callback?: () => void,
  backgroundImage?: string
): void {
  ensureDom();
  if (!containerEl || !sceneEl || !textEl || !hintEl) return;

  // 背景图：传入则淡入显示，未传入则隐藏（保持默认渐变）
  bgUrl = backgroundImage ?? null;
  const bgEl = document.getElementById('memory-flashback-bg') as HTMLDivElement | null;
  if (bgEl) {
    if (bgUrl) {
      bgEl.style.backgroundImage = `url("${bgUrl}")`;
      bgEl.style.opacity = '1';
    } else {
      bgEl.style.backgroundImage = '';
      bgEl.style.opacity = '0';
    }
  }

  // 重置状态
  lines = flashbackLines;
  index = 0;
  typing = false;
  completed = false;
  onComplete = callback ?? null;

  if (typeTimer) {
    clearTimeout(typeTimer);
    typeTimer = null;
  }

  // 重置样式
  textEl.textContent = '';
  textEl.style.color = '#e8d8c0';
  textEl.style.fontStyle = 'italic';
  hintEl.style.opacity = '0';
  sceneEl.style.opacity = '0';
  containerEl.style.opacity = '0';

  // 显示容器
  containerEl.style.display = 'flex';
  // 强制 reflow
  void containerEl.offsetHeight;
  containerEl.style.opacity = '1';

  // 延迟显示场景（等背景渐变完成）
  setTimeout(() => {
    if (sceneEl) sceneEl.style.opacity = '1';
    showCurrentLine();
  }, 400);

  // 绑定事件
  document.addEventListener('keydown', handleKey);
  if (containerEl) containerEl.addEventListener('pointerdown', handlePointer);
}

/** 立即隐藏（场景切换时调用） */
export function hideMemoryFlashback(): void {
  VoiceBank.stop();
  if (typeTimer) {
    clearTimeout(typeTimer);
    typeTimer = null;
  }
  completed = true;
  typing = false;

  if (sceneEl) sceneEl.style.opacity = '0';
  if (containerEl) {
    containerEl.style.opacity = '0';
    setTimeout(() => {
      if (containerEl) containerEl.style.display = 'none';
    }, 300);
  }

  document.removeEventListener('keydown', handleKey);
  if (containerEl) containerEl.removeEventListener('pointerdown', handlePointer);
}
