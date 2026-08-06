/**
 * 探针 — FEATURE-040 剧情回顾（Dialogue History）
 *
 * 验证目标（Level 2）：
 *  1. 对话打开时右上角出现「剧情回顾」按钮
 *  2. 点击按钮 → 半透明只读面板打开，条目数 = 已播放行数，最近一条 = 当前行
 *  3. 关闭面板 → advance() 仍可继续推进，剧情不丢行（打字机进度恢复）
 *  4. 播放 ≥51 行（短循环剧本）→ 最旧条目被挤出，总数 ≤50
 *  5. 移动端布局下按钮/面板可点击
 *
 * 前置：Vite dev server localhost:5173
 * 运行：node tests/probes/probe-dialogue-history.mjs
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
  console.log('=== 探针：FEATURE-040 剧情回顾（Dialogue History）===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2000);

    // 切到 farm 场景（storyDialogue 实例由场景持有）
    await page.evaluate(() => {
      const g = window.__game;
      const active = g.scene.getScenes(true)[0];
      if (active) g.scene.stop(active.scene.key);
      g.scene.start('farm');
    });
    await sleep(2500);

    const hasDialogue = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return !!(s?.storyDialogue?.play);
    });
    check('1. farm 场景持有 storyDialogue 实例', hasDialogue);

    // 播放一段短对话
    const LINES = [
      { speaker: '林澈', color: '#7eb8da', inner: true, text: '五年了。' },
      { speaker: '', color: '#aaaaaa', text: '（收起手机。）' },
      { speaker: '夏雅', color: '#f0a050', text: '你就是林澈？' },
      { speaker: '夏雅', color: '#f0a050', text: '（笑）岛上的人都这样。太阳一出来，就想醒着。' },
      { speaker: '', color: '#b8a0e8', text: '……它沉睡太久了。' },
    ];
    await page.evaluate(([k, ls]) => {
      const s = window.__game.scene.getScene(k);
      s.storyDialogue.play(ls);
    }, ['farm', LINES]);
    await sleep(800);

    // 1. 按钮可见
    const btnVisible = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      return btns.some(b => (b.textContent ?? '').includes('剧情回顾'));
    });
    check('2. 对话期间右上角「剧情回顾」按钮可见', btnVisible);

    // 2. 打开面板 → 条目数 = 已显示行数（打字机推进 1 行 → 1 条）
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find(x => (x.textContent ?? '').includes('剧情回顾'));
      b?.click();
    });
    await sleep(600);
    const panelState = await page.evaluate(() => {
      const el = document.getElementById('dialogue-history-panel');
      const list = el?.querySelector('#dh-list');
      return {
        open: !!el && el.style.display !== 'none' && el.style.display !== '',
        itemCount: list?.querySelectorAll('div[style*="padding"]').length ?? 0,
        text: list?.textContent ?? '',
        isOpen: !!window.__game?.scene?.getScene('farm')?.storyDialogue?.isOpen?.(),
      };
    });
    check('3. 点击后面板打开', panelState.open === true);
    check('4. 面板条目数与已播放行数一致（≥1，最近=当前行）', panelState.itemCount >= 1 && panelState.text.includes('五年了。'),
      `count=${panelState.itemCount}`);
    check('5. 面板打开期间对话仍处于打开状态（冻结不关）', panelState.isOpen === true);

    // 面板打开期间 advance 被拦截（不推进）
    const idxBefore = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      s.storyDialogue.advance();
      return s.storyDialogue.index;
    });
    await sleep(200);
    const textAfterAdvance = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return s.storyDialogue.textEl?.textContent ?? '';
    });
    check('6. 面板打开期间 advance 被冻结（不跳行）', idxBefore === 0 && textAfterAdvance.includes('五年了。'),
      `idx=${idxBefore}`);

    // 3. 关闭面板 → 推进恢复
    await page.evaluate(() => {
      document.querySelector('#dialogue-history-panel [data-action="close"]')?.click();
    });
    await sleep(500);
    const closedState = await page.evaluate(() => {
      const el = document.getElementById('dialogue-history-panel');
      return !el || el.style.display === 'none' || el.style.display === '';
    });
    check('7. 关闭面板', closedState === true);
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (s.storyDialogue.isOpen()) s.storyDialogue.advance();
    });
    await sleep(400);
    const advanceAfter = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return { idx: s.storyDialogue.index, text: s.storyDialogue.textEl?.textContent ?? '' };
    });
    check('8. 关闭后 advance 恢复推进（下一行 = 收起手机旁白）', advanceAfter.idx === 1 && advanceAfter.text.includes('收起手机'),
      `idx=${advanceAfter.idx} text="${advanceAfter.text.slice(0, 20)}"`);

    // 跳过剩余对话，避免残留
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (s.storyDialogue.isOpen()) s.storyDialogue.skip();
    });
    await sleep(400);

    // 4. 播放 ≥51 行 → 挤出最旧，≤50
    await page.evaluate(([k]) => {
      const s = window.__game.scene.getScene(k);
      const many = Array.from({ length: 60 }, (_, i) => ({
        speaker: i % 2 === 0 ? '夏雅' : '林澈',
        color: i % 2 === 0 ? '#f0a050' : '#7eb8da',
        text: `测试行 ${i + 1} 号`,
      }));
      s.storyDialogue.play(many);
    }, ['farm']);
    await sleep(1200);
    // 推进约 58 行（每行 2 次 advance：finishTyping + 下一行），留 2 行未推完 → 对话保持打开
    for (let i = 0; i < 116; i++) {
      await page.evaluate(() => {
        const s = window.__game.scene.getScene('farm');
        if (s.storyDialogue.isOpen()) s.storyDialogue.advance();
      });
      await sleep(8);
    }
    await sleep(400);
    const dlgStillOpen = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return s.storyDialogue.isOpen();
    });
    check('9a. 推进 58 行后对话仍打开（未播完）', dlgStillOpen === true);
    // 此时历史 ≥51 条（含第一次对话 5 条 + 本次 58 行）→ 挤出到 50
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find(x => (x.textContent ?? '').includes('剧情回顾'));
      b?.click();
    });
    await sleep(600);
    const historyState = await page.evaluate(() => {
      const el = document.getElementById('dialogue-history-panel');
      const list = el?.querySelector('#dh-list');
      return {
        text: list?.textContent ?? '',
        count: list?.querySelectorAll('div[style*="padding"]').length ?? 0,
      };
    });
    check('9. ≥51 行播放后历史 ≤50（最旧被挤出）', historyState.count <= 50 && historyState.count >= 45, `count=${historyState.count}`);
    check('10. 第一次对话最旧行已被挤出（「五年了。」不在）', !historyState.text.includes('五年了。'), '');
    check('11. 最近一行仍在（「测试行 58 号」在）', historyState.text.includes('测试行 58 号'), '');

    // 5. 无页面 JS 错误
    check('12. 无页面 JS 错误', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
