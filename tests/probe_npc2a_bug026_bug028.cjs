/**
 * Probe (Node.js, no TS import): NPC 2a + BUG-026/028 回归
 * 运行：node tests/probe_npc2a_bug026_bug028.cjs
 *  - 源代码 grep 验证（关键逻辑存在）
 *  - 自包含 JavaScript 模拟 NPC 类行为（startIdle/stopIdle/update guard/label）
 */
const fs = require('fs');
const path = require('path');

const NPC_SRC = fs.readFileSync('src/entities/NPC.ts', 'utf8');
const MAP_SRC = fs.readFileSync('src/scenes/MapScene.ts', 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  [PASS] ' + name); }
  else { fail++; console.log('  [FAIL] ' + name); }
}

/* ========== BUG-028 回归：gate 地图夏雅 setScale ========== */
console.log('== BUG-028：gate 地图 xiyaSprite setScale(0.5) 存在 ==');
check('setupGateTutorial 方法已定义', /private\s+setupGateTutorial\s*\(\s*step\s*:\s*string\s*\)/.test(MAP_SRC));
check('gate 教程 xiyaSprite.setScale(0.5) 存在', /this\.xiyaSprite\.setScale\(0\.5\)/.test(MAP_SRC));
check('npc_xiya.png 存在 (sprites 目录)', fs.existsSync('public/assets/sprites/npc_xiya.png'));

/* ========== BUG-026 种植反馈回归 ========== */
console.log('== BUG-026：种植反馈 3 层钩子存在 ==');
check('反馈层：红闪 flashTileError 方法定义', /private\s+flashTileError\s*\(/.test(MAP_SRC));
check('反馈层：红闪 flashTileError 被种植流程调用 ≥ 5 次', (MAP_SRC.match(/flashTileError\s*\(/g) || []).length >= 5);
check('反馈层：飘字 showFloatText 方法定义', /private\s+showFloatText\s*\(/.test(MAP_SRC));
check('反馈层：飘字 showFloatText 被种植流程调用 ≥ 8 次', (MAP_SRC.match(/showFloatText\s*\(/g) || []).length >= 8);
check('反馈层：AudioSystem.play 已导入', /import\s*\{\s*play\s*\}\s*from\s*['"].*AudioSystem['"]/.test(MAP_SRC));
const sfxCalls = MAP_SRC.match(/play\s*\(\s*['"](hoe|plant|water|harvest|invalid)['"]\s*\)/g) || [];
check(`反馈层：种植流程 4 类成功/失败音效调用 ≥ 6 次（实际 ${sfxCalls.length}）`, sfxCalls.length >= 6);

/* ========== NPC 2a：源代码结构检查 ========== */
console.log('== NPC 2a：startIdleAnimation / stopIdleAnimation 在源码中定义 ==');
check('NPC.idleTween 字段', /idleTween\s*:\s*Phaser\.Tweens\.Tween\s*\|\s*null/.test(NPC_SRC));
check('startIdleAnimation 方法定义', /startIdleAnimation\s*\(\s*scene\s*:\s*Phaser\.Scene\s*\)/.test(NPC_SRC));
check('stopIdleAnimation 方法定义', /stopIdleAnimation\s*\(\s*\)/.test(NPC_SRC));
check('6 个 NPC id case 覆盖', /case\s+'miner':|case\s+'gardener':|case\s+'adventurer':|case\s+'elder':|case\s+'shopkeeper':|case\s+'mystery':/g.test(NPC_SRC) &&
  (NPC_SRC.match(/case\s+'(miner|gardener|adventurer|elder|shopkeeper|mystery)'/g) || []).length === 6);
check('update() idleTween 守卫', /if\s*\(\s*!this\.idleTween\s*\)/.test(NPC_SRC));
check('label 跟随（不受 idleTween 守卫影响）', /this\.label\s*\?\.?x\s*=\s*this\.sprite\.x|if\s*\(this\.label\)\s*\{\s*this\.label\.x\s*=\s*this\.sprite\.x/.test(NPC_SRC));

/* ========== NPC 2a：MapScene 挂钩检查 ========== */
console.log('== NPC 2a：MapScene setup/rebuild 挂钩存在 ==');
check('setupNPCs 末尾：npc.startIdleAnimation(this)', /setupNPCs[\s\S]{0,2400}?npc\.startIdleAnimation\s*\(\s*this\s*\)/.test(MAP_SRC));
check('rebuildNPCs 开头：npc.stopIdleAnimation()', /rebuildNPCs\s*\(\s*\)\s*:\s*void[\s\S]{0,400}?npc\.stopIdleAnimation\s*\(\s*\)/.test(MAP_SRC));

/* ========== NPC 2a：JS 级行为模拟（无 Phaser 依赖） ========== */
console.log('== NPC 2a：行为级模拟（JS 重新实现关键逻辑）==');

// 极简 Mock 类：实现 startIdleAnimation / stopIdleAnimation / update 与源码同构的核心逻辑
function makeMockScene() {
  const tweens = [];
  return {
    _tweens: tweens,
    tweens: {
      add(cfg) {
        const t = {
          cfg, playing: true, _stopped: false, _removed: false,
          stop() { t._stopped = true; t.playing = false; },
          remove() { t._removed = true; },
        };
        tweens.push(t); return t;
      },
    },
  };
}

class MockNPC {
  constructor(id) {
    this.id = id;
    this.targetX = 100; this.targetY = 100;
    this.sprite = { x: 100, y: 100, angle: 0, alpha: 1, scaleX: 0.5, scaleY: 0.5 };
    this.label = { x: 100, y: 86 };
    this.idleTween = null;
    this.idleBaseX = 0; this.idleBaseY = 0;
  }
  startIdleAnimation(scene) {
    if (!this.sprite) return;
    this.stopIdleAnimation();
    this.idleBaseX = this.sprite.x; this.idleBaseY = this.sprite.y;
    const s = this.sprite;
    const cfg = ({
      miner: { angle: { from: 0, to: -25 } },
      gardener: { scaleY: { from: 0.5, to: 0.46 }, y: { from: this.idleBaseY, to: this.idleBaseY + 2 } },
      adventurer: { scaleX: { from: 0.5, to: -0.5 } },
      elder: { x: { from: this.idleBaseX - 7, to: this.idleBaseX + 7 } },
      shopkeeper: { scaleY: { from: 0.5, to: 0.47 }, scaleX: { from: 0.5, to: 0.515 } },
      mystery: { alpha: { from: 0.85, to: 1 }, y: { from: this.idleBaseY - 1.5, to: this.idleBaseY + 1.5 } },
    })[this.id] || { scaleY: { from: 0.5, to: 0.49 } };
    this.idleTween = scene.tweens.add(cfg);
  }
  stopIdleAnimation() {
    if (this.idleTween) { try { this.idleTween.stop(); } catch (_) {} try { this.idleTween.remove(); } catch (_) {} this.idleTween = null; }
    if (this.sprite) { this.sprite.angle = 0; this.sprite.alpha = 1; this.sprite.scaleX = 0.5; this.sprite.scaleY = 0.5; }
  }
  update(dtMs) {
    if (!this.sprite) return;
    if (!this.idleTween) {
      const factor = Math.min(1, dtMs * 0.003);
      this.sprite.x += (this.targetX - this.sprite.x) * factor;
      this.sprite.y += (this.targetY - this.sprite.y) * factor;
    }
    if (this.label) { this.label.x = this.sprite.x; this.label.y = this.sprite.y - 14; }
  }
}

// 1) 所有 6 种 id 均能创建 tween
const ids = ['miner', 'gardener', 'adventurer', 'elder', 'shopkeeper', 'mystery'];
for (const id of ids) {
  const s = makeMockScene();
  const npc = new MockNPC(id);
  npc.startIdleAnimation(s);
  check(`${id}: startIdleAnimation 创建 1 个 tween`, s._tweens.length === 1);
  check(`${id}: idleTween 非空 playing=true`, npc.idleTween && npc.idleTween.playing);
}

// 2) stopIdleAnimation 清理
{
  const s = makeMockScene();
  const npc = new MockNPC('elder');
  npc.startIdleAnimation(s);
  npc.sprite.angle = 30; npc.sprite.alpha = 0.5; npc.sprite.scaleX = -1; npc.sprite.scaleY = 0.4;
  npc.stopIdleAnimation();
  check('stopIdle: idleTween = null', npc.idleTween === null);
  check('stopIdle: tween stop() 被调用', s._tweens[0]._stopped === true);
  check('stopIdle: tween remove() 被调用', s._tweens[0]._removed === true);
  check('stopIdle: angle/alpha 重置', npc.sprite.angle === 0 && npc.sprite.alpha === 1);
  check('stopIdle: scaleX/Y 重置为 0.5', npc.sprite.scaleX === 0.5 && npc.sprite.scaleY === 0.5);
}

// 3) update() 守卫：idleTween 时不插值，但 label 跟随
{
  const s = makeMockScene();
  const npc = new MockNPC('elder');
  npc.startIdleAnimation(s);
  npc.sprite.x = 120; npc.sprite.y = 105; // 模拟 tween 把 sprite 推离 target
  npc.update(10000);
  check('idleTween 存在：sprite.x 未被插值回 target(100)', npc.sprite.x === 120);
  check('idleTween 存在：sprite.y 未被插值回 target(100)', npc.sprite.y === 105);
  check('idleTween 存在：label.x 跟随 sprite.x', npc.label.x === 120);
  check('idleTween 存在：label.y = sprite.y - 14', npc.label.y === 105 - 14);

  npc.stopIdleAnimation();
  npc.sprite.x = 400; npc.sprite.y = 500; // 远离 target
  npc.update(10000); // factor = 1
  check('无 idleTween：sprite.x 插值到 targetX(100)', npc.sprite.x === 100);
  check('无 idleTween：sprite.y 插值到 targetY(100)', npc.sprite.y === 100);
  check('无 idleTween：label.x 同步', npc.label.x === 100);
  check('无 idleTween：label.y = sprite.y - 14', npc.label.y === 100 - 14);
}

// 4) 踱步 elder 的 tween cfg 正确（以 baseX 为中心的 ±7）
{
  const s = makeMockScene();
  const npc = new MockNPC('elder');
  npc.targetX = 200; npc.targetY = 200;
  npc.sprite.x = 200; npc.sprite.y = 200;
  npc.startIdleAnimation(s);
  const cfg = s._tweens[0].cfg;
  check(`elder.x.from = baseX - 7 (${npc.idleBaseX - 7})`, cfg.x && cfg.x.from === npc.idleBaseX - 7);
  check(`elder.x.to   = baseX + 7 (${npc.idleBaseX + 7})`, cfg.x && cfg.x.to === npc.idleBaseX + 7);
}

// 5) adventurer.scaleX 翻转（±0.5）
{
  const s = makeMockScene();
  const npc = new MockNPC('adventurer');
  npc.startIdleAnimation(s);
  const cfg = s._tweens[0].cfg;
  check('adventurer scaleX.from=0.5', cfg.scaleX && cfg.scaleX.from === 0.5);
  check('adventurer scaleX.to=-0.5（翻转）', cfg.scaleX && cfg.scaleX.to === -0.5);
}

// 6) mystery 静立 alpha + y（不可动类：y 范围小）
{
  const s = makeMockScene();
  const npc = new MockNPC('mystery');
  npc.startIdleAnimation(s);
  const cfg = s._tweens[0].cfg;
  check('mystery alpha.from=0.85', cfg.alpha && cfg.alpha.from === 0.85);
  check('mystery alpha.to=1', cfg.alpha && cfg.alpha.to === 1);
}

console.log('\n=============================');
console.log(`  Summary: ${pass} passed, ${fail} failed`);
console.log('=============================');
if (fail > 0) process.exit(1);
