/**
 * BUG-035 回归探针：网页端「对话播放中点跳过开场」不再跳过开门剧情（gate）
 *
 * 修复：StationScene.skipIntro 对话进行中静默关闭（reset 不触发 onComplete），
 * 防止 storyStep 被二次推进越过 arrive_manor → 出站分流误判直接进 farm。
 *
 * 前置：dev server 在 localhost:5173
 * 运行：node tests/probes/probe-bug035-gate-skip.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
    const page = await browser.newPage();
    page.on('pageerror', e => console.log('[pageerror]', e.message));
    await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
    await sleep(2000);

    // 进入 station
    await page.keyboard.press('Enter');
    await sleep(1500);

    // 轮询等待手机通知出现 → 点击 → 对话开始
    let notifClicked = false;
    for (let i = 0; i < 40; i++) {
      notifClicked = await page.evaluate(() => {
        const s = window.__game.scene.getScene('station');
        if (s?.phoneOverlay) { s.phoneOverlay.click(); return true; }
        return false;
      });
      if (notifClicked) break;
      await sleep(250);
    }
    check('手机通知出现并被点击', notifClicked);

    // 等对话打开
    let opened = false;
    for (let i = 0; i < 32; i++) {
      opened = await page.evaluate(() => {
        const s = window.__game.scene.getScenes(true)[0];
        return !!s?.storyDialogue?.isOpen?.();
      });
      if (opened) break;
      await sleep(250);
    }
    check('对话已在播放中', opened);

    // 对话播放中：点「跳过开场」
    const btnClicked = await page.evaluate(() => {
      const b = document.getElementById('intro-skip-btn');
      if (!b) return false;
      b.click();
      return true;
    });
    check('对话中点跳过开场按钮', btnClicked);
    await sleep(500);

    // 跳过后：step 停在 station_move，对话被静默关闭
    const after = await page.evaluate(() => {
      const s = window.__game.scene.getScenes(true)[0];
      return {
        step: window.debug?.getStoryStep?.(),
        dialogueOpen: !!s?.storyDialogue?.isOpen?.(),
      };
    });
    check('跳过后 storyStep=station_move 未被二次推进', after.step === 'station_move');
    check('对话已被静默关闭', !after.dialogueOpen);

    // 走到车站出口
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('station');
      if (s?.player) s.player.x = 1500;
    });

    // 等场景切换，断言进入 gate（非 farm）
    let finalScene = null;
    for (let i = 0; i < 24; i++) {
      await sleep(500);
      finalScene = await page.evaluate(() => window.__game.scene.getScenes(true)[0]?.scene?.key ?? null);
      if (finalScene && finalScene !== 'station') break;
    }
    const finalStep = await page.evaluate(() => window.debug?.getStoryStep?.());
    check(`出站进入 gate（实际 ${finalScene}, step=${finalStep}）`, finalScene === 'gate' && finalStep === 'arrive_manor');
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
