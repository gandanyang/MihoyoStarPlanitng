/**
 * F1 修复运行时验证探针：森林地图树瓦片（gid 9-12）正常渲染
 *
 * 验证：
 *   1. 种子存档 scene='forest' → Title → Station → 直达森林场景
 *   2. 运行时 tiles 纹理宽度 = 192（12 格 tileset 生效，不再是 8 格）
 *   3. 森林场景无运行时错误（pageerror / console.error）
 *   4. 截图存档供人工查看
 *
 * 前置：dev server；node probe-forest-visual.mjs
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
  console.log('=== F1 森林树瓦片运行时验证 ===\n');
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
    // 1. 种子存档：直达森林（结构完整，避免 apply() 崩溃）
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate(() => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'F1探针', timestamp: Date.now(),
        player: { x: 240, y: 200, scene: 'forest', facing: 'up', inventory: {} },
        world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
      }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);

    // 2. 标题 → 开始（Enter）
    await page.keyboard.press('Enter');
    await sleep(500);

    // 3. 等待进入森林场景（Station 检测到存档直接跳转）
    let scene = '';
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      scene = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (scene === 'forest') break;
    }
    check('进入森林场景', scene === 'forest', `当前=${scene}`);
    await sleep(800); // 等渲染稳定

    // 4. 运行时纹理宽度断言（12 格 tileset 生效）
    const texW = await page.evaluate(() => {
      const t = window.__game?.textures.get('tiles');
      return t && t.source[0] ? t.source[0].width : -1;
    });
    check('运行时 tiles 纹理 = 192px（12 格）', texW === 192, `实际=${texW}`);

    // 5. 截图
    const shot = join(SHOT_DIR, 'forest-f1-verification.png');
    await page.screenshot({ path: shot });
    console.log(`  📸 ${shot}`);

    // 6. 运行时错误检查
    // - console 的 "Failed to load resource 404" 无 URL 信息，由 response 监听兜底（real404）
    // - favicon.ico 为浏览器自动请求，非游戏资源，忽略
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    const real404 = notFound.filter(u => !u.endsWith('favicon.ico'));
    check('森林场景无运行时错误', realErrors.length === 0 && real404.length === 0,
      [...realErrors, ...real404.map(u => '404: ' + u.replace(GAME_URL, ''))].join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
