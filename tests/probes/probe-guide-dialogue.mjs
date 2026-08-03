/**
 * 引导剧情探针：验证砍树/挖矿引导在移动端能否体验
 *
 * 路径：
 *  1. 教程睡觉 → done → 检查任务面板是否含 woodcut_2 / mine_1
 *  2. 靠近树 → 触屏「使用工具」→ 是否触发 WOODCUT_TIP_DIALOGUE（夏雅引导版，7 行）
 *  3. 进入矿洞 → 矿脉旁触屏「交互」→ 是否触发 MINE_TIP_DIALOGUE（夏雅引导版，7 行）
 *
 * 前置：dev server 在 localhost:5173；node probe-guide-dialogue.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  ok ? pass++ : fail++;
};

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

async function pressInteract(page) {
  await page.evaluate(() => {
    const b = document.querySelector('#touch-controls [data-action="interact"]');
    if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  await sleep(400);
}

async function pressBackpack(page) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#touch-controls div')];
    const b = btns.find(x => x.textContent?.trim() === '背包');
    if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  await sleep(400);
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

async function dialogueOpen(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0];
    return s?.storyDialogue?.isOpen?.() ?? false;
  });
}

async function currentDialogueText(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0];
    const el = s?.storyDialogue?.textEl;
    return el ? el.textContent : null;
  });
}

async function run() {
  console.log('=== 引导剧情探针（移动端触屏驱动）===\n');
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

    // 标题 → 跳过开场
    await page.keyboard.press('Enter');
    await sleep(2200);
    await page.evaluate(() => { const b = document.getElementById('intro-skip-btn'); if (b) b.click(); });
    await sleep(800);
    let info = await sceneInfo(page);
    console.log(`1. 车站跳过 → 场景=${info.scene}, 步骤=${info.step}`);

    // 车站 → 大门
    await teleport(page, 'station', 970, 460, 'right');
    await sleep(3200);

    // 夏雅对话
    await teleport(page, 'gate', 248, 200, 'up');
    await pressInteract(page);
    await sleep(800);
    await skipDialogue(page, 13);
    info = await sceneInfo(page);
    console.log(`2. 夏雅拿钥匙 → 步骤=${info.step}${info.step === 'get_key' ? ' ✅' : ' ❌'}`);

    // 背包 → 用钥匙开门
    await pressBackpack(page);
    await page.evaluate(() => { const b = document.querySelector('button[data-action="use-key"]'); if (b) b.click(); });
    await sleep(1200);
    await skipDialogue(page, 9); // GATE_OPENED_DIALOGUE 9 行（E-07 叠加）
    info = await sceneInfo(page);
    console.log(`3. 开门 → 步骤=${info.step}${info.step === 'clear_land' ? ' ✅' : ' ❌'}`);

    // 进入农场
    await teleport(page, 'gate', 240, 40, 'up');
    await sleep(3200);
    info = await sceneInfo(page);
    console.log(`4. 进农场 → 场景=${info.scene}, 步骤=${info.step}`);

    // 锄地/播种/浇水各 3 次
    const tillSpots = [[216, 184], [232, 184], [248, 184]];
    for (const [x, y] of tillSpots) {
      await teleport(page, 'farm', x, y, 'up');
      await pressInteract(page);
    }
    await skipDialogue(page, 7);
    for (const [x, y] of tillSpots) {
      await teleport(page, 'farm', x, y, 'up');
      await pressInteract(page);
    }
    await skipDialogue(page, 7); // WATER_CROPS_DIALOGUE 7 行（E-08）
    for (const [x, y] of tillSpots) {
      await teleport(page, 'farm', x, y, 'up');
      await pressInteract(page);
    }
    await skipDialogue(page, 7); // EVENING_DIALOGUE 7 行
    info = await sceneInfo(page);
    console.log(`5. 锄地播种浇水 → 步骤=${info.step}${info.step === 'evening_talk' ? ' ✅' : ' ❌'}`);

    // 睡觉
    await teleport(page, 'farm', 56, 320, 'up');
    await pressInteract(page);
    await sleep(1500);
    info = await sceneInfo(page);
    check('6. 教程睡觉完成', info.step === 'done', `步骤=${info.step}`);

    // 检查任务面板引导任务
    const panelText = await page.evaluate(() => document.getElementById('daily-quest-panel')?.innerText ?? '');
    console.log(`--- 任务面板内容: ${panelText.replace(/\n/g, ' / ')}`);
    check('7a. 任务面板含砍树引导(woodcut_2/伐木)', /伐木|砍倒 2 棵树/.test(panelText));
    check('7b. 任务面板含挖矿引导(mine_1/初入矿洞)', /初入矿洞|挖矿 1 次/.test(panelText));

    // 靠近树触发砍树引导（使用第一棵树位置 (2,3) → 像素 (40,56)，站 (40,76)）
    await teleport(page, 'farm', 40, 76, 'up');
    await sleep(300);
    await pressInteract(page);
    await sleep(800);
    const woodOpen = await dialogueOpen(page);
    const woodText = await currentDialogueText(page);
    check('8. 靠近树按「使用工具」触发砍树引导对话', woodOpen, woodText ? `当前句:${woodText.slice(0, 30)}` : '');
    if (woodOpen) await skipDialogue(page, 7);

    // 进入矿洞（小镇出口，用 debug 直接切）
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('mine');
    });
    await sleep(2500);
    info = await sceneInfo(page);
    console.log(`9. 进矿洞 → 场景=${info.scene}`);

    // 靠近第一块矿脉 s1 (7,5) → 像素 (120,88)
    const ore = { id: 's1', col: 7, row: 5 };
    await teleport(page, 'mine', ore.col * 16 + 8, ore.row * 16 + 8, 'up');
    await sleep(300);
    await pressInteract(page);
    await sleep(800);
    const mineOpen = await dialogueOpen(page);
    const mineText = await currentDialogueText(page);
    check('10. 矿洞矿脉旁按「交互」触发挖矿引导对话', mineOpen, mineText ? `当前句:${mineText.slice(0, 30)}` : '');
    if (mineOpen) await skipDialogue(page, 7);

    // 不在矿脉旁按交互不应触发挖矿引导（只应尝试挖矿或无事发生）
    await teleport(page, 'mine', 200, 200, 'up');
    await sleep(300);
    await pressInteract(page);
    await sleep(800);
    const farOpen = await dialogueOpen(page);
    check('11. 矿洞非矿脉旁交互不弹引导对话', !farOpen, farOpen ? '意外弹了对话' : '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
