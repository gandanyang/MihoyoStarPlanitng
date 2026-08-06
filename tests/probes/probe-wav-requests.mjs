/**
 * 排查探针：为什么会请求 Music/station_04.wav（触发浏览器下载）
 *
 * 抓取完整开场流程中所有 .wav / .mp3 请求的 URL，确认是否存在非 audio/voice 前缀的请求。
 *
 * 前置：dev server 在 localhost:5173
 * 运行：node tests/probes/probe-wav-requests.mjs
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
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));

    // 记录所有音频请求：URL -> {status, contentType}
    const audioReqs = new Map();
    page.on('request', (req) => {
      const u = req.url();
      if (/\.(wav|mp3|ogg|m4a)(\?|$)/i.test(u)) audioReqs.set(u, { status: 'pending' });
    });
    page.on('response', (res) => {
      const u = res.url();
      if (audioReqs.has(u)) {
        audioReqs.set(u, {
          status: res.status(),
          contentType: res.headers()['content-type'] || '',
        });
      }
    });
    page.on('download', (d) => console.log('[DOWNLOAD]', d.url()));

    await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
    await sleep(2000);
    await page.keyboard.press('Enter');
    await sleep(1200);

    // 关手机通知
    for (let i = 0; i < 30; i++) {
      const has = await page.evaluate(() => !!window.__game.scene.getScene('station')?.phoneOverlay);
      if (has) await page.evaluate(() => window.__game.scene.getScene('station')?.phoneOverlay?.click());
      else if (i > 2) break;
      await sleep(250);
    }

    // 推进对话（station_01~04 会播放语音）
    for (let i = 0; i < 60; i++) {
      const stillOpen = await page.evaluate(() => {
        const s = window.__game.scene.getScenes(true)[0];
        if (s?.storyDialogue?.isOpen?.()) { s.storyDialogue.advance(); return true; }
        return false;
      });
      if (!stillOpen) break;
      await sleep(150);
    }
    await sleep(1500);

    // 出站 → 进 gate，触发更多语音（gate_01 等）
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('station');
      if (s?.player) s.player.x = 1500;
    });
    await sleep(4000);

    console.log('\n=== 抓到的音频请求 ===');
    for (const [u, info] of [...audioReqs]) {
      const flag = /Music|station_04/.test(u) ? '  <== 关注' : '';
      const ok = (info.status === 200 || info.status === 206) && /^audio\//.test(info.contentType);
      console.log(`  [${ok ? 'OK ' : 'ERR'}] ${info.status} ${info.contentType} ${u}${flag}`);
    }
  } finally {
    await browser.close();
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
