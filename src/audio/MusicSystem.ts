/**
 * BGM 播放系统（v0.9 音乐接入）
 *
 * - 纯 HTMLAudio 循环播放，与 VoiceBank 共用场景生命周期
 * - 浏览器自动播放拦截：先记录 pending，首次用户交互（pointerdown/keydown）时补播
 * - 场景切换由各场景 SHUTDOWN 调 stop()，避免叠播
 */

const TRACKS: Record<string, string> = {
  title: 'audio/music/title.mp3',
  farm_day: 'audio/music/farm_day.mp3',
  stargaze_night: 'audio/music/stargaze_night.mp3',
};

let current: HTMLAudioElement | null = null;
let pending: string | null = null;
let retryBound = false;

function tryStart(): void {
  if (!pending) return;
  const key = pending;
  pending = null;
  MusicSystem.play(key);
}

function bindRetry(): void {
  if (retryBound) return;
  retryBound = true;
  window.addEventListener('pointerdown', tryStart, { once: true, capture: true });
  window.addEventListener('keydown', tryStart, { once: true, capture: true });
}

export const MusicSystem = {
  play(key: string): void {
    const url = TRACKS[key];
    if (!url) return;
    MusicSystem.stop();
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.35;
    current = audio;
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // 自动播放被拦截：等首次用户交互补播
        if (current === audio) {
          pending = key;
          bindRetry();
        }
      });
    }
  },

  stop(): void {
    pending = null;
    if (current) {
      try {
        current.pause();
        current.src = '';
      } catch { /* ignore */ }
      current = null;
    }
  },

  setVolume(v: number): void {
    if (current) current.volume = v;
  },
};
