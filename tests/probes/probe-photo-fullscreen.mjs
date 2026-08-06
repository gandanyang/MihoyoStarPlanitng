/**
 * 探针 — 归星录·相簿点击全屏 / 再点退出（f6）
 *
 * 验证目标（Level 2）：
 *  1. 打开相簿，点击已解锁照片 → 出现全屏查看遮罩（z-index 225）
 *  2. 再点击全屏任意处 → 全屏退出，相簿仍在
 *  3. Esc → 先关全屏；再 Esc → 关闭相簿
 *  4. 未解锁照片点击 → 不触发全屏
 *  5. 全程无 JS 错误
 *
 * 前置：Vite dev server localhost:5175
 * 运行：$env:GAME_URL='http://localhost:5175/'; node tests/probes/probe-photo-fullscreen.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5175/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' - ' + extra : ''}`);
  ok ? pass++ : fail++;
}

async function run() {
  console.log('=== 探针：归星录·相簿点击全屏 / 再点退出（f6）===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2000);

    // 切到 farm
    await page.evaluate(() => {
      const g = window.__game;
      const active = g.scene.getScenes(true)[0];
      if (active) g.scene.stop(active.scene.key);
      g.scene.start('farm');
    });
    await sleep(2500);

    // 解锁 1 张照片 + 1 张保持锁定
    await page.evaluate(() => {
      window.debug?.unlockPhoto?.('summer_garden');
    });
    await sleep(400);

    // 1. 打开相簿
    await page.evaluate(() => {
      document.getElementById('album-btn')?.click();
    });
    await sleep(600);

    // 2. 点击已解锁照片 → 全屏遮罩出现
    await page.evaluate(() => {
      const img = document.querySelector('.pa-card[data-unlocked="1"] img');
      img?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await sleep(400);
    const fsState = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '225');
      return {
        exists: !!el,
        display: el?.style.display ?? null,
        hasImg: !!el?.querySelector('img'),
        imgSrc: el?.querySelector('img')?.getAttribute('src') ?? null,
      };
    });
    check('1. 点击已解锁照片出现全屏遮罩', fsState.exists && fsState.display === 'flex' && fsState.hasImg,
      `display=${fsState.display} src=${fsState.imgSrc ?? '无'}`);
    check('1b. 全屏显示的是夏日花园图片', (fsState.imgSrc ?? '').includes('summer_garden'), fsState.imgSrc ?? '');

    // 相簿本体仍在（全屏浮在其上）
    const albumStill = await page.evaluate(() => {
      const el = document.getElementById('photo-album-panel');
      return !!el && el.style.display !== 'none' && el.style.display !== '';
    });
    check('2. 全屏时相簿面板仍在', albumStill === true);

    // 3. 再点击全屏任意处 → 全屏退出，相簿仍在
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '225');
      el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await sleep(400);
    const afterClose = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '225');
      const panel = document.getElementById('photo-album-panel');
      return {
        fsDisplay: el?.style.display ?? null,
        panelOpen: !!panel && panel.style.display !== 'none' && panel.style.display !== '',
      };
    });
    check('3. 再点击退出全屏', afterClose.fsDisplay === 'none' || afterClose.fsDisplay === null || afterClose.fsDisplay === '',
      `display=${afterClose.fsDisplay}`);
    check('3b. 全屏退出后相簿仍打开', afterClose.panelOpen === true);

    // 4. 再次点开全屏 → Esc 退出全屏
    await page.evaluate(() => {
      const img = document.querySelector('.pa-card[data-unlocked="1"] img');
      img?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await sleep(300);
    await page.keyboard.press('Escape');
    await sleep(300);
    const escState = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '225');
      const panel = document.getElementById('photo-album-panel');
      return {
        fsDisplay: el?.style.display ?? null,
        panelOpen: !!panel && panel.style.display !== 'none' && panel.style.display !== '',
      };
    });
    check('4. Esc 退出全屏（相簿仍开）', escState.panelOpen === true &&
      (escState.fsDisplay === 'none' || escState.fsDisplay === '' || escState.fsDisplay === null),
      `fs=${escState.fsDisplay} panel=${escState.panelOpen}`);

    // 5. 未解锁照片点击 → 不触发全屏
    await page.evaluate(() => {
      const card = document.querySelector('.pa-card[data-unlocked="0"]');
      card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await sleep(300);
    const lockedState = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '225');
      return { display: el?.style.display ?? null };
    });
    check('5. 点击未解锁照片不触发全屏', lockedState.display === 'none' || lockedState.display === '' || lockedState.display === null,
      `display=${lockedState.display}`);

    // 6. Esc 关闭相簿 → 恢复游戏
    await page.keyboard.press('Escape');
    await sleep(300);
    const panelClosed = await page.evaluate(() => {
      const el = document.getElementById('photo-album-panel');
      return !el || el.style.display === 'none' || el.style.display === '';
    });
    check('6. Esc 关闭相簿', panelClosed === true);

    // 7. 无 JS 错误
    check('7. 无页面 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
