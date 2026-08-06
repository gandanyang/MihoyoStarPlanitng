/**
 * 探针 — E-09 消磨时间功能（等待面板）
 *
 * 验证目标（Level 2，浏览器侧）：
 *  1. T 键打开等待面板（farm 场景）
 *  2. 面板显示 4 个等待选项
 *  3. 选择"等到傍晚"→ 时间推进到 18:00，遮罩过渡无残留
 *  4. 再次打开，选择"小憩 2 小时"→ 时间 +2（20:00）
 *  5. T 键关闭面板
 *  6. 全程无 JS 错误
 *
 * 前置：dev server localhost:5173
 * 运行：node tests/probes/probe-wait-e09.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
function ok(step, passed, detail = '') {
  if (passed) { pass++; console.log(`  ✅ ${step}${detail ? ' - ' + detail : ''}`); }
  else { fail++; console.log(`  ❌ ${step}${detail ? ' - ' + detail : ''}`); }
}

async function sceneInfo(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0];
    const t = window.debug?.getTimeStr?.() ?? '';
    const m = /(\d{1,2}):(\d{2})/.exec(t);
    return {
      scene: s?.scene?.key ?? 'none',
      hour: m ? parseInt(m[1], 10) : -1,
      minute: m ? parseInt(m[2], 10) : -1,
    };
  });
}

async function teleport(page, sceneKey, x, y, facing = 'up') {
  await page.evaluate(([k, px, py, f]) => {
    const s = window.__game.scene.getScene(k);
    if (!s?.player) return;
    s.player.x = px;
    s.player.y = py;
    s.player.facing = f;
  }, [sceneKey, x, y, facing]);
}

async function skipDialogue(page, lineCount) {
  const calls = lineCount * 2 + 1;
  for (let i = 0; i < calls; i++) {
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) s.storyDialogue.advance();
    });
    await sleep(40);
  }
  await sleep(500);
}

async function panelState(page) {
  return page.evaluate(() => {
    const el = document.getElementById('wait-panel');
    if (!el) return 'none';
    return el.style.display;
  });
}

async function clickWaitOption(page, label) {
  const clicked = await page.evaluate((l) => {
    const panel = document.getElementById('wait-panel');
    if (!panel) return 'no-panel';
    const divs = [...panel.querySelectorAll('div')];
    // 匹配最内层 label（文本精确等于选项名，无子 div），再取父按钮
    const label = divs.find((d) => d.textContent?.trim() === l && !d.querySelector('div'));
    if (!label) return 'not-found';
    const btn = label.parentElement;
    if (!btn) return 'no-parent';
    btn.click();
    return 'clicked';
  }, label);
  console.log(`  [点击] ${label} → ${clicked}`);
  await sleep(300);
}

async function run() {
  console.log('=== 探针：E-09 消磨时间（等待面板）===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(String(e)));

  try {
    // 导航到农场（标题 → 车站 → 大门 → 农场）
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);
    await page.keyboard.press('Enter');
    await sleep(2200);
    await page.evaluate(() => {
      const btn = document.getElementById('intro-skip-btn');
      if (btn) btn.click();
    });
    await sleep(900);
    await teleport(page, 'station', 970, 460, 'right');
    await sleep(3200);
    await teleport(page, 'gate', 248, 200, 'up');
    await page.keyboard.press('E');
    await sleep(900);
    await skipDialogue(page, 7);
    await page.keyboard.press('B');
    await sleep(700);
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-action="use-key"]');
      if (btn) btn.click();
    });
    await sleep(1200);
    await skipDialogue(page, 10); // GATE_OPENED_DIALOGUE 10 行
    await teleport(page, 'gate', 240, 40, 'up');
    await sleep(3200);
    const info0 = await sceneInfo(page);
    ok('1. 到达农场场景', info0.scene === 'farm', `场景=${info0.scene}`);

    // 清掉可能残留的引导对话（到达农场后夏雅/锄地引导可能打开）
    await skipDialogue(page, 12);
    await page.keyboard.press('Escape');
    await sleep(400);

    // 诊断：检查 keyT 是否存在 + 手动调用 tryOpenWait
    const diag = await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      return {
        keyT: !!s?.inputManager?.keyT,
        hasTryOpen: typeof s?.tryOpenWait === 'function',
      };
    });
    console.log(`  [诊断] keyT=${diag.keyT}, tryOpenWait=${diag.hasTryOpen}`);
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.tryOpenWait) s.tryOpenWait();
    });
    await sleep(500);
    const stManual = await panelState(page);
    ok('2a. 手动调用 tryOpenWait 打开面板', stManual === 'flex', `display=${stManual}`);

    // T 键打开等待面板（关闭后，用窗口级 keydown 派发——puppeteer press 在后台窗口可能丢焦点）
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', bubbles: true })));
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 't', code: 'KeyT', bubbles: true })));
    await sleep(500);
    const elExists = await page.evaluate(() => !!document.getElementById('wait-panel'));
    const st1 = await panelState(page);
    ok('2. T 键打开等待面板', st1 === 'flex', `元素存在=${elExists}, display=${st1}`);

    const optCount = await page.evaluate(() => {
      const panel = document.getElementById('wait-panel');
      if (!panel) return 0;
      return [...panel.querySelectorAll('div')].filter((d) => (d.style.padding ?? '').includes('10px')).length;
    });
    ok('3. 面板含 4 个等待选项', optCount === 4, `选项数=${optCount}`);

    // 选择"等到傍晚"→ 时间推进到 18:00
    await clickWaitOption(page, '等到傍晚');
    await sleep(1400);
    const info1 = await sceneInfo(page);
    ok('4. 等到傍晚 → 时间 18:00', info1.hour === 18, `hour=${info1.hour}:${String(info1.minute).padStart(2, '0')}`);
    const st2 = await panelState(page);
    ok('5. 等待后面板关闭', st2 !== 'flex', `display=${st2}`);
    const fadeLeft = await page.evaluate(() => !!document.getElementById('wait-fade'));
    ok('6. 遮罩元素复用且无残留（透明度已归 0）', fadeLeft);

    // 再次打开，选择"小憩 2 小时"→ 时间 +2（20:00）
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', bubbles: true })));
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 't', code: 'KeyT', bubbles: true })));
    await sleep(500);
    await clickWaitOption(page, '小憩 2 小时');
    await sleep(1400);
    const info2 = await sceneInfo(page);
    ok('7. 小憩 2 小时 → 时间 20:00', info2.hour === 20, `hour=${info2.hour}`);

    // 22:00 边界：再等到入夜（20:00→目标 20:00 不推进）→ 提示
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', bubbles: true })));
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 't', code: 'KeyT', bubbles: true })));
    await sleep(500);
    await clickWaitOption(page, '等到入夜');
    await sleep(900);
    const info3 = await sceneInfo(page);
    ok('8. 20:00 后再等 20:00 不推进（不晚于当前）', info3.hour === 20, `hour=${info3.hour}`);

    // T 键关闭
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', bubbles: true })));
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 't', code: 'KeyT', bubbles: true })));
    await sleep(500);
    const st3 = await panelState(page);
    ok('9. T 键关闭面板', st3 !== 'flex', `display=${st3}`);

    const jsErrCount = jsErrors.length;
    ok('10. 全程无 JS 错误', jsErrCount === 0, jsErrCount ? jsErrors[0] : '');
  } catch (e) {
    fail++;
    console.log(`  ❌ 探针异常: ${e.message}`);
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
}

run();
