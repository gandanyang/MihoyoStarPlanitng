/**
 * v0.6 NPC 生活化 P0 — 制作人验收截图探针
 *
 * 三个时间段验证（每段截图 + 状态断言）：
 *   上午(08:00)：farm — 夏雅在爷爷旧花园浇水 + 花园恢复状态
 *   下午(14:00)：mine — 老张整理木材（生活动作）
 *   晚间(17:00)：town — 村长巡查（村庄时间节奏）
 *
 * 前置：dev server；node probe-npc-life-acceptance.mjs
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(__dirname, '..', '..', 'docs', 'reports', 'screens', 'v0.6-npc-life');
mkdirSync(SHOT_DIR, { recursive: true });
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== v0.6 NPC 生活化 P0 制作人验收 ===\n');
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

  // 初始化：教程完成存档 + 花园已恢复（验收"居民回应土地变化"前提）
  const boot = async (hour) => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1200);
    await page.evaluate((h) => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'NPC生活化验收', timestamp: Date.now(),
        player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
        world: { day: 1, hour: h, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: [], crops: [], trees: [], restore: { garden: true } },
        story: { storyStep: 'done' },
      }));
    }, hour);
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(800);
    await page.evaluate(() => { const b = document.getElementById('intro-skip-btn'); if (b) b.click(); });
    await sleep(1200);
    await page.evaluate(() => window.debug?.setStoryStep('done'));
    await sleep(300);
  };

  const toScene = async (sceneKey) => {
    await page.evaluate((k) => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start(k);
    }, sceneKey);
    await sleep(2200);
  };

  const time = async (h, m = 0) => {
    await page.evaluate((x) => window.debug.setTime(x, 0), h);
    await sleep(500);
  };

  try {
    // ===== 上午 07:00 — 夏雅在花园浇水（E1 清晨时段 06-08） =====
    console.log('--- 上午(07:00) 夏雅在爷爷旧花园 ---');
    await boot(7);
    await page.evaluate(() => window.debug.setTime(7, 0));
    await sleep(400);
    await toScene('farm');
    await time(7);
    const morning = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const x = s.dawnXiya;
      return {
        dawnXiya: !!x,
        xiyaPos: x ? { x: Math.round(x.x), y: Math.round(x.y) } : null,
        gardenRestored: !!(s.gardenRestore && s.gardenRestore.stage === 3),
        // 用公开 API 取 (col1,row18) 瓦片（花丛 gid 8），避免依赖 layer.data 内部结构
        gardenFlowers: (() => { const t = s.wallsLayer?.getTileAt?.(1, 18); return t ? t.index : -1; })(),
      };
    });
    check('上午 夏雅在花园旁', morning.dawnXiya === true, `实际=${morning.dawnXiya}`);
    check('上午 夏雅位置在花园(1,21)', morning.xiyaPos && morning.xiyaPos.x === 24, `实际=${JSON.stringify(morning.xiyaPos)}`);
    check('上午 花园已恢复(花丛gid8)', morning.gardenRestored === true && morning.gardenFlowers === 8, `实际=${JSON.stringify(morning)}`);
    await page.screenshot({ path: join(SHOT_DIR, 'morning-xiya-garden.png') });
    console.log('  📸 morning-xiya-garden.png');

    // ===== 下午 14:00 — 老张整理木材 =====
    console.log('\n--- 下午(14:00) 老张整理木材 ---');
    await time(14);
    await toScene('mine');
    const afternoon = await page.evaluate(() => {
      const s = window.__game.scene.getScene('mine');
      const miner = s.npcList.find(n => n.id === 'miner');
      return {
        minerAction: miner ? miner.dailyAction : null,
        minerTween: miner ? !!miner.idleTween : false,
        minerPos: miner && miner.sprite ? { x: Math.round(miner.sprite.x), y: Math.round(miner.sprite.y) } : null,
      };
    });
    check('下午 老张在矿洞且动作=sort_wood', afternoon.minerAction === 'sort_wood', `实际=${afternoon.minerAction}`);
    check('下午 老张动作 tween 在播放', afternoon.minerTween === true, `实际=${afternoon.minerTween}`);
    await page.screenshot({ path: join(SHOT_DIR, 'afternoon-laozhang-sort-wood.png') });
    console.log('  📸 afternoon-laozhang-sort-wood.png');

    // ===== 晚间 17:00 — 村长巡查 =====
    console.log('\n--- 晚间(17:00) 村长巡查 ---');
    await time(17);
    await toScene('town');
    const evening = await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      const elder = s.npcList.find(n => n.id === 'elder');
      return {
        elderAction: elder ? elder.dailyAction : null,
        elderTween: elder ? !!elder.idleTween : false,
        elderPos: elder && elder.sprite ? { x: Math.round(elder.sprite.x), y: Math.round(elder.sprite.y) } : null,
      };
    });
    check('晚间 村长在镇上且动作=patrol', evening.elderAction === 'patrol', `实际=${evening.elderAction}`);
    check('晚间 村长巡查 tween 在播放', evening.elderTween === true, `实际=${evening.elderTween}`);
    await page.screenshot({ path: join(SHOT_DIR, 'evening-elder-patrol.png') });
    console.log('  📸 evening-elder-patrol.png');

    // 运行时错误
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    check('无运行时错误', realErrors.length === 0, realErrors.join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
})().catch(err => { console.error('探针异常:', err); process.exit(1); });
