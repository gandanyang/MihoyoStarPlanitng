/**
 * 支线试点（2026-08-06 制作人拍板方案 A）—— 运行时验证探针
 *
 * 验证：
 *   1. 夏雅「院子有人照顾」：花园恢复后花田靠近按 E → 入口对白（asked 入档）
 *   2. 木材不足：重复提示，不扣木材、不完成
 *   3. 木材≥3：扣除 3、完成入档（done）、记忆卡 + 回响出现
 *   4. 村长「看星星的地方」：观星夜完成后与村长对话 → 委托入档（teaAsked）
 *   5. 白天靠近空地仅提示；夜晚靠近 → 完成入档（starDone）+ 记忆卡 + 回响
 *   6. 全程无运行时错误
 *
 * 前置：dev server；node probe-side-episodes.mjs
 */

import puppeteer from 'puppeteer-core';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const T = 16;
const GARDEN_POS = { x: 30 * T + T / 2, y: 5 * T + T / 2 };   // farm 花田中心
const ELDER_SPOT = { x: 13 * T + 8, y: 10 * T + 8 };          // town 村长站位
const STARGAZE_POS = { x: 504, y: 232 };                       // farm 观星点/空地

const makeSave = (scene, x, y, opts = {}) => ({
  version: '0.5', savedAt: 'side-episode-probe', timestamp: Date.now(),
  player: { x, y, scene, facing: 'down', inventory: { wood: opts.wood ?? 0 } },
  world: {
    day: 1, hour: opts.hour ?? 12, minute: 0, coins: 100, level: 1, xp: 0,
    stamina: 100, minedOres: [], questState: opts.questState ?? 'not_started',
  },
  farm: { tiles: [], crops: [], trees: [], restore: opts.restore ?? {} },
  story: { storyStep: opts.storyStep ?? 'done' },
  mapFlags: opts.mapFlags,
});

