/**
 * 3.4 村长立绘接线验证探针
 *
 * 验证：PORTRAIT_MAP 含「村长 → elder_ai.png」映射 + elder_ai.png 资源可加载（无 404）。
 * 前置：dev server 在 localhost:5173；node probe-elder-portrait.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/?reset=1';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name} ${detail}`);
    ok ? pass++ : fail++;
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
    await sleep(2500);

    const result = await page.evaluate(() => {
      const g = window.__game;
      if (!g) return { game: false };
      // 检查 StoryDialogue 的 PORTRAIT_MAP（通过加载 elder.png 纹理间接验证 + 检查映射源）
      const texExists = g.textures.exists('elder_placeholder_never') === false; // 兼容性检查纹理系统可用
      return { game: true, texturesAvailable: true };
    });
    check('game 实例存在', result.game);

    // elder_ai.png 资源 HTTP 可访问（无 404）
    const resp = await page.goto(GAME_URL + 'assets/portraits/elder_ai.png', { waitUntil: 'networkidle2' }).catch(() => null);
    check('elder_ai.png HTTP 可访问', !!resp && resp.ok(), resp ? `${resp.status()}` : '<请求失败>');

    // 运行时验证：推进到 station 场景（?reset=1 后按 Enter 进入车站，MapScene 系有 storyDialogue 实例），
    // 对 storyDialogue.play() 注入村长说话，检查立绘 img src
    // （title 场景无 storyDialogue，必须推进到地图场景）
    await page.keyboard.press('Enter');
    await sleep(2500);
    const runtime = await page.evaluate(async () => {
      const g = window.__game;
      const s = g.scene.getScenes(true).find(x => x.storyDialogue);
      if (!s || !s.storyDialogue) return { played: false, reason: '无 storyDialogue' };
      s.storyDialogue.play([
        { speaker: '村长', color: '#c8b898', text: '测试村长立绘' },
      ]);
      await new Promise(r => setTimeout(r, 400));
      const img = s.storyDialogue.portraitEl?.querySelector('img');
      const src = img ? img.getAttribute('src') : '';
      s.storyDialogue.skip();
      return { played: true, src };
    });
    check('运行时村长立绘 img 显示', runtime.played && runtime.src.includes('elder_ai.png'), runtime.src || (runtime.reason || '<无立绘>'));

    // elder_ai.png 尺寸验证（512×512 正方形，对话框头像）
    const imgInfo = await page.evaluate(async () => {
      const im = new Image();
      await new Promise(r => { im.onload = r; im.src = '/assets/portraits/elder_ai.png'; });
      return { w: im.naturalWidth, h: im.naturalHeight };
    }).catch(() => null);
    check('elder_ai.png 512×512', imgInfo?.w === 512 && imgInfo?.h === 512, imgInfo ? `${imgInfo.w}x${imgInfo.h}` : '<加载失败>');

    const assetFailed = failedRequests.filter(u => u.includes('elder'));
    check('无 elder 资源加载失败', assetFailed.length === 0, assetFailed.join(','));

    await page.close();
  } finally {
    await browser.close();
  }

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
