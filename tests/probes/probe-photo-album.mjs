/**
 * 探针 — 归星录·相簿（v0.1）
 *
 * 验证目标（Level 2）：
 *  1. HUD 出现「📖 归星录」入口按钮（所有地图场景）
 *  2. 点击打开相簿面板，3 张照片卡片（默认全部未解锁 → 剪影占位 + 获得方式）
 *  3. 解锁 API：unlockPhoto 后重新打开 → 该照片显示图片/标题/描述
 *  4. 存档：save 含 album 字段；load 恢复已解锁状态
 *  5. 关闭面板 → 游戏可继续（无 JS 错误）
 *
 * 前置：Vite dev server localhost:5173
 * 运行：node tests/probes/probe-photo-album.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' - ' + extra : ''}`);
  ok ? pass++ : fail++;
}

async function run() {
  console.log('=== 探针：归星录·相簿（Photo Album）===\n');
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
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2000);

    // 切到 farm
    await page.evaluate(() => {
      const g = window.__game;
      const active = g.scene.getScenes(true)[0];
      if (active) g.scene.stop(active.scene.key);
      g.scene.start('farm');
    });
    await sleep(2500);

    // 1. HUD 入口按钮
    const btnVisible = await page.evaluate(() => {
      const btn = document.getElementById('album-btn');
      return !!btn && (btn.textContent ?? '').includes('归星录');
    });
    check('1. HUD 出现「📖 归星录」入口按钮', btnVisible);

    // 2. 打开相簿（默认未解锁）
    await page.evaluate(() => {
      document.getElementById('album-btn')?.click();
    });
    await sleep(600);
    const albumState = await page.evaluate(() => {
      const el = document.getElementById('photo-album-panel');
      const list = el?.querySelector('#pa-list');
      const cards = list?.querySelectorAll('.pa-card') ?? [];
      const lockedCards = list?.querySelectorAll('.pa-card[data-unlocked="0"]') ?? [];
      const unlockedCards = list?.querySelectorAll('.pa-card[data-unlocked="1"]') ?? [];
      const imgs = list?.querySelectorAll('img') ?? [];
      return {
        open: !!el && el.style.display !== 'none' && el.style.display !== '',
        cardCount: cards.length,
        lockedCount: lockedCards.length,
        unlockedCount: unlockedCards.length,
        lockedIcons: (list?.textContent ?? '').split('🔒').length - 1,
        unlockedImgs: imgs.length,
        text: list?.textContent ?? '',
      };
    });
    check('2. 点击后相簿面板打开', albumState.open === true);
    check('3. 3 张照片卡片渲染（精确 .pa-card）', albumState.cardCount === 3, `cards=${albumState.cardCount}`);
    check('4. 默认全部未解锁（3 锁卡 + 0 图）', albumState.lockedCount === 3 && albumState.unlockedCount === 0 && albumState.unlockedImgs === 0,
      `locked=${albumState.lockedCount} unlocked=${albumState.unlockedCount} imgs=${albumState.unlockedImgs}`);
    check('5. 未解锁卡片显示获得方式', albumState.text.includes('获得方式：完成「整理旧花园」') &&
      albumState.text.includes('获得方式：完成「矿洞探险」') &&
      albumState.text.includes('获得方式：完成「后山老树」'), '');

    // 3. 解锁 API → 重新打开显示图片
    await page.evaluate(() => {
      document.querySelector('#photo-album-panel [data-action="close"]')?.click();
    });
    await sleep(400);
    await page.evaluate(() => {
      // 通过 debug 挂钩（如有）或直接调用模块 API
      // 无全局挂钩时：用动态 import 的方式在页面内解锁（Vite dev 支持）
      import('/src/data/PhotoAlbum.ts').then(m => m.unlockPhoto('summer_garden'));
    });
    await sleep(600);
    // 重新打开
    await page.evaluate(() => {
      document.getElementById('album-btn')?.click();
    });
    await sleep(600);
    const unlockedState = await page.evaluate(() => {
      const el = document.getElementById('photo-album-panel');
      const list = el?.querySelector('#pa-list');
      const imgs = [...(list?.querySelectorAll('img') ?? [])].map(i => i.getAttribute('src'));
      const gardenCard = list?.querySelector('.pa-card[data-id="summer_garden"]');
      return {
        open: !!el && el.style.display !== 'none',
        imgs,
        hasSummerGarden: imgs.some(s => s?.includes('summer_garden')),
        gardenUnlocked: gardenCard?.getAttribute('data-unlocked') === '1',
        unlockedCount: list?.querySelectorAll('.pa-card[data-unlocked="1"]').length ?? 0,
        text: list?.textContent ?? '',
      };
    });
    check('6. 解锁《夏日花园》后显示图片', unlockedState.open && unlockedState.hasSummerGarden === true,
      unlockedState.imgs.join(','));
    check('6b. 夏日花园卡片标记为已解锁', unlockedState.gardenUnlocked === true, `unlocked=${unlockedState.unlockedCount}`);
    check('7. 解锁后标题/描述/来源渲染', unlockedState.text.includes('夏日花园') &&
      unlockedState.text.includes('夏雅说，她小时候经常来这里'), '');

    // 4. 存档字段
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      // 触发一次存档（用 save 系统公开路径）
      window.dispatchEvent(new Event('beforeunload'));
    });
    await sleep(300);
    const saveData = await page.evaluate(() => {
      const raw = localStorage.getItem('return_star_save');
      return raw ? JSON.parse(raw) : null;
    });
    check('8. 存档含 album 字段', Array.isArray(saveData?.album), JSON.stringify(saveData?.album));
    check('9. 存档 album 含 summer_garden', Array.isArray(saveData?.album) && saveData.album.includes('summer_garden'),
      JSON.stringify(saveData?.album));

    // 5. 无 JS 错误
    check('10. 无页面 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
