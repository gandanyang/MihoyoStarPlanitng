/**
 * 探针：睡觉交互 bug 根因定位（"回到床前按E无法完成任务" 复现）
 *
 * 验证三个场景（均教程置为 evening_talk）：
 *   A. farm 木屋地板 (3,19) 按 E —— 用户最可能在的位置（未进屋）
 *   B. house 床边面向床按 E —— 正确操作
 *   C. house 床边背对床按 E —— 错误朝向
 *
 * 前置：dev server 在 localhost:5173；node probe-sleep-realpath.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sceneInfo(page) {
  return page.evaluate(() => ({
    scene: window.__game.scene.getScenes(true)[0]?.scene?.key ?? 'none',
    step: window.debug?.getStoryStep?.(),
    player: (() => {
      const s = window.__game.scene.getScenes(true)[0];
      return s?.player ? { x: Math.round(s.player.x), y: Math.round(s.player.y), f: s.player.facing } : null;
    })(),
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
  await sleep(800);
}

async function resetEvening(page) {
  await page.evaluate(() => window.debug.setStoryStep('evening_talk'));
}

async function run() {
  console.log('=== 睡觉交互 bug 根因定位 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
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

    // ===== A. farm 木屋地板按 E（用户最可能场景） =====
    await resetEvening(page);
    await gotoScene(page, 'farm', { x: 60, y: 310 }); // tile (3,19) 木屋地板
    let info = await sceneInfo(page);
    console.log('A0. 起始:', JSON.stringify(info));
    await pressE(page);
    info = await sceneInfo(page);
    console.log(`A1. farm木屋(3,19)按E → step=${info.step}${info.step === 'done' ? ' ✅完成' : ' ❌未完成（根因：木屋区域无睡觉判定）'}`);

    // 再试站木屋内部深处 (6,22)
    await resetEvening(page);
    await gotoScene(page, 'farm', { x: 104, y: 360 }); // tile (6,22)
    await pressE(page);
    info = await sceneInfo(page);
    console.log(`A2. farm木屋(6,22)按E → step=${info.step}${info.step === 'done' ? ' ✅完成' : ' ❌未完成'}`);

    // ===== B. house 床边面向床按 E =====
    await resetEvening(page);
    await gotoScene(page, 'house', { x: 40, y: 72 }); // 床前 (2,4)
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('house');
      if (s?.player) { s.player.x = 40; s.player.y = 72; s.player.facing = 'up'; }
    });
    await sleep(150);
    await pressE(page);
    info = await sceneInfo(page);
    console.log(`B1. house床前(2,4)面向床按E → step=${info.step}${info.step === 'done' ? ' ✅完成' : ' ❌未完成'}`);

    // ===== C. house 床边背对床按 E =====
    await resetEvening(page);
    await gotoScene(page, 'house', { x: 40, y: 72 });
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('house');
      if (s?.player) { s.player.x = 40; s.player.y = 72; s.player.facing = 'down'; }
    });
    await sleep(150);
    await pressE(page);
    info = await sceneInfo(page);
    console.log(`C1. house床前背对床按E → step=${info.step}${info.step === 'done' ? ' ✅完成' : ' ❌未完成（预期：背对床不触发）'}`);

    // ===== D. 站在床上按 E =====
    await resetEvening(page);
    await gotoScene(page, 'house', { x: 40, y: 40 }); // 床上 (2,2)
    await pressE(page);
    info = await sceneInfo(page);
    console.log(`D1. 站床上按E → step=${info.step}${info.step === 'done' ? ' ✅完成' : ' ❌未完成'}`);

    await page.evaluate(() => window.debug.setStoryStep('done'));
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
