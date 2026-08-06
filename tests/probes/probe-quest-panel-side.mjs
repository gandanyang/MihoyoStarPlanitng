/**
 * 探针 — 任务面板支线页签（f4：支线任务/居民需求入任务列表，后续任务解锁）
 *
 * 验证目标（Level 2）：
 *  1. 任务面板有「支线」页签，点击切换
 *  2. 默认（flags 全 false）：5 条支线全部 🔒 锁定 + lockHint
 *  3. 注入 asked → 该支线显示「进行中」+ objective
 *  4. 注入 done → 显示 ✅ 已完成
 *  5. 居民需求渲染在支线页签内（「—— 居民需求 ——」分隔 + 待交付行）
 *  6. 全程无 JS 错误
 *
 * 前置：Vite dev server localhost:5175
 * 运行：$env:GAME_URL='http://localhost:5175/'; node tests/probes/probe-quest-panel-side.mjs
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

async function run() {
  console.log('=== 探针：任务面板支线页签（f4）===\n');
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

    // 切到 town（有 questPanel + 需求板数据）
    await page.evaluate(() => {
      const g = window.__game;
      const active = g.scene.getScenes(true)[0];
      if (active) g.scene.stop(active.scene.key);
      g.scene.start('town');
    });
    await sleep(2500);

    // 1. 打开任务面板 + 切到支线页签
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      s.questPanel?.open?.();
      document.querySelector('#quest-panel [data-tab="side"]')?.click();
    });
    await sleep(500);

    const readSide = () => page.evaluate(() => {
      const panel = document.getElementById('quest-panel');
      const tabs = [...(panel?.querySelectorAll('#qp-tabs button') ?? [])].map(b => b.textContent);
      const body = panel?.querySelector('#qp-body')?.textContent ?? '';
      const cards = [...(panel?.querySelectorAll('#qp-body > div') ?? [])].map(d => d.textContent ?? '');
      return { tabs, body, cards };
    });

    let st = await readSide();
    check('1. 任务面板含「支线」页签', st.tabs.includes('支线'), `tabs=${st.tabs.join(',')}`);
    check('2. 支线页签已激活（内容为支线列表）', st.body.includes('院子有人照顾') && st.body.includes('一株小梅花'),
      (st.body || '').replace(/\s+/g, ' ').slice(0, 120));
    check('3. 默认 5 条支线全部锁定 🔒', (st.body.match(/🔒/g) ?? []).length === 5, `locks=${(st.body.match(/🔒/g) ?? []).length}`);
    check('4. 锁定提示展示解锁条件', st.body.includes('完成「整理旧花园」后解锁') && st.body.includes('进入矿洞后解锁'), '');
    check('5. 居民需求已并入支线页签', st.body.includes('居民需求') && st.body.includes('花匠小梅') && st.body.includes('矿工老张'),
      (st.body || '').replace(/\s+/g, ' ').slice(0, 100));

    // 2. 注入 asked → 进行中
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      s.sideXiyaGardenAsked = true;
      s.questPanel?.close?.();
      s.questPanel?.open?.();
      document.querySelector('#quest-panel [data-tab="side"]')?.click();
    });
    await sleep(400);
    st = await readSide();
    check('6. 注入 asked 后该支线进入「进行中」', st.body.includes('院子有人照顾') && st.body.includes('进行中') &&
      st.body.includes('交付木材×3'), (st.body || '').replace(/\s+/g, ' ').slice(0, 150));
    check('6b. 其余支线仍锁定', (st.body.match(/🔒/g) ?? []).length === 4, `locks=${(st.body.match(/🔒/g) ?? []).length}`);

    // 3. 注入 done → 已完成
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      s.sideXiyaGardenAsked = true;
      s.sideXiyaGardenDone = true;
      s.questPanel?.close?.();
      s.questPanel?.open?.();
      document.querySelector('#quest-panel [data-tab="side"]')?.click();
    });
    await sleep(400);
    st = await readSide();
    check('7. 注入 done 后显示已完成 ✅', st.body.includes('院子有人照顾') && st.body.includes('已完成'),
      (st.body || '').replace(/\s+/g, ' ').slice(0, 120));

    // 4. 关闭面板
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      s.questPanel?.close?.();
    });
    await sleep(300);
    const closed = await page.evaluate(() => {
      const el = document.getElementById('quest-panel');
      return !el || el.style.display === 'none' || el.style.display === '';
    });
    check('8. 关闭面板正常', closed === true);

    // 5. 无 JS 错误
    check('9. 无页面 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
