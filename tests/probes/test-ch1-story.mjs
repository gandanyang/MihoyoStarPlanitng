/**
 * E2E 测试 — 第一章主线 + 观星夜收尾 + 存档恢复（v0.5.2 P0）
 *
 * 由 probe-stargaze.mjs 升级：探针只证明"功能存在"，本测试要求"坏了必须阻止提交"。
 *
 * 验收范围：
 *   序章：title → station → 辞退邮件对白出现（序章对白修订）
 *   第一章：镇长接任务 → 森林采集（程序员能力展示对话）→ 自动采集 → 交付
 *   观星：触发条件（主线完成 + 夜晚 + 观星点可见）→ 三选项 → 分支 → 结算
 *   存档：save() 写入 storyStep = observatory_complete → reload → apply() 恢复且不重复触发
 *
 * 说明：完整教程路径（gate 锄地/播种/浇水/睡觉）由 test-tutorial.mjs 覆盖，
 *       本测试用 debug.setStoryStep('done') 跳过教程，聚焦第一章 + 观星 + 存档链路。
 *
 * 前置条件：Vite dev server 运行在 localhost:5173
 * 运行：node test-ch1-story.mjs
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, 'test-screenshots');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';

mkdirSync(SCREENSHOT_DIR, { recursive: true });

let pass = 0;
let fail = 0;

function ok(step, passed, detail = '') {
  if (passed) {
    pass++;
    console.log(`  ✅ ${step}${detail ? ' - ' + detail : ''}`);
  } else {
    fail++;
    console.log(`  ❌ ${step}${detail ? ' - ' + detail : ''}`);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function screenshot(page, name) {
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`) });
}

async function sceneInfo(page) {
  return page.evaluate(() => ({
    scene: window.__game.scene.getScenes(true)[0]?.scene?.key ?? 'none',
    step: window.debug?.getStoryStep?.(),
  }));
}

/** 每行 2 次（打字机 + 下一行）+ 1 次关闭；选项行 advance 会被拦截 */
async function skipDialogue(page, lineCount) {
  const calls = lineCount * 2 + 1;
  for (let i = 0; i < calls; i++) {
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) s.storyDialogue.advance();
    });
    await sleep(50);
  }
  await sleep(400);
}

async function waitAndSkipDialogue(page, lineCount) {
  await sleep(700);
  await skipDialogue(page, lineCount);
}

/** 精确推进 n 行（每行 2 次），用于中间检查 */
async function advanceN(page, n) {
  for (let i = 0; i < n * 2; i++) {
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) s.storyDialogue.advance();
    });
    await sleep(50);
  }
  await sleep(300);
}

async function dialogueText(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0];
    return s?.storyDialogue?.isOpen?.() ? (s.storyDialogue.textEl?.textContent ?? '') : '<closed>';
  });
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
  await sleep(300);
}

/**
 * 推进记忆闪回 overlay 直到关闭（碎片采集后播放，9bf2ad8 加入）。
 * 每轮 pointerdown 一次（typing 中=显示全文，否则=关闭）。返回是否成功关闭。
 */
async function advanceFlashback(page, maxRounds = 30) {
  for (let i = 0; i < maxRounds; i++) {
    const state = await page.evaluate(() => {
      const el = document.getElementById('memory-flashback-overlay');
      if (!el) return 'absent';
      const visible = el.style.display !== 'none';
      if (!visible) return 'hidden';
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return 'clicked';
    });
    if (state === 'hidden' || state === 'absent') { await sleep(1400); return true; }
    await sleep(200);
  }
  return false;
}

/** 切场景：SceneManager.start 不会自动停当前场景，需先 stop（与黑屏风险同源） */
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

