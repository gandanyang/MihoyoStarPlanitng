/**
 * 移动端点击种田探针：验证触屏设备在农场点击可操作农田格 → 直接锄地
 *
 * 路径：标题 → 车站 → setStoryStep('done') 跳过教程 → 出口进农场 → 点击农田格 → 检查该格视觉变化
 *
 * 前置：dev server 在 localhost:5173；node probe-farm-tap.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sceneInfo(page) {
  return page.evaluate(() => ({
    scene: window.__game.scene.getScenes(true)[0]?.scene?.key ?? 'none',
    step: window.debug?.getStoryStep?.(),
  }));
}

async function teleport(page, sceneKey, x, y, facing = 'up') {
  await page.evaluate(([k, px, py, f]) => {
    const s = window.__game.scene.getScene(k);
    if (!s?.player) return;
    s.player.x = px;
    s.player.y = py;
    s.player.facing = f;
  }, [sceneKey, x, y, facing]);
  await sleep(200);
}

/** 读取某农田格视觉：plot 是否可见（锄地成功 → tilled 地块显示，frame 0） */
async function tileVisual(page, col, row) {
  return page.evaluate(([c, r]) => {
    const s = window.__game.scene.getScene('farm');
    const v = s?.tileRects?.get(`${c},${r}`);
    if (!v?.plot) return { exists: false };
    return { exists: true, visible: v.plot.visible, frame: v.plot.frame.name };
  }, [col, row]);
}

/** 世界坐标 → 屏幕坐标（用 cam.worldView 换算，worldView 才是真实视口边界） */
async function worldToScreen(page, wx, wy) {
  return page.evaluate(([x, y]) => {
    const s = window.__game.scene.getScene('farm');
    const cam = s.cameras.main;
    const vw = cam.worldView;
    const gx = (x - vw.x) * (800 / vw.width);
    const gy = (y - vw.y) * (600 / vw.height);
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    return {
      sx: rect.left + gx * (rect.width / 800),
      sy: rect.top + gy * (rect.height / 600),
      vw: { x: vw.x, y: vw.y, w: vw.width, h: vw.height },
    };
  }, [wx, wy]);
}

async function run() {
  console.log('=== 移动端点击种田探针（触屏点击农田格直接锄地）===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 375, height: 812, isMobile: true, hasTouch: true },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[DEBUG] handleFarmTap') || t.includes('[DEBUG] tryFarmInteractAt') || t.includes('[DEBUG] hoe applied') || t.includes('[DEBUG] handleFarmTap guards')) console.log('  🐛', t);
  });

  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);

    // 标题 → 车站 → 跳过开场 → 跳过教程（直接进入可自由种田状态）
    await page.keyboard.press('Enter');
    await sleep(2200);
    await page.evaluate(() => {
      const btn = document.getElementById('intro-skip-btn');
      if (btn) btn.click();
    });
    await sleep(800);
    await page.evaluate(() => window.debug.setStoryStep('done'));
    await sleep(300);
    let info = await sceneInfo(page);
    console.log(`1. 车站 + 跳过教程 → 场景=${info.scene}, 步骤=${info.step}`);

    // 车站出口 → 农场（教程 done 后出口直达 farm）
    await teleport(page, 'station', 970, 460, 'right');
    await sleep(3500);
    info = await sceneInfo(page);
    console.log(`2. 进入农场 → 场景=${info.scene}${info.scene === 'farm' ? ' ✅' : ' ❌'}`);
    if (info.scene !== 'farm') throw new Error('未进入农场场景');

    // 停止相机跟随，手动把视口定位到目标格 (15,10) 附近
    // （相机 zoom=2 视口只有 400×300 世界像素，startFollow 会每帧覆盖 scroll，必须 stopFollow）
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const cam = s.cameras.main;
      cam.stopFollow();
      // 目标格中心 (248,168) 居中 → 视口左边界 (48, 18)；farm 地图 640×400，均在合法范围
      cam.scrollX = 48 - 200;
      cam.scrollY = 18 - 150;
    });
    await sleep(300);

    // BUG-033 后竖屏触屏会显示全屏旋转提示层 #rotate-hint（pointer:coarse 命中 portrait 媒体查询），
    // 拦截触屏点击；本探针模拟竖屏触屏但验证的是 farm 点击逻辑，点击前先移除提示层
    await page.evaluate(() => document.getElementById('rotate-hint')?.remove());
    await sleep(100);

    // 选农田格 (15,10)：世界坐标 (248, 168)，点击前应为 empty（plot 隐藏）
    const col = 15, row = 10;
    const before = await tileVisual(page, col, row);
    console.log(`3. 点击前格子(${col},${row}) plot可见=${before.visible} ${before.visible ? '❌ 应为隐藏' : '✅'}`);

    const { sx, sy, vw } = await worldToScreen(page, col * 16 + 8, row * 16 + 8);
    console.log(`   视口=(${vw.x.toFixed(0)},${vw.y.toFixed(0)},${vw.w},${vw.h}) 目标格屏幕=(${sx.toFixed(0)},${sy.toFixed(0)})`);
    await page.touchscreen.tap(sx, sy);
    await sleep(600);

    const after = await tileVisual(page, col, row);
    const tilled = after.exists && after.visible && after.frame === 0;
    console.log(`4. 点击后格子(${col},${row}) plot可见=${after.visible} 帧=${after.frame} ${tilled ? '✅ 锄地成功' : '❌ 未锄地'}`);

    // 再点一次同一格：tilled → 无种子则无操作（避免报错），有种子则播种。只要不抛错即可
    await page.touchscreen.tap(sx, sy);
    await sleep(400);
    const after2 = await tileVisual(page, col, row);
    console.log(`5. 连点不崩溃 → plot可见=${after2.visible} 帧=${after2.frame} ✅`);

    if (!tilled) throw new Error('点击种田未生效');
    console.log('\n🎉 点击种田探针通过');
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
