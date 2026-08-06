/**
 * 归星录 · 相簿面板（DOM 覆盖层）
 *
 * 玩家在归星岛生活过程中留下的记忆收藏（第一版 3 张）：
 * 每张照片 = 一段经历（标题 + 画面 + 描述 + 获得方式），完成对应经历解锁。
 *
 * - 解锁照片：webp 图 + 标题/描述/来源
 * - 未解锁：剪影占位 + 获得方式提示（"完成「整理旧花园」"）
 * - 复用 panelFadeIn/panelFadeOut；Esc / 关闭按钮 / 点空白关闭
 *
 * 数据源：src/data/PhotoAlbum.ts（PHOTO_DATABASE + 存档 album: string[]）
 */

import { getAllPhotos, unlockedPhotoCount } from '../data/PhotoAlbum';
import { panelFadeIn, panelFadeOut } from './dom-anim';

// ===== 模块级单例 =====
let panelEl: HTMLDivElement | null = null;
let domCreated = false;
let open = false;
let onCloseCb: (() => void) | null = null;

/** 关闭面板 */
function closePanel(): void {
  if (!open) return;
  open = false;
  if (panelEl) panelFadeOut(panelEl, 150);
  onCloseCb?.();
}

/** 创建 DOM（只创建一次） */
function createDom(): void {
  if (domCreated) return;
  if (document.getElementById('photo-album-panel')) {
    domCreated = true;
    return;
  }
  domCreated = true;

  panelEl = document.createElement('div');
  panelEl.id = 'photo-album-panel';
  panelEl.style.cssText =
    'position:fixed;top:0;right:0;bottom:0;left:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(5,8,28,0.85);z-index:220;user-select:none;-webkit-user-select:none;';

  panelEl.innerHTML = `
    <div style="width:min(560px,94vw);max-height:86vh;background:rgba(20,24,46,0.97);border:2px solid #3a4a8e;border-radius:12px;padding:16px;color:#e8ecff;font-family:Arial;box-shadow:0 4px 30px rgba(0,0,0,0.6);display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-shrink:0;">
        <span style="font-size:12px;letter-spacing:3px;color:#6a7ab8;">📖 归星录</span>
        <button data-action="close" style="width:30px;height:30px;border-radius:50%;background:#3a4a8e;border:none;color:#fff;font-size:16px;cursor:pointer;line-height:1;">×</button>
      </div>
      <div style="font-size:20px;font-weight:bold;color:#fff;margin-bottom:2px;flex-shrink:0;">相簿</div>
      <div id="pa-sub" style="font-size:12px;color:#8090c0;margin-bottom:14px;flex-shrink:0;">在这座岛上生活过的证明</div>
      <div id="pa-list" style="overflow-y:auto;flex:1;min-height:0;display:flex;flex-direction:column;gap:14px;"></div>
    </div>
  `;
  document.body.appendChild(panelEl);

  // 点空白关闭
  panelEl.addEventListener('click', (e) => {
    if (e.target === panelEl) closePanel();
  });
  // P2-1：图片加载失败兜底（事件委托，捕获阶段处理 img error）
  panelEl.addEventListener('error', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG' && target.hasAttribute('data-photo-img')) {
      e.stopPropagation();
      handleImgError(target as HTMLImageElement);
    }
  }, true);
  const closeBtn = panelEl.querySelector('[data-action="close"]') as HTMLElement | null;
  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    closePanel();
  });
  // Esc 关闭
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      closePanel();
    }
  });
}

/** 单张照片卡片（解锁 / 未解锁两种态） */
function renderCard(p: { id: string; title: string; image: string; description: string; source: string; unlocked: boolean }): string {
  if (p.unlocked) {
    // P2-1：图片加载失败（资源缺失/404）时回退为剪影占位，防止破图
    return `
      <div class="pa-card" data-id="${p.id}" data-unlocked="1" style="background:rgba(255,255,255,0.03);border-radius:10px;padding:12px;border-left:3px solid #7eb8da;">
        <div style="font-size:15px;font-weight:bold;color:#dde4ff;margin-bottom:6px;">《${escapeHtml(p.title)}》</div>
        <img src="${p.image}" alt="${escapeHtml(p.title)}" data-photo-img="1"
          style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;display:block;border:1px solid rgba(255,255,255,0.15);">
        <div style="font-size:12px;color:#b8c4e0;line-height:1.6;margin-top:8px;">${escapeHtml(p.description)}</div>
        <div style="font-size:11px;color:#8fa2c8;margin-top:6px;">获得方式：${escapeHtml(p.source)}</div>
      </div>
    `;
  }
  // 未解锁：剪影占位（不剧透画面，仅提示来源）
  return `
    <div class="pa-card" data-id="${p.id}" data-unlocked="0" style="background:rgba(255,255,255,0.02);border-radius:10px;padding:12px;border-left:3px solid #5a4a3a;opacity:0.75;">
      <div style="font-size:15px;font-weight:bold;color:#9a8a72;margin-bottom:6px;">《？？？》</div>
      <div style="width:100%;aspect-ratio:16/9;border-radius:8px;display:flex;align-items:center;justify-content:center;
        background:repeating-linear-gradient(45deg,#2a2438,#2a2438 10px,#241f30 10px,#241f30 20px);border:1px dashed rgba(255,255,255,0.15);">
        <span style="font-size:28px;">🔒</span>
      </div>
      <div style="font-size:11px;color:#8fa2c8;margin-top:8px;">获得方式：${escapeHtml(p.source)}</div>
    </div>
  `;
}

/** 简易 HTML 转义（P2-2：防止文案中的 < > & 破坏面板结构，与 DialogueHistoryPanel 一致） */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 图片加载失败兜底（事件委托，挂载在 #pa-list 上）：隐藏 img，替换为剪影占位 */
function handleImgError(img: HTMLImageElement): void {
  img.style.display = 'none';
  const placeholder = document.createElement('div');
  placeholder.style.cssText =
    'width:100%;aspect-ratio:16/9;border-radius:8px;display:flex;align-items:center;justify-content:center;' +
    'background:repeating-linear-gradient(45deg,#2a2438,#2a2438 10px,#241f30 10px,#241f30 20px);' +
    'border:1px dashed rgba(255,255,255,0.15);';
  placeholder.textContent = '🖼️';
  img.replaceWith(placeholder);
}

/** 刷新相簿内容 */
function refresh(): void {
  if (!panelEl) return;
  const sub = panelEl.querySelector('#pa-sub');
  if (sub) {
    sub.textContent = `已解锁 ${unlockedPhotoCount()} / ${getAllPhotos().length} · 在这座岛上生活过的证明`;
  }
  const list = panelEl.querySelector('#pa-list');
  if (list) {
    list.innerHTML = getAllPhotos().map(renderCard).join('');
  }
}

export class PhotoAlbumPanel {
  constructor(closeCb?: () => void) {
    if (closeCb) onCloseCb = closeCb;
    if (!domCreated) createDom();
  }

  /** 打开相簿 */
  open(): void {
    open = true;
    if (panelEl) {
      refresh();
      panelFadeIn(panelEl, 180);
    }
  }

  /** 关闭 */
  close(): void {
    closePanel();
  }

  /** 是否打开 */
  isOpen(): boolean {
    return open;
  }
}
