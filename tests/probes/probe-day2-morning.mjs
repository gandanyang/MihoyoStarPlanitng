/**
 * day2 清晨「岛屿的第一声回应」—— 运行时验证探针
 *
 * 验证（任务卡：docs/tasks/任务-岛屿的第一声回应-day2清晨剧情.md）：
 *   1. day2 清晨进 farm：自动触发（无需靠近）——夏雅出现在老屋门口 + 对白自动打开
 *   2. 对白文案与制作人定稿一致（关键句抽查）
 *   3. 对白结束后：复兴引导任务注入（harvest_any_5 / plant_2 / woodcut_2）+ 存档含 first_morning_response
 *   4. 一次性：刷新重进不重复（对白不自动打开、夏雅不出现）
 *   5. day1（未睡觉）不触发
 *   6. day3+ 清晨 dawnXiya 闲聊回归（未被破坏）
 *   7. 全程无运行时错误
 *
 * 前置：dev server；node probe-day2-morning.mjs
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

/** 读取 farm 场景当前状态（对白/夏雅/任务） */
const SNAP = `(() => {
  const s = window.__game?.scene?.getScene('farm');
  if (!s) return { sceneLoaded: false };
  const save = JSON.parse(localStorage.getItem('return_star_save') || 'null');
  const quests = save && save.world && save.world.dailyQuest ? (save.world.dailyQuest.quests || []) : [];
  const ev = save && save.gameState && save.gameState.triggeredEvents;
  return {
    sceneLoaded: true,
    morningXiya: !!(s.morningXiya && s.morningXiya.active),
    dawnXiya: !!(s.dawnXiya && s.dawnXiya.active),
    dialogueOpen: !!(s.storyDialogue && s.storyDialogue.isOpen()),
    dialogueLines: s.storyDialogue ? (s.storyDialogue.lines || []).map((l) => l.text) : [],
    questIds: quests.map((q) => q.id),
    eventTriggered: !!(ev && ev.first_morning_response),
  };
})()`;

async function run() {
  console.log('=== day2 清晨「岛屿的第一声回应」运行时验证 ===\n');
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
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('div')].find((d) => d.textContent?.includes('建议打开声音游玩'));
        if (el) { el.click(); return true; }
        return false;
      });
      await sleep(350);
    }
    throw new Error(`未能进入场景 ${scene}（实际 ${cur}）页面错误=${errors.slice(0, 5).join(' | ')}`);
  };

  /** 注入存档并进入 farm */
  const gotoFarm = async (day, hour, label, extra = {}) => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1000);
    await page.evaluate(({ day, hour, label, extra }) => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: label, timestamp: Date.now(),
        player: { x: 320, y: 460, scene: 'farm', facing: 'down', inventory: {} },
        world: { day, hour, minute: 0, coins: 200, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
        ...extra,
      }));
    }, { day, hour, label, extra });
    await page.reload({ waitUntil: 'networkidle2' });
    await enterGame('farm');
    await sleep(1200);
  };

  /** 跳过对白（Enter 轮询直到关闭） */
  const skipDialogue = async (maxMs = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const open = await page.evaluate(() => !!window.__game?.scene?.getScene('farm')?.storyDialogue?.isOpen());
      if (!open) return;
      await page.keyboard.press('Enter');
      await sleep(250);
    }
  };

  /** 从 SNAP dialogueLines 精确校验定稿句（打字机 DOM 检测不可靠） */
  const dialogueHas = (lines, text) => lines.some((l) => l.includes(text));

  try {
    // 1) day2 清晨 06:00 新档进 farm → 自动触发
    await gotoFarm(2, 6, 'day2-morning');
    let d = await page.evaluate(SNAP);
    check('A1 day2 进 farm 加载', d.sceneLoaded);
    check('A2 初始未触发（存档无 first_morning_response）', d.eventTriggered === false, `ev=${d.eventTriggered}`);
    // 等演出（MemoryMoment 1s+）+ 对白自动开始（delayedCall 2600ms）
    await sleep(3200);
    d = await page.evaluate(SNAP);
    check('A3 夏雅自动出现在老屋门口（无需靠近）', d.morningXiya === true, `morningXiya=${d.morningXiya}`);
    check('A4 对白自动打开', d.dialogueOpen === true, `dialogueOpen=${d.dialogueOpen}`);
    check('A5 对白含定稿句「早上好，林澈」', dialogueHas(d.dialogueLines, '早上好，林澈'));
    check('A6 对白含定稿句「归星岛，好像又重新呼吸了一次」', dialogueHas(d.dialogueLines, '归星岛，好像又重新呼吸了一次'));
    check('A7 对白含定稿句「植物比人更诚实」', dialogueHas(d.dialogueLines, '植物比人更诚实'));
    await page.screenshot({ path: join(SHOT_DIR, 'day2-morning-dialogue.png') });

    // 2) 跳过对白 → 任务注入 + 存档
    await skipDialogue();
    await sleep(1200);
    d = await page.evaluate(SNAP);
    const ids = d.questIds;
    check('B1 复兴引导任务已注入（大丰收 harvest_any_5）', ids.includes('harvest_any_5'), ids.join(','));
    check('B2 复兴引导任务已注入（播种希望 plant_2）', ids.includes('plant_2'), ids.join(','));
    check('B3 复兴引导任务已注入（伐木初体验 woodcut_2）', ids.includes('woodcut_2'), ids.join(','));
    check('B4 存档含 first_morning_response（一次性持久化）', d.eventTriggered === true, `ev=${d.eventTriggered}`);
    await page.screenshot({ path: join(SHOT_DIR, 'day2-morning-quests.png') });

    // 3) 刷新重进（同存档 day=2）→ 不再重复触发
    await page.reload({ waitUntil: 'networkidle2' });
    await enterGame('farm');
    await sleep(4000);
    d = await page.evaluate(SNAP);
    check('C1 重进后对白不再自动打开（一次性）', d.dialogueOpen === false, `dialogueOpen=${d.dialogueOpen}`);
    check('C2 重进后夏雅不再出现（一次性）', d.morningXiya === false, `morningXiya=${d.morningXiya}`);

    // 4) day1（未睡觉）不触发
    await gotoFarm(1, 6, 'day1-no-trigger');
    await sleep(4000);
    d = await page.evaluate(SNAP);
    check('D1 day1 对白不自动打开', d.dialogueOpen === false, `dialogueOpen=${d.dialogueOpen}`);
    check('D2 day1 夏雅不出现', d.morningXiya === false, `morningXiya=${d.morningXiya}`);

    // 5) day3 清晨 07:00 → dawnXiya 闲聊回归（未破坏）
    await gotoFarm(3, 7, 'day3-dawn-xiya');
    await sleep(1500);
    d = await page.evaluate(SNAP);
    check('E1 day3 清晨 dawnXiya 仍出现（闲聊机制未破坏）', d.dawnXiya === true, `dawnXiya=${d.dawnXiya}`);
    check('E2 day3 不再触发 morning 剧情（仅一次）', d.dialogueOpen === false, `dialogueOpen=${d.dialogueOpen}`);

    // 6) 运行时错误
    const realErrors = errors.filter((e) =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    const real404 = notFound.filter((u) => !u.endsWith('favicon.ico'));
    check('F1 无运行时错误', realErrors.length === 0 && real404.length === 0,
      [...realErrors, ...real404.map((u) => '404: ' + u.replace(GAME_URL, ''))].join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch((err) => { console.error('探针异常:', err); process.exit(1); });
