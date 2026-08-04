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

/** 被 autoplay 策略拒绝、待全局手势解锁时重试的音频（兜底；正常路径在手势窗口内不被拒） */
let gesturePendingAudio: HTMLAudioElement | null = null;

/** 已发起过预加载的音频 URL（避免重复加载同一文件） */
const preloadCache = new Set<string>();

/** 全局手势解锁：首次交互时恢复 AudioContext，并重试被 autoplay 拦截的音频。
 *  背景（BUG-039 真机复现）：Android WebView 开局第一句 play() 若离点击手势过远（如等
 *  loadeddata 回调），会被 autoplay 策略拒绝——第一句无声，且被拒的 play() 会在玩家后续
 *  点击时自动恢复 → 最后一句响起第一句的声音。正常路径下 play() 立即调用（手势窗口内）
 *  不会触发；此处仅兜底。 */
function unlockAudio(): void {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* ignore */ }
  const a = gesturePendingAudio;
  gesturePendingAudio = null;
  if (a && currentAudio === a) {
    a.play().catch(() => { /* 静默失败 */ });
  }
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

    /** autoplay 拒绝兜底：Android 开局离手势过远时记录待播，解锁后重试（期间换行则放弃） */
    const onReject = (e: unknown) => {
      if ((e as DOMException)?.name === 'NotAllowedError') {
        gesturePendingAudio = audio;
      }
    };

    const doPlay = () => {
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
          audio.play().catch(onReject);
          return;
        } catch {
          // 混响链路不可用 → 走原音播放（TODO: 后续可接入正式混响）
        }
      }
      audio.play().catch(onReject);
    };

    // BUG-039：立即 play()（保留场景切换后的 transient activation 窗口，避免开局被拒）。
    // 加载未就绪时 HTMLMediaElement 内置等待就绪后起播；起播延迟由 preload() 预加载下一句吸收。
    doPlay();
  }

  /** 预加载 (speaker,text) 的全部候选语音（不改变轮换；旁白/选项行 find 内天然跳过）。
   *  用于对白推进前预热下一句，消除 Android WebView 加载慢导致的起播延迟。 */
  static preload(speaker: string, text: string): void {
    const norm = normalize(text);
    const matches = VOICE_ENTRIES.filter(
      (e: VoiceEntry) =>
        (e.speaker === '' || e.speaker === speaker) && normalize(e.text) === norm,
    );
    for (const m of matches) {
      const url = 'audio/voice/' + m.file;
      if (preloadCache.has(url)) continue;
      preloadCache.add(url);
      const a = new Audio(url);
      a.preload = 'auto';
      // 仅加载不播放；失败也标记，避免反复重试
      a.addEventListener('loadeddata', () => { /* 加载完成即就绪 */ }, { once: true });
      a.addEventListener('error', () => { /* 忽略加载失败 */ }, { once: true });
    }
  }

  /** 停止当前语音（切换台词/关闭对话/场景切换时调用） */
  static stop(): void {
    gesturePendingAudio = null;
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.src = '';
      } catch { /* ignore */ }
      currentAudio = null;
    }
  }
}
