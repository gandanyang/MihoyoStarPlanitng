/**
 * 剧情对话 UI（DOM 覆盖层）
 *
 * 全屏底部对话框，支持：
 * - 角色名 + 颜色标注
 * - 打字机逐字效果
 * - 内心独白（无名字框，斜体灰字）
 * - 点击/空格/E 推进
 *
 * 用法：
 *   const dlg = new StoryDialogue();
 *   dlg.play(lines, () => { console.log('对话结束'); });
 *   dlg.advance(); // 用户点击/按键推进
 */

import { DialogueLine } from '../systems/StorySystem';
import { isMobileLayout } from '../config';
import { VoiceBank } from '../audio/VoiceBank';
import { panelFadeIn, panelFadeOut } from './dom-anim';
import { addEntry } from '../systems/DialogueHistoryManager';
import { DialogueHistoryPanel } from './DialogueHistoryPanel';

/** 对话立绘映射（§8.5 方案 A）：说话人 → 立绘资源；无映射角色回退首字色块 */
const PORTRAIT_MAP: Record<string, string> = {
  林澈: 'assets/portraits/linchen_ai.png',
  夏雅: 'assets/portraits/xiya_ai_avatar_v2.png',
  村长: 'assets/portraits/elder_ai.png',
  爷爷的笔记: 'assets/portraits/grandpa_ai.png',
  爷爷: 'assets/portraits/grandpa_ai.png',
  信: 'assets/portraits/grandpa_ai.png',
  冒险家阿风: 'assets/portraits/afeng_ai.png',
  阿风: 'assets/portraits/afeng_ai.png',
  矿工老张: 'assets/portraits/miner_ai.png',
  老张: 'assets/portraits/miner_ai.png',
  花匠小梅: 'assets/portraits/xiaomei_ai.png',
  小梅: 'assets/portraits/xiaomei_ai.png',
  商店老板: 'assets/portraits/shopkeeper_ai.png',
};

export class StoryDialogue {
  private container: HTMLDivElement;
  private nameEl: HTMLSpanElement;
  private textEl: HTMLParagraphElement;
  private hintEl: HTMLSpanElement;
  private portraitEl: HTMLDivElement;

  private lines: DialogueLine[] = [];
  private index = 0;
  private typing = false;
  private typeTimer: number | null = null;
  private onComplete: (() => void) | null = null;
  private onChoice: ((index: number) => void) | null = null;
  private optionsEl: HTMLDivElement | null = null;
  private optionKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  /** skip 防抖时间戳：pointerdown + click 双触发时同一物理点击只执行一次 */
  private lastSkipAt = 0;
  /** FEATURE-040 剧情回顾：历史面板实例（只读回看，不重播/不跳转/不存档） */
  private historyPanel: DialogueHistoryPanel | null = null;
  /** 面板打开前是否处于打字中（关闭后恢复 typing 状态） */
  private savedTyping = false;
  /** 面板打开前已打出的字符数（恢复打字机进度） */
  private savedCharIdx = 0;
  /**
   * 对话是否已触发过完成回调（advance 触底 / skip）。
   * close(true) 走 150ms 淡出动画，期间 isOpen() 仍为 true，玩家连按会再次进入
   * advance() 并二次触发 onComplete → advanceStory 被多推一格 → 剧情被跳过（大门被跳过/钥匙失效）。
   * 该标志确保 onComplete 每段对话只触发一次。
   */
  private completed = false;