async function run() {
  console.log('=== 第一章主线 + 观星夜 + 存档恢复 E2E（v0.5.2 P0）===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  try {
    // ==================== 序章：title → station → 辞退邮件 ====================
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);

    let info = await sceneInfo(page);
    ok('1. 启动停靠标题画面', info.scene === 'title', `场景=${info.scene}`);

    await page.keyboard.press('Enter');
    await sleep(2500);
    info = await sceneInfo(page);
    ok('2. 进入车站（station）', info.scene === 'station', `场景=${info.scene}`);

    // 车站开场：音量提示（点击）→ 手机通知两页（点击×2）→ 车站对白（开场动画时长不定）
    let phoneChecked = false;
    let phoneText = '';
    let stationOpen = false;
    for (let i = 0; i < 80 && (!stationOpen || !phoneChecked); i++) {
      const st = await page.evaluate(() => {
        // 音量提示（zIndex 650）挡在手机通知前，需先点击
        const prompt = [...document.querySelectorAll('div')].find(d =>
          d.style?.zIndex === '650' && d.style?.opacity !== '0' && d.textContent?.includes('建议打开声音游玩'));
        if (prompt) { prompt.click(); return { text: '', clicked: true }; }
        // 手机通知（zIndex 600，两页需点击两次：翻页 → 关闭）
        const phone = [...document.querySelectorAll('div')].find(d =>
          d.style?.zIndex === '600' && d.style?.display !== 'none' && d.style?.opacity !== '0' && d.textContent?.includes('人事通知'));
        if (!phone) return { text: '', clicked: false };
        const text = phone.textContent ?? '';
        phone.click();
        return { text, clicked: true };
      });
      if (st.text && !phoneChecked) { phoneChecked = true; phoneText = st.text; }
      stationOpen = await page.evaluate(() => {
        const s = window.__game.scene.getScenes(true)[0];
        return s?.storyDialogue?.isOpen?.() ?? false;
      });
      if (!stationOpen) await sleep(250);
    }
    ok('3a. 手机通知公文文案', phoneChecked && phoneText.includes('岗位职责将进行重新分配'), phoneText.substring(0, 40));
    ok('3b. 车站对白已打开', stationOpen);
    await advanceN(page, 1);
    let stationText = '';
    for (let i = 0; i < 15 && !stationText.includes('智能生态部门'); i++) {
      stationText = await dialogueText(page);
      if (!stationText.includes('智能生态部门')) await sleep(200);
    }
    ok('3c. 辞退邮件对白出现', stationText.includes('智能生态部门'), stationText.substring(0, 40));
    await skipDialogue(page, 8); // 跳过剩余车站对白（9 行 - 已推进 1 行）

    // 教程完整路径由 test-tutorial.mjs 覆盖，此处直接置为 done
    await page.evaluate(() => {
      window.debug.setStoryStep('done');
      window.debug.setTime(10, 0);
    });

    // ==================== 第一章：镇长接任务 ====================
    await gotoScene(page, 'town', { x: 200, y: 300 });
    await waitAndSkipDialogue(page, 5); // 小镇开场 5 行

    await teleport(page, 'town', 216, 184, 'up'); // 村长 (216,168)
    await pressE(page);
    await sleep(700);
    const elderText = await dialogueText(page);
    ok('4. 镇长委托对话（接受任务）', elderText.includes('你就是小林吧'), elderText.substring(0, 40));
    await skipDialogue(page, 11); // ELDER_QUEST_DIALOGUE 10 行（多按自动忽略）

    // ==================== 第一章：森林采集 ====================
    await gotoScene(page, 'forest', { x: 328, y: 200 });
    await teleport(page, 'forest', 328, 184, 'up'); // 碎片 (328,168)
    await pressE(page);
    await sleep(700);
    await advanceN(page, 5); // 推进 5 行，停在"它在等待一个条件。没有回应，是因为条件还没满足。"
    await sleep(900); // 等待打字机播完
    const forestText = await dialogueText(page);
    ok('5. 森林采集：程序员能力展示对话', forestText.includes('它在等待一个条件'), forestText.substring(0, 40));
    await skipDialogue(page, 4); // 剩余 3 行 + 关闭 → 自动采集 + 里程碑存档

    // 采集后播放童年记忆闪回 overlay（9bf2ad8）：推进直到关闭，否则 collectShard 回调不触发
    const flashbackClosed = await advanceFlashback(page);
    ok('5b. 记忆闪回推进并关闭', flashbackClosed);
    await sleep(1500); // 等 collectShard + 视觉清理回调链

    const afterCollect = await page.evaluate(() => {
      const s = window.__game.scene.getScene('forest');
      const raw = localStorage.getItem('return_star_save');
      const saveData = raw ? JSON.parse(raw) : null;
      return { shardGone: s?.shardSprite === null, questInSave: saveData?.world?.questState ?? null };
    });
    ok('6. 采集后碎片消失', afterCollect.shardGone);
    ok('7. 采集后里程碑存档（questState=collected）', afterCollect.questInSave === 'collected', afterCollect.questInSave ?? 'null');

    // ==================== 第一章：交付 ====================
    await gotoScene(page, 'town', { x: 200, y: 300 });
    await teleport(page, 'town', 216, 184, 'up');
    // 调试：检查 elder NPC 是否存在
    const elderDebug = await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      if (!s) return 'no_scene';
      const npcList = s.npcList ?? [];
      return JSON.stringify(npcList.map(n => ({ id: n.id, x: n.sprite?.x, y: n.sprite?.y })));
    });
    console.log('[DEBUG] town NPCs:', elderDebug);
    // 调试：检查 in-memory quest state
    const memQuest = await page.evaluate(() => {
      // 尝试获取 questState（可能通过 window.debug 暴露）
      return window.debug?.getQuestState?.() ?? 'no_access';
    });
    console.log('[DEBUG] in-memory questState:', memQuest);
    // 调试：检查 player 位置
    const playerPos = await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      if (!s?.player) return 'no_player';
      return `(${s.player.x},${s.player.y})`;
    });
    console.log('[DEBUG] player position:', playerPos);
    // 调试：检查 scene 是否 active
    const activeCheck = await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      if (!s) return 'no_scene';
      try { return `active=${s.sys.isActive()}`; } catch (e) { return `error=${e.message}`; }
    });
    console.log('[DEBUG] scene active:', activeCheck);
    // 调试：检查 update 是否运行（通过帧计数器）
    await pressE(page);
    // 调试：检查 pressE 后的 in-memory quest state
    const afterPressE = await page.evaluate(() => window.debug.getQuestState?.() ?? 'no_access');
    console.log('[DEBUG] after pressE questState:', afterPressE);
    await waitAndSkipDialogue(page, 10); // 交付 10 行（村长爷爷观星引导） → completed + 里程碑存档
    const afterDeliver = await page.evaluate(() => {
      const raw = localStorage.getItem('return_star_save');
      return raw ? JSON.parse(raw).world.questState : null;
    });
    ok('8. 交付后里程碑存档（questState=completed）', afterDeliver === 'completed', afterDeliver ?? 'null');

    // ==================== 观星：触发条件 ====================
    await page.evaluate(() => window.debug.setTime(21, 0));
    await gotoScene(page, 'farm', { x: 480, y: 300 });
    const stargazeVisible = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return !!(s?.stargazeMark?.visible);
    });
    ok('9. 观星点可见（主线完成 + 夜晚 21:00）', stargazeVisible);

    await teleport(page, 'farm', 504, 240, 'up'); // 观星点 (504,232)
    await pressE(page);
    // 观星夜对话在 camera.pan(2s) 完成后才播放，先等镜头到位
    await sleep(3200);
    const endOpen = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return s?.storyDialogue?.isOpen?.() ?? false;
    });
    ok('10. 观星夜对话打开', endOpen);

    // 夏雅立绘（§8.5 方案 A；2026-08-05 资产替换 xiya.png → xiya_ai_avatar.png；2026-08-06 升级 v2）
    await advanceN(page, 1);
    let portraitSrc = '';
    for (let i = 0; i < 10 && !portraitSrc.includes('xiya_ai_avatar_v2.png'); i++) {
      portraitSrc = await page.evaluate(() => {
        const s = window.__game.scene.getScene('farm');
        const img = s?.storyDialogue?.portraitEl?.querySelector('img');
        return img ? img.getAttribute('src') : '';
      });
      if (!portraitSrc.includes('xiya_ai_avatar_v2.png')) await sleep(200);
    }
    ok('11. 夏雅立绘头像显示', portraitSrc.includes('xiya_ai_avatar_v2.png'), portraitSrc || '<无立绘>');

    await skipDialogue(page, 16); // 推进到选项行（DEMO_ENDING 18 行，选项行前 17 行需 34 次 advance；已推进 1 行，还需 33 次=skipDialogue(16)）

    const options = await page.evaluate(() =>
      [...document.querySelectorAll('button')].map(b => b.textContent?.trim()).filter(t => /^\d\./.test(t ?? ''))
    );
    ok('12. 三选项渲染', options.length === 3, JSON.stringify(options));

    // 选择 B：我想先弄清楚爷爷到底在这里经历了什么
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('我想先弄清楚'));
      btn?.click();
    });
    // 等待打字机效果播完（35ms/字，27 字 ≈ 945ms）
    await sleep(1500);
    const branchText = await dialogueText(page);
    ok('13. 分支 B 独白', branchText.includes('比一封信更多'), branchText.substring(0, 40));

    // 分支 → FINALE → 结算面板 + 存档
    // 行数不定：unknown 分支 4 行 + FINALE 5 行；原硬编码 skip(1)+skip(5) 会停在 FINALE 中途
    // （结算面板/存档永不触发）。改为跳过对白后轮询等晨曦过渡(2s)+镜头回拉(1s)动画链结束。
    await skipDialogue(page, 4); // unknown 分支 4 行 → FINALE
    await skipDialogue(page, 5); // FINALE 5 行 → 晨曦过渡 + 结算
    let panelOpen = false;
    for (let i = 0; i < 40 && !panelOpen; i++) {
      await sleep(250);
      panelOpen = await page.evaluate(() => {
        const el = document.getElementById('ending-panel');
        return !!el && el.style.display === 'flex';
      });
    }
    ok('14. 结算面板打开', panelOpen, panelOpen ? 'flex' : 'false');

    info = await sceneInfo(page);
    ok('15. storyStep = observatory_complete', info.step === 'observatory_complete', `步骤=${info.step}`);
    // 存档在面板打开时写入（动画链 onComplete），读取前先轮询等存档就绪
    let saved = null;
    for (let i = 0; i < 20; i++) {
      saved = await page.evaluate(() => {
        try {
          const raw = localStorage.getItem('return_star_save');
          return raw ? JSON.parse(raw) : null;
        } catch { return null; }
      });
      if (saved?.story?.storyStep === 'observatory_complete') break;
      await sleep(250);
    }
    ok('16. 存档含 observatory_complete', saved?.story?.storyStep === 'observatory_complete', saved?.story?.storyStep ?? 'null');
    ok('17. 存档无 demoEndingDone 字段', saved?.story?.demoEndingDone === undefined);
    await screenshot(page, 'ch1-ending-panel');

    // ==================== 存档恢复：reload → Enter → apply ====================
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);
    info = await sceneInfo(page);
    ok('18a. reload 后回到标题', info.scene === 'title', `场景=${info.scene}`);
    await page.keyboard.press('Enter');
    await sleep(3500);
    info = await sceneInfo(page);
    ok('18b. 车站触发存档恢复 → 农场', info.scene === 'farm', `场景=${info.scene}, 步骤=${info.step}`);
    ok('19. reload 后 storyStep 保持 observatory_complete', info.step === 'observatory_complete', `步骤=${info.step}`);

    const noRetrigger = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return {
        stargazeHidden: !s?.stargazeMark?.visible,
        dialogueClosed: !(s?.storyDialogue?.isOpen?.()),
        panelClosed: (document.getElementById('ending-panel')?.style.display ?? 'none') === 'none',
      };
    });
    ok('20. 观星不重复触发（观星点隐藏）', noRetrigger.stargazeHidden);
    ok('21. 对话与结算面板均未重开', noRetrigger.dialogueClosed && noRetrigger.panelClosed);

    // ==================== 汇总 ====================
    console.log(`\n========== 结果: ✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('E2E 异常:', err);
  process.exit(1);
});
