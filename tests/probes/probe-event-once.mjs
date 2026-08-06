/**
 * 一次性事件状态（EventManager）—— 运行时验证探针
 *
 * 验证（2026-08-06 制作人拍板：统一"只触发一次"机制）：
 *   1. triggerOnce 幂等：同 id 第二次调用不执行 fn
 *   2. hasTriggered / getSaveData 反映状态
 *   3. 存档往返：gameState.triggeredEvents 随 save/apply 持久化（刷新后仍为已触发）
 *   4. 旧档兼容：无 gameState 字段的存档 → 空状态、不崩溃
 *
 * 前置：dev server；node probe-event-once.mjs
 */

import puppeteer from 'puppeteer-core';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log('=== 一次性事件状态（EventManager）验证 ===\n');
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

  const waitDebug = async (timeoutMs = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await page.evaluate(() => !!window.debug && !!window.debug.events)) return true;
      await sleep(300);
    }
    return false;
  };

  /** 进入游戏（触发 load + apply，apply 才会恢复各模块状态） */
  const enterGame = async (timeoutMs = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const cur = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (cur !== 'none' && cur !== 'title') return;
      await page.keyboard.press('Enter');
      await page.mouse.click(400, 300);
      await sleep(300);
    }
  };

  const injectSave = async (gameStatePresent, triggered = {}) => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(800);
    await page.evaluate(({ gameStatePresent, triggered }) => {
      const base = {
        version: '0.5', savedAt: 'event-once-probe', timestamp: Date.now(),
        player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
        world: { day: 1, hour: 12, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
      };
      if (gameStatePresent) base.gameState = { triggeredEvents: triggered };
      localStorage.setItem('return_star_save', JSON.stringify(base));
    }, { gameStatePresent, triggered });
    await page.reload({ waitUntil: 'networkidle2' });
    await waitDebug();
    await enterGame();
    await sleep(1200);
  };

  // 1) 内存幂等
  await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
  await waitDebug();
  const mem = await page.evaluate(() => {
    let runs = 0;
    const r1 = window.debug.events.triggerOnce('probe_e1', () => { runs++; });
    const r2 = window.debug.events.triggerOnce('probe_e1', () => { runs++; });
    return { r1, r2, runs, triggered: window.debug.events.hasTriggered('probe_e1'), data: window.debug.events.getSaveData() };
  });
  check('A1 首次触发执行并返回 true', mem.r1 === true && mem.runs === 1, JSON.stringify(mem));
  check('A2 二次触发跳过并返回 false', mem.r2 === false && mem.runs === 1, `runs=${mem.runs}`);
  check('A3 hasTriggered 反映状态', mem.triggered === true);
  check('A4 getSaveData 含事件 id', !!(mem.data && mem.data.triggeredEvents && mem.data.triggeredEvents.probe_e1 === true));

  // 2) 存档往返：注入已触发事件 → 刷新后仍为已触发
  await injectSave(true, { 'persisted_evt': true });
  const restored = await page.evaluate(() => ({
    triggered: window.debug.events.hasTriggered('persisted_evt'),
    data: window.debug.events.getSaveData(),
  }));
  check('B1 存档事件刷新后恢复', restored.triggered === true, JSON.stringify(restored.data));
  // 已恢复的事件再次 triggerOnce 应跳过
  const reRun = await page.evaluate(() => {
    let runs = 0;
    window.debug.events.triggerOnce('persisted_evt', () => { runs++; });
    return runs;
  });
  check('B2 恢复后 triggerOnce 不再执行', reRun === 0, `runs=${reRun}`);

  // 3) 旧档兼容：无 gameState 字段 → 空状态、不崩溃
  await injectSave(false);
  const legacy = await page.evaluate(() => window.debug.events.getSaveData());
  check('C1 旧档默认空状态', legacy && legacy.triggeredEvents && Object.keys(legacy.triggeredEvents).length === 0, JSON.stringify(legacy));

  // 4) 运行时错误
  check('D1 无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(2); });
