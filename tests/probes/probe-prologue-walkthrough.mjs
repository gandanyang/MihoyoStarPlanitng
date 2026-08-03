/**
 * 序章体验走查（Batch C 前序章体验审核的自动化取证）
 *
 * 模拟第一次玩的玩家完整走一遍新档序章流程，逐节点：
 *  - 截图（test-screenshots/walkthrough/）
 *  - 抓取当前对白/提示文本（storyDialogue.lines[index]）
 *  - 记录场景/步骤/可见元素
 *
 * 流程：title → station（列车动画+手机通知+车站对白）→ gate（夏雅对白）
 *      → 钥匙开门（开门对白）→ farm（锄地/播种/浇水对白）→ 进屋睡觉 → 次日清晨
 *
 * 不跳过任何剧情（与 test-tutorial 的"快速跳过"相反，用于体验审查）。
 *
 * 前置：dev server 在 localhost:5173
 * 运行：node tests/probes/probe-prologue-walkthrough.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(__dirname, 'test-screenshots', 'walkthrough');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/?reset=1';

mkdirSync(SHOT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const nodes = []; // 节点记录
let shotIdx = 0;

async function shot(page, label) {
  shotIdx++;
  const name = `${String(shotIdx).padStart(2, '0')}-${label}`;
  const path = join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path });
  console.log(`  📸 ${name}.png`);
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

/** 读取当前对白行（storyDialogue.lines[index]） */
async function readLine(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0];
    const d = s?.storyDialogue;
    if (!d || !d.isOpen()) return null;
    const l = d.lines[d.index];
    return l ? { speaker: l.speaker ?? '', text: l.text, inner: !!l.inner } : null;
  });
}

/**
 * 逐行走完一段对话并记录全部行文本。
 * 每行：finishTyping（若在打字）→ 读文本 → 推进到下一行。
 */
async function walkDialogue(page, label) {
  await sleep(600); // 等对话开始
  const lines = [];
  for (let i = 0; i < 40; i++) {
    const open = await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      return s?.storyDialogue?.isOpen?.() ?? false;
    });
    if (!open) break;
    // 若在打字，先显示全文
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      const d = s?.storyDialogue;
      if (d?.isOpen() && d.typing) d.advance();
    });
    await sleep(150);
    const line = await readLine(page);
    if (line) lines.push(line);
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      const d = s?.storyDialogue;
      if (d?.isOpen()) d.advance();
    });
    await sleep(80);
  }
  await sleep(300);
  const info = await sceneInfo(page);
  nodes.push({ type: 'dialogue', label, lines, after: info });
  console.log(`\n--- 对话[${label}] ${lines.length} 行 ---`);
  for (const l of lines) {
    console.log(`  ${l.speaker ? `[${l.speaker}]` : l.inner ? '(内心)' : '(旁白)'} ${l.text}`);
  }
  return lines;
}

/** 等待 DOM 中 z-index=600 的手机通知出现（最多 6s） */
async function waitPhone(page) {
  for (let i = 0; i < 30; i++) {
    const has = await page.evaluate(() =>
      [...document.querySelectorAll('div')].some(d => d.style?.zIndex === '600' && d.style?.display !== 'none'));
    if (has) return true;
    await sleep(200);
  }
  return false;
}

async function pressE(page) { await page.keyboard.press('KeyE'); await sleep(300); }

