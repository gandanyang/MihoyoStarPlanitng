/**
 * house_tileset_v1 实机效果截图探针（house + elder_house 双场景）
 *
 * 种子存档直达两场景，等待渲染稳定后：
 *   1. 验证 tiles 纹理已加载 house v1（256px = 16 tile）
 *   2. 主角家截图（20×15 木地板屋）
 *   3. 村长家截图（12×10 庭院屋）
 *
 * 注意：每个场景使用独立 page 会话（新开页面 → 写入种子存档 → reload），
 *       避免游戏运行中的 auto-save 覆盖下一次写入的 localStorage。
 *
 * 用法：先起 dev server（npm run dev），再 node tests/probes/probe-house-v1-shot.mjs
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

async function shotScene(browser, sceneKey, playerPos, label) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    // 新页面：先导航建立同源，再写种子存档
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1000);
    await page.evaluate(([sc, px, py]) => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: `${sc}_v1shot`, timestamp: Date.now(),
        player: { x: px, y: py, scene: sc, facing: 'down', inventory: {} },
        world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
      }));
    }, [sceneKey, playerPos[0], playerPos[1]]);
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    const saved = await page.evaluate(() => {
      const raw = localStorage.getItem('return_star_save');
      try { const d = JSON.parse(raw); return d?.player?.scene ?? '(none)'; }
      catch { return '(parse-fail)'; }
    });
    console.log(`存档 scene = ${saved}`);
    await page.keyboard.press('Enter');
    await sleep(500);

    let scene = '';
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      scene = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (scene === sceneKey) break;
    }
    console.log(`场景 = ${scene}（期望 ${sceneKey}）`);

    // 场景内验证 tiles 纹理宽
    const info2 = await page.evaluate(() => {
      const g = window.__game;
      const tex = g.textures.get('tiles');
      const src = tex && tex.source[0] ? tex.source[0] : null;
      const activeKeys = g.scene.getScenes(true).map(s => s.scene?.key);
      return { tilesW: src ? src.width : -1, active: activeKeys };
    });
    console.log(`tiles 纹理宽 = ${info2.tilesW}（期望 256 = house v1）`, `活动场景: ${info2.active.join(',')}`);
    if (info2.tilesW === 256) console.log('✅ house v1 tileset 已加载');
    else console.log('❌ tiles 纹理异常');
    await sleep(2500);

    const shot = join(SHOT_DIR, `${label}.png`);
    await page.screenshot({ path: shot });
    console.log(`📸 ${shot}`);

    const realErrors = errors.filter(e => !e.includes('favicon'));
    if (realErrors.length) console.log('⚠️ 运行时错误:', realErrors.slice(0, 5));
    else console.log('✅ 无运行时错误');
  } finally {
    await page.close();
  }
}

async function run() {
  console.log('=== house_tileset_v1 实机截图 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 800, height: 600 },
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    // 主角家（house 20×15，木地板屋；出生在中心 160,120 使画面居中）
    await shotScene(browser, 'house', [160, 120], 'house-v1-主角家');
    // 村长家（elder_house 12×10，庭院屋；出生在中心 96,80 使画面居中）
    await shotScene(browser, 'elder_house', [96, 80], 'house-v1-村长家');
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
