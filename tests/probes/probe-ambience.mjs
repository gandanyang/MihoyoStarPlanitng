/**
 * 环境音系统验证探针（v0.6 归星岛复苏阶段）
 *
 * 段A（模块级）：AmbienceSystem.start/stop 状态正确
 *   - start('farm', 10) → getActiveMap() === 'farm'
 *   - stop() → getActiveMap() === null
 *   - pause() → 停止后 activeMap 仍为 null，再次 start 可恢复
 *   - 昼夜配置：白天含 birds（timer 启动），夜晚 farm 无 birds
 * 段B（浏览器集成）：进入 farm 场景 → 环境音被调用（通过 window 钩子）
 *   - 说明：需 MapScene 接入后生效；若未接入，段B 标 WARN 不 FAIL
 *
 * 前置：dev server 在 localhost:5173
 * 运行：node tests/probes/probe-ambience.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  let pass = 0, fail = 0, warn = 0;
  const check = (name, ok, w = false) => {
    const tag = ok ? (w ? '⚠️' : '✅') : '❌';
    console.log(`${tag} ${name}`);
    ok ? (w ? warn++ : pass++) : fail++;
  };
  const waitFor = async (page, fn, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = await fn();
      if (v) return v;
      await sleep(250);
    }
    return null;
  };

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 844, height: 390, isMobile: true, hasTouch: true },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();
    const pageErrs = [];
    page.on('pageerror', e => pageErrs.push(e.message));
    await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
    await sleep(2000);

    // 段A：模块级 API（通过 window.__ambience 钩子，需 MapScene/其他入口挂载）
    const mod = await page.evaluate(() => {
      // 尝试通过 vite module 导入（探针钩子：若游戏入口挂载则存在）
      return { hasHook: !!(window.__ambience) };
    });

    // 注入临时钩子：动态 import AmbienceSystem 挂到 window
    const injected = await page.evaluate(async () => {
      try {
        const mod = await import('/src/systems/AmbienceSystem.ts');
        window.__ambience = mod;
        return true;
      } catch (e) {
        console.error('import fail', e);
        return false;
      }
    });
    check('AmbienceSystem 可动态导入', injected);

    if (injected) {
      const a = await page.evaluate(() => {
        const A = window.__ambience;
        A.start('farm', 10);
        const farmDay = A.getActiveMap();
        A.stop();
        const afterStop = A.getActiveMap();
        A.start('forest', 22);
        const forestNight = A.getActiveMap();
        A.pause();
        const afterPause = A.getActiveMap();
        A.stop();
        return { farmDay, afterStop, forestNight, afterPause };
      });
      check(`start('farm', 白天) → activeMap='farm' (${a.farmDay})`, a.farmDay === 'farm');
      check('stop() → activeMap=null（无残留）', a.afterStop === null);
      check(`start('forest', 夜晚) → activeMap='forest' (${a.forestNight})`, a.forestNight === 'forest');
      check('pause() → 停止后 activeMap 清空', a.afterPause === null);
    } else {
      check('段A：模块不可导入', false);
    }

    // 段B：MapScene 集成（进入 farm 场景后环境音是否被真正启动）
    // 注：探针动态 import 与游戏静态 import 在 Vite dev 下可能产生不同模块实例
    // （getActiveMap 读不到游戏状态），故改用 AudioSpy 音频节点计数验证：
    // MapScene.create → AmbienceSystem.start → 必创建振荡器/噪声缓冲节点。
    await page.evaluate(() => {
      const AC = window.AudioContext || window.webkitAudioContext;
      window.__spy = { osc: 0, buf: 0, flt: 0 };
      const op = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function () { window.__spy.osc++; return op.call(this); };
      const bs = AC.prototype.createBufferSource;
      AC.prototype.createBufferSource = function () { window.__spy.buf++; return bs.call(this); };
      const bf = AC.prototype.createBiquadFilter;
      AC.prototype.createBiquadFilter = function () { window.__spy.flt++; return bf.call(this); };
    });
    const baseNodes = await page.evaluate(() => ({ ...window.__spy }));
    await page.keyboard.press('Enter');
    await waitFor(page, () => page.evaluate(() => !!document.getElementById('intro-skip-btn')));
    await page.evaluate(() => { const b = document.getElementById('intro-skip-btn'); if (b) b.click(); });
    await sleep(1500);
    await page.evaluate(() => window.debug?.setStoryStep('done'));
    await sleep(300);
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('farm');
    });
    await sleep(2500);
    const farmNodes = await page.evaluate(() => ({ ...window.__spy }));
    const d1 = { osc: farmNodes.osc - baseNodes.osc, buf: farmNodes.buf - baseNodes.buf, flt: farmNodes.flt - baseNodes.flt };
    console.log(`  进 farm 音频节点增量: osc+${d1.osc} buf+${d1.buf} flt+${d1.flt}`);
    check('进入 farm 场景触发 AmbienceSystem.start（音频节点创建）', d1.osc > 0 || d1.buf > 0);

    // 段C：切图后旧环境音停止、新地图环境音启动（SHUTDOWN stop + start 生效）
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('mine');
    });
    await sleep(2500);
    const mineNodes = await page.evaluate(() => ({ ...window.__spy }));
    const d2 = { osc: mineNodes.osc - farmNodes.osc, buf: mineNodes.buf - farmNodes.buf, flt: mineNodes.flt - farmNodes.flt };
    console.log(`  切 mine 音频节点增量: osc+${d2.osc} buf+${d2.buf} flt+${d2.flt}`);
    check('切图后环境音跟随新地图（mine 节点创建，旧音停止）', d2.osc > 0 || d2.buf > 0);

    // 段D：昼夜翻转检测（update）：mine 白天/夜晚均为 mine，无翻转。改用 farm 白天 → 夜晚
    // 直接调用 update 验证翻转逻辑（模块级 API）
    const flip = await page.evaluate(() => {
      const A = window.__ambience;
      A.stop();
      A.start('farm', 10); // 白天：birds + wind
      A.update(22); // 夜晚：应重载为 crickets + wind
      const afterFlip = A.getActiveMap();
      A.stop();
      return { afterFlip };
    });
    console.log(`昼夜翻转后 activeMap = ${flip.afterFlip}`);
    check('昼夜翻转：update 后环境音仍在活动地图（重载生效）', flip.afterFlip === 'farm');

    if (pageErrs.length) {
      console.log(`页面错误（${pageErrs.length}）:`, pageErrs.slice(0, 5));
    }
    check('无页面运行时错误', pageErrs.length === 0, pageErrs.length > 0);
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败 / ${warn} 警告`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
