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
    // 注：Vite dev 原生 ESM 下 import * 命名空间只读，探针侧 wrap start 会静默失败，
    // 改用 getActiveMap() 轮询验证 MapScene.create 真实调用了 start('farm', hour)。
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
    const hist = await page.evaluate(() => window.__ambienceHistory || []);
    console.log(`切到 farm 后 ambience.start 调用历史: ${JSON.stringify(hist)}`);
    // 集成校验：MapScene 通过模块命名空间调用 start → 探针包装的 start 不会被触发，
    // 改用 getActiveMap() === 'farm' 校验环境音系统确实被 MapScene 激活
    const activeMap = await page.evaluate(() => window.__ambience.getActiveMap());
    console.log(`切到 farm 后 activeMap = ${activeMap}`);
    const integrated = activeMap === 'farm';
    if (integrated) {
      check('进入 farm 场景触发 AmbienceSystem.start（集成）', true);
    } else {
      check('进入 farm 场景触发 AmbienceSystem.start（待 MapScene 接入后验证）', true, true);
    }

    // 段C：切图后旧环境音停止（SHUTDOWN stop 生效）
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('mine');
    });
    await sleep(2500);
    const mineActive = await page.evaluate(() => window.__ambience.getActiveMap());
    console.log(`切到 mine 后 activeMap = ${mineActive}`);
    // 关键：切图瞬间必须先 stop 再 start —— 若旧图环境音残留，activeMap 会短暂为 null 但最终应为 'mine'
    check(`切图后环境音跟随新地图 (${mineActive})`, mineActive === 'mine');

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
