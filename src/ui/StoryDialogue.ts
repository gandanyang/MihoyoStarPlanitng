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

/** 对话立绘映射（§8.5 方案 A）：说话人 → 立绘资源；无映射角色回退首字色块 */
const PORTRAIT_MAP: Record<string, string> = {
  林澈: 'assets/portraits/linchen.png',
  夏雅: 'assets/portraits/xiya.png',
 村长: 'assets/portraits/elder_ai.png',
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
    this.lines = lines;
    this.index = 0;
    this.onComplete = onComplete ?? null;
    this.onChoice = onChoice ?? null;
    this.container.style.display = 'block';
    this.showLine();
  }

  /** 是否正在显示 */
  isOpen(): boolean {
    return this.container.style.display === 'block';
  }

  /** 跳过整段对话，直接触发 onComplete */
  skip(): void {
    if (!this.isOpen()) return;
    this.clearOptions();
    this.close();
    this.onComplete?.();
  }

  /** 推进：正在打字时直接显示全文，否则下一句 */
  advance(): void {
    if (!this.isOpen()) return;
    // 选项行必须做出选择，不允许直接跳过
    if (this.optionsEl && this.optionsEl.style.display !== 'none') return;
    if (this.typing) {
      // 跳过打字效果，直接显示全文
      this.finishTyping();
    } else {
      this.index++;
      if (this.index >= this.lines.length) {
        this.close();
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
    this.close();
    this.lines = [];
    this.index = 0;
    this.onComplete = null;
    this.onChoice = null;
  }

  private close(): void {
    this.clearOptions();
    this.container.style.display = 'none';
    if (this.typeTimer !== null) {
      clearInterval(this.typeTimer);
      this.typeTimer = null;
    }
    this.typing = false;
  }
}
