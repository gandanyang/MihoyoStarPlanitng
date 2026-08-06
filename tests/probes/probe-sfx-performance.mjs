/**
 * 演出音效探针（试玩-14，P0 发布门禁 A）
 *
 * 段A（模块级）：AudioSystem 新增 4 个演出音效可播放、无异常、频谱签名正确
 * 段B（集成）：4 处演出触发点真正调用了对应音效
 *   - 列车：车站开场"哐当"节奏（train 150Hz）+ 到站蒸汽（train_hiss 噪声缓冲）
 *   - 开门：useManorKey → gate_open（铰链吱呀 90Hz + 撞击 70Hz）
 *   - 碎片：doCollectShard → shard（880Hz 上行琶音）
 *   - 观星：tryStargaze → stargaze（523Hz 五声音阶）
 *
 * 原理：打补丁包装 AudioContext.prototype，记录所有振荡器频率设定与噪声缓冲创建。
 * 前置：dev server localhost:5173
 * 运行：node tests/probes/probe-sfx-performance.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (page, fn, timeout = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  return null;
};

async function installAudioSpy(page) {
  await page.evaluate(() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    window.__sfxLog = { oscillators: [], buffers: 0, filters: [] };
    const wrapParam = (param) => {
      try {
        for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) {
          const orig = param[m].bind(param);
          param[m] = (v, t) => {
            window.__sfxLog.oscillators.push({ v: Math.round(v * 10) / 10, src: m });
            return orig(v, t);
          };
        }
        const desc = Object.getOwnPropertyDescriptor(param, 'value');
        if (desc) {
          Object.defineProperty(param, 'value', {
            configurable: true,
            get: () => desc.get.call(param),
            set: (v) => {
              window.__sfxLog.oscillators.push({ v: Math.round(v * 10) / 10, src: 'value' });
              desc.set.call(param, v);
            },
          });
        }
      } catch (e) { /* 忽略包装失败 */ }
    };
    const origOsc = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function (...a) {
      const osc = origOsc.apply(this, a);
      try { wrapParam(osc.frequency); } catch (e) { /* ignore */ }
      try {
        // tone() 用 frequency.value = freq 直接赋值，value 钩子可能被宿主拒绝，
        // 兜底：start() 时记录当前频率值
        const origStart = osc.start.bind(osc);
        osc.start = (...sa) => {
          window.__sfxLog.oscillators.push({ v: Math.round(osc.frequency.value * 10) / 10, src: 'start' });
          return origStart(...sa);
        };
      } catch (e) { /* ignore */ }
      return osc;
    };
    const origBS = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function (...a) {
      window.__sfxLog.buffers++;
      return origBS.apply(this, a);
    };
    const origBF = AC.prototype.createBiquadFilter;
    AC.prototype.createBiquadFilter = function (...a) {
      const f = origBF.apply(this, a);
      try {
        const desc = Object.getOwnPropertyDescriptor(f.frequency, 'value');
        if (desc) {
          Object.defineProperty(f.frequency, 'value', {
            configurable: true,
            get: () => desc.get.call(f.frequency),
            set: (v) => { window.__sfxLog.filters.push({ v: Math.round(v * 10) / 10 }); desc.set.call(f.frequency, v); },
          });
        }
      } catch (e) { /* ignore */ }
      return f;
    };
  });
}

/** 取当前日志快照（隔离每次触发的增量） */
async function snapshot(page) {
  return page.evaluate(() => ({
    n: window.__sfxLog.oscillators.length,
    buffers: window.__sfxLog.buffers,
    filters: window.__sfxLog.filters.length,
  }));
}

/** 检查快照之后新增的日志是否包含目标频率 */
async function hasFreq(page, snap, target) {
  return page.evaluate(([s, t]) => {
    const log = window.__sfxLog;
    for (let i = s.n; i < log.oscillators.length; i++) {
      if (log.oscillators[i].v === t) return true;
    }
    return false;
  }, [snap, target]);
}

/** 检查快照之后新增的滤波器频率是否包含目标值 */
async function hasFilter(page, snap, target) {
  return page.evaluate(([s, t]) => {
    const log = window.__sfxLog;
    for (let i = s.filters; i < log.filters.length; i++) {
      if (log.filters[i].v === t) return true;
    }
    return false;
  }, [snap, target]);
}

