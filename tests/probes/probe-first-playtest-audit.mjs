/**
 * Alpha 玩家流程审查取证（任务卡：任务-Alpha玩家流程审查-FirstPlayTest-v0.1）
 *
 * 纯审查工具，不改任何游戏代码。以"玩家视角"走完整流程：
 *   title → station → gate → farm(种田) → night → town → forest(碎片) → deliver → 修复 → 观星夜 → 结算
 *
 * 取证方式（本模型无法看图，故程序化取证，可量化）：
 *   1. 画布像素采样：对关键区域做网格采样，统计唯一色数 / 主色 / 色块（检测纯色占位）
 *   2. 可见 DOM 文本：对白 / 提示 / 按钮
 *   3. 场景元素枚举：sprite 数量、texture key、emoji 占位检测（🤖📱 等）
 *
 * 输出：tests/probes/test-screenshots/first-playtest/ 下截图 + audit-log.json
 *
 * 前置：dev server on localhost:5173
 * 运行：node tests/probes/probe-first-playtest-audit.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(__dirname, 'test-screenshots', 'first-playtest');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/?reset=1';
const T = 16;

mkdirSync(SHOT_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nodes = [];
let shotIdx = 0;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
  ok ? pass++ : fail++;
};

async function shot(page, label) {
  shotIdx++;
  const path = join(SHOT_DIR, `${String(shotIdx).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path });
  return path;
}

/** 画布像素采样：整页截图 base64 → 页内离屏 canvas → 网格采样，返回颜色统计 */
async function sampleCanvas(page, label, x0, y0, x1, y1, step = 24) {
  const b64 = await page.screenshot({ encoding: 'base64' });
  return page.evaluate(([l, a, b, c, d, s, imgB64]) => {
    const img = new Image();
    return new Promise((resolve) => {
      img.onload = () => {
        const c2 = document.createElement('canvas');
        c2.width = img.width; c2.height = img.height;
        const ctx2 = c2.getContext('2d', { willReadFrequently: true });
        ctx2.drawImage(img, 0, 0);
        const sx0 = Math.max(0, c), sy0 = Math.max(0, a);
        const sx1 = Math.min(c2.width, d), sy1 = Math.min(c2.height, b);
        const colors = new Map();
        let n = 0;
        for (let y = sy0; y < sy1; y += s) {
          for (let x = sx0; x < sx1; x += s) {
            const p = ctx2.getImageData(x, y, 1, 1).data;
            const key = `${p[0]},${p[1]},${p[2]}`;
            colors.set(key, (colors.get(key) || 0) + 1);
            n++;
          }
        }
        const sorted = [...colors.entries()].sort((p, q) => q[1] - p[1]);
        resolve({
          label: l, ok: true, sampled: n, unique: colors.size,
          top5: sorted.slice(0, 5).map(([c, cnt]) => `#${c.split(',').map(v => (+v).toString(16).padStart(2, '0')).join('')}(${cnt})`),
        });
      };
      img.onerror = () => resolve({ label: l, ok: false, err: 'base64 decode failed' });
      img.src = 'data:image/png;base64,' + imgB64;
    });
  }, [label, y0, x0, y1, x1, step, b64]);
}

/** 可见 DOM 文本（对白/提示/按钮） */
async function visibleText(page) {
  return page.evaluate(() => {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('div,span,p,h1,h2,button,li')) {
      const s = el.innerText?.trim();
      if (!s || s.length > 200 || seen.has(s)) continue;
      const z = el.style?.zIndex || '';
      if (z && +z >= 100) { out.push(`[z${z}] ${s}`); seen.add(s); }
    }
    return out.slice(0, 30);
  });
}

/** 场景元素枚举：当前 scene 的 active 对象统计 + emoji 检测 */
async function sceneElements(page) {
  return page.evaluate(() => {
    const s = window.__game?.scene?.getScenes(true)?.[0];
    if (!s) return {};
    let texts = 0, sprites = 0, images = 0, containers = 0, graphics = 0, emoji = [];
    s.children?.list?.forEach((c) => {
      if (c.type === 'Text') {
        texts++;
        const t = c.text || '';
        if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(t)) emoji.push(t.slice(0, 12));
      } else if (c.type === 'Sprite') sprites++;
      else if (c.type === 'Image') images++;
      else if (c.type === 'Container') containers++;
      else if (c.type === 'Graphics') graphics++;
    });
    return { scene: s.scene?.key, texts, sprites, images, containers, graphics, emoji: emoji.slice(0, 10) };
  });
}

