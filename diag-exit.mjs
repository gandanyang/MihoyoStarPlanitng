// 诊断: 车站出口为何不触发
import puppeteer from 'puppeteer-core';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle2' });
  await sleep(1500);
  // 跳过 title
  await p.keyboard.press('Enter');
  await sleep(1500);
  // 用 debug 直接推进到 station_move，绕过开场（诊断出口逻辑用）
  await p.evaluate(() => {
    window.debug.setStoryStep('station_move');
    const s = window.__game.scene.getScenes(true).find((x) => x.player);
    s.canMove = true;
    s.exitTriggered = false;
  });
  // 把玩家放到 x=1000
  await p.evaluate(() => {
    const s = window.__game.scene.getScenes(true).find((x) => x.player);
    s.player.x = 1000; s.player.y = 460; s.player.setVelocity(0, 0);
  });
  // 逐帧采样
  for (let i = 0; i < 25; i++) {
    const d = await p.evaluate((idx) => {
      const s = window.__game.scene.getScenes(true).find((x) => x.player);
      return {
        t: idx,
        running: window.__game.scene.getScenes(true).map((x) => x.scene.key).join(','),
        x: Math.round(s.player.x),
        canMove: s.canMove,
        exitTriggered: s.exitTriggered,
        dlgOpen: s.storyDialogue?.isOpen?.(),
      };
    });
    console.log(JSON.stringify(d));
    if (d.running !== 'station') break;
    await sleep(100);
  }
  await b.close();
})();
