/**
 * 一键出售功能探针：背包 + 商店「全部出售」
 *
 * 验证（任务卡验收项）：
 *  1. 背包一键出售：智能出售预览面板（FEATURE-039）确认后执行；金币正确累加；可售物品清空
 *  2. 商店一键出售：同上
 *  3. 不可售物品（工具/钥匙/机器人/钻石/种子）不受影响
 *  4. 无可售物品时：按钮置灰 + 点击提示
 *  5. 二次确认：点「全部出售」先弹 #smart-sell-panel 预览，点「确认出售」后才会真正卖出
 *  6. 存档结构：player 含可选 lockedItems（FEATURE-039，旧档无此字段视为空）
 *
 * 说明：两段之间用「回到标题 → 重新入档 → reload」重置状态，
 *      标题场景无活动玩家，beforeunload 自动存档守卫不覆盖新种子。
 * 前置：dev server 在 localhost:5173；node probe-sell-all.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL ?? 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// FEATURE-039 智能出售期望：100 + 萝卜3×15 + 番茄2×35 = 100 + 45 + 70 = 215
// （石头/木材为 reserve 保留资源，不自动卖；种子 forbidden 不可售；工具/钥匙/机器人/钻石不在 SELLABLE_ITEMS）
const EXPECTED_COINS_AFTER = 215;

async function writeSeed(page) {
  await page.evaluate(() => {
    localStorage.setItem('return_star_save', JSON.stringify({
      version: '0.5',
      savedAt: 'sell-all probe',
      timestamp: Date.now(),
      player: {
        x: 96, y: 160, scene: 'farm', facing: 'down',
        inventory: {
          radish: 3, tomato: 2, stone: 1, wood: 1,
          old_hoe: 1, manor_key: 1, auto_farmer_robot: 1, diamond: 2, radish_seed: 5,
        },
      },
      world: {
        day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [],
        questState: 'not_started', dailyQuest: null,
      },
      farm: { tiles: [], crops: [], trees: [] },
      story: { storyStep: 'done', ch1TownIntroDone: false },
    }));
  });
}

async function enterFarm(page) {
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2500);
  await page.keyboard.press('Enter');
  await sleep(3000);
}

async function sceneKey(page) {
  return page.evaluate(() => window.__game.scene.getScenes(true)[0]?.scene?.key ?? 'none');
}

/** 用 API 直接打开背包/商店（比键盘按键时序更稳），返回面板是否可查 */
async function openPanel(page, name) {
  return page.evaluate((n) => {
    const s = window.__game.scene.getScene('farm');
    if (n === 'backpack') { s?.backpackPanel?.open(); return !!document.getElementById('backpack-panel'); }
    s?.shopPanel?.open();
    return !!document.getElementById('shop-panel');
  }, name);
}

async function backpackState(page) {
  return page.evaluate(() => {
    const panel = document.getElementById('backpack-panel');
    const coinsEl = panel?.querySelector('#bp-coins');
    const gridEl = panel?.querySelector('#bp-grid');
    // 每个物品格第 2 个子 div = 物品名（避开「萝卜种子」与「萝卜」的名称包含误判）
    const cellNames = Array.from(gridEl?.querySelectorAll(':scope > div') ?? [])
      .map(cell => (cell.querySelector('div:nth-child(2)')?.textContent ?? '').trim())
      .filter(Boolean);
    return {
      coins: coinsEl?.textContent ?? '',
      gridText: gridEl?.textContent ?? '',
      cellNames,
    };
  });
}

async function shopState(page) {
  return page.evaluate(() => {
    const panel = document.getElementById('shop-panel');
    const coinsEl = panel?.querySelector('#shop-coins');
    const sellEl = panel?.querySelector('#shop-sell');
    // 出售栏按钮：可卖=金色(#c79a5b → rgb(199,154,91))，无可卖=禁用色(#6b573f)
    const sellButtons = Array.from(sellEl?.querySelectorAll('button') ?? []);
    const sellableButtons = sellButtons.filter(b => b.style.backgroundColor === 'rgb(199, 154, 91)').length;
    return {
      coins: coinsEl?.textContent ?? '',
      sellText: sellEl?.textContent ?? '',
      sellableButtons,
    };
  });
}

