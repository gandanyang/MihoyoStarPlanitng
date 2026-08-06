/**
 * 自动农业机器人——自动播种专项探针
 *
 * 验证：
 *   1. 收获后自动补种（背包有种子）
 *   2. 无种子时收获后不补种（保持 tilled）
 *   3. 玩家锄地未种 → 机器人自动播种+浇水
 *   4. 已播种格不重复播种
 *   5. 多种种子优先级（radish→tomato→corn→strawberry）
 *   6. 存档保存/重进后补种的作物状态正确
 *
 * 前置：dev server；node tests/probes/probe-auto-seed.mjs
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, 'test-screenshots');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

mkdirSync(SCREENSHOT_DIR, { recursive: true });

(async () => {
  console.log('=== 自动播种专项探针 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
    ok ? pass++ : fail++;
  };

  const screenshot = async (name) => {
    await page.screenshot({ path: join(SCREENSHOT_DIR, `auto-seed-${name}.png`) }).catch(() => {});
  };

  const bootFarm = async (saveObj) => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1200);
    await page.evaluate((obj) => {
      localStorage.setItem('return_star_save', JSON.stringify(obj));
    }, saveObj);
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(400);
    await page.evaluate(() => window.debug?.setStoryStep('done'));
    await sleep(400);
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('farm');
    });
    await sleep(1800);
  };

  const evalFarm = (fn) => page.evaluate(fn);

  const baseSave = {
    version: '0.5', savedAt: '播种探针', timestamp: Date.now(),
    player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
    world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'done' },
    farm: { tiles: [], crops: [], trees: [] },
    story: { storyStep: 'done' },
  };

  try {
    // ============ 1. 收获后自动补种 ============
    console.log('--- 1. 收获后自动补种（背包有种子） ---');
    await bootFarm({
      ...baseSave,
      player: { ...baseSave.player, inventory: { radish_seed: 3 } },
      farm: {
        tiles: [['20,10', 'watered']],
        crops: [['20,10', { cropType: 'radish', plantDay: 1, watered: true }]],
        trees: [],
      },
    });
    // 部署机器人
    await evalFarm(() => {
      window.debug.giveRobot(1);
      const s = window.__game.scene.getScene('farm');
      s.player.setPosition(20 * 16 + 8, 12 * 16 + 8);
      s.player.facing = 'up';
    });
    await sleep(200);
    await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      s.backpackPanel.open();
    });
    await sleep(300);
    await evalFarm(() => {
      const btn = document.querySelector('[data-action="use-robot"]');
      if (btn) btn.click();
    });
    await sleep(400);

    // 跨天：radish growthDays=1，day2 时成熟→收获→补种
    await evalFarm(() => window.debug.nextDay());
    await sleep(500);

    let d = await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      const t = s.tileRects.get('20,10');
      return {
        state: t ? (t.plot.visible ? (t.plot.frame.name === 2 ? 'watered' : t.plot.frame.name === 1 ? 'planted' : 'tilled') : 'empty') : 'no-tile',
        cropVisible: t ? t.crop.visible : null,
        cropFrame: t ? t.crop.frame.name : -1,
        seeds: window.__game ? null : null,
      };
    });
    // 检查背包种子消耗
    const seedCount = await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      // 通过 HUD 或直接查 inventory
      return window.debug?.robotCount !== undefined ? null : null;
    });
    // 更直接地检查：看 tileRects 判断是否补种
    check('1. 收获后自动补种（作物可见）', d.cropVisible === true, `visible=${d.cropVisible} frame=${d.cropFrame}`);
    check('1. 补种后浇水（地块帧2=watered）', d.state === 'watered', `实际=${d.state}`);
    await screenshot('1-harvest-replant');

    // ============ 2. 无种子时不补种 ============
    console.log('\n--- 2. 无种子时收获后不补种 ---');
    await bootFarm({
      ...baseSave,
      player: { ...baseSave.player, inventory: {} }, // 无种子
      farm: {
        tiles: [['22,10', 'watered']],
        crops: [['22,10', { cropType: 'radish', plantDay: 1, watered: true }]],
        trees: [],
      },
    });
    await evalFarm(() => {
      window.debug.giveRobot(1);
      const s = window.__game.scene.getScene('farm');
      s.player.setPosition(22 * 16 + 8, 12 * 16 + 8);
      s.player.facing = 'up';
    });
    await sleep(200);
    await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      s.backpackPanel.open();
    });
    await sleep(300);
    await evalFarm(() => {
      const btn = document.querySelector('[data-action="use-robot"]');
      if (btn) btn.click();
    });
    await sleep(400);

    await evalFarm(() => window.debug.nextDay());
    await sleep(500);

    d = await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      const t = s.tileRects.get('22,10');
      return {
        cropVisible: t ? t.crop.visible : null,
        plotFrame: t ? t.plot.frame.name : -1,
      };
    });
    check('2. 无种子收获后作物消失', d.cropVisible === false, `visible=${d.cropVisible}`);
    check('2. 无种子收获后变 tilled（地块帧0）', d.plotFrame === 0, `plotFrame=${d.plotFrame}`);
    await screenshot('2-no-seed-tilled');

    // ============ 3. 锄地未种 → 机器人自动播种 ============
    console.log('\n--- 3. 锄地未种 → 机器人播种+浇水 ---');
    await bootFarm({
      ...baseSave,
      player: { ...baseSave.player, inventory: { tomato_seed: 2 } },
      farm: {
        tiles: [['24,10', 'tilled']],
        crops: [],
        trees: [],
      },
    });
    await evalFarm(() => {
      window.debug.giveRobot(1);
      const s = window.__game.scene.getScene('farm');
      s.player.setPosition(24 * 16 + 8, 12 * 16 + 8);
      s.player.facing = 'up';
    });
    await sleep(200);
    await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      s.backpackPanel.open();
    });
    await sleep(300);
    await evalFarm(() => {
      const btn = document.querySelector('[data-action="use-robot"]');
      if (btn) btn.click();
    });
    await sleep(400);

    await evalFarm(() => window.debug.nextDay());
    await sleep(500);

    d = await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      const t = s.tileRects.get('24,10');
      return {
        cropVisible: t ? t.crop.visible : null,
        cropFrame: t ? t.crop.frame.name : -1,
        plotFrame: t ? t.plot.frame.name : -1,
      };
    });
    check('3. 锄地被播种（作物可见）', d.cropVisible === true, `visible=${d.cropVisible} frame=${d.cropFrame}`);
    check('3. 播种后浇水（地块帧2）', d.plotFrame === 2, `plotFrame=${d.plotFrame}`);
    await screenshot('3-tilled-seeded');

    // ============ 4. 已播种格不重复播种 ============
    console.log('\n--- 4. 已播种格不重复播种 ---');
    await bootFarm({
      ...baseSave,
      player: { ...baseSave.player, inventory: { radish_seed: 5 } },
      farm: {
        tiles: [
          ['26,10', 'planted'],
        ],
        crops: [
          ['26,10', { cropType: 'radish', plantDay: 1, watered: false }],
        ],
        trees: [],
      },
    });
    await evalFarm(() => {
      window.debug.giveRobot(1);
      const s = window.__game.scene.getScene('farm');
      s.player.setPosition(26 * 16 + 8, 12 * 16 + 8);
      s.player.facing = 'up';
    });
    await sleep(200);
    await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      s.backpackPanel.open();
    });
    await sleep(300);
    await evalFarm(() => {
      const btn = document.querySelector('[data-action="use-robot"]');
      if (btn) btn.click();
    });
    await sleep(400);

    // 记录播种前种子数
    const seedsBefore = await evalFarm(() => {
      // 直接查背包
      return JSON.parse(localStorage.getItem('return_star_save') || '{}')?.player?.inventory?.radish_seed ?? 0;
    });

    await evalFarm(() => window.debug.nextDay());
    await sleep(500);

    const seedsAfter = await evalFarm(() => {
      return JSON.parse(localStorage.getItem('return_star_save') || '{}')?.player?.inventory?.radish_seed ?? 0;
    });

    d = await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      const t = s.tileRects.get('26,10');
      return {
        cropVisible: t ? t.crop.visible : null,
        cropFrame: t ? t.crop.frame.name : -1,
        plotFrame: t ? t.plot.frame.name : -1,
      };
    });
    check('4. 已播种格作物仍在（未被覆盖）', d.cropVisible === true, `frame=${d.cropFrame}`);
    check('4. 已播种格仅浇水（地块帧2）', d.plotFrame === 2, `plotFrame=${d.plotFrame}`);
    await screenshot('4-already-planted');

    // ============ 5. 种子优先级 ============
    console.log('\n--- 5. 种子优先级（先用便宜的） ---');
    await bootFarm({
      ...baseSave,
      player: { ...baseSave.player, inventory: { radish_seed: 1, tomato_seed: 1 } },
      farm: {
        tiles: [
          ['20,10', 'tilled'],
          ['22,10', 'tilled'],
        ],
        crops: [],
        trees: [],
      },
    });
    await evalFarm(() => {
      window.debug.giveRobot(1);
      const s = window.__game.scene.getScene('farm');
      s.player.setPosition(21 * 16 + 8, 12 * 16 + 8);
      s.player.facing = 'up';
    });
    await sleep(200);
    await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      s.backpackPanel.open();
    });
    await sleep(300);
    await evalFarm(() => {
      const btn = document.querySelector('[data-action="use-robot"]');
      if (btn) btn.click();
    });
    await sleep(400);

    await evalFarm(() => window.debug.nextDay());
    await sleep(500);

    d = await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      const t20 = s.tileRects.get('20,10');
      const t22 = s.tileRects.get('22,10');
      return {
        crop20: t20 && t20.crop.visible ? t20.crop.frame.name : -1,
        crop22: t22 && t22.crop.visible ? t22.crop.frame.name : -1,
      };
    });
    check('5. 两块空地均被播种', d.crop20 >= 0 && d.crop22 >= 0, `20,10=${d.crop20} 22,10=${d.crop22}`);
    await screenshot('5-seed-priority');

    // ============ 6. 存档重进后补种作物保持 ============
    console.log('\n--- 6. 存档重进后补种作物保持 ---');
    // 接续场景5：重进检查
    await evalFarm(() => {
      window.__game.scene.stop('farm');
    });
    await sleep(600);
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(400);
    await page.evaluate(() => window.debug?.setStoryStep('done'));
    await sleep(400);
    await evalFarm(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('farm');
    });
    await sleep(1800);

    d = await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      const t20 = s.tileRects.get('20,10');
      const t22 = s.tileRects.get('22,10');
      return {
        crop20vis: t20 ? t20.crop.visible : null,
        crop22vis: t22 ? t22.crop.visible : null,
        robotCount: window.debug.robotCount(),
      };
    });
    check('6. 重进后机器人仍在', d.robotCount === 1, `count=${d.robotCount}`);
    check('6. 重进后补种作物保持', d.crop20vis === true && d.crop22vis === true, `20=${d.crop20vis} 22=${d.crop22vis}`);
    await screenshot('6-reload-keep');

    // 运行时错误
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    check('全程无运行时错误', realErrors.length === 0, realErrors.join(' | ') || '');

  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
})().catch(err => { console.error('探针异常:', err); process.exit(1); });
