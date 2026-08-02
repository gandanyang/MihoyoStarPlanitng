/**
 * 移动端操作文案适配探针 v5
 *
 * 在 375×812 触屏视口验证：
 *   1. TitleScene 开始提示 = "点按屏幕 开始游戏"
 *   2. STATION_DIALOGUE 末句（移动提示）= "使用屏幕左下方摇杆…"
 *   3. 对话内不含 "[W/A/S/D]"
 *
 * 完整开场时序：标题 Enter → 车站（黑屏800ms → 列车声~3.5s → 淡入1.2s → 手机通知 → 对话）
 * 前置：dev server 在 localhost:5173；node probe-mobile-text.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/?reset=1';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('=== 移动端操作文案适配验证 v5 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 375, height: 812, isMobile: true, hasTouch: true },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  let pass = 0;
  let fail = 0;
  const check = (name, ok) => {
    console.log(`${ok ? '✅' : '❌'} ${name}`);
    ok ? pass++ : fail++;
  };

  const dlgState = () =>
    page.evaluate(() => {
      const z500 = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '500');
      const p = z500 ? [...z500.querySelectorAll('p')].filter(x => x.textContent.trim().length > 0).map(x => x.textContent.trim()) : [];
      return { open: !!z500 && z500.style.display !== 'none', p };
    });

  const waitFor = async (fn, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = await fn();
      if (v) return v;
      await sleep(250);
    }
    return null;
  };

  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(2500);

    // 1. Title 文案
    const titleText = await page.evaluate(() => {
      const scene = window.__game?.scene?.getScene('title');
      return scene?.startPrompt?.text ?? null;
    });
    check(`标题提示 = "点按屏幕 开始游戏"（实际: ${titleText}）`, titleText === '点按屏幕 开始游戏');

    // 2. 进入车站，等待完整开场
    await page.keyboard.press('Enter');
    console.log('  等待开场动画（列车声→淡入→手机通知）…');

    // 3. 等待手机通知（zIndex 600 含"人事通知"）并点击
    const phoneClicked = await waitFor(async () => {
      return await page.evaluate(() => {
        const overlay = [...document.querySelectorAll('div')].find(d => d.style.zIndex === '600' && d.textContent.includes('人事通知'));
        if (overlay) { overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true; }
        return false;
      });
    });
    check('手机通知出现并点击', !!phoneClicked);

    // 4. 等待对话打开且有文本
    const opened = await waitFor(async () => {
      const s = await dlgState();
      return s.open && s.p.length > 0 ? s : null;
    });
    check('对话已打开', !!opened);
    if (opened) console.log(`  首句: "${opened.p[opened.p.length - 1]?.slice(0, 40)}"`);

    // 5. 推进全部 12 句（每句打字中→空格显示全文→再空格下一句，故 ×2）
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press('Space');
      await sleep(160);
    }

    // 6. 读取最后可见的对话文本
    const finalState = await dlgState();
    const lastText = finalState.p.length ? finalState.p[finalState.p.length - 1] : null;
    console.log(`  末句实际: "${lastText}"`);
    check('末句含"摇杆"', !!lastText && lastText.includes('摇杆'));
    check('末句含"移动"', !!lastText && lastText.includes('移动'));
    check('末句不含"[W/A/S/D]"', !!lastText && !lastText.includes('W/A/S/D'));
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
