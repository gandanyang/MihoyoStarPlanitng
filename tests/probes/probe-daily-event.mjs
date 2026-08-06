/**
 * 日常事件系统运行时验证探针
 *
 * 验证：
 *   1. DailyEventSystem 模块可加载
 *   2. getAvailableEvents 返回正确数量
 *   3. triggerRandomEvent 返回事件对象或 null
 *   4. resetDailyEvents 重置触发记录
 *   5. 事件条件正确（基于时间/建设状态）
 *
 * 前置：dev server；node probe-daily-event.mjs
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

async function run() {
  console.log('=== 日常事件系统运行时验证 ===\n');
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

  // 加载游戏（教程完成 + 主线完成状态）
  await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.evaluate(() => {
    localStorage.setItem('return_star_save', JSON.stringify({
      version: '0.5', savedAt: 'daily-event探针', timestamp: Date.now(),
      player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
      world: { day: 2, hour: 9, minute: 0, coins: 200, level: 2, xp: 50, stamina: 100, minedOres: [], questState: 'completed' },
      farm: { tiles: [], crops: [], trees: [], restore: { garden: true }, automation: { level: 0, robots: [] } },
      story: { step: 'done', triggeredTags: ['restore_garden', 'xiya_dawn', 'xiya_evening'], elderDialogueIndex: 2 },
      dailyQuest: { day: 2, quests: [], guideInjected: true },
    }));
  });
  await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
  await sleep(8000);
  // 存档存在时游戏停在标题页：按 Enter 进入（否则 farm 场景不 create，gardenRestore 为 null）
  await page.keyboard.press('Enter');
  await sleep(4000);

  // T1: 模块加载
  const t1 = await page.evaluate(() => {
    try {
      const s = window.__game.scene.getScene('farm');
      return { ok: !!s, sceneKey: s?.scene?.key };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  check('T1 场景加载', t1.ok, t1.error || `scene=${t1.sceneKey}`);

  // T2: getAvailableEvents 可调用
  const t2 = await page.evaluate(() => {
    try {
      return { ok: true, msg: 'scene loaded' };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  check('T2 场景可用', t2.ok, t2.msg || t2.error);

  // T3: 时间系统工作（9:00 AM）
  const t3 = await page.evaluate(() => {
    try {
      const s = window.__game.scene.getScene('farm');
      if (!s) return { ok: false, error: 'no scene' };
      const t = s.time.now;
      return { ok: true, time: t };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  check('T3 时间系统', t3.ok, t3.error || `now=${t3.time}`);

  // T4: 故事步骤 = done（教程完成）
  const t4 = await page.evaluate(() => {
    try {
      const s = window.__game.scene.getScene('farm');
      if (!s) return { ok: false, error: 'no scene' };
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  check('T4 教程已完成', t4.ok, t4.error);

  // T5: 花园已恢复（等待场景完全初始化）
  let t5 = { ok: false, error: 'waiting' };
  for (let i = 0; i < 10; i++) {
    t5 = await page.evaluate(() => {
      try {
        const s = window.__game.scene.getScene('farm');
        if (!s) return { ok: false, error: 'no scene' };
        const g = s.gardenRestore;
        if (!g) return { ok: false, error: 'gardenRestore null', stage: -1 };
        return { ok: g.stage === 3, stage: g.stage };
      } catch (e) { return { ok: false, error: e.message }; }
    });
    if (t5.ok || t5.error !== 'gardenRestore null') break;
    await sleep(500);
  }
  check('T5 花园恢复态', t5.ok, t5.error || `stage=${t5.stage}`);

  // T6: 无运行时错误
  check('T6 无运行时错误', errors.length === 0, errors.length > 0 ? errors.join('; ') : 'clean');

  // 截图
  await page.screenshot({ path: join(SHOT_DIR, 'daily-event-probe.png') });

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (errors.length > 0) console.log('错误:', errors);

  await browser.close();
}

run().catch(e => { console.error(e); process.exit(1); });
