/**
 * 探针 — 车站开场手机通知（短信播报）语音链路
 *
 * 验证目标（Level 2）：
 *  1. 手机通知弹窗出现时请求第 1 页短信播报语音 system/hr_station_01.wav
 *     （VoiceBank.play('', 第1页文案) → voicebank 通配 speaker + 文本精确匹配）
 *  2. 无手势被 autoplay 拒绝时：玩家点击翻页（pointerdown）触发全局解锁补播
 *  3. 翻页/关闭/跳过链路无 JS 错误
 *  4. 语音请求均 200/206
 *
 * 前置：Vite dev server localhost:5173；hr_station_01.wav 已生成
 * 运行：node tests/probes/probe-phone-notify-voice.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  let pass = 0;
  let fail = 0;
  const ok = (name, cond, extra = '') => {
    console.log(`${cond ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
    cond ? pass++ : fail++;
  };

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  const voiceReqs = [];
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/audio/voice/')) {
      voiceReqs.push({ file: decodeURIComponent(url.split('/audio/voice/')[1]), status: res.status() });
    }
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.stack || e.message));

  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2000);
    await page.keyboard.press('Enter');
    await sleep(1500);

    // 等待手机通知弹窗出现（开场动画约 6-8s：列车声 → 淡入 → 手机通知）
    let phoneVisible = false;
    for (let i = 0; i < 40; i++) {
      phoneVisible = await page.evaluate(() => {
        const s = window.__game?.scene?.getScene('station');
        return !!(s?.phoneOverlay);
      });
      if (phoneVisible) break;
      await sleep(500);
    }
    ok('1. 手机通知弹窗已出现（station.phoneOverlay）', phoneVisible);

    // 弹窗出现时的语音请求（无手势时可能被 autoplay 拒绝，这里只记录）
    await sleep(600);
    const reqAtShow = voiceReqs.filter((r) => r.file.startsWith('system/hr_station_01.wav'));
    console.log(`  弹窗出现时 hr_station_01 请求数：${reqAtShow.length}（0 = 被 autoplay 拒绝，等待点击解锁补播）`);

    // 真实点击弹窗翻页（pointerdown 触发 VoiceBank 全局解锁 → 补播被拒语音）
    const rect = await page.evaluate(() => {
      const s = window.__game?.scene?.getScene('station');
      const el = s?.phoneOverlay;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (rect) await page.mouse.click(rect.x, rect.y);
    await sleep(900);

    const reqs = voiceReqs.map((r) => r.file);
    ok('2. 短信播报语音已请求 → system/hr_station_01.wav',
      reqs.includes('system/hr_station_01.wav'), `${voiceReqs.length} 个语音请求`);

    // 第 2 页翻页后应播报第 2 页第一句 hr_station_03
    await sleep(400);
    const page2 = await page.evaluate(() => {
      const s = window.__game?.scene?.getScene('station');
      const ov = s?.phoneOverlay;
      return { hasOverlay: !!ov, page2Visible: !!ov?.children?.[1] ? ov.children[1].style.display !== 'none' : false };
    });
    ok('2b. 翻页后第 2 页可见', page2.page2Visible, JSON.stringify(page2));
    ok('2c. 第 2 页播报语音已请求 → system/hr_station_03.wav',
      reqs.includes('system/hr_station_03.wav'), `${voiceReqs.length} 个语音请求`);

    // 第 2 页点击关闭
    if (rect) await page.mouse.click(rect.x, rect.y);
    await sleep(700);
    const closed = await page.evaluate(() => {
      const s = window.__game?.scene?.getScene('station');
      return !(s?.phoneOverlay);
    });
    ok('3. 弹窗关闭后 phoneOverlay 已移除', closed);

    const bad = voiceReqs.filter((r) => r.status !== 200 && r.status !== 206);
    ok('4. 语音请求均 200/206', bad.length === 0,
      bad.length ? JSON.stringify(bad) : `${voiceReqs.length} 个请求均 200/206`);
    ok('5. 无页面 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch((err) => { console.error('探针异常:', err); process.exit(1); });
