#!/usr/bin/env node
/**
 * tools/gpt_image_gen.mjs — OpenAI gpt-image-2 生图脚本（带人工批准门禁）
 *
 * 用途：调用 Images API（POST {base_url}/images/generations）生成图片。
 *       默认走官方 OpenAI 地址；可通过 OPENAI_BASE_URL / --base-url 改为第三方中转站。
 * 红线：每次真实调用前必须获得用户批准（交互 y/N 或显式 --yes）。
 *       本脚本绝不静默生图；没有批准直接退出。
 *
 * 用法：
 *   node tools/gpt_image_gen.mjs "一只站在星空下的Q版鲸鱼娘，像素风"
 *   node tools/gpt_image_gen.mjs --prompt-file prompt.txt --out public/assets/images/star_whale.png
 *   node tools/gpt_image_gen.mjs --size 1536x864 --quality high "农田黄昏氛围图"
 *   node tools/gpt_image_gen.mjs --base-url "https://你的中转站.com/v1" "提示词"
 *   node tools/gpt_image_gen.mjs --dry-run "测试提示词"          # 只打印计划与估算，零成本
 *
 * 中转站地址配置（写进 tools/.env，已被 .gitignore 忽略）：
 *   OPENAI_BASE_URL=https://你的中转站.com/v1
 *
 * API Key 安全读取顺序（Key 永不打印、永不写明文磁盘文件）：
 *   1. tools/.env.enc（DPAPI 加密密文，推荐；用 node tools/gpt_image_key.mjs set 生成）
 *   2. 环境变量 OPENAI_API_KEY（临时会话可用，会提示建议加密）
 *   3. tools/.env 明文（兼容旧用法，会提示建议加密）
 *
 * 参数：
 *   prompt                 提示词（位置参数）
 *   --prompt-file <path>   从文件读取提示词（与位置参数二选一）
 *   --model <id>           模型，默认 gpt-image-2（可用 gpt-image-1 / gpt-image-1-mini）
 *   --size <WxH>           尺寸，默认 1024x1024；宽高须为 16 的倍数、比例 1:3~3:1、单边 ≤3840
 *   --quality <q>          质量 auto|low|medium|high，默认 high
 *   --base-url <url>       接口地址，默认 https://api.openai.com/v1；传中转站地址即走中转站
 *   --n <count>            生成数量 1~10，默认 1
 *   --out <path>           输出文件路径；默认 tmp/generated/<时间戳>.<ext>
 *   --format <fmt>         输出格式 png|jpeg|webp，默认 png
 *   --yes                  显式批准（非交互环境必须传；交互环境仍会询问）
 *   --dry-run              只展示计划与费用估算，不调用 API、不询问
 *   --help                 显示帮助
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { stdin as processStdin, stdout as processStdout } from 'node:process';

const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { prompt: '', promptFile: null, model: DEFAULT_MODEL, size: '1024x1024', quality: 'high', baseUrl: null, n: 1, out: null, format: 'png', yes: false, dryRun: false, help: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--prompt-file': args.promptFile = argv[++i]; break;
      case '--model': args.model = argv[++i]; break;
      case '--size': args.size = argv[++i]; break;
      case '--quality': args.quality = argv[++i]; break;
      case '--base-url': args.baseUrl = argv[++i]; break;
      case '--n': args.n = parseInt(argv[++i], 10); break;
      case '--out': args.out = argv[++i]; break;
      case '--format': args.format = argv[++i]; break;
      case '--yes': args.yes = true; break;
      case '--dry-run': args.dryRun = true; break;
      case '--help': case '-h': args.help = true; break;
      default:
        if (a.startsWith('-')) throw new Error(`未知参数: ${a}（--help 查看用法）`);
        positional.push(a);
    }
  }
  if (positional.length > 0) args.prompt = positional.join(' ');
  return args;
}

// ---------------------------------------------------------------------------
// 费用估算（仅估算，非官方计费；官方按 token 计费）
// ---------------------------------------------------------------------------

// 粗略锚点（第三方实测参考，官方价格可能调整）：
// gpt-image-2 高质 1024x1024 单图 ≈ $0.13~0.22；low ≈ $0.006 量级。
const QUALITY_FACTOR = { low: 0.05, medium: 0.6, high: 1.0, auto: 0.8 };
const QUALITY_RANGE = {
  low: [0.003, 0.01],
  medium: [0.05, 0.12],
  high: [0.12, 0.22],
  auto: [0.05, 0.22],
};

function estimateCost(prompt, size, quality, count) {
  const [w, h] = size.split('x').map(Number);
  const pixels = w * h;
  const base = 1024 * 1024;
  const factor = QUALITY_FACTOR[quality] ?? 1.0;
  const imgUsd = (pixels / base) * 0.14 * factor; // 单图估算
  // 文本输入 token 粗略估算（中文约 1 字 ≈ 1 token，保守 ×1.2）
  const textTokens = Math.max(1, Math.ceil(prompt.length * 1.2));
  const textUsd = (textTokens / 1_000_000) * 5;
  const perImage = imgUsd + textUsd;
  const total = perImage * count;
  const [lo, hi] = QUALITY_RANGE[quality] ?? [0.12, 0.22];
  return { perImage, total, textTokens, lo, hi };
}

function formatUsd(v) {
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// 尺寸校验（gpt-image-2 规则）
// ---------------------------------------------------------------------------

function validateSize(size) {
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) throw new Error(`尺寸格式错误: "${size}"，应为 WxH，例如 1024x1024`);
  const [w, h] = [Number(m[1]), Number(m[2])];
  if (w % 16 !== 0 || h % 16 !== 0) throw new Error(`尺寸 ${size} 的宽高必须是 16 的倍数`);
  const ratio = w / h;
  if (ratio < 1 / 3 || ratio > 3) throw new Error(`尺寸 ${size} 的宽高比必须在 1:3 ~ 3:1 之间`);
  if (w > 3840 || h > 3840) throw new Error(`尺寸 ${size} 单边不能超过 3840`);
  const pixels = w * h;
  if (pixels < 655_360 || pixels > 8_294_400) throw new Error(`尺寸 ${size} 像素总数须在 655360 ~ 8294400 之间`);
  return { w, h };
}

// ---------------------------------------------------------------------------
// API Key
// ---------------------------------------------------------------------------

// 解密 tools/.env.enc（DPAPI 当前用户）：密文只在内存中解密，不落盘、不打印
async function decryptKeyFile(encFile) {
  const script = [
    'Add-Type -AssemblyName System.Security',
    `$b64 = (Get-Content -LiteralPath ${JSON.stringify(encFile)} -Raw).Trim()`,
    '$enc = [Convert]::FromBase64String($b64)',
    '$bytes = [System.Security.Cryptography.ProtectedData]::Unprotect($enc, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[System.Text.Encoding]::UTF8.GetString($bytes)',
  ].join('\n');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const out = await new Promise((resPromise, rejPromise) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 30_000 },
      (err, stdout) => (err ? rejPromise(err) : resPromise(stdout))
    );
  });
  const key = out.trim();
  if (!key) throw new Error('tools/.env.enc 解密结果为空');
  return key;
}

// 读取 Key：加密文件 > 环境变量 > 明文 .env（后两者仅兼容并警告）
async function loadApiKey() {
  const encFile = resolve(process.cwd(), 'tools', '.env.enc');
  if (existsSync(encFile)) {
    return { key: await decryptKeyFile(encFile), source: 'tools/.env.enc（DPAPI 加密）' };
  }
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
    console.warn('⚠️  正在使用环境变量中的明文 Key。建议改用加密存储：node tools/gpt_image_key.mjs set');
    return { key: process.env.OPENAI_API_KEY.trim(), source: '环境变量 OPENAI_API_KEY（明文，建议加密）' };
  }
  const envFile = resolve(process.cwd(), 'tools', '.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = /^\s*OPENAI_API_KEY\s*=\s*(.+?)\s*$/.exec(line);
      if (m && m[1] && !m[1].startsWith('#')) {
        console.warn('⚠️  正在使用 tools/.env 明文 Key。建议改用加密存储：node tools/gpt_image_key.mjs set');
        return { key: m[1].replace(/^['"]|['"]$/g, ''), source: 'tools/.env（明文，建议加密）' };
      }
    }
  }
  throw new Error(
    '未找到 API Key。请先加密保存（推荐）：\n' +
    '  node tools/gpt_image_key.mjs set    # 隐藏输入 Key → tools/.env.enc\n' +
    '或临时使用环境变量：set OPENAI_API_KEY=sk-...'
  );
}

// 读取接口地址：--base-url > 环境变量 OPENAI_BASE_URL > tools/.env > 官方默认
function loadBaseUrl(cliValue) {
  const clean = (s) => s.trim().replace(/\/+$/, '');
  if (cliValue && cliValue.trim()) return clean(cliValue);
  if (process.env.OPENAI_BASE_URL && process.env.OPENAI_BASE_URL.trim()) {
    return clean(process.env.OPENAI_BASE_URL);
  }
  const envFile = resolve(process.cwd(), 'tools', '.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = /^\s*OPENAI_BASE_URL\s*=\s*(.+?)\s*$/.exec(line);
      if (m && m[1] && !m[1].startsWith('#')) return clean(m[1].replace(/^['"]|['"]$/g, ''));
    }
  }
  return DEFAULT_BASE_URL;
}

// ---------------------------------------------------------------------------
// 批准门禁
// ---------------------------------------------------------------------------

async function askApproval(plan) {
  processStdout.write(`\n⚠️  即将调用真实 API（计费）。请确认以下计划：\n${plan}\n`);
  const rl = createInterface({ input: processStdin, output: processStdout });
  const answer = await new Promise((resolvePromise) => {
    rl.question('输入 y 确认生成，其他任意键取消 > ', resolvePromise);
  });
  rl.close();
  return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
}

// ---------------------------------------------------------------------------
// API 调用
// ---------------------------------------------------------------------------

function buildEndpoint(baseUrl) {
  return baseUrl.endsWith('/images/generations') ? baseUrl : `${baseUrl}/images/generations`;
}

async function callImageApi(apiKey, body, baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000); // 高质生图可能较慢
  try {
    const res = await fetch(buildEndpoint(baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = json?.error?.message || JSON.stringify(json);
      throw new Error(`API 错误 ${res.status}: ${err}`);
    }
    if (!Array.isArray(json?.data) || json.data.length === 0) {
      throw new Error(`响应异常: ${JSON.stringify(json).slice(0, 300)}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function buildPlan(args, keyInfo, baseUrl) {
  return [
    `  模型      : ${args.model}`,
    `  接口      : ${buildEndpoint(baseUrl)}`,
    `  尺寸      : ${args.size}`,
    `  质量      : ${args.quality}`,
    `  数量      : ${args.n}`,
    `  格式      : ${args.format}`,
    `  输出      : ${args.out || '（默认 tmp/generated/ 时间戳文件）'}`,
    `  API Key   : ${keyInfo}`,
    `  提示词    : ${args.prompt.length > 120 ? args.prompt.slice(0, 120) + '…' : args.prompt}`,
  ].join('\n');
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`参数错误: ${e.message}`);
    process.exit(2);
  }

  if (args.help) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 45).join('\n'));
    process.exit(0);
  }

  try {
    // 1. 提示词
    if (args.promptFile) {
      if (!existsSync(args.promptFile)) throw new Error(`提示词文件不存在: ${args.promptFile}`);
      args.prompt = readFileSync(args.promptFile, 'utf8').trim();
    }
    if (!args.prompt) throw new Error('缺少提示词：传位置参数或用 --prompt-file 指定');

    // 2. 校验参数
    validateSize(args.size);
    if (!['auto', 'low', 'medium', 'high'].includes(args.quality)) {
      throw new Error(`质量参数无效: ${args.quality}（可用 auto|low|medium|high）`);
    }
    if (!Number.isInteger(args.n) || args.n < 1 || args.n > 10) throw new Error('--n 必须是 1~10 的整数');
    if (!['png', 'jpeg', 'webp'].includes(args.format)) throw new Error(`格式参数无效: ${args.format}（可用 png|jpeg|webp）`);
    const baseUrl = loadBaseUrl(args.baseUrl);

    // 3. 费用估算
    const est = estimateCost(args.prompt, args.size, args.quality, args.n);

    // 4. 批准门禁（dry-run 不询问、不调用）
    if (args.dryRun) {
      console.log('── 预演模式（--dry-run，不调用 API）──');
      console.log(buildPlan(args, '（预演不需要 Key）', baseUrl));
      console.log(`\n估算费用（仅供参考，官方按 token 计费）:\n` +
        `  单图估算 : ${formatUsd(est.perImage)}（经验范围 ${formatUsd(est.lo)}~${formatUsd(est.hi)}）\n` +
        `  本次合计 : ${formatUsd(est.total)} × ${args.n} 张`);
      console.log('\n确认无误后去掉 --dry-run 再运行（会先询问批准）。');
      process.exit(0);
    }

    // 5. 真实调用前：必须获得批准（批准后才会读取 Key / 发起网络请求）
    const plan = buildPlan(args, '（批准后从 OPENAI_API_KEY 或 tools/.env 读取）', baseUrl);
    const approved = args.yes ? true : await askApproval(plan);
    if (!approved) {
      console.log('已取消，未调用 API。');
      process.exit(0);
    }
    const { key: apiKey, source: keySource } = await loadApiKey();
    console.log(`   Key 来源  : ${keySource}`);
    console.log('✅ 已批准，开始生成…（可能耗时 30~120 秒）');

    // 6. 调用 API
    const body = {
      model: args.model,
      prompt: args.prompt,
      size: args.size,
      quality: args.quality,
      n: args.n,
      response_format: 'b64_json',
      output_format: args.format,
    };
    const resp = await callImageApi(apiKey, body, baseUrl);

    // 7. 保存文件
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outDir = args.out ? dirname(resolve(args.out)) : resolve('tmp', 'generated');
    mkdirSync(outDir, { recursive: true });
    const files = [];
    for (let i = 0; i < resp.data.length; i++) {
      const item = resp.data[i];
      const b64 = item.b64_json ?? item.url;
      if (!b64) throw new Error(`第 ${i + 1} 张图缺少 b64_json 数据`);
      const outPath = args.out
        ? (resp.data.length > 1 ? resolve(args.out).replace(/(\.[^.]+)$/, `-${i + 1}$1`) : resolve(args.out))
        : resolve(outDir, `gpt_image_${stamp}${resp.data.length > 1 ? `-${i + 1}` : ''}.${args.format}`);
      const buf = b64.startsWith('data:') || b64.startsWith('http')
        ? (b64.startsWith('http') ? await (await fetch(b64)).arrayBuffer() : Buffer.from(b64.split(',')[1], 'base64'))
        : Buffer.from(b64, 'base64');
      writeFileSync(outPath, buf);
      files.push(outPath);
    }

    console.log(`\n✅ 生成完成，共 ${files.length} 张:`);
    for (const f of files) console.log(`  ${f}`);
    console.log(`\n估算费用: ${formatUsd(est.total)}（仅供参考）`);
  } catch (e) {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  }
}

main();
