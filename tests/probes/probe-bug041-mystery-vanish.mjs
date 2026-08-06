/**
 * BUG-041 回归探针：神秘少女对白结束后精灵消失（演出层，与叙事"消失在林间"一致）
 *
 * 修复：NPC.vanished 运行时标记 + setVanished()（隐藏 sprite/label/停止动作）；
 *      MapScene.showDialogue onComplete 对 mystery 调 setVanished；tryInteract 跳过 vanished NPC；
 *      NPCSystem.refreshSchedule() 清除 vanished → 重新进场景/跨天/下一时段恢复出现。
 *
 * 验证：
 *  1. 神秘少女在其出现时段（06:00-08:00 森林）正常可见
 *  2. 对白完成后：sprite/label 隐藏 + vanished=true + 无法再次交互
 *  3. 切场景再回：按作息恢复出现（vanished 清除）
 *  4. 无运行时错误
 *
 * 前置：dev server 在 localhost:5173
 * 运行：node tests/probes/probe-bug041-mystery-vanish.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
  ok ? pass++ : fail++;
};

async function pressE(page) {
  await page.keyboard.press('e');
  await sleep(500);
}

async function teleportNear(page, npcId) {
  await page.evaluate((id) => {
    const s = window.__game.scene.getScenes(true)[0];
    const npc = s?.npcList?.find((n) => n.id === id);
    if (npc?.sprite && s?.player) {
      s.player.x = npc.sprite.x + 4;
      s.player.y = npc.sprite.y + 4;
    }
  }, npcId);
  await sleep(300);
}

async function npcState(page, id) {
  return page.evaluate((nid) => {
    const s = window.__game.scene.getScenes(true)[0];
    const npc = s?.npcList?.find((n) => n.id === nid);
    if (!npc) return null;
    return {
      vanished: npc.vanished,
      spriteVisible: !!npc.sprite && npc.sprite.visible,
      labelVisible: !!npc.label && npc.label.visible,
      scene: s?.scene?.key,
    };
  }, id);
}

async function dialogueOpen(page) {
  return page.evaluate(() => {
    const s = window.__game.scene.getScenes(true)[0];
    return !!s?.storyDialogue?.isOpen?.();
  });
}

async function skipDialogue(page, lineCount) {
  const calls = lineCount * 2 + 1;
  for (let i = 0; i < calls; i++) {
    await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      if (s?.storyDialogue?.isOpen()) s.storyDialogue.advance();
    });
    await sleep(60);
  }
  await sleep(400);
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    // 存档注入：清晨 06:30（神秘少女 06:00-08:00 森林出现时段）
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate(() => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'BUG-041探针', timestamp: Date.now(),
        player: { x: 240, y: 96, scene: 'forest', facing: 'down', inventory: {} },
        world: { day: 1, hour: 6, minute: 30, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'completed' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'done' },
      }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1800);

    // 进入 station → 跳过开场 → 强制完成教程 → 切到森林
    await page.keyboard.press('Enter');
    await sleep(1500);
    await page.evaluate(() => {
      const o = [...document.querySelectorAll('div')].find((d) => d.style.zIndex === '600' && d.textContent.includes('人事通知'));
      if (o) o.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await sleep(300);
    await page.evaluate(() => {
      const o = [...document.querySelectorAll('div')].find((d) => d.style.zIndex === '600' && d.textContent.includes('人事通知'));
      if (o) o.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await page.evaluate(() => { const b = document.getElementById('intro-skip-btn'); if (b) b.click(); });
    await sleep(1200);
    await page.evaluate(() => window.debug?.setStoryStep('done'));
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('forest');
    });
    await sleep(2200);

    let scene = '';
    for (let i = 0; i < 12; i++) {
      scene = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (scene === 'forest') break;
      await sleep(300);
    }
    check('进入森林场景（清晨神秘少女出现时段）', scene === 'forest', `场景=${scene}`);

    // 1. 神秘少女初始可见
    const before = await npcState(page, 'mystery');
    check('神秘少女初始可见', !!before?.spriteVisible, JSON.stringify(before));

    // 2. 靠近按 E → 对话打开
    await teleportNear(page, 'mystery');
    await pressE(page);
    const opened = await dialogueOpen(page);
    check('靠近按 E 触发神秘少女对白', opened === true);

    // 3. 走完 7 行对白（MYSTERY_DIALOGUES）→ 对话关闭后精灵消失
    await skipDialogue(page, 7);
    const after = await npcState(page, 'mystery');
    check('对白完成后 sprite 隐藏', after?.spriteVisible === false, JSON.stringify(after));
    check('对白完成后 label 隐藏', after?.labelVisible === false);
    check('对白完成后 vanished=true', after?.vanished === true);

    // 4. 再次按 E：不再触发对话（交互跳过）
    await teleportNear(page, 'mystery');
    await pressE(page);
    const reopened = await dialogueOpen(page);
    check('消失后无法再次交互', reopened === false);

    // 5. 切场景再回森林 → 按作息恢复出现（refreshSchedule 清除 vanished）
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('farm');
    });
    await sleep(1500);
    await page.evaluate(() => {
      const g = window.__game;
      const a = g.scene.getScenes(true)[0];
      if (a) g.scene.stop(a.scene.key);
      g.scene.start('forest');
    });
    await sleep(2200);
    const restored = await npcState(page, 'mystery');
    check('重新进入森林后恢复出现（vanished 清除）', restored?.vanished === false && restored?.spriteVisible === true, JSON.stringify(restored));

    // 6. 无运行时错误
    check('无运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
