/**
 * 第一章体验走查（Batch C 前置：第一章全流程取证）
 *
 * 序章部分快速跳过（已由 probe-prologue-walkthrough 取证），
 * 从第一章开始逐节点：不跳过对白，逐行抓取文本 + 截图。
 *
 * 流程：town（小镇开场 5 行）→ 镇长接任务（10 行）→ forest 采集（9 行 + 童年记忆闪回 overlay 推进）
 *      → 交付（10 行，村长爷爷观星引导）→ 观星夜（18 行 + 三选项分支 + 汇聚结尾）
 *
 * 前置：dev server 在 localhost:5173
 * 运行：node tests/probes/probe-ch1-walkthrough.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(__dirname, 'test-screenshots', 'walkthrough-ch1');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/?reset=1';

mkdirSync(SHOT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const nodes = [];
let shotIdx = 0;

async function shot(page, label) {
  shotIdx++;
  const path = join(SHOT_DIR, `${String(shotIdx).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path });
  console.log(`  📸 ${String(shotIdx).padStart(2, '0')}-${label}.png`);
  return path;
}

async function sceneInfo(page) {
  return page.evaluate(() => ({
    scene: window.__game?.scene?.getScenes(true)?.[0]?.scene?.key ?? 'none',
    step: window.debug?.getStoryStep?.(),
  }));
}

async function teleport(page, sceneKey, x, y, facing = 'up') {
  await page.evaluate(([k, px, py, f]) => {
    const s = window.__game.scene.getScene(k);
    if (!s?.player) return;
    s.player.x = px; s.player.y = py; s.player.facing = f;
  }, [sceneKey, x, y, facing]);
  await sleep(150);
}

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

/** 快速跳过一段对白（序章复用，lineCount 行） */
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

/** 读取当前对白行（含选项） */
async function readLine(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0];
    const d = s?.storyDialogue;
    if (!d || !d.isOpen()) return null;
    const l = d.lines[d.index];
    if (!l) return null;
    return {
      speaker: l.speaker ?? '',
      text: l.text,
      inner: !!l.inner,
      options: l.options ?? null,
    };
  });
}

/**
 * 逐行走完一段对话并记录全部行文本。
 * 遇选项行：记录选项并停下（不 advance），返回 { lines, options, stoppedAtChoice }。
 */
async function walkDialogue(page, label) {
  await sleep(600);
  const lines = [];
  let stoppedAtChoice = false;
  let options = null;
  for (let i = 0; i < 60; i++) {
    const open = await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      return s?.storyDialogue?.isOpen?.() ?? false;
    });
    if (!open) break;
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      const d = s?.storyDialogue;
      if (d?.isOpen() && d.typing) d.advance();
    });
    await sleep(150);
    const line = await readLine(page);
    if (!line) break;
    if (line.options) {
      stoppedAtChoice = true;
      options = line.options;
      break;
    }
    lines.push(line);
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      const d = s?.storyDialogue;
      if (d?.isOpen()) d.advance();
    });
    await sleep(80);
  }
  await sleep(300);
  const info = await sceneInfo(page);
  nodes.push({ type: 'dialogue', label, lines, options, stoppedAtChoice, after: info });
  console.log(`\n--- 对话[${label}] ${lines.length} 行${stoppedAtChoice ? ' + 选项' : ''} ---`);
  for (const l of lines) {
    console.log(`  ${l.speaker ? `[${l.speaker}]` : l.inner ? '(内心)' : '(旁白)'} ${l.text}`);
  }
  if (stoppedAtChoice) {
    console.log(`  【选项】${options.join(' / ')}`);
  }
  return { lines, options, stoppedAtChoice };
}

async function pressE(page) { await page.keyboard.press('KeyE'); await sleep(300); }

/**
 * 推进记忆闪回 overlay 直到关闭（碎片采集后播放，9bf2ad8 加入）。
 * 每轮 pointerdown 一次（typing 中=显示全文，否则=关闭）。返回是否成功关闭。
 */
async function advanceFlashback(page, maxRounds = 30) {
  for (let i = 0; i < maxRounds; i++) {
    const state = await page.evaluate(() => {
      const el = document.getElementById('memory-flashback-overlay');
      if (!el) return 'absent';
      const visible = el.style.display !== 'none';
      if (!visible) return 'hidden';
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return 'clicked';
    });
    if (state === 'hidden' || state === 'absent') { await sleep(1400); return true; }
    await sleep(200);
  }
  return false;
}

