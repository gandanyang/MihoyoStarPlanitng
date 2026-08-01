import puppeteer from 'puppeteer-core';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH, headless: false,
  defaultViewport: { width: 1024, height: 768 }, args: ['--no-sandbox'],
});
const page = await browser.newPage();
page.on('console', m => {
  if (m.type() === 'warning' || m.type() === 'error' || m.text().includes('[SaveSystem]'))
    console.log(`  [${m.type()}] ${m.text().substring(0, 200)}`);
});
page.on('pageerror', e => console.log('  [pageerror]', e.message));

try {
  await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2500);
  await page.keyboard.press('Enter');
  await sleep(2000);
  await page.evaluate(() => {
    const b = document.getElementById('intro-skip-btn');
    if (b) b.click();
    window.debug.setStoryStep('done');
  });
  await sleep(800);
  await page.evaluate(([x, y]) => { const s = window.__game.scene.getScenes(true)[0]; s.player.x = x; s.player.y = y; }, [970, 460]);
  await sleep(3000);
  console.log('scene:', await page.evaluate(() => window.__game.scene.getScenes(true)[0].scene.key));

  const before = await page.evaluate(() => localStorage.getItem('return_star_save') !== null);
  console.log('存档存在(nextDay前):', before);

  const res = await page.evaluate(() => {
    try {
      const d = window.debug.nextDay();
      return { ok: true, day: d };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  });
  console.log('nextDay:', JSON.stringify(res));

  await sleep(1000);
  const raw = await page.evaluate(() => localStorage.getItem('return_star_save'));
  if (raw) {
    const data = JSON.parse(raw);
    console.log('存档存在(nextDay后): true');
    console.log('version:', data.version, 'story:', data.story?.storyStep, 'scene:', data.player?.scene, 'day:', data.world?.day);
    const t = (data.farm?.trees ?? []).find(([k]) => k === '2,3');
    console.log('树(2,3):', JSON.stringify(t));
  } else {
    console.log('存档存在(nextDay后): false ← 存档未写入');
  }
} catch (e) {
  console.error('异常:', e.message);
} finally {
  await browser.close();
}