async function run() {
  console.log('=== 序章体验走查（新档全流程，不跳过）===\n');
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
    // ============ 1. 标题画面 ============
    console.log('\n--- 节点 1: 标题画面 ---');
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(2500);
    const titleInfo = await page.evaluate(() => ({
      scene: window.__game?.scene?.getScenes(true)?.[0]?.scene?.key ?? 'none',
      texts: [...document.querySelectorAll('h1,h2,p,span,button')].map(e => e.textContent?.trim()).filter(t => t && t.length < 30).slice(0, 12),
    }));
    nodes.push({ type: 'screen', label: 'title', titleInfo });
    await shot(page, 'title');
    console.log(`  场景=${titleInfo.scene}`);
    console.log(`  可见文本: ${titleInfo.texts.join(' | ')}`);

    // ============ 2. 进入车站 ============
    console.log('\n--- 节点 2: 进入车站（开场）---');
    await page.keyboard.press('Enter');
    await sleep(3000);
    let info = await sceneInfo(page);
    nodes.push({ type: 'screen', label: 'station-start', info });
    await shot(page, 'station-start');
    console.log(`  场景=${info.scene}, 步骤=${info.step}`);

    // 列车动画（intro-train-overlay）
    const train = await page.evaluate(() => !!document.getElementById('intro-train-overlay'));
    console.log(`  列车动画可见=${train}`);
    if (train) {
      await sleep(4000); // 等动画播放（约 3s）
      await shot(page, 'train-overlay');
    }

    // ============ 3. 手机通知两页 ============
    console.log('\n--- 节点 3: 手机通知（两页）---');
    const phoneShown = await waitPhone(page);
    console.log(`  手机通知出现=${phoneShown}`);
    if (phoneShown) {
      await sleep(1200);
      await shot(page, 'phone-page1');
      const phoneText = await page.evaluate(() => {
        const d = [...document.querySelectorAll('div')].find(x => x.style?.zIndex === '600' && x.style?.display !== 'none');
        return d?.innerText ?? '';
      });
      console.log(`  通知文本:\n${phoneText}`);
      nodes.push({ type: 'phone', label: 'phone-page1', text: phoneText });
      // 点击翻页
      await page.mouse.click(512, 384);
      await sleep(800);
      await shot(page, 'phone-page2');
      const phoneText2 = await page.evaluate(() => {
        const d = [...document.querySelectorAll('div')].find(x => x.style?.zIndex === '600' && x.style?.display !== 'none');
        return d?.innerText ?? '';
      });
      console.log(`  第2页文本:\n${phoneText2}`);
      nodes.push({ type: 'phone', label: 'phone-page2', text: phoneText2 });
      // 点击关闭
      await page.mouse.click(512, 384);
      await sleep(800);
    }

    // ============ 4. 车站对白 STATION_DIALOGUE ============
    console.log('\n--- 节点 4: 车站对白 ---');
    await walkDialogue(page, 'station-dialogue');
    await shot(page, 'station-after-dialogue');

    // ============ 5. 走出车站 → 大门 ============
    console.log('\n--- 节点 5: 前往庄园大门 ---');
    await teleport(page, 'station', 970, 460, 'right');
    await sleep(3500);
    info = await sceneInfo(page);
    console.log(`  场景=${info.scene}`);
    await sleep(800);
    await shot(page, 'gate-arrive');

    // ============ 6. 夏雅对白 XIYA_DIALOGUE ============
    console.log('\n--- 节点 6: 夏雅对白 ---');
    await teleport(page, 'gate', 248, 204, 'up');
    await pressE(page);
    await walkDialogue(page, 'xiya-dialogue');
    await shot(page, 'gate-after-xiya');

    // ============ 7. 使用钥匙 → 开门对白 ============
    console.log('\n--- 节点 7: 使用钥匙开门 ---');
    await page.evaluate(() => window.__game.scene.getScene('gate')?.backpackPanel?.open());
    await sleep(800);
    const keyClicked = await page.evaluate(() => {
      const btn = document.querySelector('button[data-action="use-key"]');
      if (btn) { btn.click(); return true; }
      return false;
    });
    console.log(`  点击使用钥匙=${keyClicked}`);
    await sleep(500);
    await walkDialogue(page, 'gate-opened-dialogue');
    await shot(page, 'gate-opened');

    // ============ 8. 进入农场 ============
    console.log('\n--- 节点 8: 进入农场 ---');
    await teleport(page, 'gate', 240, 30, 'up');
    await sleep(2500);
    info = await sceneInfo(page);
    console.log(`  场景=${info.scene}, 步骤=${info.step}`);
    await sleep(800);
    await shot(page, 'farm-arrive');

    // ============ 9. 锄地 ×3 + 播种对白 ============
    console.log('\n--- 节点 9: 锄地 ×3 ---');
    for (let i = 0; i < 3; i++) {
      await teleport(page, 'farm', (13 + i) * 16 + 8, 10 * 16 + 20, 'up');
      await pressE(page);
      await sleep(400);
    }
    await walkDialogue(page, 'sow-seeds-dialogue');
    await shot(page, 'farm-tilled');

    // ============ 10. 播种 ×3 + 浇水对白 ============
    console.log('\n--- 节点 10: 播种 ×3 ---');
    await page.keyboard.press('KeyR');
    await sleep(200);
    for (let i = 0; i < 3; i++) {
      await teleport(page, 'farm', (13 + i) * 16 + 8, 10 * 16 + 20, 'up');
      await pressE(page);
      await sleep(400);
    }
    await walkDialogue(page, 'water-crops-dialogue');
    await shot(page, 'farm-sown');

    // ============ 11. 浇水 ×3 + 晚间对白 ============
    console.log('\n--- 节点 11: 浇水 ×3 ---');
    for (let i = 0; i < 3; i++) {
      await teleport(page, 'farm', (13 + i) * 16 + 8, 10 * 16 + 20, 'up');
      await pressE(page);
      await sleep(400);
    }
    await walkDialogue(page, 'evening-dialogue');
    await shot(page, 'farm-watered');

    // ============ 12. 进屋睡觉 → 次日清晨 ============
    console.log('\n--- 节点 12: 进屋睡觉 → 次日 ---');
    await teleport(page, 'farm', 6 * 16 + 8, 20 * 16, 'up');
    await sleep(2500);
    info = await sceneInfo(page);
    console.log(`  场景=${info.scene}`);
    await teleport(page, 'house', 40, 40, 'up');
    await pressE(page);
    await sleep(1800);
    const day = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('return_star_save')).world.day; } catch { return null; }
    });
    console.log(`  睡后 day=${day}`);
    info = await sceneInfo(page);
    nodes.push({ type: 'screen', label: 'next-morning', info, day });
    await shot(page, 'next-morning');

    // ============ 汇总 ============
    const logPath = join(SHOT_DIR, 'walkthrough-log.json');
    writeFileSync(logPath, JSON.stringify({ pageErrs, nodes }, null, 2));
    console.log(`\n\n========== 走查完成 ==========`);
    console.log(`截图目录: ${SHOT_DIR}`);
    console.log(`记录文件: ${logPath}`);
    console.log(`运行时错误: ${pageErrs.length} 条`);
    for (const e of pageErrs) console.log(`  [err] ${e}`);
  } finally {
    await browser.close();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
