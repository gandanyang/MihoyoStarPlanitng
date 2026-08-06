/**
 * 探针 — 商店按住连续购买（一键购买，反馈第 26 行）
 *
 * 验证目标（Level 2）：
 *  1. 单击购买按钮 → 恰好购买 1 次（金币 -1×价格，不双买）
 *  2. 按住购买按钮 → 首次立即购买 + 按住期间连续购买（400ms 后每 120ms 一次）
 *  3. 金币不足时自动停止（按住直到没钱，不出负数、不报错）
 *  4. 出售按钮长按不会连续出售（长按只对 buy-* 生效，单击=卖 1 个）
 *  5. 无 JS 错误
 *
 * 前置：dev server（localhost:5175 或 GAME_URL 指定）
 * 运行：node tests/probes/probe-shop-hold-buy.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5175/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' - ' + extra : ''}`);
  ok ? pass++ : fail++;
}

const waitFor = async (fn, timeout = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  return null;
};

async function writeSeed(page) {
  await page.evaluate(() => {
    localStorage.setItem('return_star_save', JSON.stringify({
      version: '0.5',
      savedAt: 'shop hold-buy probe',
      timestamp: Date.now(),
      player: {
        x: 96, y: 160, scene: 'farm', facing: 'down',
        inventory: { radish: 5 },
      },
      world: {
        day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [],
        questState: 'not_started', dailyQuest: null,
      },
      farm: { tiles: [], crops: [], trees: [] },
      story: { storyStep: 'done', ch1TownIntroDone: false },
    }));
  });
}

async function enterFarm(page) {
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2500);
  await page.keyboard.press('Enter');
  await sleep(3000);
}

async function openShop(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScene('farm');
    s?.shopPanel?.open();
    return !!document.getElementById('shop-panel');
  });
}

/** 读取商店面板当前金币数（#shop-coins → " 100 G"） */
async function shopCoins(page) {
  return page.evaluate(() => {
    const el = document.querySelector('#shop-panel #shop-coins');
    if (!el) return -1;
    const m = el.textContent.match(/\d+/);
    return m ? parseInt(m[0], 10) : -1;
  });
}

/** 按钮中心坐标（每次交互前重新查，面板 refresh 会重建 DOM） */
async function btnCenter(page, action) {
  return page.evaluate((a) => {
    const el = document.querySelector(`#shop-panel [data-action="${a}"]`);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, action);
}

async function run() {
  console.log('=== 探针：商店按住连续购买（一键购买）===\n');
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
    await sleep(1500);
    await writeSeed(page);
    await enterFarm(page);
    const scene = await page.evaluate(() => window.__game.scene.getScenes(true)[0]?.scene?.key ?? 'none');
    check('进入农场场景', scene === 'farm', `scene=${scene}`);
    const opened = await waitFor(() => openShop(page));
    check('0. 商店面板已打开', opened === true);

    // ---------- A. 出售按钮长按：只卖 1 个，不连卖 ----------
    let coins = await shopCoins(page);
    check('A0. 初始金币 100', coins === 100, `coins=${coins}`);
    const sellBtn = await btnCenter(page, 'sell-radish');
    await page.mouse.move(sellBtn.x, sellBtn.y);
    await page.mouse.down();
    await sleep(800); // 超过长按延迟 400ms，若连卖会卖出多次
    await page.mouse.up();
    await sleep(400);
    coins = await shopCoins(page);
    check('A1. 长按出售只卖 1 个（100 → 115，不连卖）', coins === 115, `coins=${coins}`);

    // ---------- B. 单击购买：恰好 1 次 ----------
    const tapBtn = await btnCenter(page, 'buy-radish-seed');
    await page.mouse.move(tapBtn.x, tapBtn.y);
    await page.mouse.down();
    await sleep(80); // 短按，不足长按延迟
    await page.mouse.up();
    await sleep(400);
    coins = await shopCoins(page);
    check('B1. 单击买 1 个（115 → 105，不双买）', coins === 105, `coins=${coins}`);

    // ---------- C. 按住购买：连买直到没钱 ----------
    const holdBtn = await btnCenter(page, 'buy-radish-seed');
    await page.mouse.move(holdBtn.x, holdBtn.y);
    await page.mouse.down();
    await sleep(1800); // 首买 + 400ms 后每 120ms 连买；105G / 10G 共 10 次 → 剩 5G
    await page.mouse.up();
    await sleep(400);
    coins = await shopCoins(page);
    check('C1. 按住连买直到没钱（105 → 5，10 次购买）', coins === 5, `coins=${coins}`);
    check('C2. 未透支成负数', coins >= 0, `coins=${coins}`);

    // ---------- D. 无 JS 错误 ----------
    check('D1. 无页面 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    // ---------- T. 触摸模拟（安卓按住） ----------
    console.log('\n--- 触摸模拟（安卓端按住场景）---');
    const page2 = await browser.newPage();
    const touchErrors = [];
    page2.on('pageerror', e => touchErrors.push(e.message));
    await page2.setViewport({ width: 844, height: 390, hasTouch: true, isMobile: true });
    await page2.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await writeSeed(page2);
    await enterFarm(page2);
    await waitFor(() => openShop(page2));
    const t0 = await shopCoins(page2);
    check('T0. 触摸端初始金币 100', t0 === 100, `coins=${t0}`);

    // 触摸单击 → 恰好 1 次
    const tapPt = await btnCenter(page2, 'buy-radish-seed');
    await page2.touchscreen.touchStart(tapPt.x, tapPt.y);
    await sleep(80);
    await page2.touchscreen.touchEnd();
    await sleep(400);
    const t1 = await shopCoins(page2);
    check('T1. 触摸单击买 1 个（100 → 90，不双买）', t1 === 90, `coins=${t1}`);

    // 触摸按住 → 连买直到没钱（90G / 10G → 9 次 → 0）
    const holdPt = await btnCenter(page2, 'buy-radish-seed');
    await page2.touchscreen.touchStart(holdPt.x, holdPt.y);
    await sleep(1800);
    await page2.touchscreen.touchEnd();
    await sleep(400);
    const t2 = await shopCoins(page2);
    check('T2. 触摸按住连买直到没钱（90 → 0）', t2 === 0, `coins=${t2}`);
    check('T3. 未透支成负数', t2 >= 0, `coins=${t2}`);

    // 没钱后触摸单击 → 资金不足 toast（pointerdown 未 preventDefault，click 正常提示）
    const poorPt = await btnCenter(page2, 'buy-radish-seed');
    await page2.touchscreen.touchStart(poorPt.x, poorPt.y);
    await sleep(80);
    await page2.touchscreen.touchEnd();
    await sleep(500);
    const poorToast = await page2.evaluate(() => {
      const t = document.querySelector('#shop-panel #shop-toast');
      return t ? { shown: t.style.display === 'block', text: t.textContent } : null;
    });
    check('T4. 没钱后单击提示资金不足', poorToast?.shown === true && poorToast.text.includes('资金不足'), JSON.stringify(poorToast));
    check('T5. 触摸端无 JS 错误', touchErrors.length === 0, touchErrors.slice(0, 3).join(' | '));

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
