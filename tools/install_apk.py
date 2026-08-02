#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键安装 APK 到已连接的安卓手机，并启动归星物语。
- 优先使用 dist_apk/latest.apk（build_apk.py 产物）
- 否则回退到 android/app/build/outputs/apk/release/app-release.apk

功能：
  1. 探测 ADB（找不到就提示安装 Android Studio / 平台工具）
  2. 解析 adb devices，只允许一台设备连接（避免装错）
  3. 卸载旧版本 → 安装新版本 → 冷启动 → 前台 Activity 判活
  4. 出错时打印 stderr 末段（INSTALL_FAILED 常见原因）
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_APK_CANDIDATES = (
    ROOT / "dist_apk" / "latest.apk",
    ROOT / "android" / "app" / "build" / "outputs" / "apk" / "release" / "app-release.apk",
    ROOT / "android" / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk",
)
APP_ID = "com.starvalley.returntostar"
LAUNCH_ACTIVITY = f"{APP_ID}/.MainActivity"


def run(cmd: list[str], timeout: int = 180) -> subprocess.CompletedProcess[str]:
    print("\n▶", " ".join(str(x) for x in cmd))
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        errors="replace",
        timeout=timeout,
    )


def probe_adb() -> str:
    adb = shutil.which("adb")
    if not adb:
        print("[FATAL] 找不到 adb。请安装 Android Studio 的 SDK Platform-Tools，"
              "或把 Android SDK 的 platform-tools 目录加到 PATH。")
        sys.exit(2)
    print(f"  ADB: {adb}")
    return adb


def pick_device(adb: str) -> str:
    r = run([adb, "devices", "-l"])
    out = r.stdout.strip()
    print("  adb devices -l:")
    for line in out.splitlines():
        print("   ", line)
    # 解析 device 行（忽略 * daemon / List of devices 等头）
    devices = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[1] == "device":
            devices.append(parts[0])
    if not devices:
        print("[FATAL] 没有连接到任何安卓设备。请：")
        print("    1) USB 连接手机并开启 USB 调试")
        print("    2) 在手机上允许这台电脑调试（RSA 指纹弹窗点确定）")
        print("    3) 或 `adb kill-server && adb start-server` 重启 adb 服务")
        sys.exit(3)
    if len(devices) > 1:
        print(f"[FATAL] 检测到 {len(devices)} 台设备同时在线：{devices}。"
              "为避免装错，请拔到只剩一台后重试。")
        sys.exit(4)
    print(f"  目标设备：{devices[0]}")
    return devices[0]


def choose_apk(user_spec: Path | None) -> Path:
    candidates: list[Path] = ([user_spec] if user_spec else []) + list(DEFAULT_APK_CANDIDATES)
    for c in candidates:
        if c.exists() and c.stat().st_size >= 4 * 1024 * 1024:
            size = c.stat().st_size / (1024 * 1024)
            print(f"  选用 APK：{c}  ({size:.1f} MB)")
            return c
    print("[FATAL] 未找到可用 APK。")
    print("  请先运行 `python tools/build_apk.py`，或用 `--apk path/to/app.apk` 指定。")
    sys.exit(5)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apk", type=Path, help="指定 APK 文件（默认从 dist_apk/latest.apk 找）")
    parser.add_argument("--no-uninstall", action="store_true", help="不先卸载，直接覆盖安装（保留存档）")
    parser.add_argument("--no-launch", action="store_true", help="不自动启动")
    args = parser.parse_args()

    print("=" * 60)
    print("归星物语 ADB 一键安装 + 启动")
    print("=" * 60)

    adb = probe_adb()
    dev = pick_device(adb)
    apk = choose_apk(args.apk)

    # 可选：卸载（默认卸载，保证干净；如果要保留存档传 --no-uninstall）
    if not args.no_uninstall:
        print("\n▶ 卸载旧版本")
        r = run([adb, "-s", dev, "uninstall", APP_ID])
        # 卸载返回 -1 通常代表“本来就没装过”，不是致命错误
        if r.returncode != 0 and "Unknown package" not in (r.stdout + r.stderr):
            print("  warn: uninstall non-zero，可能本来就没装过；继续安装。")
        else:
            print("  OK.")

    # 安装
    print("\n▶ 安装 APK（首次比较慢，10~90 秒都正常）")
    r = run([adb, "-s", dev, "install", "-r", str(apk)], timeout=300)
    combined = (r.stdout + r.stderr)
    tail_lines = combined.strip().splitlines()[-8:]
    for line in tail_lines:
        print("   ", line)
    if r.returncode != 0 or "Success" not in combined:
        # 兜底常见错误：INSTALL_FAILED_UPDATE_INCOMPATIBLE（签名不一致）
        if "INSTALL_FAILED_UPDATE_INCOMPATIBLE" in combined:
            print("\n  !!! 签名冲突：手机上已有不同签名的旧版本。先手动卸载旧 app 再试。")
        elif "INSTALL_PARSE_FAILED_NOT_APK" in combined or "no AndroidManifest" in combined:
            print("\n  !!! APK 损坏 / 假包，重新跑 build_apk.py。")
        sys.exit(10)
    print("  安装成功 ✅")

    if args.no_launch:
        print("\nDone（不自动启动）。")
        return

    # 启动
    print("\n▶ 启动主 Activity")
    r = run([adb, "-s", dev, "shell", "am", "start", "-n", LAUNCH_ACTIVITY])
    for line in (r.stdout + r.stderr).strip().splitlines()[-4:]:
        print("   ", line)
    if r.returncode != 0:
        print("[FAIL] 启动失败。MainActivity 名字对不对？AndroidManifest.xml 里 package 是什么？")
        sys.exit(11)

    # 判活：等待前台 Activity 是本包
    print("\n▶ 等待 3 秒后，检查前台 Activity 是否是目标包")
    time.sleep(3)
    r = run([adb, "-s", dev, "shell", "dumpsys", "window", "windows"])
    if APP_ID in (r.stdout + r.stderr):
        print(f"  ✅ {APP_ID} 已在前台。判活 OK。")
    else:
        print("  warn: dumpsys 没看到本包在前台，可能动画没走完 / 启动慢 / 崩溃了。")
        print("  （如果刚看到标题画面就秒退，多半是 webview 资源或签名问题，"
              "可以 adb logcat -s AndroidRuntime:* 抓崩溃栈。）")

    print("\n全部完成。")


if __name__ == "__main__":
    main()
