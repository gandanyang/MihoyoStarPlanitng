#!/usr/bin/env node
/**
 * tools/fish_tts.ts — Fish Audio TTS 自动配音工具
 *
 * 功能：文本 + 角色 + 情绪 → 调用 Fish Audio API → 生成 MP3 到游戏资产目录。
 * 输入：--text / --character / --emotion / --output（可选覆盖）
 * 配置：环境变量 FISH_API_KEY / VOICE_ID_MAP（或 tools/.env，gitignore 保护）
 * 调用：POST https://api.fish.audio/v1/tts
 *
 * 用法：
 *   npm run tts -- --character 夏雅 --text "欢迎回来，林澈" --emotion "温柔"
 *   npm run tts -- --dry-run --character 林澈 --text "测试"          # 不调用，只打印计划
 *
 * 说明：本工具独立于游戏运行（tools/ 不在游戏构建内），不影响 Phaser 项目。
 */

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';

const API_ENDPOINT = 'https://api.fish.audio/v1/tts';
const OUT_DIR = resolve(process.cwd(), 'public', 'assets', 'audio', 'generated');

interface TtsArgs {
  character: string;
  text: string;
  emotion: string;
  output: string | null;
  voiceId: string | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): TtsArgs {
  const args: TtsArgs = { character: '', text: '', emotion: '', output: null, voiceId: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--character': args.character = argv[++i] ?? ''; break;
      case '--text': args.text = argv[++i] ?? ''; break;
      case '--emotion': args.emotion = argv[++i] ?? ''; break;
      case '--output': args.output = argv[++i] ?? null; break;
      case '--voice-id': args.voiceId = argv[++i] ?? null; break;
      case '--dry-run': args.dryRun = true; break;
      case '--help': case '-h':
        console.log(`Fish Audio TTS 配音工具
用法: npm run tts -- --character <角色> --text "<文本>" [--emotion "<情绪>"] [--output <路径>] [--voice-id <ID>] [--dry-run]
配置: FISH_API_KEY / VOICE_ID_MAP（JSON：{"夏雅":"voiceId","林澈":"voiceId"}）`);
        process.exit(0);
      default:
        if (argv[i].startsWith('--')) throw new Error(`未知参数: ${argv[i]}`);
    }
  }
  return args;
}

/** 读取配置：环境变量优先，其次 tools/.env（KEY=VALUE，gitignore 保护） */
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const envFile = resolve(process.cwd(), 'tools', '.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
      if (m && !m[2].startsWith('#')) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return env;
}

function loadEncryptedSecret(name: string): Promise<string> {
  return new Promise((resPromise) => {
    execFile(
      process.execPath,
      [resolve(process.cwd(), 'tools', 'secret_key.mjs'), 'get', name],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 30_000 },
      (err, stdout) => resPromise(err ? '' : stdout.trim())
    );
  });
}

async function getConfig(fileEnv: Record<string, string>): Promise<{ apiKey: string; voiceMap: Record<string, string> }> {
  const apiKey = process.env.FISH_API_KEY || fileEnv.FISH_API_KEY || (await loadEncryptedSecret('FISH_API_KEY')) || '';
  const raw = process.env.VOICE_ID_MAP || fileEnv.VOICE_ID_MAP || '{}';
  let voiceMap: Record<string, string> = {};
  try {
    voiceMap = JSON.parse(raw);
  } catch {
    // 兼容 "角色=id" 行格式
    for (const line of raw.split(/[,\n]/)) {
      const m = /^\s*"?([^"=]+)"?\s*=\s*(.+?)\s*$/.exec(line);
      if (m) voiceMap[m[1].trim()] = m[2].trim();
    }
  }
  return { apiKey, voiceMap };
}

async function nextSeq(character: string, date: string): Promise<number> {
  await mkdir(OUT_DIR, { recursive: true });
  let max = 0;
  try {
    const files = await readdir(OUT_DIR);
    const re = new RegExp(`^${character}_${date}_(\\d+)\\.mp3$`);
    for (const f of files) {
      const m = re.exec(f);
      if (m) max = Math.max(max, Number(m[1]));
    }
  } catch { /* 目录不存在则从 1 开始 */ }
  return max + 1;
}

async function callTts(apiKey: string, referenceId: string, text: string): Promise<Buffer> {
  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 's2-pro', text, reference_id: referenceId, format: 'mp3' }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Fish Audio API ${res.status}: ${err.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`响应过小(${buf.length}B)，疑似非音频数据`);
  return buf;
}

async function main(): Promise<void> {
  let args: TtsArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`❌ ${(e as Error).message}`);
    process.exit(2);
  }

  const fileEnv = loadEnv();
  const { apiKey, voiceMap } = await getConfig(fileEnv);

  if (!args.character || !args.text) {
    console.error('❌ 缺少 --character 或 --text（--help 查看用法）');
    process.exit(2);
  }
  const referenceId = args.voiceId || voiceMap[args.character] || '';
  if (!referenceId) {
    console.error(`❌ VOICE_ID_MAP 中没有角色「${args.character}」的 voice id（可 --voice-id 覆盖）`);
    process.exit(2);
  }
  if (!apiKey && !args.dryRun) {
    console.error('❌ 未设置 FISH_API_KEY（环境变量或 tools/.env）');
    process.exit(2);
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = await nextSeq(args.character, date);
  const outPath = args.output
    ? resolve(process.cwd(), args.output)
    : resolve(OUT_DIR, `${args.character}_${date}_${String(seq).padStart(3, '0')}.mp3`);

  console.log(`── Fish Audio TTS ─────────────────────────`);
  console.log(`  角色      : ${args.character}（voice: ${referenceId.slice(0, 8)}…）`);
  console.log(`  情绪      : ${args.emotion || '（未指定）'}`);
  console.log(`  文本      : ${args.text}`);
  console.log(`  输出      : ${outPath}`);

  if (args.dryRun) {
    console.log(`  请求体    : { model:"s2-pro", text:"${args.text.slice(0, 30)}…", reference_id:"${referenceId.slice(0, 8)}…", format:"mp3" }`);
    console.log('  [dry-run] 未调用 API。');
    process.exit(0);
  }

  console.log('  生成中…');
  const started = Date.now();
  const audio = await callTts(apiKey, referenceId, args.text);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, audio);
  console.log(`  ✅ 完成：${outPath}（${(audio.length / 1024).toFixed(1)} KB，${elapsed}s）`);
  console.log(`  角色=${args.character} 情绪=${args.emotion || '-'} 日期=${date} 序号=${seq}`);
}

main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
