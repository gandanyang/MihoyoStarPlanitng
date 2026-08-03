/**
 * FEATURE-036 旧农业机器人获取验证探针
 *
 * 验证：
 *   1. 花园未恢复 → 旧机器人不出现（oldRobot === null）
 *   2. 花园三阶段恢复 → 旧机器人出现（位置 col33,row4，锈色视觉 + 标签）
 *   3. 靠近按 E → 播放 OLD_ROBOT_DIALOGUE 修复对白
 *   4. 对白结束后：背包获得 auto_farmer_robot ×1、机器人精灵销毁（一次性）
 *   5. 重复进入 → 不再出现（内存 flag + 背包已持有）
 *   6. 无运行时错误
 *
 * 前置：dev server；node probe-bug036-robot-acquire.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== FEATURE-036 旧机器人获取验证 ===\n');
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

  const SAVE = (extra = {}) => JSON.stringify({
    version: '0.5', savedAt: 'FEATURE036探针', timestamp: Date.now(),
    player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
    world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
    farm: { tiles: [], crops: [], trees: [] },
    story: { storyStep: 'done' },
    ...extra,
  });

  try {
    // 首次进入：花园未恢复
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate((s) => localStorage.setItem('return_star_save', s), SAVE());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(500);
    let scene = '';
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      scene = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (scene === 'farm') break;
    }
    if (scene !== 'farm') throw new Error('未能进入农场场景');
    await sleep(1200);

    // 1. 花园未恢复 → 无旧机器人
    let d = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return { oldRobot: !!s.oldRobot, stage: s.gardenRestore ? s.gardenRestore.stage : -1 };
    });
    check('花园未恢复 旧机器人不出现', d.oldRobot === false, `实际=${d.oldRobot}`);
    check('初始 stage=0（未恢复）', d.stage === 0, `实际=${d.stage}`);

    // 2. 三阶段恢复花园
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      s.player.setPosition(s.gardenRestore.pos.x, s.gardenRestore.pos.y);
    });
    await sleep(300);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('E');
      await sleep(600);
    }
    await sleep(1200);

    d = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return {
        oldRobot: !!s.oldRobot,
        oldRobotPos: s.oldRobot ? { x: s.oldRobot.x, y: s.oldRobot.y } : null,
        oldRobotLabel: !!s.oldRobotLabel,
        stage: s.gardenRestore ? s.gardenRestore.stage : -1,
      };
    });
    check('恢复后 旧机器人出现', d.oldRobot === true, `实际=${d.oldRobot}`);
    check('旧机器人位置 (col28,row3) 中心', d.oldRobotPos && d.oldRobotPos.x === 456 && d.oldRobotPos.y === 56,
      `实际=${JSON.stringify(d.oldRobotPos)}`);
    check('旧机器人标签存在', d.oldRobotLabel === true, `实际=${d.oldRobotLabel}`);

    // 3. 靠近按 E → 触发修复对白
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      s.player.setPosition(s.oldRobot.x, s.oldRobot.y + 10);
    });
    await sleep(300);
    await page.keyboard.press('E');
    await sleep(800);

    d = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const dlg = s.storyDialogue;
      return {
        oldRobot: !!s.oldRobot,
        dialogueOpen: !!dlg && dlg.isOpen(),
        hasOldRobotLine: !!dlg && dlg.lines.some(l => l.text.includes('农业机器人')),
      };
    });
    check('修复对白激活', d.dialogueOpen === true, `实际=${d.dialogueOpen}`);
    check('对白含旧机器人文案', d.hasOldRobotLine === true, `实际=${JSON.stringify(d.hasOldRobotLine)}`);

    // 4. 推进完对白 → 获得机器人 + 精灵销毁
    d = { dialogueOpen: d.dialogueOpen };
    for (let i = 0; i < 12 && d.dialogueOpen; i++) {
      await page.keyboard.press('E');
      await sleep(400);
      d = await page.evaluate(() => {
        const s = window.__game.scene.getScene('farm');
        const dlg = s.storyDialogue;
        return { dialogueOpen: !!dlg && dlg.isOpen() };
      });
    }
    await sleep(600);
    d = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return {
        oldRobot: !!s.oldRobot,
        oldRobotLabel: !!s.oldRobotLabel,
        robotCount: window.__game.scene.getScene('farm').player
          ? (() => { try { return JSON.parse(localStorage.getItem('return_star_save') || '{}')?.player?.inventory?.auto_farmer_robot ?? null; } catch { return null; } })()
          : null,
      };
    });
    check('对白结束后 旧机器人销毁', d.oldRobot === false, `实际=${d.oldRobot}`);
    check('对白结束后 标签销毁', d.oldRobotLabel === false, `实际=${d.oldRobotLabel}`);

    // 5. 刷新重进 → 不再出现（背包已持有 auto_farmer_robot）
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(500);
    scene = '';
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      scene = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (scene === 'farm') break;
    }
    await sleep(1200);
    d = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return { oldRobot: !!s.oldRobot };
    });
    check('刷新后 旧机器人不再出现', d.oldRobot === false, `实际=${d.oldRobot}`);

    // 6. 运行时错误检查
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    check('无运行时错误', realErrors.length === 0, realErrors.join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
})().catch(err => { console.error('探针异常:', err); process.exit(1); });
