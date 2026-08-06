/**
 * f7 + f5 验证探针：村长第一天「暂时有事 + 启动资源大礼包」，主线推迟第二天
 *
 * 验证目标：
 *   1. day 1 + 未接主线：与村长对话 → 播放「暂时有事」对话（含赠送启动物资台词）
 *   2. 对话结束后 questState 保持 not_started（不提前接主线）
 *   3. 大礼包只发一次：种子/工具/金币/木材/石头/钻石入账 + triggeredEvents['elder_starter_gift']=true
 *   4. day 1 再次对话 → 简短提醒（不重复长篇、不重复发礼物）
 *   5. day 2 对话 → 正常接主线（questState → accepted，播放 ELDER_QUEST_DIALOGUE）
 *
 * 前置：Vite dev server（默认 localhost:5173，可用 GAME_URL 覆盖）
 * 运行：node probe-elder-day1-gift.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
  ok ? pass++ : fail++;
}

async function sceneInfo(page) {
  return page.evaluate(() => ({
    scene: window.__game.scene.getScenes(true)[0]?.scene?.key ?? 'none',
    step: window.debug?.getStoryStep?.(),
  }));
}

async function dialogueText(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0];
    return s?.storyDialogue?.isOpen?.() ? (s.storyDialogue.textEl?.textContent ?? '') : '<closed>';
  });
}

/** 推进对话直到出现目标文本（打字机/逐行推进，最多 maxCalls 次） */
async function advanceUntil(page, substr, maxCalls = 40) {
  for (let i = 0; i < maxCalls; i++) {
    const t = await dialogueText(page);
    if (t.includes(substr)) return t;
    if (t === '<closed>') return '<closed>';
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) s.storyDialogue.advance();
    });
    await sleep(120);
  }
  return await dialogueText(page);
}

/** 跳过整段对话（lineCount 行） */
async function skipDialogue(page, lineCount) {
  const calls = lineCount * 2 + 1;
  for (let i = 0; i < calls; i++) {
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) s.storyDialogue.advance();
    });
    await sleep(60);
  }
  await sleep(500);
}

/** 直接切场景（停止当前场景再 start，避免黑屏风险，与 test-ch1-story 一致） */
async function gotoScene(page, key, spawn) {
  await page.evaluate(([k, sp]) => {
    const g = window.__game;
    const active = g.scene.getScenes(true)[0];
    if (active && active.scene.key !== k) {
      g.scene.stop(active.scene.key);
    }
    g.scene.start(k, sp ? { spawn: sp } : undefined);
  }, [key, spawn ?? null]);
  await sleep(2600);
}

async function teleport(page, sceneKey, x, y, facing = 'up') {
  await page.evaluate(([k, px, py, f]) => {
    const s = window.__game.scene.getScene(k);
    if (!s?.player) return;
    s.player.x = px;
    s.player.y = py;
    s.player.facing = f;
  }, [sceneKey, x, y, facing]);
  await sleep(150);
}

async function pressE(page) {
  await page.keyboard.press('KeyE');
  await sleep(400);
}

/** 从存档读取数据（对话回调完成后 save 已写入） */
async function readSave(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('return_star_save');
    if (!raw) return null;
    const d = JSON.parse(raw);
    return {
      coins: d.world?.coins ?? null,
      inventory: d.player?.inventory ?? {},
      triggered: d.gameState?.triggeredEvents ?? {},
    };
  });
}

