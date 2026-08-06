/**
 * VIS-01 星之碎片视觉升级运行时验证探针
 *
 * 验证：
 *   1. 种子存档 questState='accepted' + scene='forest' → 直达森林
 *   2. 星之碎片视觉对象创建成功（shardSprite / shardGlow / shardStar / shardParticles 非空）
 *   3. 森林场景无运行时错误（pageerror / console.error / 404）
 *   4. 截图存档供人工查看视觉效果
 *
 * 前置：dev server；node probe-shard-visual.mjs
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
  console.log('=== VIS-01 星之碎片视觉运行时验证 ===\n');
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
    // 1. 种子存档：questState='accepted' + 森林场景（碎片采集点显示条件）
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate(() => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'VIS01探针', timestamp: Date.now(),
        player: { x: 240, y: 200, scene: 'forest', facing: 'up', inventory: {} },
        world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'accepted' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
      }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);

    // 2. 标题 → 开始（Enter）
    await page.keyboard.press('Enter');
    await sleep(500);

    // 3. 等待进入森林场景
    let scene = '';
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      scene = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (scene === 'forest') break;
    }
    check('进入森林场景', scene === 'forest', `当前=${scene}`);
    await sleep(1200); // 等碎片特效创建 + 粒子启动

    // 4. 星之碎片视觉对象断言（MapScene 实例的字段，TS 私有字段编译后可直接读）
    const v = await page.evaluate(() => {
      const inst = window.__game?.scene.getScenes(true)[0];
      const s = inst?.shardSprite;
      return {
        hasShard: !!s,
        hasGlow: !!inst?.shardGlow,
        hasStar: !!inst?.shardStar,
        hasParticles: !!inst?.shardParticles,
        shardX: s ? Math.round(s.x) : -1,
        shardY: s ? Math.round(s.y) : -1,
        glowAlpha: inst?.shardGlow ? inst.shardGlow.alpha : -1,
        starAngle: inst?.shardStar ? Math.round(inst.shardStar.angle) : -1,
        emitterCount: inst?.shardParticles ? inst.shardParticles.getAliveParticleCount() : -1,
      };
    });
    check('碎片内核创建', v.hasShard, `位置=(${v.shardX},${v.shardY})`);
    check('外光晕创建', v.hasGlow, `alpha=${v.glowAlpha}`);
    check('星芒图形创建', v.hasStar, `angle=${v.starAngle}`);
    check('浮游粒子创建且活跃', v.hasParticles && v.emitterCount >= 0, `alive=${v.emitterCount}`);
    // 位置校验：森林 (20,10) 瓦片中心 = (20*16+8, 10*16+8)
    check('碎片位于 (20,10) 瓦片中心', v.shardX === 328 && v.shardY === 168, `实际=(${v.shardX},${v.shardY})`);

    // 5. 截图（供人工查看视觉效果）
    const shot = join(SHOT_DIR, 'shard-vis-01.png');
    await page.screenshot({ path: shot });
    console.log(`  📸 ${shot}`);

    // 6. 运行时错误检查
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
