/**
 * 移动端睡觉复现探针（"回到床上按交互无法完成教程" bug）
 *
 * 用触屏"交互"按钮（TouchControls → queueAction）替代键盘 E，
 * 验证三条睡觉路径：
 *   A. 农场木屋地板（无需进屋）→ 交互 → 教程完成
 *   B. 屋内床铺上 → 交互 → 教程完成
 *   C. 床边相邻格面向床 → 交互 → 教程完成
 *
 * 前置：dev server 在 localhost:5173；node probe-mobile-sleep.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sceneInfo(page) {
  return page.evaluate(() => ({
    scene: window.__game.scene.getScenes(true)[0]?.scene?.key ?? 'none',
    step: window.debug?.getStoryStep?.(),
  }));
}

async function gotoScene(page, key, spawn) {
  await page.evaluate(([k, sp]) => {
    const g = window.__game;
    const active = g.scene.getScenes(true)[0];
    if (active && active.scene.key !== k) g.scene.stop(active.scene.key);
    g.scene.start(k, sp ? { spawn: sp } : undefined);
  }, [key, spawn ?? null]);
  await sleep(2600);
}

async function teleport(page, sceneKey, x, y, facing = 'up') {
  await page.evaluate(([k, px, py, f]) => {
    const s = window.__game.scene.getScene(k);
    if (!s?.player) return;
    s.player.x = px;
    s.player.y = py;
    s.player.facing = f;
  }, [sceneKey, x, y, facing]);
  await sleep(200);
}

/** 触屏"交互"按钮（等同玩家点按钮） */
async function pressInteract(page) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#touch-controls div')];
    const b = btns.find(x => x.textContent?.trim() === '交互');
    if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  await sleep(600);
}

async function resetToEvening(page) {
  await page.evaluate(() => window.debug.setStoryStep('evening_talk'));
  await sleep(300);
}

async function run() {
  console.log('=== 移动端睡觉路径复现 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 375, height: 812, isMobile: true, hasTouch: true },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);
    await page.keyboard.press('Enter');
    await sleep(2200);
    await page.evaluate(() => {
      const btn = document.getElementById('intro-skip-btn');
      if (btn) btn.click();
    });
    await sleep(500);

    // ===== A. 农场木屋地板（站格即睡，无需进屋） =====
    await resetToEvening(page);
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    const bedInfo = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return s?.bedTiles ? [...s.bedTiles] : [];
    });
    console.log('A-prep farm bedTiles:', JSON.stringify(bedInfo));
    await teleport(page, 'farm', 56, 320, 'up'); // tile (3,20) 木屋地板
    await pressInteract(page);
    let info = await sceneInfo(page);
    console.log(`A. 农场木屋地板(3,20) 交互 → step=${info.step}${info.step === 'done' ? ' ✅完成' : ' ❌未完成'}`);

    // ===== B. 屋内床铺上 =====
    await resetToEvening(page);
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    await teleport(page, 'farm', 104, 320, 'up'); // 大门 → 进屋
    await sleep(2200);
    info = await sceneInfo(page);
    console.log(`B0. 进门 → 场景=${info.scene}`);
    if (info.scene === 'house') {
      const bedHouse = await page.evaluate(() => {
        const s = window.__game.scene.getScene('house');
        return s?.bedTiles ? [...s.bedTiles] : [];
      });
      console.log('B-prep house bedTiles:', JSON.stringify(bedHouse));
      await teleport(page, 'house', 40, 40, 'up'); // 床铺 (2,2)
      await pressInteract(page);
      info = await sceneInfo(page);
      console.log(`B. 屋内床铺上 交互 → step=${info.step}${info.step === 'done' ? ' ✅完成' : ' ❌未完成'}`);
    }

    // ===== C. 床边相邻格面向床 =====
    await resetToEvening(page);
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    await teleport(page, 'farm', 104, 320, 'up');
    await sleep(2200);
    info = await sceneInfo(page);
    if (info.scene === 'house') {
      await teleport(page, 'house', 40, 72, 'up'); // tile (2,4) 面向床 (2,3)
      await pressInteract(page);
      info = await sceneInfo(page);
      console.log(`C. 床边(row4)面向床 交互 → step=${info.step}${info.step === 'done' ? ' ✅完成' : ' ❌未完成'}`);
    }
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
