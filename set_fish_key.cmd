@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Fish Audio API Key - hidden input
echo   Paste your key, press Enter. Nothing shows.
echo ============================================
node tools\secret_key.mjs set FISH_API_KEY
echo.
pause
