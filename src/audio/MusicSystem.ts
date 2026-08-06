/**
 * BGM 播放系统（v0.10 Web Audio 改造）
 *
 * - fetch + AudioContext.decodeAudioData + AudioBufferSourceNode 播放
 * - 绕过 HTMLAudioElement 媒体嗅探（防 IDM 下载弹窗）
 * - 复用 AudioSystem 的全局 AudioContext（单例）
 * - LRU 缓存已解码音频，上限 2 首防内存膨胀
 * - 浏览器自动播放拦截：先记录 pending，首次用户交互时 ctx.resume() + 补播
 * - 场景切换由各场景 SHUTDOWN 调 stop()，避免叠播
 * - 使用 ogg（P0 资产瘦身：mp3 fallback 已移出 runtime，现代浏览器均支持 ogg vorbis）
 */

import { getCtx } from '../systems/AudioSystem';

// 文件实际位于 public/assets/audio/music/，必须带 assets/ 前缀
const TRACKS: Record<string, string> = {
  title: 'assets/audio/music/title.ogg',
  farm_day: 'assets/audio/music/farm_day.ogg',
  stargaze_night: 'assets/audio/music/stargaze_night.ogg',
  stargaze_final: 'assets/audio/music/stargaze_final.ogg',
};

/** 根据浏览器支持选择最佳格式 */
function getTrackUrl(key: string): string | null {
  const track = TRACKS[key];
  if (!track) return null;
  return track;
}

// ── LRU 缓存（最多 2 首） ──
const CACHE_MAX = 2;
const cache = new Map<string, AudioBuffer>();
const cacheOrder: string[] = []; // 最近使用的在末尾

function cacheGet(key: string): AudioBuffer | undefined {
  if (!cache.has(key)) return undefined;
  // 移到末尾（最近使用）
  const idx = cacheOrder.indexOf(key);
  if (idx >= 0) cacheOrder.splice(idx, 1);
  cacheOrder.push(key);
  return cache.get(key);
}

function cacheSet(key: string, buf: AudioBuffer): void {
  if (cache.has(key)) {
    const idx = cacheOrder.indexOf(key);
    if (idx >= 0) cacheOrder.splice(idx, 1);
  } else if (cacheOrder.length >= CACHE_MAX) {
    // 淘汰最久未使用的
    const evict = cacheOrder.shift();
    if (evict) cache.delete(evict);
  }
  cache.set(key, buf);
  cacheOrder.push(key);
}

// ── 播放状态 ──
// 录制视频期间全局屏蔽 BGM（2026-08-06 制作人要求）→ 已恢复（同日），BGM 正常播放。
// 如需再次静音：改为 true 即可。
const BGM_MUTED = false;
let currentSource: AudioBufferSourceNode | null = null;
let currentGain: GainNode | null = null;
let currentVolume = 0.35;
let pendingKey: string | null = null;
let retryBound = false;

function tryStart(): void {
  if (!pendingKey) return;
  const key = pendingKey;
  pendingKey = null;
  MusicSystem.play(key);
}

function bindRetry(): void {
  if (retryBound) return;
  retryBound = true;
  window.addEventListener('pointerdown', tryStart, { once: true, capture: true });
  window.addEventListener('keydown', tryStart, { once: true, capture: true });
}

/** 防 IDM：给 URL 加随机参数，让 IDM 识别不出是音频文件 */
function antiIDM(url: string): string {
  return url + '?_t=' + Date.now();
}

/** 加载并解码音频（fetch → AudioBuffer） */
async function loadAndDecode(key: string): Promise<AudioBuffer | null> {
  // 优先从缓存读取
  const cached = cacheGet(key);
  if (cached) return cached;

  const url = getTrackUrl(key);
  if (!url) return null;

  try {
    const resp = await fetch(antiIDM(url));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrayBuf = await resp.arrayBuffer();
    const ctx = getCtx();
    const audioBuf = await ctx.decodeAudioData(arrayBuf);
    cacheSet(key, audioBuf);
    return audioBuf;
  } catch (err) {
    console.warn(`[MusicSystem] 加载失败: ${key}`, err);
    return null;
  }
}

/** 停止当前播放 */
function stopCurrent(): void {
  pendingKey = null;
  if (currentSource) {
    try {
      currentSource.stop();
      currentSource.disconnect();
    } catch { /* ignore */ }
    currentSource = null;
  }
  if (currentGain) {
    try { currentGain.disconnect(); } catch { /* ignore */ }
    currentGain = null;
  }
}

export const MusicSystem = {
  async play(key: string): Promise<void> {
    if (BGM_MUTED) {
      stopCurrent();
      return;
    }
    const url = getTrackUrl(key);
    if (!url) return;
    stopCurrent();

    const audioBuf = await loadAndDecode(key);
    if (!audioBuf) return;

    // 播放
    try {
      const ctx = getCtx();
      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.loop = true;

      const gain = ctx.createGain();
      gain.gain.value = currentVolume;

      source.connect(gain);
      gain.connect(ctx.destination);

      source.start(0);

      currentSource = source;
      currentGain = gain;

      // 如果 AudioContext 被挂起，记录 pending 等用户交互补播
      if (ctx.state === 'suspended') {
        pendingKey = key;
        bindRetry();
      }
    } catch (err) {
      console.warn(`[MusicSystem] 播放失败: ${key}`, err);
      stopCurrent();
    }
  },

  stop(): void {
    stopCurrent();
  },

  setVolume(v: number): void {
    currentVolume = v;
    if (currentGain) {
      currentGain.gain.value = v;
    }
  },
};
