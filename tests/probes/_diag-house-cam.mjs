/** 临时诊断：house 场景相机居中链路 */
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
  // 手动执行一次 centerOn，看 scroll 是否变化
  const before = { sx: cam.scrollX, sy: cam.scrollY };
  cam.centerOn(s.player.x, s.player.y);
  const after = { sx: cam.scrollX, sy: cam.scrollY };
  return {
    centerSmallMap: s.centerSmallMap,
    player: { x: s.player.x, y: s.player.y },
    before, after,
    zoom: cam.zoom, w: cam.width, h: cam.height,
    sceneActive: s.scene.isActive(),
    hasUpdate: typeof s.update === 'function',
  };
});
console.log(JSON.stringify(d, null, 2));
await browser.close();
