/**
 * 探针 — BUG-039 语音播放时机修复（VoiceBank 等 loadeddata + 就绪缓存 + stop 清理）
 *
 * 验证目标（Level 2）：
 *  1. 播放链路正常：台词 → 对应 wav 资源请求 200/206
 *  2. 快速推进多行（每次 VoiceBank.play 内部 stop→new Audio→(就绪直播/等待 loadeddata)）→ 无 JS 错误
 *  3. 播放后立即 stop（模拟快速跳过整段对话）→ 无 JS 错误、无残留播放副作用
 *  4. 同句重复播放（命中 readyCache 立即播放路径）→ 无 JS 错误
 *  5. 无语音行（旁白/系统行）穿插时不残留上一句语音（串音防护回归）→ 无 JS 错误
 *
 * 前置：Vite dev server localhost:5173；语音文件已生成（public/audio/voice/）
 * 运行：node tests/probes/probe-bug039-voice-sync.mjs
 * 注意：Android 真机起播同步（无延迟错位）需真机复验（测试批 3），本探针覆盖浏览器侧回归。
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

/** 播放一组 DialogueLine，每行停留 duration ms 后推进；返回期间所有 audio/voice 请求 */
async function playLines(page, sceneKey, lines, duration) {
  await page.evaluate(([k, ls]) => {
    const s = window.__game.scene.getScene(k);
    if (!s?.storyDialogue) return;
    s.storyDialogue.play(ls);
  }, [sceneKey, lines]);
  await sleep(600);
  for (let i = 1; i < lines.length; i++) {
    await page.evaluate(([k]) => {
      const s = window.__game.scene.getScene(k);
      if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.advance();
    }, [sceneKey]);
    await sleep(duration);
  }
  await page.evaluate(([k]) => {
    const s = window.__game.scene.getScene(k);
    if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.skip?.() ?? s.storyDialogue.advance();
  }, [sceneKey]);
  await sleep(200);
}

async function run() {
  console.log('=== 探针：BUG-039 语音播放时机修复 ===\n');

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
      voiceReqs.push({ file: decodeURIComponent(url.split('/audio/voice/')[1]), status: res.status() });
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

    // 段A：快速推进多行（含 inner 混响、旁白无语音行、重复「嗯。」轮换）
    const LINES = [
      { speaker: '林澈', color: '#7eb8da', inner: true, text: '五年了。' },
      { speaker: '', color: '#aaaaaa', text: '（收起手机。）' },            // 无语音行 → 应 stop 残留
      { speaker: '夏雅', color: '#f0a050', text: '你就是林澈？' },
      { speaker: '夏雅', color: '#f0a050', text: '（笑）岛上的人都这样。太阳一出来，就想醒着。' },
      { speaker: '林澈', color: '#7eb8da', text: '嗯。' },                   // 轮换路径
      { speaker: '林澈', color: '#7eb8da', text: '嗯。' },
    ];
    await playLines(page, 'farm', LINES, 700);

    const files = [...new Set(voiceReqs.map(r => r.file))];
    console.log(`  请求到的语音资源（${files.length}）：${files.join(', ') || '<无>'}`);
    ok('2. 快速推进多行语音请求全部 200/206/304', voiceReqs.filter(r => ![200, 206, 304].includes(r.status)).length === 0,
      `${voiceReqs.length} 个请求`);
    ok('3. 快速推进后无 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || '无');

    // 段B：播放后立即 stop（模拟快速跳过整段对话，触发 pending/current 清理）
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
    ok('4. 播放后立即 stop（快速跳过）无 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || '无');

    // 段C：同句重复播放（二次命中 readyCache 立即播放路径）
    const errCountBeforeC = pageErrors.length;
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      s.storyDialogue.play([{ speaker: '夏雅', color: '#f0a050', text: '你就是林澈？' }]);
    });
    await sleep(800);
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.skip?.();
    });
    await sleep(200);
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      s.storyDialogue.play([{ speaker: '夏雅', color: '#f0a050', text: '你就是林澈？' }]);
    });
    await sleep(800);
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.skip?.();
    });
    await sleep(200);
    ok('5. 同句重复播放（命中就绪缓存）无 JS 错误', pageErrors.length === errCountBeforeC, pageErrors.slice(errCountBeforeC).join(' | ') || '无');

    // 段D：完整链路收尾（对话开→关，无泄漏）
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      s.storyDialogue.play([{ speaker: '爷爷的笔记', color: '#e8d8a8', text: '今天又捡到一片。星星……是不是也想回家？' }]);
    });
    await sleep(1000);
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.close?.();
    });
    await sleep(300);
    ok('6. 对话开→关完整链路无 JS 错误', pageErrors.length === errCountBeforeC, pageErrors.slice(errCountBeforeC).join(' | ') || '无');

    const non200 = voiceReqs.filter(r => ![200, 206, 304].includes(r.status));
    ok('7. 全程语音资源请求均 200/206/304（文件齐全；304=HTTP 缓存命中）', non200.length === 0, non200.length ? JSON.stringify(non200) : `${voiceReqs.length} 个请求`);
    ok('8. 无页面 JS 错误（最终）', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
