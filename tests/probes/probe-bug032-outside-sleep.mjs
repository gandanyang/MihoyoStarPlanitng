// BUG-032 反向验证：农场木屋外（屋旁草地）按交互不应触发睡觉跨天
// 前置：dev server localhost:5173
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gotoScene(page, key, spawn) {
  await page.evaluate(([k, sp]) => {
    const g = window.__game;
    const active = g.scene.getScenes(true)[0];
    if (active && active.scene.key !== k) g.scene.stop(active.scene.key);
    g.scene.start(k, sp ? { spawn: sp } : undefined);
  }, [key, spawn ?? null]);
  await sleep(2600);
}
async function teleport(page, sceneKey, x, y) {
  await page.evaluate(([k, px, py]) => {
    const s = window.__game.scene.getScene(k);
    if (!s?.player) return;
    s.player.x = px; s.player.y = py;
  }, [sceneKey, x, y]);
  await sleep(300);
}
async function pressInteract(page) {
  await page.evaluate(() => {
    const b = document.querySelector('#touch-controls [data-action="interact"]');
    if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  await sleep(600);
}
async function state(page) {
  return page.evaluate(() => ({
    scene: window.__game.scene.getScenes(true)[0]?.scene?.key ?? 'none',
    step: window.debug?.getStoryStep?.(),
  }));
}

async function run() {
  console.log('=== BUG-032 反向验证：木屋外按交互不应睡觉 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 375, height: 812, isMobile: true, hasTouch: true },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  let pass = 0, fail = 0;
  const check = (name, ok) => { console.log(`${name} → ${ok ? '✅' : '❌'}`); ok ? pass++ : fail++; };
  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);
    await page.keyboard.press('Enter');
    await sleep(2200);
    await page.evaluate(() => { const b = document.getElementById('intro-skip-btn'); if (b) b.click(); });
    await sleep(500);

    // 场景1（对照）：屋内地板 (3,20)（门区外）应正常睡
    await page.evaluate(() => window.debug.setStoryStep('evening_talk'));
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    await teleport(page, 'farm', 56, 320);
    await pressInteract(page);
    let s = await state(page);
    check('对照：屋内地板(3,20) 交互 → 正常睡觉', s.step === 'done');

    // 场景1b（对照）：屋内深处 (4,22) 也应正常睡
    await page.evaluate(() => window.debug.setStoryStep('evening_talk'));
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    await teleport(page, 'farm', 72, 360);
    await pressInteract(page);
    s = await state(page);
    check('对照：屋内深处(4,22) 交互 → 正常睡觉', s.step === 'done');

    // 场景2：木屋右侧草地 (10,20) — 门外侧
    await page.evaluate(() => window.debug.setStoryStep('evening_talk'));
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    await teleport(page, 'farm', 168, 328);
    await pressInteract(page);
    s = await state(page);
    check('屋外右侧(10,20) 交互 → 未睡觉', s.scene === 'farm' && s.step === 'evening_talk');

    // 场景3：木屋左侧花园区 (1,20)
    await page.evaluate(() => window.debug.setStoryStep('evening_talk'));
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    await teleport(page, 'farm', 24, 328);
    await pressInteract(page);
    s = await state(page);
    check('屋外左侧(1,20) 交互 → 未睡觉', s.scene === 'farm' && s.step === 'evening_talk');

    console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
    process.exit(fail > 0 ? 1 : 0);
  } finally {
    await browser.close();
  }
}
run().catch(err => { console.error('探针异常:', err); process.exit(1); });
