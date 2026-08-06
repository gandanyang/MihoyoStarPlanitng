/**
 * 探针脚本：v0.5.3 剧情密度第一批三事件验证
 *
 * 验证目标：
 *   E1 夏雅清晨偶遇：教程完成后，清晨 06-08 时进农场 → dawnXiya 出现，靠近按 E 播放 XIYA_DAWN_DIALOGUE
 *   E3 老张追加台词：矿洞对话包含"以前工作的时候，经常处理这些。"
 *   E4 NPC 每日随机句：与老张/小梅/阿风对话后追加一句随机生活台词；同日重复对话不追加
 *
 * 前置条件：Vite dev server 运行在 localhost:5173
 * 运行：node probe-density-v053.mjs
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
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
  console.log(`  📸 ${name}.png`);
}

async function sceneInfo(page) {
  return page.evaluate(() => ({
    scene: window.__game.scene.getScenes(true)[0]?.scene?.key ?? 'none',
    step: window.debug?.getStoryStep?.(),
  }));
}

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

async function dialogueText(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0];
    return s?.storyDialogue?.isOpen?.() ? (s.storyDialogue.textEl?.textContent ?? '') : '<closed>';
  });
}

/** 逐行推进对话，直到当前行包含 target 子串（最多 maxLines 行）。返回匹配到的行文本（空串=未找到）。 */
async function advanceUntil(page, target, maxLines = 50) {
  const isRegex = target instanceof RegExp;
  for (let i = 0; i < maxLines; i++) {
    await sleep(800); // 确保当前行打字完成（35ms/字，800ms ≈ 22 字，含长行）
    const txt = await dialogueText(page);
    if (isRegex ? target.test(txt) : txt.includes(target)) return txt;
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) s.storyDialogue.advance();
    });
  }
  return '';
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

async function gotoScene(page, key, spawn) {
  await page.evaluate(([k, sp]) => {
    const s = window.__game.scene.getScenes(true)[0];
    if (s?.scene?.key !== k) s.scene.start(k, { spawn: sp });
  }, [key, spawn]);
  await sleep(1500);
}

