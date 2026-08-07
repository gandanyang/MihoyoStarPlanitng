/**
 * T3.5 商店老板「镇子热闹了」（NPC 生活事件第 4 条）—— 运行时验证探针
 *
 * 验证（任务卡：docs/tasks/任务-T3.5-商店老板镇子热闹了.md）：
 *   1. 未卖出作物时与老板对话 → 不触发（正常商店流程）
 *   2. 卖出作物后（shopSoldOnce 置位）白天与老板对话 → 入口对白（asked 入档）
 *   3. 作物 <3：重复提示，不扣作物、不完成
 *   4. 作物 ≥3：聚合扣除 3、完成入档（done）、记忆卡出现
 *   5. 夜间不触发（hour>=18 直接走商店流程）
 *   6. 读档恢复：done 后不重复触发
 *   7. 全程无运行时错误
 *
 * 前置：dev server；node probe-t35-shop-event.mjs
 */

import puppeteer from 'puppeteer-core';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const T = 16;
// town 场景商店老板真实站位（NPCSystem.ts SPOTS.town.shopkeeper = 16T,10T）
// 注意不可用 (17T,10T)：与花圃旁小梅 (18T,10T) 等距，nearest 判定会漂移。
const SHOPKEEPER_SPOT = { x: 16 * T + 8, y: 10 * T + 8 };

const makeSave = (scene, x, y, opts = {}) => ({
  version: '0.5', savedAt: 't35-shop-probe', timestamp: Date.now(),
  player: { x, y, scene, facing: 'down', inventory: opts.inventory ?? {} },
  world: {
    day: 1, hour: opts.hour ?? 12, minute: 0, coins: 100, level: 1, xp: 0,
    stamina: 100, minedOres: [], questState: 'not_started',
  },
  farm: { tiles: [], crops: [], trees: [], restore: {} },
  // ch1TownIntroDone=true：跳过「首次进入小镇」开场对白（create 中 delayedCall 自动播放，
  // 会抢占 E 键交互），否则按 E 命中的是开场推进而非老板对话。
  story: { storyStep: 'done', ch1TownIntroDone: true },
  // sideGardenerPlumDone=true：避免小梅「小梅花」事件（锚点 17,9 距商店老板 16,10 仅 16px）抢走交互
  mapFlags: { sideGardenerPlumDone: true, ...(opts.mapFlags ?? {}) },
});

