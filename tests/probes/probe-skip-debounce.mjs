/**
 * 对话 Skip 双触发回归探针（真机反馈：点跳过对话后新对话被误关、语音被掐断）
 *
 * Bug：StoryDialogue.skip 按钮 pointerdown + click 双绑定，一次物理点击触发两次 skip；
 *     首次 skip 的 onComplete 同步打开下一段对话后，第二次 skip 会误关新对话并二次触发 onComplete。
 * 修复：skip() 300ms 防抖，同一物理点击只执行一次。
 *
 * 验证：
 *  1. pointerdown + click 双事件派发后 onComplete 只触发一次
 *  2. skip 后调用方打开的新对话未被误关
 *  3. 新对话停留在第一行（未被二次推进）
 *
 * 前置：dev server 在 localhost:5173
 * 运行：node tests/probes/probe-skip-debounce.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  let pass = 0;
  let fail = 0;
  const check = (name, ok, extra = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
    ok ? pass++ : fail++;
  };

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1280, height: 720 },
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    await page.goto(GAME_URL + '?reset=1', { waitUntil: 'networkidle2' });
    await sleep(2000);

    // 按 Enter 进入 station，确保 storyDialogue 已初始化
    await page.keyboard.press('Enter');
    await sleep(2000);

    const result = await page.evaluate(async () => {
      const s = window.__game.scene.getScenes(true)[0];
      const d = s?.storyDialogue;
      if (!d) return { error: 'no storyDialogue' };

      // 第一段对话：onComplete 模拟调用方「同步打开下一段对话」并计数
      let completeCalls = 0;
      d.play(
        [{ speaker: '林澈', text: '第一段第一句' }, { speaker: '夏雅', text: '第一段第二句' }],
        () => {
          completeCalls++;
          d.play(
            [{ speaker: '旁白', text: '第二段第一行' }, { speaker: '旁白', text: '第二段第二行' }],
            () => { completeCalls++; },
          );
        },
      );
      await new Promise((r) => setTimeout(r, 400));

      // 模拟真实点击 Skip 按钮：pointerdown + click（真实鼠标/触摸会依次触发两者）
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Skip'));
      if (!btn) return { error: 'no skip btn' };
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      await new Promise((r) => setTimeout(r, 500));
      return {
        completeCalls,
        open: d.isOpen(),
        text: d.textEl?.textContent ?? '',
      };
    });

    if (result.error) {
      check('探针初始化（storyDialogue + Skip 按钮就绪）', false, result.error);
    } else {
      check('单次物理点击 onComplete 只触发一次', result.completeCalls === 1, `calls=${result.completeCalls}`);
      check('skip 后调用方打开的新对话未被误关', result.open === true);
      check('新对话停留在第一行（未二次推进）', result.text === '第二段第一行', `text=${JSON.stringify(result.text)}`);
    }
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
