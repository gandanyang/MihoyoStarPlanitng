// 验证触屏控件（摇杆/按钮）放在画面外（FIT 缩放黑边区域），不遮挡游戏画面（制作人需求）
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

  // 收集控件矩形 + 画布矩形，并检查每个控件中心点是否在画布外（画面外）
  const collectAndCheck = async (page, prefix) => {
    const data = await page.evaluate(() => {
      const cv = document.querySelector('#game-container canvas');
      if (!cv) return null;
      const c = cv.getBoundingClientRect();
      const rect = sel => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      return {
        canvas: { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height), r: Math.round(c.right), b: Math.round(c.bottom) },
        quest: rect('#quest-btn'),
        joy: rect('.tc-joystick'),
        main: rect('[data-action="interact"]'),
        bp: rect('.tc-btn-backpack'),
        questDisplay: document.getElementById('quest-btn') ? getComputedStyle(document.getElementById('quest-btn')).display : 'none',
        vp: { w: innerWidth, h: innerHeight },
      };
    });
    if (!data) { console.log(`${prefix} → 画布未找到`); return false; }
    console.log(`${prefix} →`, JSON.stringify(data));
    const out = (r) => {
      if (!r) return null;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      // 中心点不在画布内 → 画面外
      return !(cx >= data.canvas.x && cx <= data.canvas.r && cy >= data.canvas.y && cy <= data.canvas.b);
    };
    check(`${prefix} 任务按钮显示`, data.questDisplay === 'flex');
    check(`${prefix} 任务按钮在画面外`, out(data.quest) === true);
    check(`${prefix} 摇杆在画面外`, out(data.joy) === true);
    check(`${prefix} 主按钮在画面外`, out(data.main) === true);
    check(`${prefix} 背包按钮在画面外`, out(data.bp) === true);
    return true;
  };

  try {
    // ===== 横屏 844×390 =====
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
    await collectAndCheck(page, '横屏844×390');
    await page.close();

    // ===== 竖屏 390×844（真机竖屏会被 rotate-hint 遮挡，此处验证布局计算不越界） =====
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
    await collectAndCheck(page2, '竖屏390×844');
    await page2.close();
  } finally {
    await browser.close();
  }
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}
run().catch(err => { console.error('探针异常:', err); process.exit(1); });
