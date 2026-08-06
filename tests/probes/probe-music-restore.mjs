/**
 * 探针 — 网页端 BGM 恢复验证（MusicSystem）
 *
 * 背景：2026-08-06 录制视频期间全局屏蔽 BGM（BGM_MUTED=true），现已恢复（false）。
 * 验证目标（Level 2）：
 *  1. 标题场景自动播放 title 曲（音频资源请求发起）
 *  2. farm 场景按时段切 farm_day（白天）
 *  3. AudioContext 创建成功、无 JS 错误
 *
 * 前置：Vite dev server localhost:5173；音频文件在 assets/audio/music/（ogg+mp3 双格式）
 * 运行：node tests/probes/probe-music-restore.mjs
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
  console.log('=== 探针：网页端 BGM 恢复验证 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  // 收集音频资源请求
  const audioReqs = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/audio/music/')) {
      audioReqs.push({ file: decodeURIComponent(url.split('/audio/music/')[1].split('?')[0]), status: res.status() });
    }
  });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  try {
    // 进入标题场景
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(2500);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(3000);

    const titleState = await page.evaluate(() => {
      const s = window.__game?.scene?.getScenes(true)?.[0];
      return {
        scene: s?.scene?.key ?? 'none',
        ctx: window.__game?.audio?.context?.state ?? 'none',
      };
    });
    console.log(`  标题场景: ${titleState.scene} | AudioContext: ${titleState.ctx}`);

    // 切到 farm（白天，应播 farm_day）
    await page.evaluate(() => {
      const g = window.__game;
      const active = g.scene.getScenes(true)[0];
      if (active) g.scene.stop(active.scene.key);
      g.scene.start('farm');
    });
    await sleep(3000);

    // 触发一次手势（音频自动播放策略需要用户交互；探针用键盘 Enter 模拟）
    await page.keyboard.press('Enter');
    await sleep(1500);

    const files = [...new Set(audioReqs.map(r => r.file))];
    console.log(`  请求到的音乐资源（${files.length}）：${files.join(', ') || '<无>'}`);

    check('1. 标题场景曲目请求（title）', files.some(f => f.includes('title')), files.join(','));
    check('2. farm 白天曲目请求（farm_day）', files.some(f => f.includes('farm_day')), files.join(','));
    check('3. 全部音乐资源请求 200/206', audioReqs.every(r => r.status === 200 || r.status === 206),
      `${audioReqs.length} 个请求`);
    check('4. 无页面 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
