/**
 * 探针：批 3 存档专项浏览器侧预验证（任务卡：测试轮次 01 批 3）
 *
 * 覆盖「睡觉保存 → 杀进程(≈刷新) → 重开恢复」真实游玩路径：
 *   1. 新档真实游玩：车站 → 大门 → 钥匙开门 → 农场锄/种/浇 → 教程完成(done)（=第一天结束，day=2 清晨）
 *   2. 读存档快照：day=2 / storyStep=done / 清晨时间 / 背包 / 每日任务
 *   3. page.reload() 模拟杀进程重开（localStorage 持久 = WebView 重启后保留）
 *   4. 验证恢复：标题续档 → 场景恢复（非 station/title 重开）→ storyStep 保持 done（教程不重开）
 *      → 背包不丢（reload 前后 inventory 一致）→ 任务面板正常 → 存档 day 一致
 *
 * 前置：dev server 在 localhost:5173
 * 运行：node probe-save-restore.mjs
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, 'test-screenshots', 'save-restore');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';

mkdirSync(SCREENSHOT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
}

async function sceneInfo(page) {
  return page.evaluate(() => ({
    scene: window.__game.scene.getScenes(true)[0]?.scene?.key ?? 'none',
    step: window.debug?.getStoryStep?.(),
    dialogueOpen: (() => {
      const s = window.__game.scene.getScenes(true)[0];
      return s?.storyDialogue?.isOpen?.() ?? false;
    })(),
  }));
}

/** 跳过全屏剧本对话：每行 2 次 advance + 末尾 1 次关闭 */
async function skipDialogue(page, lineCount) {
  const calls = lineCount * 2 + 1;
  for (let i = 0; i < calls; i++) {
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) s.storyDialogue.advance();
    });
    await sleep(60);
  }
  await sleep(400);
}
const waitAndSkipDialogue = async (page, n) => { await sleep(600); await skipDialogue(page, n); };

async function teleport(page, sceneKey, x, y, facing = 'up') {
  await page.evaluate(([k, px, py, f]) => {
    const s = window.__game.scene.getScene(k);
    if (s?.player) { s.player.x = px; s.player.y = py; s.player.facing = f; }
  }, [sceneKey, x, y, facing]);
  await sleep(150);
}
const pressE = async page => { await page.keyboard.press('KeyE'); await sleep(300); };

/** 切场景（先停当前场景，防黑屏风险同源） */
async function gotoScene(page, key, spawn) {
  await page.evaluate(([k, sp]) => {
    const g = window.__game;
    const active = g.scene.getScenes(true)[0];
    if (active && active.scene.key !== k) g.scene.stop(active.scene.key);
    g.scene.start(k, sp ? { spawn: sp } : undefined);
  }, [key, spawn ?? null]);
  await sleep(2600);
}

async function readSave(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('return_star_save');
    if (!raw) return null;
    const d = JSON.parse(raw);
    return {
      day: d.world?.day,
      hour: d.world?.hour,
      minute: d.world?.minute,
      storyStep: d.story?.storyStep,
      scene: d.player?.scene,
      coins: d.world?.coins,
      inventory: d.player?.inventory ?? null,
      quests: d.world?.dailyQuest?.quests ?? null,
      questDay: d.world?.dailyQuest?.currentDay ?? null,
    };
  });
}

