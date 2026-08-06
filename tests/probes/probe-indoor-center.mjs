/**
 * 探针 — 手机端室内地图居中（f1：室内地图未居中）
 *
 * 验证目标（Level 2）：
 *  1. 进入 house（室内）→ centerSmallMap=true（关闭 bounds+跟随，改每帧居中）
 *  2. 相机视口中心世界坐标 ≈ 玩家坐标（centerOn 每帧生效，非贴左上角）
 *  3. 玩家移动后相机中心跟随玩家（持续保持居中）
 *  4. 大场景（farm）不受影响 → centerSmallMap=false，正常 bounds+跟随
 *  5. 无 JS 错误
 *
 * 前置：Vite dev server localhost:5175
 * 运行：$env:GAME_URL='http://localhost:5175/'; node tests/probes/probe-indoor-center.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5175/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' - ' + extra : ''}`);
  ok ? pass++ : fail++;
}

async function run() {
  console.log('=== 探针：手机端室内地图居中（f1）===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2000);

    // 切到 farm 再进 house（走真实场景切换链路）
    await page.evaluate(() => {
      const g = window.__game;
      const active = g.scene.getScenes(true)[0];
      if (active) g.scene.stop(active.scene.key);
      g.scene.start('farm');
    });
    await sleep(2500);
    await page.evaluate(() => {
      window.__game.scene.start('house', { spawn: { x: 40, y: 72 } });
    });
    await sleep(2000);

    // 读取相机/玩家状态：相机中心世界坐标 = scroll + (displayWidth/2)/zoom
    const readCam = () => page.evaluate(() => {
      const s = window.__game.scene.getScene('house');
      if (!s?.player) return null;
      const cam = s.cameras.main;
      const cx = cam.scrollX + (cam.width / 2) / cam.zoom;
      const cy = cam.scrollY + (cam.height / 2) / cam.zoom;
      return {
        centerSmallMap: s.centerSmallMap === true,
        zoom: cam.zoom,
        scrollX: cam.scrollX,
        scrollY: cam.scrollY,
        camCenterX: cx,
        camCenterY: cy,
        playerX: s.player.x,
        playerY: s.player.y,
      };
    });

    const st = await readCam();
    check('1. house 室内 centerSmallMap 已开启', st?.centerSmallMap === true, `centerSmallMap=${st?.centerSmallMap}`);
    check('2. zoom2 生效', st?.zoom === 2, `zoom=${st?.zoom}`);
    const dx = Math.abs((st?.camCenterX ?? 0) - (st?.playerX ?? 0));
    const dy = Math.abs((st?.camCenterY ?? 0) - (st?.playerY ?? 0));
    check('3. 相机中心 = 玩家位置（每帧居中，不贴角）', dx <= 2 && dy <= 2,
      `camCenter=(${st?.camCenterX.toFixed?.(1)},${st?.camCenterY.toFixed?.(1)}) player=(${st?.playerX},${st?.playerY}) d=(${dx.toFixed(1)},${dy.toFixed(1)})`);
    check('3b. 相机 scroll 为负值（地图小于视口时的正常居中偏移）', (st?.scrollX ?? 0) < 0 && (st?.scrollY ?? 0) < 0,
      `scroll=(${st?.scrollX},${st?.scrollY})`);

    // 4. 玩家移动后相机中心跟随（每帧 centerOn）
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('house');
      if (s?.player) { s.player.x += 30; s.player.y += 20; }
    });
    await sleep(500);
    const st2 = await readCam();
    const dx2 = Math.abs((st2?.camCenterX ?? 0) - (st2?.playerX ?? 0));
    const dy2 = Math.abs((st2?.camCenterY ?? 0) - (st2?.playerY ?? 0));
    check('4. 玩家移动后相机仍居中', dx2 <= 2 && dy2 <= 2,
      `camCenter=(${st2?.camCenterX.toFixed?.(1)},${st2?.camCenterY.toFixed?.(1)}) player=(${st2?.playerX},${st2?.playerY}) d=(${dx2.toFixed(1)},${dy2.toFixed(1)})`);

    // ---------- 5. farm 大场景不受影响 ----------
    await page.evaluate(() => {
      window.__game.scene.start('farm');
    });
    await sleep(2000);
    const farm = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (!s) return null;
      return { centerSmallMap: s.centerSmallMap === true, scrollX: s.cameras.main.scrollX, scrollY: s.cameras.main.scrollY };
    });
    check('5. farm 大场景正常（centerSmallMap=false）', farm?.centerSmallMap === false, `centerSmallMap=${farm?.centerSmallMap}`);

    // 6. 无 JS 错误
    check('6. 无页面 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
