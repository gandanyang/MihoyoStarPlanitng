/**
 * 剧情语音播放（任务-主线剧情语音生成与接入 §五 最小侵入接入）
 *
 * - 映射数据 VOICE_ENTRIES：由 tools/gen_mainline_voice.py --emit-voicebank 生成（勿手改）
 * - 匹配规则：speaker 精确匹配（'' 为通配，用于少女/HR/纸条等空说话人行）+ 归一化文本精确匹配
 * - 归一化：剥开头（…）语气/舞台标注 + 剥「」引号，与 StorySystem.ts 原文对齐
 * - 找不到音频 → 静默跳过，不阻塞对话
 * - 同 (speaker,text) 存在多个音频文件（如「嗯。」harvest_02/evening_04）→ 轮换播放
 * - 内心独白（inner）→ 轻混响区分（Web Audio 现场生成 IR）；不可用回退原音
 * - 使用 fetch + AudioContext.decodeAudioData + AudioBufferSourceNode 播放
 *   绕过 HTMLAudioElement 媒体嗅探（防 IDM 下载弹窗）
 *
 * 使用：
 *   import { VoiceBank } from '../audio/VoiceBank';
 *   VoiceBank.play(line.speaker, line.text, !!line.inner); // 找不到自动静默跳过
 */

import { VOICE_ENTRIES, VoiceEntry } from './voicebank.data';
import { getCtx } from '../systems/AudioSystem';

/** 归一化 StorySystem 原文 → 与生成脚本 T 清单文本对齐：
 *  剥开头（…）语气标注（（笑）/（笑了笑）/（点点头）…），再剥首尾「」。
 *  若整行被（…）舞台指示包裹（剥后为空），尝试提取「…」引用部分（如纸条）。 */
function normalize(text: string): string {
  let t = text.replace(/^（[^）]*）/u, '');
  t = t.replace(/^「/u, '').replace(/」$/u, '');
  t = t.trim();
  if (t === '') {
    // 整行是（…）包裹的舞台指示：提取「引用」部分（纸条行）
    const m = text.match(/「([^」]+)」/u);
    if (m) t = m[1].trim();
  }
  return t;
}

// ── Web Audio 播放状态（防 IDM 下载弹窗） ──
let currentSource: AudioBufferSourceNode | null = null;
let currentGain: GainNode | null = null;
let pendingSource: AudioBufferSourceNode | null = null;
let pendingGain: GainNode | null = null;

/** 已发起过预加载的音频 URL → AudioBuffer（避免重复加载同一文件） */
const preloadCache = new Map<string, AudioBuffer>();

/** 全局手势解锁：首次交互时恢复 AudioContext */
function unlockAudio(): void {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* ignore */ }
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', unlockAudio);
  document.addEventListener('touchend', unlockAudio);
  document.addEventListener('keydown', unlockAudio);
}

/** 现场生成短指数衰减噪声 IR，用于内心独白轻混响（不依赖外部文件） */
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

/** 防 IDM：给 URL 加随机参数，让 IDM 识别不出是音频文件 */
function antiIDM(url: string): string {
  return url + '?_t=' + Date.now();
}

export class VoiceBank {
  private static usedCount = new Map<string, number>();

  /** 查找 (speaker, text) 对应的音频相对路径；找不到返回 null */
  static find(speaker: string, text: string): string | null {
    const norm = normalize(text);
    const matches = VOICE_ENTRIES.filter(
      (e: VoiceEntry) =>
        (e.speaker === '' || e.speaker === speaker) && normalize(e.text) === norm,
    );
    if (matches.length === 0) return null;
    // 同 (speaker,text) 多个文件（如「嗯。」harvest_02/evening_04）→ 轮换，保证都用上
    const key = matches.map((m) => m.file).join('|');
    const i = (VoiceBank.usedCount.get(key) ?? 0) % matches.length;
    // 优先使用标准化后的音频（音量统一 -16 LUFS）
    return 'audio/voice_normalized/' + matches[i].file;
  }