/** 读当前对白行（DOM 读法，不依赖私有字段） */
async function readLine(page) {
  return page.evaluate(() => {
    const s = window.__game?.scene?.getScenes(true)?.[0];
    const d = s?.storyDialogue;
    if (!d || !d.isOpen()) return null;
    const text = d.textEl?.textContent?.trim() ?? '';
    if (!text) return null;
    return { speaker: d.nameEl?.textContent?.trim() ?? '', text, inner: d.isOptionLine?.() === true };
  });
}

/** 推进开场提示层（列车 z700 / 音量 z650 / 手机通知 z600），点击直到对话打开 */
async function advanceIntroOverlays(page, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const state = await page.evaluate(() => {
      const s = window.__game?.scene?.getScenes(true)?.[0];
      if (s?.storyDialogue?.isOpen?.()) return 'dialogue';
      const els = [...document.querySelectorAll('div')].filter((e) => {
        const z = e.style?.zIndex || '';
        return (z === '600' || z === '650' || z === '700') && e.getBoundingClientRect().width > 100 && e.style.display !== 'none' && e.style.opacity !== '0';
      });
      if (els.length) { els[0].click(); return 'clicked'; }
      return '';
    });
    if (state === 'dialogue') return;
    await sleep(250);
  }
}

/** 逐行走完一段对话并记录全部行 */
async function walkDialogue(page, label, timeoutMs = 30000) {
  await sleep(500);
  const lines = [];
  const t0 = Date.now();
  for (let i = 0; i < 60; i++) {
    if (Date.now() - t0 > timeoutMs) break;
    const open = await page.evaluate(() => {
      const s = window.__game?.scene?.getScenes(true)?.[0];
      return s?.storyDialogue?.isOpen?.() ?? false;
    });
    if (!open) break;
    // 若正在打字，先完成当前行（再读）
    await page.evaluate(() => {
      const s = window.__game?.scene?.getScenes(true)?.[0];
      const d = s?.storyDialogue;
      if (d?.isOpen() && d.typing) d.advance();
    });
    await sleep(120);
    const line = await readLine(page);
    if (line) lines.push(line);
    await page.evaluate(() => {
      const s = window.__game?.scene?.getScenes(true)?.[0];
      const d = s?.storyDialogue;
      if (d?.isOpen()) d.advance();
    });
    await sleep(80);
  }
  await sleep(250);
  nodes.push({ type: 'dialogue', label, lines });
  console.log(`\n--- 对话[${label}] ${lines.length} 行 ---`);
  for (const l of lines) {
    console.log(`  ${l.speaker ? `[${l.speaker}]` : l.inner ? '(选项行)' : '(旁白)'} ${l.text}`);
  }
  return lines;
}

/** 推进闪回 overlay 直到关闭 */
async function advanceFlashback(page, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const open = await page.evaluate(() => {
      const el = document.getElementById('memory-flashback-overlay');
      return !!el && el.style.display !== 'none' && el.style.opacity !== '0';
    });
    if (!open) return true;
    await page.keyboard.press('KeyE');
    await page.mouse.click(512, 384);
    await sleep(200);
  }
  return false;
}

async function sceneInfo(page) {
  return page.evaluate(() => ({
    scene: window.__game?.scene?.getScenes(true)?.[0]?.scene?.key ?? 'none',
    step: window.debug?.getStoryStep?.(),
    time: window.debug?.getTime?.(),
  }));
}

async function teleport(page, sceneKey, x, y, facing = 'up') {
  await page.evaluate(([k, px, py, f]) => {
    const s = window.__game.scene.getScene(k);
    if (!s?.player) return;
    s.player.x = px; s.player.y = py; s.player.facing = f;
  }, [sceneKey, x, y, facing]);
  await sleep(120);
}

