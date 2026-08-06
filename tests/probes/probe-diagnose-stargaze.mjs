/**
 * 诊断：确认 questState/storyStep 设置是否生效、场景是否正确
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.PROBE_URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1280, height: 720 },
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    page.on('console', (msg) => console.log('[console]', msg.text()));
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));

    await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
    await sleep(2500);

    // 直接跳 farm
    await page.evaluate(() => window.__game.scene.start('farm'));
    await sleep(2500);

    const before = await page.evaluate(() => ({
      scene: window.__game.scene.getScenes(true)[0]?.scene.key,
      step: window.debug.getStoryStep(),
      quest: window.debug.getQuestState(),
      time: (() => { try { return window.debug.setTime ? 'has setTime' : 'no setTime'; } catch { return 'err'; } })(),
    }));
    console.log('BEFORE:', JSON.stringify(before));

    await page.evaluate(() => {
      window.debug.setStoryStep('done');
      window.debug.setQuestState('completed');
      window.debug.setTime(10, 0);
      console.log('[probe] 已设置 done/completed/10:00');
    });
    await sleep(1500);

    const after = await page.evaluate(() => ({
      scene: window.__game.scene.getScenes(true)[0]?.scene.key,
      step: window.debug.getStoryStep(),
      quest: window.debug.getQuestState(),
      hasStargaze: !!(window.__game.scene.getScene('farm')?.stargazeSprites),
      stargazeVisible: (window.__game.scene.getScene('farm')?.stargazeSprites?.[0]?.visible ?? 'no-sprite'),
    }));
    console.log('AFTER:', JSON.stringify(after));
  } finally {
    await browser.close();
  }
}
run().catch((e) => { console.error(e); process.exit(1); });