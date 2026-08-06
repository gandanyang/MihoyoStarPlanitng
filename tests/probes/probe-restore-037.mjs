/**
 * FEATURE-037 归星岛初级复兴循环（v0.10 主梁）运行时验证探针
 *
 * 验证三个建设点（garden 既有 / oldHouse 老屋 / forestRoad 后山道路）：
 *   1. oldHouse（farm 左下角木屋）：
 *      - 初始（未恢复）：restored=false、破旧装饰 3 组、标记「老屋」存在
 *      - 资源不足按 E → 提示缺木头/石头/金币，不扣除、不恢复、不存档
 *      - 给足资源（wood≥30 stone≥20 gold≥100）按 E → 恢复、装饰替换、扣除正确
 *        （wood 40→10 / stone 30→10 / coins 300→200）、存档 restore.oldHouse=true
 *      - 刷新重进 → 恢复态持久
 *   2. forestRoad（forest 底部空地通道）：
 *      - 初始（未恢复）：restored=false、乱土 gid 2、标记存在
 *      - 资源不足按 E → 提示缺石头，不扣除
 *      - 给足资源（stone≥50 gold≥200）按 E → 恢复、石板小路 gid 7 + 两侧花丛 gid 8、
 *        扣除正确（stone 70→20 / coins 200→0）、存档 restore.forestRoad=true
 *      - 刷新重进 → 恢复态持久
 *   3. 回归：garden 三阶段流程未受影响（stage 仍 0、debris 3 组、存档无 garden 恢复）
 *   4. 无运行时错误
 *
 * 前置：dev server；node probe-restore-037.mjs
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

/** 农场快照：oldHouse + garden 回归 + 存档关键字段 */
const SNAP_FARM = `(() => {
  const s = window.__game.scene.getScene('farm');
  if (!s) return { sceneLoaded: false };
  const oh = s.oldHouseRestore;
  const g = s.gardenRestore;
  const wl = s.wallsLayer;
  const gLD = wl ? wl.tilemap.getLayer('Ground') : null;
  const save = JSON.parse(localStorage.getItem('return_star_save') || 'null');
  return {
    sceneLoaded: true,
    ohRestored: oh ? oh.restored : null,
    ohDebris: oh ? oh.debris.filter(x => x.active).length : -1,
    ohMark: oh ? (!!oh.mark && oh.mark.active) : false,
    ohPos: oh ? oh.pos : null,
    gardenStage: g ? g.stage : -1,
    gardenDebris: g ? g.debris.filter(x => x.active).length : -1,
    savedRestore: save ? (save.farm.restore ?? null) : null,
    savedInv: save ? (save.player.inventory ?? null) : null,
    savedCoins: save ? (save.world.coins ?? null) : null,
    dialogue: (s.dialogueText && s.dialogueText.text) || null,
  };
})()`;

/** 森林快照：forestRoad + 瓦片状态 + 存档 */
const SNAP_FOREST = `(() => {
  const s = window.__game.scene.getScene('forest');
  if (!s) return { sceneLoaded: false };
  const fr = s.forestRoadRestore;
  const wl = s.wallsLayer;
  const gLD = wl ? wl.tilemap.getLayer('Ground') : null;
  const wLD = wl ? wl.tilemap.getLayer('Walls') : null;
  const t = (ld, c, r) => ld ? ld.data[r][c].index : -1;
  const save = JSON.parse(localStorage.getItem('return_star_save') || 'null');
  return {
    sceneLoaded: true,
    frRestored: fr ? fr.restored : null,
    frDebris: fr ? fr.debris.filter(x => x.active).length : -1,
    frMark: fr ? (!!fr.mark && fr.mark.active) : false,
    frPos: fr ? fr.pos : null,
    groundRoad: t(gLD, 15, 13),
    wallFlower: t(wLD, 12, 11),
    // 道路区域可走（无碰撞）
    roadWalkable: (() => {
      if (!wLD) return false;
      for (let r = 10; r <= 16; r++)
        for (let c = 13; c <= 16; c++)
          if (wLD.data[r][c].collides) return false;
      return true;
    })(),
    savedRestore: save ? (save.farm.restore ?? null) : null,
    savedInv: save ? (save.player.inventory ?? null) : null,
    savedCoins: save ? (save.world.coins ?? null) : null,
    dialogue: (s.dialogueText && s.dialogueText.text) || null,
  };
})()`;

