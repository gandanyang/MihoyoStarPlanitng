#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键打包归星物语 APK（Windows 优先，跨平台降级）。

流程：
  1. 环境探测（node / npm / java / android\gradlew.bat）
  2. npm run build                → dist/
  3. npx cap sync android         → android/app/src/main/assets/public/
  4. gradlew.bat :app:assembleRelease  → android/app/build/outputs/apk/release/app-release.apk
  5. zipfile 校验 APK 结构（含 AndroidManifest.xml / classes.dex / resources.arsc）
  6. 复制到 dist_apk/{appId}-v{version}-{timestamp}.apk，并打印路径

全程无交互，失败直接非零退出。
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANDROID_DIR = ROOT / "android"
GRADLEW = ANDROID_DIR / ("gradlew.bat" if sys.platform == "win32" else "gradlew")
APK_SRC = ANDROID_DIR / "app" / "build" / "outputs" / "apk" / "release" / "app-release.apk"
APK_DST_DIR = ROOT / "dist_apk"

APK_MIN_BYTES = 4 * 1024 * 1024  # 4MB，小于这个基本是坏包
APK_MANDATORY_ENTRIES = (
    "AndroidManifest.xml",
    "classes.dex",
    "resources.arsc",
)

# 运行时注入的 env（用于自动找到 Android Studio 自带的 JBR / SDK）
_BUILD_ENV: dict[str, str] = {}


def log(title: str, msg: str = "") -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    if msg:
        print(f"[{stamp}] ╔══ {title}\n{msg}")
    else:
        print(f"[{stamp}] ╔══ {title}")


def check_cmd(exe: str, friendly: str, required: bool = True) -> str | None:
    """找可执行文件，未找到返回 None；required 为 True 时直接报错退出。"""
    found = shutil.which(exe)
    if found:
        return found
    if not required:
        return None
    print(f"[FATAL] 未找到 {friendly}（`{exe}` 不在 PATH）")
    sys.exit(2)


def run(cmd: list[str], cwd: Path | None = None, label: str = "") -> subprocess.CompletedProcess[str]:
    print(f"\n▶  {label or ' '.join(str(x) for x in cmd)}")
    print(f"   cwd = {cwd or Path.cwd()}")
    env = {**os.environ, "CI": "true", **_BUILD_ENV}
    result = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        errors="replace",
        env=env,
    )
    # 只打印尾部 30 行 stdout/stderr，避免刷屏
    tail = 40
    if result.stdout:
        lines = result.stdout.strip().splitlines()
        if len(lines) > tail:
            print(f"   stdout …（省略 {len(lines)-tail} 行）")
            for line in lines[-tail:]:
                print("   |", line)
        else:
            for line in lines:
                print("   |", line)
    if result.stderr:
        lines = result.stderr.strip().splitlines()
        if len(lines) > tail:
            print(f"   stderr …（省略 {len(lines)-tail} 行）")
            for line in lines[-tail:]:
                print("   E", line)
        else:
            for line in lines:
                print("   E", line)
    print(f"   exit code = {result.returncode}")
    return result


