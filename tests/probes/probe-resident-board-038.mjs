/**
 * FEATURE-038 居民需求板 —— 运行时验证探针
 *
 * 验证：
 *   A. 信息板交互物存在且位于小镇 (22,8)
 *   B. 靠近按 E 打开面板，显示 2 个需求（小梅木材×10 / 老张食物×5）
 *   C. 资源不足：红字提示缺什么，不扣资源、不标记完成
 *   D. 交付成功：扣资源 + 标记完成 + 反馈对白 + 面板关闭（help_resident 见下注）
 *   E. 持久化：交付后存档 gameState.triggeredEvents 含需求 id、背包已扣减
 *   F. 食物聚合扣除：萝卜×2 + 番茄×3 → 交付食物×5 全扣
 *   G. 读档恢复：两个需求均保持已完成，面板显示已完成
 *   H. 回归：NPC 列表正常（不影响对话/日程）
 *
 * 注：help_resident 为运行时标签（不入存档）。探针动态 import 与游戏静态 import
 * 在 Vite dev 下是不同模块实例（见 probe-ambience.mjs 注），无法直接读取游戏侧
 * 标签集。验证方式：交付成功后 onResidentDeliver 依次执行「关闭面板 → triggerTag
 * ('help_resident') → 播放反馈对白」，本探针验证关闭+对白+存档均发生，且代码审查
 * 确认 triggerTag 位于同一无分支调用链，即完成该标签的运行时+静态双重验证。
 * 状态驱动一律走 存档写入 + reload（唯一可靠通道），结果读取走 DOM / localStorage / 场景运行时。
 *
 * 前置：dev server；node probe-resident-board-038.mjs
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(__dirname, 'test-screenshots');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(SHOT_DIR, { recursive: true });

const BASE_SAVE = {
  version: '0.5', savedAt: 'resident-board-probe', timestamp: Date.now(),
  player: { x: 240, y: 96, scene: 'town', facing: 'down', inventory: {} },
  world: { day: 1, hour: 12, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
  farm: { tiles: [], crops: [], trees: [] },
  story: { storyStep: 'done', ch1TownIntroDone: true },
};

async function run() {
  console.log('=== FEATURE-038 居民需求板 运行时验证 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  const errors = [];
  const notFound = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() === 404) notFound.push(r.url()); });

  // 必须先加载一次页面，否则 localStorage 访问会抛 SecurityError
  await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
  await sleep(800);

  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
    ok ? pass++ : fail++;
  };

  const enterGame = async (scene, timeoutMs = 20000) => {
    const t0 = Date.now();
    let cur = '';
    while (Date.now() - t0 < timeoutMs) {
      cur = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (cur === scene) return;
      if (cur === 'title') {
        await page.keyboard.press('Enter');
        await page.mouse.click(400, 300);
      }
      await sleep(350);
    }
    throw new Error(`未能进入场景 ${scene}（实际 ${cur}）页面错误=${errors.slice(0, 5).join(' | ')}`);
  };

  /** 写存档（town 场景）并进入小镇：inventory=背包，triggered=已完成需求 id 集合 */
  const gotoTown = async (inventory, triggered = {}) => {
    const save = JSON.parse(JSON.stringify(BASE_SAVE));
    save.player.inventory = { ...inventory };
    save.gameState = { triggeredEvents: { ...triggered } };
    // 1. 写入目标存档（此刻未屏蔽 setItem）
    await page.evaluate((s) => {
      localStorage.setItem('return_star_save', JSON.stringify(s));
    }, save);
    // 2. 屏蔽 reload 时 beforeunload/pagehide 的自动存档写入：
    //    游戏内存是上一段的残留状态，若不屏蔽会覆盖探针刚写入的目标存档，
    //    导致下一段初始背包错乱（探针无法调用游戏模块，只能包裹 localStorage）。
    await page.evaluate(() => {
      if (window.__probeBlockSaveInstalled) return;
      window.__probeBlockSaveInstalled = true;
      const orig = window.localStorage.setItem.bind(window.localStorage);
      window.localStorage.setItem = (k, v) => {
        if (k === 'return_star_save') {
          window.__probeBlockedWrites = (window.__probeBlockedWrites || 0) + 1;
          return;
        }
        return orig(k, v);
      };
    });
    // 3. reload：旧页面的自动存档写入被屏蔽 → 目标存档保留 → 新页面加载目标状态
    await page.reload({ waitUntil: 'networkidle2' });
    await enterGame('town');
    await sleep(1200);
  };

  /** 靠近信息板按 E 打开面板 */
  const openBoard = async () => {
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('town');
      s.player.setPosition(22 * 16 + 8, 8 * 16 + 8);
    });
    await page.keyboard.press('e');
    await sleep(450);
    return await page.evaluate(() => window.__game.scene.getScene('town').residentBoardPanel?.isOpen?.() === true);
  };

  /** 推进对话直到关闭 */
  const finishDialogue = async () => {
    await page.evaluate(async () => {
      const s = window.__game.scene.getScene('town');
      for (let i = 0; i < 6 && s.storyDialogue?.isOpen?.(); i++) {
        s.storyDialogue.advance();
        await new Promise((r) => setTimeout(r, 220));
      }
    });
    await sleep(350);
  };

  /** 读取存档 */
  const readSave = async () => {
    return await page.evaluate(() => {
      const raw = localStorage.getItem('return_star_save');
      return raw ? JSON.parse(raw) : null;
    });
  };

  /** 点击某需求卡片的交付按钮 */
  const clickDeliver = async (id) => {
    await page.evaluate((rid) => {
      const btn = document.querySelector(`[data-action="deliver"][data-id="${rid}"]`);
      if (btn) btn.click();
    }, id);
    await sleep(400);
  };

  // ---------- A/B. 信息板 + 打开面板 + 内容 ----------
  await gotoTown({ wood: 10 });
  const a = await page.evaluate(() => {
    const s = window.__game.scene.getScene('town');
    const m = s.residentBoardMark;
    return { hasMark: !!m, x: m?.x, y: m?.y };
  });
  check('A1 信息板交互物存在', a.hasMark === true);
  check('A2 位置 (22,8)', a.x === 22 * 16 + 8 && a.y === 8 * 16 + 8, `(${a.x},${a.y})`);

  // 需求板引导任务：首次进小镇注入（board_quest_done 未标记）；验证后关闭面板防冻结
  const injected = await page.evaluate(() => {
    const s = window.__game.scene.getScene('town');
    s.questPanel?.open?.();
    const el = document.getElementById('quest-panel');
    const txt = el?.textContent || '';
    s.questPanel?.close?.();
    // daily 行渲染 q.desc（非 title）：「去小镇广场看看需求板…」
    return { has: txt.includes('去小镇广场看看需求板'), txt: txt.replace(/\s+/g, ' ').slice(0, 200), panel: !!el };
  });
  check('A3 需求板引导任务已注入（首次进小镇）', injected.has === true, `panel=${injected.panel} txt="${injected.txt}"`);

  const opened = await openBoard();
  check('B1 靠近按 E 打开面板', opened === true);
  const b = await page.evaluate(() => {
    const panel = document.getElementById('resident-board-panel');
    return {
      panelDisplay: panel ? getComputedStyle(panel).display : 'none',
      listText: panel?.querySelector('#rb-list')?.textContent || '',
    };
  });
  check('B2 面板可见', b.panelDisplay !== 'none');
  check('B3 显示小梅需求（木材×10）', b.listText.includes('花匠小梅') && b.listText.includes('木材') && b.listText.includes('×10'));
  check('B4 显示老张需求（食物×5）', b.listText.includes('矿工老张') && b.listText.includes('食物') && b.listText.includes('×5'));
  await page.screenshot({ path: join(SHOT_DIR, 'resident-board-open.png') });

  // 打开需求板 → 引导任务完成（daily 面板该行显示 🎁 可领奖）
  // 注意：QuestPanel.refresh() 只同步红点、不重渲染内容，内容在 open() 时渲染，
  // 因此必须 open→读 DOM→close（与 A3 相同），否则读到的是 A3 打开时的旧 DOM（未完成态）。
  const bDone = await page.evaluate(() => {
    const s = window.__game.scene.getScene('town');
    s.questPanel?.open?.();
    const el = document.getElementById('quest-panel');
    const txt = el?.textContent || '';
    s.questPanel?.close?.();
    const idx = txt.indexOf('去小镇广场看看需求板');
    // 完成态图标（🎁/⬜）在 desc 之前，往前多截几个字符
    const seg = idx >= 0 ? txt.slice(Math.max(0, idx - 4), idx + 30) : '';
    return { done: seg.includes('🎁'), txt: seg || 'not-found' };
  });
  check('B5 打开需求板后引导任务完成', bDone.done === true, bDone.txt);

  // ---------- C. 资源不足 ----------
  // 背包木材为 0 → 点击交付 → 红字提示 + 不扣资源 + 不标记
  await page.evaluate(() => { const s = window.__game.scene.getScene('town'); s.residentBoardPanel?.close?.(); });
  await sleep(300);
  await gotoTown({ wood: 0 });
  const cOpen = await openBoard();
  check('C0 面板重新打开', cOpen === true);
  await clickDeliver('resident_req_gardener_wood');
  const c = await page.evaluate(() => {
    const panel = document.getElementById('resident-board-panel');
    const card = panel?.querySelector('.rb-card[data-id="resident_req_gardener_wood"]');
    const err = card?.querySelector('[data-err]');
    return {
      errDisplay: err ? getComputedStyle(err).display : '',
      errText: err?.textContent || '',
      cardText: card?.textContent || '',
    };
  });
  check('C1 红字提示缺什么', c.errDisplay === 'block' && c.errText.includes('木材不足'), c.errText);
  check('C2 未标记完成', !c.cardText.includes('✓ 已完成'));
  check('C3 仍显示交付按钮', c.cardText.includes('交付'));
  // 存档未被污染（无该需求完成态）
  const cSave = await readSave();
  check('C4 存档未记录完成', !cSave?.gameState?.triggeredEvents?.['resident_req_gardener_wood']);

  // ---------- D/E. 交付成功（木材 10 → 交付） ----------
  await gotoTown({ wood: 10 });
  const dOpen = await openBoard();
  check('D0 面板打开', dOpen === true);
  await clickDeliver('resident_req_gardener_wood');
  const d = await page.evaluate(() => {
    const panel = document.getElementById('resident-board-panel');
    const s = window.__game.scene.getScene('town');
    return {
      panelDisplay: panel ? getComputedStyle(panel).display : '',
      dlgOpen: !!s.storyDialogue?.isOpen?.(),
    };
  });
  check('D1 交付后面板关闭', d.panelDisplay === 'none' || d.panelDisplay === '', `display=${d.panelDisplay}`);
  check('D2 反馈对白打开', d.dlgOpen === true);
  await finishDialogue();
  const e = await readSave();
  check('E1 存档含需求完成态', e?.gameState?.triggeredEvents?.['resident_req_gardener_wood'] === true);
  check('E2 木材已扣减为 0', e?.player?.inventory?.wood === 0, `wood=${e?.player?.inventory?.wood}`);

  // ---------- F. 食物聚合扣除（萝卜2 + 番茄3 → 交付食物×5） ----------
  await gotoTown({ wood: 0, radish: 2, tomato: 3 }, { resident_req_gardener_wood: true });
  const fOpen = await openBoard();
  check('F0 面板打开', fOpen === true);
  await clickDeliver('resident_req_miner_food');
  const f = await page.evaluate(() => {
    const s = window.__game.scene.getScene('town');
    return { dlgOpen: !!s.storyDialogue?.isOpen?.() };
  });
  check('F1 老张反馈对白打开', f.dlgOpen === true);
  await finishDialogue();
  const fSave = await readSave();
  check('F2 食物聚合扣除', fSave?.player?.inventory?.radish === 0 && fSave?.player?.inventory?.tomato === 0,
    `radish=${fSave?.player?.inventory?.radish} tomato=${fSave?.player?.inventory?.tomato}`);
  check('F3 老张需求标记完成', fSave?.gameState?.triggeredEvents?.['resident_req_miner_food'] === true);

  // ---------- G. 读档恢复 ----------
  await page.reload({ waitUntil: 'networkidle2' });
  await enterGame('town');
  await sleep(1000);
  const gOpen = await openBoard();
  check('G0 读档后面板可打开', gOpen === true);
  const g = await page.evaluate(() => {
    const panel = document.getElementById('resident-board-panel');
    const txt = panel?.querySelector('#rb-list')?.textContent || '';
    return {
      hasDone: (txt.match(/✓ 已完成/g) || []).length,
      hasWoodReq: txt.includes('木材'),
      hasFoodReq: txt.includes('食物'),
    };
  });
  check('G1 两个需求均显示已完成', g.hasDone === 2, `已完成=${g.hasDone}`);
  check('G2 面板仍显示需求内容', g.hasWoodReq && g.hasFoodReq);

  // ---------- H. 回归：NPC 链不受影响 ----------
  const h = await page.evaluate(() => {
    const s = window.__game.scene.getScene('town');
    return { npcCount: s.npcList?.length ?? -1 };
  });
  check('H1 NPC 列表正常（≥1）', h.npcCount >= 1, `npc=${h.npcCount}`);

  check('Z1 无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n资源 404（仅记录）: ${notFound.length} 个`);

  await browser.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(2); });
