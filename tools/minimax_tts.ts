#!/usr/bin/env node
/**
 * tools/minimax_tts.ts — MiniMax（海螺）TTS 自动配音工具
 *
 * 功能：文本 → MiniMax T2A v2 → 生成语音文件到游戏资产目录。
 * 用途：替代 VoxCPM 本地管线（无 prompt 回显问题、音质稳定），供配音生成/重配。
 *
 * 配置（环境变量 / tools/.env / 加密保险箱 tools/secret_key.mjs）：
 *   MINIMAX_API_KEY  必填（MiniMax 开放平台 API Key）
 *   MINIMAX_GROUP_ID 可选（国内站接口需要 GroupId query 参数）
 *   MINIMAX_VOICE_MAP 可选（JSON：{"夏雅":"voiceId"}）
 *
 * 用法：
 *   npm run minimax -- --list-voices                 # 列出可用音色
 *   npm run minimax -- --character 夏雅 --text "那就别走了" --voice-id <ID>
 *   npm run minimax -- --dry-run --text "测试"
 *
 * 注意：本工具独立于游戏运行，不影响 Phaser 项目。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';

const DEFAULT_BASE_URL = 'https://api.minimaxi.com/v1'; // 国内站；国际可切 https://api.minimax.io/v1
const DEFAULT_MODEL = 'speech-2.8-turbo';               // 性价比款；高质量可 speech-2.8-hd
const OUT_DIR = resolve(process.cwd(), 'public', 'assets', 'audio', 'generated');

interface Args {
  text: string;
  character: string;
  voiceId: string | null;
  model: string;
  output: string | null;
  dryRun: boolean;
  listVoices: boolean;
  search: string | null;
  groupId: string | null;
  baseUrl: string | null;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { text: '', character: '', voiceId: null, model: DEFAULT_MODEL, output: null, dryRun: false, listVoices: false, search: null, groupId: null, baseUrl: null };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--text': a.text = argv[++i] ?? ''; break;
      case '--character': a.character = argv[++i] ?? ''; break;
      case '--voice-id': a.voiceId = argv[++i] ?? null; break;
      case '--model': a.model = argv[++i] ?? DEFAULT_MODEL; break;
      case '--output': a.output = argv[++i] ?? null; break;
      case '--group-id': a.groupId = argv[++i] ?? null; break;
      case '--base-url': a.baseUrl = argv[++i] ?? null; break;
      case '--search': a.search = argv[++i] ?? null; break;
      case '--dry-run': a.dryRun = true; break;
      case '--list-voices': a.listVoices = true; break;
      case '--help': case '-h':
        console.log(`MiniMax（海螺）TTS 配音工具
用法:
  npm run minimax -- --list-voices [--search 关键词]   # 列出音色
  npm run minimax -- --character 夏雅 --text "<文本>" [--voice-id <ID>] [--model speech-2.8-hd]
  npm run minimax -- --dry-run --text "测试"
配置: MINIMAX_API_KEY / MINIMAX_GROUP_ID（环境变量/tools/.env/加密保险箱）/ MINIMAX_VOICE_MAP`);
        process.exit(0);
      default: throw new Error(`未知参数: ${argv[i]}`);
    }
  }
  return a;
}

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

/** 从加密保险箱读取 key（tools/secret_key.mjs，DPAPI 当前用户绑定），失败返回空串。 */
function loadEncryptedSecret(name: string): Promise<string> {
  return new Promise((resPromise) => {
    try {
      execFile(
        process.execPath,
        [resolve(process.cwd(), 'tools', 'secret_key.mjs'), 'get', name],
        { windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 30_000 },
        (err, stdout) => resPromise(err ? '' : stdout.trim())
      );
    } catch {
      resPromise('');
    }
  });
}

