@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Fish Audio API Key - save helper
echo   Copy your key first, then run this.
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\set_fish_key.ps1"
echo.
echo --- verify ---
node tools\secret_key.mjs check FISH_API_KEY
echo.
pause
