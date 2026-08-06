/** 临时诊断2：house 相机 centerOn 为何不生效 */
import puppeteer from 'puppeteer-core';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5175/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH, headless: false,
  defaultViewport: { width: 1024, height: 768 },
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await sleep(2000);
await page.evaluate(() => {
  const g = window.__game;
  const active = g.scene.getScenes(true)[0];
  if (active) g.scene.stop(active.scene.key);
  g.scene.start('farm');
});
await sleep(2500);
await page.evaluate(() => { window.__game.scene.start('house', { spawn: { x: 40, y: 72 } }); });
await sleep(2000);

const d = await page.evaluate(() => {
  const s = window.__game.scene.getScene('house');
  const cam = s.cameras.main;
  // 1. 直接设置 scrollX/scrollY
  cam.scrollX = -160; cam.scrollY = -120;
  const set1 = { sx: cam.scrollX, sy: cam.scrollY };
  // 2. 调 centerOn
  cam.centerOn(40, 72);
  const afterCenter = { sx: cam.scrollX, sy: cam.scrollY };
  // 3. 检查是否有多个相机
  const camCount = s.cameras.cameras.length;
  const mainIndex = s.cameras.cameras.indexOf(cam);
  return {
    set1, afterCenter, camCount, mainIndex,
    width: cam.width, height: cam.height,
    displayWidth: cam.displayWidth, displayHeight: cam.displayHeight,
    zoom: cam.zoom,
    followTarget: cam._follow?.x ?? null,
    bounds: cam._bounds ? { x: cam._bounds.x, y: cam._bounds.y, w: cam._bounds.width, h: cam._bounds.height } : null,
  };
});
console.log(JSON.stringify(d, null, 2));
await sleep(600);
const d2 = await page.evaluate(() => {
  const s = window.__game.scene.getScene('house');
  const cam = s.cameras.main;
  return { sx: cam.scrollX, sy: cam.scrollY };
});
console.log('600ms 后:', JSON.stringify(d2));
await browser.close();
