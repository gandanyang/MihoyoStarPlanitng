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
      pointerEvents: 'auto',
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
      background: 'rgba(15, 15, 25, 0.95)',
      borderRadius: '12px',
      border: '2px solid rgba(255,255,255,0.15)',
      padding: '20px 24px 16px',
      boxSizing: 'border-box',
      cursor: 'pointer',
      display: 'flex',
      gap: '16px',
      alignItems: 'flex-start',
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

    textArea.appendChild(this.nameEl);
    textArea.appendChild(this.textEl);
    textArea.appendChild(this.hintEl);
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
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.skip();
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
  play(lines: DialogueLine[], onComplete?: () => void): void {
    this.lines = lines;
    this.index = 0;
    this.onComplete = onComplete ?? null;
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
    this.close();
    this.onComplete?.();
  }

  /** 推进：正在打字时直接显示全文，否则下一句 */
  advance(): void {
    if (!this.isOpen()) return;
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

    // 肖像（用首字+颜色做简单占位）
    if (line.speaker && !line.inner) {
      this.portraitEl.style.display = 'flex';
      this.portraitEl.style.background = line.color + '40';
      this.portraitEl.style.border = `2px solid ${line.color}`;
      this.portraitEl.textContent = line.speaker.charAt(0);
    } else {
      this.portraitEl.style.display = 'none';
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
    }, 35);
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

  private close(): void {
    this.container.style.display = 'none';
    if (this.typeTimer !== null) {
      clearInterval(this.typeTimer);
      this.typeTimer = null;
    }
    this.typing = false;
  }
}
