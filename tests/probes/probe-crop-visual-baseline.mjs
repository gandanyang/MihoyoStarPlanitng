/**
 * 农田作物视觉基线探针（Batch D-01 视觉回归 · 升级前基线）
 *
 * 用途：记录农田五态地块 + 四作物（萝卜/番茄/玉米/草莓）当前视觉基线。
 *  - 升级前跑一次 → 存图作为基线；Batch D-01 作物精灵升级落地后重跑 → 截图对比（A/B）。
 *  - 断言基于现状语义：
 *      tilled  → plot frame 0，crop 隐藏
 *      planted → plot frame 1，crop 可见 frame cropIdx*3+0（发芽）
 *      watered → plot frame 2，crop 可见 frame cropIdx*3+1（生长）
 *      grown   → plot frame 4，crop 隐藏（"成熟态统一"基线：成熟态由地块贴图表达，无作物差异）
 *  - ⚠️ 若 Batch D 升级后 grown 改为显示对应作物精灵，本探针的 grown 断言会变红：
 *     那是"回归抓变化"的预期行为，此时需按新设计更新断言后再作为新基线。
 *
 * 方式：注入种子存档（13 格 tiles + 12 格 crops）→ 直达农场 → 读运行时 tileRects 断言 + 截图。
 * 前置：dev server 在 localhost:5173；node probe-crop-visual-baseline.mjs
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

// 布局（row 8 一排，FARM_AREA cols 12-28 合法）：
//   col 12 tilled ｜ 13-16 planted 四作物 ｜ 17-20 watered 四作物 ｜ 21-24 grown 四作物
const PLOTS = {
  tilled: { col: 12, state: 'tilled', crop: null },
  planted: [
    { col: 13, cropType: 'radish' }, { col: 14, cropType: 'tomato' },
    { col: 15, cropType: 'corn' }, { col: 16, cropType: 'strawberry' },
  ],
  watered: [
    { col: 17, cropType: 'radish' }, { col: 18, cropType: 'tomato' },
    { col: 19, cropType: 'corn' }, { col: 20, cropType: 'strawberry' },
  ],
  grown: [
    { col: 21, cropType: 'radish' }, { col: 22, cropType: 'tomato' },
    { col: 23, cropType: 'corn' }, { col: 24, cropType: 'strawberry' },
  ],
};
const CROP_IDX = { radish: 0, tomato: 1, corn: 2, strawberry: 3 };
const ROW = 8;

/** 读取农田格运行时视觉数据 */
const SNAP = `(() => {
  const s = window.__game.scene.getScene('farm');
  if (!s) return { sceneLoaded: false };
  const out = { sceneLoaded: true, tiles: {} };
  for (let c = 12; c <= 24; c++) {
    const v = s.tileRects.get(c + ',' + ${ROW});
    if (!v) { out.tiles[c] = null; continue; }
    out.tiles[c] = {
      plotVisible: v.plot.visible,
      plotFrame: v.plot.frame.name,
      cropVisible: v.crop.visible,
      cropFrame: v.crop.frame.name,
    };
  }
  return out;
})()`;

/** 只截游戏 canvas 区域（避开 DOM HUD 干扰） */
async function clipCanvasShot(page, name) {
  const clip = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  const path = join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path, clip });
  console.log(`  📸 ${name}.png`);
}

/** 相机放大到目标格区域（看清 16×16 像素格） */
async function zoomTo(page, zoom, wx, wy) {
  await page.evaluate(([z, x, y]) => {
    const s = window.__game.scene.getScene('farm');
    const cam = s.cameras.main;
    cam.stopFollow();
    cam.setZoom(z);
    cam.centerOn(x, y);
  }, [zoom, wx, wy]);
  await sleep(400);
}

