/**
 * BUG-048 归星岛环境循环系统（v0.10-lite）运行时验证探针
 *
 * 验证（事件表脚本化：Day2 10:00-16:00 小雨，其余晴）：
 *   1. 天气派生表（按 day/hour 行为验证）：
 *      day1 12:00 晴 / day2 09:00 无雨（窗口前）/ day2 12:00 雨（覆盖层+粒子）/
 *      day2 16:00 无雨（窗口后）/ day3 12:00 晴
 *   2. 跨场景一致性：farm 与 town 同一天同一时刻天气一致
 *   3. 室内无雨：house（屋内）/ mine（矿洞有顶）不下雨（RAIN_MAPS 守卫）
 *   4. 切场景无残留：雨场景 → 屋内场景无覆盖层/粒子残留；回到雨场景恢复
 *   5. 雨天自动湿润（真实 trySleep 链路）：
 *      - Day1 睡到 Day2 06:00 → planted 自动变 watered（不耗水壶）+ 提示"雨水帮忙浇过了农田！"
 *      - 非雨天（Day3 睡到 Day4）→ 不触发、无提示
 *   6. 存档零新增字段：save 无 weather/season
 *   7. 无运行时错误
 *
 * 前置：dev server；node probe-weather-048.mjs
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(__dirname, 'test-screenshots');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

mkdirSync(SHOT_DIR, { recursive: true });

/** 场景天气快照（scene 动态插值） */
const snapWeather = scene => `(() => {
  const s = window.__game.scene.getScene('${scene}');
  if (!s) return { sceneLoaded: false };
  return {
    sceneLoaded: true,
    mapKey: s.mapKey,
    rainActive: s.rainActive,
    overlayActive: !!(s.rainOverlay && s.rainOverlay.active),
    emitterActive: !!(s.rainEmitter && s.rainEmitter.active),
  };
})()`;

/** 自动湿润结果快照（当前活动场景 + 存档） */
const SNAP_MOISTEN = `(() => {
  const s = window.__game.scene.getScenes(true)[0];
  const save = JSON.parse(localStorage.getItem('return_star_save') || 'null');
  return {
    t1: window.debug.farm.getTileState(13, 9),
    t2: window.debug.farm.getTileState(14, 9),
    t3: window.debug.farm.getTileState(15, 9),
    dialogue: (s.dialogueText && s.dialogueText.text) || null,
    savedDay: save ? (save.world ? save.world.day : null) : null,
    topKeys: save ? Object.keys(save) : [],
    worldKeys: save && save.world ? Object.keys(save.world) : [],
  };
})()`;

