/**
 * 环境音系统（v0.6 · 归星岛复苏阶段）
 *
 * 用 Web Audio API 程序合成"环境氛围音"，零外部音频文件。
 * 与 AudioSystem（一次性操作音效）不同：环境音是长生命周期循环音，
 * 按地图 + 昼夜差异组合播放，营造"这座岛是活的"氛围。
 *
 * 设计原则：
 * - "听到但注意不到"：音量极低（0.01~0.05），是氛围基底不是旋律
 * - 音源数封顶（≤8）：低端安卓防掉帧；操作音效优先于环境音
 * - 停止必须可靠：场景切换时 stop()，防止环境音残留跨场景
 * - 复用 AudioSystem 的合成原语（getCtx/tone/noise），不重复造轮子
 */

import { getCtx, tone } from './AudioSystem';

type AmbientName =
  | 'birds'     // 鸟叫（白天）
  | 'wind'      // 微风
  | 'crickets'  // 虫鸣（夜晚）
  | 'leaves'    // 树叶沙沙
  | 'mine'      // 矿石低鸣
  | 'voices'    // 小镇人声底噪
  | 'water'     // 水声
  | 'warmth';   // 屋内暖声

/** 每张地图的环境音组合 */
const MAP_AMBIENT: Record<string, { day: AmbientName[]; night: AmbientName[] }> = {
  farm:    { day: ['birds', 'wind'],        night: ['crickets', 'wind'] },
  forest:  { day: ['birds', 'leaves'],      night: ['crickets', 'leaves'] },
  mine:    { day: ['mine'],                 night: ['mine'] },
  town:    { day: ['voices', 'wind'],       night: ['crickets'] },
  gate:    { day: ['wind'],                 night: ['wind', 'crickets'] },
  station: { day: ['wind'],                 night: ['wind'] },
  house:   { day: ['warmth'],               night: ['warmth'] },
};

/** 全局音源数上限（含操作音效的并发预估） */
const MAX_SOURCES = 8;
/** 环境音最大音量（氛围基底，绝不可压过操作音效） */
const MAX_VOL = 0.05;

// ===== 模块级状态（跨场景单例） =====
let activeMap: string | null = null;
let stopped = true;
/** 当前正在播放的循环音源节点 */
const playing: Array<{ node: AudioNode; stop: () => void }> = [];
/** 定时器（随机事件音：鸟叫啁啾等） */
let eventTimer: ReturnType<typeof setInterval> | null = null;
let liveCount = 0;

/** 是否夜晚（18:00 - 6:00） */
function isNight(hour: number): boolean {
  return hour >= 18 || hour < 6;
}

/**
 * 创建持续循环音源（低频振荡器或滤波噪声，包络到目标音量后保持）
 * 返回 { node, stop }。stop 时淡出，避免爆音。
 */
function loopSource(
  type: 'osc' | 'noise',
  opts: { freq?: number; freq2?: number; filterFreq?: number; volume?: number },
): { node: AudioNode; stop: () => void } {
  const c = getCtx();
  const gain = c.createGain();
  const vol = Math.min(opts.volume ?? 0.03, MAX_VOL);
  const t = c.currentTime;

  let source: OscillatorNode | AudioBufferSourceNode;
  let filter: BiquadFilterNode | null = null;

  if (type === 'osc') {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = opts.freq ?? 200;
    // 双频叠加（低频低鸣质感）
    const osc2 = c.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = opts.freq2 ?? (opts.freq ?? 200) * 0.5;
    const g2 = c.createGain();
    g2.gain.value = 0.5;
    osc2.connect(g2);
    g2.connect(gain);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 1e8);
    osc2.stop(t + 1e8);
    source = osc;
  } else {
    // 滤波噪声（风/人声/暖声）
    const dur = c.sampleRate * 2;
    const buf = c.createBuffer(1, dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < dur; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = opts.filterFreq ?? 800;
    src.connect(filter);
    src.start(t);
    source = src;
  }

  // 淡入淡出控制
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0005), t + 1.2);
  const out = source as OscillatorNode;
  out.connect(filter ?? gain);
  if (filter) filter.connect(gain);
  gain.connect(c.destination);
  liveCount++;

  let faded = false;
  return {
    node: gain,
    stop: () => {
      if (faded) return;
      faded = true;
      liveCount = Math.max(0, liveCount - 1);
      const now = c.currentTime;
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      } catch { /* 忽略 */ }
      setTimeout(() => { try { out.stop(); } catch { /* 已停 */ } }, 500);
    },
  };
}

/** 鸟叫：随机间隔的高频短促啁啾（事件音，非循环） */
function scheduleBird(): void {
  if (stopped || activeMap !== 'farm' && activeMap !== 'forest') return;
  const base = 1800 + Math.random() * 800;
  const count = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    tone(base + Math.random() * 600, 0.05 + Math.random() * 0.05, 'sine', 0.02, i * 0.12);
  }
}

/** 启动环境音（进入地图时调用） */
export function start(mapKey: string, hour: number): void {
  stop();
  activeMap = mapKey;
  stopped = false;

  const combo = MAP_AMBIENT[mapKey];
  if (!combo) return;
  const list = isNight(hour) ? combo.night : combo.day;

  for (const name of list) {
    if (playing.length >= MAX_SOURCES - 2) break;
    switch (name) {
      case 'wind':
        playing.push(loopSource('noise', { filterFreq: 400, volume: 0.025 }));
        break;
      case 'leaves':
        playing.push(loopSource('noise', { filterFreq: 1200, volume: 0.02 }));
        break;
      case 'voices':
        playing.push(loopSource('noise', { filterFreq: 1000, volume: 0.012 }));
        break;
      case 'warmth':
        playing.push(loopSource('noise', { filterFreq: 250, volume: 0.015 }));
        break;
      case 'mine':
        playing.push(loopSource('osc', { freq: 70, freq2: 45, volume: 0.035 }));
        break;
      case 'crickets':
        playing.push(loopSource('osc', { freq: 4200, volume: 0.012 }));
        break;
      case 'birds':
        // 鸟叫用事件音，不进循环列表；由定时器调度
        break;
    }
  }

  // 鸟叫定时器（仅 farm/forest 白天）
  if (list.includes('birds')) {
    eventTimer = setInterval(() => scheduleBird(), 2500 + Math.random() * 2000);
    scheduleBird();
  }
}

/** 停止所有环境音（场景切换时调用，必须可靠） */
export function stop(): void {
  stopped = true;
  activeMap = null;
  for (const p of playing) p.stop();
  playing.length = 0;
  if (eventTimer) {
    clearInterval(eventTimer);
    eventTimer = null;
  }
}

/** 页面隐藏时停止环境音（省电 + 防后台爆音），回前台由外部重新 start */
export function pause(): void {
  if (stopped) return;
  stop();
}

/** 获取当前活动地图（调试/探针用） */
export function getActiveMap(): string | null {
  return activeMap;
}
