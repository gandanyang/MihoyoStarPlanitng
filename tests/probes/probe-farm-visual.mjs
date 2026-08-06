/**
 * M1 农场升级运行时验证探针（M1-1 五区布局 + M1-2 动态氛围）
 *
 * 验证：
 *   1. 地图加载：种子存档 scene='farm' → 直达农场，tiles 纹理 = 128px（8 格 tileset，未扩展）
 *   2. 玩家出生点：存档位置 (240,96)（森林→农场出生点）生效
 *   3. 房屋入口：木屋门洞 (6,18)/(7,18) 无瓦片，木屋地板 (4,20)=gid 6
 *   4. 农田区域：FARM_AREA (12..28, 8..16) 全为 gid 5（红线不变）
 *   5. 碰撞：水塘 gid 4 / 石墙 gid 3 可碰撞；路径 gid 7 / 花 gid 8 不碰撞
 *   6. 出口：顶 gap (14..15,0)、右 gap (38..39, 9..10)、门洞均无瓦片
 *   7. 五区视觉抽查：森林入口 / 花园 / 农田过渡 / 住宅 / 水塘
 *   8. M1-2 动态氛围：花精灵 spritesheet tiles_fs 就绪 + 循环 tween ≥10（涟漪3+花6+光斑1）
 *
 * 前置：dev server；node probe-farm-visual.mjs
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

/** 读取农场运行时瓦片断言数据（一次 evaluate 返回全部关键数据） */
const FARM_CHECKS = `(() => {
  const s = window.__game.scene.getScene('farm');
  if (!s) return { sceneLoaded: false };
  const wl = s.wallsLayer;
  const tm = wl.tilemap;
  const gLD = tm.getLayer('Ground');
  const wLD = tm.getLayer('Walls');
  if (!gLD || !wLD) return { sceneLoaded: true, layersOk: false };
  const t = (ld, c, r) => ld.data[r][c].index;          // gid（空=-1）
  const col = (c, r) => wLD.data[r][c].collides;        // 是否碰撞
  const result = { sceneLoaded: true, layersOk: true, checks: {} };
  // 地图加载 + 纹理
  const tex = window.__game.textures.get('tiles');
  result.tilesW = tex && tex.source[0] ? tex.source[0].width : -1;
  // 玩家出生点
  result.player = { x: s.player.x, y: s.player.y };
  // 房屋入口
  result.houseDoor = [t(wLD, 6, 18), t(wLD, 7, 18)];
  result.houseFloor = t(wLD, 4, 20);
  // 农田区域（全扫 FARM_AREA）
  let farmOk = true;
  for (let r = 8; r <= 16 && farmOk; r++)
    for (let c = 12; c <= 28; c++)
      if (t(gLD, c, r) !== 5) { farmOk = false; break; }
  result.farmAreaOk = farmOk;
  result.farmSample = [t(gLD, 12, 8), t(gLD, 28, 16)];
  // 碰撞
  result.waterTile = t(wLD, 31, 19);
  result.waterCollides = col(31, 19);
  result.wallCollides = col(0, 1);
  result.pathTile = t(gLD, 14, 2);
  result.pathCollides = col(14, 2);
  result.flowerTile = t(wLD, 3, 3);
  result.flowerCollides = col(3, 3);
  // 出口 gap
  result.topGap = [t(wLD, 14, 0), t(wLD, 15, 0)];
  result.rightGap = [t(wLD, 38, 9), t(wLD, 39, 9), t(wLD, 38, 10), t(wLD, 39, 10)];
  result.doorGap = [t(wLD, 6, 18), t(wLD, 7, 18)];
  // 五区视觉抽查
  result.zones = {
    forestPath: t(gLD, 14, 1), forestDirt: t(gLD, 12, 1), forestFlower: t(wLD, 12, 2),
    gardenFlower: t(wLD, 7, 3),
    farmL: t(gLD, 11, 8), farmR: t(gLD, 29, 8),
    homePath: t(gLD, 6, 18), homeFlower: t(wLD, 10, 21),
    pondWater: t(wLD, 32, 20), pondBank: t(gLD, 30, 19), pondTop: t(wLD, 33, 18),
  };
  // M1-2 动态氛围：花精灵 spritesheet 就绪 + 循环 tween 已注册（涟漪 3 + 花摆动 6 + 光斑 1）
  result.ambience = {
    flowerSheet: window.__game.textures.exists('tiles_fs'),
    tweenCount: s.tweens.getTweens().length,
  };
  return result;
})()`;

