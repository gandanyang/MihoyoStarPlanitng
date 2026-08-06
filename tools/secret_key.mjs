#!/usr/bin/env node
/**
 * tools/secret_key.mjs — 通用密钥保险箱（Windows DPAPI 当前用户加密）
 *
 * 用途：把任意 API Key（如 FISH_API_KEY）加密保存到 tools/.secrets.enc（gitignore 保护）。
 *       密文绑定当前 Windows 账号，离开本机无法解密；输入隐藏、永不打印完整 Key。
 *
 * 用法：
 *   node tools/secret_key.mjs set FISH_API_KEY      # 隐藏输入 → 加密存入
 *   node tools/secret_key.mjs check FISH_API_KEY    # 验证（只显示长度）
 *   node tools/secret_key.mjs get FISH_API_KEY      # 输出明文到 stdout（供其他工具链式调用）
 *   node tools/secret_key.mjs clear FISH_API_KEY    # 删除
 *
 * 存储：tools/.secrets.enc（JSON：{ "FISH_API_KEY": "<DPAPI加密base64>" }）
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';

const STORE = resolve(process.cwd(), 'tools', '.secrets.enc');

function runPowershell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resPromise, rejPromise) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 30_000 },
      (err, stdout) => (err ? rejPromise(err) : resPromise(stdout))
    );
  });
}

function loadStore() {
  if (!existsSync(STORE)) return {};
  try {
    const raw = readFileSync(STORE, 'utf8').replace(/^\uFEFF/, ''); // 兼容 BOM
    return JSON.parse(raw);
  } catch { return {}; }
}

function saveStore(store) {
  writeFileSync(STORE, JSON.stringify(store, null, 2), 'utf8');
}

const ENCRYPT_SCRIPT = `
Add-Type -AssemblyName System.Security
$sec = Read-Host -AsSecureString -Prompt 'Enter secret (input hidden)'
if ($sec.Length -eq 0) { Write-Error 'empty input'; exit 1 }
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try { $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$bytes = [System.Text.Encoding]::UTF8.GetBytes($plain)
$enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Convert]::ToBase64String($enc)
`;

const DECRYPT_SCRIPT = `
Add-Type -AssemblyName System.Security
$b64 = $env:SECRET_B64
$enc = [Convert]::FromBase64String($b64)
$bytes = [System.Security.Cryptography.ProtectedData]::Unprotect($enc, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.Text.Encoding]::UTF8.GetString($bytes)
`;

async function decrypt(b64) {
  const encoded = Buffer.from(DECRYPT_SCRIPT, 'utf16le').toString('base64');
  const out = await new Promise((resPromise, rejPromise) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { env: { ...process.env, SECRET_B64: b64 }, windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 30_000 },
      (err, stdout) => (err ? rejPromise(err) : resPromise(stdout))
    );
  });
  return out.trim();
}

async function cmdSet(name) {
  if (!/^[A-Z0-9_]+$/.test(name)) throw new Error(`名称只能含大写字母/数字/下划线: ${name}`);
  const encrypted = (await runPowershell(ENCRYPT_SCRIPT)).trim();
  const store = loadStore();
  store[name] = encrypted;
  saveStore(store);
  console.log(`✅ ${name} 已加密保存（tools/.secrets.enc，DPAPI 当前用户绑定）`);
}

async function cmdCheck(name, show) {
  const store = loadStore();
  const b64 = store[name];
  if (!b64) throw new Error(`❌ ${name} 未保存（node tools/secret_key.mjs set ${name}）`);
  const value = await decrypt(b64);
  let msg = `✅ ${name} 解密成功，长度 = ${value.length}`;
  if (show) msg += `，末 3 位 = ${value.slice(-3)}`;
  console.log(msg);
}

async function cmdGet(name) {
  const store = loadStore();
  const b64 = store[name];
  if (!b64) throw new Error(`❌ ${name} 未保存`);
  process.stdout.write(await decrypt(b64));
}

function cmdClear(name) {
  const store = loadStore();
  if (!(name in store)) { console.log(`${name} 不存在，无需清理`); return; }
  delete store[name];
  saveStore(store);
  console.log(`✅ ${name} 已删除`);
}

async function main() {
  const [cmd, name, ...rest] = process.argv.slice(2);
  try {
    if (!cmd || !name || !/^[A-Z0-9_]+$/.test(name)) {
      console.log('用法: node tools/secret_key.mjs <set|check|get|clear> <KEY_NAME> [--show]');
      process.exit(cmd ? 2 : 0);
    }
    switch (cmd) {
      case 'set': await cmdSet(name); break;
      case 'check': await cmdCheck(name, rest.includes('--show')); break;
      case 'get': await cmdGet(name); break;
      case 'clear': cmdClear(name); break;
      default: throw new Error(`未知命令: ${cmd}`);
    }
  } catch (e) {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  }
}

main();
