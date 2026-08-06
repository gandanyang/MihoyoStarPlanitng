#!/usr/bin/env node
/**
 * 孤儿资源扫描（P0 资产瘦身配套工具）
 *
 * 功能：
 *   1. 扫描 src/**\/*.ts / tests/**\/*.mjs 中引用的资源路径（assets/... 与 audio/...）
 *   2. 扫描 public/assets 下全部文件
 *   3. 输出 UNUSED 列表（未被代码引用的文件，供人工判断移入 art_source）
 *
 * 用法：
 *   node tools/check_unused_assets.mjs            # 完整扫描
 *   node tools/check_unused_assets.mjs --json     # 输出 JSON
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_ASSETS = path.join(ROOT, 'public', 'assets');
const PUBLIC_AUDIO = path.join(ROOT, 'public', 'audio');

function walk(dir, extRe, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, extRe, out);
    else if (extRe.test(entry.name)) out.push(p);
  }
  return out;
}

/** 收集代码里引用的资源路径（规范化到 public/ 下相对路径） */
function collectRefs() {
  const refs = new Set();
  const codeFiles = [
    ...walk(path.join(ROOT, 'src'), /\.(ts)$/),
    ...walk(path.join(ROOT, 'tests'), /\.(mjs|ts)$/),
  ];
  for (const f of codeFiles) {
    const txt = fs.readFileSync(f, 'utf8');
    for (const m of txt.matchAll(/['"`](assets\/[^'"`\s]+)['"`]/g)) refs.add(m[1]);
    for (const m of txt.matchAll(/['"`]audio\/([^'"`\s]+)['"`]/g)) refs.add('audio/' + m[1]);
    // 动态拼接：assets/icons/${id}.png 等
    for (const m of txt.matchAll(/assets\/(?:icons|sprites|photos|portraits|images)\/\$\{[^}]+\}/g)) {
      refs.add(m[0].replace(/\$\{[^}]+\}/g, '*'));
    }
  }
  // voicebank.data.ts 里的 file 字段（VoiceBank 动态拼接 audio/voice_normalized/）
  const vbFile = path.join(ROOT, 'src', 'audio', 'voicebank.data.ts');
  if (fs.existsSync(vbFile)) {
    const txt = fs.readFileSync(vbFile, 'utf8');
    for (const m of txt.matchAll(/file:\s*'([^']+)'/g)) {
      refs.add('audio/voice_normalized/' + m[1].replace(/\.wav$/i, '.ogg'));
      // 保留 wav 形式（万一旧逻辑）
      refs.add('audio/voice_normalized/' + m[1]);
    }
  }
  // 地图 JSON 与 tileset 是运行时按 mapKey 动态加载（assets/tiles/<key>_tileset.png、assets/maps/<key>.json）
  const MAP_KEYS = ['farm', 'forest', 'gate', 'house', 'mine', 'town', 'elder_house'];
  for (const k of MAP_KEYS) {
    refs.add(`assets/maps/${k}.json`);
    refs.add(`assets/tiles/${k}_tileset.png`);
  }
  refs.add('assets/tiles/placeholder_tileset.png');
  return refs;
}

/** 判断某相对路径是否被引用（支持 * 通配的动态引用） */
function isReferenced(rel, refs) {
  const normalized = rel.replace(/\\/g, '/');
  if (refs.has(normalized)) return true;
  for (const r of refs) {
    if (r.includes('*')) {
      const re = new RegExp('^' + r.split('*').map(escapeRegExp).join('.*') + '$');
      if (re.test(normalized)) return true;
    }
  }
  return false;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
  const jsonOut = process.argv.includes('--json');
  const refs = collectRefs();
  const allFiles = [
    ...walk(PUBLIC_ASSETS, /\.(png|jpg|jpeg|webp|gif|wav|ogg|mp3|json)$/).map((f) => {
      const rel = path.relative(PUBLIC_ASSETS, f);
      return { rel: 'assets/' + rel.replace(/\\/g, '/') };
    }),
    ...walk(PUBLIC_AUDIO, /\.(wav|ogg|mp3|json)$/).map((f) => {
      const rel = path.relative(PUBLIC_AUDIO, f);
      return { rel: 'audio/' + rel.replace(/\\/g, '/') };
    }),
  ];
  const unused = [];
  const used = [];
  for (const { rel } of allFiles) {
    const ref = isReferenced(rel, refs);
    (ref ? used : unused).push(rel);
  }
  if (jsonOut) {
    console.log(JSON.stringify({ total: allFiles.length, used: used.length, unused }, null, 2));
    return;
  }
  console.log(`=== 孤儿资源扫描 ===`);
  console.log(`引用数（代码侧，含动态）: ${refs.size}`);
  console.log(`public/assets+audio 文件数: ${allFiles.length}（used ${used.length} / unused ${unused.length}）\n`);
  console.log('USED:');
  for (const u of used) console.log(`  ${u}`);
  console.log('UNUSED:');
  for (const u of unused) console.log(`  ${u}`);
}

main();