async function run() {
  console.log('=== f7+f5 村长第一天「有事 + 大礼包」验证探针 ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // ---------- 准备：全新存档 → title → station ----------
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);

    let info = await sceneInfo(page);
    check('A1. 启动停靠标题画面', info.scene === 'title', `场景=${info.scene}`);

    await page.keyboard.press('Enter');
    await sleep(2500);
    info = await sceneInfo(page);
    check('A2. 进入车站（station）', info.scene === 'station', `场景=${info.scene}`);

    // 教程置为完成（等价玩完第一天）+ 时间调到上午 10 点（村长在镇上办公）
    await page.evaluate(() => {
      window.debug.setStoryStep('done');
      window.debug.setTime(10, 0);
    });

    // ---------- day 1：进小镇，第一次见村长 ----------
    await gotoScene(page, 'town', { x: 200, y: 300 });
    await skipDialogue(page, 5); // 小镇开场旁白 5 行

    const q0 = await page.evaluate(() => window.debug.getQuestState());
    check('B1. 对话前 questState = not_started', q0 === 'not_started', q0);

    // 靠近村长按 E（村长在 (216,168)）
    await teleport(page, 'town', 216, 184, 'up');
    await pressE(page);
    const busyLine5 = await advanceUntil(page, '抽不开身');
    check('B2. day1 村长「暂时有事」台词', busyLine5.includes('抽不开身'), (busyLine5 || '').substring(0, 40));
    const giftLine = await advanceUntil(page, '启动物资');
    check('B3. 台词提及赠送启动物资', giftLine.includes('启动物资'), (giftLine || '').substring(0, 40));
    await skipDialogue(page, 7); // ELDER_BUSY_DIALOGUE 7 行

    // 对话结束后：未接主线 + 大礼包已发放
    const after1 = await page.evaluate(() => ({
      quest: window.debug.getQuestState(),
      gift: window.debug.events.hasTriggered('elder_starter_gift'),
    }));
    check('B4. 对话后 questState 仍 not_started（主线推迟）', after1.quest === 'not_started', after1.quest);
    check('B5. elder_starter_gift 已触发', after1.gift === true, String(after1.gift));

    const save1 = await readSave(page);
    // 对话前存档尚未写入（save0.coins=undefined），故用绝对断言：初始金币 100 + 礼包 100 = 200
    check('B6. 金币 +100（100→200）', save1 && save1.coins === 200, `coins=${save1?.coins}`);
    check('B7. 种子入账（萝卜种子 10）', save1 && save1.inventory.radish_seed === 10, `radish_seed=${save1?.inventory?.radish_seed}`);
    check('B8. 工具入账（旧斧头 1）', save1 && save1.inventory.old_axe === 1, `old_axe=${save1?.inventory?.old_axe}`);
    check('B9. 木材/石头/钻石入账', save1 && save1.inventory.wood === 10 && save1.inventory.stone === 5 && save1.inventory.diamond === 1,
      `wood=${save1?.inventory?.wood} stone=${save1?.inventory?.stone} diamond=${save1?.inventory?.diamond}`);
    check('B10. 触发标记入档', save1 && save1.triggered.elder_starter_gift === true, JSON.stringify(save1?.triggered ?? {}));

    // ---------- day 1：再次对话 → 简短提醒，不重复发礼物 ----------
    await teleport(page, 'town', 216, 184, 'up');
    await pressE(page);
    const shortText = await advanceUntil(page, '这几天镇上忙着修缮');
    check('C1. 再次对话为简短提醒（无启动物资台词）', shortText.includes('这几天镇上忙着修缮') && !shortText.includes('启动物资'), (shortText || '').substring(0, 40));
    await skipDialogue(page, 1); // ELDER_BUSY_SHORT_DIALOGUE 1 行
    const save1b = await readSave(page);
    check('C2. 未重复发礼物（木材仍 10、金币未再变化）',
      save1b && save1b.inventory.wood === 10 && save1b.coins === save1.coins,
      `wood=${save1b?.inventory?.wood} coins=${save1b?.coins}（上次 ${save1?.coins}）`);

    // ---------- day 2：正常接主线 ----------
    await page.evaluate(() => {
      window.debug.nextDay();
      window.debug.setTime(10, 0); // 村长回镇上办公
    });
    await sleep(800);

    await teleport(page, 'town', 216, 184, 'up');
    await pressE(page);
    const questLine = await advanceUntil(page, '年轻时候就喜欢晚上坐在');
    check('D1. day2 村长播放主线委托台词', questLine.includes('年轻时候就喜欢晚上坐在'), (questLine || '').substring(0, 40));
    await skipDialogue(page, 11); // ELDER_QUEST_DIALOGUE 10 行（多按自动忽略）
    const q2 = await page.evaluate(() => window.debug.getQuestState());
    check('D2. 对话后 questState = accepted（主线开启）', q2 === 'accepted', q2);

    const save2 = await readSave(page);
    check('D3. day2 不再发大礼包（木头仍 10）', save2 && save2.inventory.wood === 10, `wood=${save2?.inventory?.wood}`);

    await page.close();
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
