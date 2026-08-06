/**
 * BUG-031 验证：触屏端任务面板（daily-quest-panel）应下移避开状态栏/挖孔屏
 * 前置：dev server localhost:5173
 */
import puppeteer from 'puppeteer-core';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 844, height: 390 },
    args: ['--no-sandbox'],
  });
  let pass = 0, fail = 0;
  const check = (n, ok) => { console.log(`${ok ? '✅' : '❌'} ${n}`); ok ? pass++ : fail++; };
  const waitFor = async (page, fn, t = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < t) { const v = await fn(); if (v) return v; await sleep(250); }
    return null;
  };
  try {
    // Android UA 触屏
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
        configurable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5, configurable: true });
    });
    await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
    await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
    await sleep(2500);
    await page.keyboard.press('Enter');
    await waitFor(page, () => page.evaluate(() => !!document.getElementById('intro-skip-btn')));
    await waitFor(page, () => page.evaluate(() => {
      const o = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '600' && d.textContent.includes('人事通知'));
      if (o) { o.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; }
      return false;
    }));
    await sleep(300);
    // v0.7 两页通知：第二次点击关闭
    await page.evaluate(() => {
      const o = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '600' && d.textContent.includes('人事通知'));
      if (o) o.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
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
    await waitFor(page, () => page.evaluate(() => !!document.getElementById('daily-quest-panel')));
    await sleep(500);
    const info = await page.evaluate(() => {
      const el = document.getElementById('daily-quest-panel');
      if (!el) return null;
      el.style.display = 'block';
      const b = el.getBoundingClientRect();
      return { top: Math.round(b.top), x: Math.round(b.x), css: el.style.cssText.split(';')[0] };
    });
    console.log(`任务面板: ${JSON.stringify(info)}`);
    check('触屏端任务面板在左上（x<250）', !!info && info.x < 250);
    check('触屏端任务面板 top ≥ 85（避开状态栏/挖孔屏）', !!info && info.top >= 85);
    await page.close();
  } finally { await browser.close(); }
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
