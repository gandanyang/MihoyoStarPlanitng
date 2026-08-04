#!/usr/bin/env node
/**
 * tools/tts.mjs - TTS launcher.
 * Ensures HTTPS_PROXY + NODE_USE_ENV_PROXY are set BEFORE the fish_tts
 * process starts (undici only honors the env-proxy flag at startup),
 * then runs tools/fish_tts.ts with the user's arguments.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TOOLS_DIR, '..');

function readEnvFile(file) {
  const env = {};
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (m && !m[2].startsWith('#')) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function regValue(name) {
  try {
    const r = spawnSync(
      'reg',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', name],
      { encoding: 'utf8', windowsHide: true, timeout: 10_000 }
    );
    if (r.status !== 0) return null;
    const line = r.stdout.split(/\r?\n/).find((l) => new RegExp(`\\b${name}\\b`).test(l));
    if (!line) return null;
    const parts = line.trim().split(/\s+/);
    return parts[parts.length - 1];
  } catch {
    return null;
  }
}

function detectProxy(fileEnv) {
  const fromEnv = process.env.FISH_HTTPS_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy;
  if (fromEnv) return fromEnv;
  if (fileEnv.FISH_HTTPS_PROXY) return fileEnv.FISH_HTTPS_PROXY;
  if (process.platform === 'win32' && regValue('ProxyEnable') === '0x1') {
    return regValue('ProxyServer');
  }
  return '';
}

function maskProxy(proxy) {
  try {
    const u = new URL(proxy.startsWith('http') ? proxy : `http://${proxy}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '(proxy)';
  }
}

const fileEnv = readEnvFile(resolve(ROOT, 'tools', '.env'));
let proxy = detectProxy(fileEnv);
if (proxy && !/^https?:\/\//i.test(proxy)) proxy = `http://${proxy}`;
const childEnv = { ...process.env };
if (proxy) {
  childEnv.HTTPS_PROXY = proxy;
  childEnv.NODE_USE_ENV_PROXY = '1';
  console.log(`[tts] using proxy: ${maskProxy(proxy)}`);
} else {
  delete childEnv.NODE_USE_ENV_PROXY;
}

const r = spawnSync(
  process.execPath,
  [resolve(TOOLS_DIR, 'fish_tts.ts'), ...process.argv.slice(2)],
  { cwd: ROOT, env: childEnv, stdio: 'inherit', windowsHide: true }
);
process.exit(r.status ?? 1);
