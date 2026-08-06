/**
 * 屏幕适配验收探针（Screen Adaptation Upgrade）
 *
 * 验证目标（动态逻辑宽度方案，main.ts applyAdaptiveLogicalSize）：
 *   手机比例（16:9 / 19.5:9 / 20:9）：
 *     - 画布铺满视口（比例 = 屏幕比例，FIT 无黑边）
 *     - 画布完整落在视口内（无裁切）
 *     - MapScene 相机垂直视野恒定 300 世界像素（玩家永不丢）
 *     - 触控按钮在视口内（无遮挡/无溢出）
 *     - 无页面 JS 错误
 *   PC 浏览器（1280×720 / 1920×1080）：
 *     - 画布铺满视口（比例 = 屏幕比例）
 *     - game-container 尺寸 = 画布显示尺寸（DOM UI 对齐）
 *     - 无页面 JS 错误
 *
 * 前置：dev server（localhost:5173）；node probe-screen-adaptation.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` - ${detail}` : ''}`);
}

async function launchPage(browser, { width, height, isMobile = false, mobileUA = false }) {
  const page = await browser.newPage();
  if (mobileUA) {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
        configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5, configurable: true });
    });
  }
  await page.setViewport({ width, height, isMobile, hasTouch: isMobile });
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(String(e)));
  await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
  await sleep(3000);
  return { page, jsErrors };
}

async function enterFarm(page) {
  await page.keyboard.press('Enter');
  await sleep(1800);
  await page.evaluate(() => {
    const b = document.getElementById('intro-skip-btn');
    if (b) b.click();
  });
  await sleep(600);
  await page.evaluate(() => window.debug?.setStoryStep('done'));
  await sleep(300);
  await page.evaluate(() => {
    const g = window.__game;
    const a = g.scene.getScenes(true)[0];
    if (a) g.scene.stop(a.scene.key);
    g.scene.start('farm');
  });
  await sleep(1800);
}

async function readLayout(page) {
  return page.evaluate(() => {
    const g = window.__game;
    const ds = g?.scale?.displaySize;
    const canvas = document.querySelector('#game-container canvas') || document.querySelector('canvas');
    const cr = canvas?.getBoundingClientRect();
    const ctr = document.getElementById('game-container')?.getBoundingClientRect();
    // MapScene 相机垂直视野（世界像素）＝ 逻辑高度 600 / zoom 2 = 300
    const active = g?.scene?.getScenes(true)?.[0];
    const cam = active?.cameras?.main;
    const worldViewH = cam ? Math.round(cam.worldView.height) : null;
    const touchBtns = [...document.querySelectorAll('#touch-controls [data-action], #touch-controls .tc-btn')]
      .map((el) => {
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
      });
    return {
      vp: { w: innerWidth, h: innerHeight },
      display: ds ? { w: Math.round(ds.width), h: Math.round(ds.height) } : null,
      canvas: cr ? { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) } : null,
      container: ctr ? { w: Math.round(ctr.width), h: Math.round(ctr.height) } : null,
      worldViewH,
      touchBtns,
    };
  });
}

async function run() {
  console.log('=== 屏幕适配验收探针 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });

  try {
    // ===== 手机比例（16:9 / 19.5:9 / 20:9）=====
    const phones = [
      { name: '16:9 手机', width: 844, height: 475 },
      { name: '19.5:9 手机', width: 780, height: 360 },
      { name: '20:9 超宽屏', width: 800, height: 360 },
    ];
    for (const p of phones) {
      console.log(`--- ${p.name}（${p.width}×${p.height}）---`);
      const { page, jsErrors } = await launchPage(browser, { ...p, isMobile: true, mobileUA: true });
      await enterFarm(page);
      const l = await readLayout(page);
      console.log(`  画布: ${JSON.stringify(l.canvas)} | 显示尺寸: ${JSON.stringify(l.display)} | 视口: ${l.vp.w}×${l.vp.h}`);

      // 1) 画布铺满视口：宽高比 = 屏幕比例（FIT 动态逻辑宽度，无黑边）
      const ratio = l.canvas ? l.canvas.w / l.canvas.h : 0;
      const vpRatio = l.vp.w / l.vp.h;
      check(`${p.name}：画布比例 = 屏幕比例（${ratio.toFixed(3)} ≈ ${vpRatio.toFixed(3)}）`, Math.abs(ratio - vpRatio) < 0.03);

      // 2) 画布完整在视口内（无裁切）
      const inView =
        !!l.canvas &&
        l.canvas.x >= 0 &&
        l.canvas.y >= 0 &&
        l.canvas.x + l.canvas.w <= l.vp.w + 1 &&
        l.canvas.y + l.canvas.h <= l.vp.h + 1;
      check(`${p.name}：画布完整在视口内（无裁切）`, !!inView);

      // 3) MapScene 相机垂直视野恒定 300 世界像素（玩家永不丢）
      check(`${p.name}：相机垂直视野 300 世界像素（${l.worldViewH}）`, l.worldViewH === 300);

      // 4) 触控按钮在视口内（无溢出/遮挡）
      const btnsOk = l.touchBtns.length > 0 && l.touchBtns.every(
        (b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= l.vp.w + 1 && b.y + b.h <= l.vp.h + 1
      );
      check(`${p.name}：触控按钮在视口内（${l.touchBtns.length} 个）`, btnsOk);

      check(`${p.name}：无页面 JS 错误`, jsErrors.length === 0, jsErrors.join('; ').slice(0, 200));
      await page.close();
    }

    // ===== PC 浏览器（1280×720 / 1920×1080）=====
    const pcs = [
      { name: 'PC 1280×720', width: 1280, height: 720 },
      { name: 'PC 1920×1080', width: 1920, height: 1080 },
    ];
    for (const p of pcs) {
      console.log(`--- ${p.name} ---`);
      const { page, jsErrors } = await launchPage(browser, p);
      await enterFarm(page);
      const l = await readLayout(page);
      console.log(`  画布: ${JSON.stringify(l.canvas)} | 显示尺寸: ${JSON.stringify(l.display)} | 容器: ${JSON.stringify(l.container)}`);

      const ratio = l.canvas ? l.canvas.w / l.canvas.h : 0;
      const vpRatio = l.vp.w / l.vp.h;
      check(`${p.name}：画布铺满视口（${ratio.toFixed(3)} ≈ ${vpRatio.toFixed(3)}）`, Math.abs(ratio - vpRatio) < 0.03);
      // game-container 尺寸 = 画布显示尺寸（DOM UI 对齐画布，不偏到黑边）
      const containerMatch =
        !!l.container && !!l.canvas &&
        Math.abs(l.container.w - l.canvas.w) <= 2 &&
        Math.abs(l.container.h - l.canvas.h) <= 2;
      check(`${p.name}：game-container 与画布对齐`, !!containerMatch);
      check(`${p.name}：相机垂直视野 300 世界像素（${l.worldViewH}）`, l.worldViewH === 300);
      check(`${p.name}：无页面 JS 错误`, jsErrors.length === 0, jsErrors.join('; ').slice(0, 200));
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== 结果：${passed}/${results.length} 通过${failed ? `，${failed} 失败` : ''} ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('探针运行失败:', e);
  process.exit(1);
});
