/**
 * Esc 菜单链路验证（对应反馈：网页端按 Esc 不触发菜单）
 *
 * 5 个链路：
 *   1. 教程完成后直接 Esc → 应弹系统菜单
 *   2. B 开背包 → Esc → 应关背包（不弹菜单）
 *   3. 背包关后 Esc → 应弹系统菜单
 *   4. 背包开着 Esc → 背包关 + 菜单不弹（与 2 同验证，但独立断言）
 *   5. 对话中 Esc → 跳过整段（town-intro 真实验证；选项行除外——town-intro 无选项）
 *
 * 前置状态注入方式（重要）：
 *   不走 window.debug.setStoryStep —— dev 双模块/HMR 下 debug API 可能写到非游戏实例，
 *   导致 isTutorialDone() 读不到 done（曾出现 step=station_intro 异常态）。
 *   改为通过 CDP addScriptToEvaluateOnNewDocument 在页面脚本前注入完整存档
 *   （storyStep='done'，不含 ch1TownIntroDone），由游戏自己的 SaveSystem.apply()
 *   在 StationScene 启动时加载 → 模块状态必然一致，确定性通过。
 *
 * 前置：dev server 在 localhost:5173
 * 运行：node probe-esc-menu.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(__dirname, 'test-screenshots');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(SHOT_DIR, { recursive: true });

// 种子存档：教程已完成（done）、town-intro 未触发、出生在农场
const SEED_SAVE = {
  version: '0.5',
  savedAt: '2026-08-06 00:00',
  timestamp: Date.now(),
  player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {}, lockedItems: [] },
  world: { day: 1, hour: 6, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
  farm: { tiles: [], crops: [], trees: [], restore: {}, automation: { level: 1, robots: [] } },
  story: { storyStep: 'done' }, // 注意：无 ch1TownIntroDone → 首次进小镇仍会触发 town-intro
};

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
}

// Phaser JustDown 依赖跨帧的 keydown 状态：瞬时 down+up 会被同帧吞掉，
// 必须按住一小段再松开（Esc 走 DOM keydown 监听，瞬时即可，不受影响）
async function pressKeyHold(pg, key, ms = 150) {
  await pg.keyboard.down(key);
  await sleep(ms);
  await pg.keyboard.up(key);
}

async function run() {
  console.log('=== Esc 菜单链路验证（存档注入版）===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1280, height: 800 }, args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const pageErrs = [];
  page.on('pageerror', e => pageErrs.push(e.message));

  try {
    // 在页面任何脚本执行前注入种子存档（每个新 document 都会执行）
    await page.evaluateOnNewDocument((seed) => {
      localStorage.setItem('return_star_save', JSON.stringify(seed));
    }, SEED_SAVE);

    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(2000);
    await page.keyboard.press('Enter'); // 开始游戏（检测到存档 → 自动继续）
    await sleep(3000);

    // 等 debug API + 游戏实例就绪
    let dbg = false;
    for (let i = 0; i < 30; i++) {
      dbg = await page.evaluate(() => !!(window.debug && window.__game));
      if (dbg) break;
      await sleep(300);
    }
    check('debug API 就绪', dbg);

    // 确认存档已通过游戏自身 apply() 加载：应处于农场 + step=done
    const loaded = await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      return { scene: s?.scene?.key ?? null, step: window.debug.getStoryStep() };
    });
    check('处于农场 MapScene', loaded.scene === 'farm', `scene=${loaded.scene}`);
    check('教程已完成（step=done）', loaded.step === 'done', `step=${loaded.step}`);

    // ===== 1. 直接 Esc → 系统菜单 =====
    await page.keyboard.press('Escape');
    await sleep(500);
    const m1 = await page.evaluate(() => !!document.getElementById('exit-confirm'));
    check('1. 教程完成后直接 Esc → 弹系统菜单', m1);

    // 关菜单（点「继续游戏」）
    await page.evaluate(() => {
      document.querySelector('#exit-confirm button[data-act="resume"]')?.click();
    });
    await sleep(400);
    const menuClosed = await page.evaluate(() => !document.getElementById('exit-confirm'));
    check('菜单「继续游戏」关闭', menuClosed);

    // ===== 2. B 开背包 → Esc 关背包（不弹菜单） =====
    await pressKeyHold(page, 'KeyB');
    await sleep(600);
    const bpOpen = await page.evaluate(() => {
      const el = document.getElementById('backpack-panel');
      const s = window.__game.scene.getScene('farm');
      return {
        domExists: !!el,
        display: el?.style.display ?? 'no-dom',
        isOpen: !!s?.backpackPanel?.isOpen?.(),
      };
    });
    console.log('  B 键后: ', JSON.stringify(bpOpen));
    check('2a. B 键打开背包（DOM 显示）', bpOpen.domExists && bpOpen.display !== 'none', `display=${bpOpen.display} isOpen=${bpOpen.isOpen}`);

    await page.keyboard.press('Escape');
    await sleep(500);
    const afterEsc = await page.evaluate(() => {
      const el = document.getElementById('backpack-panel');
      return {
        panel: !!el && el.style.display !== 'none',
        menu: !!document.getElementById('exit-confirm'),
      };
    });
    check('2b. Esc 关闭背包（面板关）', !afterEsc.panel);
    check('2c. 面板关闭时菜单不弹', !afterEsc.menu);

    // ===== 3. 背包关后 Esc → 系统菜单 =====
    await page.keyboard.press('Escape');
    await sleep(500);
    const m3 = await page.evaluate(() => !!document.getElementById('exit-confirm'));
    check('3. 背包关后 Esc → 弹系统菜单', m3);

    await page.screenshot({ path: join(SHOT_DIR, 'esc-menu-final.png') });

    // 关菜单再测一次面板开着 Esc（独立）
    await page.evaluate(() => {
      document.querySelector('#exit-confirm button[data-act="resume"]')?.click();
    });
    await sleep(400);
    await pressKeyHold(page, 'KeyB');
    await sleep(600);
    await page.keyboard.press('Escape');
    await sleep(500);
    const s4 = await page.evaluate(() => {
      const el = document.getElementById('backpack-panel');
      return {
        panel: !!el && el.style.display !== 'none',
        menu: !!document.getElementById('exit-confirm'),
      };
    });
    check('4. 背包开着 Esc → 面板关', !s4.panel);
    check('4b. 背包开着 Esc → 菜单不弹', !s4.menu);

    // ===== 5. 对话中 Esc → 跳过整段（剧情正常推进） =====
    // town-intro：首次进小镇自动触发（教程完成 + ch1TownIntroDone 未标记）
    await page.evaluate(() => {
      document.querySelector('#exit-confirm button[data-act="resume"]')?.click(); // 确保菜单已关
    });
    await sleep(300);
    await page.evaluate(() => {
      const g = window.__game;
      const active = g.scene.getScenes(true)[0];
      if (active && active.scene.key !== 'town') g.scene.stop(active.scene.key);
      g.scene.start('town', { spawn: { x: 200, y: 300 } });
    });
    await sleep(3200); // town-intro delayedCall 600ms + 打字
    let dlgOpen = false;
    for (let i = 0; i < 20; i++) {
      dlgOpen = await page.evaluate(() => {
        const s = window.__game.scene.getScene('town');
        return s?.storyDialogue?.isOpen?.() ?? false;
      });
      if (dlgOpen) break;
      await sleep(250);
    }
    check('5a. town-intro 对话已打开', dlgOpen);

    await page.keyboard.press('Escape');
    await sleep(700);
    const dlgAfter = await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      return { open: s?.storyDialogue?.isOpen?.() ?? false, step: window.debug.getStoryStep() };
    });
    check('5b. 对话中 Esc → 跳过整段（对话关闭）', !dlgAfter.open);
    check('5c. 跳过后剧情状态正常（step 仍 done）', dlgAfter.step === 'done', `step=${dlgAfter.step}`);

    await page.screenshot({ path: join(SHOT_DIR, 'esc-dialogue-skip.png') });
    console.log('\n=== 完成 ===');
  } catch (e) {
    console.error('异常:', e.message);
  } finally {
    await browser.close();
  }
  const pass = results.filter(r => r.ok).length;
  console.log(`结果: ${pass} 通过 / ${results.length - pass} 失败`);
  console.log(`运行时错误: ${pageErrs.length} 条${pageErrs.length ? ' - ' + pageErrs.join(' | ') : ''}`);
  process.exit(pass === results.length ? 0 : 1);
}
run();
