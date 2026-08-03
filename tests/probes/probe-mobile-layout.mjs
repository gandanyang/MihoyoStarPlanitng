/**
 * UI 布局修复验证探针 v2
 *
 * 段A（存档流程）：写假存档 → title → 清除按钮出现 → Enter 开始 → 按钮移除不残留
 * 段B（全新流程）：?reset=1 → 走完整开场 → 跳过 → 切 farm → 验证任务面板位置
 *   横屏 844×390：任务面板应左上（x<250），不与右侧背包按钮重叠
 * 前置：dev server 在 localhost:5173；node probe-mobile-layout.mjs
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
    defaultViewport: { width: 844, height: 390, isMobile: true, hasTouch: true },
    args: ['--no-sandbox'],
  });

  try {
    // ============ 段A：清除按钮不残留 ============
    console.log('--- 段A：清除按钮 ---');
    {
      const page = await browser.newPage();
      await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
      await sleep(1500);
      await page.evaluate(() => localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: '测试档',
        player: { x: 1, y: 2, scene: 'farm', facing: 'up', inventory: {} },
        world: {}, farm: {}, story: {},
      })));
      await page.reload({ waitUntil: 'networkidle2' });
      await sleep(2500);

      const btnBefore = await page.evaluate(() => !!document.getElementById('clear-save-btn'));
      check('title 有存档时清除按钮出现', btnBefore);

      await page.keyboard.press('Enter');
      await sleep(1500);
      const btnAfter = await page.evaluate(() => !!document.getElementById('clear-save-btn'));
      check('进入游戏后清除按钮已移除（不残留）', !btnAfter);
      await page.close();
    }

    // ============ 段B：任务面板位置（全新档，横屏手机 844×390） ============
    console.log('--- 段B：任务面板布局 ---');
    {
      const page = await browser.newPage();
      // 手机横屏：launch 级 isMobile 只模拟视口/触屏，不改变 UA；需显式注入移动 UA，
      // 否则 isTouchDevice() 的 UA 判定走桌面分支（BUG-030 设计如此）→ 面板错误出现在右上。
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'userAgent', {
          get: () => 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
          configurable: true,
        });
        Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5, configurable: true });
      });
      await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
      await sleep(3000);
      // 等 title 场景 ready 再 Enter
      await waitFor(page, () => page.evaluate(() => {
        const g = window.__game;
        return g && g.scene.getScenes(true).some(s => s.scene.key === 'title');
      }), 10000);
      await page.keyboard.press('Enter');

      // 等 skip-btn 出现（代表开场已启动）再点通知（v0.7 两页：点两次）
      await waitFor(page, () => page.evaluate(() => !!document.getElementById('intro-skip-btn')), 15000);
      const phoneClicked = await waitFor(page, () =>
        page.evaluate(() => {
          const o = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '600' && d.textContent.includes('人事通知'));
          if (o) { o.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; }
          return false;
        }), 15000);
      check('手机通知出现并点击', !!phoneClicked);
      await sleep(300);
      // 第二次点击：翻到第2页后关闭
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

      // 轮询等待任务面板创建
      const panelReady = await waitFor(page, () =>
        page.evaluate(() => !!document.getElementById('daily-quest-panel')), 15000);
      check('farm 任务面板已创建', !!panelReady);
      await sleep(800);

      const layout = await page.evaluate(() => {
        // daily-quest-panel 默认 display:none（bb1e424 有意折叠），测量前先置可见（与 probe-bug031 一致）
        const qp = document.getElementById('daily-quest-panel');
        if (qp) qp.style.display = 'block';
        const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), b: Math.round(b.bottom) }; };
        const btns = [...document.querySelectorAll('#touch-controls div')].map(x => {
          const b = x.getBoundingClientRect();
          return { txt: (x.textContent || '').trim().slice(0, 3), x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), b: Math.round(b.bottom) };
        });
        return {
          vp: { w: innerWidth, h: innerHeight },
          questPanel: r(qp),
          touch: btns,
        };
      });

      const qp = layout.questPanel;
      const backpack = layout.touch.find(t => t.txt === '背包');
      console.log(`视口: ${layout.vp.w}×${layout.vp.h}`);
      console.log(`任务面板: ${JSON.stringify(qp)}`);
      console.log(`背包按钮: ${JSON.stringify(backpack)}`);

      check('任务面板在左上（x<250）', !!qp && qp.x < 250);
      if (qp && backpack) {
        check(`任务面板不与背包重叠（面板r=${qp.x + qp.w} 背包x=${backpack.x}）`, qp.x + qp.w <= backpack.x);
      }
      await page.close();
    }

    // ============ 段C：竖屏 375×812 任务面板也在左上 ============
    console.log('--- 段C：竖屏布局 ---');
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
      await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
      await sleep(3000);
      await page.keyboard.press('Enter');
      await waitFor(page, () => page.evaluate(() => !!document.getElementById('intro-skip-btn')), 15000);
      await waitFor(page, () =>
        page.evaluate(() => {
          const o = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '600' && d.textContent.includes('人事通知'));
          if (o) { o.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; }
          return false;
        }), 15000);
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
      const panelReady = await waitFor(page, () =>
        page.evaluate(() => !!document.getElementById('daily-quest-panel')), 15000);
      check('竖屏任务面板已创建', !!panelReady);
      await sleep(800);
      const qpv = await page.evaluate(() => {
        const el = document.getElementById('daily-quest-panel');
        if (!el) return null;
        el.style.display = 'block'; // 折叠状态下强制测量实际布局位置（与 probe-bug031 一致）
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) };
      });
      console.log(`竖屏任务面板: ${JSON.stringify(qpv)}`);
      check('竖屏任务面板在左上（x<250）', !!qpv && qpv.x < 250);
      await page.close();
    }

    // ============ 段D：非触屏桌面（强制 maxTouchPoints=0）任务面板仍右上 ============
    console.log('--- 段D：非触屏桌面布局 ---');
    {
      const page = await browser.newPage();
      // 强制模拟非触屏设备（本机为触屏笔记本，需覆写）
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0, configurable: true });
      });
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
      await sleep(3000);
      const touchInfo = await page.evaluate(() => ({
        maxTouchPoints: navigator.maxTouchPoints,
        ontouchstart: 'ontouchstart' in window,
      }));
      console.log(`模拟触屏状态: ${JSON.stringify(touchInfo)}`);
      check('已模拟非触屏（maxTouchPoints=0）', touchInfo.maxTouchPoints === 0);
      await page.keyboard.press('Enter');
      await waitFor(page, () => page.evaluate(() => !!document.getElementById('intro-skip-btn')), 15000);
      await waitFor(page, () =>
        page.evaluate(() => {
          const o = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '600' && d.textContent.includes('人事通知'));
          if (o) { o.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; }
          return false;
        }), 15000);
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
      const panelReady = await waitFor(page, () =>
        page.evaluate(() => !!document.getElementById('daily-quest-panel')), 15000);
      check('桌面任务面板已创建', !!panelReady);
      await sleep(800);
      const qpd = await page.evaluate(() => {
        const el = document.getElementById('daily-quest-panel');
        if (!el) return null;
        el.style.display = 'block'; // 折叠状态下强制测量实际布局位置（与 probe-bug031 一致）
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) };
      });
      console.log(`桌面任务面板: ${JSON.stringify(qpd)}`);
      check('桌面任务面板在右上（x>700）', !!qpd && qpd.x > 700);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
