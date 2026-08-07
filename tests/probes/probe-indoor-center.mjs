/**
 * 探针 — 手机端室内地图居中（f1：室内地图未居中）
 *
 * 验证目标（Level 2）：
 *  1. 进入 house（室内）→ centerSmallMap=true（关闭 bounds+跟随，相机固定地图中心）
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

    // 读取相机/玩家状态：相机中心世界坐标 = scroll + width/2（Phaser preRender midPoint 公式，
    // width 为逻辑宽不除 zoom；旧公式多除 zoom 导致断言与实际渲染不符，2026-08-07 修正）
    const readCam = () => page.evaluate(() => {
      const s = window.__game.scene.getScene('house');
      if (!s?.player) return null;
      const cam = s.cameras.main;
      const cx = cam.scrollX + cam.width / 2;
      const cy = cam.scrollY + cam.height / 2;
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
    // 相机固定在地图中心（house 320×240 → 中心 160,120）；玩家在地图内活动不会出视野，
    // 跟随反而会让画面随玩家滚动（WASD 变成"移动镜头"，2026-08-07 修复）。
    const centerOK = Math.abs((st?.camCenterX ?? 0) - 160) <= 2 && Math.abs((st?.camCenterY ?? 0) - 120) <= 2;
    check('3. 相机中心 = 地图中心（固定居中，不贴角）', centerOK,
      `camCenter=(${st?.camCenterX.toFixed?.(1)},${st?.camCenterY.toFixed?.(1)}) 期望地图中心(160,120)`);
    check('3b. 相机 scroll 为负值（地图小于视口时的正常居中偏移）', (st?.scrollX ?? 0) < 0 && (st?.scrollY ?? 0) < 0,
      `scroll=(${st?.scrollX},${st?.scrollY})`);

    // 4. 玩家移动后相机中心仍固定在地图中心（不跟随）
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('house');
      if (s?.player) { s.player.x += 30; s.player.y += 20; }
    });
    await sleep(500);
    const st2 = await readCam();
    const center2OK = Math.abs((st2?.camCenterX ?? 0) - 160) <= 2 && Math.abs((st2?.camCenterY ?? 0) - 120) <= 2;
    check('4. 玩家移动后相机仍固定地图中心', center2OK,
      `camCenter=(${st2?.camCenterX.toFixed?.(1)},${st2?.camCenterY.toFixed?.(1)}) player=(${st2?.playerX},${st2?.playerY})`);

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