async function run() {
  console.log('=== FEATURE-037 归星岛初级复兴循环 运行时验证 ===\n');
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

  /** 注入存档并进入指定场景（scene: 'farm' | 'forest'） */
  const gotoScene = async (scene, extra) => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1000);
    await page.evaluate(({ scene, extra }) => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'FEATURE-037探针', timestamp: Date.now(),
        player: { x: 240, y: 96, scene, facing: 'down', inventory: {} },
        world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
        ...extra,
      }));
    }, { scene, extra });
    await page.reload({ waitUntil: 'networkidle2' });
    await enterGame(scene);
    await sleep(1200);
  };

  /** 直接在游戏内切场景（不 reload） */
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

  /** 保留当前存档（含 restore 字段）只改场景并 reload */
  const gotoSceneKeepSave = async (scene) => {
    await page.evaluate((s) => {
      const key = 'return_star_save';
      const save = JSON.parse(localStorage.getItem(key));
      save.player.scene = s;
      localStorage.setItem(key, JSON.stringify(save));
    }, scene);
    await page.reload({ waitUntil: 'networkidle2' });
    await enterGame(scene);
    await sleep(1200);
  };

  /** 把玩家放到建设点锚点并按 E（不足/成功共用） */
  const pressRestoreE = async (snapGet) => {
    const pos = await page.evaluate(snapGet);
    await page.evaluate((p) => {
      const s = window.__game.scene.getScenes(true)[0];
      s.player.setPosition(p.x, p.y);
    }, pos);
    await sleep(300);
    await page.keyboard.press('E');
    await sleep(700);
  };

  try {
    // ========== A. oldHouse（farm） ==========
    console.log('── oldHouse 老屋修复（farm 左下角木屋） ──');
    // A1. 资源不足（coins 50、无木头石头）
    await gotoScene('farm', { world: { coins: 50 } });
    let d = await page.evaluate(SNAP_FARM);
    check('A1 场景可访问', d.sceneLoaded === true);
    check('A1 老屋初始未恢复', d.ohRestored === false, `实际=${d.ohRestored}`);
    check('A1 破旧装饰 3 组活跃', d.ohDebris === 3, `实际=${d.ohDebris}`);
    check('A1 提示标记存在', d.ohMark === true, `实际=${d.ohMark}`);

    await pressRestoreE(`(() => { const s = window.__game.scene.getScene('farm'); return s.oldHouseRestore.pos; })()`);
    d = await page.evaluate(SNAP_FARM);
    check('A1 资源不足提示缺木头/石头/金币',
      !!d.dialogue && d.dialogue.includes('还缺') && d.dialogue.includes('木头') &&
      d.dialogue.includes('石头') && d.dialogue.includes('金币'),
      `实际=${d.dialogue}`);
    check('A1 不足时不扣除/不恢复', d.ohRestored === false && d.ohDebris === 3, `实际=restored:${d.ohRestored}`);
    check('A1 不足时不写存档 restore', d.savedRestore === null, `实际=${JSON.stringify(d.savedRestore)}`);

    // A2. 资源足够（coins 300）→ 先测"缺木头/石头"提示 → giveItem 补足 → 成功
    await gotoScene('farm', { world: { coins: 300 } });
    await pressRestoreE(`(() => { const s = window.__game.scene.getScene('farm'); return s.oldHouseRestore.pos; })()`);
    d = await page.evaluate(SNAP_FARM);
    check('A2 金币够仍提示缺木头/石头',
      !!d.dialogue && d.dialogue.includes('还缺') && d.dialogue.includes('木头') && d.dialogue.includes('石头'),
      `实际=${d.dialogue}`);
    await page.evaluate(() => {
      window.debug.giveItem('wood', 40);
      window.debug.giveItem('stone', 30);
    });
    await pressRestoreE(`(() => { const s = window.__game.scene.getScene('farm'); return s.oldHouseRestore.pos; })()`);
    d = await page.evaluate(SNAP_FARM);
    check('A2 交付后老屋已恢复', d.ohRestored === true, `实际=${d.ohRestored}`);
    check('A2 破旧装饰全部销毁', d.ohDebris === 0, `实际=${d.ohDebris}`);
    check('A2 提示标记消失', d.ohMark === false, `实际=${d.ohMark}`);
    check('A2 资源扣除正确（wood 40→10 / stone 30→10 / coins 300→200）',
      d.savedInv?.wood === 10 && d.savedInv?.stone === 10 && d.savedCoins === 200,
      `实际=${JSON.stringify({ inv: d.savedInv, coins: d.savedCoins })}`);
    check('A2 存档含 restore.oldHouse=true', d.savedRestore?.oldHouse === true, `实际=${JSON.stringify(d.savedRestore)}`);

    // A3. 刷新重进 → 持久化
    await page.reload({ waitUntil: 'networkidle2' });
    await enterGame('farm');
    await sleep(1200);
    d = await page.evaluate(SNAP_FARM);
    check('A3 重进后老屋仍恢复态（持久化）', d.ohRestored === true, `实际=${d.ohRestored}`);
    check('A3 重进后无破旧装饰', d.ohDebris === 0, `实际=${d.ohDebris}`);

    const shot1 = join(SHOT_DIR, 'restore037-oldhouse-restored.png');
    await page.screenshot({ path: shot1 });
    console.log(`  📸 ${shot1}`);

    // ========== B. forestRoad（forest） ==========
    console.log('\n── forestRoad 后山道路修复（forest 底部空地通道） ──');
    await switchScene('forest');
    d = await page.evaluate(SNAP_FOREST);
    check('B1 场景可访问', d.sceneLoaded === true);
    check('B1 道路初始未恢复', d.frRestored === false, `实际=${d.frRestored}`);
    check('B1 乱土瓦片 (15,13)=gid 2', d.groundRoad === 2, `实际=${d.groundRoad}`);
    check('B1 乱石/树根/杂草 3 组活跃', d.frDebris === 3, `实际=${d.frDebris}`);
    check('B1 提示标记存在', d.frMark === true, `实际=${d.frMark}`);

    // B2. 资源不足（当前 coins 200 正好够、stone 10 < 50）→ 缺石头
    await pressRestoreE(`(() => { const s = window.__game.scene.getScene('forest'); return s.forestRoadRestore.pos; })()`);
    d = await page.evaluate(SNAP_FOREST);
    check('B2 资源不足提示缺石头',
      !!d.dialogue && d.dialogue.includes('还缺') && d.dialogue.includes('石头'),
      `实际=${d.dialogue}`);
    check('B2 不足时不扣除/不恢复', d.frRestored === false && d.frDebris === 3, `实际=restored:${d.frRestored}`);
    check('B2 不足时不写存档 restore', d.savedRestore?.forestRoad !== true, `实际=${JSON.stringify(d.savedRestore)}`);

    // B3. 补足石头 → 成功
    await page.evaluate(() => window.debug.giveItem('stone', 60));
    await pressRestoreE(`(() => { const s = window.__game.scene.getScene('forest'); return s.forestRoadRestore.pos; })()`);
    d = await page.evaluate(SNAP_FOREST);
    check('B3 交付后道路已恢复', d.frRestored === true, `实际=${d.frRestored}`);
    check('B3 石板小路 (15,13)=gid 7', d.groundRoad === 7, `实际=${d.groundRoad}`);
    check('B3 两侧花丛 (12,11)=gid 8', d.wallFlower === 8, `实际=${d.wallFlower}`);
    check('B3 道路区域可走（无碰撞）', d.roadWalkable === true, `实际=${d.roadWalkable}`);
    check('B3 乱石装饰销毁', d.frDebris === 0, `实际=${d.frDebris}`);
    check('B3 提示标记消失', d.frMark === false, `实际=${d.frMark}`);
    check('B3 资源扣除正确（stone 70→20 / coins 200→0）',
      d.savedInv?.stone === 20 && d.savedCoins === 0,
      `实际=${JSON.stringify({ inv: d.savedInv, coins: d.savedCoins })}`);
    check('B3 存档含 restore.forestRoad=true', d.savedRestore?.forestRoad === true, `实际=${JSON.stringify(d.savedRestore)}`);

    // B4. 刷新重进 → 持久化（switchScene 不改存档，须先把 player.scene 指向 forest）
    await gotoSceneKeepSave('forest');
    d = await page.evaluate(SNAP_FOREST);
    check('B4 重进后道路仍恢复态（持久化）', d.frRestored === true, `实际=${d.frRestored}`);
    check('B4 重进后小路仍在', d.groundRoad === 7, `实际=${d.groundRoad}`);
    check('B4 重进后花丛仍在', d.wallFlower === 8, `实际=${d.wallFlower}`);

    const shot2 = join(SHOT_DIR, 'restore037-forestroad-restored.png');
    await page.screenshot({ path: shot2 });
    console.log(`  📸 ${shot2}`);

    // ========== C. garden 回归 + 全部恢复态共存 ==========
    console.log('\n── 回归：garden 流程不受影响 + 恢复态共存 ──');
    // 注入含 oldHouse/forestRoad 已恢复的存档（gotoScene 会卸载旧实例，避免自动保存覆盖写档）
    await gotoScene('farm', {
      world: { coins: 0 },
      farm: { tiles: [], crops: [], trees: [], restore: { oldHouse: true, forestRoad: true } },
      player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: { wood: 10, stone: 20 } },
    });
    d = await page.evaluate(SNAP_FARM);
    check('C garden stage 仍 0（三阶段流程未破坏）', d.gardenStage === 0, `实际=${d.gardenStage}`);
    check('C garden 破旧装饰 3 组仍在', d.gardenDebris === 3, `实际=${d.gardenDebris}`);
    check('C 老屋恢复态共存', d.ohRestored === true && d.ohDebris === 0,
      `实际=restored:${d.ohRestored}, debris:${d.ohDebris}`);

    const shot3 = join(SHOT_DIR, 'restore037-farm-all-restored.png');
    await page.screenshot({ path: shot3 });
    console.log(`  📸 ${shot3}`);

    // ========== D. 运行时错误 ==========
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    const real404 = notFound.filter(u => !u.endsWith('favicon.ico'));
    check('无运行时错误', realErrors.length === 0 && real404.length === 0,
      [...realErrors, ...real404.map(u => '404: ' + u.replace(GAME_URL, ''))].join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
