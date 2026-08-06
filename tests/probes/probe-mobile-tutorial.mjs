/**
 * 移动端真实教程全流程探针：全部用触屏"交互"键驱动（替代键盘 E）
 *
 * 目标：定位"按 E 无法触发任务下一步"在移动端是否可复现、卡在哪一步。
 * 路径：标题 → 车站 → 大门（夏雅/背包钥匙）→ 农场（锄地×3/播种×3/浇水×3）→ 睡觉 → done
 *
 * 前置：dev server 在 localhost:5173；node probe-mobile-tutorial.mjs
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

/** 触屏"交互/使用工具"按钮（等同玩家点按钮；农场场景文字为"使用工具"） */
async function pressInteract(page) {
  await page.evaluate(() => {
    const b = document.querySelector('#touch-controls [data-action="interact"]');
    if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  await sleep(500);
}

/** 触屏"背包"按钮 */
async function pressBackpack(page) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#touch-controls div')];
    const b = btns.find(x => x.textContent?.trim() === '背包');
    if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  await sleep(500);
}

async function skipDialogue(page, lineCount) {
  const calls = lineCount * 2 + 1;
  for (let i = 0; i < calls; i++) {
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) s.storyDialogue.advance();
    });
    await sleep(40);
  }
  await sleep(400);
}

async function run() {
  console.log('=== 移动端真实教程全流程（触屏交互键驱动）===\n');
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

    // 标题 → 车站 → 跳过开场
    await page.keyboard.press('Enter');
    await sleep(2200);
    await page.evaluate(() => {
      const btn = document.getElementById('intro-skip-btn');
      if (btn) btn.click();
    });
    await sleep(800);
    let info = await sceneInfo(page);
    console.log(`1. 车站跳过 → 场景=${info.scene}, 步骤=${info.step}`);

    // 车站 → 大门（真实出口）
    await teleport(page, 'station', 970, 460, 'right');
    await sleep(3200);
    info = await sceneInfo(page);
    console.log(`2. 走到大门 → 场景=${info.scene}, 步骤=${info.step}`);

    // 与夏雅对话（触屏交互）
    await teleport(page, 'gate', 248, 200, 'up');
    await pressInteract(page);
    await sleep(800);
    await skipDialogue(page, 7); // XIYA_DIALOGUE 7 行（v0.7）
    info = await sceneInfo(page);
    console.log(`3. 夏雅对话拿钥匙 → 步骤=${info.step}${info.step === 'get_key' ? ' ✅' : ' ❌'}`);

    // 背包按钮 → 使用钥匙
    await pressBackpack(page);
    const bpOpen = await page.evaluate(() => {
      const el = document.getElementById('backpack-panel');
      return el?.style.display ?? '';
    });
    console.log(`4. 触屏背包按钮打开面板: ${bpOpen === 'flex' ? '✅' : '❌'}`);
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-action="use-key"]');
      if (btn) btn.click();
    });
    await sleep(1200);
    await skipDialogue(page, 10); // GATE_OPENED_DIALOGUE 10 行（v0.8+E-07 + 先开三块地）
    info = await sceneInfo(page);
    console.log(`5. 使用钥匙开门 → 步骤=${info.step}${info.step === 'clear_land' ? ' ✅' : ' ❌'}`);

    // 穿过大门 → 农场
    await teleport(page, 'gate', 240, 40, 'up');
    await sleep(3200);
    info = await sceneInfo(page);
    console.log(`6. 进入农场 → 场景=${info.scene}, 步骤=${info.step}`);

    // 锄地 ×3（触屏交互，面向农田格）
    const tillSpots = [[216, 184], [232, 184], [248, 184]];
    for (const [x, y] of tillSpots) {
      await teleport(page, 'farm', x, y, 'up');
      await pressInteract(page);
    }
    await skipDialogue(page, 3); // SOW_SEEDS_DIALOGUE 3 行（v0.7）
    info = await sceneInfo(page);
    console.log(`7. 锄地×3 → 播种教学 → 步骤=${info.step}${info.step === 'sow_seeds' ? ' ✅' : ' ❌'}`);

    // 播种 ×3
    for (const [x, y] of tillSpots) {
      await teleport(page, 'farm', x, y, 'up');
      await pressInteract(page);
    }
    await skipDialogue(page, 7); // WATER_CROPS_DIALOGUE 7 行（E-08）
    info = await sceneInfo(page);
    console.log(`8. 播种×3 → 浇水教学 → 步骤=${info.step}${info.step === 'water_crops' ? ' ✅' : ' ❌'}`);

    // 浇水 ×3
    for (const [x, y] of tillSpots) {
      await teleport(page, 'farm', x, y, 'up');
      await pressInteract(page);
    }
    await skipDialogue(page, 7); // EVENING_DIALOGUE
    info = await sceneInfo(page);
    console.log(`9. 浇水×3 → 睡觉提示 → 步骤=${info.step}${info.step === 'evening_talk' ? ' ✅' : ' ❌'}`);

    // 睡觉（农场木屋地板，触屏交互）
    await teleport(page, 'farm', 56, 320, 'up');
    await pressInteract(page);
    await sleep(1500);
    info = await sceneInfo(page);
    console.log(`10. 木屋睡觉 → 步骤=${info.step}${info.step === 'done' ? ' ✅教程完成' : ' ❌'}`);
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
