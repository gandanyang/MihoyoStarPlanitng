/**
 * 探针 — BUG-039 语音播放时机修复 v2（立即 play + 预加载下一句 + 手势解锁兜底）
 *
 * 真机复现教训（2026-08-05）：v1「等 loadeddata 再播」让开局 play() 离点击手势过远，
 * 被 Android WebView autoplay 策略拒绝 → 第一句无声 + 被拒 play() 在后续点击时自动恢复
 * → 最后一句响起第一句的声音。v2 改为：
 *  1. play() 立即调用（保留 transient activation 窗口，避免开局被拒）
 *  2. StoryDialogue 预加载下一句语音（消除 WebView 加载慢的起播延迟）
 *  3. 全局手势解锁兜底（NotAllowedError → 手势时重试）
 *
 * 验证目标（Level 2，浏览器侧回归；真机验收归测试批 3）：
 *  0. 预加载：当前句播放期间，下一句语音请求已提前发起
 *  1. 播放链路正常：台词 → 对应 wav 资源请求 200/206/304
 *  2. 快速推进多行（含 inner 混响、旁白无语音行、重复「嗯。」轮换）→ 无 JS 错误
 *  3. 播放后立即 stop（模拟快速跳过）→ 无 JS 错误、无残留播放副作用
 *  4. 同句重复播放（立即播放路径）→ 无 JS 错误
 *  5. 对话开→关完整链路 → 无 JS 错误、无串音
 *
 * 前置：Vite dev server localhost:5173；语音文件已生成（public/audio/voice/）
 * 运行：node tests/probes/probe-bug039-voice-sync.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';

let pass = 0;
let fail = 0;
function ok(step, passed, detail = '') {
  if (passed) { pass++; console.log(`  ✅ ${step}${detail ? ' - ' + detail : ''}`); }
  else { fail++; console.log(`  ❌ ${step}${detail ? ' - ' + detail : ''}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('=== 探针：BUG-039 语音播放时机修复 v2（立即 play + 预加载） ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  const voiceReqs = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/audio/voice/')) {
      voiceReqs.push({ file: decodeURIComponent(url.split('/audio/voice/')[1]), status: res.status(), ts: Date.now() });
    }
  });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.stack || e.message));
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2000);
    await page.keyboard.press('Enter');
    await sleep(2500);

    // 切到 farm
    await page.evaluate(() => {
      const g = window.__game;
      const active = g.scene.getScenes(true)[0];
      if (active) g.scene.stop(active.scene.key);
    });
    await sleep(600);
    await page.evaluate(() => { window.__game.scene.start('farm'); });
    await sleep(2000);

    const hasDialogue = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return !!(s?.storyDialogue?.play);
    });
    ok('1. farm 场景持有 storyDialogue 实例', hasDialogue);

    // 段0：预加载下一句（play 第 1 行后，第 2 行语音请求应已提前发起，无需 advance）
    const filesBefore = new Set(voiceReqs.map(r => r.file));
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      s.storyDialogue.play([
        { speaker: '林澈', color: '#7eb8da', inner: true, text: '五年了。' },
        { speaker: '夏雅', color: '#f0a050', text: '你就是林澈？' },
      ]);
    });
    await sleep(900); // 第 1 行显示期间应已预加载第 2 行
    const newFiles = [...new Set(voiceReqs.map(r => r.file))].filter(f => !filesBefore.has(f));
    console.log(`  预加载新请求文件（${newFiles.length}）：${newFiles.join(', ') || '<无>'}`);
    ok('2. 播放第 1 行后第 2 行语音已提前预加载（≥2 个新文件）', newFiles.length >= 2,
      `${newFiles.length} 个（第 1 行播放 + 第 2 行预加载）`);
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.skip?.();
    });
    await sleep(300);
    ok('3. 预加载阶段无 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || '无');

    // 段A：快速推进多行（含 inner 混响、旁白无语音行、重复「嗯。」轮换）
    const LINES = [
      { speaker: '林澈', color: '#7eb8da', inner: true, text: '五年了。' },
      { speaker: '', color: '#aaaaaa', text: '（收起手机。）' },            // 无语音行 → 应 stop 残留
      { speaker: '夏雅', color: '#f0a050', text: '你就是林澈？' },
      { speaker: '夏雅', color: '#f0a050', text: '（笑）岛上的人都这样。太阳一出来，就想醒着。' },
      { speaker: '林澈', color: '#7eb8da', text: '嗯。' },                   // 轮换路径
      { speaker: '林澈', color: '#7eb8da', text: '嗯。' },
    ];
    await page.evaluate(([k, ls]) => {
      const s = window.__game.scene.getScene(k);
      if (s?.storyDialogue) s.storyDialogue.play(ls);
    }, ['farm', LINES]);
    await sleep(600);
    for (let i = 1; i < LINES.length; i++) {
      await page.evaluate(([k]) => {
        const s = window.__game.scene.getScene(k);
        if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.advance();
      }, ['farm']);
      await sleep(650);
    }
    await page.evaluate(([k]) => {
      const s = window.__game.scene.getScene(k);
      if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.skip?.() ?? s.storyDialogue.advance();
    }, ['farm']);
    await sleep(300);

    const filesA = [...new Set(voiceReqs.map(r => r.file))];
    console.log(`  段A 请求到的语音资源（${filesA.length}）：${filesA.join(', ') || '<无>'}`);
    ok('4. 快速推进多行语音请求全部 200/206/304', voiceReqs.filter(r => ![200, 206, 304].includes(r.status)).length === 0,
      `${voiceReqs.length} 个请求`);
    ok('5. 快速推进后无 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || '无');

    // 段B：播放后立即 stop（模拟快速跳过整段对话）
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      s.storyDialogue.play([{ speaker: '林澈', color: '#7eb8da', inner: true, text: '五年了。' }]);
    });
    await sleep(150);
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.skip?.();
    });
    await sleep(400);
    ok('6. 播放后立即 stop（快速跳过）无 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || '无');

    // 段C：同句重复播放（立即播放路径）
    const errCountBeforeC = pageErrors.length;
    const playRepeat = async () => {
      await page.evaluate(() => {
        const s = window.__game.scene.getScene('farm');
        s.storyDialogue.play([{ speaker: '夏雅', color: '#f0a050', text: '你就是林澈？' }]);
      });
      await sleep(700);
      await page.evaluate(() => {
        const s = window.__game.scene.getScene('farm');
        if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.skip?.();
      });
      await sleep(200);
    };
    await playRepeat();
    await playRepeat();
    ok('7. 同句重复播放无 JS 错误', pageErrors.length === errCountBeforeC, pageErrors.slice(errCountBeforeC).join(' | ') || '无');

    // 段D：完整链路收尾（对话开→关）
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      s.storyDialogue.play([{ speaker: '爷爷的笔记', color: '#e8d8a8', text: '今年番茄长得很好，比去年早熟了几天。' }]);
    });
    await sleep(1000);
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.close?.();
    });
    await sleep(300);
    ok('8. 对话开→关完整链路无 JS 错误', pageErrors.length === errCountBeforeC, pageErrors.slice(errCountBeforeC).join(' | ') || '无');

    const non200 = voiceReqs.filter(r => ![200, 206, 304].includes(r.status));
    ok('9. 全程语音资源请求均 200/206/304（文件齐全；304=HTTP 缓存命中）', non200.length === 0, non200.length ? JSON.stringify(non200) : `${voiceReqs.length} 个请求`);
    ok('10. 无页面 JS 错误（最终）', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
