# set_fish_key.ps1 - save FISH_API_KEY via DPAPI (clipboard-first, hidden fallback)
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

$key = ''
$clip = ''
try { $clip = Get-Clipboard -Raw -ErrorAction Stop } catch { $clip = '' }
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
  Write-Host "Clipboard is empty. Paste your key below (hidden input)."
  $sec = Read-Host -AsSecureString -Prompt "Enter secret (input hidden)"
  if ($sec.Length -eq 0) { Write-Host "Empty input, nothing saved."; exit 1 }
  $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { $key = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

$store['FISH_API_KEY'] = Protect-Text $key
$store | ConvertTo-Json -Depth 5 | Set-Content $storePath -Encoding UTF8
Write-Host "[OK] FISH_API_KEY saved to tools\.secrets.enc (DPAPI, current user)."
try { Set-Clipboard -Value '' -ErrorAction SilentlyContinue } catch {}
