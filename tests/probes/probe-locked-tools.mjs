// 试玩-09 功能未解锁提示探针（任务-试玩反馈批B B1）
// 覆盖 4 项：大门钥匙（无钥匙/有钥匙）/ 锄头 / 水壶 / 斧头
// 前置：dev server localhost:5173
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gotoScene(page, key, spawn) {
  await page.evaluate(([k, sp]) => {
    const g = window.__game;
    const active = g.scene.getScenes(true)[0];
    if (active && active.scene.key !== k) g.scene.stop(active.scene.key);
    g.scene.start(k, sp ? { spawn: sp } : undefined);
  }, [key, spawn ?? null]);
  await sleep(2400);
}

async function setStep(page, step) {
  await page.evaluate((s) => {
    window.debug?.setStoryStep?.(s);
  }, step);
  await sleep(300);
}

async function teleport(page, sceneKey, x, y) {
  await page.evaluate(([k, px, py]) => {
    const s = window.__game.scene.getScene(k);
    if (!s?.player) return;
    s.player.x = px;
    s.player.y = py;
  }, [sceneKey, x, y]);
  await sleep(250);
}

/** 读取指定场景的浮动对白文本（showDialogueText 产物） */
async function dialogueText(page, sceneKey) {
  return page.evaluate((k) => {
    const s = window.__game.scene.getScene(k);
    return s?.dialogueText?.text ?? null;
  }, sceneKey);
}

/** 调用场景私有交互方法（TS private 仅编译期约束，运行时可直接访问）；出错返回错误信息 */
async function callScene(page, sceneKey, fn) {
  return page.evaluate(([k, f]) => {
    const s = window.__game.scene.getScene(k);
    if (!s) return { error: 'scene not found' };
    try {
      // eslint-disable-next-line no-new-func
      const r = new Function('s', `return (${f})(s);`)(s);
      return { result: r };
    } catch (e) {
      return { error: String(e && e.message ? e.message : e) };
    }
  }, [sceneKey, fn]);
}

async function skipDialogue(page, lineCount) {
  const calls = lineCount * 2 + 1;
  for (let i = 0; i < calls; i++) {
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) s.storyDialogue.advance();
    });
    await sleep(60);
  }
  await sleep(400);
}

async function run() {
  console.log('=== 试玩-09 功能未解锁提示探针（B1）===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  let pass = 0, fail = 0;
  const check = (name, ok, extra = '') => {
    console.log(`${name} → ${ok ? '✅' : '❌'}${extra ? ' ' + extra : ''}`);
    ok ? pass++ : fail++;
  };
  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);

    // ── 1. 大门钥匙（无钥匙，station_move：门锁着、夏雅未出现，交互直入门锁分支）──
    // 注：不能用 xiya_talk——setupGateTutorial 会将其回退 arrive_manor，夏雅拦截交互
    await setStep(page, 'station_move');
    await gotoScene(page, 'gate');
    await teleport(page, 'gate', 240, 172); // 大门中心 (240,152) 正下方
    await callScene(page, 'gate', 's => s.tryInteract()');
    let txt = await dialogueText(page, 'gate');
    check('钥匙(无)：大门锁着提示', txt && txt.includes('大门锁着'), `→ "${txt}"`);

    // ── 2. 大门钥匙（有钥匙，get_key：走真实夏雅对话获得钥匙）──
    await setStep(page, 'arrive_manor');
    await gotoScene(page, 'gate');
    await teleport(page, 'gate', 248, 190); // 夏雅 (248,184) 旁
    await callScene(page, 'gate', 's => s.tryXiyaInteract()'); // 触发 XIYA_DIALOGUE
    await skipDialogue(page, 7); // XIYA_DIALOGUE 7 行 → 结束后获得钥匙 + get_key
    await teleport(page, 'gate', 240, 172);
    await callScene(page, 'gate', 's => s.tryInteract()');
    txt = await dialogueText(page, 'gate');
    check('钥匙(有)：引导使用背包钥匙', txt && txt.includes('打开背包选择庄园钥匙使用吧'), `→ "${txt}"`);

    // ── 3. 锄头（get_key：尚未获得锄头）──
    await setStep(page, 'get_key');
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    let r = await callScene(page, 'farm', 's => s.tryFarmInteractAt(20, 12)');
    txt = await dialogueText(page, 'farm');
    if (r?.error) console.log('  [callScene error]', r.error);
    check('锄头：还没有锄头提示', txt && txt.includes('还没有锄头'), `→ "${txt}"`);

    // ── 4. 水壶（走真实教程：开门得锄头 → 锄地×3 → 得种子 → 播种 → 浇水被拦）──
    await setStep(page, 'get_key');
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    await callScene(page, 'farm', 's => s.useManorKey()'); // 用钥匙开门 → 获得锄头 → clear_land
    await skipDialogue(page, 9); // GATE_OPENED_DIALOGUE 9 行（E-07 叠加）
    for (const col of [20, 21, 22]) {
      r = await callScene(page, 'farm', `s => s.tryFarmInteractAt(${col}, 12)`);
      if (r?.error) console.log(`  [callScene error till ${col}]`, r.error);
    }
    await skipDialogue(page, 3); // SOW_SEEDS_DIALOGUE 3 行
    await callScene(page, 'farm', 's => s.tryFarmInteractAt(20, 12)'); // 播种
    await callScene(page, 'farm', 's => s.tryFarmInteractAt(20, 12)'); // 浇水被拦
    txt = await dialogueText(page, 'farm');
    check('水壶：还没有水壶提示', txt && txt.includes('还没有水壶'), `→ "${txt}"`);

    // ── 5. 斧头（clear_land：尚未获得斧头，站到树上按交互）──
    await setStep(page, 'clear_land');
    await gotoScene(page, 'farm', { x: 400, y: 300 });
    await teleport(page, 'farm', 40, 56); // 树 (2,3) 中心
    await callScene(page, 'farm', 's => s.tryChopTree()');
    txt = await dialogueText(page, 'farm');
    check('斧头：还没有斧头提示', txt && txt.includes('还没有斧头'), `→ "${txt}"`);

    console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
    process.exit(fail > 0 ? 1 : 0);
  } finally {
    await browser.close();
  }
}
run().catch(err => { console.error('探针异常:', err); process.exit(1); });
