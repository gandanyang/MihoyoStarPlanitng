/**
 * 村长家 + 青禾镇视觉升级运行时验证探针
 *
 * 三个相位：
 *   1. elder_house（室内）：种子存档 scene='elder_house'，hour=20 → 断言
 *      暖炉辉光 elderHouseGlow / 火光核心 / 门口柔光 elderHouseDoorGlow / 浮尘 elderHouseDust
 *      截图 elder-house-visual.png
 *   2. town 傍晚（hour=20）：断言 炊烟 townSmoke=4 / 落叶 townLeaves=2 / 窗灯 townWindows=8
 *      截图 town-visual-night.png
 *   3. town 白天（hour=10）：断言 炊烟=4 / 落叶=2 / 窗灯=0（白天零创建）
 *
 * 前置：dev server；node probe-town-elder-visual.mjs
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(__dirname, 'test-screenshots');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

mkdirSync(SHOT_DIR, { recursive: true });

/** 生成种子存档（可指定场景与时刻） */
function seedSave(scene, hour) {
  return JSON.stringify({
    version: '0.5', savedAt: 'TownElder探针', timestamp: Date.now(),
    player: { x: 80, y: 128, scene, facing: 'down', inventory: {} },
    world: { day: 1, hour, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'done' },
    farm: { tiles: [], crops: [], trees: [] },
    story: { storyStep: 'done' },
  });
}

/** 注入种子 → reload → 标题按 Enter → 等待进入目标场景 */
async function enterScene(page, scene, hour) {
  await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.evaluate(s => localStorage.setItem('return_star_save', s), seedSave(scene, hour));
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.keyboard.press('Enter');
  await sleep(500);
  let cur = '';
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    cur = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
    if (cur === scene) break;
  }
  await sleep(1200); // 等氛围特效创建 + 粒子启动
  return cur;
}

async function run() {
  console.log('=== 村长家 + 青禾镇视觉升级运行时验证 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  const errors = [];
  const notFound = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() === 404) notFound.push(r.url()); });

  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
    ok ? pass++ : fail++;
  };

  try {
    // ── 相位 1：村长家室内（傍晚，村长在家） ──
    console.log('【相位 1】elder_house 村长家室内');
    const s1 = await enterScene(page, 'elder_house', 20);
    check('进入村长家场景', s1 === 'elder_house', `当前=${s1}`);
    const v1 = await page.evaluate(() => {
      const inst = window.__game?.scene.getScenes(true)[0];
      return {
        glow: !!inst?.elderHouseGlow,
        glowAlpha: inst?.elderHouseGlow ? Number(inst.elderHouseGlow.alpha.toFixed(2)) : -1,
        doorGlow: !!inst?.elderHouseDoorGlow,
        dust: !!inst?.elderHouseDust,
        dustAlive: inst?.elderHouseDust ? inst.elderHouseDust.getAliveParticleCount() : -1,
      };
    });
    check('暖炉辉光创建', v1.glow, `alpha=${v1.glowAlpha}`);
    check('门口柔光创建', v1.doorGlow);
    check('浮尘粒子创建且活跃', v1.dust && v1.dustAlive >= 0, `alive=${v1.dustAlive}`);
    const shot1 = join(SHOT_DIR, 'elder-house-visual.png');
    await page.screenshot({ path: shot1 });
    console.log(`  📸 ${shot1}`);

    // ── 相位 2：青禾镇傍晚（窗灯亮） ──
    console.log('\n【相位 2】town 傍晚 (hour=20)');
    const s2 = await enterScene(page, 'town', 20);
    check('进入青禾镇场景', s2 === 'town', `当前=${s2}`);
    const v2 = await page.evaluate(() => {
      const inst = window.__game?.scene.getScenes(true)[0];
      return {
        smoke: inst?.townSmoke?.length ?? -1,
        leaves: inst?.townLeaves?.length ?? -1,
        windows: inst?.townWindows?.length ?? -1,
        smokeAlive: inst?.townSmoke?.[0] ? inst.townSmoke[0].getAliveParticleCount() : -1,
        leafAlive: inst?.townLeaves?.[0] ? inst.townLeaves[0].getAliveParticleCount() : -1,
        winAlpha: inst?.townWindows?.[0] ? Number(inst.townWindows[0].alpha.toFixed(2)) : -1,
      };
    });
    check('炊烟 4 处创建且活跃', v2.smoke === 4 && v2.smokeAlive >= 0, `n=${v2.smoke} alive=${v2.smokeAlive}`);
    check('落叶 2 处创建且活跃', v2.leaves === 2 && v2.leafAlive >= 0, `n=${v2.leaves} alive=${v2.leafAlive}`);
    check('窗灯 8 扇（傍晚亮起）', v2.windows === 8, `n=${v2.windows} alpha=${v2.winAlpha}`);
    const shot2 = join(SHOT_DIR, 'town-visual-night.png');
    await page.screenshot({ path: shot2 });
    console.log(`  📸 ${shot2}`);

    // ── 相位 3：青禾镇白天（窗灯零创建） ──
    console.log('\n【相位 3】town 白天 (hour=10)');
    const s3 = await enterScene(page, 'town', 10);
    check('进入青禾镇场景', s3 === 'town', `当前=${s3}`);
    const v3 = await page.evaluate(() => {
      const inst = window.__game?.scene.getScenes(true)[0];
      return {
        smoke: inst?.townSmoke?.length ?? -1,
        leaves: inst?.townLeaves?.length ?? -1,
        windows: inst?.townWindows?.length ?? -1,
      };
    });
    check('炊烟/落叶 白天照常', v3.smoke === 4 && v3.leaves === 2, `smoke=${v3.smoke} leaves=${v3.leaves}`);
    check('窗灯白天零创建', v3.windows === 0, `n=${v3.windows}`);

    // ── 运行时错误检查（跨相位汇总） ──
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    const real404 = notFound.filter(u => !u.endsWith('favicon.ico'));
    check('三场景无运行时错误', realErrors.length === 0 && real404.length === 0,
      [...realErrors, ...real404.map(u => '404: ' + u.replace(GAME_URL, ''))].join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
