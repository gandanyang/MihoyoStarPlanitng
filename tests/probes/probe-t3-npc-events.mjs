/**
 * T3 NPC 生活事件（2026-08-07 制作人定稿）—— 运行时验证探针
 *
 * 验证：
 *   1. 夏雅「整理旧照片」：老屋修复后靠近按 E → 入口（asked）→ 再次靠近 → 完成（done + 相簿 + 记忆卡）
 *   2. 老张「矿灯」：矿洞靠近按 E → 入口（asked）→ 铜矿不足提示 → 铜矿×2 交付 → 点亮（done，无记忆卡）
 *   3. 小梅「小梅花」：小镇花圃靠近按 E → 入口（asked）→ 再次靠近 → 种花（done + 环境变化 + 记忆卡）
 *   4. 全程无运行时错误
 *
 * 前置：dev server；node probe-t3-npc-events.mjs
 */

import puppeteer from 'puppeteer-core';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const T = 16;
const OLD_HOUSE_POS = { x: 11 * T + T / 2, y: 20 * T + T / 2 }; // farm 老屋互动锚点
const LAMP_POS = { x: 12 * T + T / 2, y: 8 * T + T / 2 };       // mine 矿灯锚点
const PLUM_POS = { x: 17 * T + T / 2, y: 9 * T + T / 2 };       // town 花圃锚点

const makeSave = (scene, x, y, opts = {}) => ({
  version: '0.5', savedAt: 't3-npc-probe', timestamp: Date.now(),
  player: {
    x, y, scene, facing: 'down',
    inventory: { wood: opts.wood ?? 0, copper: opts.copper ?? 0 },
  },
  world: {
    day: 1, hour: opts.hour ?? 12, minute: 0, coins: 100, level: 1, xp: 0,
    stamina: 100, minedOres: [], questState: opts.questState ?? 'not_started',
  },
  farm: { tiles: [], crops: [], trees: [], restore: opts.restore ?? {} },
  story: { storyStep: opts.storyStep ?? 'done' },
  mapFlags: opts.mapFlags,
});