/** 切场景（先停当前场景，防黑屏风险同源；轮询等待目标 active） */
async function gotoScene(page, key, spawn) {
  await page.evaluate(([k, sp]) => {
    const g = window.__game;
    const active = g.scene.getScenes(true)[0];
    if (active && active.scene.key !== k) g.scene.stop(active.scene.key);
    g.scene.start(k, sp ? { spawn: sp } : undefined);
  }, [key, spawn ?? null]);
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    const cur = await page.evaluate(() => window.__game?.scene?.getScenes(true)?.[0]?.scene?.key ?? 'none');
    if (cur === key) return;
    if (cur === 'title' && key !== 'title') {
      // 场景切换失败（title 兜底），重试一次
      await page.evaluate(([k, sp]) => {
        const g = window.__game;
        g.scene.start(k, sp ? { spawn: sp } : undefined);
      }, [key, spawn ?? null]);
    }
    await sleep(500);
  }
}

async function pressE(page) { await page.keyboard.press('KeyE'); await sleep(400); }

/** 设置剧情步骤（模拟玩家已推进到该阶段） */
async function setStep(page, step) {
  await page.evaluate((s) => window.debug?.setStoryStep?.(s), step);
  await sleep(150);
}

async function enterGame(page, timeoutMs = 25000) {
  const t0 = Date.now();
  let cur = '';
  while (Date.now() - t0 < timeoutMs) {
    cur = await page.evaluate(() => window.__game?.scene?.getScenes(true)?.[0]?.scene?.key ?? 'none');
    if (cur !== 'none' && cur !== 'title') return cur;
    if (cur === 'title') {
      await page.keyboard.press('Enter');
      await page.mouse.click(512, 384);
    }
    await sleep(400);
  }
  return cur;
}