async function run() {
  console.log('=== 一键出售功能探针（背包 + 商店）===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  let pass = 0, fail = 0;
  const check = (name, ok, extra = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
    ok ? pass++ : fail++;
  };

  const waitFor = async (fn, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = await fn();
      if (v) return v;
      await sleep(250);
    }
    return null;
  };

  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);

    // ========== 背包一键出售 ==========
    console.log('\n[Part 1] 背包一键出售');
    await writeSeed(page);
    await enterFarm(page);
    const scene1 = await sceneKey(page);
    check('进入农场场景', scene1 === 'farm', `scene=${scene1}`);
    if (scene1 !== 'farm') throw new Error('未进入农场');

    await waitFor(() => openPanel(page, 'backpack'));
    await sleep(400);
    let bstate = await backpackState(page);
    console.log(`  背包初始: coins="${bstate.coins}"`);
    check('背包金币显示 100G', bstate.coins.includes('100G'), bstate.coins);
    check('背包含可售物品（萝卜/番茄/石头/木材）', bstate.gridText.includes('萝卜') && bstate.gridText.includes('番茄') && bstate.gridText.includes('石头') && bstate.gridText.includes('木材'));

    // 点「全部出售」→ 应先弹智能出售预览面板，金币/物品不变
    await page.evaluate(() => {
      const btn = document.querySelector('#backpack-panel [data-action="sell-all"]');
      if (btn) btn.click();
    });
    await sleep(400);
    const confirmOpen = await page.evaluate(() => {
      const p = document.getElementById('smart-sell-panel');
      return !!p && p.style.display !== 'none' && p.style.display !== '';
    });
    check('点击后弹出智能出售预览面板（未直接执行）', confirmOpen === true);
    bstate = await backpackState(page);
    check('确认前金币仍是 100G', bstate.coins.includes('100G'), bstate.coins);

    // 点击「确认出售」→ 真正卖出
    await page.evaluate(() => {
      const okBtn = document.querySelector('#smart-sell-panel [data-action="confirm"]');
      if (okBtn) okBtn.click();
    });
    await sleep(800);
    bstate = await backpackState(page);
    console.log(`  卖出后: coins="${bstate.coins}" cellNames=[${bstate.cellNames.join(',')}]`);
    check('金币累加至 215G（石头/木材 reserve 保留不卖）', bstate.coins.includes('215G'), bstate.coins);
    check('农作物已清空（萝卜/番茄卖出）', !bstate.cellNames.includes('萝卜') && !bstate.cellNames.includes('番茄'), bstate.cellNames.join(','));
    check('reserve 资源保留（石头/木材未自动卖）', bstate.cellNames.includes('石头') && bstate.cellNames.includes('木材'), bstate.cellNames.join(','));
    check('不可售物品保留（锄头/钥匙/机器人/钻石/种子）', bstate.cellNames.includes('旧锄头') && bstate.cellNames.includes('庄园钥匙') && bstate.cellNames.includes('自动农业机器人') && bstate.cellNames.includes('钻石') && bstate.cellNames.includes('萝卜种子'), bstate.cellNames.join(','));

    // 再次点「全部出售」→ 无可售 normal 物品（只剩 reserve）→ 预览面板显示"没有可出售的物品"，金币不变
    await page.evaluate(() => {
      const btn = document.querySelector('#backpack-panel [data-action="sell-all"]');
      if (btn) btn.click();
    });
    await sleep(400);
    const emptyPreviewShown = await page.evaluate(() => {
      const p = document.getElementById('smart-sell-panel');
      const coinsEl = p?.querySelector('#ss-coins');
      return !!p && p.style.display !== 'none' && p.style.display !== '' && (coinsEl?.textContent ?? '').includes('没有可出售的物品');
    });
    check('无可售 normal 物品时预览面板显示「没有可出售的物品」', emptyPreviewShown === true);
    await page.evaluate(() => {
      const cancelBtn = document.querySelector('#smart-sell-panel [data-action="cancel"]');
      if (cancelBtn) cancelBtn.click();
    });
    await sleep(200);
    const coinAfterEmpty = await backpackState(page);
    check('无可售时金币不变（仍 215G）', coinAfterEmpty.coins.includes('215G'), coinAfterEmpty.coins);

    // ========== 商店一键出售（停止农场场景 → 无活动玩家 → beforeunload 不会覆盖新种子）==========
    console.log('\n[Part 2] 商店一键出售');
    await page.evaluate(() => {
      window.__game.scene.stop('farm');
      window.__game.scene.start('title');
    });
    await sleep(1500);
    await writeSeed(page);
    await enterFarm(page);
    const scene2 = await sceneKey(page);
    check('再次进入农场', scene2 === 'farm', `scene=${scene2}`);
    if (scene2 !== 'farm') throw new Error('未进入农场');

    await waitFor(() => openPanel(page, 'shop'));
    await sleep(400);
    let sstate = await shopState(page);
    console.log(`  商店初始: coins="${sstate.coins}" sellableButtons=${sstate.sellableButtons}`);
    check('商店金币显示 100G', sstate.coins.replace(/\s/g, '').includes('100G'), sstate.coins);
    check('商店出售栏有 4 个可卖按钮（萝卜/番茄/石头/木材）', sstate.sellableButtons === 4, `可卖按钮=${sstate.sellableButtons}`);

    await page.evaluate(() => {
      const btn = document.querySelector('#shop-panel [data-action="sell-all"]');
      if (btn) btn.click();
    });
    await sleep(400);
    const shopConfirmOpen = await page.evaluate(() => {
      const p = document.getElementById('smart-sell-panel');
      return !!p && p.style.display !== 'none' && p.style.display !== '';
    });
    check('商店点击后弹出智能出售预览面板', shopConfirmOpen === true);

    await page.evaluate(() => {
      const okBtn = document.querySelector('#smart-sell-panel [data-action="confirm"]');
      if (okBtn) okBtn.click();
    });
    await sleep(800);
    sstate = await shopState(page);
    console.log(`  商店卖出后: coins="${sstate.coins}" sellableButtons=${sstate.sellableButtons}`);
    check('商店卖出后金币 215G（石头/木材 reserve 保留）', sstate.coins.replace(/\s/g, '').includes('215G'), sstate.coins);
    check('商店出售栏剩 2 个 reserve 可手动卖按钮（石头/木材）', sstate.sellableButtons === 2, `可卖按钮=${sstate.sellableButtons}`);

    // ========== 存档不新增字段（结构校验）==========
    console.log('\n[Part 3] 存档结构');
    const saveKeys = await page.evaluate(() => {
      const raw = localStorage.getItem('return_star_save');
      if (!raw) return null;
      const d = JSON.parse(raw);
      return {
        playerKeys: Object.keys(d.player ?? {}),
        worldKeys: Object.keys(d.world ?? {}),
      };
    });
    console.log(`  player 字段: ${saveKeys?.playerKeys?.join(',')}`);
    console.log(`  world 字段: ${saveKeys?.worldKeys?.join(',')}`);
    check('存档 player 仅位置/背包/锁定（含 FEATURE-039 lockedItems）', Array.isArray(saveKeys?.playerKeys) && !saveKeys.playerKeys.some(k => !['x', 'y', 'scene', 'facing', 'inventory', 'lockedItems'].includes(k)), saveKeys?.playerKeys?.join(','));
    check('存档 world 无新增字段', Array.isArray(saveKeys?.worldKeys) && !saveKeys.worldKeys.some(k => !['day', 'hour', 'minute', 'coins', 'level', 'xp', 'stamina', 'minedOres', 'questState', 'dailyQuest'].includes(k)), saveKeys?.worldKeys?.join(','));

  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error('探针异常:', err); process.exit(1); });
