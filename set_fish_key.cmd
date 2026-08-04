@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Fish Audio API Key - hidden input
echo   (paste key, press Enter, nothing shows)
echo ============================================
node tools\secret_key.mjs set FISH_API_KEY
echo.
if %errorlevel%==0 (
  echo [OK] 已加密保存到 tools\.secrets.enc
) else (
  echo [FAIL] 出错了，请把窗口内容截图发给我
)
echo.
pause >nul
