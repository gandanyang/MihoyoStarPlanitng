/**
 * E2E 压力测试 — 切图 / 挖矿稳定性（v0.5 / Alpha P0 防黑屏）
 * 使用 puppeteer-core + Chrome 自动化测试
 *
 * 背景：用户反馈「挖矿 或切地图 有概率黑屏」。
 * 历史根因：多个场景同时 RUNNING 叠加渲染 → 黑屏。
 * 验证目标：
 *   1. 连续 16 次真实出口切图，始终只有 1 个场景 RUNNING
 *   2. 每次切图后摄像机不卡在淡出/黑屏状态（_fadeAlpha/_flashAlpha === 0）
 *   3. 挖矿交互（E 键开采）正常，矿脉不重复开采
 *
 * 前置条件: Vite dev server 运行在 localhost:5173
 * 运行: node test-stress-switch.mjs
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

let pass = 0;
let fail = 0;

function ok(step, passed, detail = '') {
  if (passed) {
    pass++;
    console.log(`  ✅ ${step}${detail ? ' - ' + detail : ''}`);
  } else {
    fail++;
    console.log(`  ❌ ${step}${detail ? ' - ' + detail : ''}`);
  }
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

/** 切图稳定性快照：RUNNING 场景数 + 摄像机淡入淡出状态 + 玩家存在 + 渲染循环 */
async function snapshot(page) {
  return page.evaluate(() => {
    const active = window.__game.scene.getScenes(true);
    const cam = active[0]?.cameras?.main;
    return {
      runningCount: active.length,
      scene: active[0]?.scene?.key ?? 'none',
      hasPlayer: !!active[0]?.player,
      dialogueOpen: !!active[0]?.storyDialogue?.isOpen(),
      // Phaser Camera 淡出/淡入剩余 alpha（0 = 无遮罩，不会黑屏）
      fadeAlpha: cam ? (cam._fadeAlpha ?? 0) : -1,
      flashAlpha: cam ? (cam._flashAlpha ?? 0) : -1,
      loopRunning: window.__game.loop.running,
    };
  });
}

/**
 * 自动关闭当前打开的剧情对话（模拟玩家看完/按E跳过）。
 * 每帧 advance() 一次，直到对话关闭（上限 60 步 ≈ 20 行，防死循环）。
 * 背景：小镇第一章开场对话会在 update() 中提前 return，导致出口检测被阻塞；
 *       真实玩家关闭对话后出口恢复，因此测试需模拟这一步。
 */
async function skipOpenDialogue(page) {
  let steps = 0;
  while (steps < 60) {
    const stillOpen = await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) {
        s.storyDialogue.advance();
        return true;
      }
      return false;
    });
    if (!stillOpen) break;
    steps++;
    await sleep(50);
  }
  if (steps > 0) {
    console.log(`  ↳ 已跳过剧情对话（${steps} 步）`);
    await sleep(300);
  }
}

/** 玩家瞬移到指定坐标（触发出口区域） */
async function teleport(page, x, y) {
  await page.evaluate(([px, py]) => {
    const s = window.__game.scene.getScenes(true)[0];
    s.player.x = px;
    s.player.y = py;
  }, [x, y]);
}

/**
 * 真实出口切图路由（exits.ts 定义的出口区域，单位 px，16px/格）：
 *   farm 顶→forest | forest 右→mine | mine 底→town | town 左→farm
 *   farm 右→town   | town 顶→mine  | mine 左→forest | forest 底→farm
 */
const ROUTES = [
  { from: 'farm',   to: 'forest', x: 240, y: 30 },
  { from: 'forest', to: 'mine',   x: 464, y: 160 },
  { from: 'mine',   to: 'town',   x: 240, y: 300 },
  { from: 'town',   to: 'farm',   x: 16,  y: 160 },
  { from: 'farm',   to: 'town',   x: 620, y: 160 },
  { from: 'town',   to: 'mine',   x: 240, y: 16 },
  { from: 'mine',   to: 'forest', x: 16,  y: 160 },
  { from: 'forest', to: 'farm',   x: 240, y: 300 },
];

/** 进入 mine 后：瞬移到第一块未开采矿脉旁按 E，验证开采 */
let mineTipConsumed = false;

/** 消耗挖矿引导对话（仅第一次进入 mine 时调用） */
async function consumeMineTip(page) {
  if (mineTipConsumed) return;
  mineTipConsumed = true;
  // 先瞬移到第一块矿脉旁再按 E：挖矿引导要求玩家靠近矿脉，直接按 E 不会触发，
  // 否则引导对话会延后到 mineOneOre 的首次开采才弹，拦截开采且阻塞出口检测。
  const tipTarget = await page.evaluate(() => {
    const s = window.__game.scene.getScene('mine');
    const t = s?.oreSprites?.find(e => e.sprite.visible);
    return t ? { x: t.sprite.x, y: t.sprite.y + 20 } : null;
  });
  if (tipTarget) {
    await page.evaluate(([px, py]) => {
      const s = window.__game.scene.getScene('mine');
      s.player.x = px;
      s.player.y = py;
    }, [tipTarget.x, tipTarget.y]);
    await sleep(150);
  }
  // 按 E 触发引导对话
  await page.keyboard.press('KeyE');
  await sleep(400);
  // 等对话真正打开后循环 advance 直到关闭（固定 7 次会在对话未打开时空转，导致
  // 引导对话延后到 mineOneOre 首次开采时弹出，拦截开采并阻塞后续切图）
  for (let i = 0; i < 30; i++) {
    const stillOpen = await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) {
        s.storyDialogue.advance();
        return true;
      }
      return false;
    });
    if (!stillOpen) break;
    await sleep(50);
  }
  await sleep(500);
}

