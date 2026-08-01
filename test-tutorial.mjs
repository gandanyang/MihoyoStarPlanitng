/**
 * E2E 测试脚本 — 新玩家完整流程（v0.5 定义）
 * 使用 puppeteer-core + Chrome 自动化测试
 *
 * 测试目标（v0.5 重新定义，不再沿用旧假设）：
 *   启动 → title → enter → station → 完成教程 → 进入 farm
 *
 * 详细步骤：
 *   1. 加载游戏 → 应停留在 title（标题画面）
 *   2. 按 Enter → 进入 station（车站序章）
 *   3. 点击「跳过开场」→ 允许移动
 *   4. 走到出口 → 进入 gate（庄园大门，教程地图）
 *   5. 与夏雅对话 → 获得庄园钥匙
 *   6. 打开背包使用钥匙 → 打开大门
 *   7. 穿过大门 → 进入 farm（农场）
 *   8. 锄地×3 → 播种×3 → 浇水×3 → 睡觉 → 教程完成(done)
 *
 * 前置条件: Vite dev server 运行在 localhost:5173
 * 运行: node test-tutorial.mjs
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

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function screenshot(page, name) {
  const path = join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`  📸 ${name}.png`);
}

/** 读取当前激活场景 key + 剧情步骤 */
async function sceneInfo(page) {
  return page.evaluate(() => ({
    scene: window.__game.scene.getScenes(true)[0]?.scene?.key ?? 'none',
    step: window.debug?.getStoryStep?.(),
  }));
}

/**
 * 直接调用 storyDialogue.advance() 跳过全屏剧本对话
 * 每行需 2 次（跳过打字机 + 翻到下一行）+ 最后 1 次关闭
 */
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

/** 等待对话开始后再跳过 */
async function waitAndSkipDialogue(page, lineCount) {
  await sleep(600); // 等待对话开始
  await skipDialogue(page, lineCount);
}

/** 把玩家瞬移到指定坐标并设置朝向（靠近目标交互用） */
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

/** 按一次 E（触发交互） */
async function pressE(page) {
  await page.keyboard.press('KeyE');
  await sleep(300);
}

