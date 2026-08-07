/**
 * 探针 — 相机居中测量（zoom=2 下 follow / pan 是否含 zoom 因子）
 *
 * 验证目标（Level 2）：
 *  1. 户外农场：startFollow 稳定后，玩家应显示在画布水平/垂直中心
 *     （2026-08-07 修复：startFollow 加 followOffset = width/2/zoom - width/2 补偿）
 *  2. cam.pan 补偿公式（MapScene.panCameraTo 同一公式）结束后，目标点应显示在画布中心（观星夜 #29）
 *
 * 前置：dev server（localhost:5175 或 GAME_URL 指定）
 * 运行：node tests/probes/probe-camera-center.mjs
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

const waitFor = async (fn, timeout = 25000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  return null;
};

const getSceneKey = page => page.evaluate(() => window.__game?.scene?.getScenes(true)[0]?.scene?.key ?? null);

async function writeSeed(page) {
  await page.evaluate(() => {
    localStorage.setItem('return_star_save', JSON.stringify({
      version: '0.5',
      savedAt: 'camera-center probe',
      timestamp: Date.now(),
      player: { x: 96, y: 160, scene: 'farm', facing: 'down', inventory: { radish: 5 } },
      world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started', dailyQuest: null },
      farm: { tiles: [], crops: [], trees: [] },
      story: { storyStep: 'done', ch1TownIntroDone: false },
    }));
  });
}

/** reload 后等待进入 farm：有存档直跳 farm；无存档（title）则按 Enter 进入 */
async function enterFarm(page) {
  await page.reload({ waitUntil: 'networkidle2' });
  const sc0 = await waitFor(() => getSceneKey(page));
  if (!sc0) throw new Error('页面未进入任何场景');
  if (sc0 !== 'farm') {
    // title → 按 Enter 开始
    if (sc0 === 'title') {
      await page.keyboard.press('Enter');
    } else {
      throw new Error(`意外场景：${sc0}（预期 title 或 farm）`);
    }
  }
  const entered = await waitFor(async () => (await getSceneKey(page)) === 'farm');
  if (!entered) throw new Error('未能进入 farm 场景');
  await sleep(500);
}

/** 测量玩家在画布逻辑像素中的屏幕位置（world→screen，含 zoom） */
async function measureFollow(page) {
  return page.evaluate(async () => {
    const s = window.__game.scene.getScene('farm');
    if (!s?.player || !s?.cameras?.main) return null;
    const cam = s.cameras.main;
    const p = s.player;
    // 帧率可能被限流（失焦窗口），lerp 0.1 收敛需数十帧。测量稳态前临时 lerp=1 让 scroll
    // 一帧到位，测完恢复。这验证的是 follow 稳态公式，不依赖帧率。
    const orig = { x: cam.lerp.x, y: cam.lerp.y };
    cam.lerp.set(1, 1);
    await new Promise(r => setTimeout(r, 120));
    const m = {
      player: { x: p.x, y: p.y },
      body: p.body ? { x: p.body.x, y: p.body.y, centerX: p.body.center.x, centerY: p.body.center.y } : null,
      followRef: cam._follow ? { x: cam._follow.x, y: cam._follow.y, key: cam._follow.texture?.key } : null,
      followOffset: { x: cam.followOffset.x, y: cam.followOffset.y },
      origin: { x: cam.originX, y: cam.originY },
      lerp: cam.lerp ? { x: cam.lerp.x, y: cam.lerp.y } : null,
      roundPixels: cam.roundPixels,
      scroll: { x: cam.scrollX, y: cam.scrollY },
      zoom: cam.zoom,
      camW: cam.width,
      camH: cam.height,
      // 玩家在画布中的位置（逻辑像素）
      px: (p.x - cam.scrollX) * cam.zoom,
      py: (p.y - cam.scrollY) * cam.zoom,
      centerX: cam.width / 2,
      centerY: cam.height / 2,
    };
    cam.lerp.set(orig.x, orig.y);
    return m;
  });
}

