// 临时验证：E-05（教程期 HUD 目标）+ E-06（教程期首日任务池）——验证完即删
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  defaultViewport: { width: 1024, height: 768 },
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
page.setDefaultTimeout(20000);
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`✅ ${n}`); } else { fail++; console.log(`❌ ${n} ${d}`); } };

try {
  // 教程期存档（storyStep = sow_seeds，处于播种教程）
  await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.evaluate(() => {
    localStorage.setItem('return_star_save', JSON.stringify({
      version: '0.5', savedAt: 'E-05/E-06 临时验证', timestamp: Date.now(),
      player: { x: 200, y: 280, scene: 'farm', facing: 'down',
        inventory: { old_hoe: 1, old_watering_can: 1, radish_seed: 5 } },
      world: { day: 1, hour: 9, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
      farm: { tiles: [], crops: [], trees: [] },
      story: { storyStep: 'sow_seeds' },
    }));
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2500);
  await page.keyboard.press('Enter'); // 标题进入
  await sleep(2500);
  // 等待 farm 场景活跃
  for (let i = 0; i < 15; i++) {
    const active = await page.evaluate(() => window.__game?.scene?.getScenes(true).some(s => s.scene.key === 'farm') ?? false);
    if (active) break;
    await sleep(1000);
  }

  // E-05：HUD 目标应显示教程步骤（播种）而非「与村长对话」
  const hud = await page.evaluate(() => {
    const overlay = document.getElementById('hud-overlay');
    if (!overlay) return null;
    const kids = Array.from(overlay.children);
    const questEl = kids.find(el => (el.textContent || '').includes('任务'));
    return {
      text: questEl ? questEl.textContent : null,
      kids: kids.map(k => k.textContent?.slice(0, 30)),
      activeScene: window.__game?.scene?.getScenes(true).map(s => s.scene.key),
    };
  });
  console.log('HUD 诊断:', JSON.stringify(hud));
  check('E-05 HUD 教程期显示播种目标', hud?.text !== null && hud.text.includes('播种'), `实际=${hud?.text}`);

  // E-06：首日任务面板只含 播种/浇水 类，无 harvest/talk/collect
  const quests = await page.evaluate(() => {
    const panel = document.getElementById('daily-quest-panel');
    if (!panel) return null;
    const text = panel.textContent || '';
    return {
      text,
      hasHarvest: /收获|丰收/.test(text),
      hasTalk: /与村长对话|与商店老板对话|与矿工老张对话|与花匠小梅对话|与冒险家阿风对话/.test(text),
      hasCollect: /星之碎片/.test(text),
      hasPlantWater: /浇水|播种/.test(text),
    };
  });
  console.log('首日面板:', JSON.stringify(quests));
  if (!quests) { check('E-06 首日任务面板存在', false, 'panel 未找到'); }
  else {
    check('E-06 首日任务面板存在', true);
    check('E-06 无 harvest 类任务', !quests.hasHarvest, '含收获任务');
    check('E-06 无 talk 类任务', !quests.hasTalk, '含对话任务');
    check('E-06 无 collect 类任务', !quests.hasCollect, '含采集任务');
    check('E-06 含播种/浇水任务', quests.hasPlantWater, '无播种浇水');
  }

  // E-03：钱不够时点击购买按钮 → 出现"资金不足"提示
  // 商店在 farm (24,18) 格，像素 (392,296)。用 world→screen 直接点开（触屏判定 tap 摊位上）
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('farm');
    // 直接调用 shopPanel.open 更稳（探针级 hook 无副作用）
    s.shopPanel.open();
  });
  await sleep(300);
  const shopOpen = await page.evaluate(() => !!document.getElementById('shop-panel') && document.getElementById('shop-panel').style.display !== 'none');
  check('E-01 商店可打开', shopOpen);
  // 购买萝卜种子按钮（钱 100 够）→ 先验证正常购买路径不误伤；再验证钱不够：卖空再测？简化：直接点"买萝卜种子"确认 toast 是"已购买"（未破坏购买）
  await page.evaluate(() => {
    const panel = document.getElementById('shop-panel');
    const btn = panel.querySelector('[data-action="buy-radish-seed"]');
    btn.click();
  });
  await sleep(300);
  const buyToast = await page.evaluate(() => {
    const t = document.getElementById('shop-toast');
    return t && t.style.display !== 'none' ? t.textContent : null;
  });
  console.log('购买 toast:', JSON.stringify(buyToast));
  check('E-03 正常购买不受影响', buyToast !== null && buyToast.includes('已购买'), `实际=${buyToast}`);

  // E-03 钱不够：把金币清零后点购买 → 资金不足提示
  await page.evaluate(() => {
    const e = window.__game.scene.getScene('farm');
    // 清空金币：直接改存档态（Economy 模块级）
    import('/src/data/Economy.ts').then(m => {
      // 循环卖不现实，直接 spendCoins 到 0
      while (m.getCoins() > 0) { if (!m.spendCoins(1)) break; }
      window.__coinsAfterDrain = m.getCoins();
      e.shopPanel.close();
    });
  });
  await sleep(200);
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('farm');
    s.shopPanel.open();
  });
  await sleep(300);
  await page.evaluate(() => {
    const panel = document.getElementById('shop-panel');
    panel.querySelector('[data-action="buy-radish-seed"]').click();
  });
  await sleep(300);
  const poorToast = await page.evaluate(() => {
    const t = document.getElementById('shop-toast');
    return t && t.style.display !== 'none' ? t.textContent : null;
  });
  console.log('钱不够 toast:', JSON.stringify(poorToast));
  check('E-03 钱不够点击有解释', poorToast !== null && poorToast.includes('资金不足'), `实际=${poorToast}`);
} finally {
  await browser.close();
}
console.log(`\n=== E-05/E-06/E-03 验证：${pass} 通过 / ${fail} 失败 ===`);
process.exitCode = fail > 0 ? 1 : 0;
