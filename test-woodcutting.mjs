/**
 * E2E 测试 — 砍树机制验证（v0.5 / Alpha 稳定性）
 * 使用 puppeteer-core + Chrome 自动化测试
 *
 * 背景：教程 E2E 只覆盖农田玩法，挖矿由 test-stress-switch.mjs 覆盖，
 *       砍树（斧头→砍3次→木材×2→树桩）没有任何自动化验证。
 *       剧情引导要建立在机制上，先验证机制，再写剧情。
 *
 * 验证目标：
 *   1. 教程完成态（有斧头）下，靠近树木按 E 可砍伐
 *   2. 砍击扣树血（3 次/棵），树血变化有文字反馈
 *   3. 第 3 次砍倒：树变树桩 + 提示获得木材 ×2
 *   4. 树桩不可再砍（无重复产出）
 *   5. 其他树木不受影响
 *   6. 存档读档后树桩状态保留（树木状态进存档）
 *
 * 前置条件: Vite dev server 运行在 localhost:5173
 * 运行: node test-woodcutting.mjs
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
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`) });
  console.log(`  📸 ${name}.png`);
}

/** 当前激活场景 key */
async function activeScene(page) {
  return page.evaluate(() => window.__game.scene.getScenes(true)[0]?.scene?.key ?? 'none');
}

/** 农场树木状态快照（贴图 key + 是否有对话文字） */
async function farmTreeInfo(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScene('farm');
    if (!s) return null;
    const treeAt = (col, row) => {
      const spr = s.treeSprites?.get(`${col},${row}`);
      return spr?.texture?.key ?? 'missing';
    };
    return {
      scene: s.scene.key,
      trees: s.treeSprites?.size ?? -1,
      t23: treeAt(2, 3),
      t45: treeAt(4, 5),
      dialogue: s.dialogueText?.text ?? null,
    };
  });
}

/** 瞬移到指定坐标 */
async function teleport(page, x, y) {
  await page.evaluate(([px, py]) => {
    const s = window.__game.scene.getScenes(true)[0];
    s.player.x = px;
    s.player.y = py;
    s.player.setVelocity(0, 0);
  }, [x, y]);
}

/** 在指定坐标按一次 E（瞬移+等待，让交互帧生效） */
async function pressEAt(page, x, y) {
  await teleport(page, x, y);
  await sleep(150);
  await page.keyboard.press('KeyE');
  await sleep(300);
}