async function run() {
  console.log('=== 支线试点（夏雅花园 / 村长看星星）运行时验证 ===\n');
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

  const flags = () => page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('return_star_save') || 'null');
    return s ? (s.mapFlags || {}) : {};
  });
  const savedWood = () => page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('return_star_save') || 'null');
    return s && s.player && s.player.inventory ? (s.player.inventory.wood || 0) : -1;
  });
  const dialogueText = () => page.evaluate(() => {
    const s = window.__game?.scene.getScenes(true)[0];
    return (s && s.storyDialogue && s.storyDialogue.textEl && s.storyDialogue.textEl.textContent) || '';
  });
  const bodyText = () => page.evaluate(() => document.body.innerText);

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
    throw new Error(`未能进入场景 ${scene}（实际 ${cur}）错误=${errors.slice(0, 5).join(' | ')}`);
  };

  const gotoScene = async (saveObj, scene) => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1000);
    await page.evaluate((s) => localStorage.setItem('return_star_save', JSON.stringify(s)), saveObj);
    await page.reload({ waitUntil: 'networkidle2' });
    await enterGame(scene);
    await sleep(1000);
  };

  /** 按 E 触发交互，然后持续 Enter/点击推进，直到 predicate 为真或超时 */
  const interactUntil = async (predicate, timeoutMs = 20000) => {
    await page.keyboard.press('KeyE');
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await predicate()) return true;
      await page.keyboard.press('Enter');
      await page.mouse.click(400, 300);
      await sleep(300);
    }
    return false;
  };

  /** 同 interactUntil，但轮询期间持续记录 bodyText 中出现的关键文本（用于断言播放过记忆卡） */
  const interactUntilWatched = async (predicate, watchStrs, timeoutMs = 25000) => {
    const seen = [];
    await page.keyboard.press('KeyE');
    const t0 = Date.now();
    let ok = false;
    while (Date.now() - t0 < timeoutMs) {
      const b = await bodyText();
      for (const s of watchStrs) if (!seen.includes(s) && b.includes(s)) seen.push(s);
      if (await predicate()) { ok = true; break; }
      await page.keyboard.press('Enter');
      await page.mouse.click(400, 300);
      await sleep(300);
    }
    return { ok, seen };
  };

  // ---- A：夏雅「院子有人照顾」 ----
  // A1 木材不足：入口对白 + 提示，不扣木材不完成
  await gotoScene(makeSave('farm', GARDEN_POS.x, GARDEN_POS.y, { wood: 1, restore: { garden: true } }), 'farm');
  let ok = await interactUntil(async () => (await flags()).sideXiyaGardenAsked === true);
  check('A1 入口对白触发并入档（asked）', ok, JSON.stringify(await flags()));
  ok = await interactUntil(async () => (await dialogueText()).includes('还差几根木材'));
  check('A2 木材不足提示', ok, `text=${(await dialogueText()).slice(0, 30)}`);
  check('A3 木材不足不扣木材', (await savedWood()) === 1, `wood=${await savedWood()}`);
  check('A4 木材不足不完成', (await flags()).sideXiyaGardenDone !== true);

  // A5 木材≥3：交付完成 + 记忆卡 + 回响
  await gotoScene(makeSave('farm', GARDEN_POS.x, GARDEN_POS.y, { wood: 5, restore: { garden: true } }), 'farm');
  ok = await interactUntil(async () => (await flags()).sideXiyaGardenAsked === true);
  check('A5 再次入口对白', ok);
  const wA = await interactUntilWatched(async () => (await flags()).sideXiyaGardenDone === true, ['院子有人照顾']);
  check('A6 交付完成入档（done）', wA.ok, JSON.stringify(await flags()));
  check('A7 扣除木材 5→2', (await savedWood()) === 2, `wood=${await savedWood()}`);
  check('A8 记忆卡文本出现', wA.seen.includes('院子有人照顾'), `seen=${wA.seen.join(',')}`);
  check('A9 回响文本出现', (await bodyText()).includes('花田那边，一直有人打理着'), '');

  // ---- B：村长「看星星的地方」 ----
  // B1 观星夜完成后与村长对话 → 委托入档
  await gotoScene(makeSave('town', ELDER_SPOT.x, ELDER_SPOT.y, {
    questState: 'completed', storyStep: 'observatory_complete',
  }), 'town');
  ok = await interactUntil(async () => (await flags()).sideElderTeaAsked === true);
  check('B1 村长委托入档（teaAsked）', ok, JSON.stringify(await flags()));

  // B2 白天靠近空地仅提示，不完成
  await gotoScene(makeSave('farm', STARGAZE_POS.x, STARGAZE_POS.y, {
    hour: 12, questState: 'completed', storyStep: 'observatory_complete',
    mapFlags: { sideElderTeaAsked: true },
  }), 'farm');
  await page.keyboard.press('KeyE');
  await sleep(800);
  const hint = await page.evaluate(() => {
    const s = window.__game?.scene.getScenes(true)[0];
    return (s && s.dialogueText && s.dialogueText.text) || '';
  });
  check('B2 白天仅提示', hint.includes('晚上来坐坐'), `hint=${hint.slice(0, 30)}`);
  check('B3 白天不完成', (await flags()).sideElderStarDone !== true);

  // B4 夜晚靠近空地 → 完成 + 记忆卡 + 回响
  await gotoScene(makeSave('farm', STARGAZE_POS.x, STARGAZE_POS.y, {
    hour: 21, questState: 'completed', storyStep: 'observatory_complete',
    mapFlags: { sideElderTeaAsked: true },
  }), 'farm');
  const wB = await interactUntilWatched(async () => (await flags()).sideElderStarDone === true, ['那里安静，能看见很远的星星']);
  check('B4 夜晚空地完成入档（starDone）', wB.ok, JSON.stringify(await flags()));
  check('B5 记忆卡文本出现', wB.seen.includes('那里安静，能看见很远的星星'), `seen=${wB.seen.join(',')}`);
  check('B6 回响文本出现', (await bodyText()).includes('还记得那块空地'), '');

  // ---- C：运行时错误 ----
  check('C1 无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(2); });
