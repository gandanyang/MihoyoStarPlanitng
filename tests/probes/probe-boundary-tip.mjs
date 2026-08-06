/**
 * P1 未开放区域探索提示探针（MapScene.updateBoundaryTip）
 *
 * 验证：
 *   1. 农场左/右/底/顶（非出口方向）边缘 → 出现边界提示（dialogueText = 前面的区域，以后再来探索吧！）
 *   2. 离开边界带回内部 → flag 重置，再次靠近可再提示
 *   3. 出口触发区（farm 顶→forest）→ 不提示，正常切场景
 *   4. 教程期（isTutorialDone=false）→ 不提示
 *   5. 室内 house → 不提示（mapKey 守卫；gate 走同一守卫）
 *   6. 无运行时错误
 *
 * 前置：dev server localhost:5173；node tests/probes/probe-boundary-tip.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const TIP_TEXT = '前面的区域，以后再来探索吧！';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== P1 未开放区域边界提示验证 ===\n');
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

  const farmState = () => page.evaluate(() => {
    const s = window.__game?.scene.getScene('farm');
    if (!s || !s.player) return null;
    const b = s.physics.world.bounds;
    return {
      scene: s.scene.key,
      x: s.player.x, y: s.player.y,
      bounds: { x: b.x, y: b.y, right: b.right, bottom: b.bottom },
      tip: s.dialogueText ? s.dialogueText.text : null,
      tipShown: s.boundaryTipShown,
    };
  });
  const setPos = (x, y) => page.evaluate((px, py) => {
    const s = window.__game.scene.getScene('farm');
    if (s && s.player) s.player.setPosition(px, py);
  }, x, y);
  const clearTip = () => page.evaluate(() => {
    const s = window.__game.scene.getScene('farm');
    if (s && s.dialogueText) { s.dialogueText.destroy(); s.dialogueText = null; }
  });
  const waitTip = async (x, y) => {
    await setPos(x, y);
    await sleep(200);
    return farmState();
  };

  try {
    // 进入农场（教程完成存档）
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate(() => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'P1边界提示探针', timestamp: Date.now(),
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

    const b = (await farmState()).bounds;
    const centerX = (b.x + b.right) / 2;
    const centerY = (b.y + b.bottom) / 2;

    // 1. 四边非出口 → 提示出现
    const edges = [
      ['左边缘', b.x + 8, centerY],
      ['右边缘(非出口)', b.right - 8, centerY + 60],
      ['底边缘', centerX, b.bottom - 8],
      ['顶边缘(非出口)', b.x + 100, b.y + 8],
    ];
    for (const [name, ex, ey] of edges) {
      await setPos(centerX, centerY); // 先回中心，重置 flag
      await sleep(120);
      const st = await waitTip(ex, ey);
      check(`${name} 出现边界提示`, st && st.tip === TIP_TEXT, `实际=${st ? st.tip : 'null'} @(${ex},${ey})`);
    }

    // 2. 离开边界带回内部 → 再次靠近可再提示
    await setPos(centerX, centerY);
    await sleep(120);
    const st2 = await waitTip(b.x + 8, centerY);
    check('离开后再靠近可再次提示', st2 && st2.tip === TIP_TEXT && st2.tipShown === true,
      `tipShown=${st2 ? st2.tipShown : 'null'}`);

    // 3. 出口触发区（farm 顶→forest）→ 不提示 + 正常切场景
    await clearTip();
    await sleep(100);
    const st3 = await waitTip(b.x + 240, b.y + 24); // 顶出口 (224-272, 0-48) 中心
    check('出口区不出现边界提示', !st3 || st3.tip === null, `tip=${st3 ? st3.tip : 'scene离开'}`);
    let next = '';
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      next = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (next !== 'farm') break;
    }
    check('出口区正常切场景 → forest', next === 'forest', `实际=${next}`);

    // 回农场（forest 底出口 → farm）
    if (next === 'forest') {
      await page.evaluate(() => {
        const s = window.__game.scene.getScene('forest');
        if (s && s.player) s.player.setPosition(240, 308); // forest 底出口 (224-256, 288-320)
      });
      await sleep(1600);
    }

    // 4. 教程期不提示
    await page.evaluate(() => window.debug.setStoryStep('clear_land'));
    await clearTip();
    await sleep(100);
    const st4 = await waitTip(b.x + 8, centerY);
    check('教程期不出现边界提示', !st4 || st4.tip === null, `tip=${st4 ? st4.tip : 'null'}`);
    await page.evaluate(() => window.debug.setStoryStep('done'));

    // 5. house 室内不提示（经农场木屋门进入；gate 走同一 mapKey 守卫）
    await clearTip();
    await sleep(100);
    await setPos(b.x + 104, b.y + 312); // 木屋门出口区 (80-128, 288-336) 中心
    await sleep(1600);
    const cur = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
    if (cur === 'house') {
      await page.evaluate(() => {
        const s = window.__game.scene.getScene('house');
        if (s && s.player) s.player.setPosition(24, s.physics.world.bounds.bottom - 8);
      });
      await sleep(200);
      const h = await page.evaluate(() => {
        const s = window.__game.scene.getScene('house');
        return s ? (s.dialogueText ? s.dialogueText.text : null) : 'no-scene';
      });
      check('house 室内不出现边界提示', h === null, `tip=${h}`);
    } else {
      check('house 室内不出现边界提示', false, `未能进入 house，当前=${cur}`);
    }

    // 6. 运行时错误
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    check('无运行时错误', realErrors.length === 0, realErrors.join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
})().catch(err => { console.error('探针异常:', err); process.exit(1); });