async function run() {
  console.log('=== 农田作物视觉基线（Batch D-01 升级前）===\n');
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

  try {
    // 1. 种子存档：直达农场 + 预设五态/四作物
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    const tiles = [];
    const crops = [];
    const put = (col, state, cropType) => {
      tiles.push([`${col},${ROW}`, state]);
      if (cropType) crops.push([`${col},${ROW}`, { cropType, plantDay: 1, watered: state === 'watered' || state === 'grown' }]);
    };
    put(PLOTS.tilled.col, 'tilled', null);
    for (const p of PLOTS.planted) put(p.col, 'planted', p.cropType);
    for (const p of PLOTS.watered) put(p.col, 'watered', p.cropType);
    for (const p of PLOTS.grown) put(p.col, 'grown', p.cropType);

    await page.evaluate(([tileArr, cropArr]) => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'crop-visual-baseline', timestamp: Date.now(),
        player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
        world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: tileArr, crops: cropArr, trees: [] },
        story: { storyStep: 'done' },
      }));
    }, [tiles, crops]);
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
    check('进入农场场景', scene === 'farm', `当前=${scene}`);
    if (scene !== 'farm') throw new Error('未进入农场场景');
    await sleep(1200);

    // 2. 运行时视觉断言
    const d = await page.evaluate(SNAP);
    check('tileRects 可访问（13 格）', d.sceneLoaded && Object.keys(d.tiles).length === 13, `实际=${Object.keys(d.tiles).length}`);

    // tilled：plot frame 0 + crop 隐藏
    const td = d.tiles[PLOTS.tilled.col];
    check('tilled 地块帧=0', td?.plotFrame === 0, `实际=${td?.plotFrame}`);
    check('tilled 无作物精灵', td?.cropVisible === false, `实际=${td?.cropVisible}`);

    // planted：plot frame 1 + crop 可见 frame cropIdx*3+0
    for (const p of PLOTS.planted) {
      const v = d.tiles[p.col];
      const expectFrame = CROP_IDX[p.cropType] * 3 + 0;
      check(`planted ${p.cropType} 地块帧=1`, v?.plotFrame === 1, `实际=${v?.plotFrame}`);
      check(`planted ${p.cropType} 作物精灵帧=${expectFrame}（发芽）`, v?.cropVisible && v?.cropFrame === expectFrame,
        `可见=${v?.cropVisible} 帧=${v?.cropFrame}`);
    }

    // watered：plot frame 2 + crop 可见 frame cropIdx*3+1
    for (const p of PLOTS.watered) {
      const v = d.tiles[p.col];
      const expectFrame = CROP_IDX[p.cropType] * 3 + 1;
      check(`watered ${p.cropType} 地块帧=2`, v?.plotFrame === 2, `实际=${v?.plotFrame}`);
      check(`watered ${p.cropType} 作物精灵帧=${expectFrame}（生长）`, v?.cropVisible && v?.cropFrame === expectFrame,
        `可见=${v?.cropVisible} 帧=${v?.cropFrame}`);
    }

    // grown：plot frame 4 + crop 隐藏（"成熟态统一"基线）
    for (const p of PLOTS.grown) {
      const v = d.tiles[p.col];
      check(`grown ${p.cropType} 地块帧=4`, v?.plotFrame === 4, `实际=${v?.plotFrame}`);
      check(`grown ${p.cropType} 作物精灵隐藏（基线：成熟态无作物差异）`, v?.cropVisible === false,
        `可见=${v?.cropVisible}`);
    }

    // 3. 截图基线
    await zoomTo(page, 2, 18 * 16 + 8, 12 * 16 + 8); // 农田区域概览（放大 2 倍）
    await clipCanvasShot(page, 'crop-baseline-overview');
    await zoomTo(page, 4, 22.5 * 16, 8.5 * 16);     // 成熟态四作物对比（放大 4 倍，看清 16×16 格）
    await clipCanvasShot(page, 'crop-baseline-grown-4x');
    await zoomTo(page, 4, 14.5 * 16, 8.5 * 16);     // 发芽态四作物对比
    await clipCanvasShot(page, 'crop-baseline-planted-4x');

    // 4. 运行时错误
    const realErrors = errors.filter(e => !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    const real404 = notFound.filter(u => !u.endsWith('favicon.ico'));
    check('无运行时错误 / 无资源 404', realErrors.length === 0 && real404.length === 0,
      [...realErrors, ...real404.map(u => '404: ' + u.replace(GAME_URL, ''))].join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