async function run() {
  console.log('=== 第一章体验走查（序章快进 + 第一章逐节点）===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const pageErrs = [];
  page.on('pageerror', e => pageErrs.push(e.message));

  try {
    // ============ 0. 序章快进 ============
    console.log('\n--- 序章快进（已由序章走查取证）---');
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(2500);
    await page.keyboard.press('Enter');
    await sleep(2500);
    // 点开音量提示 + 手机通知（两页）关闭（轮询）
    for (let i = 0; i < 40; i++) {
      const done = await page.evaluate(() => {
        // 音量提示（zIndex 650）挡在手机通知前，需先点击
        const prompt = [...document.querySelectorAll('div')].find(d =>
          d.style?.zIndex === '650' && d.style?.opacity !== '0' && d.textContent?.includes('建议打开声音游玩'));
        if (prompt) { prompt.click(); return 'clicked'; }
        // 手机通知（zIndex 600，两页需点击两次：翻页 → 关闭）
        const phone = [...document.querySelectorAll('div')].find(d =>
          d.style?.zIndex === '600' && d.style?.display !== 'none' && d.style?.opacity !== '0');
        if (phone) { phone.click(); return 'clicked'; }
        const s = window.__game?.scene?.getScenes(true)?.[0];
        return s?.storyDialogue?.isOpen?.() ? 'dialogue' : '';
      });
      if (done === 'dialogue') break;
      await sleep(250);
    }
    await skipDialogue(page, 9); // 车站对白 9 行
    await page.evaluate(() => {
      window.debug.setStoryStep('done');
      window.debug.setTime(10, 0);
    });
    console.log('  序章已快进，storyStep=done');

    // ============ 1. 进入小镇（TOWN_INTRO） ============
    console.log('\n--- 节点 1: 进入小镇 ---');
    await gotoScene(page, 'town', { x: 200, y: 300 });
    await shot(page, 'town-arrive');
    await walkDialogue(page, 'town-intro');
    await shot(page, 'town-after-intro');

    // ============ 2. 镇长接任务（ELDER_QUEST） ============
    console.log('\n--- 节点 2: 镇长接任务 ---');
    await teleport(page, 'town', 216, 184, 'up');
    await pressE(page);
    await walkDialogue(page, 'elder-quest');
    await shot(page, 'town-after-elder');

    // ============ 3. 森林采集（FOREST_SHARD） ============
    console.log('\n--- 节点 3: 森林采集 ---');
    await gotoScene(page, 'forest', { x: 328, y: 200 });
    await shot(page, 'forest-arrive');
    await teleport(page, 'forest', 328, 184, 'up');
    await pressE(page);
    await walkDialogue(page, 'forest-shard');
    // 采集后播放童年记忆闪回 overlay：推进直到关闭，否则 collectShard 回调不触发
    console.log('  推进记忆闪回…');
    const flashbackClosed = await advanceFlashback(page);
    nodes.push({ type: 'screen', label: 'flashback', closed: flashbackClosed });
    console.log(`  闪回关闭=${flashbackClosed}`);
    await sleep(1500); // 等 collectShard + 视觉清理回调链
    await shot(page, 'forest-after-collect');

    // ============ 4. 交付（SHARD_DELIVER） ============
    console.log('\n--- 节点 4: 交付 ---');
    await gotoScene(page, 'town', { x: 200, y: 300 });
    await teleport(page, 'town', 216, 184, 'up');
    await pressE(page);
    await walkDialogue(page, 'shard-deliver');
    await shot(page, 'town-after-deliver');

    // ============ 5. 观星夜（DEMO_ENDING） ============
    console.log('\n--- 节点 5: 观星夜 ---');
    await page.evaluate(() => window.debug.setTime(21, 0));
    await gotoScene(page, 'farm', { x: 480, y: 300 });
    const stargazeVisible = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return !!(s?.stargazeMark?.visible);
    });
    console.log(`  观星点可见=${stargazeVisible}`);
    nodes.push({ type: 'screen', label: 'stargaze-marker', visible: stargazeVisible });
    await shot(page, 'stargaze-marker');

    await teleport(page, 'farm', 504, 240, 'up');
    await pressE(page);
    await shot(page, 'stargaze-night');
    // 观星夜对话在 camera.pan(2s) 完成后才播放，先等镜头到位
    await sleep(3200);
    const ending = await walkDialogue(page, 'demo-ending');
    await shot(page, 'demo-ending-choice');

    // 选项分支：选 1（try_stay）
    if (ending.stoppedAtChoice) {
      console.log('\n--- 节点 5b: 选择分支「留下看看」---');
      await page.keyboard.press('Digit1');
      await sleep(800);
      await walkDialogue(page, 'branch-try-stay');
      await shot(page, 'branch-try-stay');
      // 分支 onComplete 无缝续播 DEMO_ENDING_FINALE（已被上面 walkDialogue 完整读取，共 4+5 行），
      // 结尾收束为结算面板（EndingPanel）。等待晨曦过渡后验证面板出现。
      await sleep(6000);
      const endingPanelOpen = await page.evaluate(() => {
        const p = document.getElementById('ending-panel');
        return !!p && p.style.display !== 'none' && p.style.display !== '';
      });
      console.log(`  结算面板打开=${endingPanelOpen}`);
      nodes.push({ type: 'screen', label: 'ending-panel', open: endingPanelOpen });
      await shot(page, 'demo-finale');
    }

    // ============ 汇总 ============
    const logPath = join(SHOT_DIR, 'walkthrough-ch1-log.json');
    writeFileSync(logPath, JSON.stringify({ pageErrs, nodes }, null, 2));
    console.log(`\n\n========== 第一章走查完成 ==========`);
    console.log(`截图目录: ${SHOT_DIR}`);
    console.log(`记录文件: ${logPath}`);
    console.log(`运行时错误: ${pageErrs.length} 条`);
    for (const e of pageErrs) console.log(`  [err] ${e}`);
  } finally {
    await browser.close();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
