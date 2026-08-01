/**
 * 探针：第一天睡觉路径排查（"回到床上睡觉无法完成任务" bug 定位）
 *
 * 场景：
 *   A. 农场旧睡觉点 (3,14) —— 修复后应废弃（无床，不再能睡）
 *   B. 屋内床铺（house cols 2-3, rows 2-3）—— 真实床，站在床上按 E
 *   C. 农场木屋区域 (3,19) —— 玩家看到木屋后可能按 E 的位置
 *   D. 屋内床铺相邻格（row 4，面向上）—— 床边面向床按 E（修复后应可睡）
 *
 * 前置：dev server 在 localhost:5173；node probe-sleep.mjs
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
  await sleep(2400);
}

async function teleport(page, sceneKey, x, y, facing = 'up') {
  await page.evaluate(([k, px, py, f]) => {
    const s = window.__game.scene.getScene(k);
    if (!s?.player) return;
    s.player.x = px; s.player.y = py; s.player.facing = f;
  }, [sceneKey, x, y, facing]);
  await sleep(150);
}

async function pressE(page) {
  await page.keyboard.press('KeyE');
  await sleep(500);
}

async function run() {
  console.log('=== 第一天睡觉路径排查 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  try {
    // 准备：清档 → 进入游戏 → 跳过车站 → 教程置为 evening_talk
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
    await page.evaluate(() => window.debug.setStoryStep('evening_talk'));

    // ===== A. 农场旧睡觉点 (3,14) =====
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    const before = await page.evaluate(() => ({
      scene: window.__game.scene.getScenes(true)[0]?.scene?.key,
      step: window.debug.getStoryStep(),
      player: (() => {
        const s = window.__game.scene.getScene('farm');
        return s?.player ? { x: s.player.x, y: s.player.y } : null;
      })(),
    }));
    console.log('A-prep:', JSON.stringify(before));
    await teleport(page, 'farm', 56, 224, 'up');
    await pressE(page);
    let info = await sceneInfo(page);
    console.log(`A. 农场(3,14) 睡觉 → step=${info.step}${info.step === 'done' ? ' ⚠️不应完成（旧点已废弃）' : ' ✅符合预期（不再触发睡觉）'}`);
    const after = await page.evaluate(() => ({
      scene: window.__game.scene.getScenes(true)[0]?.scene?.key,
      step: window.debug.getStoryStep(),
      day: (() => { const t = window.__game.scene.getScenes(true)[0]; return t; })(),
      dlg: (() => {
        const s = window.__game.scene.getScene('farm');
        return s?.storyDialogue?.isOpen?.() ? (s.storyDialogue.textEl?.textContent ?? '') : '<closed>';
      })(),
      axe: (() => {
        const raw = localStorage.getItem('return_star_save');
        return raw ? JSON.parse(raw).player.inventory.old_axe : null;
      })(),
    }));
    console.log('A-after:', JSON.stringify(after));

    // ===== B. 屋内床铺 =====
    // 重新置为 evening_talk（A 可能已完成，重置状态）
    await page.evaluate(() => window.debug.setStoryStep('evening_talk'));
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    await teleport(page, 'farm', 96, 320, 'up'); // 大门 (cols 5-7, rows 18-20)
    await sleep(2000);
    info = await sceneInfo(page);
    console.log(`B0. 走进大门 → 场景=${info.scene}（期望 house）`);
    if (info.scene === 'house') {
      const bedTiles = await page.evaluate(() => {
        const s = window.__game.scene.getScene('house');
        return s?.bedTiles ? [...s.bedTiles] : [];
      });
      console.log('B-bedTiles:', JSON.stringify(bedTiles));
      await teleport(page, 'house', 40, 40, 'up'); // 床 (2.5,2.5)
      await pressE(page);
      info = await sceneInfo(page);
      console.log(`B. 屋内床铺睡觉 → step=${info.step}${info.step === 'done' ? ' ✅完成' : ' ❌未完成'}`);
    }

    // ===== C. 农场木屋区域按 E（玩家看到木屋可能直接按） =====
    await page.evaluate(() => window.debug.setStoryStep('evening_talk'));
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    await teleport(page, 'farm', 56, 304, 'up'); // (3,19) 木屋地板
    await pressE(page);
    info = await sceneInfo(page);
    console.log(`C. 农场木屋(3,19) 按E → step=${info.step}${info.step === 'done' ? ' ⚠️不应完成' : ' ✅符合预期（农场无床不触发）'}`);

    // ===== D. 屋内床铺相邻格（row 4 面向床） =====
    await page.evaluate(() => window.debug.setStoryStep('evening_talk'));
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    await teleport(page, 'farm', 96, 320, 'up');
    await sleep(2000);
    info = await sceneInfo(page);
    if (info.scene === 'house') {
      await teleport(page, 'house', 40, 72, 'up'); // tile (2,4) 面向床 (2,3)
      await pressE(page);
      info = await sceneInfo(page);
      console.log(`D. 床边(row4)面向床按E → step=${info.step}${info.step === 'done' ? ' ✅完成' : ' ❌未完成'}`);
    }

    // 结束：直接标记完成避免残留
    await page.evaluate(() => window.debug.setStoryStep('done'));
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