async function run() {
  console.log('=== v0.5.3 剧情密度第一批（E1/E3/E4）验证 ===\n');

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
    // ============ 启动 → 车站 → 跳过 → 跳到教程完成态 ============
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
    await sleep(500);

    // ============ E1: Day1 清晨进农场 → dawnXiya 出现 ============
    console.log('\n--- E1: 夏雅清晨偶遇 ---');
    await gotoScene(page, 'farm', { x: 200, y: 300 });
    await sleep(800);

    const dawn1 = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return { dawnXiya: !!s?.dawnXiya && s.dawnXiya.visible, day: window.__game.scene.getScene('farm')?.dawnXiyaDay ?? -1 };
    });
    result('E1a. 清晨(06:00)进农场 → 夏雅出现', dawn1.dawnXiya, `dawnXiya=${dawn1.dawnXiya}`);
    await screenshot(page, 'v053-e1-dawn-xiya');

    // 靠近按 E → 播放偶遇对话（逐行推进找"这么早"）——v0.6 NPC生活化：夏雅清晨在花园浇水(33,4)
    await teleport(page, 'farm', 33 * 16 + 8, 4 * 16 + 20, 'up');
    await pressE(page);
    await sleep(700);
    const dawnText = await advanceUntil(page, '这么早', 6);
    result('E1b. 靠近按E → 清晨偶遇对话', dawnText.includes('这么早'), dawnText.substring(0, 40));
    await skipDialogue(page, 6); // 5 行 + 关闭

    const dawnAfter = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return { dawnGone: s?.dawnXiya === null, dawnDay: s?.dawnXiyaDay };
    });
    result('E1c. 对话后夏雅消失（当天不再出现）', dawnAfter.dawnGone);

    // 离开再回来（同一天）→ 不再出现
    await gotoScene(page, 'town', { x: 200, y: 300 });
    await sleep(600);
    await gotoScene(page, 'farm', { x: 200, y: 300 });
    await sleep(600);
    const dawn2 = await page.evaluate(() => !!window.__game.scene.getScene('farm')?.dawnXiya);
    result('E1d. 同日再次进农场 → 夏雅不重复出现', !dawn2);

    // ============ E4: NPC 每日随机句 ============
    console.log('\n--- E4: NPC 每日随机句 ---');
    // 老张 10:00 在矿洞（miner 日程：06 farm → 08 mine）
    await page.evaluate(() => window.debug.setTime(10, 0));
    await sleep(500);
    await gotoScene(page, 'mine', { x: 200, y: 300 });
    await sleep(800);

    // 老张（mine 位置 12*16+8, 10*16+8 = (200,168)）→ 对话
    await teleport(page, 'mine', 200, 184, 'up');
    await pressE(page);
    await sleep(700);
    const minerText = await advanceUntil(page, '矿洞这片归我管', 20);
    result('E4a. 老张对话含固定内容', minerText.includes('矿洞这片归我管'), minerText.substring(0, 30));
    await skipDialogue(page, 17); // MINER_DIALOGUES(16行) + 每日句(1行) = 17，多按无害
    await sleep(300);

    // 小梅 14:00 起在森林（gardener 日程：07:00 farm → 14:00 forest → 18:00 home）；森林位置 (18*16+8, 8*16+8)=(296,136)
    await page.evaluate(() => window.debug.setTime(15, 0));
    await sleep(400);
    await gotoScene(page, 'forest', { x: 200, y: 300 });
    await sleep(800);
    await teleport(page, 'forest', 296, 152, 'up');
    await pressE(page);
    await sleep(700);
    // 诊断：当前场景 NPC 与最近 NPC
    const gardDiag = await page.evaluate(() => {
      const s = window.__game.scene.getScene('forest');
      const npcs = (s?.npcList ?? []).map(n => ({ id: n.id, x: n.sprite?.x, y: n.sprite?.y, vis: n.sprite?.visible }));
      const open = s?.storyDialogue?.isOpen?.();
      return { npcs, open, dlg: open ? (s.storyDialogue.textEl?.textContent ?? '') : '<closed>' };
    });
    console.log('  [diag] forest NPCs:', JSON.stringify(gardDiag.npcs), 'open=', gardDiag.open, 'dlg=', gardDiag.dlg.substring(0, 40));
    // gardener 每日随机句池共 6 句（NPCSystem NPC_DAILY_LINES.gardener），seed=day+id 取模选 1 句，全部覆盖避免碰运气
    const gardDailyRe = /花开得比昨天好|新作物|水壶漏了|我爷爷种的|养得越来越好了|都得用心/;
    const gardenerText = await advanceUntil(page, gardDailyRe, 16);
    result('E4b. 小梅对话含每日随机句', gardDailyRe.test(gardenerText), gardenerText.substring(0, 30));
    await skipDialogue(page, 14); // GARDENER(12) + 每日(1) = 13，多按无害

    // ============ E3: 老张矿洞追加台词 ============
    console.log('\n--- E3: 林澈个人线（矿洞） ---');
    await page.evaluate(() => window.debug.setTime(10, 0)); // 老张上午在矿洞
    await sleep(400);
    await gotoScene(page, 'mine', { x: 200, y: 300 });
    await sleep(800);
    // 老张在矿洞 (12*16+8, 10*16+8) = (200,168)
    await teleport(page, 'mine', 200, 184, 'up');
    await pressE(page);
    await sleep(700);
    const e3Text = await advanceUntil(page, '以前工作的时候', 30);
    result('E3a. 矿洞对话含"以前工作的时候"', e3Text.includes('以前工作的时候'), e3Text.substring(0, 40));
    await skipDialogue(page, 18);

    // ============ E4 追加验证：次日随机句变化 ============
    console.log('\n--- E4 跨天验证 ---');
    await page.evaluate(() => {
      window.debug.setStoryStep('done');
      window.debug.nextDay(); // → Day2 06:00
      window.debug.setTime(10, 0); // 老张 10:00 在矿洞（miner 日程：06 farm → 08 mine）
    });
    await sleep(600);
    await gotoScene(page, 'mine', { x: 200, y: 300 });
    await sleep(800);
    await teleport(page, 'mine', 200, 184, 'up');
    await pressE(page);
    await sleep(700);
    const minerText2 = await advanceUntil(page, '矿洞这片归我管', 20);
    result('E4c. Day2 老张仍含固定内容', minerText2.includes('矿洞这片归我管'), minerText2.substring(0, 30));
    const dailySent2 = await page.evaluate(() => {
      const s = window.__game.scene.getScene('mine');
      return s?.npcDailySaid?.get?.('miner') ?? null;
    });
    result('E4d. Day2 老张已标记说过每日句', dailySent2 === 2, `npcDailySaid.miner=${dailySent2}`);
    await skipDialogue(page, 18);

    console.log('\n========== 结果 ==========');
    const pass = results.filter(r => r.includes('✅')).length;
    const fail = results.length - pass;
    console.log(`${pass} 通过 / ${fail} 失败`);
    process.exit(fail > 0 ? 1 : 0);
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('探针异常:', err);
  process.exit(1);
});
