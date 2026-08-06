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
  // A6-A9：交付完成（同 B4 模式：done 标志在对话播放前即置位，统一循环捕获记忆卡与回响）
  let seenGarden = false;
  let seenXiyaEcho = false;
  let gardenDone = false;
  const t0a = Date.now();
  await page.keyboard.press('KeyE');
  while (Date.now() - t0a < 10000 && !(seenGarden && seenXiyaEcho)) {
    const b = await bodyText();
    if (!seenGarden && b.includes('院子有人照顾')) seenGarden = true;
    if (!seenXiyaEcho && b.includes('花田那边，一直有人打理着')) seenXiyaEcho = true;
    gardenDone = gardenDone || (await flags()).sideXiyaGardenDone === true;
    // 闪回浮层激活时：紧轮询等打字机把整行打完（仅激活时轮询，避免空转饿死推进循环）
    const fbActiveA = await page.evaluate(() => {
      const el = document.getElementById('memory-flashback-overlay');
      return !!el && el.style.display !== 'none' && el.innerText.length > 0;
    });
    if (!seenGarden && fbActiveA) {
      const t1 = Date.now();
      while (Date.now() - t1 < 2000) {
        const t = await page.evaluate(() => document.getElementById('memory-flashback-overlay')?.innerText || '');
        if (t.includes('院子有人照顾')) { seenGarden = true; break; }
        await sleep(80);
      }
    }
    if (seenGarden && seenXiyaEcho) break;
    await page.keyboard.press('Enter');
    await page.mouse.click(400, 300);
    await sleep(300);
  }
  check('A6 交付完成入档（done）', gardenDone, JSON.stringify(await flags()));
  check('A7 扣除木材 5→2', (await savedWood()) === 2, `wood=${await savedWood()}`);
  check('A8 记忆卡文本出现', seenGarden, '');
  check('A9 回响文本出现', seenXiyaEcho, '');

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
  const readHint = () => page.evaluate(() => {
    const s = window.__game?.scene.getScenes(true)[0];
    return (s && s.dialogueText && s.dialogueText.text) || '';
  });
  let hint = '';
  for (let attempt = 0; attempt < 3 && !hint.includes('晚上来坐坐'); attempt++) {
    await page.keyboard.press('KeyE');
    const tH = Date.now();
    while (Date.now() - tH < 2000 && !hint.includes('晚上来坐坐')) {
      await sleep(150);
      hint = await readHint();
    }
    if (!hint.includes('晚上来坐坐')) {
      const dbg = await page.evaluate(() => {
        const s = window.__game?.scene.getScenes(true)[0];
        return {
          mapKey: s?.mapKey ?? s?.scene?.key ?? 'none',
          playerX: Math.round(s?.player?.x ?? -1), playerY: Math.round(s?.player?.y ?? -1),
          dt: s?.dialogueText ? (s.dialogueText.text || '').slice(0, 40) : null,
          teaAsked: s?.sideElderTeaAsked,
          starDone: s?.sideElderStarDone,
        };
      });
      console.log(`  [B2 debug] attempt=${attempt} ${JSON.stringify(dbg)}`);
    }
  }
  check('B2 白天仅提示', hint.includes('晚上来坐坐'), `hint=${hint.slice(0, 30)}`);
  check('B3 白天不完成', (await flags()).sideElderStarDone !== true);

  // B4 夜晚靠近空地 → 完成 + 记忆卡 + 回响
  // 注：trySideElderStar 在对话播放前即置位 starDone，故不能以 starDone 作推进结束条件；
  // 统一在一个循环里：按 E 触发 → 持续 Enter/click 推进对话→闪回，轮询 bodyText 捕获记忆卡与回响。
  await gotoScene(makeSave('farm', STARGAZE_POS.x, STARGAZE_POS.y, {
    hour: 21, questState: 'completed', storyStep: 'observatory_complete',
    mapFlags: { sideElderTeaAsked: true },
  }), 'farm');
  let seenStar = false;
  let seenEcho = false;
  let flashbackShown = false;
  let starDone = false;
  const t0b = Date.now();
  await page.keyboard.press('KeyE');
  while (Date.now() - t0b < 10000 && !(seenStar && seenEcho)) {
    const b = await bodyText();
    if (!seenStar && b.includes('那里安静，能看见很远的星星')) seenStar = true;
    if (!seenEcho && b.includes('还记得那块空地')) seenEcho = true;
    starDone = starDone || (await flags()).sideElderStarDone === true;
    flashbackShown = flashbackShown || (await page.evaluate(() => {
      const el = document.getElementById('memory-flashback-overlay');
      return !!el && el.style.display !== 'none' && el.innerText.length > 0;
    }));
    const fbActiveB = await page.evaluate(() => {
      const el = document.getElementById('memory-flashback-overlay');
      return !!el && el.style.display !== 'none' && el.innerText.length > 0;
    });
    if (!seenStar && fbActiveB) {
      const t1 = Date.now();
      while (Date.now() - t1 < 2000) {
        const t = await page.evaluate(() => document.getElementById('memory-flashback-overlay')?.innerText || '');
        if (t.includes('那里安静，能看见很远的星星')) { seenStar = true; break; }
        await sleep(80);
      }
    }
    if (seenStar && seenEcho) break;
    await page.keyboard.press('Enter');
    await page.mouse.click(400, 300);
    await sleep(300);
  }
  check('B4 夜晚空地完成入档（starDone）', starDone, JSON.stringify(await flags()));
  check('B5 记忆卡闪回演出出现', flashbackShown, `shown=${flashbackShown}`);
  check('B6 回响文本出现', seenEcho, '');

  // ---- C：运行时错误 ----
  check('C1 无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(2); });
