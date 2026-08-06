/**
 * 记忆卡 → 相簿 → 解锁反馈 完整闭环（v0.10 Task 1）—— 运行时验证探针
 *
 * 验证：
 *   1. 新照片解锁 → 弹出「归星录新增照片《…》」toast + 【查看】按钮
 *   2. 点击【查看】→ 打开相簿面板，新照片可见
 *   3. 反馈队列：对话进行中不弹 toast，对话结束后才弹
 *   4. 无页面错误
 *
 * 前置：dev server；node probe-photo-loop.mjs
 */

import puppeteer from 'puppeteer-core';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const makeSave = () => ({
  version: '0.5', savedAt: 'photo-loop-probe', timestamp: Date.now(),
  player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
  world: { day: 1, hour: 12, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'completed' },
  farm: { tiles: [], crops: [], trees: [] },
  story: { storyStep: 'observatory_complete' },
});

async function run() {
  console.log('=== 记忆卡 → 相簿 → 解锁反馈闭环验证 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
    ok ? pass++ : fail++;
  };

  const enterGame = async (scene, timeoutMs = 20000) => {
    const t0 = Date.now();
    let cur = '';
    while (Date.now() - t0 < timeoutMs) {
      cur = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (cur === scene) return;
      if (cur === 'title') {
        await page.keyboard.press('Enter');
        await page.mouse.click(400, 300);
      }
      await sleep(350);
    }
    throw new Error(`未能进入 ${scene}（实际 ${cur}）错误=${errors.slice(0, 5).join(' | ')}`);
  };

  await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
  await sleep(800);
  await page.evaluate((s) => localStorage.setItem('return_star_save', JSON.stringify(s)), makeSave());
  await page.reload({ waitUntil: 'networkidle2' });
  await enterGame('farm');
  await sleep(1000);

  const bodyHas = (t) => page.evaluate((x) => document.body.innerText.includes(x), t);
  const clickView = () => page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent === '查看');
    if (b) b.click();
    return !!b;
  });

  // 1) 解锁 → toast + 查看按钮
  await page.evaluate(() => {
    window.debug.unlockPhoto('hillside_view');
    const s = window.__game.scene.getScenes(true)[0];
    s.notifyPhotoUnlocked('hillside_view');
  });
  await sleep(700);
  check('A1 toast 出现（归星录新增照片）', await bodyHas('归星录新增照片'));
  check('A2 toast 含照片标题《后山观景》', await bodyHas('后山观景'));
  const viewBtn = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent === '查看'));
  check('A3 有【查看】按钮', viewBtn);

  // 2) 点击查看 → 相簿打开
  const clicked = await clickView();
  check('A4 点击查看成功', clicked);
  await sleep(600);
  const albumOpen = await page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0];
    return !!(s.photoAlbumPanel && s.photoAlbumPanel.isOpen());
  });
  check('A5 相簿面板打开', albumOpen);
  check('A6 相簿内可见新照片标题', await bodyHas('后山观景'));

  // 3) 反馈队列：相簿打开时不弹，关闭后才弹（等价于"全屏 UI 阻塞时排队"）
  await page.evaluate(() => {
    window.debug.unlockPhoto('summer_garden');
    const s = window.__game.scene.getScenes(true)[0];
    s.openPhotoAlbum();
    s.notifyPhotoUnlocked('summer_garden');
  });
  await sleep(500);
  check('B1 相簿打开时不弹 toast', !(await bodyHas('归星录新增照片《夏日花园》')));
  await page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0];
    if (s.photoAlbumPanel) s.photoAlbumPanel.close();
  });
  await sleep(800);
  check('B2 相簿关闭后弹 toast', await bodyHas('归星录新增照片《夏日花园》'));

  // 4) 运行时错误
  check('C1 无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(2); });
