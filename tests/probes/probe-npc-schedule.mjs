/**
 * NPC 日程错峰重构探针（v0.5.4 阶段 1）
 *
 * 目标：验证 6 个 NPC 在 06/08/12/14/17/18/20 七个时间节点的分布符合预期。
 *
 * 预期分布表：
 *   时段        | 村长   | 商店   | 老张   | 小梅   | 阿风   | 少女
 *   06:30       | home   | home   | home   | home   | home   | forest
 *   08:30       | town   | town   | mine   | farm   | forest | home
 *   12:30       | town   | town   | mine   | farm   | forest | home
 *   14:30       | town   | town   | mine   | forest | town   | home
 *   17:30       | town   | town   | mine   | forest | town   | forest
 *   18:30       | home   | home   | town   | home   | home   | forest
 *   20:30       | home   | home   | home   | home   | home   | home
 *
 * 探针策略：
 *   1. 启动游戏 → 直接 scene.start('farm') 跳过标题和车站
 *   2. 每个时间点：setTime → 遍历 farm/town/forest/mine 四场景
 *      - 切到每个场景（触发 create + rebuildNPCs）
 *      - 读 npcList 获取该场景出现的 NPC
 *      - 汇总：出现在某场景 = 该 NPC 此刻在该场景；未出现在任何场景 = 'home'
 *   3. 对比预期分布
 *
 * 前置：dev server 在 localhost:5173；node tests/probes/probe-npc-schedule.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SCENES = ['farm', 'town', 'forest', 'mine'];

/** 6 个 NPC 的预期分布（key=时间点 hour，value=各 NPC 预期 location） */
const EXPECTED = {
  6:  { elder: 'home', shopkeeper: 'home', miner: 'home',   gardener: 'home',   adventurer: 'home',   mystery: 'forest' },
  8:  { elder: 'town', shopkeeper: 'town', miner: 'mine',   gardener: 'farm',   adventurer: 'forest', mystery: 'home' },
  12: { elder: 'town', shopkeeper: 'town', miner: 'mine',   gardener: 'farm',   adventurer: 'forest', mystery: 'home' },
  14: { elder: 'town', shopkeeper: 'town', miner: 'mine',   gardener: 'forest', adventurer: 'town',   mystery: 'home' },
  17: { elder: 'town', shopkeeper: 'town', miner: 'mine',   gardener: 'forest', adventurer: 'town',   mystery: 'forest' },
  18: { elder: 'home', shopkeeper: 'home', miner: 'town',   gardener: 'home',   adventurer: 'home',   mystery: 'forest' },
  20: { elder: 'home', shopkeeper: 'home', miner: 'home',   gardener: 'home',   adventurer: 'home',   mystery: 'home' },
};

const NPC_NAME = {
  elder: '村长', shopkeeper: '商店老板', miner: '矿工老张',
  gardener: '花匠小梅', adventurer: '阿风', mystery: '神秘少女',
};

/** 切到指定场景并读取该场景的 NPC 列表 */
async function switchSceneAndGetNpcs(page, sceneKey) {
  return page.evaluate((key) => {
    return new Promise((resolve) => {
      const game = window.__game;
      if (!game) return resolve({ __error: 'no game' });
      const target = game.scene.getScene(key);
      if (!target) return resolve({ __error: `no scene ${key}` });
      // 切换场景
      game.scene.stop('farm');
      game.scene.stop('town');
      game.scene.stop('forest');
      game.scene.stop('mine');
      game.scene.start(key);
      // 等待 create 完成（场景 ready 后才有 npcList）
      target.events.once('create', () => {
        const list = target.npcList || [];
        const ids = list.map(n => n.id);
        resolve({ ids });
      });
      // 兜底超时
      setTimeout(() => {
        const list = target.npcList || [];
        resolve({ ids: list.map(n => n.id) });
      }, 1500);
    });
  }, sceneKey);
}

/** 在指定时间点收集所有场景的 NPC 出现情况 */
async function collectNpcLocations(page, hour) {
  // setTime 已在调用前完成
  const locations = {};
  for (const key of SCENES) {
    const result = await switchSceneAndGetNpcs(page, key);
    if (result.__error) {
      console.log(`    [警告] 场景 ${key}: ${result.__error}`);
      continue;
    }
    for (const id of result.ids) {
      locations[id] = key;
    }
    await sleep(200);
  }
  // 未出现在任何场景的 NPC = home
  for (const id of Object.keys(NPC_NAME)) {
    if (!locations[id]) locations[id] = 'home';
  }
  return locations;
}

async function setTime(page, hour, minute) {
  await page.evaluate(([h, m]) => window.debug.setTime(h, m), [hour, minute]);
  await sleep(400);
}

let pass = 0, fail = 0;
const fails = [];

function check(timeKey, actual, expected) {
  const time = `${String(timeKey).padStart(2, '0')}:30`;
  console.log(`\n=== ${time} ===`);
  let allOk = true;
  for (const id of Object.keys(expected)) {
    const exp = expected[id];
    const act = actual[id] ?? '(未找到)';
    const ok = act === exp;
    const mark = ok ? '✓' : '✗';
    if (!ok) allOk = false;
    console.log(`  ${mark} ${NPC_NAME[id].padEnd(8)} 预期=${exp.padEnd(7)} 实际=${act}`);
  }
  if (allOk) { pass++; console.log(`  → 全部正确`); }
  else { fail++; fails.push(time); console.log(`  → 有不符合项`); }
}

(async () => {
  console.log('=== NPC 日程错峰探针启动 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('console', msg => {
    const t = msg.text();
    if (t.startsWith('[debug]')) console.log('  [game]', t);
  });
  page.on('pageerror', err => console.log('  [pageerror]', err.message));

  console.log('打开游戏页…');
  await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
  await sleep(1500);

  // 直接跳过标题和车站，进入 farm 场景
  console.log('跳过标题，直接进入 farm 场景…');
  await page.evaluate(() => {
    const game = window.__game;
    if (!game) return;
    // 标题场景正在运行，停掉它直接进 farm
    game.scene.stop('title');
    game.scene.start('farm');
  });
  await sleep(2000);

  const scene = await page.evaluate(() => window.__game?.scene?.getScenes(true)[0]?.scene?.key);
  console.log(`当前场景: ${scene}\n`);

  // 逐个时间点验证
  for (const hour of [6, 8, 12, 14, 17, 18, 20]) {
    console.log(`\n--- 设置时间 ${hour}:30 ---`);
    await setTime(page, hour, 30);
    const actual = await collectNpcLocations(page, hour);
    check(hour, actual, EXPECTED[hour]);
  }

  console.log('\n=== 探针结束 ===');
  console.log(`通过时间点: ${pass}/${pass + fail}`);
  if (fail > 0) {
    console.log(`失败时间点: ${fails.join(', ')}`);
  } else {
    console.log('✅ 所有时间点 NPC 分布符合预期！');
  }

  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => {
  console.error('探针异常:', e);
  process.exit(2);
});
