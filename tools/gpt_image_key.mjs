#!/usr/bin/env node
/**
 * tools/gpt_image_key.mjs — API Key 安全存储助手（Windows DPAPI 当前用户加密）
 *
 * 作用：把 OpenAI/中转站 API Key 加密保存到 tools/.env.enc（已被 .gitignore 忽略）。
 *       加密绑定当前 Windows 用户（DPAPI CurrentUser），密文文件即使被误传/误提交，
 *       在别的机器/账号上也解不开。Key 永不写入明文文件、永不打印到终端。
 *
 * 用法：
 *   node tools/gpt_image_key.mjs set          # 隐藏输入 Key → 加密写入 tools/.env.enc
 *   node tools/gpt_image_key.mjs check        # 验证能否解密，只显示长度（不显示 Key）
 *   node tools/gpt_image_key.mjs check --show # 额外显示末 3 位，便于你确认是哪个 Key
 *   node tools/gpt_image_key.mjs clear        # 删除 tools/.env.enc
 *
 * 安全说明：
 *   - 输入阶段用 PowerShell Read-Host -AsSecureString，输入不回显；
 *   - 加密用 .NET ProtectedData（DataProtectionScope.CurrentUser），文件里只有密文；
 *   - 生图脚本只在批准后于内存中解密使用，解密内容不会写入磁盘或日志。
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';

const KEY_FILE = resolve(process.cwd(), 'tools', '.env.enc');
const PS_EXE = process.env.ComSpec ? 'powershell.exe' : 'powershell';

// ---------------------------------------------------------------------------
// PowerShell 调用（用 -EncodedCommand 避免引号/中文编码问题）
// ---------------------------------------------------------------------------

function runPowershell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resPromise, rejPromise) => {
    execFile(
      PS_EXE,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { env: { ...process.env, KEY_FILE }, windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 30_000 },
      (err, stdout, stderr) => {
        if (err) {
          rejPromise(new Error(stderr?.trim() || err.message));
        } else {
          resPromise(stdout);
        }
      }
    );
  });
}

// ---------------------------------------------------------------------------
// 加密 / 解密（DPAPI CurrentUser）
// ---------------------------------------------------------------------------

const ENCRYPT_SCRIPT = `
Add-Type -AssemblyName System.Security
$sec = Read-Host -AsSecureString -Prompt 'Enter API Key (input hidden, press Enter to confirm)'
if ($sec.Length -eq 0) { Write-Error 'empty input'; exit 1 }
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try {
  $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
$bytes = [System.Text.Encoding]::UTF8.GetBytes($plain)
$enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Convert]::ToBase64String($enc) | Set-Content -LiteralPath $env:KEY_FILE -NoNewline -Encoding ASCII
Write-Output ("OK:len=" + $plain.Length)
`;

const DECRYPT_SCRIPT = `
Add-Type -AssemblyName System.Security
$b64 = (Get-Content -LiteralPath $env:KEY_FILE -Raw).Trim()
$enc = [Convert]::FromBase64String($b64)
$bytes = [System.Security.Cryptography.ProtectedData]::Unprotect($enc, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.Text.Encoding]::UTF8.GetString($bytes)
`;

async function decryptKey() {
  const out = await runPowershell(DECRYPT_SCRIPT);
  const key = out.trim();
  if (!key) throw new Error('解密结果为空');
  return key;
}

// ---------------------------------------------------------------------------
// 子命令
// ---------------------------------------------------------------------------

async function cmdSet() {
  if (existsSync(KEY_FILE)) {
    console.warn('⚠️  tools/.env.enc 已存在，继续会覆盖旧 Key。');
  }
  const out = await runPowershell(ENCRYPT_SCRIPT);
  const m = /OK:len=(\d+)/.exec(out);
  const len = m ? Number(m[1]) : 0;
  if (len < 20) {
    await cmdClear();
    throw new Error(`Key 长度异常（${len} 字符），已清除密文，请重新设置`);
  }
  console.log(`✅ 已加密保存到 tools/.env.enc（Key 长度 ${len}，绑定当前 Windows 用户）`);
  console.log('   可运行 node tools/gpt_image_key.mjs check 验证。');
}

async function cmdCheck(show) {
  if (!existsSync(KEY_FILE)) {
    console.error('❌ tools/.env.enc 不存在。先运行: node tools/gpt_image_key.mjs set');
    process.exit(1);
  }
  const key = await decryptKey();
  let msg = `✅ 解密成功。Key 长度 = ${key.length}，来源 = tools/.env.enc（DPAPI 当前用户加密）`;
  if (show) msg += `，末 3 位 = ${key.slice(-3)}`;
  console.log(msg);
}

async function cmdClear() {
  if (!existsSync(KEY_FILE)) {
    console.log('tools/.env.enc 不存在，无需清理。');
    return;
  }
  rmSync(KEY_FILE);
  console.log('✅ 已删除 tools/.env.enc。');
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    switch (cmd) {
      case 'set':
        await cmdSet();
        break;
      case 'check':
        await cmdCheck(rest.includes('--show'));
        break;
      case 'clear':
        await cmdClear();
        break;
      default:
        console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 32).join('\n'));
        process.exit(cmd ? 2 : 0);
    }
  } catch (e) {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  }
}

main();
