/**
 * farm_tileset_v3 实机效果截图探针
 *
 * 种子存档直达 farm 场景，等待渲染稳定后：
 *   1. 全屏截图（1024×768 视口，横屏，项目约定）
 *   2. 验证 tiles 纹理已加载 v3（128px）
 *   3. 采样地面主色（确认调色板锁定生效：#609848 草地系）
 *
 * 用法：先起 dev server（npm run dev），再 node tests/probes/probe-farm-v3-shot.mjs
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
  console.log('=== farm_tileset_v3 实机截图 ===\n');
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
    // 种子存档：直达 farm（出生点 240,96 = 森林→农场入口）
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate(() => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'v3shot', timestamp: Date.now(),
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
    console.log(`场景 = ${scene}`);
    await sleep(2500); // 等渲染/纹理稳定

    // 验证 v3 纹理
    const info = await page.evaluate(() => {
      const g = window.__game;
      const tex = g.textures.get('tiles');
      const src = tex && tex.source[0] ? tex.source[0] : null;
      // 采样画面中央地面像素（应为草地色系）；canvas 取不到则跳过
      const canvas = document.querySelector('canvas');
      let sample = 'n/a';
      if (canvas && canvas.getContext) {
        try {
          const ctx = canvas.getContext('2d');
          const d = ctx.getImageData(400, 300, 1, 1).data;
          sample = `rgba(${d[0]},${d[1]},${d[2]})`;
        } catch (e) { sample = 'read-failed'; }
      }
      return { tilesW: src ? src.width : -1, scene: g.scene.getScenes(true)[0]?.scene?.key, sample };
    });
    console.log(`tiles 纹理宽 = ${info.tilesW}（期望 128 = v3）`);
    console.log(`画面中央采样 = ${info.sample}`);
    if (info.tilesW === 128) console.log('✅ v3 tileset 已加载');
    else console.log('❌ tiles 纹理异常');

    // 全屏截图（横屏 1024×768）
    const shot = join(SHOT_DIR, 'farm-v3-full.png');
    await page.screenshot({ path: shot });
    console.log(`📸 ${shot}`);

    // 移动相机到几个关键区域（如果相机可移动）
    // farm 地图 640×400 < 视口 1024×768，全屏已含全部区域，此处仅补农田近景
    const zones = [
      ['农田区', 320, 192],   // (20,12) tile → 320,192 px
      ['水塘', 512, 320],     // (32,20)
    ];
    for (const [name, x, y] of zones) {
      try {
        await page.evaluate(([px, py]) => {
          const s = window.__game.scene.getScene('farm');
          if (s && s.player) { s.player.setPosition(px, py); s.cameras.main.centerOn(px, py); }
        }, [x, y]);
        await sleep(600);
        const zshot = join(SHOT_DIR, `farm-v3-${name}.png`);
        await page.screenshot({ path: zshot });
        console.log(`📸 ${zshot}`);
      } catch (e) {
        console.log(`⚠️ 区域 ${name} 截图失败: ${e.message}`);
      }
    }

    // 回到出生点
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (s && s.player) { s.player.setPosition(240, 96); s.cameras.main.centerOn(240, 96); }
    });
    await sleep(400);

    // 雨天验证（WeatherSystem: day===2 且 hour 10-16 才下雨）
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('return_star_save'));
      save.world.day = 2;
      save.world.hour = 12;
      localStorage.setItem('return_star_save', JSON.stringify(save));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(500);
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      scene = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (scene === 'farm') break;
    }
    await sleep(2500);
    // 诊断：天气读取 + 手动触发 startRain 验证遮罩尺寸修复
    const diag = await page.evaluate(() => {
      const g = window.__game;
      const s = g.scene.getScene('farm');
      let time = null;
      try { time = g.sys ? null : null; } catch (e) {}
      // 尝试读取时间（多种路径）
      const t = s && s.timeInfo ? s.timeInfo : null;
      return {
        hasStartRain: !!(s && typeof s.startRain === 'function'),
        rainActive: s ? s.rainActive : null,
      };
    });
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (s && typeof s.startRain === 'function' && !s.rainActive) s.startRain();
    });
    await sleep(800);
    const rainy = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return { overlay: !!s.rainOverlay,
               overlayW: s.rainOverlay ? s.rainOverlay.width : -1,
               overlayH: s.rainOverlay ? s.rainOverlay.height : -1,
               camW: s.cameras.main.width, camH: s.cameras.main.height,
               mapW: s.rainOverlay ? s.map?.widthInPixels : -1 };
    });
    console.log(`雨天: hasStartRain=${diag.hasStartRain} rainActive=${diag.rainActive} overlay=${rainy.overlay} 遮罩=${rainy.overlayW}x${rainy.overlayH} 相机=${rainy.camW}x${rainy.camH} ${rainy.overlay && rainy.overlayW >= rainy.camW ? '✅ 已覆盖全屏' : '❌ 仍小于视口'}`);
    const rshot = join(SHOT_DIR, 'farm-v3-rain.png');
    await page.screenshot({ path: rshot });
    console.log(`📸 ${rshot}`);

    const realErrors = errors.filter(e => !e.includes('favicon'));
    if (realErrors.length) console.log('⚠️ 运行时错误:', realErrors.slice(0, 5));
    else console.log('✅ 无运行时错误');
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
