/**
 * 探针 — 剧情回顾重播配音（f3：加「重播配音」按键，可重新听配音）
 *
 * 验证目标（Level 2）：
 *  1. 播放含语音的台词 → 剧情回顾面板该行出现「🔊 重播」按钮
 *  2. 无语音行（旁白）→ 不显示重播按钮
 *  3. 点击重播按钮 → AudioBufferSourceNode.start 被调用（真实播放链路，劫持计数）
 *  4. 已缓存行重播不重复下载 ogg（VoiceBank 缓存复用，不重复拉流）
 *  5. 重播后面板保持打开，不误关闭
 *  6. 全程无 JS 错误
 *
 * 前置：Vite dev server localhost:5175
 * 运行：$env:GAME_URL='http://localhost:5175/'; node tests/probes/probe-history-replay.mjs
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
  console.log('=== 探针：剧情回顾重播配音（f3）===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  // 捕获音频请求（重播链路若缓存未命中会发起 ogg 请求）
  const voiceReqs = [];
  page.on('request', (req) => {
    if (req.url().includes('audio/voice_normalized/')) voiceReqs.push(req.url());
  });

  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2000);

    // 切到 farm（storyDialogue 实例由场景持有）
    await page.evaluate(() => {
      const g = window.__game;
      const active = g.scene.getScenes(true)[0];
      if (active) g.scene.stop(active.scene.key);
      g.scene.start('farm');
    });
    await sleep(2500);

    // 劫持 AudioBufferSourceNode.start 计数（真实播放链路观测）
    await page.evaluate(() => {
      window.__audioStartCount = 0;
      const orig = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        window.__audioStartCount++;
        return orig.apply(this, args);
      };
    });

    // 播放混合台词：1 行有语音（林澈「五年了。」）+ 1 行旁白（无语音）
    const LINES = [
      { speaker: '林澈', color: '#7eb8da', text: '五年了。' },
      { speaker: '', color: '#aaaaaa', text: '（收起手机。）' },
      { speaker: '夏雅', color: '#f0a050', text: '你就是林澈？' },
    ];
    await page.evaluate(([k, ls]) => {
      const s = window.__game.scene.getScene(k);
      s.storyDialogue.play(ls);
    }, ['farm', LINES]);
    await sleep(900);
    // 推进 2 次，让 3 行都显示并写入历史（addEntry 在 showLine 时记录）
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => {
        const s = window.__game.scene.getScene('farm');
        if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.advance();
      });
      await sleep(500);
    }
    await sleep(600);

    // 打开剧情回顾面板
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find(x => (x.textContent ?? '').includes('剧情回顾'));
      b?.click();
    });
    await sleep(600);

    // 1. 面板内重播按钮数量/内容（2 条有语音行：五年了 + 你就是林澈）
    const replayState = await page.evaluate(() => {
      const list = document.getElementById('dh-list');
      const btns = [...(list?.querySelectorAll('[data-action="replay"]') ?? [])];
      return {
        count: btns.length,
        speakers: btns.map(b => `${b.getAttribute('data-speaker')}|${b.getAttribute('data-text')}`),
      };
    });
    check('1. 有语音行出现「重播」按钮', replayState.count === 2, `count=${replayState.count}`);
    check('1b. 重播按钮数据正确（林澈·五年了 / 夏雅·你就是林澈）',
      replayState.speakers.some(s => s.includes('林澈') && s.includes('五年了')) &&
      replayState.speakers.some(s => s.includes('夏雅')),
      JSON.stringify(replayState.speakers));

    // 2. 无语音旁白行不显示重播按钮
    const noVoiceReplay = await page.evaluate(() => {
      const list = document.getElementById('dh-list');
      const rows = [...(list?.querySelectorAll('div[style*="padding"]') ?? [])];
      const narration = rows.find(r => (r.textContent ?? '').includes('旁白'));
      return !!narration && !narration.querySelector('[data-action="replay"]');
    });
    check('2. 旁白行不显示重播按钮', noVoiceReplay === true);

    // 3. 点击「五年了。」重播 → start 计数增加（真实播放）
    const countBefore = await page.evaluate(() => window.__audioStartCount ?? 0);
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('#dh-list [data-action="replay"]')]
        .find(b => (b.getAttribute('data-text') ?? '').includes('五年了'));
      btn?.click();
    });
    await sleep(1200);
    const countAfter = await page.evaluate(() => window.__audioStartCount ?? 0);
    check('3. 点击重播触发真实播放（AudioBufferSource.start）', countAfter > countBefore, `start=${countBefore}→${countAfter}`);

    // 4. 重播已缓存行不重复下载 ogg（语音在台词播放时已预载）
    const reqCountBefore = voiceReqs.length;
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('#dh-list [data-action="replay"]')]
        .find(b => (b.getAttribute('data-text') ?? '').includes('五年了'));
      btn?.click();
    });
    await sleep(1000);
    const newReqs = voiceReqs.slice(reqCountBefore);
    check('4. 已缓存行重播不重复下载（缓存复用）', newReqs.length === 0, `reqs=${newReqs.join(',')}`);

    // 5. 重播后面板保持打开
    const panelStillOpen = await page.evaluate(() => {
      const el = document.getElementById('dialogue-history-panel');
      return !!el && el.style.display !== 'none' && el.style.display !== '';
    });
    check('5. 重播后面板保持打开', panelStillOpen === true);

    // 6. 无 JS 错误
    check('6. 无页面 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
