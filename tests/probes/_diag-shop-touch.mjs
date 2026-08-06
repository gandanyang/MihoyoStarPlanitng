/**
 * 诊断 — 触摸模拟下商店按钮事件链
 * 目的：查触摸 tap/hold 是否产生 pointerdown / click，命中元素是什么
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5175/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
  await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.evaluate(() => {
    localStorage.setItem('return_star_save', JSON.stringify({
      version: '0.5', savedAt: 'diag', timestamp: Date.now(),
      player: { x: 96, y: 160, scene: 'farm', facing: 'down', inventory: { radish: 5 } },
      world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started', dailyQuest: null },
      farm: { tiles: [], crops: [], trees: [] },
      story: { storyStep: 'done', ch1TownIntroDone: false },
    }));
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2500);
  await page.keyboard.press('Enter');
  await sleep(3000);

  // 注入事件计数（捕获阶段，document 级）
  await page.evaluate(() => {
    const w = window;
    w.__ev = {};
    for (const t of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend', 'pointercancel']) {
      w.__ev[t] = [];
      document.addEventListener(t, (e) => {
        const el = e.target;
        w.__ev[t].push(`${e.type}@${(el.id || el.tagName || el.className || '').toString().slice(0, 30)} da=${el.dataset?.action ?? '-'}`);
      }, true);
    }
  });

  await page.evaluate(() => {
    const s = window.__game.scene.getScene('farm');
    s?.shopPanel?.open();
  });
  await sleep(500);

  const pt = await page.evaluate(() => {
    const el = document.querySelector('#shop-panel [data-action="buy-radish-seed"]');
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, hitTag: hit?.tagName, hitDa: hit?.dataset?.action, hitId: hit?.id };
  });
  console.log('按钮中心:', pt, ' 命中元素:', pt.hitTag, 'da=', pt.hitDa);

  console.log('\n--- 触摸 tap（touchStart 80ms touchEnd）---');
  await page.touchscreen.touchStart(pt.x, pt.y);
  await sleep(80);
  await page.touchscreen.touchEnd();
  await sleep(400);
  console.log('tap 后事件:', JSON.stringify(await page.evaluate(() => window.__ev), null, 0));

  const coins = await page.evaluate(() => document.querySelector('#shop-panel #shop-coins')?.textContent);
  console.log('tap 后金币显示:', coins);

  await browser.close();
}

run().catch(err => { console.error('诊断异常:', err); process.exit(1); });
