/**
 * P2 农场复兴视觉化 —— 运行时验证探针
 *
 * 验证：
 *   1. 新档（无 worldRestore）：荒废态装饰 15 组、复兴态 0、无小鸟
 *   2. garden 恢复：菜园层次复兴（revive=5），其余荒废（ruin=11）
 *   3. garden+oldHouse 恢复：全复兴（revive=19）、小鸟 1 只（wildlife=1）
 *   4. 夜间 20:00 全恢复：装饰不随时间消失（纯视觉无时间依赖）
 *   5. 既有复兴系统未破坏（gardenRestore/oldHouseRestore 状态一致）
 *   6. 全程无运行时错误 / 资源 404（404 仅记录不判失败）
 *   7. 三态截图存档供制作人目测（tests/probes/test-screenshots/）
 *
 * 前置：dev server；node probe-farm-life.mjs
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

const snapFarm = `(() => {
  const s = window.__game?.scene?.getScene('farm');
  if (!s) return { sceneLoaded: false };
  return {
    sceneLoaded: true,
    farmLife: s.farmLife,
    gardenRestored: !!(s.gardenRestore && s.gardenRestore.stage === 3),
    oldHouseRestored: !!(s.oldHouseRestore && s.oldHouseRestore.restored),
  };
})()`;

async function run() {
  console.log('=== P2 农场复兴视觉化 运行时验证 ===\n');
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

  const gotoHourFarm = async (hour, worldRestore, label) => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1000);
    await page.evaluate(({ hour, worldRestore, label }) => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: label, timestamp: Date.now(),
        player: { x: 320, y: 300, scene: 'farm', facing: 'down', inventory: {} },
        world: { day: 1, hour, minute: 0, coins: 200, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
        ...(worldRestore ? { worldRestore } : {}),
      }));
    }, { hour, worldRestore, label });
    await page.reload({ waitUntil: 'networkidle2' });
    await enterGame('farm');
    await sleep(1200);
  };

  // 1) 新档（未恢复）白天 12:00
  await gotoHourFarm(12, null, 'farm-life-ruined');
  let d = await page.evaluate(snapFarm);
  check('A1 新档进 farm 加载', d.sceneLoaded, JSON.stringify(d.farmLife));
  check('A2 荒废态装饰 15 组', d.farmLife && d.farmLife.ruin === 15, `ruin=${d.farmLife && d.farmLife.ruin}`);
  check('A3 复兴态装饰 0', d.farmLife && d.farmLife.revive === 0, `revive=${d.farmLife && d.farmLife.revive}`);
  check('A4 无小鸟', d.farmLife && d.farmLife.wildlife === 0, `wildlife=${d.farmLife && d.farmLife.wildlife}`);
  check('A5 花园/老屋均未恢复', d.gardenRestored === false && d.oldHouseRestored === false);
  await page.screenshot({ path: join(SHOT_DIR, 'farm-life-ruined.png') });

  // 2) garden 恢复 白天 12:00
  await gotoHourFarm(12, { garden: true }, 'farm-life-garden');
  d = await page.evaluate(snapFarm);
  check('B1 garden 恢复进 farm 加载', d.sceneLoaded);
  check('B2 菜园复兴 5 组', d.farmLife && d.farmLife.revive === 5, `revive=${d.farmLife && d.farmLife.revive}`);
  check('B3 其余仍荒废 11 组', d.farmLife && d.farmLife.ruin === 11, `ruin=${d.farmLife && d.farmLife.ruin}`);
  check('B4 仍无小鸟', d.farmLife && d.farmLife.wildlife === 0, `wildlife=${d.farmLife && d.farmLife.wildlife}`);
  check('B5 花园已恢复/老屋未恢复', d.gardenRestored === true && d.oldHouseRestored === false);

  // 3) garden + oldHouse 恢复 白天 12:00
  await gotoHourFarm(12, { garden: true, oldHouse: true }, 'farm-life-restored');
  d = await page.evaluate(snapFarm);
  check('C1 全恢复进 farm 加载', d.sceneLoaded);
  check('C2 全复兴 19 组', d.farmLife && d.farmLife.revive === 19, `revive=${d.farmLife && d.farmLife.revive}`);
  check('C3 无荒废残留', d.farmLife && d.farmLife.ruin === 0, `ruin=${d.farmLife && d.farmLife.ruin}`);
  check('C4 小鸟 1 只', d.farmLife && d.farmLife.wildlife === 1, `wildlife=${d.farmLife && d.farmLife.wildlife}`);
  check('C5 既有复兴系统状态一致', d.gardenRestored === true && d.oldHouseRestored === true);
  await page.screenshot({ path: join(SHOT_DIR, 'farm-life-restored.png') });

  // 4) 全恢复 夜间 20:00（装饰无时间依赖）
  await gotoHourFarm(20, { garden: true, oldHouse: true }, 'farm-life-night');
  d = await page.evaluate(snapFarm);
  check('D1 夜间全恢复进 farm 加载', d.sceneLoaded);
  check('D2 夜间复兴装饰仍在 19 组', d.farmLife && d.farmLife.revive === 19, `revive=${d.farmLife && d.farmLife.revive}`);
  check('D3 夜间小鸟仍在', d.farmLife && d.farmLife.wildlife === 1, `wildlife=${d.farmLife && d.farmLife.wildlife}`);
  await page.screenshot({ path: join(SHOT_DIR, 'farm-life-night.png') });

  // 5) 运行时错误
  check('E1 无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n资源 404（仅记录）: ${notFound.length} 个`);

  await browser.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(2); });
