/**
 * DOM 面板过渡动画工具（A4 核心动效）
 *
 * 统一为 UI 面板提供 opacity fadeIn/fadeOut，避免 display 硬切。
 * 三个面板（Backpack/Shop/Quest）共享同一模式，不重复实现。
 *
 * 设计原则：
 *   - 先 display 再 opacity（避免 display:none 时 opacity 不生效）
 *   - fadeOut 结束后回调 display:none（防闪烁）
 *   - 支持取消上一次未完成的动画（快速开关场景）
 */

let _id = 0;
/** 为每次动画分配唯一 id，用于取消旧动画 */
function nextId(): number { return ++_id; }

/** 记录每个元素当前活跃的动画 id，用于取消 */
const activeAnims = new WeakMap<HTMLElement, number>();

/**
 * 面板淡入（display:flex/block → opacity 1）
 * @param el 面板 DOM 元素
 * @param duration 淡入时长 ms（默认 180）
 * @returns Promise（动画完成或被取消时 resolve）
 */
export function panelFadeIn(el: HTMLElement, duration = 180): Promise<void> {
  return new Promise((resolve) => {
    // 取消该元素上一次未完成的动画
    const prev = activeAnims.get(el);
    if (prev !== undefined) activeAnims.delete(el);

    const myId = nextId();
    activeAnims.set(el, myId);

    // 确保 display 生效后再设 opacity
    el.style.display = 'flex';
    el.style.opacity = '0';
    el.style.transition = `opacity ${duration}ms ease`;

    // 强制回流后启动动画
    void el.offsetHeight;
    el.style.opacity = '1';

    const onEnd = () => {
      el.removeEventListener('transitionend', onEnd);
      if (activeAnims.get(el) !== myId) { resolve(); return; }
      activeAnims.delete(el);
      el.style.transition = '';
      resolve();
    };
    el.addEventListener('transitionend', onEnd, { once: true });

    // 兜底：transitionend 可能不触发（如 duration=0）
    setTimeout(onEnd, duration + 20);
  });
}

/**
 * 面板淡出（opacity 0 → display:none）
 * @param el 面板 DOM 元素
 * @param duration 淡出时长 ms（默认 150）
 * @returns Promise（动画完成或被取消时 resolve）
 */
export function panelFadeOut(el: HTMLElement, duration = 150): Promise<void> {
  return new Promise((resolve) => {
    const prev = activeAnims.get(el);
    if (prev !== undefined) activeAnims.delete(el);

    const myId = nextId();
    activeAnims.set(el, myId);

    el.style.transition = `opacity ${duration}ms ease`;
    el.style.opacity = '1';

    void el.offsetHeight;
    el.style.opacity = '0';

    const onEnd = () => {
      el.removeEventListener('transitionend', onEnd);
      if (activeAnims.get(el) !== myId) { resolve(); return; }
      activeAnims.delete(el);
      el.style.transition = '';
      el.style.display = 'none';
      resolve();
    };
    el.addEventListener('transitionend', onEnd, { once: true });

    setTimeout(onEnd, duration + 20);
  });
}
