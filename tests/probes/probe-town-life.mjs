/**
 * P1 青禾镇生活化升级 —— 运行时验证探针
 *
 * 验证：
 *   1. 白天（12:00）进镇：生活杂物层 ≥8 类、小动物 ≥1、无晨雾、无萤火虫
 *   2. 清晨（07:00）进镇：晨雾出现（fog ≥1）、无萤火虫
 *   3. 夜间（20:00）进镇：萤火虫出现（fireflies ≥1）、无晨雾
 *   4. 全程无运行时错误 / 资源 404（资源 404 仅记录不判失败）
 *   5. 昼夜截图存档供制作人目测（tests/probes/test-screenshots/）
 *
 * 前置：dev server；node probe-town-life.mjs
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(__dirname, 'test-screenshots');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(SHOT_DIR, { recursive: true });

const snapTown = `(() => {
  const s = window.__game.scene.getScene('town');
  if (!s) return { sceneLoaded: false };
  return { sceneLoaded: true, townLife: s.townLife };
})()`;

async function run() {
  console.log('=== P1 青禾镇生活化升级 运行时验证 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  const errors = [];
  const notFound = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() === 404) notFound.push(r.url()); });

  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
    ok ? pass++ : fail++;
  };

  const enterGame = async (scene, timeoutMs = 20000) => {
    const t0 = Date.now();
    let cur = '';
    while (Date.now() - t0 < timeoutMs) {
      cur = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (cur === scene) return;
      if (cur === 'title') {
        await page.keyboard.press('Enter');
        await page.mouse.click(400, 300);
      }
      await sleep(350);
    }
    throw new Error(`未能进入场景 ${scene}（实际 ${cur}）页面错误=${errors.slice(0, 5).join(' | ')}`);
  };

  const gotoHourScene = async (hour) => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1000);
    await page.evaluate((hour) => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'town-life-probe', timestamp: Date.now(),
        player: { x: 240, y: 96, scene: 'town', facing: 'down', inventory: {} },
        world: { day: 1, hour, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
      }));
    }, hour);
    await page.reload({ waitUntil: 'networkidle2' });
    await enterGame('town');
    await sleep(1200);
  };

  // 1) 白天 12:00
  await gotoHourScene(12);
  let d = await page.evaluate(snapTown);
  check('A1 白天进镇加载', d.sceneLoaded, JSON.stringify(d));
  check('A2 生活杂物 ≥8', d.townLife && d.townLife.decor >= 8, `decor=${d.townLife && d.townLife.decor}`);
  check('A3 小动物 ≥1', d.townLife && d.townLife.wildlife >= 1, `wildlife=${d.townLife && d.townLife.wildlife}`);
  check('A4 白天无晨雾', d.townLife && d.townLife.fog === 0, `fog=${d.townLife && d.townLife.fog}`);
  check('A5 白天无萤火虫', d.townLife && d.townLife.fireflies === 0, `fireflies=${d.townLife && d.townLife.fireflies}`);
  await page.screenshot({ path: join(SHOT_DIR, 'town-life-day.png') });

  // 2) 清晨 07:00
  await gotoHourScene(7);
  d = await page.evaluate(snapTown);
  check('B1 清晨进镇加载', d.sceneLoaded);
  check('B2 清晨出现晨雾', d.townLife && d.townLife.fog >= 1, `fog=${d.townLife && d.townLife.fog}`);
  check('B3 清晨无萤火虫', d.townLife && d.townLife.fireflies === 0, `fireflies=${d.townLife && d.townLife.fireflies}`);
  await page.screenshot({ path: join(SHOT_DIR, 'town-life-dawn.png') });

  // 3) 夜间 20:00
  await gotoHourScene(20);
  d = await page.evaluate(snapTown);
  check('C1 夜间进镇加载', d.sceneLoaded);
  check('C2 夜间出现萤火虫', d.townLife && d.townLife.fireflies >= 1, `fireflies=${d.townLife && d.townLife.fireflies}`);
  check('C3 夜间无晨雾', d.townLife && d.townLife.fog === 0, `fog=${d.townLife && d.townLife.fog}`);
  await page.screenshot({ path: join(SHOT_DIR, 'town-life-night.png') });

  // 4) 运行时错误
  check('D1 无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n资源 404（仅记录）: ${notFound.length} 个`);

  await browser.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(2); });
