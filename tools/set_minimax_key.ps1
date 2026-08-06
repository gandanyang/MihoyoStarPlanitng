# set_minimax_key.ps1 - save MINIMAX_API_KEY (+ optional MINIMAX_GROUP_ID) via DPAPI
# Usage (auto mode, called by Codex after user copies key to clipboard):
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\set_minimax_key.ps1 -FromClipboard [-GroupId xxxx]
# Usage (manual mode): just run; clipboard first (confirm Y), otherwise hidden input.
param(
  [string]$GroupId = '',
  [switch]$FromClipboard
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

$storePath = Join-Path $PSScriptRoot '.secrets.enc'
$store = @{}
if (Test-Path $storePath) {
  $obj = Get-Content $storePath -Raw | ConvertFrom-Json
  $obj.PSObject.Properties | ForEach-Object { $store[$_.Name] = $_.Value }
}

function Protect-Text([string]$plain) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($plain)
  $enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
  return [Convert]::ToBase64String($enc)
}

function Read-Hidden($prompt) {
  $sec = Read-Host -AsSecureString -Prompt $prompt
  if ($sec.Length -eq 0) { return '' }
  $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

$key = ''
$clip = ''
try { $clip = Get-Clipboard -Raw -ErrorAction Stop } catch { $clip = '' }

if ($FromClipboard) {
  if (-not $clip -or $clip.Trim().Length -eq 0) {
    Write-Host "[ERR] -FromClipboard mode but clipboard is empty. Please copy the API key first."
    exit 1
  }
  $key = $clip.Trim()
  Write-Host ("[OK] Clipboard API key: length = " + $key.Length)
} else {
  if ($clip -and $clip.Trim().Length -gt 0) {
    $clip = $clip.Trim()
    Write-Host ("Clipboard detected: length = " + $clip.Length)
    $answer = Read-Host "Type Y to save this key, or N to cancel"
    if ($answer -notmatch '^[yY]') {
      Write-Host "Cancelled. Copy the correct key and run again."
      exit 1
    }
    $key = $clip
  } else {
    Write-Host "Clipboard is empty. Paste your API key below (hidden input)."
    $key = Read-Hidden "Enter MiniMax API Key (input hidden)"
    if ($key.Length -eq 0) { Write-Host "Empty input, nothing saved."; exit 1 }
  }
}

$store['MINIMAX_API_KEY'] = Protect-Text $key

if ($GroupId) {
  $store['MINIMAX_GROUP_ID'] = Protect-Text $GroupId
} elseif (-not $FromClipboard) {
  $gid = Read-Hidden "Enter MiniMax GroupId (optional, press Enter to skip)"
  if ($gid.Length -gt 0) {
    $store['MINIMAX_GROUP_ID'] = Protect-Text $gid
  }
}

$store | ConvertTo-Json -Depth 5 | Set-Content $storePath -Encoding UTF8
Write-Host "[OK] MINIMAX_API_KEY saved to tools\.secrets.enc (DPAPI, current user)."
if ($store.ContainsKey('MINIMAX_GROUP_ID')) { Write-Host "[OK] MINIMAX_GROUP_ID saved too." }
try { Set-Clipboard -Value '' -ErrorAction SilentlyContinue } catch {}
