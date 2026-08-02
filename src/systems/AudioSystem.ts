/**
 * 音效系统 MVP（Phase 0.25）
 *
 * 使用 Web Audio API 程序合成短音效，无需外部音频文件。
 * 模块级单例，所有场景共用同一个 AudioContext。
 *
 * 后续可替换为真实音频文件，只需修改 play() 内部实现。
 */

type SfxName = 'hoe' | 'plant' | 'water' | 'harvest' | 'buy' | 'sell' | 'levelup' | 'chop' | 'tree_fall' | 'invalid';

let ctx: AudioContext | null = null;

/** 懒初始化 AudioContext（浏览器要求用户交互后才能创建） */
export function getCtx(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) throw new Error('AudioContext not supported');
    ctx = new AC();
  }
  // 某些浏览器会暂停 AudioContext，需要 resume
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

/** 播放一个简单的音调（频率 + 持续时间 + 波形） */
export function tone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.15,
  delay = 0,
): void {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, c.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(c.currentTime + delay);
  osc.stop(c.currentTime + delay + duration + 0.01);
}

/** 播放白噪声（用于浇水等） */
export function noise(duration: number, volume = 0.08, delay = 0): void {
  const c = getCtx();
  const bufferSize = c.sampleRate * duration;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = c.createBufferSource();
  source.buffer = buffer;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, c.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
  // 低通滤波让噪声更柔和
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2000;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  source.start(c.currentTime + delay);
}

/**
 * 播放指定音效。
 * 用法：AudioSystem.play('harvest')
 */
export function play(name: SfxName): void {
  switch (name) {
    case 'hoe':
      // 锄地：低频碰撞感（中存在感，高频操作不能太响）
      tone(80, 0.12, 'triangle', 0.26);
      tone(60, 0.08, 'sine', 0.2, 0.02);
      break;

    case 'plant':
      // 播种：轻快短促的弹跳音
      tone(600, 0.06, 'sine', 0.1);
      tone(800, 0.04, 'sine', 0.08, 0.03);
      break;

    case 'water':
      // 浇水：柔和白噪声 + 水流感（中存在感）
      noise(0.25, 0.09);
      tone(400, 0.15, 'sine', 0.06, 0.05);
      break;

    case 'harvest':
      // 收获：上行三连音，丰收的愉悦感（高存在感——最核心的奖励瞬间）
      tone(440, 0.08, 'triangle', 0.16);
      tone(554, 0.08, 'triangle', 0.16, 0.06);
      tone(660, 0.14, 'triangle', 0.2, 0.12);
      tone(880, 0.18, 'triangle', 0.14, 0.2);
      break;

    case 'buy':
      // 购买：清脆的硬币声
      tone(1200, 0.06, 'square', 0.06);
      tone(1600, 0.04, 'square', 0.04, 0.04);
      break;

    case 'sell':
      // 出售：稍低沉的硬币声
      tone(900, 0.06, 'square', 0.06);
      tone(1200, 0.04, 'square', 0.04, 0.04);
      break;

    case 'levelup':
      // 升级：上行琶音，成就感
      tone(523, 0.1, 'triangle', 0.12);
      tone(659, 0.1, 'triangle', 0.12, 0.08);
      tone(784, 0.1, 'triangle', 0.12, 0.16);
      tone(1047, 0.2, 'triangle', 0.15, 0.24);
      break;

    case 'chop':
      // 砍树：斧头劈入木材的沉闷撞击 + 木屑碎裂感
      tone(120, 0.08, 'square', 0.18);
      tone(70, 0.12, 'triangle', 0.15, 0.01);
      noise(0.06, 0.1);
      break;

    case 'tree_fall':
      // 树倒：木质嘎吱声 → 坠地撞击
      tone(200, 0.3, 'sawtooth', 0.06);
      tone(150, 0.25, 'sawtooth', 0.05, 0.05);
      tone(80, 0.2, 'triangle', 0.12, 0.25);
      noise(0.15, 0.12, 0.3);
      break;

    case 'invalid':
      // 无效操作：短促低沉的"拒绝"音（区别于所有成功音效，让玩家知道"这里不能做"）
      tone(140, 0.1, 'square', 0.14);
      tone(90, 0.14, 'triangle', 0.16, 0.06);
      break;
  }
}