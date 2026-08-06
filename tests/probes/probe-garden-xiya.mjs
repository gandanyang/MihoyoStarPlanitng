/**
 * M1-3 夏雅见证对白验证探针（Q4）
 *
 * 验证：
 *   1. 恢复前：花园旁无夏雅精灵（gardenXiya === null）
 *   2. 三阶段恢复完成 → 夏雅在花园旁出现（gardenXiya 存在、位置 col33,row6）
 *   3. 靠近按 E → 触发 GARDEN_RESTORED_XIYA_DIALOGUE（对白文本为制作人确认版"生活记忆型"）
 *   4. 触发后精灵销毁（一次性）
 *   5. 无运行时错误
 *
 * 前置：dev server；node probe-garden-xiya.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== M1-3 夏雅见证对白验证 ===\n');
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

  try {
    // 进入农场（教程完成存档，未恢复花园）
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate(() => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'M1-3夏雅见证探针', timestamp: Date.now(),
        player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
        world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
      }));
    });
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

    // 1. 恢复前：无夏雅精灵
    let d = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return {
        gardenXiya: s.gardenXiya,
        stage: s.gardenRestore ? s.gardenRestore.stage : -1,
      };
    });
    check('恢复前 花园旁无夏雅精灵', d.gardenXiya === null || d.gardenXiya === undefined, `实际=${d.gardenXiya}`);
    check('初始 stage=0（未恢复）', d.stage === 0, `实际=${d.stage}`);

    // 2. 三阶段恢复 → 夏雅出现
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const p = s.gardenRestore.pos;
      s.player.setPosition(p.x, p.y);
    });
    await sleep(300);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('E');
      await sleep(600);
    }
    await sleep(1600);

    d = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return {
        gardenXiya: !!s.gardenXiya,
        gardenXiyaPos: s.gardenXiya ? { x: s.gardenXiya.x, y: s.gardenXiya.y } : null,
        gardenXiyaLabel: !!s.gardenXiyaLabel,
        stage: s.gardenRestore ? s.gardenRestore.stage : -1,
      };
    });
    check('恢复后 夏雅在花园旁出现', d.gardenXiya === true, `实际=${d.gardenXiya}`);
    check('夏雅位置 (col33,row6) 中心', d.gardenXiyaPos && d.gardenXiyaPos.x === 536 && d.gardenXiyaPos.y === 104,
      `实际=${JSON.stringify(d.gardenXiyaPos)}`);
    check('夏雅标签存在', d.gardenXiyaLabel === true, `实际=${d.gardenXiyaLabel}`);

    // 3. 靠近按 E → 触发对白
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      s.player.setPosition(s.gardenXiya.x, s.gardenXiya.y + 10);
    });
    await sleep(300);
    await page.keyboard.press('E');
    await sleep(800);

    d = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const dlg = s.storyDialogue;
      return {
        gardenXiya: !!s.gardenXiya,
        dialogueOpen: !!dlg && dlg.isOpen(),
        currentIndex: dlg ? dlg.index : -1,
        total: dlg ? dlg.lines.length : 0,
        hasMemoryLine: !!dlg && dlg.lines.some(l => l.speaker === '夏雅' && l.text.includes('小时候我经常看到他坐在这里')),
      };
    });
    check('对白激活', d.dialogueOpen === true, `实际=${d.dialogueOpen}`);
    check('对白含生活记忆文案', d.hasMemoryLine === true, `实际=${JSON.stringify(d.hasMemoryLine)}`);

    // 4. 推进完对白 → 精灵销毁（一次性）
    for (let i = 0; i < 12 && d.dialogueOpen; i++) {
      await page.keyboard.press('E');
      await sleep(400);
      d = await page.evaluate(() => {
        const s = window.__game.scene.getScene('farm');
        const dlg = s.storyDialogue;
        return {
          dialogueOpen: !!dlg && dlg.isOpen(),
          currentIndex: dlg ? dlg.index : -1,
          total: dlg ? dlg.lines.length : 0,
        };
      });
    }
    d = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return { gardenXiya: !!s.gardenXiya, gardenXiyaLabel: !!s.gardenXiyaLabel };
    });
    check('对白结束后 夏雅精灵销毁', d.gardenXiya === false, `实际=${d.gardenXiya}`);
    check('对白结束后 标签销毁', d.gardenXiyaLabel === false, `实际=${d.gardenXiyaLabel}`);

    // 5. 运行时错误检查
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    check('无运行时错误', realErrors.length === 0, realErrors.join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
})().catch(err => { console.error('探针异常:', err); process.exit(1); });
