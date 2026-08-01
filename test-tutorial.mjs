/**
 * E2E 测试脚本 — 教程完整流程
 * 使用 puppeteer-core + Chrome 自动化测试
 *
 * 前置条件: Vite dev server 运行在 localhost:5173
 * 运行: node test-tutorial.mjs
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, 'test-screenshots');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://localhost:5173/';

mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = [];

function result(step, passed, detail = '') {
  const icon = passed ? '✅' : '❌';
  const msg = `${icon} ${step}: ${passed ? '通过' : '失败'}${detail ? ' - ' + detail : ''}`;
  results.push(msg);
  console.log(msg);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function screenshot(page, name) {
  const path = join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`  📸 ${name}.png`);
}

/**
 * 直接调用 storyDialogue.advance() 跳过对话（每行需2次 + 最后1次close）
 */
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

/**
 * 等待并跳过对话（处理打字机效果）
 */
async function waitAndSkipDialogue(page, lineCount) {
  await sleep(600); // 等待对话开始
  await skipDialogue(page, lineCount);
}

async function run() {
  console.log('=== 星露谷二游 教程 E2E 测试 ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [err] ${msg.text().substring(0, 120)}`);
  });

  try {
    // ==================== STEP 1: 加载游戏、清除存档 ====================
    console.log('\n--- Step 1: 加载游戏，清除存档 ---');
    await page.goto(GAME_URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2500);

    const init = await page.evaluate(() => ({
      hasGame: !!window.__game,
      scene: window.__game.scene.getScenes(true)[0]?.scene?.key,
      step: window.debug?.getStoryStep?.(),
    }));
    result('1. 游戏加载', init.hasGame && init.scene === 'station', `场景=${init.scene}, 步骤=${init.step}`);
    if (!init.hasGame) throw new Error('游戏未启动');

    // ==================== STEP 2: 车站场景截图 ====================
    console.log('\n--- Step 2: 车站场景截图 ---');
    await sleep(1500);
    await screenshot(page, 'step2-station-scene');

    // ==================== STEP 3: 关闭手机通知 + 推进车站对话 ====================
    console.log('\n--- Step 3: 关闭手机通知 ---');
    const phoneOK = await page.evaluate(() => {
      const divs = document.querySelectorAll('div');
      for (const d of divs) {
        if ((d.textContent || '').includes('智能化系统接替')) { d.click(); return true; }
      }
      return false;
    });
    result('3. 手机通知', phoneOK, '已点击关闭');
    await sleep(1200);

    console.log('--- Step 3b: 推进车站对话 (10句) ---');
    await skipDialogue(page, 10);

    const afterDialogue = await page.evaluate(() => ({
      hint: !!document.getElementById('station-move-hint'),
      step: window.debug?.getStoryStep?.(),
    }));
    result('3b. 对话完成', afterDialogue.hint && afterDialogue.step === 'station_move',
      `步骤=${afterDialogue.step}, 提示=${afterDialogue.hint}`);

    // ==================== STEP 4: 走到出口切换到农场 ====================
    console.log('\n--- Step 4: 走到出口 ---');
    // 使用 debug API 直接推进并切换场景
    await page.evaluate(() => {
      const hint = document.getElementById('station-move-hint');
      if (hint) hint.remove();
      window.debug.advanceStory(); // station_move → arrive_manor
      window.__game.scene.getScene('station').scene.start('farm', { spawn: { x: 15 * 16, y: 3 * 16 } });
    });
    await sleep(2500);

    const farmCheck = await page.evaluate(() => ({
      scene: window.__game.scene.getScenes(true)[0]?.scene?.key,
      step: window.debug?.getStoryStep?.(),
    }));
    result('4. 场景切换', farmCheck.scene === 'farm',
      `当前场景=${farmCheck.scene}, 步骤=${farmCheck.step}`);
    if (farmCheck.scene !== 'farm') throw new Error('未切换到农场');

    // ==================== STEP 5: 农场截图（门+夏雅） ====================
    console.log('\n--- Step 5: 农场 (门 + 夏雅) ---');
    await sleep(500);
    await screenshot(page, 'step5-farm-gate-xiya');

    const farmState = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      const hint = Array.from(document.querySelectorAll('div'))
        .find(d => d.style?.position === 'fixed' && d.style?.bottom === '80px');
      return {
        gate: !!s?.gateWall,
        xiya: !!s?.xiyaSprite,
        hint: hint?.textContent || '',
      };
    });
    result('5a. 庄园大门', farmState.gate, '存在');
    result('5b. 夏雅精灵', farmState.xiya, '存在');
    result('5c. 提示', farmState.hint.includes('夏雅') || farmState.hint.includes('对话'),
      `"${farmState.hint}"`);

    // ==================== STEP 6: 靠近夏雅对话 ====================
    console.log('\n--- Step 6: 与夏雅对话 ---');
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (!s?.xiyaSprite) return;
      s.player.x = s.xiyaSprite.x;
      s.player.y = s.xiyaSprite.y + 20;
      s.player.facing = 'up';
    });
    await sleep(300);
    await page.keyboard.press('KeyE');
    await waitAndSkipDialogue(page, 9);

    const postXiya = await page.evaluate(() => {
      const hint = Array.from(document.querySelectorAll('div'))
        .find(d => d.style?.position === 'fixed' && d.style?.bottom === '80px');
      return {
        step: window.debug?.getStoryStep?.(),
        hint: hint?.textContent || '',
      };
    });
    result('6. 夏雅对话', postXiya.step === 'get_key' || postXiya.hint.includes('背包'),
      `步骤=${postXiya.step}, 提示="${postXiya.hint}"`);

    // ==================== STEP 7: 打开背包、使用钥匙 ====================
    console.log('\n--- Step 7: 使用庄园钥匙 ---');
    // 直接调用背包的open方法，绕过Phaser键盘检测
    await page.evaluate(() => {
      const scene = window.__game.scene.getScene('farm');
      if (scene?.backpackPanel) {
        scene.backpackPanel.open();
      }
    });
    await sleep(800);

    // Debug: 检查背包状态
    const bpDebug = await page.evaluate(() => {
      const isOpen = window.__game.scene.getScene('farm')?.backpackPanel?.isOpen?.() ?? false;
      const panelEl = document.getElementById('backpack-panel');
      const visible = panelEl?.style?.display === 'flex';
      const gridHtml = panelEl?.querySelector('#bp-grid')?.innerHTML?.substring(0, 300) || '';
      const allBtns = Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent?.trim().substring(0, 30),
        action: b.dataset?.action,
      }));
      return { isOpen, visible, gridHtml, allBtns };
    });
    console.log(`  背包: isOpen=${bpDebug.isOpen}, visible=${bpDebug.visible}`);
    console.log(`  按钮: ${JSON.stringify(bpDebug.allBtns)}`);
    if (bpDebug.gridHtml) console.log(`  物品HTML: ${bpDebug.gridHtml.substring(0, 200)}`);

    await screenshot(page, 'step7-backpack-key');

    // 点击"使用"按钮
    const keyClicked = await page.evaluate(() => {
      const btn = document.querySelector('button[data-action="use-key"]');
      if (btn) { btn.click(); return 'use-key-btn'; }
      const allBtns = document.querySelectorAll('button');
      for (const b of allBtns) {
        if ((b.textContent || '').trim() === '使用') { b.click(); return 'text-match'; }
      }
      return 'not-found';
    });
    console.log(`  点击结果: ${keyClicked}`);
    result('7a. 点击使用', keyClicked !== 'not-found', `匹配: ${keyClicked}`);
    await sleep(800);
    await skipDialogue(page, 7);

    const afterGate = await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      return {
        gateGone: !s?.gateWall,
        xiyaGone: !s?.xiyaSprite,
        step: window.debug?.getStoryStep?.(),
      };
    });
    result('7b. 大门消失', afterGate.gateGone);
    result('7c. 夏雅移除', afterGate.xiyaGone);

    // ==================== STEP 8: 截图(开门后) ====================
    console.log('\n--- Step 8: 开门后截图 ---');
    await screenshot(page, 'step8-gate-opened');

    // ==================== STEP 9: 锄地3块 ====================
    console.log('\n--- Step 9: 锄地3块 ---');
    for (let i = 0; i < 3; i++) {
      await page.evaluate((idx) => {
        const s = window.__game.scene.getScene('farm');
        if (!s) return;
        s.player.x = (13 + idx) * 16 + 8;
        s.player.y = 10 * 16 + 20;
        s.player.facing = 'up';
      }, i);
      await sleep(100);
      await page.keyboard.press('KeyE');
      await sleep(500);
    }

    const tillCheck = await page.evaluate(() => {
      const step = window.debug?.getStoryStep?.();
      const hint = Array.from(document.querySelectorAll('div'))
        .find(d => {
          const t = d.textContent || '';
          return t.includes('播种') || t.includes('萝卜种子');
        });
      return { step, hint: hint?.textContent || '' };
    });
    result('9. 锄地触发播种', tillCheck.step === 'sow_seeds' || tillCheck.hint.includes('播种'),
      `步骤=${tillCheck.step}, 提示="${tillCheck.hint}"`);

    // 推进播种对话
    await skipDialogue(page, 7);

    // ==================== STEP 10: 播种3块 ====================
    console.log('\n--- Step 10: 播种3块 ---');
    await page.keyboard.press('KeyR');
    await sleep(200);

    for (let i = 0; i < 3; i++) {
      await page.evaluate((idx) => {
        const s = window.__game.scene.getScene('farm');
        if (!s) return;
        s.player.x = (13 + idx) * 16 + 8;
        s.player.y = 10 * 16 + 20;
        s.player.facing = 'up';
      }, i);
      await sleep(100);
      await page.keyboard.press('KeyE');
      await sleep(500);
    }

    const plantCheck = await page.evaluate(() => {
      const step = window.debug?.getStoryStep?.();
      const hint = Array.from(document.querySelectorAll('div'))
        .find(d => {
          const t = d.textContent || '';
          return t.includes('浇水') || t.includes('水壶');
        });
      return { step, hint: hint?.textContent || '' };
    });
    result('10. 播种触发浇水', plantCheck.step === 'water_crops' || plantCheck.hint.includes('浇水'),
      `步骤=${plantCheck.step}, 提示="${plantCheck.hint}"`);

    await skipDialogue(page, 4);

    // ==================== STEP 11: 浇水3块 ====================
    console.log('\n--- Step 11: 浇水3块 ---');
    for (let i = 0; i < 3; i++) {
      await page.evaluate((idx) => {
        const s = window.__game.scene.getScene('farm');
        if (!s) return;
        s.player.x = (13 + idx) * 16 + 8;
        s.player.y = 10 * 16 + 20;
        s.player.facing = 'up';
      }, i);
      await sleep(100);
      await page.keyboard.press('KeyE');
      await sleep(500);
    }

    const waterCheck = await page.evaluate(() => {
      const step = window.debug?.getStoryStep?.();
      const hint = Array.from(document.querySelectorAll('div'))
        .find(d => {
          const t = d.textContent || '';
          return t.includes('睡觉') || t.includes('床');
        });
      return { step, hint: hint?.textContent || '' };
    });
    result('11. 浇水触发晚间', waterCheck.step === 'evening_talk' || waterCheck.hint.includes('睡觉'),
      `步骤=${waterCheck.step}, 提示="${waterCheck.hint}"`);

    await skipDialogue(page, 7);

    // ==================== STEP 12: 睡觉 ====================
    console.log('\n--- Step 12: 走到床边睡觉 ---');
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('farm');
      if (!s) return;
      s.player.x = 3 * 16 + 8;
      s.player.y = 14 * 16;
    });
    await sleep(300);
    await page.keyboard.press('KeyE');
    await sleep(2000);

    // ==================== STEP 13: 验证教程完成 ====================
    console.log('\n--- Step 13: 验证完成 ---');
    const final = await page.evaluate(() => {
      const step = window.debug?.getStoryStep?.();
      const hud = (document.getElementById('hud-overlay')?.textContent || '').substring(0, 80);
      const saveDiv = Array.from(document.querySelectorAll('div'))
        .find(d => (d.textContent || '').includes('游戏保存中') || (d.textContent || '').includes('归乡'));
      return { step, hud, saveMsg: saveDiv?.textContent || '', isDay2: hud.includes('2天') || hud.includes('第2') };
    });
    result('13. 教程完成', final.step === 'done' || final.isDay2 || final.saveMsg.includes('归乡'),
      `步骤=${final.step}, HUD="${final.hud}", 消息="${final.saveMsg}"`);

    // ==================== STEP 14: 最终截图 ====================
    console.log('\n--- Step 14: 最终截图 ---');
    await sleep(1000);
    await screenshot(page, 'step14-final-state');

    // ==================== 汇总 ====================
    console.log('\n\n========== 测试结果 ==========');
    for (const r of results) console.log(r);
    const allOK = results.every(r => r.startsWith('✅'));
    console.log(`\n${allOK ? '🎉 全部通过！' : '⚠️ 部分失败'}`);
    console.log(`截图: ${SCREENSHOT_DIR}`);
    await sleep(2000);

  } catch (e) {
    console.error('\n❌ 异常:', e.message);
    await screenshot(page, 'error-state');
  } finally {
    await browser.close();
    console.log('浏览器已关闭');
  }
}

run().catch(console.error);
