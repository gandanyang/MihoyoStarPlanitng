/**
 * FEATURE-041 复兴循环 v0.11（复兴度派生 + 木匠回归 + 常驻 NPC）—— 运行时验证探针
 *
 * 验证（任务卡：docs/tasks/任务-FEATURE041-复兴循环v0.11-复兴度与木匠回归.md）：
 *   A. 复兴度派生（纯逻辑动态 import）：全未恢复→Lv0；garden+oldHouse→Lv1；三建设点→Lv2
 *   B. 未回归（存档驱动）：worldRestore.garden=true（无 oldHouse→Lv0）→ 进 farm 不触发、场景 NPC 列表无木匠
 *   C. 回归触发：worldRestore garden+oldHouse → 进 farm → 自动播 CARPENTER_RETURN_DIALOGUE（木匠演出在老屋旁）
 *   D. 一次性：刷新重进不重复触发（triggerOnce('carpenter_returned') 持久化）
 *   E. 回归后常驻：worldRestore 三建设点 + carpenter_returned → 场景 NPC 列表按日程含木匠
 *   F. 无新存档字段：save 顶层无 revival 字段，worldRestore 结构不变
 *   G. 既有 NPC 结构：共 7 个 NPC（既有 6 + 木匠）；木匠 Alpha 简化日程 3 段；木匠对白池非空
 *   H. 全程无运行时错误
 *
 * 注：动态 import 与游戏静态 import 在 Vite dev 下为不同模块实例（见 probe-ambience.mjs 注），
 *     状态驱动一律走 存档写入 + reload（唯一可靠通道），结果读取走 DOM / localStorage / 场景运行时。
 *     仅 getRevivalLevel（纯函数，只依赖 FarmRestore 自身模块态）可用动态 import 直接验证。
 *
 * 前置：dev server；node probe-revival-v011.mjs
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

const BASE_SAVE = {
  version: '0.5', savedAt: 'revival-v011-probe', timestamp: Date.now(),
  player: { x: 320, y: 460, scene: 'farm', facing: 'down', inventory: { wood: 30, stone: 20 } },
  world: { day: 3, hour: 10, minute: 0, coins: 200, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
  farm: { tiles: [], crops: [], trees: [] },
  story: { storyStep: 'done', ch1TownIntroDone: true },
};

async function run() {
  console.log('=== FEATURE-041 复兴循环 v0.11（复兴度 + 木匠回归）运行时验证 ===\n');
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
  const gotoFarm = async (save, label) => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1000);
    await page.evaluate(({ save, label }) => {
      localStorage.setItem('return_star_save', JSON.stringify({ ...save, savedAt: label }));
    }, { save, label });
    await page.reload({ waitUntil: 'networkidle2' });
    await enterGame('farm');
    await sleep(1200);
  };

  /** farm 场景运行时快照（对白/演出精灵/存档） */
  const SNAP_RUNTIME = `(() => {
    const s = window.__game?.scene?.getScene('farm');
    if (!s) return { sceneLoaded: false };
    const save = JSON.parse(localStorage.getItem('return_star_save') || 'null');
    const ev = save && save.gameState && save.gameState.triggeredEvents;
    return {
      sceneLoaded: true,
      carpenterReturnSprite: !!(s.carpenterReturnSprite && s.carpenterReturnSprite.active),
      dialogueOpen: !!(s.storyDialogue && s.storyDialogue.isOpen()),
      dialogueLines: s.storyDialogue ? (s.storyDialogue.lines || []).map((l) => l.text) : [],
      dialogueSpeakers: s.storyDialogue ? (s.storyDialogue.lines || []).map((l) => l.speaker) : [],
      eventTriggered: !!(ev && ev.carpenter_returned),
      topLevelKeys: save ? Object.keys(save) : [],
      worldRestore: save && save.worldRestore ? save.worldRestore : null,
      npcInScene: (s.npcList || []).map((n) => n.id),
      carpenterFindable: (s.npcList || []).some((n) => n.id === 'carpenter' && n.currentLocation !== 'home'),
    };
  })()`;

  try {
    // 先加载游戏页面（动态 import 需在 dev server 域名下解析）；等待游戏完整启动（boot 会 restore 存档状态，避免竞态）
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    const tBoot = Date.now();
    while (Date.now() - tBoot < 20000) {
      const ready = await page.evaluate(() => !!window.__game);
      if (ready) break;
      await sleep(300);
    }
    await sleep(1500);

    // A. 复兴度派生（纯逻辑：getRevivalLevel 只依赖 FarmRestore 自身模块态，动态 import 可靠）
    const logic = await page.evaluate(async () => {
      const FR = await import('/src/data/FarmRestore.ts');
      const NPC = await import('/src/systems/NPCSystem.ts');
      const out = { lv0: -1, lv1: -1, lv2: -1, npcCount: -1, carpenterSchedule: null, carpenterDialogues: -1 };
      FR.restoreRestoreEntries({});
      out.lv0 = FR.getRevivalLevel();
      FR.restoreRestoreEntries({ garden: true, oldHouse: true });
      out.lv1 = FR.getRevivalLevel();
      FR.restoreRestoreEntries({ garden: true, oldHouse: true, forestRoad: true });
      out.lv2 = FR.getRevivalLevel();
      out.npcCount = NPC.getAllNPCs().length;
      const carp = NPC.getAllNPCs().find((n) => n.id === 'carpenter');
      if (carp) {
        out.carpenterSchedule = carp.schedule.map((e) => `${e.time}@${e.location}`);
        out.carpenterDialogues = carp.dialogues.length;
      }
      return out;
    });

    check('A1 全未恢复 → Lv0', logic.lv0 === 0, `Lv=${logic.lv0}`);
    check('A2 garden+oldHouse → Lv1', logic.lv1 === 1, `Lv=${logic.lv1}`);
    check('A3 三建设点 → Lv2', logic.lv2 === 2, `Lv=${logic.lv2}`);
    check('G1 共 7 个 NPC（既有 6 + 木匠）', logic.npcCount === 7, `count=${logic.npcCount}`);
    check('G2 木匠 Alpha 简化日程 3 段（06 家/08 farm/18 家）',
      !!logic.carpenterSchedule &&
      logic.carpenterSchedule[0] === '06:00@home' &&
      logic.carpenterSchedule[1] === '08:00@farm' &&
      logic.carpenterSchedule[2] === '18:00@home',
      `schedule=${JSON.stringify(logic.carpenterSchedule)}`);
    check('G3 木匠对白池非空', (logic.carpenterDialogues ?? 0) > 0, `dialogues=${logic.carpenterDialogues}`);

    // B. 未回归场景（worldRestore.garden=true 无 oldHouse → Lv0 → 不触发、无木匠）
    // day=1 预置 first_morning_response + adventurer_welcome_back 已触发，排除 day2 清晨及阿风欢迎("你回来了！")等自动对白干扰
    await gotoFarm({
      ...BASE_SAVE,
      world: { ...BASE_SAVE.world, day: 1 },
      worldRestore: { garden: true },
      gameState: { triggeredEvents: { first_morning_response: true, adventurer_welcome_back: true } },
    }, 'revival-not-returned');
    await sleep(4000);
    let d = await page.evaluate(SNAP_RUNTIME);
    check('B1 未回归：对白不自动打开', d.dialogueOpen === false, `dialogueOpen=${d.dialogueOpen}`);
    check('B2 未回归：无木匠演出精灵', d.carpenterReturnSprite === false);
    check('B3 未回归：场景 NPC 列表无木匠', !d.npcInScene.includes('carpenter'), `npc=${d.npcInScene.join(',')}`);

    // C. 回归触发（worldRestore garden+oldHouse → Lv1 → 进 farm 自动触发）
    await gotoFarm({
      ...BASE_SAVE,
      worldRestore: { garden: true, oldHouse: true },
      gameState: { triggeredEvents: { first_morning_response: true, adventurer_welcome_back: true } },
    }, 'revival-return');
    await sleep(4500); // 演出 delayedCall(950ms 触发 + 2600ms 对白)
    d = await page.evaluate(SNAP_RUNTIME);
    check('C1 回归：对白自动打开', d.dialogueOpen === true, `dialogueOpen=${d.dialogueOpen}`);
    check('C2 回归：木匠演出精灵出现在老屋旁', d.carpenterReturnSprite === true);
    check('C3 对白发言人含「木匠老周」', d.dialogueSpeakers.some((s) => s.includes('木匠老周')), `speakers=${d.dialogueSpeakers.join(',')}`);
    check('C4 对白含回归点题句「有人开始修，就有人愿意留下」',
      d.dialogueLines.some((l) => l.includes('有人开始修，就有人愿意留下')));
    await page.screenshot({ path: join(SHOT_DIR, 'revival-v011-return-dialogue.png') });

    // 跳过对白 → 结束回调存档（含 carpenter_returned）
    const skipDialogue = async (maxMs = 20000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) {
        let open = false;
        try {
          open = await page.evaluate(() => !!window.__game?.scene?.getScene('farm')?.storyDialogue?.isOpen());
        } catch (e) { break; } // 页面瞬态导航时跳过本次轮询
        if (!open) return;
        await page.keyboard.press('Enter');
        await sleep(250);
      }
    };
    await skipDialogue();
    await sleep(1200);
    d = await page.evaluate(SNAP_RUNTIME);
    check('C5 存档含 carpenter_returned（一次性持久化）', d.eventTriggered === true, `ev=${d.eventTriggered}`);
    check('F1 存档顶层无 revival 字段', !d.topLevelKeys.includes('revival'), `keys=${d.topLevelKeys.join(',')}`);
    check('F2 worldRestore 结构不变（garden+oldHouse）', d.worldRestore && d.worldRestore.garden === true && d.worldRestore.oldHouse === true, `wr=${JSON.stringify(d.worldRestore)}`);

    // D. 刷新重进 → 不重复触发
    await page.reload({ waitUntil: 'networkidle2' });
    await enterGame('farm');
    await sleep(4500);
    d = await page.evaluate(SNAP_RUNTIME);
    check('D1 重进后对白不再自动打开（一次性）', d.dialogueOpen === false, `dialogueOpen=${d.dialogueOpen}`);
    check('D2 重进后不再出现演出精灵', d.carpenterReturnSprite === false);

    // E. 回归后常驻（worldRestore 三建设点 + carpenter_returned → 场景 NPC 列表按日程含木匠）
    await gotoFarm({
      ...BASE_SAVE,
      worldRestore: { garden: true, oldHouse: true, forestRoad: true },
      gameState: { triggeredEvents: { carpenter_returned: true, first_morning_response: true } },
    }, 'revival-resident');
    d = await page.evaluate(SNAP_RUNTIME);
    check('E1 回归后 farm 场景 NPC 列表含木匠', d.npcInScene.includes('carpenter'), `npc=${d.npcInScene.join(',')}`);
    check('E2 回归后木匠可被找到（非 home）', d.carpenterFindable === true);
    check('E3 回归后不重复触发对白（eventTriggered 且 dialogueOpen=false）', d.eventTriggered === true && d.dialogueOpen === false, `ev=${d.eventTriggered} open=${d.dialogueOpen}`);

    // H. 运行时错误
    const realErrors = errors.filter((e) =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    const real404 = notFound.filter((u) => !u.endsWith('favicon.ico'));
    check('H1 无运行时错误', realErrors.length === 0 && real404.length === 0,
      [...realErrors, ...real404.map((u) => '404: ' + u.replace(GAME_URL, ''))].join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch((err) => { console.error('探针异常:', err); process.exit(1); });
