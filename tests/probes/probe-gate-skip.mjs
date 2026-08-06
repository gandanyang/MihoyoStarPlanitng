/**
 * 排查探针：第二节剧情（庄园大门 / 夏雅对话）被跳过
 *
 * 根因（BUG-044 深层根因）：StoryDialogue.close(true) 走 150ms 淡出，期间 isOpen() 仍 true。
 * 对话最后一句后玩家连按 E / 脚本再调 advance → onComplete 二次触发 → advanceStory 被推两格，
 * 出站分流 isGate=false → 直接进 farm 跳过 gate。
 *
 * 覆盖：
 *   T1 完整正常流程（快速推进对话）→ 对话后 step 应停 station_move → 出站进 gate（含 gateWall+夏雅）
 *   T2 连按防重入：对话结束后 150ms 内再调 advance → step 不被二次推进
 *   T3 gate 存档恢复：注入 scene=gate + step=arrive_manor 存档 → reload → 应回 gate 继续（不跳过）
 *
 * 前置：dev server 在 localhost:5173
 * 运行：node tests/probes/probe-gate-skip.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 构造一份合法存档（v0.5 结构）
function makeSave(scene, storyStep) {
  return {
    version: '0.5', savedAt: new Date().toISOString(), timestamp: Date.now(),
    player: { x: 240, y: 260, scene, facing: 'down', inventory: {} },
    world: { day: 1, hour: 8, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
    farm: { tiles: [], crops: [], trees: [] },
    story: { storyStep },
  };
}

async function run() {
  let pass = 0, fail = 0;
  const check = (name, ok) => {
    console.log(`${ok ? '✅' : '❌'} ${name}`);
    ok ? pass++ : fail++;
  };

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 1280, height: 720 },
    args: ['--no-sandbox'],
  });
  try {
    // ============ T1 完整正常流程（不点跳过） ============
    {
      const page = await browser.newPage();
      page.on('pageerror', (e) => console.log('[pageerror]', e.message));
      await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
      await sleep(2000);
      await page.keyboard.press('Enter');
      // 开场动画阶段链：列车声（自动约 3.5s）→ 淡入（1.2s）→ 音量提示（需点击）
      await sleep(5000);

      // 点击音量提示（建议打开声音游玩）→ 进入手机通知阶段
      for (let i = 0; i < 30; i++) {
        const clicked = await page.evaluate(() => {
          const el = [...document.querySelectorAll('div')].find(d => d.textContent?.includes('建议打开声音游玩'));
          if (el) { el.click(); return true; }
          return false;
        });
        if (clicked) break;
        await sleep(300);
      }
      await sleep(600); // 音量提示淡出 → 手机通知出现

      // 手机通知两页关闭
      let sawNotif = false, notifClosed = false;
      for (let i = 0; i < 40; i++) {
        const has = await page.evaluate(() => !!window.__game.scene.getScene('station')?.phoneOverlay);
        if (has) {
          sawNotif = true;
          await page.evaluate(() => window.__game.scene.getScene('station')?.phoneOverlay?.click());
        } else if (sawNotif) {
          notifClosed = true;
          break;
        }
        await sleep(300);
      }
      check('T1 手机通知已关闭', notifClosed);

      // 等对话打开 → 连续推进直到关闭（每步 40ms，模拟玩家连按）
      let opened = false;
      for (let i = 0; i < 40; i++) {
        opened = await page.evaluate(() => {
          const s = window.__game.scene.getScenes(true)[0];
          return !!s?.storyDialogue?.isOpen?.();
        });
        if (opened) break;
        await sleep(250);
      }
      check('T1 开场对话已打开', opened);

      let closed = false;
      for (let i = 0; i < 60; i++) {
        const stillOpen = await page.evaluate(() => {
          const s = window.__game.scene.getScenes(true)[0];
          if (s?.storyDialogue?.isOpen?.()) {
            s.storyDialogue.advance();
            return true;
          }
          return false;
        });
        if (!stillOpen) { closed = true; break; }
        await sleep(40); // 连按节奏：40ms 间隔必然踩中 150ms 淡出窗口（旧代码必二次推进）
      }
      check('T1 开场对话自然结束（未点跳过）', closed);

      // 对话结束后，150ms 内再连按 3 次（模拟玩家多按）——旧代码会二次推进，新代码应免疫
      await page.evaluate(() => {
        const s = window.__game.scene.getScenes(true)[0];
        s?.storyDialogue?.advance?.();
        s?.storyDialogue?.advance?.();
        s?.storyDialogue?.advance?.();
      });
      await sleep(100);
      const afterDlg = await page.evaluate(() => ({
        step: window.debug?.getStoryStep?.(),
        scene: window.__game.scene.getScenes(true)[0]?.scene?.key ?? null,
      }));
      check(`T1 连按后 step 仍停 station_move（实际 ${afterDlg.step}）`, afterDlg.step === 'station_move');

      // 走到出口
      await page.evaluate(() => {
        const s = window.__game.scene.getScene('station');
        if (s?.player) s.player.x = 1500;
      });

      let finalScene = null;
      for (let i = 0; i < 24; i++) {
        await sleep(500);
        finalScene = await page.evaluate(() => window.__game.scene.getScenes(true)[0]?.scene?.key ?? null);
        if (finalScene && finalScene !== 'station') break;
      }
      const finalStep = await page.evaluate(() => window.debug?.getStoryStep?.());
      check(`T1 出站进入 gate（实际 ${finalScene}, step=${finalStep}）`, finalScene === 'gate' && finalStep === 'arrive_manor');

      const gateState = await page.evaluate(() => {
        const g = window.__game.scene.getScene('gate');
        return { wall: !!g?.gateWall, xiya: !!g?.xiyaSprite };
      });
      check(`T1 gate 有门墙+夏雅（wall=${gateState.wall}, xiya=${gateState.xiya}）`, gateState.wall && gateState.xiya);

      // ===== T4 完整第二节闭环：夏雅对话 → 拿钥匙 → 开门 =====
      // 玩家移到夏雅旁（15*16+8, 11*16+8），按 E 触发对话
      await page.evaluate(() => {
        const s = window.__game.scene.getScene('gate');
        if (s?.player) { s.player.x = 248; s.player.y = 185; }
      });
      await page.keyboard.press('e');
      await sleep(300);

      // 推进夏雅对话直到关闭（连按节奏，踩 150ms 淡出窗口）
      let xiyaDone = false;
      for (let i = 0; i < 40; i++) {
        const stillOpen = await page.evaluate(() => {
          const s = window.__game.scene.getScene('gate');
          if (s?.storyDialogue?.isOpen?.()) { s.storyDialogue.advance(); return true; }
          return false;
        });
        if (!stillOpen) { xiyaDone = true; break; }
        await sleep(40);
      }
      // 150ms 内再连按 3 次（旧代码会把 get_key 二次推到 gate_opened → 钥匙失效 = BUG-044）
      await page.evaluate(() => {
        const s = window.__game.scene.getScene('gate');
        s?.storyDialogue?.advance?.();
        s?.storyDialogue?.advance?.();
        s?.storyDialogue?.advance?.();
      });
      await sleep(120);
      const afterXiya = await page.evaluate(() => ({
        step: window.debug?.getStoryStep?.(),
        key: window.debug?.getItemCount?.('manor_key') ?? 'n/a',
      }));
      check(
        `T4 夏雅对话后 step=get_key（实际 step=${afterXiya.step}, key=${afterXiya.key}）`,
        afterXiya.step === 'get_key',
      );

      // 用钥匙开门
      await page.evaluate(() => {
        const g = window.__game.scene.getScene('gate');
        if (g?.useManorKey) g.useManorKey();
      });
      await sleep(200);
      // 推进开门对话直到关闭
      for (let i = 0; i < 40; i++) {
        const stillOpen = await page.evaluate(() => {
          const s = window.__game.scene.getScene('gate');
          if (s?.storyDialogue?.isOpen?.()) { s.storyDialogue.advance(); return true; }
          return false;
        });
        if (!stillOpen) break;
        await sleep(40);
      }
      await sleep(150);
      const afterOpen = await page.evaluate(() => ({
        step: window.debug?.getStoryStep?.(),
        wall: !!window.__game.scene.getScene('gate')?.gateWall,
        hoe: window.debug?.getItemCount?.('old_hoe') ?? 'n/a',
      }));
      check(
        `T4 开门后 step=clear_land 且门墙销毁（实际 step=${afterOpen.step}, wall=${afterOpen.wall}, hoe=${afterOpen.hoe}）`,
        afterOpen.step === 'clear_land' && !afterOpen.wall,
      );

      // 注入 gate 存档供 T3 使用（信息确认）
      await page.evaluate((save) => {
        localStorage.setItem('return_star_save', JSON.stringify(save));
      }, makeSave('gate', 'arrive_manor'));
      await page.close();
    }

    // ============ T3 gate 存档恢复（scene=gate, step=arrive_manor） ============
    // 独立 page：先清档 → 注入合法 gate 存档 → 重新进入 → 应回 gate 继续（不跳过）
    {
      const page = await browser.newPage();
      page.on('pageerror', (e) => console.log('[pageerror]', e.message));
      await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' }); // 清档
      await sleep(1500);
      await page.evaluate((save) => {
        localStorage.setItem('return_star_save', JSON.stringify(save));
      }, makeSave('gate', 'arrive_manor'));
      await page.goto(GAME_URL, { waitUntil: 'networkidle2' }); // 带存档重新进
      await sleep(2500);
      await page.keyboard.press('Enter');
      await sleep(3500); // 等读档 → 切到 gate

      const t3 = await page.evaluate(() => ({
        scene: window.__game.scene.getScenes(true)[0]?.scene?.key ?? null,
        step: window.debug?.getStoryStep?.(),
        wall: !!window.__game.scene.getScene('gate')?.gateWall,
        xiya: !!window.__game.scene.getScene('gate')?.xiyaSprite,
      }));
      check(
        `T3 gate 存档恢复→回 gate 且夏雅在（实际 scene=${t3.scene}, step=${t3.step}, wall=${t3.wall}, xiya=${t3.xiya}）`,
        t3.scene === 'gate' && t3.step === 'arrive_manor' && t3.xiya,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