async function run() {
  console.log('=== 批 3 存档专项预验证：睡觉保存 → 杀进程 → 恢复 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [err] ${msg.text().substring(0, 160)}`);
  });

  try {
    // ===== 1. 新档启动，走教程 =====
    console.log('--- 1. 新档真实游玩（车站→大门→农场教程） ---');
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);

    let info = await sceneInfo(page);
    check('1a. 启动停靠标题', info.scene === 'title', `场景=${info.scene}`);
    await page.keyboard.press('Enter');
    await sleep(2000);
    info = await sceneInfo(page);
    check('1b. 进入车站', info.scene === 'station', `场景=${info.scene}`);

    // 跳过车站开场动画
    await page.evaluate(() => {
      const btn = document.getElementById('intro-skip-btn');
      if (btn) btn.click();
    });
    await sleep(800);
    await teleport(page, 'station', 970, 460, 'right');
    await sleep(3500);
    info = await sceneInfo(page);
    check('1c. 进入大门', info.scene === 'gate', `场景=${info.scene}`);

    // 与夏雅对话（7 行）→ 钥匙
    await teleport(page, 'gate', 248, 204, 'up');
    await pressE(page);
    await waitAndSkipDialogue(page, 7);
    info = await sceneInfo(page);
    check('1d. 获得钥匙', info.step === 'get_key', `步骤=${info.step}`);

    // 背包用钥匙开门
    await page.evaluate(() => {
      window.__game.scene.getScene('gate')?.backpackPanel?.open();
    });
    await sleep(800);
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-action="use-key"]');
      if (btn) btn.click();
    });
    await sleep(500);
    await waitAndSkipDialogue(page, 10); // GATE_OPENED_DIALOGUE 10 行

    // 进入农场 → 锄/种/浇
    await teleport(page, 'gate', 240, 30, 'up');
    await sleep(2500);
    info = await sceneInfo(page);
    check('1e. 进入农场', info.scene === 'farm', `场景=${info.scene}`);

    for (let i = 0; i < 3; i++) {
      await teleport(page, 'farm', (13 + i) * 16 + 8, 10 * 16 + 20, 'up');
      await pressE(page);
      await sleep(400);
    }
    await waitAndSkipDialogue(page, 3); // 锄地 → 播种教学
    await page.keyboard.press('KeyR');
    await sleep(200);
    for (let i = 0; i < 3; i++) {
      await teleport(page, 'farm', (13 + i) * 16 + 8, 10 * 16 + 20, 'up');
      await pressE(page);
      await sleep(400);
    }
    await waitAndSkipDialogue(page, 7); // 播种 → 浇水教学
    for (let i = 0; i < 3; i++) {
      await teleport(page, 'farm', (13 + i) * 16 + 8, 10 * 16 + 20, 'up');
      await pressE(page);
      await sleep(400);
    }
    await waitAndSkipDialogue(page, 7); // 浇水 → 睡觉提示

    // 进屋 → 床边教程完成 → 床上普通睡觉(day+1)
    await teleport(page, 'farm', 6 * 16 + 8, 20 * 16, 'up');
    await sleep(2500);
    info = await sceneInfo(page);
    check('1f. 进入木屋', info.scene === 'house', `场景=${info.scene}`);
    await teleport(page, 'house', 40, 72, 'up');
    await pressE(page);
    await sleep(1500);
    info = await sceneInfo(page);
    check('1g. 教程完成(done)', info.step === 'done', `步骤=${info.step}`);
    const afterTutorial = await readSave(page);
    check('1h. 教程完成=第一天结束（day=2, 清晨）', afterTutorial?.day === 2 && afterTutorial?.hour >= 6 && afterTutorial?.hour <= 9, `day=${afterTutorial?.day}, hour=${afterTutorial?.hour}`);

    // ===== 2. 读存档快照 =====
    console.log('\n--- 2. 教程完成后存档快照 ---');
    const saveA = await readSave(page);
    check('2a. 存档 day=2（教程完成已跨天）', saveA?.day === 2, `day=${saveA?.day}`);
    check('2b. storyStep=done', saveA?.storyStep === 'done', `步骤=${saveA?.storyStep}`);
    check('2c. 时间为清晨（hour 6-9）', saveA?.hour >= 6 && saveA?.hour <= 9, `hour=${saveA?.hour}:${String(saveA?.minute ?? 0).padStart(2, '0')}`);
    check('2d. 背包含工具（非空）', saveA?.inventory && Object.keys(saveA.inventory).length > 0, `inventory=${JSON.stringify(saveA?.inventory)}`);
    check('2e. 每日任务已生成', Array.isArray(saveA?.quests) && saveA.quests.length > 0, `任务数=${saveA?.quests?.length}`);
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'save-after-sleep.png') });

    // ===== 3. 刷新（≈杀进程重开） =====
    console.log('\n--- 3. 杀进程重开（reload） ---');
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);
    info = await sceneInfo(page);
    check('3a. 重开停靠标题', info.scene === 'title', `场景=${info.scene}`);
    const saveTitle = await readSave(page);
    console.log(`  [debug] title 阶段存档 day=${saveTitle?.day}（saveA.day=${saveA?.day}）`);
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'reopen-title.png') });

    await page.keyboard.press('Enter');
    await sleep(2500);

    // ===== 4. 验证恢复 =====
    console.log('\n--- 4. 恢复验证 ---');
    info = await sceneInfo(page);
    check('4a. 恢复进游戏（非 station/title 重开）', info.scene === 'farm' || info.scene === 'house', `场景=${info.scene}`);
    check('4b. 教程不重开（storyStep 保持 done）', info.step === 'done', `步骤=${info.step}`);
    check('4c. 无残留对白窗口', info.dialogueOpen === false);
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'reopen-ingame.png') });

    // 存档数据 reload 前后一致
    const saveB = await readSave(page);
    check('4d. 存档 day 不重置', saveB?.day === saveA?.day, `day=${saveB?.day}`);
    check('4e. 存档 storyStep 不重置', saveB?.storyStep === saveA?.storyStep, `步骤=${saveB?.storyStep}`);
    check('4f. 背包不丢（inventory 一致）', JSON.stringify(saveB?.inventory) === JSON.stringify(saveA?.inventory));
    check('4g. 每日任务保留', JSON.stringify(saveB?.quests) === JSON.stringify(saveA?.quests), `任务数=${saveB?.quests?.length}`);

    // UI 层：切到农场再验证面板（questPanel/backpackPanel 仅 MapScene 挂载，恢复点在 house 床上无面板）
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    await page.evaluate(() => {
      window.__game.scene.getScene('farm')?.questPanel?.open();
    });
    await sleep(400);
    const qp = await page.evaluate(() => {
      const el = document.querySelector('#quest-panel');
      if (!el || el.style.display === 'none') return { open: false, items: 0 };
      return { open: true, items: el.querySelectorAll('#qp-body > div').length };
    });
    check('4h. 任务面板可打开', qp.open === true);
    check('4i. 任务面板有内容', qp.items > 0, `条目=${qp.items}`);
    await page.evaluate(() => {
      document.querySelector('#quest-panel')?.querySelector('[data-action="close"]')?.click();
    });
    await sleep(200);

    // 背包面板可打开（UI 层工具可见）
    await page.evaluate(() => {
      window.__game.scene.getScene('farm')?.backpackPanel?.open();
    });
    await sleep(400);
    const bp = await page.evaluate(() => {
      const el = document.querySelector('#backpack-panel');
      if (!el || el.style.display === 'none') return { open: false, slots: 0 };
      return { open: true, slots: el.querySelectorAll('.bp-slot, [class*="slot"], [data-item]').length };
    });
    check('4j. 背包面板可打开', bp.open === true);
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'reopen-panels.png') });

    // ===== 汇总 =====
    console.log('\n\n========== 结果 ==========');
    let pass = 0, fail = 0;
    for (const r of results) { r.ok ? pass++ : fail++; console.log(`${r.ok ? '✅' : '❌'} ${r.name}`); }
    console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
    console.log(`截图: ${SCREENSHOT_DIR}`);
    process.exitCode = fail > 0 ? 1 : 0;

  } catch (e) {
    console.error('\n❌ 探针异常:', e.message);
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'error-state.png') }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
