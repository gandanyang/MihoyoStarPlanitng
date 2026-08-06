/**
 * 标题画面「清除存档」按钮探针（真机测试辅助）
 *
 * 验证：
 *   1. 有存档时按钮出现（#clear-save-btn）
 *   2. 点击按钮 → 存档被清除（localStorage 无 return_star_save）
 *   3. 点击按钮不会误触发 startGame（场景停留在 title）
 *   4. reload 后按钮消失（无存档）
 *
 * 前置：dev server 在 localhost:5173；node probe-clear-save.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('=== 标题画面清除存档按钮验证 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  let pass = 0;
  let fail = 0;
  const check = (name, ok) => {
    console.log(`${ok ? '✅' : '❌'} ${name}`);
    ok ? pass++ : fail++;
  };

  try {
    // 0. 打开并写入假存档
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(2000);
    await page.evaluate(() => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: '测试档',
        player: { x: 1, y: 2, scene: 'farm', facing: 'up', inventory: {} },
        world: {}, farm: {}, story: {},
      }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);

    // 1. 按钮出现
    const btnVisible = await page.evaluate(() => {
      const b = document.getElementById('clear-save-btn');
      return !!b && b.style.display !== 'none';
    });
    check('有存档时按钮出现', btnVisible);

    // 2. 点击按钮前场景 = title
    const sceneBefore = await page.evaluate(() => window.__game.scene.getScenes(true).map(s => s.scene.key));
    check(`点击前场景=${sceneBefore[0]}` , sceneBefore[0] === 'title');

    // 3. 第一次点击（仅进入确认态，不删除）
    await page.evaluate(() => {
      const b = document.getElementById('clear-save-btn');
      if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await sleep(200);
    const stillThere = await page.evaluate(() => localStorage.getItem('return_star_save') !== null);
    check('第一次点击不删除（二次确认生效）', stillThere);

    // 4. 第二次点击（触发 deleteSave + reload）
    await page.evaluate(() => {
      const b = document.getElementById('clear-save-btn');
      if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    // 5. 等待 reload 完成后：存档被清除 + 按钮消失 + 场景=title
    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    await sleep(2500);
    const cleared = await page.evaluate(() => localStorage.getItem('return_star_save') === null);
    check('点击后存档被清除', cleared);
    const btnGone = await page.evaluate(() => !document.getElementById('clear-save-btn'));
    check('reload 后按钮消失（无存档）', btnGone);
    const sceneAfter = await page.evaluate(() => window.__game.scene.getScenes(true).map(s => s.scene.key));
    check(`reload 后场景=${sceneAfter[0]}（未误入游戏）`, sceneAfter[0] === 'title');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
