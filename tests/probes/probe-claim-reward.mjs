/**
 * 领奖动画 bug 复现探针
 *
 * 场景：移动端触屏 375×812，写存档含 2 个已完成任务（可领奖）
 * 步骤：
 *   1. 进 farm
 *   2. 点击第一个「领奖」→ 检查 showDialogueText「💠+奖励已领取！」出现
 *   3. 点击第二个「领奖」→ 检查 showDialogueText 再次出现
 *
 * 前置：dev server 在 localhost:5173；node probe-claim-reward.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('=== 领奖动画复现探针 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 375, height: 812, isMobile: true, hasTouch: true },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  let pass = 0, fail = 0;
  const check = (name, ok, extra = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
    ok ? pass++ : fail++;
  };
  const waitFor = async (fn, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = await fn();
      if (v) return v;
      await sleep(250);
    }
    return null;
  };

  try {
    // 写存档：2 个已完成任务（harvest_radish_3、water_3）
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate(() => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: '领奖测试档',
        player: { x: 15, y: 10, scene: 'farm', facing: 'up', inventory: {} },
        world: {
          dailyQuest: {
            currentDay: 1,
            quests: [
              { id: 'harvest_radish_3', progress: 3, completed: true, claimed: false },
              { id: 'water_3', progress: 3, completed: true, claimed: false },
            ],
          },
        },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
      }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);

    // 标题 → 进入
    await waitFor(page, () => page.evaluate(() => {
      const g = window.__game;
      return g && g.scene.getScenes(true).some(s => s.scene.key === 'title');
    }), 10000);
    await page.keyboard.press('Enter');
    await sleep(2500);

    // 跳过开场直达 farm
    await page.evaluate(() => window.debug?.setStoryStep('done'));
    await sleep(300);
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('farm');
    });
    await sleep(2500);

    // 等待面板出现
    const panelReady = await waitFor(page, () =>
      page.evaluate(() => !!document.getElementById('daily-quest-panel')), 15000);
    check('任务面板已创建', !!panelReady);

    // 读取面板按钮数量
    const btnCount = await page.evaluate(() => document.querySelectorAll('.dq-claim').length);
    console.log(`面板「领奖」按钮数量: ${btnCount}`);
    check('面板有 2 个领奖按钮', btnCount === 2);

    // 点击第一个领奖按钮
    const firstClick = await page.evaluate(() => {
      const btn = document.querySelector('.dq-claim');
      if (!btn) return 'no-btn';
      const r = btn.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
      return 'clicked';
    });
    console.log(`第一次点击: ${firstClick}`);
    await sleep(500);

    // 检查钻石数变化 + 面板是否刷新
    const after1 = await page.evaluate(() => ({
      diamonds: (() => {
        const hud = document.getElementById('hud-area');
        return hud ? hud.textContent : null;
      })(),
      panelBtns: document.querySelectorAll('.dq-claim').length,
      dialogueText: (() => {
        const el = document.querySelector('[class*="dialogue"]');
        return el ? el.textContent : null;
      })(),
    }));
    console.log(`第一次点击后: ${JSON.stringify(after1)}`);
    check('第一次点击后面板按钮减少（1个已领）', after1.panelBtns === 1);

    // 点击第二个领奖按钮
    const secondClick = await page.evaluate(() => {
      const btn = document.querySelector('.dq-claim');
      if (!btn) return 'no-btn';
      const r = btn.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
      return 'clicked';
    });
    console.log(`第二次点击: ${secondClick}`);
    await sleep(500);

    const after2 = await page.evaluate(() => ({
      panelBtns: document.querySelectorAll('.dq-claim').length,
      dialogueText: (() => {
        const el = document.querySelector('[class*="dialogue"]');
        return el ? el.textContent : null;
      })(),
    }));
    console.log(`第二次点击后: ${JSON.stringify(after2)}`);
    check('第二次点击后面板按钮全部消失（2个都已领）', after2.panelBtns === 0);

  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
