/**
 * 探针脚本：观星夜收尾链路验证（定稿 v0.3）
 *
 * 验证目标：
 *   1. 主线完成后夜晚前往观星点按 E → 播放 DEMO_ENDING_DIALOGUE
 *   2. 静默镜头后出现三选项（StoryDialogue 选项行）
 *   3. 选择 B → 播放对应分支独白 → 次日清晨 FINALE
 *   4. 结算面板打开；storyStep === 'observatory_complete' 且已入存档
 *
 * 前置条件：Vite dev server 运行在 localhost:5173
 * 运行：node probe-stargaze.mjs
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, 'test-screenshots');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';

mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = [];
function result(step, passed, detail = '') {
  const icon = passed ? '✅' : '❌';
  const msg = `${icon} ${step}: ${passed ? '通过' : '失败'}${detail ? ' - ' + detail : ''}`;
  results.push(msg);
  console.log(msg);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function screenshot(page, name) {
  const path = join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`  📸 ${name}.png`);
}

async function sceneInfo(page) {
  return page.evaluate(() => ({
    scene: window.__game.scene.getScenes(true)[0]?.scene?.key ?? 'none',
    step: window.debug?.getStoryStep?.(),
  }));
}

/** 每行 2 次（打字机 + 下一行）+ 1 次关闭；选项行 advance 会被拦截，多余调用无害 */
async function skipDialogue(page, lineCount) {
  const calls = lineCount * 2 + 1;
  for (let i = 0; i < calls; i++) {
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) s.storyDialogue.advance();
    });
    await sleep(50);
  }
  await sleep(400);
}

/** 等待对话开始后再跳过 */
async function waitAndSkipDialogue(page, lineCount) {
  await sleep(700);
  await skipDialogue(page, lineCount);
}

/** 当前对话文本（诊断用） */
async function dialogueText(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0];
    return s?.storyDialogue?.isOpen?.() ? (s.storyDialogue.textEl?.textContent ?? '') : '<closed>';
  });
}

/** 场景诊断 */
async function diag(page, label) {
  const d = await page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0];
    const key = s?.scene?.key;
    return {
      scene: key,
      step: window.debug?.getStoryStep?.(),
      dlgOpen: !!s?.storyDialogue?.isOpen?.(),
      npcCount: s?.npcList?.length ?? -1,
      elderSprite: !!s?.npcList?.find?.(n => n.id === 'elder')?.sprite,
      shardSprite: !!s?.shardSprite,
      stargazeVisible: key === 'farm' ? !!(s?.stargazeMark?.visible) : null,
    };
  });
  console.log(`  [diag:${label}] ${JSON.stringify(d)}`);
}

async function teleport(page, sceneKey, x, y, facing = 'up') {
  await page.evaluate(([k, px, py, f]) => {
    const s = window.__game.scene.getScene(k);
    if (!s?.player) return;
    s.player.x = px;
    s.player.y = py;
    s.player.facing = f;
  }, [sceneKey, x, y, facing]);
  await sleep(150);
}

/** 精确推进 n 行（每行 2 次：打字机 + 下一行），用于中间检查 */
async function advanceN(page, n) {
  for (let i = 0; i < n * 2; i++) {
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) s.storyDialogue.advance();
    });
    await sleep(50);
  }
  await sleep(250);
}

async function pressE(page) {
  await page.keyboard.press('KeyE');
  await sleep(300);
}

async function gotoScene(page, key, spawn) {
  await page.evaluate(([k, sp]) => {
    const g = window.__game;
    const active = g.scene.getScenes(true)[0];
    // SceneManager.start 不会自动停掉当前场景（会双场景 RUNNING，与黑屏风险同源）
    if (active && active.scene.key !== k) {
      g.scene.stop(active.scene.key);
    }
    g.scene.start(k, sp ? { spawn: sp } : undefined);
  }, [key, spawn ?? null]);
  await sleep(2600);
}

