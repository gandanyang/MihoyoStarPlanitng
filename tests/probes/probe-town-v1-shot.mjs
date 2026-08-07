/**
 * town_tileset_v1 实机效果截图探针
 *
 * 种子存档直达 town 场景，等待渲染稳定后：
 *   1. 全屏截图（1024×768 视口，横屏）
 *   2. 验证 tiles 纹理已加载 town_v1（256px = 16 tile）
 *   3. 多视角截图
 *
 * 用法：先起 dev server（npm run dev），再 node tests/probes/probe-town-v1-shot.mjs
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

async function run() {
  console.log('=== town_tileset_v1 实机截图 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  try {
    // 种子存档：直达 town 场景
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate(() => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'town_v1shot', timestamp: Date.now(),
        player: { x: 240, y: 160, scene: 'town', facing: 'down', inventory: {} },
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
      if (scene === 'town') break;
    }
    console.log(`场景 = ${scene}`);
    await sleep(2500);

    // 验证 town_v1 纹理
    const info = await page.evaluate(() => {
      const g = window.__game;
      const tex = g.textures.get('tiles');
      const src = tex && tex.source[0] ? tex.source[0] : null;
      let sample = 'n/a';
      const canvas = document.querySelector('canvas');
      if (canvas && canvas.getContext) {
        try {
          const ctx = canvas.getContext('2d');
          const d = ctx.getImageData(400, 300, 1, 1).data;
          sample = `rgba(${d[0]},${d[1]},${d[2]})`;
        } catch (e) { sample = 'read-failed'; }
      }
      return { tilesW: src ? src.width : -1, scene: g.scene.getScenes(true)[0]?.scene?.key, sample };
    });
    console.log(`tiles 纹理宽 = ${info.tilesW}（期望 256 = town v1）`);
    console.log(`画面中央采样 = ${info.sample}`);
    if (info.tilesW === 256) console.log('✅ town v1 tileset 已加载');
    else console.log('❌ tiles 纹理异常');

    const shot = join(SHOT_DIR, 'town-v1-full.png');
    await page.screenshot({ path: shot });
    console.log(`📸 ${shot}`);

    // 多视角截图
    const zones = [
      ['商店前', 240, 200],
      ['广场', 240, 160],
      ['村口', 100, 100],
    ];
    for (const [name, x, y] of zones) {
      try {
        await page.evaluate(([px, py]) => {
          const s = window.__game.scene.getScene('town');
          if (s && s.player) { s.player.setPosition(px, py); s.cameras.main.centerOn(px, py); }
        }, [x, y]);
        await sleep(600);
        const zshot = join(SHOT_DIR, `town-v1-${name}.png`);
        await page.screenshot({ path: zshot });
        console.log(`📸 ${zshot}`);
      } catch (e) {
        console.log(`⚠️ 区域 ${name} 截图失败: ${e.message}`);
      }
    }

    const realErrors = errors.filter(e => !e.includes('favicon'));
    if (realErrors.length) console.log('⚠️ 运行时错误:', realErrors.slice(0, 5));
    else console.log('✅ 无运行时错误');
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });