/** 临时诊断2：完整复现探针流程，观察语音请求时机（对话播放 vs 点击重播） */
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
page.on('request', r => { if (r.url().includes('voice_normalized')) reqs.push('REQ:' + r.url().split('?')[0]); });
page.on('console', m => { if (m.type() === 'warn' || m.type() === 'error' || m.text().includes('VoiceBank')) console.log('[console]', m.text().slice(0, 120)); });
const errs = [];
page.on('pageerror', e => errs.push(e.message));

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
console.log('--- 播放台词前 reqs:', reqs.length);

// 播放台词
const LINES = [
  { speaker: '林澈', color: '#7eb8da', text: '五年了。' },
  { speaker: '', color: '#aaaaaa', text: '（收起手机。）' },
  { speaker: '夏雅', color: '#f0a050', text: '你就是林澈？' },
];
await page.evaluate(([k, ls]) => {
  const s = window.__game.scene.getScene(k);
  s.storyDialogue.play(ls);
}, ['farm', LINES]);
await sleep(1500);
console.log('--- 播放台词后 reqs:', JSON.stringify(reqs));

// 打开面板
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find(x => (x.textContent ?? '').includes('剧情回顾'));
  b?.click();
});
await sleep(600);

// 检查面板内重播按钮
const rb = await page.evaluate(() => {
  const list = document.getElementById('dh-list');
  const btns = [...(list?.querySelectorAll('[data-action="replay"]') ?? [])];
  return btns.map(b => ({ sp: b.getAttribute('data-speaker'), tx: b.getAttribute('data-text') }));
});
console.log('--- 重播按钮:', JSON.stringify(rb), ' reqs:', reqs.length);

// 点击重播
await page.evaluate(() => {
  document.querySelector('#dh-list [data-action="replay"]')?.click();
});
await sleep(1500);
console.log('--- 点击重播后 reqs:', JSON.stringify(reqs));
console.log('--- pageErrors:', errs);
await browser.close();