  /** 播放台词语音；找不到音频静默跳过，不阻塞对话 */
  static play(speaker: string, text: string, inner = false): void {
    const url = VoiceBank.find(speaker, text);
    if (!url) {
      // 当前行无语音（旁白/系统行等）：停止上一句残留语音，保证语音与显示行同步
      VoiceBank.stop();
      return;
    }
    VoiceBank.stop();

    // 使用 Web Audio API 播放（防 IDM 下载弹窗）
    const ctx = getCtx();
    
    // 尝试从预加载缓存获取 AudioBuffer
    let audioBuf = preloadCache.get(url);
    
    if (audioBuf) {
      // 缓存命中，直接播放
      VoiceBank.playBuffer(ctx, audioBuf, inner);
    } else {
      // 缓存未命中，fetch + decode 后播放（防 IDM：URL 加时间戳）
      fetch(antiIDM(url))
        .then(resp => {
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          return resp.arrayBuffer();
        })
        .then(arrayBuf => ctx.decodeAudioData(arrayBuf))
        .then(audioBuf => {
          preloadCache.set(url, audioBuf);
          VoiceBank.playBuffer(ctx, audioBuf, inner);
        })
        .catch(err => {
          console.warn(`[VoiceBank] 加载失败: ${url}`, err);
        });
    }
  }

  /** 使用 AudioBufferSourceNode 播放音频（防 IDM 下载弹窗） */
  private static playBuffer(ctx: AudioContext, audioBuf: AudioBuffer, inner: boolean): void {
    const source = ctx.createBufferSource();
    source.buffer = audioBuf;
    
    const gain = ctx.createGain();
    gain.gain.value = 1.0;
    
    if (inner) {
      // 内心独白：轻混响
      try {
        const dry = ctx.createGain();
        dry.gain.value = 0.85;
        const wet = ctx.createGain();
        wet.gain.value = 0.4;
        const conv = ctx.createConvolver();
        conv.buffer = makeImpulse(ctx, 1.2, 2.2);
        
        source.connect(dry);
        dry.connect(ctx.destination);
        source.connect(conv);
        conv.connect(wet);
        wet.connect(ctx.destination);
      } catch {
        // 混响链路不可用 → 走原音
        source.connect(gain);
        gain.connect(ctx.destination);
      }
    } else {
      source.connect(gain);
      gain.connect(ctx.destination);
    }
    
    source.start(0);
    
    // 保存当前播放状态（用于 stop）
    currentSource = source;
    currentGain = gain;
    
    source.onended = () => {
      if (currentSource === source) {
        currentSource = null;
        currentGain = null;
      }
    };
  }

  /** 预加载 (speaker,text) 的全部候选语音（不改变轮换；旁白/选项行 find 内天然跳过）。
   *  用于对白推进前预热下一句，消除 Android WebView 加载慢导致的起播延迟。
   *  使用 fetch + decodeAudioData 预加载（防 IDM 下载弹窗）。 */
  static preload(speaker: string, text: string): void {
    const norm = normalize(text);
    const matches = VOICE_ENTRIES.filter(
      (e: VoiceEntry) =>
        (e.speaker === '' || e.speaker === speaker) && normalize(e.text) === norm,
    );
    
    const ctx = getCtx();
    
    for (const m of matches) {
      // 优先使用标准化后的音频（音量统一 -16 LUFS）
      const url = 'audio/voice_normalized/' + m.file;
      if (preloadCache.has(url)) continue;
      
      // fetch + decode 后缓存（防 IDM：URL 加时间戳）
      fetch(antiIDM(url))
        .then(resp => {
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          return resp.arrayBuffer();
        })
        .then(arrayBuf => ctx.decodeAudioData(arrayBuf))
        .then(audioBuf => {
          preloadCache.set(url, audioBuf);
        })
        .catch(() => { /* 忽略加载失败 */ });
    }
  }

  /** 停止当前语音（切换台词/关闭对话/场景切换时调用） */
  static stop(): void {
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
    if (pendingSource) {
      try {
        pendingSource.stop();
        pendingSource.disconnect();
      } catch { /* ignore */ }
      pendingSource = null;
    }
    if (pendingGain) {
      try { pendingGain.disconnect(); } catch { /* ignore */ }
      pendingGain = null;
    }
  }
}