  constructor() {
    // 容器
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      zIndex: '500',
      display: 'none',
      // 背景不拦截点击：防止全屏覆盖层挡住下方 UI（如每日任务面板的领奖按钮）。
      // 仅对话框主体与 Skip 按钮保留 pointer-events:auto（见下方 box/skipBtn）。
      pointerEvents: 'none',
      background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 70%, rgba(0,0,0,0.85) 100%)',
    });

    // 对话框
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '90%',
      maxWidth: '700px',
      minHeight: '120px',
      background: 'rgba(25, 20, 15, 0.95)',
      borderRadius: '12px',
      border: '2px solid #8a6a45',
      padding: '20px 24px 16px',
      boxSizing: 'border-box',
      cursor: 'pointer',
      display: 'flex',
      gap: '16px',
      alignItems: 'flex-start',
      pointerEvents: 'auto',
    });

    // 肖像区
    this.portraitEl = document.createElement('div');
    Object.assign(this.portraitEl.style, {
      flexShrink: '0',
      width: '56px',
      height: '56px',
      borderRadius: '8px',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '28px',
      fontWeight: 'bold',
      color: '#fff',
    });

    // 文本区
    const textArea = document.createElement('div');
    Object.assign(textArea.style, { flex: '1', minWidth: '0' });

    // 角色名
    this.nameEl = document.createElement('span');
    Object.assign(this.nameEl.style, {
      display: 'block',
      fontSize: '15px',
      fontWeight: 'bold',
      marginBottom: '6px',
      textShadow: '0 0 4px rgba(0,0,0,0.8)',
    });

    // 对话文本
    this.textEl = document.createElement('p');
    Object.assign(this.textEl.style, {
      margin: '0',
      fontSize: '15px',
      lineHeight: '1.7',
      color: '#e0e0e0',
      textShadow: '0 0 3px rgba(0,0,0,0.8)',
      wordBreak: 'break-word',
    });

    // 点击提示
    this.hintEl = document.createElement('span');
    Object.assign(this.hintEl.style, {
      display: 'block',
      marginTop: '8px',
      fontSize: '12px',
      color: '#666',
      textAlign: 'right',
    });
    this.hintEl.textContent = '▼ 点击或空格继续';

    // 选项容器（选项行显示，默认隐藏）
    this.optionsEl = document.createElement('div');
    Object.assign(this.optionsEl.style, {
      display: 'none',
      flexDirection: 'column',
      gap: '8px',
      marginTop: '12px',
    });

    textArea.appendChild(this.nameEl);
    textArea.appendChild(this.textEl);
    textArea.appendChild(this.hintEl);
    textArea.appendChild(this.optionsEl);
    box.appendChild(this.portraitEl);
    box.appendChild(textArea);
    this.container.appendChild(box);

    // 剧情回顾按钮（右上角，Skip 左侧；FEATURE-040）
    const histBtn = document.createElement('button');
    Object.assign(histBtn.style, {
      position: 'absolute',
      top: '16px',
      right: '104px',
      fontSize: '13px',
      padding: '6px 16px',
      background: 'rgba(255,255,255,0.08)',
      color: '#888',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: '6px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      pointerEvents: 'auto',
    });
    histBtn.textContent = '📖 剧情回顾';
    histBtn.addEventListener('mouseenter', () => {
      histBtn.style.background = 'rgba(255,255,255,0.18)';
      histBtn.style.color = '#ccc';
    });
    histBtn.addEventListener('mouseleave', () => {
      histBtn.style.background = 'rgba(255,255,255,0.08)';
      histBtn.style.color = '#888';
    });
    // 触屏兼容同 Skip：pointerdown 立即响应 + click 兜底 + stopPropagation（防误触推进对话）
    const doOpenHistory = (): void => { this.openHistory(); };
    histBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      doOpenHistory();
    });
    histBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      doOpenHistory();
    });
    this.container.appendChild(histBtn);

    // Skip 按钮（右上角）
    const skipBtn = document.createElement('button');
    Object.assign(skipBtn.style, {
      position: 'absolute',
      top: '16px',
      right: '24px',
      fontSize: '13px',
      padding: '6px 16px',
      background: 'rgba(255,255,255,0.08)',
      color: '#888',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: '6px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      pointerEvents: 'auto',
    });
    skipBtn.textContent = 'Skip ▸';
    skipBtn.addEventListener('mouseenter', () => {
      skipBtn.style.background = 'rgba(255,255,255,0.18)';
      skipBtn.style.color = '#ccc';
    });
    skipBtn.addEventListener('mouseleave', () => {
      skipBtn.style.background = 'rgba(255,255,255,0.08)';
      skipBtn.style.color = '#888';
    });
    // 触屏兼容：Android WebView 中 click 偶发不触发（真机反馈"跳过按钮没功能"），
    // pointerdown 立即响应 + click 兜底（skip 幂等：内部有 isOpen 检查，重复调用无害）
    const doSkip = (): void => { this.skip(); };
    skipBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      doSkip();
    });
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      doSkip();
    });
    this.container.appendChild(skipBtn);
    document.body.appendChild(this.container);

    // 点击推进
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      this.advance();
    });
  }

  /** 播放对话序列 */
  play(lines: DialogueLine[], onComplete?: () => void, onChoice?: (index: number) => void): void {
    this.completed = false;
    this.lines = lines;
    this.index = 0;
    this.onComplete = onComplete ?? null;
    this.onChoice = onChoice ?? null;
    // A4 动效：对话框 fadeIn（先 display 再 opacity）
    this.container.style.display = 'block';
    this.container.style.opacity = '0';
    panelFadeIn(this.container, 180);
    this.showLine();
  }

  /** 是否正在显示（display 非 'none' 即视为打开：panelFadeIn 会覆盖为 'flex'，close 用 'none' 隐藏） */
  isOpen(): boolean {
    return this.container.style.display !== 'none';
  }

  /** 跳过整段对话，直接触发 onComplete */
  skip(): void {
    if (!this.isOpen() || this.completed) return;
    // FEATURE-040：剧情回顾面板打开期间冻结，不允许跳过
    if (this.historyPanel?.isOpen()) return;
    // 防抖：Skip 按钮 pointerdown + click 双绑定，同一物理点击会触发两次；
    // 若首次 skip 的 onComplete 同步打开下一段对话，第二次会误关新对话并二次触发 onComplete。
    const now = Date.now();
    if (now - this.lastSkipAt < 300) return;
    this.lastSkipAt = now;
    this.completed = true;
    this.clearOptions();
    this.close(true);
    this.onComplete?.();
  }

  /** 是否停在选项行（选项必须做出选择，不允许跳过，与 advance 语义一致） */
  isOptionLine(): boolean {
    return !!this.optionsEl && this.optionsEl.style.display !== 'none';
  }

  /**
   * FEATURE-040：打开剧情回顾面板（只读）。
   * 打开期间冻结当前行：暂停打字机 timer、拦截 advance/skip；
   * 关闭后恢复打字机进度，对话状态不丢。
   */
  private openHistory(): void {
    if (!this.isOpen() || this.completed) return;
    if (this.historyPanel?.isOpen()) return;
    if (!this.historyPanel) {
      this.historyPanel = new DialogueHistoryPanel(() => {
        // 面板关闭回调：恢复冻结的当前行
        this.resumeFromHistory();
      });
    }
    // 冻结当前行：暂停打字机
    if (this.typeTimer !== null) {
      clearInterval(this.typeTimer);
      this.typeTimer = null;
    }
    this.savedTyping = this.typing;
    // 保存当前已打出的字符数（从 textEl 文本长度恢复）
    this.savedCharIdx = this.textEl.textContent?.length ?? 0;
    this.historyPanel.open();
  }

  /** 面板关闭后恢复打字机（若原在打字中，继续剩余字符） */
  private resumeFromHistory(): void {
    const line = this.lines[this.index];
    if (!line || this.completed) return;
    if (this.savedTyping && line.text && !line.options) {
      this.typing = true;
      const full = line.text;
      const startIdx = Math.min(this.savedCharIdx, full.length);
      this.textEl.textContent = full.slice(0, startIdx);
      let charIdx = startIdx;
      this.typeTimer = window.setInterval(() => {
        if (charIdx < full.length) {
          this.textEl.textContent = full.slice(0, charIdx + 1);
          charIdx++;
        } else {
          this.finishTyping();
        }
      }, 28);
    }
    this.savedTyping = false;
    this.savedCharIdx = 0;
  }

  /** 推进：正在打字时直接显示全文，否则下一句 */
  advance(): void {
    if (!this.isOpen() || this.completed) return;
    // FEATURE-040：剧情回顾面板打开期间冻结，不允许推进
    if (this.historyPanel?.isOpen()) return;
    // 选项行必须做出选择，不允许直接跳过
    if (this.optionsEl && this.optionsEl.style.display !== 'none') return;
    if (this.typing) {
      // 跳过打字效果，直接显示全文
      this.finishTyping();
    } else {
      this.index++;
      if (this.index >= this.lines.length) {
        // 置位后再触发回调：close(true) 有 150ms 淡出，期间 isOpen() 仍 true，
        // 防重入（否则连按/脚本再调 advance 会二次触发 onComplete）
        this.completed = true;
        this.close(true);
        this.onComplete?.();
      } else {
        this.showLine();
      }
    }
  }

  private showLine(): void {
    const line = this.lines[this.index];
    if (!line) return;
    this.clearOptions();

    // 选项行：隐藏普通文本，渲染选项按钮
    if (line.options && line.options.length > 0) {
      this.showOptions(line.options);
      return;
    }

    // FEATURE-040：普通行记录进剧情回顾历史（选项行不记录）
    addEntry({
      speaker: line.speaker ?? '',
      text: line.text,
      inner: !!line.inner,
      color: line.color,
      ts: Date.now(),
    });

    // 角色名
    if (line.inner) {
      // 内心独白：无名字，斜体灰字
      this.nameEl.textContent = '';
      this.nameEl.style.display = 'none';
      this.textEl.style.fontStyle = 'italic';
      this.textEl.style.color = '#999';
    } else if (line.speaker) {
      this.nameEl.textContent = line.speaker;
      this.nameEl.style.display = 'block';
      this.nameEl.style.color = line.color;
      this.textEl.style.fontStyle = 'normal';
      this.textEl.style.color = '#e0e0e0';
    } else {
      // 旁白/系统提示
      this.nameEl.textContent = '';
      this.nameEl.style.display = 'none';
      this.textEl.style.fontStyle = 'normal';
      this.textEl.style.color = '#b0b0b0';
    }

    // 肖像：有立绘显示立绘（§8.5 方案 A：128×128 桌面 / 96×96 移动端，object-fit 半身裁切），否则首字色块占位
    if (line.speaker && !line.inner) {
      const portrait = PORTRAIT_MAP[line.speaker];
      this.applyPortraitSize();
      this.portraitEl.style.display = 'flex';
      this.portraitEl.style.alignItems = 'center';
      this.portraitEl.style.justifyContent = 'center';
      if (portrait) {
        // 立绘加载：失败（文件缺失/404）时自动回退到首字+颜色占位，防止空白头像框
        this.portraitEl.innerHTML =
          `<img src="${portrait}" alt="" ` +
          `style="width:100%;height:100%;object-fit:cover;object-position:50% 18%;border-radius:8px;display:block;">`;
        this.portraitEl.style.background = line.color + '40';
        this.portraitEl.style.border = `2px solid ${line.color}`;
        const img = this.portraitEl.querySelector('img')!;
        img.addEventListener('error', () => {
          // 图片失败：隐藏图片，显示首字占位（保留颜色边框）
          this.portraitEl.textContent = line.speaker.charAt(0);
        });
      } else {
        this.portraitEl.innerHTML = '';
        this.portraitEl.style.background = line.color + '40';
        this.portraitEl.style.border = `2px solid ${line.color}`;
        this.portraitEl.textContent = line.speaker.charAt(0);
      }
    } else {
      this.portraitEl.style.display = 'none';
      this.portraitEl.innerHTML = '';
    }

    // 打字机效果
    this.textEl.textContent = '';
    this.typing = true;
    this.hintEl.style.opacity = '0';
    // 台词语音：按 (speaker, text) 映射播放；找不到音频静默跳过，不阻塞对话；
    // 选项行/旁白系统行在 find 内天然静默跳过
    VoiceBank.play(line.speaker, line.text, !!line.inner);
    // BUG-039：预加载下一句语音（当前句显示期间开始加载，消除推进时的起播延迟）
    const nextLine = this.lines[this.index + 1];
    if (nextLine && !nextLine.options) {
      VoiceBank.preload(nextLine.speaker, nextLine.text);
    }
    const text = line.text;
    let charIdx = 0;
    this.typeTimer = window.setInterval(() => {
      if (charIdx < text.length) {
        this.textEl.textContent += text[charIdx];
        charIdx++;
      } else {
        this.finishTyping();
      }
    }, 28);
  }

  private finishTyping(): void {
    if (this.typeTimer !== null) {
      clearInterval(this.typeTimer);
      this.typeTimer = null;
    }
    this.typing = false;
    const line = this.lines[this.index];
    if (line) {
      this.textEl.textContent = line.text;
    }
    this.hintEl.style.opacity = '1';
  }

  /** 头像尺寸：桌面 128×128，移动端 96×96（§8.5 方案 A） */
  private applyPortraitSize(): void {
    const size = isMobileLayout() ? 96 : 128;
    this.portraitEl.style.width = `${size}px`;
    this.portraitEl.style.height = `${size}px`;
  }

  /** 渲染选项按钮（选项行） */
  private showOptions(options: string[]): void {
    if (!this.optionsEl) return;
    this.optionsEl.innerHTML = '';
    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.textContent = `${i + 1}. ${opt}`;
      Object.assign(btn.style, {
        display: 'block',
        width: '100%',
        textAlign: 'left',
        fontSize: '15px',
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.06)',
        color: '#e0e0e0',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '8px',
        cursor: 'pointer',
        fontFamily: 'inherit',
      });
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.16)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.06)'; });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectOption(i);
      });
      this.optionsEl!.appendChild(btn);
    });
    this.optionsEl.style.display = 'flex';
    this.nameEl.textContent = '';
    this.nameEl.style.display = 'none';
    this.textEl.textContent = '';
    this.portraitEl.style.display = 'none';
    this.hintEl.style.opacity = '0';
    this.typing = false;
    if (this.typeTimer !== null) { clearInterval(this.typeTimer); this.typeTimer = null; }

    // 键盘 1/2/3 选择
    const handler = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= options.length) {
        e.preventDefault();
        this.selectOption(n - 1);
      }
    };
    window.addEventListener('keydown', handler);
    this.optionKeyHandler = handler;
  }

  /** 选择选项：回调 onChoice 后关闭（分支由调用方继续播放） */
  private selectOption(index: number): void {
    if (!this.isOpen()) return;
    this.clearOptions();
    this.close();
    this.onChoice?.(index);
  }

  /** 清理选项 UI 与键盘监听 */
  private clearOptions(): void {
    if (this.optionKeyHandler) {
      window.removeEventListener('keydown', this.optionKeyHandler);
      this.optionKeyHandler = null;
    }
    if (this.optionsEl) {
      this.optionsEl.style.display = 'none';
      this.optionsEl.innerHTML = '';
    }
  }

  /** 场景切换时静默重置（不触发 onComplete/onChoice）：关闭对话框并清空状态，防止残留对话状态跨场景传递 */
  reset(): void {
    this.completed = false;
    // FEATURE-040：场景切换时若历史面板开着，先关闭（避免残留覆盖层）
    if (this.historyPanel?.isOpen()) this.historyPanel.close();
    this.close(false); // 场景切换：瞬间隐藏，不播放动画
    this.lines = [];
    this.index = 0;
    this.onComplete = null;
    this.onChoice = null;
  }

  private close(animate = false): void {
    this.clearOptions();
    if (this.typeTimer !== null) {
      clearInterval(this.typeTimer);
      this.typeTimer = null;
    }
    this.typing = false;
    VoiceBank.stop();
    if (animate) {
      // A4 动效：对话框 fadeOut
      panelFadeOut(this.container, 150);
    } else {
      this.container.style.display = 'none';
    }
  }
}