async function run() {
  console.log('=== M1-1 农场五区升级运行时验证 ===\n');
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
    // 1. 种子存档：直达农场（森林→农场出生点 240,96）
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate(() => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'M1探针', timestamp: Date.now(),
        player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
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

    // 3. 等待进入农场场景
    let scene = '';
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      scene = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (scene === 'farm') break;
    }
    check('进入农场场景', scene === 'farm', `当前=${scene}`);
    await sleep(1200); // 等渲染稳定

    // 4. 运行时断言
    const d = await page.evaluate(FARM_CHECKS);
    if (!d.sceneLoaded) { check('运行时地图数据可访问', false, '场景未加载'); }
    else if (!d.layersOk) { check('运行时地图数据可访问', false, '图层缺失'); }
    else {
      check('tiles 纹理 = 128px（8 格 tileset 未扩展）', d.tilesW === 128, `实际=${d.tilesW}`);

      check('玩家出生点 (240,96)', Math.abs(d.player.x - 240) <= 2 && Math.abs(d.player.y - 96) <= 2,
        `实际=(${d.player.x.toFixed(0)},${d.player.y.toFixed(0)})`);

      check('房屋入口 门洞 (6,18)/(7,18) 无瓦片', d.houseDoor[0] === -1 && d.houseDoor[1] === -1,
        `实际=${d.houseDoor}`);
      check('房屋入口 木屋地板 (4,20)=gid 6', d.houseFloor === 6, `实际=${d.houseFloor}`);

      check('农田区域 FARM_AREA 全为 gid 5', d.farmAreaOk,
        `抽样=${d.farmSample.join(',')}`);

      check('碰撞：水塘 (31,19)=gid 4 且可碰撞', d.waterTile === 4 && d.waterCollides === true,
        `gid=${d.waterTile} collides=${d.waterCollides}`);
      check('碰撞：石墙 (0,1)=gid 3 可碰撞', d.wallCollides === true, `collides=${d.wallCollides}`);
      check('不碰撞：路径 (14,2)=gid 7', d.pathTile === 7 && d.pathCollides === false,
        `gid=${d.pathTile} collides=${d.pathCollides}`);
      check('不碰撞：花 (3,3)=gid 8', d.flowerTile === 8 && d.flowerCollides === false,
        `gid=${d.flowerTile} collides=${d.flowerCollides}`);

      check('出口：顶 gap (14,0)/(15,0) 无瓦片', d.topGap[0] === -1 && d.topGap[1] === -1,
        `实际=${d.topGap}`);
      check('出口：右 gap (38..39, 9..10) 无瓦片',
        d.rightGap.every(v => v === -1), `实际=${d.rightGap}`);
      check('出口：门洞 gap 无瓦片', d.doorGap[0] === -1 && d.doorGap[1] === -1, `实际=${d.doorGap}`);

      // 五区视觉
      const z = d.zones;
      check('五区-森林入口 路径(14,1)=7/落叶(12,1)=2/花(12,2)=8',
        z.forestPath === 7 && z.forestDirt === 2 && z.forestFlower === 8,
        `路径=${z.forestPath} 落叶=${z.forestDirt} 花=${z.forestFlower}`);
      check('五区-花园 花丛(7,3)=8', z.gardenFlower === 8, `实际=${z.gardenFlower}`);
      check('五区-农田过渡 左(11,8)=2/右(29,8)=2', z.farmL === 2 && z.farmR === 2,
        `左=${z.farmL} 右=${z.farmR}`);
      check('五区-住宅 门前路(6,18)=7/右侧花(10,21)=8',
        z.homePath === 7 && z.homeFlower === 8, `路=${z.homePath} 花=${z.homeFlower}`);
      check('五区-水塘 水(32,20)=4/岸(30,19)=2/塘上花(33,18)=8',
        z.pondWater === 4 && z.pondBank === 2 && z.pondTop === 8,
        `水=${z.pondWater} 岸=${z.pondBank} 花=${z.pondTop}`);
      // M1-2 动态氛围
      check('氛围：花精灵 spritesheet "tiles_fs" 已就绪', d.ambience.flowerSheet === true,
        `实际=${d.ambience.flowerSheet}`);
      check('氛围：循环 tween 已注册（涟漪3+花6+光斑1≥10）', d.ambience.tweenCount >= 10,
        `实际=${d.ambience.tweenCount}`);
    }

    // 5. 截图
    const shot = join(SHOT_DIR, 'farm-m1-verification.png');
    await page.screenshot({ path: shot });
    console.log(`  📸 ${shot}`);

    // 6. 运行时错误检查
    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    const real404 = notFound.filter(u => !u.endsWith('favicon.ico'));
    check('农场场景无运行时错误', realErrors.length === 0 && real404.length === 0,
      [...realErrors, ...real404.map(u => '404: ' + u.replace(GAME_URL, ''))].join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