def probe_environment() -> dict[str, str]:
    """探测环境；自动从 Android Studio 默认安装目录挖 JBR + SDK，免手工设 JAVA_HOME/ANDROID_SDK_ROOT。"""
    print("=" * 60)
    print("归星物语 一键 APK 打包 (Windows)")
    print("=" * 60)
    info: dict[str, str] = {}

    node = check_cmd("node", "Node.js")
    info["node"] = node or ""
    if node:
        r = subprocess.run(["node", "--version"], capture_output=True, text=True)
        info["node_ver"] = r.stdout.strip()
        print(f"  Node: {info['node_ver']}  @ {node}")

    npm = check_cmd("npm", "npm")
    info["npm"] = npm or ""

    # Java：先看 PATH / JAVA_HOME；再去常见 Android Studio / 绿色包安装目录挖 JBR；
    # 还是找不到就看项目根 tools/local.env（脚本最后尝试加载里面的路径覆盖）
    java_home: Path | None = None
    if os.environ.get("JAVA_HOME"):
        java_home = Path(os.environ["JAVA_HOME"])
    java_exe = shutil.which("java")
    if not java_exe or not java_home:
        jbr_candidates: list[Path] = []
        if sys.platform == "win32":
            # 用户级 + 系统级 Android Studio 默认目录
            program_files = Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"))
            program_files_x86 = Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"))
            local_appdata = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local")))
            user_home = Path.home()
            studio_roots = [
                program_files / "Android",
                program_files_x86 / "Android",
                local_appdata / "Programs" / "Android",
                local_appdata / "JetBrains" / "Toolbox" / "apps" / "AndroidStudio",
                user_home / ".jdks",
                user_home / "scoop" / "apps" / "openjdk" / "current",
                user_home / "scoop" / "apps" / "oraclejdk" / "current",
                user_home / "scoop" / "apps" / "temurin17-jdk" / "current",
                user_home / "scoop" / "apps" / "temurin21-jdk" / "current",
                Path(r"C:\tools\jdk"),
                Path(r"D:\Android\Android Studio"),
                Path(r"D:\Program Files\Android\Android Studio"),
                Path(r"E:\Android\Android Studio"),
            ]
            for base in studio_roots:
                jbr_candidates += [
                    base / "jbr",
                    base / "jre",
                    base / "Android Studio" / "jbr",
                    base / "Android Studio" / "jre",
                ]
            # Toolbox 版本：搜索一层版本号文件夹
            tbox = local_appdata / "JetBrains" / "Toolbox" / "apps" / "AndroidStudio"
            if tbox.exists():
                try:
                    for ch in tbox.iterdir():
                        for sub in ("jbr", "jre"):
                            p = ch / sub
                            if p.exists():
                                jbr_candidates.append(p)
                except OSError:
                    pass
        else:
            for base in (
                Path.home() / ".local" / "share" / "JetBrains" / "Toolbox" / "apps" / "AndroidStudio",
                Path("/opt/android-studio"),
                Path("/opt/homebrew/opt/openjdk"),
                Path("/Library/Java/JavaVirtualMachines"),
                Path("/Applications/Android Studio.app/Contents"),
            ):
                jbr_candidates += [base / "jbr", base / "jre", base]
        for cand in jbr_candidates:
            javac = cand / "bin" / ("javac.exe" if sys.platform == "win32" else "javac")
            if javac.exists():
                java_home = cand
                print(f"  自动发现 JDK：{java_home}")
                break

    if not java_home:
        print("[FATAL] 未找到 JDK / Java：")
        print("    1) 推荐安装 Android Studio，默认安装后会自带 JBR（Embedded JDK），脚本会自动挖")
        print("    2) 或者手动安装 JDK 17/21 LTS，并设置环境变量 JAVA_HOME")
        print("    3) 最快方案：在 tools/local.env.ps1 里写你的 JDK 路径，例如：")
        print(r'         $env:JAVA_HOME = "D:\Android\Android Studio\jbr"')
        print(r'         $env:ANDROID_SDK_ROOT = "$env:LOCALAPPDATA\Android\Sdk"')
        print(r"       然后：tools\local.env.ps1 ; python tools\build_apk.py")
        sys.exit(2)

    # 把 JAVA_HOME + PATH 注入到子进程
    _BUILD_ENV["JAVA_HOME"] = str(java_home)
    java_bin = java_home / "bin"
    old_path = os.environ.get("PATH", "")
    _BUILD_ENV["PATH"] = f"{java_bin}{os.pathsep}{old_path}"

    java_exe_resolved = java_bin / ("java.exe" if sys.platform == "win32" else "java")
    if java_exe_resolved.exists():
        r = subprocess.run(
            [str(java_exe_resolved), "-version"],
            capture_output=True,
            text=True,
            env={**os.environ, **_BUILD_ENV},
        )
        ver = (r.stderr + r.stdout).splitlines()
        info["java_ver"] = ver[0] if ver else ""
        print(f"  Java: {info['java_ver']}  @ {java_exe_resolved}")

    # ANDROID_SDK_ROOT：看环境变量、android/local.properties、或默认 AS 安装目录
    sdk_root: Path | None = None
    for k in ("ANDROID_SDK_ROOT", "ANDROID_HOME"):
        if os.environ.get(k):
            sdk_root = Path(os.environ[k])
            break
    if not sdk_root:
        lp = ANDROID_DIR / "local.properties"
        if lp.exists():
            for line in lp.read_text(encoding="utf-8", errors="replace").splitlines():
                line = line.strip()
                if line.startswith("sdk.dir="):
                    sdk_root = Path(line.split("=", 1)[1].strip())
                    print(f"  从 android/local.properties 挖 SDK：{sdk_root}")
                    break
    if not sdk_root and sys.platform == "win32":
        cand = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "Android" / "Sdk"
        if cand.exists():
            sdk_root = cand
            print(f"  自动发现 SDK：{sdk_root}")
    if sdk_root:
        _BUILD_ENV["ANDROID_SDK_ROOT"] = str(sdk_root)
        _BUILD_ENV["ANDROID_HOME"] = str(sdk_root)

    if not GRADLEW.exists():
        print(f"[FATAL] 未找到 {GRADLEW}，android/ 目录是否完整？")
        sys.exit(3)
    print(f"  Gradle wrapper: {GRADLEW}")

    return info


def node_build() -> None:
    log("第 1/4 步：npm run build（Vite 编译前端 → dist/）")
    result = run(["npm", "run", "build"], cwd=ROOT, label="npm run build")
    if result.returncode != 0:
        print("[FAIL] 前端构建失败，请先修 TypeScript / Vite 错误。")
        sys.exit(10)
    dist_dir = ROOT / "dist"
    if not dist_dir.exists() or not (dist_dir / "index.html").exists():
        print(f"[FAIL] 构建结束但 {dist_dir}/index.html 不存在？")
        sys.exit(11)
    print(f"  [OK] dist/index.html 存在，前端产物 OK。")