async function getConfig(fileEnv: Record<string, string>): Promise<{ apiKey: string; groupId: string; voiceMap: Record<string, string> }> {
  const apiKey = process.env.MINIMAX_API_KEY || fileEnv.MINIMAX_API_KEY || (await loadEncryptedSecret('MINIMAX_API_KEY')) || '';
  const groupId = process.env.MINIMAX_GROUP_ID || fileEnv.MINIMAX_GROUP_ID || (await loadEncryptedSecret('MINIMAX_GROUP_ID')) || '';
  const raw = process.env.MINIMAX_VOICE_MAP || fileEnv.MINIMAX_VOICE_MAP || '{}';
  let voiceMap: Record<string, string> = {};
  try { voiceMap = JSON.parse(raw); } catch { /* 忽略 */ }
  return { apiKey, groupId, voiceMap };
}

async function api(baseUrl: string, groupId: string, apiKey: string, path: string, body?: unknown): Promise<any> {
  const url = baseUrl + path + (groupId ? `?GroupId=${encodeURIComponent(groupId)}` : '');
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.base_resp && json.base_resp.status_code !== 0)) {
    throw new Error(`API 错误 ${res.status}: ${JSON.stringify(json.base_resp || json).slice(0, 300)}`);
  }
  return json;
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  const fileEnv = loadEnv();
  const cfg = await getConfig(fileEnv);
  if (!cfg.apiKey) {
    console.error('❌ 未设置 MINIMAX_API_KEY（tools/.env 或环境变量）。');
    process.exit(1);
  }
  const baseUrl = (a.baseUrl || fileEnv.MINIMAX_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const groupId = a.groupId || cfg.groupId;

  if (a.listVoices) {
    // Get Voice API：POST /v1/get_voice，body {voice_type: 'all'}
    const json = await api(baseUrl, groupId, cfg.apiKey, '/get_voice', { voice_type: 'all' });
    const list = [
      ...(json.system_voice || []),
      ...(json.voice_cloning || []),
      ...(json.voice_generation || []),
    ];
    const kw = (a.search || '').toLowerCase();
    const filtered = kw ? list.filter((v: any) => String(v.voice_id || '').toLowerCase().includes(kw) || String(v.voice_name || '').toLowerCase().includes(kw)) : list;
    console.log(`共 ${list.length} 个音色${kw ? `，匹配 "${a.search}" ${filtered.length} 个` : ''}：`);
    for (const v of filtered.slice(0, 60)) {
      const desc = Array.isArray(v.description) ? v.description[0] || '' : v.description || '';
      console.log(`  ${v.voice_id}  ${v.voice_name || '(unnamed)'}${desc ? `  ${String(desc).slice(0, 60)}` : ''}`);
    }
    return;
  }

  if (!a.text) {
    console.error('❌ 缺少 --text');
    process.exit(1);
  }
  const voiceId = a.voiceId || (a.character && cfg.voiceMap[a.character]) || '';
  if (!voiceId) {
    console.error(`❌ 缺少 voice id（--voice-id 指定，或 MINIMAX_VOICE_MAP 配置角色映射）。先 --list-voices 查音色。`);
    process.exit(1);
  }

  if (a.dryRun) {
    console.log(`[dry-run] ${baseUrl}/t2a_v2 model=${a.model} voice=${voiceId} text=${a.text.slice(0, 40)}…`);
    return;
  }

  console.log(`生成中… model=${a.model} voice=${voiceId}`);
  const body = {
    model: a.model,
    text: a.text,
    stream: false,
    output_format: 'hex',
    voice_setting: { voice_id: voiceId, speed: 1.0, vol: 1.0, pitch: 0 },
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
  };
  const json = await api(baseUrl, groupId, cfg.apiKey, '/t2a_v2', body);
  const audioHex = json.data?.audio;
  if (!audioHex) throw new Error(`响应无音频: ${JSON.stringify(json).slice(0, 200)}`);
  const buf = Buffer.from(audioHex, 'hex');
  const out = a.output
    ? resolve(a.output)
    : resolve(OUT_DIR, `${a.character || 'minimax'}_${new Date().toISOString().slice(0, 10)}_${Date.now() % 100000}.mp3`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buf);
  console.log(`✅ 已保存: ${out} (${buf.length} bytes, ${(json.extra_info?.audio_length || 0) / 1000}s)`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
