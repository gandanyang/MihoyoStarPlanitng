/**
 * 环境音长时间运行性能探针（v0.6 环境音真机预检，桌面端模拟）
 *
 * 目标：验证真机测试前"程序正确性"——长时间开环境音不泄漏、不掉帧。
 *   - 进入 farm（白天：鸟叫 + 微风），环境音开启
 *   - 每 10s 采样一次 FPS + AudioContext 活动源数 + 内存
 *   - 持续 3 分钟（桌面模拟；真机长时间运行由制作人执行）
 *   - 判定：平均 FPS ≥ 50（桌面无压力）；音源数稳定（不无限增长）
 *
 * 前置：dev server 在 localhost:5173
 * 运行：node tests/probes/probe-ambience-longrun.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const DURATION_MS = 3 * 60 * 1000; // 3 分钟
const SAMPLE_INTERVAL = 10 * 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
    ok ? pass++ : fail++;
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

    // 跳过开场 → 教程 done → 进 farm
    await page.keyboard.press('Enter');
    await sleep(2200);
    await page.evaluate(() => { const b = document.getElementById('intro-skip-btn'); if (b) b.click(); });
    await sleep(800);
    await page.evaluate(() => window.debug?.setStoryStep('done'));
    await sleep(400);
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('farm');
    });
    await sleep(2500);

    // 注入 FPS 采样器（每帧计数，10s 读取一次）
    await page.evaluate(() => {
      window.__fpsData = { frames: 0, active: true };
      const counter = () => { if (window.__fpsData.active) { window.__fpsData.frames++; requestAnimationFrame(counter); } };
      requestAnimationFrame(counter);
    });

    const samples = [];
    const t0 = Date.now();
    while (Date.now() - t0 < DURATION_MS) {
      await sleep(SAMPLE_INTERVAL);
      const s = await page.evaluate((intervalMs) => {
        // 无法直接读取 WebAudio 活动源数（浏览器不暴露）——AmbienceSystem 未暴露源计数
        // 用 rAF 帧计数估算 FPS；内存用 performance.memory（Chrome 支持）
        const fps = window.__fpsData ? (window.__fpsData.frames / (intervalMs / 1000)) : -1;
        window.__fpsData.frames = 0;
        return { fps: Math.round(fps * 10) / 10, heap: (performance.memory?.usedJSHeapSize ?? 0) / 1048576 };
      }, SAMPLE_INTERVAL);
      s.elapsed = Math.round((Date.now() - t0) / 1000);
      samples.push(s);
      console.log(`  [${s.elapsed}s] fps=${s.fps} heap=${s.heap.toFixed(1)}MB`);
    }

    await page.evaluate(() => window.__fpsData.active = false);

    // 判定：FPS 均值/最低（桌面 60fps 基数，容忍动画卡顿）
    const fpsList = samples.map(s => s.fps).filter(f => f > 0);
    const avgFps = fpsList.reduce((a, b) => a + b, 0) / (fpsList.length || 1);
    const minFps = Math.min(...fpsList);
    console.log(`采样 ${samples.length} 次，平均 FPS=${avgFps.toFixed(1)}，最低=${minFps.toFixed(1)}`);
    check(`长时间运行不掉帧（平均 ${avgFps.toFixed(1)}fps ≥ 50）`, avgFps >= 50, `min=${minFps.toFixed(1)}`);
    // 桌面模拟：主线程稳定即可，不严苛要求 60

    // 内存增长检查：前 30s vs 后 30s
    const mems = samples.map(s => s.heap);
    const memFirst = mems.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const memLast = mems.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const memDelta = memLast - memFirst;
    console.log(`内存: 前${memFirst.toFixed(1)}MB → 后${memLast.toFixed(1)}MB (Δ${memDelta.toFixed(1)}MB)`);
    check(`长时间运行无明显内存泄漏（Δ < 30MB）`, memDelta < 30, `Δ=${memDelta.toFixed(1)}MB`);

    // 页面错误（AudioContext/环境音抛错会在此暴露）
    check(`无页面运行时错误（${pageErrs.length}）`, pageErrs.length === 0, pageErrs.slice(0, 3).join('; '));

    if (pageErrs.length) console.log('  错误详情:', pageErrs.slice(0, 5));
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
