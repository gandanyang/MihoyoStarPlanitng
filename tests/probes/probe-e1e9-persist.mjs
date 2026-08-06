/**
 * E1/E9 每日偶遇持久化 —— 运行时验证探针
 *
 * 修复（2026-08-06 存档审查）：dawnXiyaDay / eveningXiyaDay 从会话字段改为随 mapFlags 持久化，
 * 刷新后同一天不再重复触发。
 *
 * 验证：
 *   1. 当天已触发（mapFlags.dawnXiyaDay=5）→ 清晨进农场不出现夏雅
 *   2. 未触发 → 清晨出现；交互后立即入档（mapFlags.dawnXiyaDay=5）；刷新后同一天不再出现
 *   3. 跨天（day=6）→ 正常重新出现
 *   4. 傍晚同理（eveningXiyaDay 持久化）
 *
 * 前置：dev server；node probe-e1e9-persist.mjs
 */

import puppeteer from 'puppeteer-core';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const T = 16;
const DAWN_POS = { x: 33 * T + 8, y: 4 * T + 8 };   // E1 清晨夏雅位置
const EVE_POS = { x: 14 * T + 8, y: 6 * T + 8 };    // E9 傍晚夏雅位置

const makeSave = (day, hour, pos, mapFlags) => ({
  version: '0.5', savedAt: 'e1e9-probe', timestamp: Date.now(),
  player: { x: pos.x, y: pos.y, scene: 'farm', facing: 'down', inventory: {} },
  world: { day, hour, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'completed' },
  farm: { tiles: [], crops: [], trees: [] },
  story: { storyStep: 'observatory_complete' },
  mapFlags,
});

async function run() {
  console.log('=== E1/E9 每日偶遇持久化验证 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

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
    throw new Error(`未能进入 ${scene}（实际 ${cur}）错误=${errors.slice(0, 5).join(' | ')}`);
  };

  const gotoFarm = async (day, hour, pos, mapFlags) => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(800);
    await page.evaluate((s) => localStorage.setItem('return_star_save', JSON.stringify(s)), makeSave(day, hour, pos, mapFlags));
    await page.reload({ waitUntil: 'networkidle2' });
    await enterGame('farm');
    await sleep(1000);
  };

  const snap = () => page.evaluate(() => {
    const s = window.__game?.scene.getScenes(true)[0];
    return {
      dawn: !!(s && s.dawnXiya && s.dawnXiya.visible),
      eve: !!(s && s.eveningXiya && s.eveningXiya.visible),
    };
  });
  const savedFlags = () => page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('return_star_save') || 'null');
    return s && s.mapFlags ? s.mapFlags : {};
  });

  // A：当天已触发 → 清晨不再出现
  await gotoFarm(5, 7, DAWN_POS, { dawnXiyaDay: 5 });
  let d = await snap();
  check('A1 当天已触发清晨不出现', !d.dawn, JSON.stringify(d));

  // B：未触发 → 出现；交互后入档；刷新同一天不再出现
  await gotoFarm(5, 7, DAWN_POS, {});
  d = await snap();
  check('B1 未触发清晨出现', d.dawn, JSON.stringify(d));
  await page.keyboard.press('KeyE');
  await sleep(1200);
  const flagsB = await savedFlags();
  check('B2 交互后当天标记入档', flagsB.dawnXiyaDay === 5, JSON.stringify(flagsB));
  await page.reload({ waitUntil: 'networkidle2' });
  await enterGame('farm');
  await sleep(1000);
  d = await snap();
  check('B3 刷新后同一天不重复出现', !d.dawn, JSON.stringify(d));

  // C：跨天 → 重新出现
  await gotoFarm(6, 7, DAWN_POS, { dawnXiyaDay: 5 });
  d = await snap();
  check('C1 跨天清晨重新出现', d.dawn, JSON.stringify(d));

  // D：傍晚同理（已触发 → 不出现）
  await gotoFarm(5, 19, EVE_POS, { eveningXiyaDay: 5 });
  d = await snap();
  check('D1 当天已触发傍晚不出现', !d.eve, JSON.stringify(d));
  await gotoFarm(5, 19, EVE_POS, {});
  d = await snap();
  check('D2 未触发傍晚出现', d.eve, JSON.stringify(d));

  // E：运行时错误
  check('E1 无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(2); });