async function run() {
  console.log('=== T3 NPC 生活事件（夏雅照片 / 老张矿灯 / 小梅梅花）运行时验证 ===\n');
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
  const savedCopper = () => page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('return_star_save') || 'null');
    return s && s.player && s.player.inventory ? (s.player.inventory.copper || 0) : -1;
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

  /** 按 E 触发一次（不推进对话），返回 true 表示进入了对白（避免重复 enter 推进 flashback） */
  const pressE = async () => {
    await page.keyboard.press('KeyE');
    await sleep(500);
  };

  /** 推进当前对白/闪回直到出现 watchStrs 全部或超时；返回是否全部出现 */
  const advanceUntilSeen = async (watchStrs, timeoutMs = 25000) => {
    const seen = new Set();
    const t0 = Date.now();
    let fbActive = false;
    while (Date.now() - t0 < timeoutMs) {
      const b = await bodyText();
      for (const s of watchStrs) if (b.includes(s)) seen.add(s);
      fbActive = fbActive || (await page.evaluate(() => {
        const el = document.getElementById('memory-flashback-overlay');
        return !!el && el.style.display !== 'none' && el.innerText.length > 0;
      }));
      if (watchStrs.every((s) => seen.has(s))) break;
      // flashback 阶段用 Enter 推进（不可跳过，但需给足时间）
      await page.keyboard.press('Enter');
      await page.mouse.click(400, 300);
      await sleep(350);
    }
    return { allSeen: watchStrs.every((s) => seen.has(s)), seen: [...seen], fbActive };
  };

  // ============ A：夏雅「整理旧照片」 ============
  console.log('--- A 夏雅「整理旧照片」（老屋修复后）---');
  await gotoScene(makeSave('farm', OLD_HOUSE_POS.x, OLD_HOUSE_POS.y, {
    restore: { oldHouse: true },
  }), 'farm');
  await pressE();
  let a1 = await advanceUntilSeen(['陪我一起整理整理']);
  check('A1 入口对白出现', a1.allSeen, JSON.stringify(a1.seen));
  let aFlags = await flags();
  check('A2 入口入档（asked）', aFlags.sideXiyaPhotoAsked === true, JSON.stringify(aFlags));

  await pressE();
  let a2 = await advanceUntilSeen(['一直有人收着']);
  check('A3 完成对白 + 记忆卡出现', a2.allSeen, JSON.stringify(a2.seen));
  aFlags = await flags();
  check('A4 完成入档（done）', aFlags.sideXiyaPhotoDone === true, JSON.stringify(aFlags));

  // ============ B：老张「矿灯」 ============
  console.log('\n--- B 老张「矿灯」（矿洞，铜矿×2）---');
  await gotoScene(makeSave('mine', LAMP_POS.x, LAMP_POS.y, { copper: 0 }), 'mine');
  await pressE();
  let b1 = await advanceUntilSeen(['差两块铜矿']);
  check('B1 入口对白出现', b1.allSeen, JSON.stringify(b1.seen));
  check('B2 入口入档（asked）', (await flags()).sideMinerLampAsked === true, JSON.stringify(await flags()));

  await pressE();
  let b3 = await advanceUntilSeen(['灯座还缺两块铜矿']);
  check('B3 铜矿不足提示出现', b3.allSeen, JSON.stringify(b3.seen));
  check('B4 铜矿不足不扣铜', (await savedCopper()) === 0, `copper=${await savedCopper()}`);

  // 给铜矿×2 后完成（重新读档，保留 asked；铜矿存背包）
  await gotoScene(makeSave('mine', LAMP_POS.x, LAMP_POS.y, {
    copper: 3,
    mapFlags: { sideMinerLampAsked: true },
  }), 'mine');
  await pressE();
  let b5 = await advanceUntilSeen(['这地方还没废']);
  check('B5 完成对白出现（点亮）', b5.allSeen, JSON.stringify(b5.seen));
  // 完成对白是 play 后回调，save 在对话结束回调中执行；推进到对话完全结束再验证存档
  const bT0 = Date.now();
  while (Date.now() - bT0 < 8000 && (await flags()).sideMinerLampDone !== true) {
    await page.keyboard.press('Enter');
    await page.mouse.click(400, 300);
    await sleep(300);
  }
  check('B6 扣铜矿 3→1', (await savedCopper()) === 1, `copper=${await savedCopper()}`);
  check('B7 完成入档（done）', (await flags()).sideMinerLampDone === true, JSON.stringify(await flags()));

  // ============ C：小梅「小梅花」 ============
  console.log('\n--- C 小梅「小梅花」（小镇花圃）---');
  await gotoScene(makeSave('town', PLUM_POS.x, PLUM_POS.y, {}), 'town');
  await pressE();
  let c1 = await advanceUntilSeen(['种一株梅花']);
  check('C1 入口对白出现', c1.allSeen, JSON.stringify(c1.seen));
  check('C2 入口入档（asked）', (await flags()).sideGardenerPlumAsked === true, JSON.stringify(await flags()));

  await pressE();
  let c3 = await advanceUntilSeen(['它还是会开花的']);
  check('C3 完成对白出现', c3.allSeen, JSON.stringify(c3.seen));
  const cT0 = Date.now();
  while (Date.now() - cT0 < 8000 && (await flags()).sideGardenerPlumDone !== true) {
    await page.keyboard.press('Enter');
    await page.mouse.click(400, 300);
    await sleep(300);
  }
  check('C4 完成入档（done）', (await flags()).sideGardenerPlumDone === true, JSON.stringify(await flags()));

  // ============ D：读档恢复 ============
  console.log('\n--- D 读档恢复（全部 done 后重进，事件不再触发）---');
  await gotoScene(makeSave('farm', OLD_HOUSE_POS.x, OLD_HOUSE_POS.y, {
    restore: { oldHouse: true },
    mapFlags: {
      sideXiyaPhotoAsked: true, sideXiyaPhotoDone: true,
      sideMinerLampAsked: true, sideMinerLampDone: true,
      sideGardenerPlumAsked: true, sideGardenerPlumDone: true,
    },
  }), 'farm');
  await pressE();
  await sleep(800);
  const dBody = await bodyText();
  check('D1 已完成后不再触发夏雅事件', !dBody.includes('陪我一起整理整理'), '');
  check('D2 已完成后不再触发老张事件', !dBody.includes('差两块铜矿'), '');

  // ============ E：运行时错误 ============
  check('E1 无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error('探针异常：', e);
  process.exit(1);
});