async function run() {
  console.log('=== 归星物语 砍树机制 E2E 测试（v0.5）===\n');

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
    // ==================== 准备：清存档 → title → station → 跳过教程 → farm ====================
    console.log('--- 准备：进入可自由游戏的农场（教程完成态） ---');
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);

    let scene = await activeScene(page);
    result('P1. 启动停在 title', scene === 'title', `场景=${scene}`);
    await page.keyboard.press('Enter');
    await sleep(2000);
    scene = await activeScene(page);
    result('P2. 进入 station', scene === 'station', `场景=${scene}`);

    // 跳过开场 + 直接置为教程完成态（等价于玩完第一天）
    await page.evaluate(() => {
      const btn = document.getElementById('intro-skip-btn');
      if (btn) btn.click();
      window.debug.setStoryStep('done');
    });
    await sleep(800);

    // 走出车站 → 农场
    await teleport(page, 970, 460);
    await sleep(3000);
    scene = await activeScene(page);
    result('P3. 进入农场(教程完成态)', scene === 'farm', `场景=${scene}`);
    await screenshot(page, 'wood-p0-farm');

    // ==================== W1: 树木就绪 ====================
    console.log('\n--- W1: 树木初始化 ---');
    let tree = await farmTreeInfo(page);
    result('W1. 农场树木已创建', tree && tree.trees === 30, `树木数=${tree?.trees}`);
    result('W1b. 目标树(2,3)为活树', tree && tree.t23 !== 'stump' && tree.t23 !== 'missing', `贴图=${tree?.t23}`);
    result('W1c. 对照树(4,5)为活树', tree && tree.t45 !== 'stump' && tree.t45 !== 'missing', `贴图=${tree?.t45}`);

    // ==================== W2: 第 1 击（树血 3→2） ====================
    console.log('\n--- W2: 第 1 击 ---');
    // 树(2,3) 中心 (40,56)，玩家站在下方 (40,76) 距离 20px（24px 交互范围内）
    await pressEAt(page, 40, 76);
    tree = await farmTreeInfo(page);
    result('W2. 砍击反馈(剩余 2/3)', tree.dialogue === '砍树中… (剩余 2/3)', `对话="${tree.dialogue}"`);
    result('W2b. 树未倒', tree.t23 !== 'stump', `贴图=${tree.t23}`);

    // ==================== W3: 第 2 击（树血 2→1） ====================
    console.log('\n--- W3: 第 2 击 ---');
    await pressEAt(page, 40, 76);
    tree = await farmTreeInfo(page);
    result('W3. 砍击反馈(剩余 1/3)', tree.dialogue === '砍树中… (剩余 1/3)', `对话="${tree.dialogue}"`);
    result('W3b. 树未倒', tree.t23 !== 'stump', `贴图=${tree.t23}`);

    // ==================== W4: 第 3 击（树倒 → 树桩 + 木材×2） ====================
    console.log('\n--- W4: 第 3 击砍倒 ---');
    await pressEAt(page, 40, 76);
    tree = await farmTreeInfo(page);
    result('W4. 砍倒提示(获得木材 ×2)', tree.dialogue === '砍倒了树！获得木材 ×2', `对话="${tree.dialogue}"`);
    result('W4b. 树变成树桩', tree.t23 === 'stump', `贴图=${tree.t23}`);
    await screenshot(page, 'wood-w4-stump');

    // ==================== W5: 树桩不可再砍 ====================
    console.log('\n--- W5: 树桩不可重复砍伐 ---');
    // 等旧提示（showDialogueText 4s 自动消失）清掉，避免把 W4 的文案当成本次反馈
    await sleep(4300);
    tree = await farmTreeInfo(page);
    result('W5a. 旧砍倒提示已消失', tree.dialogue === null, `对话="${tree.dialogue}"`);
    await pressEAt(page, 40, 76);
    tree = await farmTreeInfo(page);
    result('W5b. 树桩保持树桩', tree.t23 === 'stump', `贴图=${tree.t23}`);
    result('W5c. 无重复产出提示', tree.dialogue === null, `对话="${tree.dialogue}"`);

    // ==================== W6: 其他树木不受影响 ====================
    console.log('\n--- W6: 相邻树木不受影响 ---');
    result('W6. 对照树(4,5)仍是活树', tree.t45 !== 'stump' && tree.t45 !== 'missing', `贴图=${tree.t45}`);

    // ==================== W7: 存档序列化保留树桩 ====================
    console.log('\n--- W7: 存档序列化保留树桩 ---');
    // 真实睡觉路径：走进木屋 → 站在床上按 E（trySleep → save 用 this.mapKey），验证树桩进入存档
    await teleport(page, 104, 320); // 农场大门 (6,20) → 进入屋内
    await sleep(2500);
    await teleport(page, 40, 40);   // 屋内床铺 (2,2)
    await sleep(150);
    await page.keyboard.press('KeyE');
    await sleep(1200);
    const saveTree = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('return_star_save');
        if (!raw) return { ok: false, why: 'no-save' };
        const data = JSON.parse(raw);
        const trees = data.farm?.trees ?? [];
        const entry = trees.find(([k]) => k === '2,3');
        return { ok: !!entry && entry[1].isStump, why: entry ? JSON.stringify(entry[1]) : 'tree-missing' };
      } catch (e) {
        return { ok: false, why: String(e) };
      }
    });
    result('W7a. 真实睡觉后存档已写入', saveTree.why !== 'no-save', saveTree.why);
    result('W7b. 存档含树桩(2,3)状态', saveTree.ok, saveTree.why);

    // ==================== 汇总 ====================
    console.log('\n\n========== 测试结果 ==========');
    for (const r of results) console.log(r);
    const allOK = results.every(r => r.startsWith('✅'));
    console.log(`\n${allOK ? '🎉 砍树机制验证全部通过！' : '⚠️ 部分失败'}`);
    console.log(`截图: ${SCREENSHOT_DIR}`);
    await sleep(1500);

  } catch (e) {
    console.error('\n❌ 异常:', e.message);
    await screenshot(page, 'wood-error');
  } finally {
    await browser.close();
    console.log('浏览器已关闭');
  }
}

run().catch(console.error);
