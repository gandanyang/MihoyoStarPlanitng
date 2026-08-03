/**
 * probe-guixing-record.mjs — 归星记录系统探针
 *
 * 验证：
 *   1. GuiXingRecordSystem 模块加载正常
 *   2. 五段结构生成正常（空状态→默认印象）
 *   3. 事件标签触发后印象变化（含耕种进度条件）
 *   4. 变化高亮逻辑
 *   5. 无运行时错误
 *
 * 前置：dev server 在 localhost:5173
 * 运行：node tests/probes/probe-guixing-record.mjs
 */

import puppeteer from 'puppeteer-core';

const DEV_URL = 'http://localhost:5173/';
const CHROME_PATH = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TIMEOUT = 15_000;

let browser;
let page;
let passed = 0;
let failed = 0;
const results = [];

function ok(label, detail = '') {
  passed++;
  results.push(`✅ ${label}${detail ? ' — ' + detail : ''}`);
}

function fail(label, detail = '') {
  failed++;
  results.push(`❌ ${label}${detail ? ' — ' + detail : ''}`);
}

async function run() {
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  page = await browser.newPage();
  page.on('pageerror', (err) => fail('RUNTIME ERROR', err.message));

  // === 段 A：页面加载 ===
  try {
    await page.goto(DEV_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });
    await page.waitForSelector('canvas', { timeout: TIMEOUT });
    ok('A1: 页面加载正常', 'canvas 存在');
  } catch (e) {
    fail('A1: 页面加载', e.message);
    await browser.close();
    process.exit(1);
  }

  // === 段 B：GuiXingRecordSystem 模块测试 ===
  try {
    const result = await page.evaluate(async () => {
      const mod = await import('/src/systems/GuiXingRecordSystem.ts');
      const tags = [];

      // B1: 初始状态生成记录
      const r1 = mod.generateGuiXingRecord();
      tags.push({ test: 'B1', pass: r1.day >= 1, detail: `day=${r1.day}` });
      tags.push({ test: 'B2', pass: r1.sections.length === 5, detail: `sections=${r1.sections.length}` });
      tags.push({ test: 'B3', pass: r1.impression.title === '初见希望', detail: `impression="${r1.impression.title}"` });

      // B3b: 初见希望文案含林澈人设隐性表达
      tags.push({ test: 'B3b', pass: r1.impression.desc.includes('机器') && r1.impression.desc.includes('亲手完成'), detail: `desc="${r1.impression.desc.substring(0,30)}…"` });

      // B4: 段标题正确
      const titles = r1.sections.map(s => s.title);
      tags.push({ test: 'B4', pass: JSON.stringify(titles) === JSON.stringify(['土地','记忆','庄园','羁绊','评价']), detail: titles.join('/') });

      // B5: 段图标正确
      const icons = r1.sections.map(s => s.icon);
      tags.push({ test: 'B5', pass: JSON.stringify(icons) === JSON.stringify(['🌱','🌸','🏡','👥','⭐']), detail: icons.join('/') });

      // B6: 仅 restore_garden → 新的开始（文案含爷爷意象）
      mod.clearTags();
      mod.triggerTag('restore_garden');
      const r3 = mod.generateGuiXingRecord();
      tags.push({ test: 'B6', pass: r3.impression.title === '新的开始', detail: `garden only: "${r3.impression.title}"` });
      tags.push({ test: 'B6b', pass: r3.impression.desc.includes('爷爷'), detail: `garden desc includes 爷爷` });

      // B7: 仅 help_resident → 初见希望（需要花园+帮助+耕种过半才是归星之地）
      mod.clearTags();
      mod.triggerTag('help_resident');
      const r6 = mod.generateGuiXingRecord();
      tags.push({ test: 'B7', pass: r6.impression.title === '初见希望', detail: `npc only: "${r6.impression.title}"` });

      // B8: 变化高亮（有 garden 变化时存在）
      mod.clearTags();
      mod.triggerTag('restore_garden');
      const r2 = mod.generateGuiXingRecord();
      tags.push({ test: 'B8', pass: r2.changeHighlight !== undefined, detail: `highlight with garden=${r2.changeHighlight !== undefined}` });

      // B9: 变化高亮（无变化时不存在）
      mod.clearTags();
      const r4 = mod.generateGuiXingRecord();
      tags.push({ test: 'B9', pass: r4.changeHighlight === undefined, detail: `no change=${r4.changeHighlight === undefined}` });

      // B10: 标签清空后恢复默认
      mod.clearTags();
      const r5 = mod.generateGuiXingRecord();
      tags.push({ test: 'B10', pass: r5.impression.title === '初见希望', detail: `after clear: "${r5.impression.title}"` });

      // B11: 记忆段 narrative 包含关键文案
      tags.push({ test: 'B11', pass: r1.sections[1].narrative.includes('有些地方'), detail: `memory narrative OK` });

      // B12: 庄园段默认文案
      tags.push({ test: 'B12', pass: r1.sections[2].narrative.includes('门还关着'), detail: `manor default OK` });

      // B13: 羁绊段默认文案
      tags.push({ test: 'B13', pass: r1.sections[3].narrative.includes('等待被倾听'), detail: `bond default OK` });

      // B14: 评价段包含印象标题
      tags.push({ test: 'B14', pass: r1.sections[4].narrative.includes('初见希望'), detail: `impression in section OK` });

      return tags;
    });

    for (const t of result) {
      if (t.pass) ok(`${t.test}: ${t.detail}`);
      else fail(`${t.test}: ${t.detail}`);
    }
  } catch (e) {
    fail('B-模块测试', e.message);
  }

  // === 汇总 ===
  console.log('\n========== 归星记录探针 ==========');
  for (const r of results) console.log(r);
  console.log(`\n总计: ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
  console.log(failed === 0 ? '🎉 ALL PASS' : '⚠️ HAS FAILURES');

  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error('PROBE FATAL:', e);
  browser?.close();
  process.exit(1);
});
