/**
 * 修复验证探针：横屏手机文案 + 教程提示条残留
 *
 * 验证两个修复：
 *   1. config.isMobileLayout 加入触屏判断 → 横屏手机（width≥800）显示移动文案
 *   2. MapScene.shutdown 清理 DOM → 场景切换后教程提示条不残留
 *
 * 流程：
 *   A. 横屏 852×393 触屏视口 → 标题文案 = "点按屏幕 开始游戏"（横屏也走移动布局）
 *   B. 375×812 触屏 → evening_talk → farm 显示提示条 → 进屋(house) → 提示条已消失
 *
 * 前置：dev server 在 localhost:5173；node probe-fix-mobile-hint.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('=== 修复验证：横屏文案 + 提示条残留 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 852, height: 393, isMobile: true, hasTouch: true },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  let pass = 0, fail = 0;
  const check = (name, ok, extra = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
    ok ? pass++ : fail++;
  };

  try {
    // ===== A. 横屏手机文案 =====
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);

    const titleText = await page.evaluate(() => {
      const scene = window.__game?.scene?.getScene('title');
      return scene?.startPrompt?.text ?? null;
    });
    console.log(`  横屏(852) 标题文案: "${titleText}"`);
    check('横屏手机标题 = "点按屏幕 开始游戏"', titleText === '点按屏幕 开始游戏');

    // ===== B. 提示条残留：farm 提示条 → 进屋 → 提示条消失 =====
    await page.keyboard.press('Enter');
    await sleep(2200);
    await page.evaluate(() => {
      const btn = document.getElementById('intro-skip-btn');
      if (btn) btn.click();
    });
    await sleep(500);
    await page.evaluate(() => window.debug.setStoryStep('evening_talk'));
    await sleep(300);

    // 进入 farm（教程最后一步，会显示"回到屋内床前点交互睡觉"提示条）
    await page.evaluate(() => {
      const g = window.__game;
      const active = g.scene.getScenes(true)[0];
      if (active && active.scene.key !== 'farm') g.scene.stop(active.scene.key);
      g.scene.start('farm', { spawn: { x: 400, y: 300 } });
    });
    await sleep(2600);

    const hintInFarm = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return { exists: !!s?.tutorialHint, text: s?.tutorialHint?.textContent ?? null };
    });
    console.log(`  farm 提示条: ${JSON.stringify(hintInFarm)}`);
    check('farm 显示教程提示条', hintInFarm.exists === true);
    check('farm 提示条为移动文案（点「交互」）', (hintInFarm.text ?? '').includes('点「交互」'));

    // 进屋（farm → house 场景切换）
    await page.evaluate(() => {
      const g = window.__game;
      g.scene.start('house', { spawn: { x: 40, y: 72 } });
    });
    await sleep(2600);

    const domHintAfter = await page.evaluate(() => {
      const body = document.body.textContent ?? '';
      return {
        hintInHouse: window.__game.scene.getScene('house')?.tutorialHint ?? null,
        bodyHasSleepHint: body.includes('睡觉，结束第一天'),
      };
    });
    console.log(`  进屋后: house.tutorialHint=${domHintAfter.hintInHouse ? '存在' : 'null'} body残留=${domHintAfter.bodyHasSleepHint}`);
    check('切到 house 后提示条 DOM 已清理（body 无残留）', domHintAfter.bodyHasSleepHint === false);
    check('house 实例无教程提示条', domHintAfter.hintInHouse === null);
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
