/**
 * v0.6 制作人拍板验收：B-1（晚间任务过滤 + 已接任务友好提示）+ 归星岛复苏报告
 *
 * 验收标准：
 *   B-1：
 *     1. 存档注入"已接未完成 talk_* 任务" + 晚间 20:00 → QuestPanel 显示"已回家休息"提示
 *     2. 同一存档白天 09:00 → 不显示回家提示
 *     3. 晚间 refreshDailyQuests 初始化不生成新 talk_* 任务（无保留任务时全池无 talk）
 *  结算播报：
 *     4. generateIslandReport() 返回 4 段（土地/居民/农业/未来）
 *     5. 无花园恢复 → 土地=萌芽；markRestored('garden') 后 → 新生
 *     6. 无作物/无等级 → 农业=播种之日
 *     7. 无运行时错误
 *
 * 前置：dev server；node tests/probes/probe-b1-island-report.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== B-1 任务时段过滤 + 归星岛复苏报告 验证 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
    ok ? pass++ : fail++;
  };

  const bootFarm = async (saveObj, hour) => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate((obj) => {
      localStorage.setItem('return_star_save', JSON.stringify(obj));
    }, saveObj);
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(400);
    await page.evaluate(() => window.debug?.setStoryStep('done'));
    await sleep(400);
    await page.evaluate((h) => window.debug.setTime(h, 0), hour);
    await sleep(300);
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('farm');
    });
    await sleep(1800);
  };

  const openQuestPanel = async () => {
    await page.evaluate(() => {
      const g = window.__game;
      const s = g.scene.getScene('farm');
      s.questPanel?.open();
    });
    await sleep(400);
    const res = await page.evaluate(() => {
      const el = document.querySelector('#quest-panel');
      if (!el || el.style.display === 'none') return { open: false, html: '' };
      return { open: true, html: el.querySelector('#qp-body')?.innerHTML ?? '' };
    });
    // 关闭
    await page.evaluate(() => {
      document.querySelector('#quest-panel')?.querySelector('[data-action="close"]')?.click();
    });
    await sleep(200);
    return res;
  };

  // 含一个未完成 talk 任务的每日任务存档（talk_elder，晚间 NPC 回家）
  const mkSave = (hour, day = 1) => ({
    version: '0.5', savedAt: 'B1报告探针', timestamp: Date.now(),
    player: { x: 240, y: 96, scene: 'farm', facing: 'down', inventory: {} },
    world: {
      day, hour, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100,
      minedOres: [], questState: 'not_started',
      dailyQuest: {
        currentDay: day,
        quests: [
          { id: 'talk_elder', progress: 0, completed: false, claimed: false },
        ],
      },
    },
    farm: { tiles: [], crops: [], trees: [] },
    story: { storyStep: 'done' },
  });

  try {
    // ============ 1. 晚间 20:00 已接 talk 任务 → 回家提示 ============
    console.log('--- 1. 晚间已接 talk_* 任务 → 友好提示 ---');
    await bootFarm(mkSave(20, 1), 20);
    let panel = await openQuestPanel();
    check('1a. 晚间面板打开', panel.open === true);
    check('1b. 显示"已经回家休息"提示', panel.html.includes('已经回家休息'), panel.html.includes('与村长对话') ? 'talk行存在' : 'talk行?');

    // ============ 2. 白天 09:00 同一任务 → 无回家提示 ============
    console.log('\n--- 2. 白天已接 talk_* 任务 → 无提示（NPC 在） ---');
    await bootFarm(mkSave(9, 1), 9);
    panel = await openQuestPanel();
    check('2a. 白天面板打开', panel.open === true);
    check('2b. 白天不显示"回家休息"提示', !panel.html.includes('已经回家休息'));

    // ============ 3. 晚间初始化（无保留任务）→ 不生成新 talk ============
    console.log('\n--- 3. 晚间 refreshDailyQuests 不生成新 talk_* ---');
    // 无 dailyQuest 存档 + 晚间首次进入 → 刷新后任务池无 talk
    const saveNoQuest = { ...mkSave(20, 1) };
    delete saveNoQuest.world.dailyQuest;
    await bootFarm(saveNoQuest, 20);
    panel = await openQuestPanel();
    const htmlNoQuest = panel.html;
    // QuestPanel 渲染 q.desc（非 title），必须匹配 desc 文案，否则恒假绿
    const hasTalk = /与村长对话|与商店老板对话|与矿工老张对话|与花匠小梅对话|与阿风对话/.test(htmlNoQuest);
    check('3a. 晚间首次刷新任务面板打开', panel.open === true);
    check('3b. 晚间不生成新 talk_* 任务', !hasTalk, hasTalk ? '面板含 talk' : '无 talk');

    // ============ 4. 归星岛复苏报告 ============
    console.log('\n--- 4. 归星岛复苏报告（纯计算聚合） ---');
    const report = await page.evaluate(async () => {
      const mod = await import('/src/systems/IslandReportSystem.ts');
      return mod.generateIslandReport();
    });
    check('4a. 报告返回 4 段', report.sections.length === 4, `实际=${report.sections.length}`);
    const titles = report.sections.map(s => s.title).join('/');
    check('4b. 段标题=土地/居民/农业/未来', titles === '土地/居民/农业/未来', titles);
    check('4c. 无花园恢复 → 土地=萌芽', report.sections[0].verdict === '萌芽', `实际=${report.sections[0].verdict}`);
    check('4d. 无作物/无等级 → 农业=播种之日', report.sections[2].verdict === '播种之日', `实际=${report.sections[2].verdict}`);
    check('4e. 未来=未完待续', report.sections[3].verdict === '未完待续', `实际=${report.sections[3].verdict}`);

    // 花园恢复 → 新生（单独 reload 干净环境）
    await page.evaluate(async () => {
      const restoreMod = await import('/src/data/FarmRestore.ts');
      restoreMod.markRestored('garden');
      const mod = await import('/src/systems/IslandReportSystem.ts');
      window.__reportGarden = mod.generateIslandReport().sections[0].verdict;
    });
    const gardenVerdict = await page.evaluate(() => window.__reportGarden);
    check('4f. 花园恢复 → 土地=新生', gardenVerdict === '新生', `实际=${gardenVerdict}`);

    // ============ 5. 无运行时错误 ============
    const realErrors = errors.filter(e => !e.includes('favicon') && !e.startsWith('console: Failed to load resource'));
    check('5. 全程无运行时错误', realErrors.length === 0, realErrors.join(' | ') || '');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
})().catch(err => { console.error('探针异常:', err); process.exit(1); });
