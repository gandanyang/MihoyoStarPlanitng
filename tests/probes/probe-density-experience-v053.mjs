/**
 * 体验探针：v0.5.3 第一批三事件真实游玩链路
 *
 * 模拟真实玩家一天：
 *   1. 从标题进入 → 车站 → 跳过 → 直接 tutorial done（教程已由 test-tutorial 验证）
 *   2. Day1 清晨 06:00 进入农场 → 遇到清晨的夏雅 → 靠近对话（E1）
 *   3. 上午去小镇 → 与居民闲聊（老张/阿风，每日随机句 E4）
 *   4. 去矿洞 → 老张闲聊 → 触发"以前工作的时候"（E3）
 *
 * 运行：node probe-density-v053.mjs（含断言）或本节单跑
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function screenshot(page, name) {
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
  console.log(`  📸 ${name}.png`);
}

async function sceneInfo(page) {
  return page.evaluate(() => ({
    scene: window.__game.scene.getScenes(true)[0]?.scene?.key ?? 'none',
    step: window.debug?.getStoryStep?.(),
  }));
}

// ===== 断言（v0.6 补：原为无断言走查） =====
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

async function gotoScene(page, key, spawn) {
  await page.evaluate(([k, sp]) => {
    const s = window.__game.scene.getScenes(true)[0];
    if (s?.scene?.key !== k) s.scene.start(k, { spawn: sp });
  }, [key, spawn]);
  await sleep(1500);
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

async function pressE(page) {
  await page.keyboard.press('KeyE');
  await sleep(300);
}

async function dialogueText(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0];
    return s?.storyDialogue?.isOpen?.() ? (s.storyDialogue.textEl?.textContent ?? '') : '<closed>';
  });
}

/** 慢速逐行推进（模拟玩家阅读后按键），每次打印当前行，用于体验确认 */
async function readDialogueSlowly(page, maxLines = 40) {
  for (let i = 0; i < maxLines; i++) {
    const txt = await dialogueText(page);
    if (txt === '<closed>') { console.log('   [对话结束]'); return; }
    console.log(`   ▸ ${txt}`);
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) s.storyDialogue.advance();
    });
    await sleep(500);
  }
}

async function run() {
  console.log('=== 体验验证：v0.5.3 第一批三事件（真实游玩节奏）===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [err] ${msg.text().substring(0, 120)}`);
  });

  try {
    // ===== 启动 → 教程完成态 =====
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(2500);
    await page.keyboard.press('Enter');
    await sleep(1500);
    await page.evaluate(() => {
      const btn = document.getElementById('intro-skip-btn');
      if (btn) btn.click();
    });
    await sleep(500);
    await page.evaluate(() => {
      window.debug.setStoryStep('done');
      window.debug.setTime(6, 0);
    });
    await sleep(400);

    // ===== 1. 清晨进农场：偶遇夏雅 =====
    console.log('\n【Day1 清晨 06:00】走进庄园……');
    await gotoScene(page, 'farm', { x: 200, y: 300 });
    await sleep(800);
    let si = await sceneInfo(page);
    check('进入农场场景', si.scene === 'farm', `实际=${si.scene}`);
    await screenshot(page, 'v053-1-farm-morning');

    // 走向夏雅（v0.6 NPC生活化：清晨夏雅在花园旁(1,21)浇水）
    await teleport(page, 'farm', 1 * 16 + 8, 21 * 16 + 20, 'up');
    await sleep(300);
    await screenshot(page, 'v053-2-approach-xiya');
    console.log('\n[靠近夏雅，按 E]');
    await pressE(page);
    await sleep(600);
    let t = await dialogueText(page);
    check('E1 清晨夏雅偶遇对话触发', t !== '<closed>' && t.includes('清晨的庄园很安静'), `实际=${t.slice(0, 40)}`);
    await readDialogueSlowly(page, 8);
    await screenshot(page, 'v053-3-xiya-dawn-dialogue');

    // ===== 2. 上午去小镇闲聊（E4 每日随机句） =====
    console.log('\n【Day1 上午】去小镇逛逛……');
    await page.evaluate(() => window.debug.setTime(10, 0));
    await sleep(400);
    await gotoScene(page, 'town', { x: 200, y: 300 });
    await sleep(800);
    si = await sceneInfo(page);
    check('进入小镇场景', si.scene === 'town', `实际=${si.scene}`);
    // 跳过小镇开场（真实玩家会读，这里为聚焦新事件快速过）
    console.log('\n[小镇开场]');
    await readDialogueSlowly(page, 6);

    console.log('\n[靠近阿风（每日随机句）]');
    // 阿风 10:00 在 town（SPOTS.town.adventurer = 12*16+8, 12*16+8 = (200,200)）
    await teleport(page, 'town', 200, 216, 'up');
    await pressE(page);
    await sleep(600);
    t = await dialogueText(page);
    check('E4 小镇每日闲聊触发', t !== '<closed>' && t.trim().length > 0, `实际=${t.slice(0, 40)}`);
    await readDialogueSlowly(page, 14);
    await screenshot(page, 'v053-4-adventurer-daily');

    // ===== 3. 矿洞：老张闲聊（E3 林澈过去） =====
    console.log('\n【Day1 上午】去矿洞看看老张……');
    await gotoScene(page, 'mine', { x: 200, y: 300 });
    await sleep(800);
    si = await sceneInfo(page);
    check('进入矿洞场景', si.scene === 'mine', `实际=${si.scene}`);
    console.log('\n[靠近老张（矿洞）]');
    await teleport(page, 'mine', 200, 184, 'up');
    await pressE(page);
    await sleep(600);
    t = await dialogueText(page);
    check('E3 老张闲聊触发（林澈过去）', t !== '<closed>' && t.trim().length > 0, `实际=${t.slice(0, 40)}`);
    await readDialogueSlowly(page, 24);
    await screenshot(page, 'v053-5-miner-linche-past');

    console.log(`\n=== 体验验证完成：${pass} 通过 / ${fail} 失败 ===`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('探针异常:', err);
  process.exit(1);
});
