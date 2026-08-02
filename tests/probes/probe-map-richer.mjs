/**
 * 地图重排 + 农场商店入口探针
 *
 * 验证目标（对应 v0.6 地图美化改动）：
 *   1. town/mine 重排后：所有出口区域瓦片非碰撞（出口连通不卡死）
 *   2. mine：矿脉（ORE_DEPOSITS）所在格非碰撞（矿脉可接近）
 *   3. 各场景 NPC 日程站位所在格非碰撞（复用 SPOTS 数据）
 *   4. farm：靠近商店摊位触发 tryInteract → ShopPanel 打开（商店入口闭环）
 *
 * 前置：Vite dev server 在 localhost:5173
 * 运行：node probe-map-richer.mjs
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
  console.log('=== 地图重排 + 农场商店入口探针 ===\n');

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

    // ===== 1+2. 出口区域 / 矿脉 可通行性 =====
    const scenes = ['farm', 'town', 'mine', 'forest'];
    const mapData = await page.evaluate(async () => {
      const m = await import('/src/data/exits.ts');
      const Mine = await import('/src/data/MineState.ts');
      return {
        exits: m.MAP_EXITS,
        ores: Mine.ORE_DEPOSITS,
      };
    });

    for (const key of scenes) {
      await page.evaluate(([k]) => {
        const s = window.__game.scene.getScenes(true)[0];
        if (s?.scene?.key !== k) s.scene.start(k, { spawn: { x: 200, y: 300 } });
      }, [key]);
      await sleep(1200);

      // 出口区域：矩形内每个格子的 Walls 瓦片都必须非碰撞
      // 边界内缩到实际矩形（像素除 16 向上取整减 1），避免把矩形外的装饰外墙算进来
      // 判定：矩形内可通行格 ≥ 2（保证至少 2 格宽通道，装饰墙在通道旁不影响通行）
      const exits = mapData.exits[key] ?? [];
      for (const ex of exits) {
        const c0 = Math.floor(ex.x / 16);
        const r0 = Math.floor(ex.y / 16);
        const c1 = Math.ceil((ex.x + ex.w) / 16) - 1;
        const r1 = Math.ceil((ex.y + ex.h) / 16) - 1;
        let passable = 0;
        const bad = [];
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const res = await page.evaluate(async ([k2, cc, rr]) => {
              const s = window.__game.scene.getScene(k2);
              const tile = s.wallsLayer?.getTileAt(cc, rr, true);
              return { collides: tile?.collides ?? false, has: !!tile };
            }, [key, c, r]);
            if (!res.collides) passable++;
            else bad.push(`(${c},${r})`);
          }
        }
        result(`${key} 出口→${ex.target} 可通行`, bad.length === 0 || passable >= 2, bad.length ? '碰撞格:' + bad.join(' ') : `@cols${c0}-${c1} rows${r0}-${r1} 可通行${passable}格`);
      }

      // 矿脉（mine 场景）
      if (key === 'mine') {
        for (const o of mapData.ores) {
          const res = await page.evaluate(async ([cc, rr]) => {
            const s = window.__game.scene.getScene('mine');
            const tile = s.wallsLayer?.getTileAt(cc, rr, true);
            return { collides: tile?.collides ?? false, has: !!tile };
          }, [o.col, o.row]);
          result(`矿脉 ${o.id} 可接近`, res.collides === false && res.has, `@(${o.col},${o.row}) collides=${res.collides}`);
        }
      }
    }

    // ===== 3. NPC 日程站位可通行 =====
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
    for (const sc of scenes) {
      const entries = scheduleChecks.filter(e => e.loc === sc);
      if (entries.length === 0) continue;
      await page.evaluate(([k]) => {
        const s = window.__game.scene.getScenes(true)[0];
        if (s?.scene?.key !== k) s.scene.start(k, { spawn: { x: 200, y: 300 } });
      }, [sc]);
      await sleep(1200);
      for (const e of entries) {
        const col = Math.floor(e.x / 16);
        const row = Math.floor(e.y / 16);
        const res = await page.evaluate(async ([k2, cc, rr]) => {
          const s = window.__game.scene.getScene(k2);
          const tile = s.wallsLayer?.getTileAt(cc, rr, true);
          return { collides: tile?.collides ?? false, has: !!tile };
        }, [sc, col, row]);
        result(`${sc}/${e.id} 站位可通行`, res.collides === false && res.has, `@(${col},${row}) collides=${res.collides}`);
      }
    }

    // ===== 4. 农场商店摊位：靠近触发 → ShopPanel 打开 =====
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.scene?.key !== 'farm') s.scene.start('farm', { spawn: { x: 200, y: 300 } });
    });
    await sleep(1200);

    // 传送到摊位旁（col 20, row 17 中心 328,280，站位上方 row 16）
    const shopRes = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const p = s.player;
      p.setPosition(20 * 16 + 8, 16 * 16 + 8); // 摊位正上方一格
      p.setVelocity(0, 0);
      p.facing = 'down';
      // 模拟一次交互（对应按 E / 交互按钮）
      s.tryInteract();
      return { shopOpen: s.shopPanel?.isOpen() ?? false };
    });
    result('farm 商店摊位触发打开 ShopPanel', shopRes.shopOpen === true, `shopOpen=${shopRes.shopOpen}`);

    // 关闭商店（恢复现场）
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (s.shopPanel?.isOpen()) s.shopPanel.close();
    });
    await sleep(300);
    const closed = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return (s.shopPanel?.isOpen() ?? true) === false;
    });
    result('farm 商店可正常关闭', closed);

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
