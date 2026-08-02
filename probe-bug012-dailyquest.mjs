/**
 * BUG-012 回归探针：每日任务跨天刷新保留已完成未领奖任务
 *
 * 流程：
 *   Day1: 入档含 water_3（completed=true, claimed=false）+ 1 个未完成任务
 *   睡觉 → 跨天 → Day2
 *   确认 water_3 保留、completed=true、claimed=false、可领奖
 *   确认未完成任务被刷新（非完成任务正常替换）
 *
 * 前置：dev server 在 localhost:5173；node probe-bug012-dailyquest.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('=== BUG-012 回归探针：跨天保留已完成未领奖任务 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1024, height: 768 },
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
    // Step 1: 写 Day1 存档（教程已完成，water_3 completed/claimed=false）
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate(() => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5',
        savedAt: 'BUG-012 探针 Day1',
        timestamp: Date.now(),
        player: {
          x: 96, y: 160, scene: 'farm', facing: 'down',
          inventory: { old_axe: 1, old_hoe: 1, old_watering_can: 1, radish_seed: 5 },
        },
        world: {
          day: 1, hour: 22, minute: 0,
          coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [],
          questState: 'not_started',
          dailyQuest: {
            currentDay: 1,
            quests: [
              { id: 'water_3', progress: 3, completed: true, claimed: false },
              { id: 'plant_2', progress: 0, completed: false, claimed: false },
            ],
          },
        },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done', ch1TownIntroDone: false },
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

    // 等待 farm 场景 + 任务面板（networkidle2 后 Phaser 异步初始化，需额外等待）
    await sleep(2000);
    const panelReady = await page.evaluate(() => !!document.getElementById('daily-quest-panel'));
    check('Day1 任务面板已创建', panelReady);

    // 确认 Day1 面板内容：water_3 已完成可领奖 + plant_2 未完成
    const day1Panel = await page.evaluate(() => {
      const panel = document.getElementById('daily-quest-panel');
      if (!panel) return null;
      const btns = panel.querySelectorAll('.dq-claim');
      const text = panel.textContent || '';
      return {
        claimBtnCount: btns.length,
        text,
        hasWater3: text.includes('浇水 3 次'),
        hasPlant2: text.includes('播种 2 颗'),
      };
    });
    console.log(`Day1 面板: ${JSON.stringify(day1Panel)}`);
    check('Day1 面板含 water_3', day1Panel?.hasWater3 === true);
    check('Day1 面板含 plant_2', day1Panel?.hasPlant2 === true);
    check('Day1 面板有 1 个领奖按钮（water_3）', day1Panel?.claimBtnCount === 1);

    // Step 2: 睡觉 → 跨天（teleport 到农场木屋地板 bed tile (3,19) pixel(56,304) + 按 E）
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (!s?.player) return;
      s.player.x = 56; s.player.y = 304; // tile (3,19) 木屋地板 = bedTiles
    });
    await sleep(300);
    await page.keyboard.press('KeyE');
    await sleep(4000);

    // Step 3: Day2 验证
    const day2Panel = await page.evaluate(() => {
      const panel = document.getElementById('daily-quest-panel');
      if (!panel) return null;
      const btns = panel.querySelectorAll('.dq-claim');
      const text = panel.textContent || '';
      return {
        claimBtnCount: btns.length,
        text,
        hasWater3: text.includes('浇水 3 次'),
        hasPlant2: text.includes('播种 2 颗'),
      };
    });
    console.log(`Day2 面板: ${JSON.stringify(day2Panel)}`);

    // 核心断言
    check('Day2 面板仍含 water_3（已完成未领奖 → 保留）', day2Panel?.hasWater3 === true);
    check('Day2 面板 plant_2 已刷新（未完成任务 → 正常替换）', day2Panel?.hasPlant2 === false);
    check('Day2 面板有领奖按钮（water_3 可领取）', day2Panel?.claimBtnCount >= 1);

    // Step 4: 确认存档中 water_3 状态
    const saveData = await page.evaluate(() => {
      const raw = localStorage.getItem('return_star_save');
      if (!raw) return null;
      const d = JSON.parse(raw);
      return {
        day: d.world?.day,
        storyStep: d.story?.storyStep,
        dailyDay: d.world?.dailyQuest?.currentDay,
        quests: d.world?.dailyQuest?.quests,
      };
    });
    console.log(`存档数据: ${JSON.stringify(saveData)}`);
    check('存档 day=2', saveData?.day === 2);
    check('存档 storyStep=done', saveData?.storyStep === 'done');

    const waterQuest = saveData?.quests?.find(q => q.id === 'water_3');
    if (waterQuest) {
      console.log(`water_3 存档状态: ${JSON.stringify(waterQuest)}`);
      check('water_3 completed=true', waterQuest.completed === true);
      check('water_3 claimed=false', waterQuest.claimed === false);
    } else {
      check('water_3 存在于存档', false, 'water_3 在跨天后丢失');
    }

    // Step 5: 点击领奖按钮，验证可领取
    const claimResult = await page.evaluate(() => {
      const btn = document.querySelector('.dq-claim');
      if (!btn) return 'no-btn';
      const r = btn.getBoundingClientRect();
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
      return 'clicked';
    });
    console.log(`领奖点击: ${claimResult}`);
    await sleep(500);

    const afterClaim = await page.evaluate(() => ({
      panelBtns: document.querySelectorAll('.dq-claim').length,
      // 领奖后 status 变成 ✅（claimed=true），文字仍含"浇水 3 次"但按钮消失
      water3Done: (document.getElementById('daily-quest-panel')?.textContent ?? '').includes('✅ 浇水 3 次'),
    }));
    console.log(`领奖后: ${JSON.stringify(afterClaim)}`);
    check('领奖后面板按钮消失', afterClaim.panelBtns === 0);
    check('领奖后 water_3 显示 ✅（claimed=true）', afterClaim.water3Done === true);

  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
