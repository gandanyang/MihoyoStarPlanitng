/** 临时诊断：直接调用 VoiceBank.play 观察是否发起 fetch 请求（f3 探针 3 失败定位） */
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
const reqs = [];
page.on('request', r => { if (r.url().includes('voice_normalized')) reqs.push(r.url()); });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'warn' || m.type() === 'error') console.log('[console]', m.text()); });

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

// 直接调用 VoiceBank（经 window.__game 间接无法 import，尝试从 debug 或直接 fetch 模拟）
const res = await page.evaluate(() => {
  try {
    // 检查 debug 是否暴露 VoiceBank
    const dbg = window.debug ?? {};
    return { keys: Object.keys(dbg).slice(0, 30), hasVoice: !!dbg.VoiceBank };
  } catch (e) { return { err: String(e) }; }
});
console.log('debug keys:', res);

// 手动发一个 fetch 验证监听是否工作
await page.evaluate(() => {
  fetch('audio/voice_normalized/linche/station_01.ogg?_t=1').then(() => {}).catch(() => {});
});
await sleep(800);
console.log('手动 fetch 后 reqs:', reqs);
console.log('pageErrors:', errs);
await browser.close();