async function mineOneOre(page, round) {
  const info = await page.evaluate(() => {
    const s = window.__game.scene.getScene('mine');
    const target = s?.oreSprites?.find(e => e.sprite.visible);
    if (!target) return { count: 0, pos: null };
    return {
      count: s.oreSprites.length,
      pos: { x: target.sprite.x, y: target.sprite.y + 20 },
    };
  });
  if (!info.pos) {
    ok(`R${round} 挖矿：无可见矿脉`, false, 'mine 场景 oreSprites 为空');
    return;
  }
  await page.evaluate(([px, py]) => {
    const s = window.__game.scene.getScene('mine');
    s.player.x = px;
    s.player.y = py;
  }, [info.pos.x, info.pos.y]);
  await sleep(150);
  await page.keyboard.press('KeyE');
  await sleep(500);
  const after = await page.evaluate(() => {
    const s = window.__game.scene.getScene('mine');
    return { count: s?.oreSprites?.length ?? -1 };
  });
  ok(`R${round} 挖矿：矿脉减少(移除不重复开采)`, after.count === info.count - 1,
    `开采前 ${info.count} → 后 ${after.count}`);
}

async function run() {
  console.log('=== 归星物语 切图/挖矿压力测试（Alpha P0 防黑屏）===\n');

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
    // ---- 准备：清存档 → 启动 → title → Enter → station → 跳过开场 ----
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);

    let scene = await activeScene(page);
    ok('启动停在 title', scene === 'title', `场景=${scene}`);
    await page.keyboard.press('Enter');
    await sleep(2000);
    scene = await activeScene(page);
    ok('进入 station', scene === 'station', `场景=${scene}`);

    await page.evaluate(() => {
      const btn = document.getElementById('intro-skip-btn');
      if (btn) btn.click();
      window.debug.setStoryStep('done'); // 跳过教程，直接进入可自由切图的游戏状态
    });
    await sleep(800);

    // 走出车站 → farm
    await teleport(page, 970, 460);
    await sleep(3000);
    scene = await activeScene(page);
    ok('车站→农场(教程跳过)', scene === 'farm', `场景=${scene}`);
    await screenshot(page, 'stress-0-farm');

    // ---- 压力循环：16 次真实出口切图 ----
    console.log('\n--- 连续切图压力循环 ×16 ---');
    for (let round = 1; round <= ROUTES.length * 2; round++) {
      const route = ROUTES[(round - 1) % ROUTES.length];

      await teleport(page, route.x, route.y);
      await sleep(1800); // fadeOut(250) + 场景加载 + fadeIn(300)

      const snap = await snapshot(page);
      const expect = route.to;
      const stateOK =
        snap.scene === expect &&
        snap.runningCount === 1 &&
        snap.hasPlayer &&
        snap.fadeAlpha === 0 &&
        snap.flashAlpha === 0 &&
        snap.loopRunning;
      ok(`R${round} ${route.from}→${route.to}`, stateOK,
        `场景=${snap.scene} RUNNING=${snap.runningCount} fade=${snap.fadeAlpha} flash=${snap.flashAlpha} player=${snap.hasPlayer} loop=${snap.loopRunning}`);

      // 关闭可能自动播放的剧情对话（如小镇第一章开场），否则出口检测被阻塞
      await skipOpenDialogue(page);

      // 已进入 mine：先消耗挖矿引导（仅第一次），再做挖矿验证
      if (snap.scene === 'mine') {
        await consumeMineTip(page);
        await mineOneOre(page, round);
      }

      if (round % 8 === 0) {
        await screenshot(page, `stress-${round}-${route.to}`);
        // 每轮循环后睡觉存档，验证存档在多次切图后仍正常
        const day = await page.evaluate(() => window.debug.nextDay());
        ok(`R${round} 睡觉存档`, typeof day === 'number' && day > 0, `day=${day}`);
      }
    }

    await screenshot(page, 'stress-final');

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail === 0) console.log('🎉 切图/挖矿稳定性验证通过，无黑屏');
    else console.log('⚠️ 存在失败项，需排查');
    await sleep(2000);
  } catch (e) {
    console.error('\n❌ 异常:', e.message);
    await screenshot(page, 'stress-error');
  } finally {
    await browser.close();
    console.log('浏览器已关闭');
  }
}

run().catch(console.error);
