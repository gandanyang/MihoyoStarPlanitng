/**
 * 剧情语音播放（任务-主线剧情语音生成与接入 §五 最小侵入接入）
 *
 * - 映射数据 VOICE_ENTRIES：由 tools/gen_mainline_voice.py --emit-voicebank 生成（勿手改）
 * - 匹配规则：speaker 精确匹配（'' 为通配，用于少女/HR/纸条等空说话人行）+ 归一化文本精确匹配
 * - 归一化：剥开头（…）语气/舞台标注 + 剥「」引号，与 StorySystem.ts 原文对齐
 * - 找不到音频 → 静默跳过，不阻塞对话
 * - 同 (speaker,text) 存在多个音频文件（如「嗯。」harvest_02/evening_04）→ 轮换播放
 * - 内心独白（inner）→ 轻混响区分（Web Audio 现场生成 IR）；不可用回退原音
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

let currentAudio: HTMLAudioElement | null = null;
let pendingAudio: HTMLAudioElement | null = null; // 正在等待 ready 的音频（BUG-039）
let pendingTimer: ReturnType<typeof setTimeout> | null = null; // ready 超时兜底定时器

/** 已确认可立即播放的音频 URL（BUG-039：二次播放同句免等加载，Android 首次加载慢后即缓存） */
const readyCache = new Set<string>();

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

export class VoiceBank {
  private static usedCount = new Map<string, number>();

  /** 查找 (speaker, text) 对应的音频相对路径；找不到返回 null */
  static find(speaker: string, text: string): string | null {
    const norm = normalize(text);
    const matches = VOICE_ENTRIES.filter(
      (e: VoiceEntry) => (e.speaker === '' || e.speaker === speaker) && e.text === norm,
    );
    if (matches.length === 0) return null;
    // 同 (speaker,text) 多个文件（如「嗯。」harvest_02/evening_04）→ 轮换，保证都用上
    const key = matches.map((m) => m.file).join('|');
    const i = (VoiceBank.usedCount.get(key) ?? 0) % matches.length;
    VoiceBank.usedCount.set(key, i + 1);
    return 'audio/voice/' + matches[i].file;
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

    const audio = new Audio(url);
    audio.volume = 1.0;
    currentAudio = audio;

    /** 音频就绪后真正起播（inner 走混响链路，失败回退原音） */
    const tryPlay = () => {
      if (currentAudio !== audio) return; // 已被新行/stop 替换，放弃本次播放
      if (inner) {
        try {
          const ctx = getCtx();
          const src = ctx.createMediaElementSource(audio);
          const dry = ctx.createGain();
          dry.gain.value = 0.85;
          const wet = ctx.createGain();
          wet.gain.value = 0.4;
          const conv = ctx.createConvolver();
          conv.buffer = makeImpulse(ctx, 1.2, 2.2);
          src.connect(dry);
          dry.connect(ctx.destination);
          src.connect(conv);
          conv.connect(wet);
          wet.connect(ctx.destination);
          audio.play().catch(() => { /* 静默失败 */ });
          return;
        } catch {
          // 混响链路不可用 → 走原音播放（TODO: 后续可接入正式混响）
        }
      }
      audio.play().catch(() => { /* 静默失败：找不到/格式不支持不阻塞对话 */ });
    };

    // BUG-039：安卓 WebView 音频加载慢，立即 play() 导致起播晚于当前台词（声音错位）。
    // 等 loadeddata 再播（本地已就绪或命中缓存则立即播），并加超时兜底防永不播放。
    if (audio.readyState >= 2 || readyCache.has(url)) {
      tryPlay();
      return;
    }
    pendingAudio = audio;
    const cleanup = () => {
      pendingAudio = null;
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
      audio.removeEventListener('loadeddata', onReady);
      audio.removeEventListener('error', onError);
    };
    const onReady = () => { readyCache.add(url); cleanup(); tryPlay(); };
    const onError = () => { cleanup(); if (currentAudio === audio) currentAudio = null; };
    audio.addEventListener('loadeddata', onReady);
    audio.addEventListener('error', onError);
    // 兜底：2.5s 仍未就绪也尝试播放（慢网络不永久沉默，播放失败静默）
    pendingTimer = setTimeout(() => { readyCache.add(url); cleanup(); tryPlay(); }, 2500);
  }

  /** 停止当前语音（切换台词/关闭对话/场景切换时调用） */
  static stop(): void {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    if (pendingAudio) {
      try { pendingAudio.pause(); pendingAudio.src = ''; } catch { /* ignore */ }
      pendingAudio = null;
    }
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.src = '';
      } catch { /* ignore */ }
      currentAudio = null;
    }
  }
}
