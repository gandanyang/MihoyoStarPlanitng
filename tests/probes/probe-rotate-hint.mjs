/**
 * 方案A验证：竖屏（portrait）显示横屏提示层，横屏（landscape）隐藏
 */
import puppeteer from 'puppeteer-core';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: false,
    defaultViewport: { width: 844, height: 390 },
    args: ['--no-sandbox'],
  });
  let pass = 0, fail = 0;
  const check = (n, ok) => { console.log(`${ok ? '✅' : '❌'} ${n}`); ok ? pass++ : fail++; };
  try {
    // 竖屏触屏
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
      await sleep(1500);
      const vis = await page.evaluate(() => {
        const h = document.getElementById('rotate-hint');
        return h ? getComputedStyle(h).display : 'missing';
      });
      console.log(`竖屏 390×844 提示层 display=${vis}`);
      check('竖屏触屏显示横屏提示', vis === 'flex');
      await page.close();
    }
    // 横屏触屏
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
      await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
      await sleep(1500);
      const vis = await page.evaluate(() => {
        const h = document.getElementById('rotate-hint');
        return h ? getComputedStyle(h).display : 'missing';
      });
      console.log(`横屏 844×390 提示层 display=${vis}`);
      check('横屏触屏隐藏横屏提示', vis === 'none');
      await page.close();
    }
    // 桌面横屏（非触屏）不应显示
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
      await sleep(1500);
      const vis = await page.evaluate(() => {
        const h = document.getElementById('rotate-hint');
        return h ? getComputedStyle(h).display : 'missing';
      });
      console.log(`桌面 1280×720 提示层 display=${vis}`);
      check('桌面非触屏不显示提示', vis === 'none');
      await page.close();
    }
  } finally { await browser.close(); }
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
