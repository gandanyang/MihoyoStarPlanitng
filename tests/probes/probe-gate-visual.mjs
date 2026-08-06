/**
 * gate 庄园大门美术升级 —— 运行时验证探针
 *
 * 验证：
 *   1. 白天（12:00）进 gate（教程 get_key 阶段）：木门视觉 + 物理门墙均在、
 *      生活杂物 13 类、小动物 1、白天无门灯
 *   2. 夜间（20:00）进 gate：门柱暖灯 2 盏出现
 *   3. 使用钥匙开门：gateDoorVisual 与 gateWall 同步销毁（销毁链不破坏教程）
 *   4. 全程无运行时错误 / 资源 404（资源 404 仅记录不判失败）
 *   5. 昼夜/开门截图存档供制作人目测（tests/probes/test-screenshots/）
 *
 * 前置：dev server；node probe-gate-visual.mjs
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(__dirname, 'test-screenshots');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(SHOT_DIR, { recursive: true });

const snapGate = `(() => {
  const s = window.__game?.scene?.getScene('gate');
  if (!s) return { sceneLoaded: false };
  return {
    sceneLoaded: true,
    gateLife: s.gateLife,
    gateWall: !!s.gateWall,
    gateDoorVisual: !!s.gateDoorVisual,
  };
})()`;

async function run() {
  console.log('=== gate 庄园大门美术升级 运行时验证 ===\n');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  const errors = [];
  const notFound = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() === 404) notFound.push(r.url()); });

  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' - ' + detail : ''}`);
    ok ? pass++ : fail++;
  };

  const enterGame = async (scene, timeoutMs = 20000) => {
    const t0 = Date.now();
    let cur = '';
    while (Date.now() - t0 < timeoutMs) {
      cur = await page.evaluate(() => window.__game?.scene.getScenes(true)[0]?.scene?.key ?? 'none');
      if (cur === scene) return;
      if (cur === 'title') {
        await page.keyboard.press('Enter');
        await page.mouse.click(400, 300);
      }
      await sleep(350);
    }
    throw new Error(`未能进入场景 ${scene}（实际 ${cur}）页面错误=${errors.slice(0, 5).join(' | ')}`);
  };

  const gotoHourGate = async (hour) => {
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await sleep(1000);
    await page.evaluate((hour) => {
      localStorage.setItem('return_star_save', JSON.stringify({
        version: '0.5', savedAt: 'gate-visual-probe', timestamp: Date.now(),
        player: { x: 272, y: 272, scene: 'gate', facing: 'down', inventory: {} },
        world: { day: 1, hour, minute: 0, coins: 100, level: 1, xp: 0, stamina: 100, minedOres: [], questState: 'not_started' },
        farm: { tiles: [], crops: [], trees: [] },
        story: { storyStep: 'get_key' },
      }));
    }, hour);
    await page.reload({ waitUntil: 'networkidle2' });
    await enterGame('gate');
    await sleep(1200);
  };

  // 1) 白天 12:00
  await gotoHourGate(12);
  let d = await page.evaluate(snapGate);
  check('A1 白天进 gate 加载', d.sceneLoaded, JSON.stringify(d));
  check('A2 生活杂物 13 类', d.gateLife && d.gateLife.decor === 13, `decor=${d.gateLife && d.gateLife.decor}`);
  check('A3 小动物 1', d.gateLife && d.gateLife.wildlife === 1, `wildlife=${d.gateLife && d.gateLife.wildlife}`);
  check('A4 白天无门灯', d.gateLife && d.gateLife.lamp === 0, `lamp=${d.gateLife && d.gateLife.lamp}`);
  check('A5 木门视觉存在', d.gateDoorVisual === true, `gateDoorVisual=${d.gateDoorVisual}`);
  check('A6 物理门墙未被破坏', d.gateWall === true, `gateWall=${d.gateWall}`);
  await page.screenshot({ path: join(SHOT_DIR, 'gate-visual-day.png') });

  // 2) 夜间 20:00
  await gotoHourGate(20);
  d = await page.evaluate(snapGate);
  check('B1 夜间进 gate 加载', d.sceneLoaded);
  check('B2 夜间门灯 2 盏', d.gateLife && d.gateLife.lamp === 2, `lamp=${d.gateLife && d.gateLife.lamp}`);
  await page.screenshot({ path: join(SHOT_DIR, 'gate-visual-night.png') });

  // 3) 使用钥匙开门：门视觉随物理墙同步销毁（销毁链不破坏教程）
  await page.evaluate(() => {
    const s = window.__game?.scene?.getScene('gate');
    if (!s) return { err: 'no gate scene' };
    try {
      const ok = s.useManorKey();
      return { called: true, ok, door: !!s.gateDoorVisual, wall: !!s.gateWall };
    } catch (e) {
      return { called: true, err: String(e) };
    }
  }).then(async (r) => {
    await sleep(800);
    const s2 = await page.evaluate(() => {
      const s = window.__game?.scene?.getScene('gate');
      return { door: s ? !!s.gateDoorVisual : 'no-scene', wall: s ? !!s.gateWall : 'no-scene' };
    });
    check('C1 开门调用成功', r && r.called && r.ok === true, JSON.stringify(r));
    check('C2 门视觉已销毁', s2.door === false, `gateDoorVisual=${s2.door}`);
    check('C3 物理门墙已销毁', s2.wall === false, `gateWall=${s2.wall}`);
  });
  await page.screenshot({ path: join(SHOT_DIR, 'gate-visual-opened.png') });

  // 4) 运行时错误
  check('D1 无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n资源 404（仅记录）: ${notFound.length} 个`);

  await browser.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(2); });
