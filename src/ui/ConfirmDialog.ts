/**
 * 通用确认弹窗（一键出售防误触二次确认用）
 *
 * 与 AndroidBackHandler 退出确认框同风格；模块级单例、DOM 随用随建随销毁。
 * 仅做「确认 / 取消」二次确认，确认后执行回调。
 */

let el: HTMLDivElement | null = null;

/** 关闭并清理确认框 */
function closeConfirm(): void {
  if (el) {
    el.remove();
    el = null;
  }
}

/**
 * 弹出确认框
 * @param message 确认文案
 * @param onOk    确认后的回调
 */
export function showConfirmDialog(message: string, onOk: () => void): void {
  if (el) return; // 防重复弹出
  const d = document.createElement('div');
  el = d;
  Object.assign(d.style, {
    position: 'fixed',
    inset: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.55)',
    zIndex: '980',
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

  d.innerHTML = `
    <div style="${card}">
      <div style="font-size:16px;font-weight:bold;margin-bottom:6px;">${message}</div>
      <button data-act="ok" style="${btnBase}background:#a04030;">确认</button>
      <button data-act="cancel" style="${btnBase}background:#8a6a45;">取消</button>
    </div>`;
  document.body.appendChild(d);

  // 触屏：pointerup 主处理，click 兜底去重（同 AndroidBackHandler / TitleScene 按钮模式）
  let pointerHandled = false;
  const doAction = (act: string | undefined): void => {
    if (act === 'ok') {
      closeConfirm();
      onOk();
    } else {
      closeConfirm(); // cancel / 空白遮罩 → 取消
    }
  };
  d.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
  });
  d.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    e.preventDefault();
    pointerHandled = true;
    const btn = (e.target as HTMLElement).closest?.('button[data-act]') as HTMLElement | null;
    doAction(btn?.dataset.act);
  });
  d.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (pointerHandled) { pointerHandled = false; return; }
    const btn = (e.target as HTMLElement).closest?.('button[data-act]') as HTMLElement | null;
    doAction(btn?.dataset.act);
  });
}