async function run() {
  console.log('=== Alpha 玩家流程审查取证（程序化）===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const pageErrs = [];
  page.on('pageerror', (e) => pageErrs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') pageErrs.push('console: ' + m.text()); });

  try {
    // ============ 0. 新档 + 标题 ============
    console.log('--- 节点 0: 新档标题 ---');
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(2500);
    await shot(page, '00-title');
    const tinfo = await page.evaluate(() => ({
      scene: window.__game?.scene?.getScenes(true)?.[0]?.scene?.key ?? 'none',
      texts: [...document.querySelectorAll('h1,h2,p,span,button')].map(e => e.textContent?.trim()).filter(t => t && t.length < 30).slice(0, 12),
    }));
    nodes.push({ type: 'screen', label: 'title', tinfo });
    console.log(`  场景=${tinfo.scene} 文本=${tinfo.texts.join(' | ')}`);
    check('T1 标题场景存在', tinfo.scene === 'title', `scene=${tinfo.scene}`);

    // ============ 1. 进入车站 ============
    console.log('\n--- 节点 1: 车站开场 ---');
    await page.keyboard.press('Enter');
    await sleep(3000);
    let info = await sceneInfo(page);
    await shot(page, '01-station');
    const stationPx = await sampleCanvas(page, 'station', 100, 150, 900, 650);
    nodes.push({ type: 'pixel', stationPx });
    const stationEls = await sceneElements(page);
    console.log(`  场景=${info.scene} 步骤=${info.step}`);
    console.log(`  车站画布采样: 唯一色=${stationPx.unique} 主色=${stationPx.top5.join(' ')}`);
    console.log(`  元素: texts=${stationEls.texts} sprites=${stationEls.sprites} containers=${stationEls.containers} graphics=${stationEls.graphics} emoji=${stationEls.emoji?.join(',') || '无'}`);
    check('S1 车站场景进入', info.scene === 'station', `scene=${info.scene}`);

    // 等列车动画 + 音量提示 + 手机通知 + 车站对白
    await sleep(1500);
    await advanceIntroOverlays(page);
    await walkDialogue(page, 'station-dialogue');
    await shot(page, '01b-station-after-dialogue');
    const stationEls2 = await sceneElements(page);
    console.log(`  车站对白后元素: emoji=${stationEls2.emoji?.join(',') || '无'}`);
    check('S2 车站无 emoji 占位', !(stationEls2.emoji?.length > 0), `emoji=${stationEls2.emoji?.join(',') || '无'}`);

    // ============ 2. 大门（P0 崩溃取证） ============
    console.log('\n--- 节点 2: 庄园大门 ---');
    // 玩家真实流程：火车站抵达庄园大门 → arrive_manor（须在 gotoScene 前设，create 时读该 step 建夏雅）
    await setStep(page, 'arrive_manor');
    const errBefore = pageErrs.length;
    await gotoScene(page, 'gate', { x: 248, y: 300 });
    info = await sceneInfo(page);
    const gateErr = pageErrs.slice(errBefore);
    console.log(`  场景=${info.scene} 步骤=${info.step}`);
    console.log(`  gate create 错误=${gateErr.length} 条`);
    for (const e of gateErr) console.log(`    [err] ${e}`);
    await shot(page, '02-gate');
    const gateEls = await sceneElements(page);
    console.log(`  大门元素: texts=${gateEls.texts} sprites=${gateEls.sprites} emoji=${gateEls.emoji?.join(',') || '无'}`);
    check('G1 gate 场景 create 无崩溃', gateErr.length === 0, gateErr[0]?.slice(0, 120) ?? '');
    if (gateErr.length === 0) {
      await teleport(page, 'gate', 248, 204, 'up');
      await pressE(page);
      await walkDialogue(page, 'xiya-dialogue');
      await shot(page, '02b-gate-after-xiya');

      // 使用钥匙开门（get_key）
      await setStep(page, 'get_key');
      await page.evaluate(() => window.__game?.scene?.getScene('gate')?.backpackPanel?.open());
      await sleep(800);
      const keyClicked = await page.evaluate(() => {
        const btn = document.querySelector('button[data-action="use-key"]');
        if (btn) { btn.click(); return true; }
        return false;
      });
      check('K1 背包钥匙按钮存在', keyClicked === true, '');
      await sleep(500);
      await walkDialogue(page, 'gate-opened-dialogue');
      await shot(page, '02c-gate-opened');
    } else {
      console.log('  (gate 崩溃，跳过夏雅对白/钥匙取证，恢复场景继续)');
      // 恢复场景：gate 崩后状态错乱，回 station 重建
      await gotoScene(page, 'station');
      await gotoScene(page, 'farm', { x: 480, y: 300 });
      console.log(`  已恢复，当前=${(await sceneInfo(page)).scene}`);
    }

    // ============ 3. 进入农场（种田） ============
    console.log('\n--- 节点 3: 农场种田 ---');
    // 锄地起点：先设 step 再切场景（create 时 setupFarmTutorial 读该 step）
    await setStep(page, 'clear_land');
    await page.evaluate(() => window.debug?.giveItem?.('old_hoe', 1));
    await page.evaluate(() => window.debug?.giveItem?.('radish_seed', 3));
    await gotoScene(page, 'farm', { x: 480, y: 300 });
    info = await sceneInfo(page);
    console.log(`  场景=${info.scene} 步骤=${info.step}`);
    await shot(page, '03-farm');
    const farmPx = await sampleCanvas(page, 'farm', 100, 150, 900, 650);
    console.log(`  农场画布采样: 唯一色=${farmPx.unique} 主色=${farmPx.top5.join(' ')}`);
    const farmEls = await sceneElements(page);
    console.log(`  农场元素: texts=${farmEls.texts} sprites=${farmEls.sprites} graphics=${farmEls.graphics} emoji=${farmEls.emoji?.join(',') || '无'}`);

    // 锄地×3 → 播种对白（step 与道具已在切场景前设好，后续步骤自动推进）
    for (let i = 0; i < 3; i++) {
      await teleport(page, 'farm', (13 + i) * T + 8, 10 * T + 20, 'up');
      await pressE(page);
      await sleep(350);
    }
    await walkDialogue(page, 'sow-seeds-dialogue');
    await shot(page, '03b-farm-tilled');

    // 播种×3 → 浇水对白（R 切种子，E 播种）
    await page.keyboard.press('KeyR');
    await sleep(200);
    for (let i = 0; i < 3; i++) {
      await teleport(page, 'farm', (13 + i) * T + 8, 10 * T + 20, 'up');
      await pressE(page);
      await sleep(350);
    }
    await walkDialogue(page, 'water-crops-dialogue');
    await shot(page, '03c-farm-sown');

    // 浇水×3 → 晚间对白
    for (let i = 0; i < 3; i++) {
      await teleport(page, 'farm', (13 + i) * T + 8, 10 * T + 20, 'up');
      await pressE(page);
      await sleep(350);
    }
    await walkDialogue(page, 'evening-dialogue');
    await shot(page, '03d-farm-watered');

    // 农田土地像素采样（相机跟随锄地位置附近，屏幕中心区；检测 tilled 非纯色块）
    const soilPx = await sampleCanvas(page, 'soil', 360, 240, 460, 360, 4);
    nodes.push({ type: 'pixel', soilPx });
    console.log(`  农田地块采样: 唯一色=${soilPx.unique} 主色=${soilPx.top5.join(' ')}`);
    check('C1 农田非纯色块', soilPx.unique > 2, `唯一色=${soilPx.unique}`);

    // ============ 4. 进屋睡觉 → 次日 → 小镇 ============
    console.log('\n--- 节点 4: 睡觉→小镇→村长任务---');
    await setStep(page, 'evening_talk');
    await teleport(page, 'farm', 6 * T + 8, 20 * T, 'up');
    await sleep(1000);
    await gotoScene(page, 'house', { x: 40, y: 40 });
    await pressE(page);
    await sleep(2500);
    info = await sceneInfo(page);
    console.log(`  睡后场景=${info.scene} 步骤=${info.step}`);
    await shot(page, '04-next-morning');

    // 前往小镇（直接切场景）
    // 次日 06:00 村长在村长家；设 10:00 让村长在镇上办公（真实玩家也常白天来镇上）
    await page.evaluate(() => window.debug?.setTime?.(10, 0));
    await gotoScene(page, 'town', { x: 200, y: 300 });
    await sleep(1500);
    info = await sceneInfo(page);
    console.log(`  抵达场景=${info.scene} 步骤=${info.step}`);
    await shot(page, '04b-town-arrive');
    const townPx = await sampleCanvas(page, 'town', 100, 150, 900, 650);
    console.log(`  小镇画布采样: 唯一色=${townPx.unique} 主色=${townPx.top5.join(' ')}`);
    const townEls = await sceneElements(page);
    console.log(`  小镇元素: texts=${townEls.texts} sprites=${townEls.sprites} graphics=${townEls.graphics} emoji=${townEls.emoji?.join(',') || '无'}`);
    check('T2 小镇无 emoji 占位', !(townEls.emoji?.length > 0), `emoji=${townEls.emoji?.join(',') || '无'}`);

    // 村长接任务（等 ch1 剧情 intro 播放完）
    await walkDialogue(page, 'town-intro-dialogue');
    await teleport(page, 'town', 216, 184, 'up');
    await pressE(page);
    await walkDialogue(page, 'elder-quest');
    await shot(page, '04c-town-after-elder');
    const qAfterElder = await page.evaluate(() => window.debug?.getQuestState?.());
    console.log(`  村长接任务后 questState=${qAfterElder}`);
    check('Q1 村长任务已接', qAfterElder === 'accepted', `questState=${qAfterElder}`);

    // ============ 5. 森林碎片 ============
    console.log('\n--- 节点 5: 森林碎片 ---');
    // 任务已接（accepted）后森林碎片可见；保持时间白天
    await page.evaluate(() => window.debug?.setTime?.(11, 0));
    await gotoScene(page, 'forest', { x: 328, y: 200 });
    info = await sceneInfo(page);
    console.log(`  抵达场景=${info.scene}`);
    await shot(page, '05-forest');
    const forestPx = await sampleCanvas(page, 'forest', 100, 150, 900, 650);
    console.log(`  森林画布采样: 唯一色=${forestPx.unique} 主色=${forestPx.top5.join(' ')}`);
    const forestEls = await sceneElements(page);
    console.log(`  森林元素: texts=${forestEls.texts} sprites=${forestEls.sprites} emoji=${forestEls.emoji?.join(',') || '无'}`);

    await teleport(page, 'forest', 328, 184, 'up');
    await pressE(page);
    await walkDialogue(page, 'forest-shard');
    await advanceFlashback(page);
    await sleep(1200);
    await shot(page, '05b-forest-after-collect');
    const qAfterShard = await page.evaluate(() => window.debug?.getQuestState?.());
    console.log(`  采集碎片后 questState=${qAfterShard}`);
    check('Q2 碎片已采集', qAfterShard === 'collected', `questState=${qAfterShard}`);

    // ============ 6. 交付 ============
    console.log('\n--- 节点 6: 交付碎片 ---');
    await page.evaluate(() => window.debug?.setTime?.(12, 0));
    await gotoScene(page, 'town', { x: 200, y: 300 });
    info = await sceneInfo(page);
    console.log(`  抵达场景=${info.scene}`);
    // 清掉可能已自动触发的每日事件对白（30% 概率，避免挡住村长交付）
    await walkDialogue(page, 'daily-event-maybe');
    await teleport(page, 'town', 216, 184, 'up');
    await pressE(page);
    await walkDialogue(page, 'shard-deliver');
    await shot(page, '06-town-after-deliver');
    const qAfterDeliver = await page.evaluate(() => window.debug?.getQuestState?.());
    console.log(`  交付后 questState=${qAfterDeliver}`);
    check('Q3 任务已交付', qAfterDeliver === 'completed', `questState=${qAfterDeliver}`);

    // ============ 7. 观星夜 ============
    console.log('\n--- 节点 7: 观星夜 ---');
    await page.evaluate(() => window.debug?.setTime?.(21, 0));
    await gotoScene(page, 'farm', { x: 504, y: 240 });
    await sleep(1500);
    info = await sceneInfo(page);
    console.log(`  场景=${info.scene}`);
    await shot(page, '07-stargaze-marker');
    const stargazeEls = await sceneElements(page);
    console.log(`  观星点元素: texts=${stargazeEls.texts} emoji=${stargazeEls.emoji?.join(',') || '无'}`);
    await teleport(page, 'farm', 504, 240, 'up');
    await pressE(page);
    await sleep(3200);
    await shot(page, '07b-stargaze-night');
    const nightPx = await sampleCanvas(page, 'stargaze', 100, 150, 900, 650);
    console.log(`  观星夜画布采样: 唯一色=${nightPx.unique} 主色=${nightPx.top5.join(' ')}`);
    await walkDialogue(page, 'demo-ending');

    // 选分支 1
    await page.keyboard.press('Digit1');
    await sleep(1000);
    await walkDialogue(page, 'branch-try-stay');
    await sleep(6000);
    const endingOpen = await page.evaluate(() => {
      const p = document.getElementById('ending-panel');
      return !!p && p.style.display !== 'none' && p.style.display !== '';
    });
    check('E1 结算面板出现', endingOpen === true, '');
    await shot(page, '07c-demo-finale');
    console.log(`  结算面板=${endingOpen}`);

    // ============ 汇总 ============
    nodes.push({ type: 'summary', pageErrs });
    const logPath = join(SHOT_DIR, 'audit-log.json');
    writeFileSync(logPath, JSON.stringify({ pageErrs, nodes }, null, 2));
    console.log('\n\n========== 玩家流程审查取证完成 ==========');
    console.log(`截图: ${SHOT_DIR}`);
    console.log(`记录: ${logPath}`);
    console.log(`运行时错误: ${pageErrs.length} 条`);
    for (const e of pageErrs) console.log(`  [err] ${e}`);
    check('E2 全程无运行时错误', pageErrs.length === 0, pageErrs.slice(0, 3).join(' | '));
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  } finally {
    await browser.close();
  }
}

run().catch((e) => { console.error('异常:', e); process.exit(1); });
