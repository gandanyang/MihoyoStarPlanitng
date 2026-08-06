/**
 * 探针 — A2 复现 v3：模拟真实用户激进操作（双击手机通知/连点对话），
 * 每次 HTMLMediaElement.play 调用时记录当前字幕文本与 UI 状态，
 * 直接捕捉「语音出现在错误位置」与「同一文件播放两次」。
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 注入 play 监听：记录时间/资源/成败/当前字幕/手机通知是否还开着/场景数
async function inject(page) {
  await page.evaluateOnNewDocument(() => {
    window.__plays = [];
    window.__pageErrors = [];
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const t = performance.now();
      const sub = document.querySelector('div[style*="z-index: 500"] p')?.textContent?.slice(0, 40) ?? '(无对话框)';
      const phoneOpen = !!document.querySelector('div[style*="z-index: 600"]');
      const dl = document.querySelector('div[style*="z-index: 500"]');
      const scenes = (window.__game?.scene?.getScenes?.() ?? []).map((s) => s.scene?.key || '?');
      window.__plays.push({
        t: Math.round(t),
        src: (this.currentSrc || this.src || '').replace(/^https?:\/\/[^/]+/, ''),
        result: 'pending',
        sub,
        phoneOpen,
        dialogOpen: !!(dl && dl.style.display === 'block'),
        scenes: scenes.join(','),
      });
      try {
        return Promise.resolve(orig.apply(this, arguments)).then(
          () => { window.__plays[window.__plays.length - 1].result = 'started'; },
          () => { window.__plays[window.__plays.length - 1].result = 'blocked'; },
        );
      } catch (e) {
        window.__plays[window.__plays.length - 1].result = 'error:' + e;
        return Promise.reject(e);
      }
    };
    window.addEventListener('error', (e) => window.__pageErrors.push(String(e.message || e.error)));
  });
}

async function boot(page, tag) {
  await page.goto(GAME_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1500);
  console.log(`\n===== [${tag}] 点标题开始 =====`);
  await page.mouse.click(512, 384);
}

async function dump(page, tag) {
  const r = await page.evaluate(() => ({
    plays: (window.__plays || []).map((p) => ({ ...p })),
    errors: (window.__pageErrors || []).slice(0, 10),
  }));
  console.log(`\n--- [${tag}] play 调用序列（共 ${r.plays.length} 次）---`);
  r.plays.forEach((p) =>
    console.log(
      `  t=${String(p.t).padStart(6)}ms [${p.result.padEnd(7)}] 字幕[${p.sub}] 手机${p.phoneOpen ? '开' : '关'} 场景[${p.scenes}] ${p.src.split('/').pop()}`,
    ),
  );
  if (r.errors.length) {
    console.log('--- 页面错误 ---');
    r.errors.forEach((e) => console.log('  ' + e));
  }
  // 重复文件统计
  const counts = {};
  r.plays.forEach((p) => { const f = p.src.split('/').pop(); counts[f] = (counts[f] || 0) + 1; });
  const dup = Object.entries(counts).filter(([, c]) => c > 1);
  console.log('--- 同一文件播放次数 >1 ---');
  if (!dup.length) console.log('  无');
  dup.forEach(([f, c]) => console.log(`  ${f} x${c}`));
}

async function scenarioA() {
  // 对照组：正常单击，观察基线序列
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1024, height: 768 }, args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await inject(page);
  await boot(page, 'A-正常单击');
  // 等手机通知
  await page.waitForSelector('div[style*="z-index: 600"]', { timeout: 18000 }).catch(() => {});
  await sleep(400);
  await page.evaluate(() => document.querySelector('div[style*="z-index: 600"]')?.click()); // 第1页
  await sleep(250);
  await page.evaluate(() => document.querySelector('div[style*="z-index: 600"]')?.click()); // 第2页关闭
  await sleep(1200);
  // 逐句推进（慢速，模拟阅读）
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
      const s = window.__game?.scene?.getScenes?.();
      for (const sc of s || []) if (sc?.storyDialogue?.isOpen?.()) sc.storyDialogue.advance();
    });
    await sleep(1200);
  }
  await dump(page, 'A-正常单击');
  await browser.close();
}

async function scenarioB() {
  // 场景 B：双击手机通知第 2 页 → 可能触发两次 playStationDialogue
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1024, height: 768 }, args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await inject(page);
  await boot(page, 'B-双击手机通知第2页');
  await page.waitForSelector('div[style*="z-index: 600"]', { timeout: 18000 }).catch(() => {});
  await sleep(400);
  await page.evaluate(() => document.querySelector('div[style*="z-index: 600"]')?.click()); // 第1页
  await sleep(250);
  // 双击第 2 页（间隔 60ms）
  await page.evaluate(() => document.querySelector('div[style*="z-index: 600"]')?.click());
  await sleep(60);
  await page.evaluate(() => document.querySelector('div[style*="z-index: 600"]')?.click());
  await sleep(1500);
  // 慢速推进
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
      const s = window.__game?.scene?.getScenes?.();
      for (const sc of s || []) if (sc?.storyDialogue?.isOpen?.()) sc.storyDialogue.advance();
    });
    await sleep(1200);
  }
  await dump(page, 'B-双击手机通知第2页');
  await browser.close();
}

async function scenarioC() {
  // 场景 C：对话第一句出现时立即双击（连点两次）→ 双击推进可能跳过/重触发
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1024, height: 768 }, args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await inject(page);
  await boot(page, 'C-对话连点');
  await page.waitForSelector('div[style*="z-index: 600"]', { timeout: 18000 }).catch(() => {});
  await sleep(400);
  await page.evaluate(() => document.querySelector('div[style*="z-index: 600"]')?.click());
  await sleep(250);
  await page.evaluate(() => document.querySelector('div[style*="z-index: 600"]')?.click());
  // 等对话框出现
  await sleep(900);
  // 对对话框快速连点 4 次（间隔 50ms）——模拟用户兴奋/误触双击
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      const s = window.__game?.scene?.getScenes?.();
      for (const sc of s || []) if (sc?.storyDialogue?.isOpen?.()) sc.storyDialogue.advance();
    });
    await sleep(50);
  }
  await sleep(2000);
  // 再慢速推进几格，看后续是否仍重复
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      const s = window.__game?.scene?.getScenes?.();
      for (const sc of s || []) if (sc?.storyDialogue?.isOpen?.()) sc.storyDialogue.advance();
    });
    await sleep(1200);
  }
  await dump(page, 'C-对话连点');
  await browser.close();
}

async function main() {
  await scenarioA();
  await scenarioB();
  await scenarioC();
  console.log('\n=== 探针 v3 完成 ===');
}

main().catch((e) => { console.error('探针失败:', e); process.exit(1); });
