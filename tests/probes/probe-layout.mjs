/**
 * 布局探针：验证 NPC 站位与矿脉位置都落在可通行（非碰撞）瓦片上
 *
 * 验证目标：
 *   - 各场景 NPC 站位（SPOTS）所在瓦片非碰撞
 *   - 矿洞矿脉（ORE_DEPOSITS）所在瓦片非碰撞（修复 s1/i1 卡石簇问题）
 *
 * 前置：Vite dev server 在 localhost:5173
 * 运行：node probe-layout.mjs
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
function result(step, passed, detail = '') {
  const icon = passed ? '✅' : '❌';
  const msg = `${icon} ${step}: ${passed ? '通过' : '失败'}${detail ? ' - ' + detail : ''}`;
  results.push(msg);
  console.log(msg);
}

async function run() {
  console.log('=== 布局探针：NPC 站位 / 矿脉位置 可通行性 ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  try {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(2500);
    await page.keyboard.press('Enter');
    await sleep(1500);
    await page.evaluate(() => {
      const btn = document.getElementById('intro-skip-btn');
      if (btn) btn.click();
    });
    await sleep(500);
    await page.evaluate(() => window.debug.setStoryStep('done'));
    await sleep(300);

    // 逐场景进入，读取 wallsLayer 的瓦片碰撞信息，检查 NPC 站位
    const scenes = ['farm', 'town', 'forest', 'mine'];

    // 先收集所有 NPC 的全部日程站位（跨场景），再逐场景验证
    const scheduleChecks = await page.evaluate(async () => {
      const m = await import('/src/systems/NPCSystem.ts');
      const npcs = m.getAllNPCs();
      const out = [];
      for (const npc of npcs) {
        for (const entry of npc.schedule) {
          out.push({ id: npc.id, loc: entry.location, x: entry.x, y: entry.y });
        }
      }
      return out;
    });

    // 按场景分组
    const byScene = {};
    for (const sc of scenes) byScene[sc] = [];
    for (const s of scheduleChecks) byScene[s.loc].push(s);

    for (const key of scenes) {
      await page.evaluate(([k]) => {
        const s = window.__game.scene.getScenes(true)[0];
        if (s?.scene?.key !== k) s.scene.start(k, { spawn: { x: 200, y: 300 } });
      }, [key]);
      await sleep(1200);

      // 对每个日程站位，检查所在瓦片是否碰撞
      const tileChecks = await page.evaluate(async ([k, entries]) => {
        const s = window.__game.scene.getScene(k);
        const out = [];
        for (const e of entries) {
          const col = Math.floor(e.x / 16);
          const row = Math.floor(e.y / 16);
          const tile = s.wallsLayer?.getTileAt(col, row, true);
          out.push({ id: e.id, loc: k, col, row, x: e.x, y: e.y, collides: tile?.collides ?? false, has: !!tile });
        }
        return out;
      }, [key, byScene[key]]);

      for (const t of tileChecks) {
        result(`${t.loc}/${t.id} 站位可通行`, t.collides === false && t.has, `@(${t.col},${t.row}) collides=${t.collides}`);
      }

      // 矿脉位置检查（只在 mine 场景）
      if (key === 'mine') {
        const oreData = await page.evaluate(async () => {
          const m = await import('/src/data/MineState.ts');
          const s = window.__game.scene.getScene('mine');
          const ores = [];
          for (const d of m.ORE_DEPOSITS) {
            const tile = s.wallsLayer?.getTileAt(d.col, d.row, true);
            ores.push({ id: d.id, col: d.col, row: d.row, collides: tile?.collides ?? false, has: !!tile });
          }
          return ores;
        });
        for (const o of oreData) {
          result(`矿脉 ${o.id} 可通行`, o.collides === false && o.has, `@(${o.col},${o.row}) collides=${o.collides}`);
        }
      }
    }

    console.log('\n========== 结果 ==========');
    const pass = results.filter(r => r.includes('✅')).length;
    const fail = results.length - pass;
    console.log(`${pass} 通过 / ${fail} 失败`);
    process.exit(fail > 0 ? 1 : 0);
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('探针异常:', err);
  process.exit(1);
});