async function gotoScene(page, key, spawn) {
  await page.evaluate(([k, sp]) => {
    const g = window.__game;
    const a = g.scene.getScenes(true)[0];
    if (a && a.scene.key !== k) g.scene.stop(a.scene.key);
    g.scene.start(k, sp ? { spawn: sp } : undefined);
  }, [key, spawn ?? null]);
  await sleep(2200);
}

async function run() {
  console.log('=== 试玩-14 演出音效探针 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const pageErrs = [];
  page.on('pageerror', e => pageErrs.push(e.message));
  let pass = 0, fail = 0;
  const check = (name, ok, extra = '') => {
    console.log(`${name} → ${ok ? '✅' : '❌'}${extra ? ' ' + extra : ''}`);
    ok ? pass++ : fail++;
  };
  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2200);
    await installAudioSpy(page);

    // ── 段A：模块级 4 音效可播放 ──
    const modA = await page.evaluate(async () => {
      const M = await import('/src/systems/AudioSystem.ts');
      const names = ['train', 'train_hiss', 'gate_open', 'shard', 'stargaze'];
      const errs = [];
      for (const n of names) {
        try { M.play(n); } catch (e) { errs.push(`${n}:${e.message ?? e}`); }
      }
      return errs;
    });
    check('段A：5 个演出音效 play() 无异常', modA.length === 0, modA.join('; '));

    // ── 段B1：列车（车站开场）──
    // 注意：段A 已播放过 train（150Hz），基线必须清零后再触发开场
    await page.evaluate(() => { window.__sfxLog.oscillators = []; window.__sfxLog.buffers = 0; window.__sfxLog.filters = []; });
    let snap = { n: 0, buffers: 0, filters: 0 };
    await page.keyboard.press('Enter'); // 标题 → 车站开场
    // 开场链路：Enter → startGame 播 levelup → fadeOut 400ms → station create
    // → 800ms 后列车遮罩 → 600ms 后第一声"哐当"。create 时序不可控，用长轮询等 150Hz。
    const trainClack = await waitFor(page, () => hasFreq(page, snap, 150), 15000);
    check('B1a：列车开场播放"哐当"（train 150Hz）', !!trainClack);
    if (!trainClack) {
      const dump = await page.evaluate(() => ({ log: window.__sfxLog.oscillators, buffers: window.__sfxLog.buffers }));
      console.log('  [B1 诊断] 全量音频日志:', JSON.stringify(dump.log.slice(0, 40)));
      console.log('  [B1 诊断] 列车遮罩存在:', await page.evaluate(() => !!document.getElementById('intro-train-overlay')));
      console.log('  [B1 诊断] 当前场景:', await page.evaluate(() => window.__game.scene.getScenes(true).map(s => s.scene.key)));
    }
    // 蒸汽声（噪声缓冲）在 count=4 后 500ms 播放，同样轮询等待
    const hiss = await waitFor(page, async () => {
      const b = await page.evaluate(() => window.__sfxLog.buffers);
      return b - snap.buffers >= 1 ? b - snap.buffers : null;
    }, 15000);
    check('B1b：到站"哧"蒸汽声（噪声缓冲）', hiss !== null, hiss !== null ? `buffers+${hiss}` : '');
    // 跳过开场，进入后续测试
    await page.evaluate(() => { const b = document.getElementById('intro-skip-btn'); if (b) b.click(); });
    await sleep(1200);

    // ── 段B2：开门（useManorKey）──
    await page.evaluate(() => window.debug?.setStoryStep('get_key'));
    await sleep(300);
    await gotoScene(page, 'gate');
    snap = await snapshot(page);
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('gate');
      s.useManorKey();
    });
    await sleep(300);
    const gateCreak = await hasFreq(page, snap, 90);
    const gateThump = await hasFreq(page, snap, 70);
    check('B2：开门吱呀 + 撞击（gate_open 90Hz/70Hz）', gateCreak && gateThump,
      `吱呀=${gateCreak} 撞击=${gateThump}`);
    // 推进到 clear_land 避免后续对话阻塞（useManorKey 已弹 GATE_OPENED_DIALOGUE）
    await page.evaluate(() => { const s = window.__game.scene.getScene('gate'); if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.reset(); });

    // ── 段B3：星之碎片（doCollectShard）──
    await gotoScene(page, 'forest');
    snap = await snapshot(page);
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('forest');
      s.doCollectShard();
    });
    await sleep(200);
    const shardUp = await hasFreq(page, snap, 880);
    check('B3：碎片拾取琶音（shard 880Hz）', shardUp);

    // ── 段B4：观星夜（tryStargaze）──
    // 存档注入：写完整存档 → reload → 游戏自身 SaveSystem.apply 设置状态，
    // 绕开 dev 双模块实例问题（探针 import 改状态只影响探针实例，游戏内部不生效）。
    const b4Save = {
      version: '0.5',
      savedAt: new Date().toISOString(),
      timestamp: Date.now(),
      player: { x: 504, y: 232, scene: 'farm', facing: 'down', inventory: {} },
      world: { day: 1, hour: 21, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'completed' },
      farm: { tiles: [], crops: [], trees: [], restore: {}, automation: { robots: [] } },
      story: { storyStep: 'done', ch1TownIntroDone: true },
    };
    // 注意：必须先 reload 再注入存档。reload 时 beforeunload 会用游戏当前状态覆盖 localStorage，
    // 若先注入再 reload，存档会被覆盖成玩家默认位置（scene=forest）→ apply 后会跳去 forest。
    await page.reload({ waitUntil: 'networkidle2' });
    const gameReady = await waitFor(page, () => page.evaluate(() => {
      const g = window.__game;
      return !!(g && g.scene && g.scene.getScenes(true).length > 0);
    }), 20000);
    await page.evaluate((save) => {
      localStorage.setItem('return_star_save', JSON.stringify(save));
    }, b4Save);
    await sleep(500);
    await installAudioSpy(page); // reload 后原型重置，必须重装
    // 无 spawn 启动 farm → create 检测 hasSave && !spawn → apply 存档（hour=21 / quest=completed / step=done / scene=farm 停在农场）
    await page.evaluate(() => window.__game.scene.start('farm'));
    const farmReady = await waitFor(page, () => page.evaluate(() =>
      window.__game.scene.getScenes(true).some(s => s.scene.key === 'farm')), 20000);
    await sleep(1000); // 等 apply 完成 + 场景稳定
    const diag = await page.evaluate(async () => {
      const Q = await import('/src/systems/QuestSystem.ts');
      const T = await import('/src/data/TimeSystem.ts');
      const S = await import('/src/systems/StorySystem.ts');
      return {
        quest: Q.getQuestState(),
        hour: T.getTime()?.hour,
        observatory: S.isObservatoryComplete(),
        step: S.getStoryStep?.(),
        farmActive: window.__game.scene.getScenes(true).some(s => s.scene.key === 'farm'),
      };
    });
    console.log('  [B4 诊断]', JSON.stringify(diag));
    await page.evaluate(() => { window.__sfxLog.oscillators = []; window.__sfxLog.buffers = 0; window.__sfxLog.filters = []; });
    snap = { n: 0, buffers: 0, filters: 0 };
    const ok = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const p = s.STARGAZE_POS;
      s.player.x = p.x; s.player.y = p.y;
      return s.tryStargaze();
    });
    await sleep(300);
    const stargazeTone = await hasFreq(page, snap, 1319); // 1319Hz 为 stargaze 独有（levelup 无此音）
    check('B4：观星夜五声音阶（stargaze）触发', ok === true && stargazeTone,
      `触发=${ok} 1319Hz=${stargazeTone} farm就绪=${farmReady !== null}`);

    // ── 无页面错误 ──
    check('无页面运行时错误（本轮路径）', pageErrs.length === 0, pageErrs.slice(0, 3).join('; '));

    console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
    process.exit(fail > 0 ? 1 : 0);
  } finally {
    await browser.close();
  }
}
run().catch(e => { console.error('探针异常:', e); process.exit(1); });