async function run() {
  console.log('=== 观星夜收尾链路探针（定稿 v0.3）===\n');

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
    // ---------- 准备：清档 → 教程完成 → 时间 10:00 ----------
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);

    await page.evaluate(() => {
      window.debug.setStoryStep('done');
      window.debug.setTime(10, 0);
    });

    // ---------- 第一章：镇长接任务 ----------
    await gotoScene(page, 'town', { x: 200, y: 300 });
    await diag(page, 'town-in');
    await waitAndSkipDialogue(page, 5); // TOWN_INTRO_DIALOGUE 5 行
    await diag(page, 'town-after-intro');

    await teleport(page, 'town', 216, 184, 'up'); // 村长 (216,168)
    await pressE(page);
    await sleep(700);
    const elderText = await dialogueText(page);
    result('镇长委托对话已播放', elderText.includes('你就是林澈吧'), elderText.substring(0, 40));
    await skipDialogue(page, 11); // ELDER_QUEST_DIALOGUE 11 行 → accepted

    // ---------- 森林采集（程序员能力展示对话 → 自动采集） ----------
    await gotoScene(page, 'forest', { x: 328, y: 200 });
    await diag(page, 'forest-in');
    await teleport(page, 'forest', 328, 184, 'up'); // 碎片 (328,168)
    await pressE(page);
    await diag(page, 'forest-after-e');
    await advanceN(page, 3); // 精确推进 3 行，停在"更像一个长期没有维护的系统"
    await sleep(900); // 等待该行打字机播完
    const forestText = await dialogueText(page);
    result('森林对话：程序员能力展示', forestText.includes('更像一个长期没有维护的系统'), forestText.substring(0, 40));
    await skipDialogue(page, 6); // FOREST_SHARD_DIALOGUE 9 行，剩 6 行 + 关闭 → 自动采集

    // ---------- 返回小镇交付 ----------
    await gotoScene(page, 'town', { x: 200, y: 300 });
    await diag(page, 'town2-in');
    await teleport(page, 'town', 216, 184, 'up');
    await pressE(page);
    await diag(page, 'town2-after-e');
    await waitAndSkipDialogue(page, 8); // SHARD_DELIVER_DIALOGUE 8 行 → completed

    // ---------- 夜晚 → 农场观星点 ----------
    await page.evaluate(() => window.debug.setTime(21, 0));
    await gotoScene(page, 'farm', { x: 480, y: 300 });
    await diag(page, 'farm-in');
    await teleport(page, 'farm', 504, 240, 'up'); // 观星点 (504,232)
    await pressE(page);
    await diag(page, 'farm-after-e');
    await sleep(700);
    const endOpen1 = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return s?.storyDialogue?.isOpen?.() ?? false;
    });
    result('观星夜对话已打开', endOpen1);
    const endText1 = await dialogueText(page);
    result('观星夜开场文本', endText1.includes('星空格外明亮'), endText1.substring(0, 40));

    // 推进 1 行到夏雅台词，验证立绘头像（§8.5 方案 A）
    await advanceN(page, 1);
    const portraitSrc = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const img = s?.storyDialogue?.portraitEl?.querySelector('img');
      return img ? img.getAttribute('src') : '';
    });
    result('夏雅立绘头像显示', portraitSrc.includes('xiya.png'), portraitSrc || '<无立绘>');

    // 跳过 16 行（静默镜头在内），停到选项行（DEMO_ENDING_DIALOGUE 现为 17 文本行 + 选项 index=17，较原 15 行增补 3 行）
    await skipDialogue(page, 16);
    const options = await page.evaluate(() =>
      [...document.querySelectorAll('button')].map(b => b.textContent?.trim()).filter(t => /^\d\./.test(t ?? ''))
    );
    result('三选项渲染', options.length === 3, JSON.stringify(options));
    result('选项 A 为「至少现在，我想留下来看看」', options[0]?.includes('至少现在') === true, options[0] ?? '');
    await screenshot(page, 'stargaze-options');

    // 选择 B：我想先弄清楚爷爷到底在这里经历了什么
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('我想先弄清楚'));
      btn?.click();
    });
    await sleep(600);
    const branchText = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return s?.storyDialogue?.textEl?.textContent ?? '';
    });
    result('分支 B 独白', branchText.includes('爷爷在这里留下的东西'), branchText.substring(0, 40));
    await screenshot(page, 'stargaze-branch');

    await skipDialogue(page, 4); // unknown 分支 4 行 → FINALE
    await skipDialogue(page, 5); // FINALE 5 行 → 结算面板

    const panel = await page.evaluate(() => {
      const el = document.getElementById('ending-panel');
      return { exists: !!el, display: el?.style.display ?? '' };
    });
    result('结算面板打开', panel.exists && panel.display === 'flex', JSON.stringify(panel));
    await screenshot(page, 'stargaze-ending-panel');

    // A6：归星记录内容真实渲染（五段 + 标题）——此前只验纯函数，这里补真实面板内容断言
    const record = await page.evaluate(() => {
      const sec = document.querySelector('#gx-sections');
      const hdr = document.querySelector('#gx-header');
      const stats = document.querySelector('#gx-stats');
      return {
        sectionsFilled: !!sec && sec.innerHTML.trim().length > 0,
        sectionsCount: sec?.querySelectorAll('div[style*="border-left"]').length ?? 0,
        hasTitle: hdr?.textContent?.includes('归星记录') ?? false,
        hasStats: !!stats && stats.textContent?.includes('第') === true,
      };
    });
    result('归星记录内容渲染（标题+五段+脚注）',
      record.hasTitle && record.sectionsFilled && record.sectionsCount >= 5 && record.hasStats,
      JSON.stringify(record));

    const info = await sceneInfo(page);
    result('storyStep = observatory_complete', info.step === 'observatory_complete', `步骤=${info.step}`);

    const saved = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('return_star_save');
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    });
    result('存档含 observatory_complete', saved?.story?.storyStep === 'observatory_complete', saved?.story?.storyStep ?? 'null');
    result('存档无 demoEndingDone 字段', saved?.story?.demoEndingDone === undefined, JSON.stringify(saved?.story ?? {}));

    // 关闭面板 → 自由模式
    await page.evaluate(() => {
      document.querySelector('#ending-panel [data-action="continue"]')?.click();
    });
    await sleep(300);
    const closed = await page.evaluate(() => {
      const el = document.getElementById('ending-panel');
      return el?.style.display ?? '';
    });
    result('继续自由游玩可关闭面板', closed === 'none', `display=${closed}`);

    // ---------- 汇总 ----------
    const pass = results.filter(r => r.startsWith('✅')).length;
    const fail = results.filter(r => r.startsWith('❌')).length;
    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('探针异常:', err);
  process.exit(1);
});