async function run() {
  console.log('=== BUG-048 归星岛环境循环系统（v0.10-lite）运行时验证 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  const errors = [];
  const notFound = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() === 404) notFound.push(r.url()); });

  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
    ok ? pass++ : fail++;
  };

  /** 轮询等待：title 场景反复按 Enter/点击，直到进入目标场景 */
  const enterGame = async (scene, timeoutMs = 20000) => {
    const t0 = Date.now();
    let cur = '';
    while (Date.now() - t0 < timeoutMs) {
      cur = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (cur === scene) return;
      if (cur === 'title') {
        await page.keyboard.press('Enter');
        await page.mouse.click(400, 300);
      }
      await sleep(350);
    }
    const diag = await page.evaluate(() => ({
      hasGame: !!window.__game,
      activeScenes: window.__game ? window.__game.scene.getScenes(true).map(s => s.scene.key) : [],
      saveExists: !!localStorage.getItem('return_star_save'),
      saveScene: (() => { const s = JSON.parse(localStorage.getItem('return_star_save') || 'null'); return s ? s.player.scene : null; })(),
    }));
    throw new Error(`未能进入场景 ${scene}（实际 ${cur}）诊断=${JSON.stringify(diag)} 页面错误=${errors.slice(0, 5).join(' | ')}`);
  };

  /** 注入指定 day/hour 的存档并进入场景 */
  const gotoDayScene = async (scene, day, hour) => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1000);
    await page.evaluate(({ scene, day, hour }) => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'BUG-048探针', timestamp: Date.now(),
        player: { x: 240, y: 96, scene, facing: 'down', inventory: {} },
        world: { day, hour, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
      }));
    }, { scene, day, hour });
    await page.reload({ waitUntil: 'networkidle2' });
    await enterGame(scene);
    await sleep(1200);
  };

  /** 游戏内直接切场景（不 reload） */
  const switchScene = async (target) => {
    await page.evaluate((t) => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start(t);
    }, target);
    let cur = '';
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      cur = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (cur === target) break;
    }
    if (cur !== target) throw new Error(`未能切换到场景 ${target}（实际 ${cur}）`);
    await sleep(1000);
  };

  /** 种 3 格未浇水作物（供自动湿润验证） */
  const plantThree = () => page.evaluate(() => {
    window.debug.farm.setTileState(13, 9, 'planted');
    window.debug.farm.setCrop(13, 9, { cropType: 'tomato', plantDay: 1, watered: false });
    window.debug.farm.setTileState(14, 9, 'planted');
    window.debug.farm.setCrop(14, 9, { cropType: 'tomato', plantDay: 1, watered: false });
    window.debug.farm.setTileState(15, 9, 'planted');
    window.debug.farm.setCrop(15, 9, { cropType: 'tomato', plantDay: 1, watered: false });
  });

  try {
    // ========== A. 天气派生表（farm 行为验证） ==========
    console.log('── A. 天气派生表（Day2 10:00-16:00 小雨） ──');

    await gotoDayScene('farm', 1, 12);
    let d = await page.evaluate(snapWeather('farm'));
    check('A1 day1 12:00 晴天无雨', d.sceneLoaded && d.rainActive === false && !d.overlayActive, `实际=${JSON.stringify(d)}`);

    await gotoDayScene('farm', 2, 9);
    d = await page.evaluate(snapWeather('farm'));
    check('A2 day2 09:00 无雨（窗口前）', d.sceneLoaded && d.rainActive === false && !d.overlayActive, `实际=${JSON.stringify(d)}`);

    await gotoDayScene('farm', 2, 12);
    d = await page.evaluate(snapWeather('farm'));
    check('A3 day2 12:00 下雨（覆盖层+粒子）', d.sceneLoaded && d.rainActive === true && d.overlayActive && d.emitterActive, `实际=${JSON.stringify(d)}`);
    const shot1 = join(SHOT_DIR, 'weather048-farm-rain-day2.png');
    await page.screenshot({ path: shot1 });
    console.log(`  📸 ${shot1}`);

    await gotoDayScene('farm', 2, 16);
    d = await page.evaluate(snapWeather('farm'));
    check('A4 day2 16:00 无雨（窗口后）', d.sceneLoaded && d.rainActive === false && !d.overlayActive, `实际=${JSON.stringify(d)}`);

    await gotoDayScene('farm', 3, 12);
    d = await page.evaluate(snapWeather('farm'));
    check('A5 day3 12:00 晴天无雨', d.sceneLoaded && d.rainActive === false && !d.overlayActive, `实际=${JSON.stringify(d)}`);

    // ========== B. 跨场景一致性 + 室内无雨 ==========
    console.log('\n── B. 跨场景一致性 + 室内无雨 ──');

    await gotoDayScene('town', 2, 12);
    d = await page.evaluate(snapWeather('town'));
    check('B1 town day2 12:00 与 farm 同一天一致下雨', d.sceneLoaded && d.rainActive === true && d.overlayActive, `实际=${JSON.stringify(d)}`);

    await gotoDayScene('house', 2, 12);
    d = await page.evaluate(snapWeather('house'));
    check('B2 house（屋内）不下雨', d.sceneLoaded && d.rainActive === false && !d.overlayActive, `实际=${JSON.stringify(d)}`);
    const shot2 = join(SHOT_DIR, 'weather048-house-clear-day2.png');
    await page.screenshot({ path: shot2 });
    console.log(`  📸 ${shot2}`);

    await gotoDayScene('mine', 2, 12);
    d = await page.evaluate(snapWeather('mine'));
    check('B3 mine（矿洞有顶）不下雨', d.sceneLoaded && d.rainActive === false && !d.overlayActive, `实际=${JSON.stringify(d)}`);

    // ========== C. 切场景无残留 ==========
    console.log('\n── C. 切场景无残留 ──');

    await gotoDayScene('farm', 2, 12); // 雨天 farm
    d = await page.evaluate(snapWeather('farm'));
    check('C1 雨天 farm 已就绪', d.rainActive === true && d.overlayActive, `实际=${JSON.stringify(d)}`);

    await switchScene('house'); // 雨 → 屋内
    d = await page.evaluate(snapWeather('house'));
    check('C2 切到屋内无雨且无残留覆盖层/粒子', d.rainActive === false && !d.overlayActive && !d.emitterActive, `实际=${JSON.stringify(d)}`);

    await switchScene('farm'); // 屋内 → 回雨天 farm
    d = await page.evaluate(snapWeather('farm'));
    check('C3 回到 farm 雨天恢复', d.rainActive === true && d.overlayActive && d.emitterActive, `实际=${JSON.stringify(d)}`);

    // ========== D. 雨天自动湿润（真实 trySleep 链路） ==========
    console.log('\n── D. 雨天自动湿润（不耗水壶） ──');

    // D1：Day1 22:00 睡到 Day2 06:00（雨天当天清晨）→ planted 自动变 watered
    await gotoDayScene('farm', 1, 22);
    await plantThree();
    await page.evaluate(() => window.__game.scene.getScene('farm').trySleep());
    await sleep(1000);
    d = await page.evaluate(SNAP_MOISTEN);
    check('D1 睡后进入 Day2', d.savedDay === 2, `实际=${d.savedDay}`);
    check('D1 planted → watered（3 格）', d.t1 === 'watered' && d.t2 === 'watered' && d.t3 === 'watered',
      `实际=${d.t1}/${d.t2}/${d.t3}`);
    check('D1 提示"雨水帮忙浇过了农田！"', !!d.dialogue && d.dialogue.includes('雨水帮忙浇过了农田'), `实际=${d.dialogue}`);

    // D2：Day3 22:00 睡到 Day4（非雨天）→ 不触发、无提示
    await gotoDayScene('farm', 3, 22);
    await plantThree();
    await page.evaluate(() => window.__game.scene.getScene('farm').trySleep());
    await sleep(1000);
    d = await page.evaluate(SNAP_MOISTEN);
    check('D2 睡后进入 Day4（非雨天）', d.savedDay === 4, `实际=${d.savedDay}`);
    check('D2 非雨天 planted 保持（不湿润）', d.t1 === 'planted' && d.t2 === 'planted' && d.t3 === 'planted',
      `实际=${d.t1}/${d.t2}/${d.t3}`);
    check('D2 无雨水提示', !(d.dialogue && d.dialogue.includes('雨水帮忙浇过')), `实际=${d.dialogue}`);

    // ========== E. 存档零新增字段 ==========
    console.log('\n── E. 存档零新增字段 ──');
    check('E 顶层无 weather/season 字段', !d.topKeys.includes('weather') && !d.topKeys.includes('season'),
      `topKeys=${d.topKeys.join(',')}`);
    check('E world 无 weather/season 字段', !d.worldKeys.includes('weather') && !d.worldKeys.includes('season'),
      `worldKeys=${d.worldKeys.join(',')}`);

    // ========== F. 运行时错误 ==========
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    const real404 = notFound.filter(u => !u.endsWith('favicon.ico'));
    check('F 无运行时错误', realErrors.length === 0 && real404.length === 0,
      [...realErrors, ...real404.map(u => '404: ' + u.replace(GAME_URL, ''))].join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
