// 验证任务按钮移到左上角（制作人需求）
// 前置：dev server localhost:5173
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  let pass = 0, fail = 0;
  const check = (name, ok) => { console.log(`${ok ? '✅' : '❌'} ${name}`); ok ? pass++ : fail++; };
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
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
        configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5, configurable: true });
    });
    // ===== 横屏 844×390 =====
    await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
    await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
    await sleep(2500);
    await page.evaluate(() => window.debug?.setStoryStep?.('done'));
    await sleep(300);
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('farm');
    });
    await waitFor(page, () => page.evaluate(() => !!document.getElementById('quest-btn')));
    await sleep(600);
    const q = await page.evaluate(() => {
      const b = document.getElementById('quest-btn');
      const cv = document.querySelector('#game-container canvas');
      if (!b || !cv) return null;
      const r = b.getBoundingClientRect();
      const c = cv.getBoundingClientRect();
      return {
        btn: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        canvas: { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height), r: Math.round(c.right), b: Math.round(c.bottom) },
        display: getComputedStyle(b).display,
        vp: { w: innerWidth, h: innerHeight },
      };
    });
    console.log('横屏844×390 →', JSON.stringify(q));
    if (q) {
      check('任务按钮显示', q.display === 'flex');
      check('按钮在画布左 15% 内', q.btn.x < q.canvas.x + q.canvas.w * 0.15);
      check('按钮在画布上部 40% 内', q.btn.y < q.canvas.y + q.canvas.h * 0.4);
      check('按钮整体在画布内', q.btn.x >= q.canvas.x && q.btn.x + q.btn.w <= q.canvas.r && q.btn.y >= q.canvas.y && q.btn.y + q.btn.h <= q.canvas.b);
    }
    await page.close();

    // ===== 竖屏 390×844 =====
    const page2 = await browser.newPage();
    await page2.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
        configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5, configurable: true });
    });
    await page2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page2.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
    await sleep(2500);
    await page2.evaluate(() => window.debug?.setStoryStep?.('done'));
    await sleep(300);
    await page2.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('farm');
    });
    await waitFor(page2, () => page2.evaluate(() => !!document.getElementById('quest-btn')));
    await sleep(600);
    const q2 = await page2.evaluate(() => {
      const b = document.getElementById('quest-btn');
      const cv = document.querySelector('#game-container canvas');
      if (!b || !cv) return null;
      const r = b.getBoundingClientRect();
      const c = cv.getBoundingClientRect();
      return {
        btn: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        canvas: { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height), r: Math.round(c.right), b: Math.round(c.bottom) },
        display: getComputedStyle(b).display,
        vp: { w: innerWidth, h: innerHeight },
      };
    });
    console.log('竖屏390×844 →', JSON.stringify(q2));
    if (q2) {
      check('竖屏任务按钮显示', q2.display === 'flex');
      check('竖屏按钮在画布左 15% 内', q2.btn.x < q2.canvas.x + q2.canvas.w * 0.15);
      check('竖屏按钮在画布上部 40% 内', q2.btn.y < q2.canvas.y + q2.canvas.h * 0.4);
      check('竖屏按钮整体在画布内', q2.btn.x >= q2.canvas.x && q2.btn.x + q2.btn.w <= q2.canvas.r && q2.btn.y >= q2.canvas.y && q2.btn.y + q2.btn.h <= q2.canvas.b);
    }
    await page2.close();
  } finally {
    await browser.close();
  }
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}
run().catch(err => { console.error('探针异常:', err); process.exit(1); });
