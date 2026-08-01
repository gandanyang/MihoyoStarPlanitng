/**
 * 完整流程 E2E（v0.4: title → station → gate → farm 教程 → 地图环线 → 存档/读档）
 * 前置: Trae dev server 运行在 localhost:5173
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function result(step, passed, detail = '') {
  const icon = passed ? '✅' : '❌';
  results.push(icon + ' ' + step + (detail ? ' - ' + detail : ''));
  console.log(results[results.length - 1]);
}

async function waitFor(page, fn, timeoutMs = 8000, interval = 120) {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(fn);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(interval);
  }
}

const sceneKey = () => `window.__game.scene.getScenes(true).map(s=>s.scene.key).join(',')`;

async function info(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScenes(true).find((x) => x.player);
    return {
      running: window.__game.scene.getScenes(true).map((x) => x.scene.key).join(','),
      scene: s?.scene?.key ?? null,
      x: s?.player ? Math.round(s.player.x) : null,
      y: s?.player ? Math.round(s.player.y) : null,
      step: window.debug?.getStoryStep?.(),
    };
  });
}

async function skipDlg(page, lineCount) {
  const t0 = Date.now();
  // 等对话打开
  await waitFor(page, `!!window.__game.scene.getScenes(true).find(x=>x.storyDialogue)?.storyDialogue?.isOpen?.()`, 6000);
  for (let i = 0; i < lineCount * 2 + 1; i++) {
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true).find((x) => x.storyDialogue);
      if (s?.storyDialogue?.isOpen()) s.storyDialogue.advance();
    });
    await sleep(45);
  }
  await sleep(250);
}

async function movePlayer(page, x, y, facing = 'up') {
  await page.evaluate(([px, py, f]) => {
    const s = window.__game.scene.getScenes(true).find((x) => x.player);
    if (!s) return;
    s.player.x = px; s.player.y = py; s.player.facing = f; s.player.setVelocity(0, 0);
  }, [x, y, facing]);
  await sleep(120);
}

async function pressE(page) { await page.keyboard.press('KeyE'); await sleep(200); }

async function main() {
  console.log('=== 完整流程 E2E ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('  [err]', m.text().substring(0, 150));
    if (m.text().includes('[Exit]')) console.log('  [Exit]', m.text().substring(0, 130));
  });

  try {
    // ===== 1. 加载 title =====
    console.log('--- 1. 加载 title ---');
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    const title = await waitFor(page, sceneKey, 6000);
    result('1. 启动到 title', title === 'title', `running=${title}`);

    // ===== 2. Enter → station =====
    console.log('--- 2. title → station ---');
    await page.keyboard.press('Enter');
    const inStation = await waitFor(page, `window.__game.scene.getScenes(true).map(s=>s.scene.key).join(',') === 'station'`, 6000);
    result('2. 进入 station', !!inStation);

    // ===== 3. 车站开场：等通知 → 点掉 → 等对话 → 跳过 =====
    console.log('--- 3. 车站开场 ---');
    const phoneClicked = await waitFor(page, `(()=>{const ds=[...document.querySelectorAll('div')];const d=ds.find(x=>(x.textContent||'').includes('智能化系统接替'));if(d){d.click();return true;}return false;})()`, 15000, 400);
    result('3a. 点击手机通知', !!phoneClicked);
    await skipDlg(page, 10);
    const inf3 = await info(page);
    result('3b. 车站对话完成', inf3.step === 'station_move', JSON.stringify(inf3));

    // ===== 4. 走到车站出口 → gate =====
    console.log('--- 4. 车站 → gate ---');
    await movePlayer(page, 1000, 460, 'right');
    const t4 = Date.now();
    let gotGate = null;
    while (Date.now() - t4 < 8000) {
      gotGate = await page.evaluate(`window.__game.scene.getScenes(true).map(s=>s.scene.key).join(',')`);
      const dbg = await page.evaluate(() => {
        const s = window.__game.scene.getScenes(true).find((x) => x.player);
        return s ? { x: Math.round(s.player.x), canMove: s.canMove, exit: s.exitTriggered } : null;
      });
      console.log(`  +${Date.now() - t4}ms running=${gotGate} ${JSON.stringify(dbg)}`);
      if (gotGate === 'gate') break;
      await sleep(300);
    }
    await sleep(600);
    const inf4 = await info(page);
    result('4. 进入 gate', gotGate === 'gate' && inf4.step === 'arrive_manor', JSON.stringify(inf4));

    // ===== 5. gate: 夏雅对话 =====
    console.log('--- 5. gate: 夏雅对话 ---');
    await movePlayer(page, 248, 210, 'up');
    await pressE(page);
    await skipDlg(page, 9);
    const inf5 = await info(page);
    result('5. 得庄园钥匙', inf5.step === 'get_key', JSON.stringify(inf5));

    // ===== 6. 使用钥匙开门 =====
    console.log('--- 6. 使用钥匙 ---');
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true).find((x) => x.player);
      if (s?.backpackPanel) s.backpackPanel.open();
    });
    await sleep(300);
    const used = await waitFor(page, `(()=>{const b=document.querySelector('button[data-action="use-key"]');if(b){b.click();return true;}return false;})()`, 3000);
    await sleep(300);
    await skipDlg(page, 7);
    const inf6 = await info(page);
    result('6. 开门', !!used && inf6.step === 'clear_land', `used=${used}, ${JSON.stringify(inf6)}`);

    // ===== 7. gate 顶出口 → farm =====
    console.log('--- 7. gate → farm ---');
    await movePlayer(page, 240, 16, 'up');
    const gotFarm = await waitFor(page, sceneKey + " === 'farm'", 8000);
    await sleep(500);
    const inf7 = await info(page);
    result('7. gate落地farm', !!gotFarm && inf7.scene === 'farm', JSON.stringify(inf7));
    result('7b. 落地位置安全', inf7.x === 240 && inf7.y === 96, `x=${inf7.x}, y=${inf7.y}`);

    // ===== 8. 农场教程：锄3 → 种3 → 浇3 =====
    console.log('--- 8. 农场教程 ---');
    for (let i = 0; i < 3; i++) { await movePlayer(page, (13 + i) * 16 + 8, 10 * 16 + 20, 'up'); await pressE(page); await sleep(250); }
    await skipDlg(page, 7);
    const inf8a = await info(page);
    result('8a. 锄地→播种', inf8a.step === 'sow_seeds', `step=${inf8a.step}`);

    for (let i = 0; i < 3; i++) { await movePlayer(page, (13 + i) * 16 + 8, 10 * 16 + 20, 'up'); await pressE(page); await sleep(250); }
    await skipDlg(page, 4);
    const inf8b = await info(page);
    result('8b. 播种→浇水', inf8b.step === 'water_crops', `step=${inf8b.step}`);

    for (let i = 0; i < 3; i++) { await movePlayer(page, (13 + i) * 16 + 8, 10 * 16 + 20, 'up'); await pressE(page); await sleep(250); }
    await skipDlg(page, 7);
    const inf8c = await info(page);
    result('8c. 浇水→晚间', inf8c.step === 'evening_talk', `step=${inf8c.step}`);

    // ===== 9. 睡觉 → 教程完成 =====
    console.log('--- 9. 睡觉 ---');
    await movePlayer(page, 3 * 16 + 8, 14 * 16, 'up');
    await pressE(page);
    await sleep(1500);
    const inf9 = await info(page);
    result('9. 教程完成', inf9.step === 'done', JSON.stringify(inf9));

    // ===== 10. 地图环线 =====
    console.log('--- 10. 地图环线 ---');
    await movePlayer(page, 620, 160, 'right');
    result('10a. farm→town', (await waitFor(page, sceneKey + " === 'town'", 6000)) === 'town');
    await movePlayer(page, 8, 160, 'left');
    result('10b. town→farm', (await waitFor(page, sceneKey + " === 'farm'", 6000)) === 'farm');
    await movePlayer(page, 240, 20, 'up');
    result('10c. farm→forest', (await waitFor(page, sceneKey + " === 'forest'", 6000)) === 'forest');
    await movePlayer(page, 460, 160, 'right');
    result('10d. forest→mine', (await waitFor(page, sceneKey + " === 'mine'", 6000)) === 'mine');
    await movePlayer(page, 240, 315, 'down');
    result('10e. mine→town', (await waitFor(page, sceneKey + " === 'town'", 6000)) === 'town');

    // ===== 11. 存档/读档 =====
    console.log('--- 11. 存档/读档 ---');
    const inf11 = await info(page);
    result('11a. 当前在 town', inf11.scene === 'town', JSON.stringify(inf11));
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.keyboard.press('Enter');
    const resume = await waitFor(page, `window.__game.scene.getScenes(true).find(x=>x.player)?.scene?.key`, 8000);
    result('11b. 读档回到 town', resume === 'town', `scene=${resume}`);
    const inf11b = await info(page);
    console.log('   读档后:', JSON.stringify(inf11b));

    // ===== 汇总 =====
    console.log('\n========== 结果 ==========');
    const fail = results.filter((r) => r.startsWith('❌'));
    for (const r of results) console.log(r);
    console.log(`\n${fail.length === 0 ? '🎉 全部通过 (' + results.length + ')' : '⚠️ 失败 ' + fail.length + ' 项'}`);
  } catch (e) {
    console.error('❌ 异常:', e.message);
    await page.screenshot({ path: 'test-screenshots/error-full-flow.png' });
  } finally {
    await browser.close();
    console.log('浏览器已关闭');
  }
}

main().catch(console.error);
