/**
 * 新反馈验证：浇水水花粒子（waterSplash）
 *
 * 制作人反馈（制作人安卓试玩反馈.md）：「手机端因为模型小 浇水的特效很不明显」
 * → MapScene.waterSplash：浇水时在格子上方喷 6 滴水珠（Arc 0x9fd8f5，depth 6），tween 完成后销毁。
 *
 * 验证：
 *   1. 对已种未浇水格按 E → 创建 6 个水珠（fillColor=0x9fd8f5）
 *   2. ~800ms 后 tween 完成，水珠全部销毁（无泄漏）
 *   3. 格子状态 planted → watered（原有浇水逻辑不受影响）
 *   4. 无运行时错误
 *
 * 前置：dev server localhost:5173；node probe-water-splash.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let pass = 0, fail = 0;
  const check = (n, ok, d = '') => { console.log(`${ok ? '✅' : '❌'} ${n}${d ? ' - ' + d : ''}`); ok ? pass++ : fail++; };

  try {
    // 进入农场：已种未浇水萝卜 (14,10)
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate(() => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: '水花探针', timestamp: Date.now(),
        player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
        world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: {
          tiles: [['14,10', 'planted']],
          crops: [['14,10', { cropType: 'radish', plantDay: 1, watered: false }]],
          trees: [],
        },
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

    // 站到格子下方朝上，按 E 浇水
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      s.player.setPosition(14 * 16 + 8, 10 * 16 + 22);
      s.player.facing = 'up';
    });
    await sleep(200);

    const countDrops = () => page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const drops = s.children.list.filter(o => o.type === 'Arc' && o.fillColor === 0x9fd8f5);
      return drops.length;
    });
    const before = await countDrops();
    check('浇水前无水珠残留', before === 0, `count=${before}`);

    await page.keyboard.press('E');
    await sleep(150);

    const after = await countDrops();
    check('浇水创建 6 颗水珠', after === 6, `count=${after}`);

    // 浇水后作物帧应为 watered 帧1（probe-automation 同款判定）
    const cropInfo = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const tile = s.tileRects.get('14,10');
      return { frame: tile && tile.crop ? tile.crop.frame.name : -1, hasCrop: !!tile && !!tile.crop };
    });
    check('浇水后作物帧为 watered 帧1', cropInfo.frame === 1, `frame=${cropInfo.frame}`);

    // 等 tween 结束（最长 560ms + 余量）
    await sleep(900);
    const gone = await countDrops();
    check('水珠 tween 完成后全部销毁', gone === 0, `count=${gone}`);

    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    check('无运行时错误', realErrors.length === 0, realErrors.join(' | ') || '');
  } finally {
    await browser.close();
  }
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
})().catch(err => { console.error('探针异常:', err); process.exit(1); });
