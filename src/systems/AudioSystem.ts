/**
 * 音效系统 MVP（Phase 0.25）
 *
 * 使用 Web Audio API 程序合成短音效，无需外部音频文件。
 * 模块级单例，所有场景共用同一个 AudioContext。
 *
 * 后续可替换为真实音频文件，只需修改 play() 内部实现。
 */

type SfxName =
  | 'hoe' | 'plant' | 'water' | 'harvest' | 'buy' | 'sell' | 'levelup' | 'chop' | 'tree_fall' | 'invalid'
  // 演出音效（试玩-14）：列车 / 大门 / 星之碎片 / 观星夜
  | 'train' | 'train_hiss' | 'gate_open' | 'shard' | 'stargaze';

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
      // v0.6 制作人反馈：原 880Hz 最高音偏尖锐，降频降幅使收成反馈更圆润
      tone(440, 0.08, 'triangle', 0.16);
      tone(554, 0.08, 'triangle', 0.16, 0.06);
      tone(660, 0.14, 'triangle', 0.2, 0.12);
      tone(830, 0.18, 'triangle', 0.11, 0.2);
      break;

    case 'buy':
      // 购买：清脆的硬币声（v0.6 制作人反馈：原 square 方波谐波刺耳，改 triangle 圆润）
      tone(1100, 0.06, 'triangle', 0.06);
      tone(1450, 0.04, 'triangle', 0.04, 0.04);
      break;

    case 'sell':
      // 出售：稍低沉的硬币声（v0.6 制作人反馈：原 square 方波谐波刺耳，改 triangle 圆润）
      tone(830, 0.06, 'triangle', 0.06);
      tone(1100, 0.04, 'triangle', 0.04, 0.04);
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
      // v0.6 制作人反馈：原 square 方波谐波刺耳，改 triangle + 略降频更低沉柔和
      tone(120, 0.1, 'triangle', 0.14);
      tone(90, 0.14, 'triangle', 0.16, 0.06);
      break;

    // ──────────── 演出音效（试玩-14，P0 发布门禁 A）────────────

    case 'train':
      // 列车：单声"哐当"（车轮过轨缝的低频金属敲击 + 车身共鸣），开场每拍调用两次
      tone(150, 0.05, 'square', 0.10);
      tone(120, 0.05, 'square', 0.08, 0.06);
      tone(75, 0.1, 'triangle', 0.13, 0.05);
      break;

    case 'train_hiss':
      // 列车到站：蒸汽"哧"声（明亮宽带噪声，慢衰减）
      {
        const c = getCtx();
        const dur = 1.1;
        const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource();
        src.buffer = buffer;
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2600;
        bp.Q.value = 0.6;
        const g = c.createGain();
        g.gain.setValueAtTime(0.001, c.currentTime);
        g.gain.linearRampToValueAtTime(0.1, c.currentTime + 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
        src.connect(bp); bp.connect(g); g.connect(c.destination);
        src.start();
        src.stop(c.currentTime + dur + 0.01);
      }
      break;

    case 'gate_open':
      // 大门开启：铰链吱呀（下滑扫频，含金属二次吱呀）+ 门体到位撞击闷响
      {
        const c = getCtx();
        const t0 = c.currentTime;
        const creak = c.createOscillator();
        creak.type = 'sawtooth';
        creak.frequency.setValueAtTime(90, t0);
        creak.frequency.linearRampToValueAtTime(52, t0 + 0.95);
        const cg = c.createGain();
        cg.gain.setValueAtTime(0.001, t0);
        cg.gain.linearRampToValueAtTime(0.09, t0 + 0.3);
        cg.gain.linearRampToValueAtTime(0.001, t0 + 1.0);
        creak.connect(cg); cg.connect(c.destination);
        creak.start(t0); creak.stop(t0 + 1.05);
        const creak2 = c.createOscillator();
        creak2.type = 'square';
        creak2.frequency.setValueAtTime(210, t0);
        creak2.frequency.linearRampToValueAtTime(120, t0 + 0.7);
        const cg2 = c.createGain();
        cg2.gain.setValueAtTime(0.001, t0);
        cg2.gain.linearRampToValueAtTime(0.035, t0 + 0.25);
        cg2.gain.linearRampToValueAtTime(0.001, t0 + 0.75);
        creak2.connect(cg2); cg2.connect(c.destination);
        creak2.start(t0); creak2.stop(t0 + 0.8);
        // 到位撞击
        tone(70, 0.2, 'triangle', 0.24, 0.85);
        noise(0.15, 0.12, 0.85);
      }
      break;

    case 'shard':
      // 星之碎片采集：上扬琶音 + 高频闪烁（魔幻拾取感）
      tone(880, 0.09, 'sine', 0.12);
      tone(1175, 0.09, 'sine', 0.11, 0.05);
      tone(1568, 0.1, 'sine', 0.1, 0.1);
      tone(2093, 0.18, 'sine', 0.07, 0.16);
      break;

    case 'stargaze':
      // 观星夜：宁静的五声音阶琶音，极轻、长衰减（星空感）
      tone(523, 0.5, 'sine', 0.05);
      tone(659, 0.5, 'sine', 0.045, 0.15);
      tone(784, 0.6, 'sine', 0.04, 0.3);
      tone(1047, 0.7, 'sine', 0.035, 0.5);
      tone(1319, 0.8, 'sine', 0.028, 0.75);
      break;
  }
}