async function run() {
  console.log('=== 归星物语 新玩家完整流程 E2E 测试（v0.5）===\n');

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
    // ==================== STEP 1: 启动 → title ====================
    console.log('\n--- Step 1: 启动 → title ---');
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);

    let info = await sceneInfo(page);
    result('1. 启动停靠标题画面', info.scene === 'title', `场景=${info.scene}, 步骤=${info.step}`);
    if (info.scene !== 'title') throw new Error(`预期 title，实际 ${info.scene}`);
    await screenshot(page, 'step1-title');

    // ==================== STEP 2: title → station ====================
    console.log('\n--- Step 2: 按 Enter 进入车站 ---');
    await page.keyboard.press('Enter');
    await sleep(2000);

    info = await sceneInfo(page);
    result('2. 进入车站', info.scene === 'station', `场景=${info.scene}`);
    if (info.scene !== 'station') throw new Error(`预期 station，实际 ${info.scene}`);

    // ==================== STEP 3: 跳过车站开场 ====================
    console.log('\n--- Step 3: 跳过开场动画 ---');
    const skipped = await page.evaluate(() => {
      const btn = document.getElementById('intro-skip-btn');
      if (btn) { btn.click(); return true; }
      return false;
    });
    await sleep(800);
    result('3. 跳过开场', skipped, skipped ? '已点击跳过' : '跳过按钮未找到');

    // ==================== STEP 4: station → gate（走出口） ====================
    console.log('\n--- Step 4: 走出车站 → 大门 ---');
    await teleport(page, 'station', 970, 460, 'right');
    await sleep(3500); // fadeOut(800) + 场景加载

    info = await sceneInfo(page);
    result('4. 进入大门地图', info.scene === 'gate', `场景=${info.scene}, 步骤=${info.step}`);
    if (info.scene !== 'gate') throw new Error(`预期 gate，实际 ${info.scene}`);
    await sleep(800);
    await screenshot(page, 'step4-gate-xiya');

    const gateState = await page.evaluate(() => {
      const s = window.__game.scene.getScene('gate');
      return { gateWall: !!s?.gateWall, xiya: !!s?.xiyaSprite };
    });
    result('4a. 大门物理墙存在', gateState.gateWall);
    result('4b. 夏雅存在', gateState.xiya);

    // ==================== STEP 5: 与夏雅对话 → 获得钥匙 ====================
    console.log('\n--- Step 5: 与夏雅对话 ---');
    // 夏雅在 gate (15*16+8, 11*16+8)=(248,184)，玩家靠到旁边按 E
    await teleport(page, 'gate', 248, 204, 'up');
    await pressE(page);
    await waitAndSkipDialogue(page, 9); // XIYA_DIALOGUE 9 行

    info = await sceneInfo(page);
    result('5. 获得庄园钥匙', info.step === 'get_key', `步骤=${info.step}`);

    // ==================== STEP 6: 背包使用钥匙 → 开门 ====================
    console.log('\n--- Step 6: 使用庄园钥匙开门 ---');
    await page.evaluate(() => {
      window.__game.scene.getScene('gate')?.backpackPanel?.open();
    });
    await sleep(800);
    const keyClicked = await page.evaluate(() => {
      const btn = document.querySelector('button[data-action="use-key"]');
      if (btn) { btn.click(); return true; }
      return false;
    });
    result('6a. 点击「使用」钥匙', keyClicked);
    await sleep(500);
    await waitAndSkipDialogue(page, 7); // GATE_OPENED_DIALOGUE 7 行

    info = await sceneInfo(page);
    const afterKey = await page.evaluate(() => {
      const s = window.__game.scene.getScene('gate');
      return { gateGone: !s?.gateWall, hasHoe: true };
    });
    result('6b. 大门已打开', info.step === 'clear_land' && afterKey.gateGone,
      `步骤=${info.step}, 大门消失=${afterKey.gateGone}`);

    // ==================== STEP 7: gate → farm（穿过大门） ====================
    console.log('\n--- Step 7: 穿过大门 → 农场 ---');
    await teleport(page, 'gate', 240, 30, 'up'); // gate 顶部出口区域 (224..272, 0..48)
    await sleep(2500);

    info = await sceneInfo(page);
    result('7. 进入农场', info.scene === 'farm' && info.step === 'clear_land',
      `场景=${info.scene}, 步骤=${info.step}`);
    if (info.scene !== 'farm') throw new Error(`预期 farm，实际 ${info.scene}`);
    await sleep(800);
    await screenshot(page, 'step7-farm');

    // ==================== STEP 8: 锄地 ×3 ====================
    console.log('\n--- Step 8: 锄地 ×3 ---');
    for (let i = 0; i < 3; i++) {
      await teleport(page, 'farm', (13 + i) * 16 + 8, 10 * 16 + 20, 'up');
      await pressE(page);
      await sleep(400);
    }
    await waitAndSkipDialogue(page, 7); // SOW_SEEDS_DIALOGUE 7 行

    info = await sceneInfo(page);
    result('8. 锄地完成 → 播种教学', info.step === 'sow_seeds', `步骤=${info.step}`);

    // ==================== STEP 9: 播种 ×3 ====================
    console.log('\n--- Step 9: 播种 ×3 ---');
    await page.keyboard.press('KeyR');
    await sleep(200);
    for (let i = 0; i < 3; i++) {
      await teleport(page, 'farm', (13 + i) * 16 + 8, 10 * 16 + 20, 'up');
      await pressE(page);
      await sleep(400);
    }
    await waitAndSkipDialogue(page, 4); // WATER_CROPS_DIALOGUE 4 行

    info = await sceneInfo(page);
    result('9. 播种完成 → 浇水教学', info.step === 'water_crops', `步骤=${info.step}`);

    // ==================== STEP 10: 浇水 ×3 ====================
    console.log('\n--- Step 10: 浇水 ×3 ---');
    for (let i = 0; i < 3; i++) {
      await teleport(page, 'farm', (13 + i) * 16 + 8, 10 * 16 + 20, 'up');
      await pressE(page);
      await sleep(400);
    }
    await waitAndSkipDialogue(page, 7); // EVENING_DIALOGUE 7 行

    info = await sceneInfo(page);
    result('10. 浇水完成 → 睡觉提示', info.step === 'evening_talk', `步骤=${info.step}`);

    // ==================== STEP 11: 睡觉 → 教程完成 ====================
    console.log('\n--- Step 11: 睡觉结束第一天 ---');
    await teleport(page, 'farm', 3 * 16 + 8, 14 * 16, 'up');
    await pressE(page);
    await sleep(2500);

    info = await sceneInfo(page);
    result('11. 教程完成(done)', info.step === 'done' && info.scene === 'farm',
      `场景=${info.scene}, 步骤=${info.step}`);
    await screenshot(page, 'step11-done');

    // ==================== 汇总 ====================
    console.log('\n\n========== 测试结果 ==========');
    for (const r of results) console.log(r);
    const allOK = results.every(r => r.startsWith('✅'));
    console.log(`\n${allOK ? '🎉 全部通过！' : '⚠️ 部分失败'}`);
    console.log(`截图: ${SCREENSHOT_DIR}`);
    await sleep(2000);

  } catch (e) {
    console.error('\n❌ 异常:', e.message);
    await screenshot(page, 'error-state');
  } finally {
    await browser.close();
    console.log('浏览器已关闭');
  }
}

run().catch(console.error);
