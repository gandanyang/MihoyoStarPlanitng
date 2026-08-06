/**
 * M1-3 爷爷旧花园恢复点运行时验证探针
 *
 * 验证：
 *   1. 初始（未恢复）：区域荒土瓦片 gid 2、debris 3 组、提示标记存在、gardenRestore.stage=0
 *   2. 交互：玩家靠近按 E ×3 → stage=3、荒土清除、花丛 gid 8 + 小路 gid 7、蝴蝶 2 只、
 *      存档 localStorage 含 restore.garden=true
 *   3. 持久化：刷新重进 → 仍为恢复态（花丛还在、无 debris）
 *   4. 花园区域可走：恢复后新花园（cols 28-32, rows 4-7）无碰撞瓦片，玩家不会被困
 *   5. 无运行时错误、不回归现有农场（农田 FARM_AREA 仍为 gid 5）
 *
 * 前置：dev server；node probe-farm-restore.mjs
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

/** 读取恢复点运行时状态（一次 evaluate 返回全部关键数据） */
const SNAP = `(() => {
  const s = window.__game.scene.getScene('farm');
  if (!s) return { sceneLoaded: false };
  const g = s.gardenRestore;
  const wl = s.wallsLayer;
  const gLD = wl.tilemap.getLayer('Ground');
  const wLD = wl.tilemap.getLayer('Walls');
  if (!gLD || !wLD) return { sceneLoaded: true, layersOk: false };
  const t = (ld, c, r) => ld.data[r][c].index;          // gid（空=-1）
  const col = (c, r) => wLD.data[r][c].collides;        // 是否碰撞
  const save = JSON.parse(localStorage.getItem('return_star_save') || 'null');
  return {
    sceneLoaded: true, layersOk: true,
    stage: g ? g.stage : -1,
    debrisCount: g ? g.debris.filter(x => x.active).length : -1,
    markExists: g ? !!g.mark && g.mark.active : false,
    butterflies: g ? g.butterflies.length : 0,
    // 花园新位置：农田右上方 cols 28-32, rows 4-7
    groundAt: { soil: t(gLD, 29, 5), path: t(gLD, 30, 7), grass: t(gLD, 29, 4) },
    wallAt: { flower1: t(wLD, 28, 4), flower2: t(wLD, 30, 4), flower3: t(wLD, 29, 5) },
    collides: { flowerCollides: col(30, 4), pathCollides: col(30, 7) },
    // 花园区域可走：恢复后 cols 28-32 rows 4-7 无碰撞（花丛/小路均不阻挡）
    gardenWalkable: (() => {
      for (let r = 4; r <= 7; r++)
        for (let c = 28; c <= 32; c++)
          if (wLD.data[r][c].collides) return false;
      return true;
    })(),
    savedRestore: save ? (save.farm.restore ?? null) : null,
    // 不回归：农田红线仍为 gid 5
    farmOk: (() => {
      for (let r = 8; r <= 16; r++)
        for (let c = 12; c <= 28; c++)
          if (t(gLD, c, r) !== 5) return false;
      return true;
    })(),
    // 玩家位置（探针移动用）
    player: { x: s.player.x, y: s.player.y },
  };
})()`;

async function run() {
  console.log('=== M1-3 爷爷旧花园恢复点运行时验证 ===\n');
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

  const gotoFarm = async () => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate(() => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'M1-3探针', timestamp: Date.now(),
        player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
        world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
      }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(500);
    let scene = '';
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      scene = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (scene === 'farm') break;
    }
    if (scene !== 'farm') throw new Error('未能进入农场场景');
    await sleep(1200);
  };

  try {
    // 1. 初始（未恢复）
    await gotoFarm();
    let d = await page.evaluate(SNAP);
    check('场景可访问', d.sceneLoaded && d.layersOk);
    check('初始 stage=0（未恢复）', d.stage === 0, `实际=${d.stage}`);
    check('初始 荒土瓦片 (29,5)=gid 2', d.groundAt.soil === 2, `实际=${d.groundAt.soil}`);
    check('初始 装饰 3 组活跃', d.debrisCount === 3, `实际=${d.debrisCount}`);
    check('初始 提示标记存在', d.markExists === true, `实际=${d.markExists}`);
    check('初始 无蝴蝶', d.butterflies === 0, `实际=${d.butterflies}`);
    check('初始 新花园区域无碰撞（可走）', d.gardenWalkable === true, `实际=${d.gardenWalkable}`);
    check('初始 存档无 restore 字段', d.savedRestore === null, `实际=${JSON.stringify(d.savedRestore)}`);

    // 2. 走到恢复点中心 → 按 E ×3（三阶段清理）
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const p = s.gardenRestore.pos;
      s.player.setPosition(p.x, p.y);
    });
    await sleep(300);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('E');
      await sleep(600);
    }
    await sleep(1600); // 等最终提示

    d = await page.evaluate(SNAP);
    check('交互后 stage=3（已恢复）', d.stage === 3, `实际=${d.stage}`);
    check('交互后 装饰全部销毁（0 活跃）', d.debrisCount === 0, `实际=${d.debrisCount}`);
    check('交互后 提示标记消失', d.markExists === false, `实际=${d.markExists}`);
    check('交互后 荒土清除 (29,4)=gid 1 草地', d.groundAt.grass === 1, `实际=${d.groundAt.grass}`);
    check('交互后 小路 (30,7)=gid 7', d.groundAt.path === 7, `实际=${d.groundAt.path}`);
    check('交互后 花丛 (28,4)/(30,4)/(29,5)=gid 8',
      d.wallAt.flower1 === 8 && d.wallAt.flower2 === 8 && d.wallAt.flower3 === 8,
      `实际=${JSON.stringify(d.wallAt)}`);
    check('交互后 蝴蝶 2 只', d.butterflies === 2, `实际=${d.butterflies}`);
    check('交互后 花不碰撞 / 小路不碰撞',
      d.collides.flowerCollides === false && d.collides.pathCollides === false,
      `实际=${JSON.stringify(d.collides)}`);
    check('交互后 新花园区域无碰撞（可走）', d.gardenWalkable === true, `实际=${d.gardenWalkable}`);
    check('交互后 存档含 restore.garden=true',
      d.savedRestore && d.savedRestore.garden === true, `实际=${JSON.stringify(d.savedRestore)}`);
    check('不回归：农田 FARM_AREA 仍全为 gid 5', d.farmOk === true, `实际=${d.farmOk}`);

    const shot1 = join(SHOT_DIR, 'farm-m1-3-restored.png');
    await page.screenshot({ path: shot1 });
    console.log(`  📸 ${shot1}`);

    // 3. 刷新重进：持久化
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(500);
    let scene = '';
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      scene = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (scene === 'farm') break;
    }
    await sleep(1200);
    d = await page.evaluate(SNAP);
    check('重进后 stage=3（恢复态持久）', d.stage === 3, `实际=${d.stage}`);
    check('重进后 花丛仍在 (28,4)=gid 8', d.wallAt.flower1 === 8, `实际=${d.wallAt.flower1}`);
    check('重进后 小路仍在 (30,7)=gid 7', d.groundAt.path === 7, `实际=${d.groundAt.path}`);
    check('重进后 新花园区域无碰撞（可走）', d.gardenWalkable === true, `实际=${d.gardenWalkable}`);
    check('重进后 无恢复前装饰', d.debrisCount === 0, `实际=${d.debrisCount}`);

    const shot2 = join(SHOT_DIR, 'farm-m1-3-persisted.png');
    await page.screenshot({ path: shot2 });
    console.log(`  📸 ${shot2}`);

    // 4. 运行时错误检查
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