async function run() {
  console.log('=== T3.5 商店老板「镇子热闹了」运行时验证 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
    ok ? pass++ : fail++;
  };

  /** 写存档 + reload 进入 town（包裹 localStorage 屏蔽自动存档覆盖，参照 probe-resident-board-038） */
  const gotoTown = async (inventory, opts = {}) => {
    const save = makeSave('town', SHOPKEEPER_SPOT.x, SHOPKEEPER_SPOT.y, { inventory, ...opts });
    await page.evaluate((s) => {
      localStorage.setItem('return_star_save', JSON.stringify(s));
    }, save);
    await page.evaluate(() => {
      if (window.__probeBlockSaveInstalled) return;
      window.__probeBlockSaveInstalled = true;
      const orig = window.localStorage.setItem.bind(window.localStorage);
      window.localStorage.setItem = (k, v) => {
        if (k === 'return_star_save') return;
        return orig(k, v);
      };
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(3500);
    // 若停在标题则 Enter 进入；确保场景是 town
    const cur = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
    if (cur !== 'town') {
      await page.keyboard.press('Enter');
      await sleep(2500);
    }
    // 若第一章 intro 在播放（delayedCall 600ms 后开始），直接 skip 关掉，避免覆盖老板交互
    await sleep(1600);
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      if (s?.storyDialogue?.isOpen?.()) s.storyDialogue.skip?.() ?? s.storyDialogue.advance();
    });
    await sleep(400);
    // 诊断：读取游戏侧 flag 确认存档恢复生效
    const dbg = await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      const cur2 = window.__game.scene.getScenes(true)[0]?.scene?.key;
      return { cur: cur2, plumDone: s?.sideGardenerPlumDone, shopAsked: s?.sideShopCropAsked, shopDone: s?.sideShopCropDone };
    });
    console.log(`  [diag] cur=${dbg.cur} plumDone=${dbg.plumDone} shopAsked=${dbg.shopAsked} shopDone=${dbg.shopDone}`);
  };

  /** 靠近商店老板按 E，返回当前对话文本 */
  const talkShopkeeper = async () => {
    await page.evaluate(([sx, sy]) => {
      const s = window.__game.scene.getScene('town');
      const p = s.player;
      p.setPosition(sx, sy);
      // 同步 physics body：setPosition 只改 sprite，body.preUpdate 每帧会把 sprite
      // 拉回旧位置，导致 E 键 nearest 判定仍在出生点附近（命中别的 NPC）。
      p.body?.reset(sx, sy);
    }, [SHOPKEEPER_SPOT.x, SHOPKEEPER_SPOT.y]);
    await sleep(200);
    await page.keyboard.press('e');
    await sleep(500);
    return page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      const dlg = s?.storyDialogue;
      return dlg?.isOpen?.() ? (dlg.lines?.map((l) => l.text).join('|') ?? '') : '';
    });
  };

  const readSave = async () => page.evaluate(() => {
    const raw = localStorage.getItem('return_star_save');
    return raw ? JSON.parse(raw) : null;
  });

  const closeDialogue = async () => {
    await page.evaluate(async () => {
      const s = window.__game.scene.getScene('town');
      for (let i = 0; i < 8 && s?.storyDialogue?.isOpen?.(); i++) {
        s.storyDialogue.advance();
        await new Promise((r) => setTimeout(r, 150));
      }
    });
    await sleep(300);
  };

  try {
    // ---------- A. 未卖出作物：不触发（正常商店流程） ----------
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(800);
    await gotoTown({}, { hour: 12 });
    const a = await talkShopkeeper();
    check('A1 未卖出作物 → 不触发 T3.5（正常商店欢迎）', !a.includes('正想找你'), a.slice(0, 40));
    const aSave = await readSave();
    check('A2 未置位 sideShopCropAsked', !aSave?.mapFlags?.sideShopCropAsked);
    await closeDialogue();

    // ---------- B. 卖出作物后白天对话 → 入口对白（asked 入档） ----------
    await gotoTown({}, { hour: 12 });
    // 置位 shopSoldOnce（会话级：模拟卖出过作物；通过游戏内卖出真实触发在商店探针覆盖）
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      s.shopSoldOnce = true;
    });
    const b = await talkShopkeeper();
    check('B1 卖出后白天 → 入口对白（正想找你）', b.includes('正想找你'), b.slice(0, 40));
    const bSave = await readSave();
    check('B2 入口 asked 入档', bSave?.mapFlags?.sideShopCropAsked === true);
    await closeDialogue();

    // ---------- C. 作物 <3：重复提示，不扣不完成 ----------
    // makeSave 会整体重建 mapFlags，故显式带上 sideShopCropAsked（模拟已完成入口对白）
    await gotoTown({ radish: 2 }, { hour: 12, mapFlags: { sideShopCropAsked: true } });
    await page.evaluate(() => { window.__game.scene.getScene('town').shopSoldOnce = true; });
    const c = await talkShopkeeper();
    check('C1 作物不足 → 提示（篮子里还空着）', c.includes('篮子里还空着'), c.slice(0, 40));
    const cSave = await readSave();
    check('C2 未置位 done', !cSave?.mapFlags?.sideShopCropDone);
    const cInv = cSave?.player?.inventory ?? {};
    check('C3 作物未扣除', (cInv.radish ?? 0) === 2);
    await closeDialogue();

    // ---------- D. 作物 ≥3：聚合扣除、完成入档、记忆卡 ----------
    await gotoTown({ radish: 1, tomato: 2 }, { hour: 12, mapFlags: { sideShopCropAsked: true } });
    await page.evaluate(() => { window.__game.scene.getScene('town').shopSoldOnce = true; });
    const d = await talkShopkeeper();
    check('D1 交付成功 → 完成对白（这就对了）', d.includes('这就对了'), d.slice(0, 40));
    // 完成对白的 done/扣除发生在 buildShopSideDialogue（对话播放前）→ 游戏内存已更新；
    // save 落盘在闪回收回调链（被探针屏蔽 setItem 拦截），故读游戏内存断言而非 localStorage。
    const dMem = await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      return {
        done: s?.sideShopCropDone === true,
        radish: s?.player?.inventory?.radish ?? 0,
        tomato: s?.player?.inventory?.tomato ?? 0,
      };
    });
    check('D2 done 置位（游戏内存）', dMem.done === true);
    check('D3 聚合扣除 3（radish1+tomato2）', dMem.radish === 0 && dMem.tomato === 0);
    // 记忆卡闪回文本（MemoryFlashbacks 数据静态断言）
    const dFb = await page.evaluate(async () => {
      const m = await import('/src/data/MemoryFlashbacks.ts');
      return (m.SHOP_CROP_FLASHBACK ?? []).map((l) => l.text).join('|');
    });
    check('D4 记忆卡数据存在（好多年了/互相照应）', dFb.includes('好多年了') && dFb.includes('互相照应'));

    // ---------- E. 夜间不触发 ----------
    await gotoTown({ radish: 3 }, { hour: 20 });
    await page.evaluate(() => { window.__game.scene.getScene('town').shopSoldOnce = true; });
    const e = await talkShopkeeper();
    check('E1 夜间不触发 T3.5（正常商店流程）', !e.includes('正想找你'), e.slice(0, 40));
    await closeDialogue();

    // ---------- F. 读档恢复：done 后不重复触发 ----------
    await gotoTown({ radish: 3 }, { hour: 12, mapFlags: { sideShopCropAsked: true, sideShopCropDone: true } });
    await page.evaluate(() => { window.__game.scene.getScene('town').shopSoldOnce = true; });
    const f = await talkShopkeeper();
    check('F1 done 后不重复触发（正常商店流程）', !f.includes('正想找你'), f.slice(0, 40));
    await closeDialogue();

    check('Z1 无页面 JS 错误', errors.length === 0, errors.slice(0, 3).join('; '));
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
