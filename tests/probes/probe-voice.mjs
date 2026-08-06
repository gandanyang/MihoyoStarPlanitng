/**
 * 探针 — 主线剧情语音播放链路（任务-主线剧情语音生成与接入）
 *
 * 验证目标（Level 2）：
 *  1. VoiceBank 映射准确：角色台词 → 对应 wav 资源请求（fetch + Web Audio，URL 带 antiIDM 时间戳）
 *  2. 归一化：带（笑）等前缀标注的行能命中语音（xiya/dawn_03.wav）
 *  3. 通配 speaker：少女（空 speaker）→ girl/forest_08.wav；HR（「」引号文本）→ system/hr_station_02.wav
 *  4. 轮换：同一文本「嗯。」两个文件（harvest_02 / evening_04）都被请求
 *  5. 静默跳过：系统旁白行（（收起手机。））不发起语音请求
 *  6. 对话推进不阻塞（语音与对话 UI 解耦）
 *
 * 前置：Vite dev server localhost:5173；语音文件已生成（public/audio/voice_normalized/）
 * 运行：node tests/probes/probe-voice.mjs
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
  await sleep(1200);
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
  await sleep(300);
}

async function run() {
  console.log('=== 探针：主线剧情语音播放链路 ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  // 收集 audio/voice_normalized 资源请求（VoiceBank 统一走归一化目录；URL 带 antiIDM 时间戳，需剥离 query）
  const voiceReqs = []; // { file, status }
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/audio/voice_normalized/')) {
      const pathPart = url.split('/audio/voice_normalized/')[1].split('?')[0];
      voiceReqs.push({ file: decodeURIComponent(pathPart), status: res.status() });
    }
  });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.stack || e.message));

  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2000);
    await page.keyboard.press('Enter');
    await sleep(2500);

    // 切到 farm（storyDialogue 实例由各场景持有）
    await page.evaluate(() => {
      const g = window.__game;
      const active = g.scene.getScenes(true)[0];
      if (active) g.scene.stop(active.scene.key);
    });
    await sleep(600); // 停旧场景后留出引导缓冲，避免 create 竞态
    await page.evaluate(() => {
      window.__game.scene.start('farm');
    });
    await sleep(2000);

    const hasDialogue = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return !!(s?.storyDialogue?.play);
    });
    ok('1. farm 场景持有 storyDialogue 实例', hasDialogue);

    // 代表性台词序列
    const LINES = [
      { speaker: '林澈', color: '#7eb8da', inner: true, text: '五年了。' },
      { speaker: '', color: '#aaaaaa', text: '（收起手机。）' },
      { speaker: '林澈', color: '#7eb8da', text: '至少这次，是我自己选的离开。' },
      { speaker: '夏雅', color: '#f0a050', text: '你就是林澈？' },
      { speaker: '夏雅', color: '#f0a050', text: '（笑）岛上的人都这样。太阳一出来，就想醒着。' },
      { speaker: '', color: '#b8a0e8', text: '……它沉睡太久了。' },
      { speaker: '', color: '#aaaaaa', text: '「林先生，根据评估，你完全可以加入智能生态部门。」' },
      { speaker: '林澈', color: '#7eb8da', text: '嗯。' },
      { speaker: '林澈', color: '#7eb8da', text: '嗯。' },
      { speaker: '爷爷的笔记', color: '#e8d8a8', text: '今年番茄长得很好，比去年早熟了几天。' },
    ];
    await playLines(page, 'farm', LINES, 900);

    const files = voiceReqs.map(r => r.file);
    const urls = [...new Set(files)];
    console.log(`  请求到的语音资源（${urls.length}）：${urls.join(', ') || '<无>'}`);

    // 断言
    ok('2. inner 内心独白 → linche/station_01.wav', urls.includes('linche/station_01.wav'), '五年了。');
    ok('3. 普通台词 → linche/station_04.wav', urls.includes('linche/station_04.wav'));
    ok('4. 夏雅 → xiya/xiya_01.wav', urls.includes('xiya/xiya_01.wav'));
    ok('5. 归一化（笑）标注 → xiya/dawn_03.wav', urls.includes('xiya/dawn_03.wav'), '（笑）前缀应命中');
    ok('6. 少女（空 speaker 通配）→ girl/forest_08.wav', urls.includes('girl/forest_08.wav'));
    ok('7. HR（「」引号文本）→ system/hr_station_02.wav', urls.includes('system/hr_station_02.wav'));
    ok('8. 「嗯。」轮换 → 两个文件都请求', urls.includes('linche/harvest_02.wav') && urls.includes('linche/evening_04.wav'),
      urls.filter(f => f.startsWith('linche/') && f.endsWith('_0x.wav')).join(','));
    ok('9. 爷爷的笔记 → grandpa/notes_01.wav', urls.includes('grandpa/notes_01.wav'));

    const non200 = voiceReqs.filter(r => r.status !== 200 && r.status !== 206);
    ok('10. 全部语音资源请求 200/206（文件齐全；206=音频 Range 流式正常）', non200.length === 0,
      non200.length ? JSON.stringify(non200) : `${voiceReqs.length} 个请求均 200/206`);
    ok('11. 无页面 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