/** 观星夜修复验证（对应 MapScene.startStargaze）：临时 useBounds=false → 补偿公式 pan → 测量 */
async function measureStargazePan(page, tx, ty) {
  // 先把玩家传送到目标点：pan 结束后 follow 接管时目标≈玩家，scroll 不会回跳
  await page.evaluate((x, y) => {
    const s = window.__game.scene.getScene('farm');
    // setPosition 同步 physics body（直接赋 x/y 会被 body.preUpdate 拉回，导致 follow 目标漂移）
    s.player.setPosition(x, y);
  }, tx, ty);
  await sleep(2500);
  // 模拟 startStargaze：临时解除相机边界（#29），再按补偿公式 pan（与 MapScene.panCameraTo 一致）
  await page.evaluate((x, y) => {
    const s = window.__game.scene.getScene('farm');
    const cam = s.cameras.main;
    cam.useBounds = false;
    const px = x - cam.width / 2 / cam.zoom + cam.width / 2;
    const py = y - cam.height / 2 / cam.zoom + cam.height / 2;
    cam.pan(px, py, 500, 'Power2', false);
  }, tx, ty);
  await sleep(1500);
  return page.evaluate((x, y) => {
    const s = window.__game.scene.getScene('farm');
    const cam = s.cameras.main;
    return {
      target: { x, y },
      scroll: { x: cam.scrollX, y: cam.scrollY },
      zoom: cam.zoom,
      camW: cam.width,
      // 目标点在画布中的位置（逻辑像素）
      px: (x - cam.scrollX) * cam.zoom,
      py: (y - cam.scrollY) * cam.zoom,
      centerX: cam.width / 2,
      centerY: cam.height / 2,
      useBounds: cam.useBounds,
    };
  }, tx, ty);
}

async function run() {
  console.log('=== 探针：相机居中测量（follow / pan 与 zoom）===\n');
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
    await sleep(1500);
    await writeSeed(page);
    await enterFarm(page);
    const scene = await getSceneKey(page);
    check('进入农场场景', scene === 'farm', `scene=${scene}`);
    // 等 follow 稳定（lerp 0.1 收敛）
    await sleep(2000);

    const m = await measureFollow(page);
    console.log('  出生点玩家:', JSON.stringify(m));
    check('F1. 出生点玩家水平居中（误差 ≤ 2 逻辑像素）', m && Math.abs(m.px - m.centerX) <= 2,
      `px=${m?.px.toFixed(1)} centerX=${m?.centerX}`);
    // 注意：出生点 (96,160) 垂直方向 scroll 会被 clamp（farm 高 400 而视野 300，clamp 上限
    // scrollY=-50，相机中心最大 100），因此出生点垂直必然偏下——这是地图窄的固有边界行为，
    // 不属于 follow 补偿 bug。传送到 clamp 范围内的点 (200,50) 验证补偿公式本身：
    //   水平 scroll=200-200=0 ∈ [-200,40]；垂直 scroll=50-150=-100 ∈ [-150,-50]

    // 传送到 clamp 范围内的地图上部点，验证 follow 补偿水平+垂直都居中
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      // setPosition 同步 physics body（直接赋 x/y 会被 body.preUpdate 拉回，导致 follow 目标漂移）
      s.player.setPosition(200, 50);
    });
    await sleep(2500);
    const m1 = await measureFollow(page);
    await sleep(600);
    const m1b = await measureFollow(page);
    console.log('  地图上部玩家(1):', JSON.stringify(m1));
    console.log('  地图上部玩家(2):', JSON.stringify(m1b));
    check('F2. 上部玩家水平居中（误差 ≤ 2 逻辑像素）', m1 && Math.abs(m1.px - m1.centerX) <= 2,
      `px=${m1?.px.toFixed(1)} centerX=${m1?.centerX}`);
    check('F3. 上部玩家垂直居中（误差 ≤ 2 逻辑像素）', m1 && Math.abs(m1.py - m1.centerY) <= 2,
      `py=${m1?.py.toFixed(1)} centerY=${m1?.centerY}`);

    // 观星夜现场（#29）：玩家在观星点 (504,232)，地图右下缘，clamp 下 follow 无法居中 →
    // startStargaze 临时 useBounds=false 后 pan 应让观星点居中
    const p = await measureStargazePan(page, 504, 232);
    console.log('  观星点 pan 落点:', JSON.stringify(p));
    check('P1. 观星夜 pan 后目标点水平居中（误差 ≤ 2 逻辑像素）', p && Math.abs(p.px - p.centerX) <= 2,
      `px=${p?.px.toFixed(1)} centerX=${p?.centerX}`);
    check('P2. 观星夜 pan 后目标点垂直居中（误差 ≤ 2 逻辑像素）', p && Math.abs(p.py - p.centerY) <= 2,
      `py=${p?.py.toFixed(1)} centerY=${p?.centerY}`);

    // 观星夜收尾：恢复 useBounds 后 scroll 被 clamp 回边界内（对应 playStargazeAfter 恢复），
    // 不抛错、不 NaN，玩家仍在地图内。等 preRender 跑几帧后再测。
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      s.cameras.main.useBounds = true;
    });
    await sleep(800);
    const restored = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const cam = s.cameras.main;
      return { scrollX: cam.scrollX, scrollY: cam.scrollY, player: { x: s.player.x, y: s.player.y } };
    });
    console.log('  恢复 bounds 后:', JSON.stringify(restored));
    check('P3. 恢复 bounds 后 scroll 回到 clamp 边界内', restored && restored.scrollX <= 40 && restored.scrollY >= -150 && restored.scrollY <= 0,
      `scroll=(${restored?.scrollX},${restored?.scrollY})`);

    check('E1. 无页面 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
