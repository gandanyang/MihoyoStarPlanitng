/**
 * 探针 — 标题页文字/图标居中（反馈第 25 行）
 *
 * 验证目标（Level 1）：
 *  1. 标题 Logo、游戏名、开始提示、背景图在逻辑画布内水平居中（x/W ≈ 0.5）
 *  2. 元素在屏幕上的实际位置与屏幕中心偏差 < 2px（canvas FIT 缩放换算后）
 *  3. 元素不超出画布左右边界
 *  4. 覆盖多分辨率：桌面 16:9、安卓横屏、安卓竖屏
 *
 * 前置：dev server（localhost:5177 或 GAME_URL 指定）
 * 运行：node tests/probes/probe-title-center.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5177/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' - ' + extra : ''}`);
  ok ? pass++ : fail++;
}

const waitFor = async (page, fn, timeout = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  return null;
};

async function measureTitle(page) {
  return page.evaluate(() => {
    const g = window.__game;
    if (!g) return null;
    const scene = g.scene.getScene('title');
    if (!scene) return null;
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const W = scene.scale.width, H = scene.scale.height;
    const kids = scene.children.getChildren();
    const findText = t => kids.find(o => o.type === 'Text' && o.text === t);
    const el = {
      bg: kids.find(o => o.texture?.key === 'title_bg'),
      logo: kids.find(o => o.texture?.key === 'logo_mark'),
      title: findText('归星物语'),
      prompt: findText('按 Enter 或点击 开始游戏') ?? findText('点按屏幕 开始游戏'),
      version: kids.find(o => o.type === 'Text' && o.text && o.text.startsWith('v')),
      copyright: findText('© 2026 归星物语'),
    };
    const out = { W, H, canvas: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, items: {} };
    for (const [k, o] of Object.entries(el)) {
      if (!o) { out.items[k] = null; continue; }
      const halfW = (o.displayWidth ?? o.width ?? 0) / 2;
      const halfH = (o.displayHeight ?? o.height ?? 0) / 2;
      out.items[k] = {
        x: o.x, y: o.y,
        ratioX: o.x / W, ratioY: o.y / H,
        screenCenterX: rect.left + (o.x / W) * rect.width,
        screenCenterY: rect.top + (o.y / H) * rect.height,
        halfW, halfH,
        outLeft: o.x - halfW < 0, outRight: o.x + halfW > W,
      };
    }
    return out;
  });
}

async function runViewport(browser, vp, name) {
  console.log(`\n===== ${name} (${vp.width}×${vp.height}) =====`);
  const page = await browser.newPage();
  await page.setViewport(vp);
  await page.goto(`${GAME_URL}?reset=1`, { waitUntil: 'networkidle2' });
  await sleep(2000);
  const okScene = await waitFor(page, () => page.evaluate(() => {
    const g = window.__game;
    return g && g.scene.getScenes(true).some(s => s.scene.key === 'title');
  }));
  if (!okScene) {
    check('title 场景加载', false);
    await page.close();
    return;
  }
  check('title 场景加载', true);

  // 等待入场动画淡入完成（alpha 不影响坐标，但保险起见等 2.5s）
  await sleep(2500);
  const m = await measureTitle(page);
  if (!m) { check('测量数据获取', false); await page.close(); return; }
  check('测量数据获取', true);

  const screenCenterX = m.canvas.left + m.canvas.width / 2;
  console.log(`  画布 rect: left=${m.canvas.left.toFixed(1)} top=${m.canvas.top.toFixed(1)} w=${m.canvas.width.toFixed(1)} h=${m.canvas.height.toFixed(1)}`);
  console.log(`  屏幕中心X=${screenCenterX.toFixed(1)} 逻辑 W=${m.W} H=${m.H}`);

  for (const k of ['bg', 'logo', 'title', 'prompt', 'copyright']) {
    const it = m.items[k];
    if (!it) { console.log(`  ${k}: 未找到`); continue; }
    const dev = Math.abs(it.screenCenterX - screenCenterX);
    const devOk = dev < 2;
    console.log(`  ${k}: ratioX=${it.ratioX.toFixed(3)} ratioY=${it.ratioY.toFixed(3)} 屏偏差=${dev.toFixed(1)}px ${devOk ? '✓' : '✗'} 出界L=${it.outLeft} R=${it.outRight}`);
    check(`${k} 水平居中(≤2px)`, devOk);
    check(`${k} 未超出画布`, !it.outLeft && !it.outRight);
  }
  // 版本号应在右下角（不居中），仅打印
  if (m.items.version) {
    console.log(`  version: ratioX=${m.items.version.ratioX.toFixed(3)} ratioY=${m.items.version.ratioY.toFixed(3)}（右下角，非居中，正常）`);
  }
  await page.close();
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1280, height: 720 },
    args: ['--no-sandbox'],
  });
  try {
    await runViewport(browser, { width: 1280, height: 720 }, '桌面 16:9');
    await runViewport(browser, { width: 844, height: 390, isMobile: true, hasTouch: true }, '安卓横屏 844×390');
    await runViewport(browser, { width: 390, height: 844, isMobile: true, hasTouch: true }, '安卓竖屏 390×844');
  } finally {
    await browser.close();
  }
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
