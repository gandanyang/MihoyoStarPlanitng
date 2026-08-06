/**
 * 验证 A+B 优化：观星夜等天黑 + 睡觉选项
 *
 * T1: 主线完成后，白天靠近观星点 → 弹"坐等天黑 / 再等等"选项
 * T2: 选择"坐等天黑" → 快进到 20:00 → 触发观星夜剧情（observatoryComplete=true）
 * T3: 白天睡觉 → 弹"睡到天亮 / 休息到傍晚"选项
 * T4: 选择"休息到傍晚" → 时间变为 18:00
 *
 * 前置：dev server 在 localhost:5173（window.debug 需含 setQuestState/getObservatoryComplete/getTimeStr）
 * 运行：node tests/probes/probe-wait-for-night.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (name, ok) => {
  console.log(`${ok ? '✅' : '❌'} ${name}`);
  ok ? pass++ : fail++;
};

async function setupFarm(browser) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[probe]') || t.includes('[DEBUG]') || t.includes('[debug]') || t.includes('consumeAction') || t.includes('tryInteract') || t.includes('床交互') || t.includes('[MapScene')) {
      console.log('[browser]', t);
    }
  });
  await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
  await sleep(2000);
  // 跳过标题，直接进 farm（跳过开场对话）
  await page.evaluate(() => {
    if (window.__game.scene.isActive('farm')) return;
    window.__game.scene.start('farm');
  });
  await sleep(2500);
  // 设置教程完成 + 任务完成 + 白天 10:00
  await page.evaluate(() => {
    window.debug.setStoryStep('done');
    window.debug.setQuestState('completed');
    window.debug.setTime(10, 0);
  });
  await sleep(1200);
  return page;
}

/** 查找指定文本的选项按钮并点击 */
async function clickOption(page, text) {
  return page.evaluate((t) => {
    const btns = [...document.querySelectorAll('button')];
    const btn = btns.find((b) => b.textContent && b.textContent.includes(t));
    if (btn) { btn.click(); return true; }
    return false;
  }, text);
}

/**
 * 等待选项按钮出现：对话打开时重复 advance()（打字中只补全、不切行；
 * 选项行 advance 会静默返回），直到目标按钮渲染。
 */
async function waitForOption(page, text, maxTries = 12) {
  for (let i = 0; i < maxTries; i++) {
    const found = await page.evaluate((t) => {
      const f = window.__game.scene.getScene('farm');
      if (!f?.storyDialogue?.isOpen?.()) return 'closed';
      const has = [...document.querySelectorAll('button')].some((b) =>
        b.textContent && b.textContent.includes(t));
      if (has) return 'found';
      f.storyDialogue.advance();
      return 'advancing';
    }, text);
    if (found === 'found') return true;
    if (found === 'closed') return false;
    await sleep(200);
  }
  return false;
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1280, height: 720 },
    args: ['--no-sandbox'],
  });
  try {
    // ============ T1/T2：观星点坐等天黑 ============
    {
      const page = await setupFarm(browser);
      // 观星点应全天可见
      const vis = await page.evaluate(() => {
        const f = window.__game.scene.getScene('farm');
        return f?.stargazeSprites?.[0]?.visible ?? false;
      });
      check(`T1 主线完成后白天观星点可见（visible=${vis}）`, vis === true);

      // 传送玩家到观星点 (504,232)（setPosition 同步物理 body，防止被弹回）
      await page.evaluate(() => {
        const f = window.__game.scene.getScene('farm');
        f.player.setPosition(504, 232);
      });
      await sleep(400);
      await page.keyboard.press('e');
      await sleep(600);

      // 轮询 advance 直到"坐等天黑"选项渲染
      const optShown = await waitForOption(page, '坐等天黑');
      check(`T1 白天靠近观星点弹「坐等天黑」选项（shown=${optShown}）`, optShown === true);

      // 选择"坐等天黑"
      await clickOption(page, '坐等天黑');
      await sleep(2500);

      // 验证：时间跳到 20:00 + 观星夜开始（observatoryComplete=true + 观星夜对话打开）
      const after = await page.evaluate(() => {
        const f = window.__game.scene.getScene('farm');
        return {
          time: window.debug.getTimeStr(),
          obsComplete: window.debug.getObservatoryComplete(),
          dlgOpen: f?.storyDialogue?.isOpen?.(),
          endingPanel: !!f?.endingPanel,
        };
      });
      const timeOk = after.time.startsWith('20:');
      check(`T2 坐等天黑后时间 20:00（实际 ${after.time}）`, timeOk);
      check(`T2 观星夜已触发 observatoryComplete（实际 ${after.obsComplete}）`, after.obsComplete === true);
      check(`T2 观星夜主对话已打开（dlgOpen=${after.dlgOpen}）`, after.dlgOpen === true);
      await page.close();
    }

    // ============ T3/T4：睡觉选项 ============
    {
      const page = await setupFarm(browser);
      // 直接传送到 bedTiles 第一格（保证 onBed=true），不猜坐标。
      // 注意：farm 地图 tile 是 16×16，从 tilemap cache 取真实 tile 尺寸换算像素。
      await page.evaluate(() => {
        const f = window.__game.scene.getScene('farm');
        const T = window.__game.cache.tilemap.get('farm').data.tilewidth;
        const [c, r] = [...f.bedTiles][0].split(',').map(Number);
        f.player.setPosition((c + 0.5) * T, (r + 0.5) * T);
        console.log(`[probe] 已传送 → 床格(${c},${r}) tileSize=${T} pos=(${Math.round(f.player.x)},${Math.round(f.player.y)})`);
      });
      await sleep(400);
      // 确认传送后站位仍在床格（物理 bounds 640×400 内）
      await page.evaluate(() => {
        const f = window.__game.scene.getScene('farm');
        const pc = Math.floor(f.player.x / 16);
        const pr = Math.floor(f.player.y / 16);
        console.log(`[probe] 按E前 player=(${Math.round(f.player.x)},${Math.round(f.player.y)}) tile=(${pc},${pr}) onBed=${f.bedTiles.has(pc + ',' + pr)}`);
      });
      await page.keyboard.press('e');
      await sleep(600);

      // 轮询 advance 直到"休息到傍晚"选项渲染
      const optShown = await waitForOption(page, '休息到傍晚');
      check(`T3 白天睡觉弹「休息到傍晚」选项（shown=${optShown}）`, optShown === true);

      // 选择"休息到傍晚"（选项 2）
      await clickOption(page, '休息到傍晚');
      await sleep(1500);

      const timeAfter = await page.evaluate(() => window.debug.getTimeStr());
      check(`T4 休息到傍晚后时间 18:00（实际 ${timeAfter}）`, timeAfter.startsWith('18:'));
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });