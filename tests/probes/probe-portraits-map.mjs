/**
 * 立绘资源完整性探针（静态，无需浏览器/服务器）
 *
 * 验证：StoryDialogue.ts PORTRAIT_MAP 中每个说话人映射的立绘文件
 *       - 文件存在（防对话头像 404 回退色块）
 *       - PNG 为 512×512 正方形对话头像（美术统一规范 §2/§5）
 *
 * 用法：node tests/probes/probe-portraits-map.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dialoguePath = resolve(root, 'src', 'ui', 'StoryDialogue.ts');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name} ${detail}`);
  ok ? pass++ : fail++;
};

/** 从 PNG 头部 IHDR 读宽高（字节 16-24） */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const src = readFileSync(dialoguePath, 'utf8').replace(/\r/g, '');
// 提取 PORTRAIT_MAP 块中的 `key: 'path'`
const block = src.match(/const PORTRAIT_MAP[\s\S]*?= \{\n([\s\S]*?)\n\};/);
if (!block) {
  console.error('❌ 未找到 PORTRAIT_MAP 定义');
  process.exit(1);
}
const entries = [...block[1].matchAll(/^\s*([^:]+?):\s*'([^']+)',?\s*$/gm)].map(m => ({
  speaker: m[1].trim(), path: m[2],
}));

check(`解析到 ${entries.length} 个说话人映射`, entries.length >= 6, `（当前 ${entries.length}）`);

const mapPath = new Set();
const seen = new Set();
for (const { speaker, path } of entries) {
  const dup = seen.has(speaker) ? '（重复映射）' : '';
  seen.add(speaker);
  const abs = resolve(root, 'public', path);
  if (!existsSync(abs)) {
    check(`[${speaker}] ${path} 文件存在`, false);
    continue;
  }
  const size = pngSize(readFileSync(abs));
  const okSize = size && size.w === 512 && size.h === 512;
  check(`[${speaker}] ${path}`, okSize, okSize ? `${size.w}x${size.h}${dup}` : `尺寸=${size ? `${size.w}x${size.h}` : '非PNG'}${dup}`);
  mapPath.add(path);
}

// 关键角色必须全部有映射（可对话 NPC + 主角团）
const required = ['林澈', '夏雅', '村长', '爷爷的笔记', '矿工老张', '老张', '花匠小梅', '小梅', '冒险家阿风', '阿风', '商店老板'];
for (const name of required) {
  check(`关键说话人「${name}」有映射`, seen.has(name));
}

// 无重复资源文件（同一图被多个说话人引用属正常，但同一说话人不允许双映射）
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
