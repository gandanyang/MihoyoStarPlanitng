@echo off
REM Guixing Story - one-click APK build (desktop shortcut entry)
REM Sets JDK21 + UTF-8 explicitly to avoid two known pitfalls in build_apk.py:
REM   1) Gradle requires source 21; auto-detection may pick JDK17 -> force JDK21
REM   2) GBK console cannot print Unicode symbols in the script -> PYTHONIOENCODING=utf-8
REM NOTE: keep this file pure ASCII. cmd.exe parses .bat with the system codepage
REM       (GBK/936 on zh-CN); UTF-8 Chinese text corrupts line parsing and the
REM       script aborts before reaching the final pause.

cd /d "%~dp0.."

set "JAVA_HOME=C:\Java\jdk-21.0.12+8"
set "PYTHONIOENCODING=utf-8"

echo ============================================================
echo  Guixing Story one-click build (release)
echo  JAVA_HOME = %JAVA_HOME%
echo ============================================================

python "%~dp0build_apk.py" --variant release --archive

echo.
echo Build finished. Press any key to close this window...
pause >nul
