#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键打包归星物语 APK（Windows 优先，跨平台降级）。

流程（默认 variant=release，可 --variant debug/release/both）：
  1. 环境探测（node / npm / java / android\gradlew.bat）
  2. npm run build                → dist/
  3. npx cap sync android         → android/app/src/main/assets/public/
  4. gradlew.bat :app:assemble<Debug/Release/Both>
       产物位于 android/app/build/outputs/apk/<variant>/app-<variant>.apk
       ——  即你指出的 android/app/build/outputs/apk 下两个子目录（debug / release）
  5. zipfile 校验每个 variant 的 APK 结构（AndroidManifest / classes.dex / resources.arsc + ≥4MB）
  6. （可选，--archive）复制归档到 dist_apk/ 做时间戳备份

全程无交互，失败直接非零退出。
"""

from __future__ import annotations

import argparse
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
# Gradle 原生输出根目录（android/app/build/outputs/apk）
# 子目录结构：
#   apk/debug/app-debug.apk
#   apk/release/app-release.apk
APK_OUT_ROOT = ANDROID_DIR / "app" / "build" / "outputs" / "apk"
APK_DST_DIR = ROOT / "dist_apk"  # 仅 --archive 时使用

APK_MIN_BYTES = 4 * 1024 * 1024  # 4MB，小于这个基本是坏包
APK_MANDATORY_ENTRIES = (
    "AndroidManifest.xml",
    "classes.dex",
    "resources.arsc",
)

# 运行时注入的 env（用于自动找到 Android Studio 自带的 JBR / SDK）
_BUILD_ENV: dict[str, str] = {}


def apk_path(variant: str) -> Path:
    """Gradle 原生输出路径（apk/<variant>/app-<variant>.apk）"""
    return APK_OUT_ROOT / variant / f"app-{variant}.apk"


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
    # 只打印尾部 40 行 stdout/stderr，避免刷屏
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

    # Java：先看 PATH / JAVA_HOME；再去常见 Android Studio / 绿色包安装目录挖 JBR
    java_home: Path | None = None
    if os.environ.get("JAVA_HOME"):
        java_home = Path(os.environ["JAVA_HOME"])
    java_exe = shutil.which("java")
    if not java_exe or not java_home:
        jbr_candidates: list[Path] = []
        if sys.platform == "win32":
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
    print(f"  APK 输出目录：{APK_OUT_ROOT}（debug/ release/ 两个子目录）")

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


def gradle_build(variants: list[str]) -> None:
    tasks = [f":app:assemble{v.capitalize()}" for v in variants]
    log(f"第 3/4 步：gradlew {' '.join(tasks)}（Gradle 打包 APK → {APK_OUT_ROOT}/<variant>/）")

    if sys.platform == "win32":
        cmd = [str(GRADLEW), *tasks, "--console=plain", "--stacktrace"]
    else:
        cmd = ["bash", str(GRADLEW), *tasks, "--console=plain", "--stacktrace"]
    result = run(cmd, cwd=ANDROID_DIR, label="gradlew " + " ".join(tasks))
    if result.returncode != 0:
        low = (result.stdout + result.stderr).lower()
        tips = []
        if "sdk" in low and ("not found" in low or "location" in low):
            tips.append("未找到 Android SDK → 请设置环境变量 ANDROID_SDK_ROOT，"
                        "或在 android/local.properties 里写 sdk.dir=路径")
        if "jdk" in low or "java version" in low or "class file" in low:
            tips.append("Java 版本不匹配（Capacitor 8 推荐 JDK 17 或 21 LTS）")
        if tips:
            print("\n  可能的原因：\n   - " + "\n   - ".join(tips))
        print(f"\n[FAIL] Gradle {' / '.join(tasks)} 失败。上面 stderr 最后几十行通常就是根因。")
        sys.exit(30)

    for v in variants:
        p = apk_path(v)
        if not p.exists():
            print(f"[FAIL] Gradle 返回 0，但 {p} 不存在？")
            sys.exit(31)
        size_mb = p.stat().st_size / (1024 * 1024)
        print(f"  [OK] {v} 产物大小 {size_mb:.1f} MB → {p}")


def validate_and_report(variants: list[str], do_archive: bool) -> None:
    log(f"第 4/4 步：APK 结构校验（输出目录：{APK_OUT_ROOT}）")

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

    all_ok = True
    archive_paths: list[Path] = []
    for v in variants:
        p = apk_path(v)
        print(f"\n— variant: {v}  →  {p}")
        try:
            with zipfile.ZipFile(p, "r") as zf:
                names = zf.namelist()
        except zipfile.BadZipFile as e:
            print(f"  [FAIL] APK 不是合法 ZIP：{e}")
            all_ok = False
            continue

        missing = [ent for ent in APK_MANDATORY_ENTRIES if ent not in names]
        if missing:
            print(f"  [FAIL] APK 缺关键条目：{missing}（可能是 aapt 失败 / 没签名 / 伪包）")
            all_ok = False
            continue

        size = p.stat().st_size
        if size < APK_MIN_BYTES:
            print(f"  [FAIL] APK 只有 {size/1024:.0f} KB，远低于最小阈值 {APK_MIN_BYTES/1024/1024:.0f} MB")
            all_ok = False
            continue
        print(f"  [OK] 结构校验通过（ZIP 合法 / 关键条目齐全 / {size/1024/1024:.1f}MB ≥ 4MB 阈值）。")

        if do_archive:
            APK_DST_DIR.mkdir(parents=True, exist_ok=True)
            dst = APK_DST_DIR / f"{app_id}-v{ver}-{stamp}-{v}.apk"
            shutil.copy2(p, dst)
            latest = APK_DST_DIR / f"latest-{v}.apk"
            shutil.copy2(p, latest)
            archive_paths.append(dst)
            print(f"  [ARCHIVE] 归档副本：{dst}  （latest：{latest}）")

    if not all_ok:
        sys.exit(43)

    print("\n" + "=" * 60)
    print(f"✅ 打包成功！{len(variants)} 个 variant 全部通过校验：")
    for v in variants:
        p = apk_path(v)
        size_mb = p.stat().st_size / (1024 * 1024)
        print(f"    {v:<7} → {p}   ({size_mb:.1f} MB)")
    if do_archive and archive_paths:
        print(f"\n  归档副本位于：{APK_DST_DIR}")
        for p in archive_paths:
            print(f"    - {p.name}")
    print("=" * 60)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="归星物语 一键 APK 打包（产物位于 android/app/build/outputs/apk 下的 debug / release 子目录）",
    )
    ap.add_argument(
        "--variant", choices=["debug", "release", "both"], default="release",
        help="打包版本：debug（未签名/快） / release（已签名，正式分发） / both（两个都打）。默认 release",
    )
    ap.add_argument(
        "--archive", action="store_true",
        help="额外复制时间戳归档到 dist_apk/（默认不复制，只用 Gradle 原生输出目录）",
    )
    ap.add_argument(
        "--skip-frontend", action="store_true",
        help="跳过 npm run build + npx cap sync（前端没改动时省时间）",
    )
    return ap.parse_args()


def main() -> None:
    args = parse_args()
    variants = ["debug", "release"] if args.variant == "both" else [args.variant]

    probe_environment()
    if not args.skip_frontend:
        node_build()
        cap_sync()
    else:
        print("\nℹ️  --skip-frontend：跳过前端 build + cap sync，直接跑 Gradle")
    gradle_build(variants)
    validate_and_report(variants, do_archive=args.archive)


if __name__ == "__main__":
    main()
