const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: false, defaultViewport: { width: 375, height: 812, isMobile: true, hasTouch: true }, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  let pass = 0, fail = 0;
  const check = (n, ok, x = '') => { console.log(`${ok ? '✅' : '❌'} ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
  try {
    await page.goto('http://localhost:5173/?reset=1', { waitUntil: 'networkidle2' });
    await sleep(2500);
    await page.keyboard.press('Enter');
    await sleep(2200);
    await page.evaluate(() => { const b = document.getElementById('intro-skip-btn'); if (b) b.click(); });
    await sleep(800);
    await page.evaluate(() => window.debug.setStoryStep('done'));
    await sleep(300);
    await page.evaluate(() => { const g = window.__game; const a = g.scene.getScenes(true)[0]; if (a) g.scene.stop(a.scene.key); g.scene.start('farm'); });
    await sleep(2500);

    // 站爷爷笔记旁 (24,104) 下侧 (24,120)，按交互应弹笔记对话
    await page.evaluate(() => { const s = window.__game.scene.getScene('farm'); s.player.x = 24; s.player.y = 120; s.player.facing = 'up'; });
    await sleep(300);
    await page.evaluate(() => { const b = document.querySelector('#touch-controls [data-action="interact"]'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    await sleep(800);
    const noteOpen = await page.evaluate(() => { const s = window.__game.scene.getScenes(true)[0]; return s?.storyDialogue?.isOpen?.() ?? false; });
    const noteText = await page.evaluate(() => { const s = window.__game.scene.getScenes(true)[0]; return s?.storyDialogue?.textEl?.textContent ?? null; });
    check('爷爷笔记新位置(1,6)可交互', noteOpen, noteText ? `当前句:${noteText.slice(0, 20)}` : '');
    if (noteOpen) await page.evaluate(() => { const s = window.__game.scene.getScenes(true)[0]; if (s?.storyDialogue?.isOpen()) s.storyDialogue.skip(); });

    // 站 (40,76) 树旁再按，应触发砍树引导（不是爷爷笔记）
    await page.evaluate(() => { const s = window.__game.scene.getScene('farm'); s.player.x = 40; s.player.y = 76; s.player.facing = 'up'; });
    await sleep(300);
    await page.evaluate(() => { const b = document.querySelector('#touch-controls [data-action="interact"]'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    await sleep(800);
    const chopOpen = await page.evaluate(() => { const s = window.__game.scene.getScenes(true)[0]; return s?.storyDialogue?.isOpen?.() ?? false; });
    const chopText = await page.evaluate(() => { const s = window.__game.scene.getScenes(true)[0]; return s?.storyDialogue?.textEl?.textContent ?? null; });
    check('树旁(40,76)触发砍树引导（非笔记）', chopOpen && chopText?.includes('旧斧头'), chopText ? `当前句:${chopText.slice(0, 20)}` : '');
    await browser.close();
  } catch (e) { console.error(e); await browser.close(); }
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
})();