def cap_sync() -> None:
    log("第 2/4 步：npx cap sync android（同步前端产物到 Android assets）")
    result = run(
        ["npx", "--yes", "@capacitor/cli", "sync", "android"],
        cwd=ROOT,
        label="npx cap sync android",
    )
    if result.returncode != 0:
        # fallback：尝试项目内本地安装的 capacitor/cli
        result2 = run(
            ["npx", "cap", "sync", "android"],
            cwd=ROOT,
            label="(fallback) npx cap sync android",
        )
        if result2.returncode != 0:
            print("[FAIL] cap sync 失败，npm install / package.json dependencies 查一下？")
            sys.exit(20)
    assets_dir = ANDROID_DIR / "app" / "src" / "main" / "assets" / "public"
    if not (assets_dir / "index.html").exists():
        print(f"[FAIL] cap sync 后 {assets_dir}/index.html 缺失")
        sys.exit(21)
    print(f"  [OK] {assets_dir}/index.html 存在，前端 → Android 同步完成。")


def gradle_build() -> None:
    log("第 3/4 步：gradlew :app:assembleRelease（Gradle 打包 APK）")
    if sys.platform == "win32":
        cmd = [str(GRADLEW), ":app:assembleRelease", "--console=plain", "--stacktrace"]
    else:
        cmd = ["bash", str(GRADLEW), ":app:assembleRelease", "--console=plain", "--stacktrace"]
    result = run(cmd, cwd=ANDROID_DIR, label="gradlew :app:assembleRelease")
    if result.returncode != 0:
        # 常见兜底：提示 java 版本/ANDROID_SDK_ROOT
        low = (result.stdout + result.stderr).lower()
        tips = []
        if "sdk" in low and ("not found" in low or "location" in low):
            tips.append("未找到 Android SDK → 请设置环境变量 ANDROID_SDK_ROOT，"
                        "或在 android/local.properties 里写 sdk.dir=路径")
        if "jdk" in low or "java version" in low or "class file" in low:
            tips.append("Java 版本不匹配（Capacitor 8 推荐 JDK 17 或 21 LTS）")
        if tips:
            print("\n  可能的原因：\n   - " + "\n   - ".join(tips))
        print("\n[FAIL] Gradle :app:assembleRelease 失败。上面 stderr 最后几十行通常就是根因。")
        sys.exit(30)
    if not APK_SRC.exists():
        print(f"[FAIL] Gradle 返回 0，但 {APK_SRC} 不存在？")
        sys.exit(31)
    size_mb = APK_SRC.stat().st_size / (1024 * 1024)
    print(f"  [OK] APK 产物大小 {size_mb:.1f} MB：{APK_SRC}")


def validate_apk() -> None:
    log("第 4/4 步：APK 结构校验 + 复制到 dist_apk/")

    # ---- zipfile 结构校验 ----
    try:
        with zipfile.ZipFile(APK_SRC, "r") as zf:
            names = zf.namelist()
    except zipfile.BadZipFile as e:
        print(f"[FAIL] APK 不是合法 ZIP：{e}")
        sys.exit(40)

    missing = [ent for ent in APK_MANDATORY_ENTRIES if ent not in names]
    if missing:
        print(f"[FAIL] APK 缺关键条目：{missing}（可能是 aapt 失败 / 没签名 / 伪包）")
        sys.exit(41)

    size = APK_SRC.stat().st_size
    if size < APK_MIN_BYTES:
        print(f"[FAIL] APK 只有 {size/1024:.0f} KB，远低于最小阈值 {APK_MIN_BYTES/1024/1024:.0f} MB，"
              "基本可判定为空壳。")
        sys.exit(42)
    print(f"  [OK] 结构校验通过（ZIP 合法 / 关键条目齐全 / {size/1024/1024:.1f}MB ≥ 4MB 阈值）。")

    # ---- 版本号 & 命名 ----
    app_id = "com.starvalley.returntostar"
    pkg_json = ROOT / "package.json"
    ver = "0.1.0"
    try:
        m = re.search(r'"version"\s*:\s*"([^"]+)"', pkg_json.read_text(encoding="utf-8"))
        if m:
            ver = m.group(1)
    except OSError:
        pass
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dst = APK_DST_DIR / f"{app_id}-v{ver}-{stamp}.apk"
    APK_DST_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(APK_SRC, dst)
    print(f"  [OK] 已复制到：{dst}")

    # ---- 额外：复制一个 latest，发版/安装脚本方便 ----
    latest = APK_DST_DIR / "latest.apk"
    shutil.copy2(APK_SRC, latest)
    print(f"  [OK] latest 副本： {latest}")

    print("\n" + "=" * 60)
    print(f"✅ 打包成功！可交付 APK：")
    print(f"    {dst}")
    print(f"    （快捷路径：{latest}）")
    print("=" * 60)


def main() -> None:
    probe_environment()
    node_build()
    cap_sync()
    gradle_build()
    validate_apk()


if __name__ == "__main__":
    main()
