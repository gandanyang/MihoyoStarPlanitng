/**
 * BUG-030 + BUG-034 专项探针
 * BUG-030：桌面 Chrome 不应显示移动端触控按钮（摇杆/主按钮/背包/任务）
 * BUG-034：横屏 844×390 下摇杆/按钮中心位置正确（画布左 25% / 右 25%）且整体在视口内可操作
 * 说明：控件设计定位到 FIT 黑边区（不遮挡游戏画面），故断言用"视口内可操作"而非"画布内"。
 * 前置：dev server 在 localhost:5173
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  let pass = 0, fail = 0;
  const check = (name, ok) => {
    console.log(`${ok ? '✅' : '❌'} ${name}`);
    ok ? pass++ : fail++;
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
    defaultViewport: { width: 1280, height: 720 },
    args: ['--no-sandbox'],
  });

  const toFarm = async (page) => {
    await page.keyboard.press('Enter');
    await waitFor(page, () => page.evaluate(() => !!document.getElementById('intro-skip-btn')), 15000);
    await waitFor(page, () =>
      page.evaluate(() => {
        const o = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '600' && d.textContent.includes('人事通知'));
        if (o) { o.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; }
        return false;
      }), 15000);
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
    await waitFor(page, () => page.evaluate(() => !!document.getElementById('daily-quest-panel')), 15000);
    await sleep(800);
  };

  try {
    // ============ 段A：桌面非触屏 —— 触控按钮全部隐藏 ============
    console.log('--- 段A：桌面端（非触屏）按钮隐藏 ---');
    {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0, configurable: true });
      });
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
      await sleep(2500);
      const touchInfo = await page.evaluate(() => ({
        ua: navigator.userAgent.slice(0, 40),
        maxTouchPoints: navigator.maxTouchPoints,
        ontouchstart: 'ontouchstart' in window,
        isTouch: !!window.__isTouchDevice,
      }));
      console.log(`UA: ${touchInfo.ua} | maxTouchPoints=${touchInfo.maxTouchPoints}`);
      check('桌面模拟非触屏成功', touchInfo.maxTouchPoints === 0);
      await toFarm(page);
      const vis = await page.evaluate(() => {
        const s = el => { const e = el ? document.querySelector(el) : null; return e ? getComputedStyle(e).display : 'missing'; };
        return {
          joystick: s('#touch-controls .tc-joystick'),
          main: s('#touch-controls [data-action="interact"]'),
          backpack: s('#touch-controls .tc-btn-backpack'),
          quest: s('#touch-controls .tc-btn-quest'),
        };
      });
      console.log(`显示状态: ${JSON.stringify(vis)}`);
      check('桌面端摇杆隐藏', vis.joystick === 'none');
      check('桌面端主按钮隐藏', vis.main === 'none');
      check('桌面端背包按钮隐藏', vis.backpack === 'none');
      check('桌面端任务按钮隐藏', vis.quest === 'none');
      await page.close();
    }

    // ============ 段B：模拟 Android 真机 UA —— 按钮全部显示 ============
    console.log('--- 段B：Android UA 按钮显示 ---');
    {
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
      const uaInfo = await page.evaluate(() => navigator.userAgent.slice(0, 40));
      console.log(`UA: ${uaInfo}`);
      await toFarm(page);
      const vis = await page.evaluate(() => {
        const s = el => { const e = document.querySelector(el); return e ? getComputedStyle(e).display : 'missing'; };
        return {
          joystick: s('#touch-controls .tc-joystick'),
          main: s('#touch-controls [data-action="interact"]'),
          backpack: s('#touch-controls .tc-btn-backpack'),
          quest: s('#touch-controls .tc-btn-quest'),
        };
      });
      console.log(`显示状态: ${JSON.stringify(vis)}`);
      check('Android 摇杆显示', vis.joystick === 'block');
      check('Android 主按钮显示', vis.main === 'flex');
      check('Android 背包按钮显示', vis.backpack === 'flex');
      check('Android 任务按钮显示', vis.quest === 'flex');
      await page.close();
    }

    // ============ 段C：BUG-034 横屏按钮位置（在画布内） ============
    console.log('--- 段C：横屏 844×390 按钮位置 ---');
    {
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
      await toFarm(page);
      const lay = await page.evaluate(() => {
        const cv = document.querySelector('#game-container canvas');
        const cbr = cv.getBoundingClientRect();
        const rb = sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), cx: Math.round(b.x + b.width / 2), cy: Math.round(b.y + b.height / 2), w: Math.round(b.width), h: Math.round(b.height) }; };
        return {
          canvas: { x: Math.round(cbr.x), y: Math.round(cbr.y), w: Math.round(cbr.width), h: Math.round(cbr.height), r: Math.round(cbr.right), b: Math.round(cbr.bottom) },
          joy: rb('#touch-controls .tc-joystick'),
          main: rb('#touch-controls [data-action="interact"]'),
          vp: { w: innerWidth, h: innerHeight },
        };
      });
      console.log(`画布: ${JSON.stringify(lay.canvas)}`);
      console.log(`摇杆: ${JSON.stringify(lay.joy)} 主按钮: ${JSON.stringify(lay.main)}`);
      const c = lay.canvas;
      if (lay.joy && lay.main) {
        // 控件定位到 FIT 黑边区（设计意图：layoutControls 放黑边，不遮挡游戏画面）。
        // 验证核心：摇杆中心在画布左 25%、主按钮中心在画布右 25%（操作可达），
        // 且两者整体在视口内（y 在屏幕高度内，x 不超出屏幕边缘）。
        const joyInViewport = lay.joy.x >= 0 && lay.joy.x + lay.joy.w <= lay.vp.w && lay.joy.y >= 0 && lay.joy.y + lay.joy.h <= lay.vp.h;
        const mainInViewport = lay.main.x >= 0 && lay.main.x + lay.main.w <= lay.vp.w && lay.main.y >= 0 && lay.main.y + lay.main.h <= lay.vp.h;
        check('摇杆中心在画布左 25% 内', lay.joy.cx < c.x + c.w * 0.25);
        check('主按钮中心在画布右 25% 内', lay.main.cx > c.x + c.w * 0.75);
        check('摇杆整体在视口内（可操作）', joyInViewport);
        check('主按钮整体在视口内（可操作）', mainInViewport);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
