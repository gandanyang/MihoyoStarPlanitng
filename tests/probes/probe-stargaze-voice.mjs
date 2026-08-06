/**
 * 探针：观星夜语音运行时验证（v2，逐行慢速推进）
 *
 * 验证目标（Level 2）：
 *   1. 主线完成 + 夜晚走到观星点按 E → DEMO_ENDING_DIALOGUE 逐行播放
 *   2. 开场 10 条应配音行（ending_01~10）真的发起语音请求
 *   3. 选择分支 B → 林澈 branchB_01/02 发声
 *   4. FINALE → 夏雅 finale_01/02 发声
 *
 * 前置：Vite dev server localhost:5173
 * 运行：node tests/probes/probe-stargaze-voice.mjs
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

/** 活动场景引用 */
async function active(page) {
  return page.evaluate(() => {
    const g = window.__game;
    return g.scene.getScenes(true)[0] || g.scene.getScene('farm');
  });
}

/** 当前对话文本 */
async function dlgText(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0] || window.__game.scene.getScene('farm');
    return s?.storyDialogue?.textEl?.textContent ?? '<no-dialogue>';
  });
}

/** 等待对话打开（最长 timeout ms） */
async function waitDialogueOpen(page, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const open = await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0] || window.__game.scene.getScene('farm');
      return !!(s?.storyDialogue?.isOpen?.());
    });
    if (open) return true;
    await sleep(200);
  }
  return false;
}

/** 逐行推进（每行 advance 2 次 + 间隔），当前行文本 */
async function advanceLine(page) {
  await page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0] || window.__game.scene.getScene('farm');
    if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.advance();
  });
  await sleep(90);
  await page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0] || window.__game.scene.getScene('farm');
    if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.advance();
  });
  await sleep(850);
}

/** 推进直到出现选项按钮（最多 maxLines 行） */
async function advanceToOptions(page, maxLines = 20) {
  for (let i = 0; i < maxLines; i++) {
    const opts = await page.evaluate(() =>
      [...document.querySelectorAll('button')].map(b => b.textContent?.trim()).filter(t => /^\d\./.test(t ?? ''))
    );
    if (opts.length >= 3) return opts;
    const before = voiceReqs.length;
    await advanceLine(page);
    const after = voiceReqs.length;
    if (after === before) console.log(`    [line ${i}] 无新语音请求，文本="${(await dlgText(page)).substring(0, 26)}"`);
    else console.log(`    [line ${i}] 新语音 +${after - before}`);
  }
  return [];
}

const voiceReqs = [];

async function run() {
  console.log('=== 探针：观星夜语音运行时验证（v2）===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  page.on('response', async (res) => {
    const url = res.url();
    const m = url.match(/\/audio\/(voice[_a-z]*)\/([^?]+)/);
    if (m) voiceReqs.push({ dir: m[1], file: decodeURIComponent(m[2]), status: res.status() });
  });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);

    await page.evaluate(() => {
      window.debug.setStoryStep('done');
      window.debug.setQuestState('completed');
      window.debug.setTime(21, 0);
    });
    await sleep(500);

    await page.evaluate(() => {
      const g = window.__game;
      const active = g.scene.getScenes(true)[0];
      if (active) g.scene.stop(active.scene.key);
    });
    await sleep(600);
    await page.evaluate(() => window.__game.scene.start('farm'));
    await sleep(2600);

    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (s?.player) { s.player.x = 504; s.player.y = 240; s.player.facing = 'up'; }
    });
    await sleep(200);
    await page.keyboard.press('KeyE');
    await sleep(400);

    const opened = await waitDialogueOpen(page);
    ok('1. 观星夜对话已打开', opened);
    if (!opened) throw new Error('观星夜对话未打开，终止');

    // 逐行推进至选项（记录每行语音请求）
    const options = await advanceToOptions(page);
    ok('2. 三选项渲染', options.length === 3, JSON.stringify(options));

    const all = [...new Set(voiceReqs.map(r => r.file))];
    const expect0 = ['xiya/ending_01.wav', 'xiya/ending_02.wav', 'xiya/ending_03.wav', 'linche/ending_04.wav',
      'xiya/ending_05.wav', 'grandpa/ending_06.wav', 'grandpa/ending_07.wav', 'grandpa/ending_08.wav',
      'grandpa/ending_09.wav', 'linche/ending_10.wav'];
    const missing0 = expect0.filter(f => !all.includes(f));
    ok('3. 观星夜开场 10 条语音全部发声', missing0.length === 0,
      missing0.length ? `缺失: ${missing0.join(',')}` : all.filter(f => f.includes('ending_')).join(', '));

    const norm = voiceReqs.filter(r => r.dir === 'voice_normalized').length;
    const raw = voiceReqs.filter(r => r.dir === 'voice').length;
    ok('4. 语音来自 voice_normalized/', norm > 0 && raw === 0, `normalized=${norm} raw=${raw}`);

    // ---------- 选择分支 B（unknown） ----------
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('我想先弄清楚'));
      btn?.click();
    });
    await sleep(1000);
    const branchText = await dlgText(page);
    console.log(`    [branch] 文本="${branchText.substring(0, 30)}"`);

    for (let i = 0; i < 3; i++) await advanceLine(page);
    const all2 = [...new Set(voiceReqs.map(r => r.file))];
    ok('5. 分支 B 林澈独白 branchB_01/02 发声',
      all2.includes('linche/branchB_01.wav') && all2.includes('linche/branchB_02.wav'),
      all2.filter(f => f.includes('branchB_')).join(', ') || '<无>');

    // ---------- FINALE ----------
    for (let i = 0; i < 5; i++) await advanceLine(page);
    const all3 = [...new Set(voiceReqs.map(r => r.file))];
    ok('6. FINALE 夏雅 finale_01/02 发声',
      all3.includes('xiya/finale_01.wav') && all3.includes('xiya/finale_02.wav'),
      all3.filter(f => f.includes('finale_')).join(', ') || '<无>');

    await sleep(800);
    const panel = await page.evaluate(() => {
      const el = document.getElementById('ending-panel');
      return { exists: !!el, display: el?.style.display ?? '' };
    });
    ok('7. 结算面板打开', panel.exists && panel.display === 'flex', JSON.stringify(panel));

    const non200 = voiceReqs.filter(r => r.status !== 200 && r.status !== 206);
    ok('8. 全部语音资源请求 200/206', non200.length === 0, non200.length ? JSON.stringify(non200) : `${voiceReqs.length} 个请求`);
    ok('9. 无页面 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

    console.log(`\n  语音请求全清单（${voiceReqs.length}）：`);
    [...new Set(voiceReqs.map(r => r.file))].forEach(f => console.log(`    - ${f}`));

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
