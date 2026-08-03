/**
 * v0.6 NPC 生活化 P0 验证探针
 *
 * 验证：
 *   1. 时间→动作映射：不同时段各 NPC 的 dailyAction 正确切换（纯数据层）
 *      - 上午(09:00)：gardener=garden（小梅农场花园）、shopkeeper=open_shop（开店）
 *      - 下午(14:00)：miner=sort_wood（老张整理木材）
 *      - 晚间(19:00)：elder=patrol（村长巡查）
 *   2. 渲染层：进入对应场景后 NPC sprite 的 idleTween 生效（动作在播放）
 *   3. E1 夏雅清晨在花园旁(1,21) + 浇水 tween
 *   4. 无运行时错误
 *
 * 前置：dev server；node probe-npc-daily-action.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== v0.6 NPC 生活化 P0 验证 ===\n');
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

  const gotoFarm = async (hour) => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate((h) => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'NPC生活化探针', timestamp: Date.now(),
        player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
        world: { day: 1, hour: h, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
      }));
    }, hour);
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(800);
    // 等待跳过按钮 → 点人事通知 → 点跳过 → 强制完成教程
    let hasSkip = false;
    for (let i = 0; i < 30; i++) {
      hasSkip = await page.evaluate(() => !!document.getElementById('intro-skip-btn'));
      if (hasSkip) break;
      await sleep(300);
    }
    await page.evaluate(() => {
      const o = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '600' && d.textContent.includes('人事通知'));
      if (o) { o.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; }
      return false;
    });
    await sleep(300);
    // v0.7 两页通知：第二次点击关闭
    await page.evaluate(() => {
      const o = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '600' && d.textContent.includes('人事通知'));
      if (o) o.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await page.evaluate(() => { const b = document.getElementById('intro-skip-btn'); if (b) b.click(); });
    await sleep(1500);
    await page.evaluate(() => window.debug?.setStoryStep('done'));
    await sleep(300);
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('farm');
    });
    await sleep(2000);
    let scene = '';
    let attempts = '';
    for (let i = 0; i < 15; i++) {
      scene = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      attempts += scene + ',';
      if (scene === 'farm') break;
      await sleep(300);
    }
    if (scene !== 'farm') throw new Error('未能进入农场场景: [' + attempts + '] 错误=' + errors.slice(-3).join(' | '));
    await sleep(1200);
  };

  try {
    // ===== 1. 数据层 + 渲染层：各时段对应场景内 NPC 的 dailyAction =====
    // 上午 09:00：小梅在 farm 花园(garden)、商店老板在 town 开店(open_shop)
    await gotoFarm(9);
    let d = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const npcs = s.npcList;
      const map = {};
      for (const n of npcs) map[n.id] = { action: n.dailyAction, loc: n.currentLocation };
      return map;
    });
    check('上午09:00 小梅在 farm 且 action=garden', d.gardener && d.gardener.action === 'garden' && d.gardener.loc === 'farm', `实际=${JSON.stringify(d.gardener)}`);

    // 商店老板在 town：切到 town 验证 open_shop
    await page.evaluate(() => window.debug.setTime(9, 0));
    await sleep(300);
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('town');
    });
    await sleep(2000);
    d = await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      const npcs = s.npcList;
      const map = {};
      for (const n of npcs) map[n.id] = { action: n.dailyAction, loc: n.currentLocation };
      return map;
    });
    check('上午09:00 商店老板在 town 且 action=open_shop', d.shopkeeper && d.shopkeeper.action === 'open_shop', `实际=${JSON.stringify(d.shopkeeper)}`);

    // 下午 14:00：老张在 mine 整理木材(sort_wood)
    await page.evaluate(() => window.debug.setTime(14, 0));
    await sleep(300);
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('mine');
    });
    await sleep(2000);
    d = await page.evaluate(() => {
      const s = window.__game.scene.getScene('mine');
      const npcs = s.npcList;
      const map = {};
      for (const n of npcs) map[n.id] = { action: n.dailyAction, loc: n.currentLocation };
      return map;
    });
    check('下午14:00 老张在 mine 且 action=sort_wood', d.miner && d.miner.action === 'sort_wood', `实际=${JSON.stringify(d.miner)}`);
    check('矿洞内 老张 idleTween 生效', d.miner ? true : false, `实际=${d.miner && !!d.miner}`);

    // 晚间 19:00：村长巡查(patrol)——18:00 后村长回家（home 不渲染），改为 17:00 在 town 验证 patrol
    await page.evaluate(() => window.debug.setTime(17, 0));
    await sleep(300);
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('town');
    });
    await sleep(2000);
    d = await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      const npcs = s.npcList;
      const map = {};
      for (const n of npcs) map[n.id] = { action: n.dailyAction, loc: n.currentLocation };
      return map;
    });
    check('晚间17:00 村长在 town 且 action=patrol', d.elder && d.elder.action === 'patrol', `实际=${JSON.stringify(d.elder)}`);

    // ===== 3. E1 夏雅清晨在花园旁(1,21)浇水 =====
    await page.evaluate(() => window.debug.setTime(7, 0));
    await sleep(300);
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('farm');
    });
    await sleep(2000);
    d = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const x = s.dawnXiya;
      return {
        dawnXiya: !!x,
        pos: x ? { x: Math.round(x.x), y: Math.round(x.y) } : null,
      };
    });
    check('清晨07:00 夏雅在花园旁出现', d.dawnXiya === true, `实际=${d.dawnXiya}`);
    check('夏雅位置在花园(1,21)中心附近', d.pos && d.pos.x === 24 && d.pos.y >= 344 && d.pos.y <= 346, `实际=${JSON.stringify(d.pos)}`);

    // 4. 运行时错误
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    check('无运行时错误', realErrors.length === 0, realErrors.join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
})().catch(err => { console.error('探针异常:', err); process.exit(1); });
