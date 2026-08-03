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
/** 当前昼夜状态（用于 update 检测翻转） */
let currentNight = false;
/** 当前正在播放的循环音源节点 */
const playing: Array<{ node: AudioNode; stop: () => void }> = [];
/** 定时器（随机事件音：鸟叫啁啾等） */
let eventTimer: ReturnType<typeof setInterval> | null = null;
/** 链式 setTimeout 调度用的 token（stop 时失效，防止停止后继续调度） */
let scheduleToken = 0;
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
  opts: { freq?: number; freq2?: number; filterFreq?: number; volume?: number; vibrato?: number; lfoHz?: number; lfoDepth?: number },
): { node: AudioNode; stop: () => void } {
  const c = getCtx();
  const gain = c.createGain();
  const vol = Math.min(opts.volume ?? 0.03, MAX_VOL);
  const t = c.currentTime;

  let source: OscillatorNode | AudioBufferSourceNode;
  let filter: BiquadFilterNode | null = null;
  /** 需要随 stop() 一起停止的所有振荡器/源（osc 分支有双频叠加，必须全部停） */
  const oscs: OscillatorNode[] = [];

  if (type === 'osc') {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = opts.freq ?? 200;
    const osc2 = c.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = opts.freq2 ?? (opts.freq ?? 200) * 0.5;
    const g2 = c.createGain();
    g2.gain.value = 0.5;
    osc2.connect(g2);
    g2.connect(gain);
    oscs.push(osc, osc2);
    // 颤音（vibrato）：低频 LFO 调制主频，模拟虫鸣/生命感的自然波动
    if (opts.vibrato) {
      const lfo = c.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = opts.vibrato;
      const lfoGain = c.createGain();
      lfoGain.gain.value = (opts.freq ?? 200) * 0.04;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(t);
      oscs.push(lfo);
    }
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

  // 缓慢增益起伏（自然感）：masterGain 承接低频正弦 LFO，模拟风/树叶的天然波动。
  // 独立于淡入淡出的 gain，避免调度冲突。
  let master: GainNode = gain;
  if (opts.lfoHz && opts.lfoHz > 0) {
    master = c.createGain();
    const depth = opts.lfoDepth ?? 0.35; // 起伏深度（相对基础音量）
    master.gain.setValueAtTime(vol * (1 - depth), t);
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = opts.lfoHz;
    const lfoGain = c.createGain();
    lfoGain.gain.value = vol * depth;
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);
    lfo.start(t);
    oscs.push(lfo);
    gain.connect(master);
  }
  master.connect(c.destination);
  liveCount++;

  let faded = false;
  return {
    node: master,
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
      setTimeout(() => {
        try {
          out.stop();
          for (const o of oscs) o.stop();
        } catch { /* 已停 */ }
      }, 500);
    },
  };
}

/** 鸟叫：随机间隔的高频短促啁啾（事件音，非循环） */
function scheduleBird(): void {
  // 用 token 判断当前调度链是否仍有效（stop/切图后失效）
  const myToken = scheduleToken;
  const next = () => setTimeout(() => {
    if (stopped || scheduleToken !== myToken) return;
    scheduleBird();
  }, 4000 + Math.random() * 5000);

  if (stopped || activeMap !== 'farm' && activeMap !== 'forest') { return; }
  const base = 1800 + Math.random() * 800;
  const count = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    // 音量更低（0.015 而非 0.02）+ 音高带轻微滑移，减少"电子啁啾"感
    tone(base + Math.random() * 600, 0.05 + Math.random() * 0.05, 'sine', 0.015, i * 0.12);
  }
  next();
}

/** 启动环境音（进入地图时调用） */
export function start(mapKey: string, hour: number): void {
  stop();
  activeMap = mapKey;
  stopped = false;
  currentNight = isNight(hour);

  const combo = MAP_AMBIENT[mapKey];
  if (!combo) return;
  const list = isNight(hour) ? combo.night : combo.day;

  for (const name of list) {
    if (playing.length >= MAX_SOURCES - 2) break;
    switch (name) {
      case 'wind':
        // 风声：低通噪声 + 缓慢起伏（0.15Hz 大起伏模拟阵风）
        playing.push(loopSource('noise', { filterFreq: 400, volume: 0.025, lfoHz: 0.15, lfoDepth: 0.5 }));
        break;
      case 'leaves':
        // 树叶沙沙：中频噪声 + 轻微起伏
        playing.push(loopSource('noise', { filterFreq: 1200, volume: 0.02, lfoHz: 0.4, lfoDepth: 0.4 }));
        break;
      case 'voices':
        // 小镇人声底噪：极低音量 + 缓慢起伏（人声群的"潮汐感"）
        playing.push(loopSource('noise', { filterFreq: 1000, volume: 0.012, lfoHz: 0.12, lfoDepth: 0.45 }));
        break;
      case 'warmth':
        // 屋内暖声：极低频暖噪声 + 很慢的起伏（稳定安全感）
        playing.push(loopSource('noise', { filterFreq: 250, volume: 0.015, lfoHz: 0.08, lfoDepth: 0.3 }));
        break;
      case 'mine':
        playing.push(loopSource('osc', { freq: 70, freq2: 45, volume: 0.035, vibrato: 0.2, lfoHz: 0.2, lfoDepth: 0.3 }));
        break;
      case 'crickets':
        // 蝉鸣感：高频正弦 + 慢颤音（5-8Hz 更接近自然，非 24Hz 电路感）+ 轻微起伏
        playing.push(loopSource('osc', { freq: 4200, volume: 0.012, vibrato: 6, lfoHz: 0.3, lfoDepth: 0.3 }));
        break;
      case 'birds':
        // 鸟叫用事件音，不进循环列表；由定时器调度
        break;
    }
  }

  // 鸟叫调度（仅 farm/forest 白天）：链式 setTimeout，4-9s 随机间隔，避免机械节拍
  if (list.includes('birds')) {
    scheduleToken++;
    scheduleBird();
  }
}

/**
 * 昼夜翻转检测（每帧或低频调用）。
 * 时间从白天跨到夜晚（或反之）时，重新加载当前地图的环境音组合
 * （白天鸟叫 → 夜晚虫鸣）。未翻转时零开销返回。
 */
export function update(hour: number): void {
  if (stopped || !activeMap) return;
  const night = isNight(hour);
  if (night === currentNight) return;
  // 翻转：用当前小时重起环境音（start 内部先 stop 再按新时段加载）
  start(activeMap, hour);
}

/** 停止所有环境音（场景切换时调用，必须可靠） */
export function stop(): void {
  stopped = true;
  activeMap = null;
  scheduleToken++; // 使当前鸟叫调度链失效，防止停止后继续触发
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
