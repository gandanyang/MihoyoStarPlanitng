/**
 * BUG-027 回归探针：标题画面主角头像已移除
 *
 * 验证：title 场景不再加载/显示 linchen_avatar。
 * 前置：dev server 在 localhost:5173；node probe-title-avatar.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/?reset=1';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  let pass = 0, fail = 0;
  const check = (name, ok) => {
    console.log(`${ok ? '✅' : '❌'} ${name}`);
    ok ? pass++ : fail++;
  };
  const waitFor = async (page, fn, timeout = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = await fn();
      if (v) return v;
      await sleep(250);
    }
    return null;
  };

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 844, height: 390, isMobile: true, hasTouch: true },
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();
    const failedRequests = [];
    page.on('requestfailed', req => failedRequests.push(req.url()));
    page.on('response', res => {
      if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
    });

    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(2000);

    await waitFor(page, () => page.evaluate(() => {
      const g = window.__game;
      return g && g.scene.getScenes(true).some(s => s.scene.key === 'title');
    }), 10000);

    const result = await page.evaluate(() => {
      const g = window.__game;
      if (!g) return { game: false };
      const tex = g.textures.exists('linchen_avatar');
      const scene = g.scene.getScene('title');
      const avatarImg = scene?.children?.getChildren().find(o => o.texture && o.texture.key === 'linchen_avatar') ?? null;
      return {
        game: true,
        textureLoaded: tex,
        avatarExists: !!avatarImg,
        avatarKey: avatarImg ? avatarImg.texture.key : null,
      };
    });

    check('game 实例存在', result.game);
    check('linchen_avatar 纹理已移除', !result.textureLoaded);
    check('标题界面头像 image 已移除', !result.avatarExists);

    const assetFailed = failedRequests.filter(u => u.includes('linchen_avatar'));
    check('无 linchen_avatar 加载失败（404/请求失败）', assetFailed.length === 0);

    await page.close();
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
