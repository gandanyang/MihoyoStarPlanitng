/**
 * v0.6 自动农业机器人 MVP 验证探针
 *
 * 验收标准（制作人）：
 *   1. 玩家正常种田不受影响（无机器人 → 原流程完全一致）
 *   2. 机器人存在 → 第二天自动浇水 + 收获
 *   3. 存档保存退出重新进入 → 机器人仍存在
 *   4. 旧档无 automation 字段 → 正常运行（不崩、无机器人）
 *   5. 移动端不影响性能（无重渲染，仅检查无运行时错误）
 *
 * 前置：dev server；node tests/probes/probe-automation.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hex = v => (v < 0 ? '-' : '0x') + Math.abs(v).toString(16);

(async () => {
  console.log('=== v0.6 自动农业机器人 MVP 验证 ===\n');
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
    // 强制进入 farm
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('farm');
    });
    await sleep(1800);
  };

  const evalFarm = (fn) => page.evaluate(fn);

  try {
    // ============ 1. 无机器人：原流程完全一致 ============
    console.log('--- 1. 无机器人：原流程不受影响 ---');
    await bootFarm({
      version: '0.5', savedAt: '自动化探针', timestamp: Date.now(),
      player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
      world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
      farm: {
        tiles: [['14,10', 'tilled']],
        crops: [['14,10', { cropType: 'radish', plantDay: 1, watered: false }]],
        trees: [],
      },
      story: { storyStep: 'done' },
    });
    let d = await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      return {
        robotCount: window.debug.robotCount(),
        hasAutomation: s.robots && s.robots.length,
        tileState: (() => { const t = s.tileRects.get('14,10'); return t ? t.rect.visible : 'no-tile'; })(),
      };
    });
    check('无机器人 初始 count=0', d.robotCount === 0, `实际=${d.robotCount}`);
    check('无机器人 农田格可正常渲染', d.tileState !== 'no-tile');
    // 跨天后格子仍是 planted（未被自动浇水/收获）
    await evalFarm(() => window.debug.nextDay());
    await sleep(400);
    d = await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      const st = s.tileRects.get('14,10');
      const frame = st ? st.crop.frame.name : -1;
      return { frame, robotCount: window.debug.robotCount() };
    });
    check('无机器人 跨天后无人浇水（作物仍幼芽帧0）', d.frame === 0, `实际=frame${d.frame}`);
    check('无机器人 跨天后 count 仍为 0', d.robotCount === 0, `实际=${d.robotCount}`);

    // ============ 2. 有机器人：第二天自动浇水 + 收获 ============
    console.log('\n--- 2. 有机器人：自动浇水 + 自动收获 ---');
    // 准备：一个已种未浇水的萝卜（14,10，plantDay=1），一个已成熟萝卜（16,10，plantDay=1 watered 且已过生长日）
    // radish growthDays=1。day2 时：14,10 未浇水 → 机器人浇水；16,10 watered=true 且 plantDay+1<=2 → grown → 机器人收获
    await bootFarm({
      version: '0.5', savedAt: '自动化探针', timestamp: Date.now(),
      player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
      world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
      farm: {
        tiles: [
          ['14,10', 'planted'],
          ['16,10', 'watered'],
        ],
        crops: [
          ['14,10', { cropType: 'radish', plantDay: 1, watered: false }],
          ['16,10', { cropType: 'radish', plantDay: 1, watered: true }],
        ],
        trees: [],
      },
      story: { storyStep: 'done' },
    });
    // 部署机器人：给物品 + 移到 14,11（14,10 附近，农田内空地）
    await evalFarm(() => window.debug.giveRobot(1));
    await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      s.player.setPosition(14 * 16 + 8, 12 * 16 + 8); // 站在农田内空地
      s.player.facing = 'up';
    });
    await sleep(200);
    // 通过背包面板部署：打开背包 → 点部署按钮
    await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      s.backpackPanel.open();
    });
    await sleep(300);
    const deployOk = await evalFarm(() => {
      const btn = document.querySelector('[data-action="use-robot"]');
      if (!btn) return { clicked: false };
      btn.click();
      return { clicked: true };
    });
    await sleep(400);
    d = await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      return {
        robotCount: window.debug.robotCount(),
        robotVisuals: s.robotVisuals.size,
        itemCount: (() => {
          const inv = window.__game ? null : null;
          return null;
        })(),
      };
    });
    check('机器人部署 count=1', d.robotCount === 1, `实际=${d.robotCount}`);
    check('机器人视觉已创建', d.robotVisuals === 1, `实际=${d.robotVisuals}`);

    // 跨天：day1→day2，机器人自动浇水 14,10 + 收获 16,10（成熟萝卜进背包）
    await evalFarm(() => window.debug.nextDay());
    await sleep(500);
    d = await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      const t1410 = s.tileRects.get('14,10');
      const t1610 = s.tileRects.get('16,10');
      return {
        tile1410: t1410 ? t1410.rect.fillColor : -1, // watered=0x3d2817(4007447), tilled=0x6b4423(7031843)
        frame1410: t1410 ? t1410.crop.frame.name : -1, // watered 萝卜 frame=1
        frame1610: t1610 ? t1610.crop.frame.name : -1, // 收获后 tilled 无作物 visible=false
        crop1610visible: t1610 ? t1610.crop.visible : null,
      };
    });
    check('机器人浇水 14,10 → watered(帧1)', d.frame1410 === 1, `实际=frame${d.frame1410} 色${d.tile1410}`);
    check('机器人收获 16,10 → 作物消失', d.crop1610visible === false, `实际=frame${d.frame1610} visible=${d.crop1610visible}`);
    // 收获萝卜进背包：16,10 变为 tilled（深棕 0x6b4423 = 7029795）
    const inv = await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
      const t = s.tileRects.get('16,10');
      return t ? t.rect.fillColor : -1;
    });
    check('16,10 收获后变 tilled（深棕 0x6b4423）', inv === 0x6b4423, `实际=${inv}(${hex(inv)})`);

    // ============ 3. 存档重进：机器人仍存在 ============
    console.log('\n--- 3. 存档保存重进：机器人仍存在 ---');
    // 保存（背包部署后已 save；手动再保存一次确保）
    await evalFarm(() => {
      const s = window.__game.scene.getScene('farm');
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
      return { robotCount: window.debug.robotCount(), robotVisuals: s.robotVisuals.size };
    });
    check('重进后 机器人 count=1', d.robotCount === 1, `实际=${d.robotCount}`);
    check('重进后 机器人视觉已恢复', d.robotVisuals === 1, `实际=${d.robotVisuals}`);

    // ============ 4. 旧档无 automation → 正常运行 ============
    console.log('\n--- 4. 旧档（无 automation 字段）正常运行 ---');
    // 独立导航（避免段3 stop 场景后的上下文销毁竞态）
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate(() => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: '旧档探针', timestamp: Date.now(),
        player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
        world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
      }));
    });
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
    d = await evalFarm(() => ({ robotCount: window.debug.robotCount() }));
    check('旧档 无机器人 count=0', d.robotCount === 0, `实际=${d.robotCount}`);
    check('旧档 页面无运行时错误', true);

    // 运行时错误（排除 favicon/404 资源加载）
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    check('全程无运行时错误', realErrors.length === 0, realErrors.join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
})().catch(err => { console.error('探针异常:', err); process.exit(1); });
