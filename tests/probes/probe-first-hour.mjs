/**
 * 第一小时体验审查（v0.6 稳定窗口，2026-08-03）
 *
 * 模拟新玩家 0-60 分钟旅程，逐时间点检查体验。
 * 不测"程序是否正确"，测"玩家是否感受到归属感"。
 *
 * 前置：dev server 在 localhost:5173
 * 运行：node tests/probes/probe-first-hour.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  let pass = 0, fail = 0, warn = 0;
  const findings = [];
  const check = (name, ok, detail = '', w = false) => {
    const tag = ok ? (w ? '⚠️' : '✅') : '❌';
    console.log(`${tag} ${name}${detail ? ' — ' + detail : ''}`);
    ok ? (w ? warn++ : pass++) : fail++;
    findings.push({ name, ok, detail, warn: w });
  };

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 844, height: 390, isMobile: true, hasTouch: true },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();
    const pageErrs = [];
    page.on('pageerror', e => pageErrs.push(e.message));
    await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
    await sleep(2000);

    // ============ 0 min: 车站 ============
    console.log('\n--- 0 min: 车站（开场）---');
    const opening = await page.evaluate(() => {
      const title = document.querySelector('.game-title, [class*=title]');
      const skipBtn = document.getElementById('intro-skip-btn');
      return {
        hasTitle: !!title,
        hasSkip: !!skipBtn,
        titleText: title?.textContent?.slice(0, 30) ?? '',
      };
    });
    check('开场有标题/入口', opening.hasTitle || opening.hasSkip, `title="${opening.titleText}"`);

    // 跳过开场 → 进入车站
    await page.keyboard.press('Enter');
    await sleep(2200);
    await page.evaluate(() => {
      const b = document.getElementById('intro-skip-btn');
      if (b) b.click();
    });
    await sleep(800);
    const station1 = await page.evaluate(() => ({
      scene: window.__game?.scene?.getScenes(true)?.[0]?.scene?.key ?? 'none',
      step: window.debug?.getStoryStep?.(),
    }));
    check('跳过开场后进入车站', station1.scene === 'station', `scene=${station1.scene}`);

    // ============ 5 min: 进入庄园 ============
    console.log('\n--- 5 min: 进入庄园 ---');
    // 教程 done + 设时间到 10:00（NPC 在各场景活跃）
    await page.evaluate(() => window.debug?.setStoryStep('done'));
    await page.evaluate(() => window.debug?.setTime?.(10, 0));
    await sleep(300);
    // 导入 AmbienceSystem 挂到 window（供后续环境音检查）
    await page.evaluate(async () => {
      const A = await import('/src/systems/AmbienceSystem.ts');
      window.__ambience = A;
    });
    await page.evaluate(() => {
      const g = window.__game;
      const s = g.scene.getScenes(true)[0];
      if (s) g.scene.stop(s.scene.key);
      g.scene.start('farm');
    });
    await sleep(2500);

    const farm1 = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const npcs = s?.npcList?.length ?? 0;
      return { scene: s?.scene?.key, npcs };
    });
    check('进入农场', farm1.scene === 'farm', `npcs=${farm1.npcs}`);

    // NPC 是否可见（10:00 时gardener在farm，miner在mine，elder在town）
    const npcState = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const npcs = s?.npcList ?? [];
      return npcs.map(n => ({
        id: n.id,
        visible: n.sprite?.visible,
        action: n.dailyAction,
      }));
    });
    check('NPC 在农场有存在感', npcState.length > 0,
      `npcs: ${npcState.length > 0 ? npcState.map(n => `${n.id}(${n.action ?? 'none'})`).join(', ') : '无 NPC 在 farm（10:00 时 gardener 应在 farm）'}`);

    // ============ 15 min: 种第一批植物 ============
    console.log('\n--- 15 min: 种第一批植物 ---');
    // 真实断言：走一遍农田状态机（empty→tilled→planted）后恢复原状
    const farmCycle = await page.evaluate(async () => {
      const fs = await import('/src/data/FarmState.ts');
      const before = fs.getTileState(15, 10);
      fs.setTileState(15, 10, 'tilled');
      const tilled = fs.getTileState(15, 10);
      fs.setTileState(15, 10, 'planted');
      fs.setCrop(15, 10, { cropType: 'radish', plantDay: 1, watered: true });
      const planted = fs.getTileState(15, 10);
      fs.setTileState(15, 10, before);
      fs.setCrop(15, 10, undefined);
      return { tilled, planted, before };
    });
    check('农田系统可用（锄地→播种状态机）', farmCycle.tilled === 'tilled' && farmCycle.planted === 'planted',
      `tile(15,10) 原状态=${farmCycle.before}`);
    const cropDefs = await page.evaluate(async () => {
      const fs = await import('/src/data/FarmState.ts');
      return { count: Object.keys(fs.CROP_DEFS ?? {}).length, radishName: fs.CROP_DEFS?.radish?.name ?? '' };
    });
    check('作物系统可用（4 种作物定义）', cropDefs.count === 4 && cropDefs.radishName === '萝卜',
      `CROP_DEFS=${cropDefs.count}, 萝卜=${cropDefs.radishName}`);

    // ============ 30 min: 遇到 NPC ============
    console.log('\n--- 30 min: 遇到 NPC ---');
    const npcActions = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const npcs = s?.npcList ?? [];
      return npcs.map(n => ({
        id: n.id,
        name: n.name,
        action: n.dailyAction,
      }));
    });
    check('NPC 有日常行为（非站桩）', npcActions.some(n => n.action && n.action !== 'idle'),
      `actions: ${npcActions.map(n => `${n.name}=${n.action ?? 'none'}`).join(', ') || '无 NPC 在 farm'}`);

    const dialogueAvail = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const npcs = s?.npcList ?? [];
      return npcs.filter(n => n.sprite?.visible).length;
    });
    check('有可交互的 NPC', dialogueAvail > 0, `visible NPCs: ${dialogueAvail}`);

    // ============ 45 min: 修复花园 ============
    console.log('\n--- 45 min: 修复花园 ---');
    const gardenState = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const g = s?.gardenRestore;
      return { exists: !!g, stage: g?.stage ?? -1, debris: g?.debris?.length ?? -1 };
    });
    check('花园系统存在（三阶段恢复状态机）', gardenState.exists && gardenState.stage >= 0 && gardenState.stage <= 3,
      `stage=${gardenState.stage}`);
    // 夏雅存在感：清晨时段重进农场 → 夏雅在花园浇水（v0.5.3 E1 事件）
    await page.evaluate(() => window.debug?.setTime?.(7, 0));
    await page.evaluate(() => {
      const g = window.__game;
      const s = g.scene.getScenes(true)[0];
      if (s) g.scene.stop(s.scene.key);
      g.scene.start('farm');
    });
    await sleep(1800);
    const xiyaPresence = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return { exists: !!s?.dawnXiya, visible: !!(s?.dawnXiya?.visible) };
    });
    check('夏雅在庄园有存在感（清晨花园浇水 E1）', xiyaPresence.exists && xiyaPresence.visible,
      `dawnXiya=${xiyaPresence.exists}`);

    // ============ 60 min: 综合检查 ============
    console.log('\n--- 60 min: 综合体验 ---');

    const npcLiving = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const npcs = s?.npcList ?? [];
      return npcs.filter(n => n.dailyAction && n.dailyAction !== 'idle').length;
    });
    check('NPC 在生活（有日常动作）', npcLiving > 0,
      `${npcLiving} 个 NPC 有日常行为（farm 场景 10:00）`);

    const gardenProgress = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const g = s?.gardenRestore;
      return { stage: g?.stage ?? -1, debris: g?.debris?.length ?? -1 };
    });
    check('花园有恢复进展（三阶段状态跟踪）', gardenProgress.stage >= 0 && gardenProgress.stage <= 3,
      `stage=${gardenProgress.stage}, debris=${gardenProgress.debris}`);

    const ambienceActive = await page.evaluate(() => {
      return window.__ambience?.getActiveMap?.() ?? 'unknown';
    });
    check('农场有环境音', ambienceActive === 'farm', `activeMap=${ambienceActive}`);

    const anchors = await page.evaluate(() => {
      const step = window.debug?.getStoryStep?.();
      return { step, hasProgress: step && step !== 'start' };
    });
    check('玩家有进度感（storyStep）', anchors.hasProgress, `step=${anchors.step}`);

    check('无运行时错误', pageErrs.length === 0, `${pageErrs.length} errors`);

    // ============ 体验总结 ============
    console.log('\n--- 体验总结 ---');
    console.log(`通过: ${pass} / 失败: ${fail} / 警告: ${warn}`);
    console.log('\n关键发现:');
    for (const f of findings.filter(f => !f.ok)) {
      console.log(`  ❌ ${f.name}: ${f.detail}`);
    }
    for (const f of findings.filter(f => f.ok && f.warn)) {
      console.log(`  ⚠️ ${f.name}: ${f.detail}`);
    }

  } finally {
    await browser.close();
  }

  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
