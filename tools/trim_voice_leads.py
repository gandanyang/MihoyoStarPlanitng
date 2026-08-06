#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
语音开头回声修剪工具（VoxCPM prompt-echo 伪影修复，2026-08-06 夏雅换声线发现）。

现象：VoxCPM 生成的每句开头都混入参考音 prompt 文本的回声（约 0.83~0.93s）+ 静音，
正题在其后。本工具在第一个静音结束处切割，去掉回声段，保留正题。

用法：
  python tools/trim_voice_leads.py --dir public/audio/voice/xiya --dry-run
  python tools/trim_voice_leads.py --dir public/audio/voice/xiya
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

FF = r"E:\BINGdown\VoxCPM\src\ffmpeg\bin\ffmpeg.exe"
MIN_SIL_DUR = 0.30        # 静音阈值（秒）
ECHO_WINDOW = (0.5, 1.6)  # 回声段起止安全窗口：首个静音起点应在此区间
SIL_AFTER = 0.25          # 切点保留的尾静音（秒），防止正题被多切


def first_silence(path: Path) -> tuple[float | None, float | None]:
    """返回 (首个静音起点, 首个静音时长)。"""
    cmd = [FF, "-i", str(path), "-af", "silencedetect=noise=-35dB:d=0.3",
           "-f", "null", "-"]
    proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    start = None
    dur = None
    for line in proc.stderr.splitlines():
        if start is None:
            m = re.search(r"silence_start: ([\d.]+)", line)
            if m:
                start = float(m.group(1))
        m2 = re.search(r"silence_duration: ([\d.]+)", line)
        if m2 and start is not None:
            dur = float(m2.group(1))
            break
    return start, dur


def last_speech_end(path: Path) -> float | None:
    """最后一个静音起点（其前的语音段是最后一段语音）→ 尾静音起点。"""
    cmd = [FF, "-i", str(path), "-af", "silencedetect=noise=-35dB:d=0.3",
           "-f", "null", "-"]
    proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    starts = [float(m.group(1)) for m in
              re.finditer(r"silence_start: ([\d.]+)", proc.stderr)]
    return starts[-1] if starts else None


def get_duration(path: Path) -> float:
    """返回音频总时长（秒）。"""
    cmd = [FF, "-i", str(path), "-f", "null", "-"]
    proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", proc.stderr)
    if not m:
        return 0.0
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def trim_lead(path: Path, dry_run: bool) -> tuple[bool, str]:
    start, dur = first_silence(path)
    if start is None or dur is None or dur < MIN_SIL_DUR:
        return False, "无首静音或过短，跳过"
    if not (ECHO_WINDOW[0] <= start <= ECHO_WINDOW[1]):
        return False, f"首静音起点 {start:.2f}s 不在回声窗口内，跳过"
    cut = start + dur  # 回声段 + 静音全部切除，正题从 0 开始
    if dry_run:
        return True, f"将切除 [0,{cut:.2f}s)（回声 {start:.2f}s + 静音 {dur:.2f}s）"
    tmp = path.with_suffix(".trim.wav")
    cmd = [FF, "-y", "-i", str(path), "-ss", f"{cut:.3f}", "-c:a", "pcm_s16le",
           str(tmp)]
    rc = subprocess.run(cmd, capture_output=True, text=True,
                        errors="replace").returncode
    if rc != 0 or not tmp.exists() or tmp.stat().st_size < 8 * 1024:
        tmp.unlink(missing_ok=True)
        return False, f"ffmpeg 失败 rc={rc}"
    path.unlink()
    tmp.rename(path)
    return True, f"已切除 [0,{cut:.2f}s)（回声 {start:.2f}s + 静音 {dur:.2f}s）"


def trim_tail(path: Path, dry_run: bool) -> tuple[bool, str]:
    """收掉尾部过长静音（留 0.25s）。

    保护：只有最后一个静音起点位于文件末 25% 内才裁剪，否则视为句中停顿跳过，
    防止把正题后半段误切（2026-08-06 重录后误伤修复）。
    """
    end = last_speech_end(path)
    if end is None:
        return False, "无静音信息，跳过"
    total = get_duration(path)
    if total <= 0 or end < total * 0.75:
        return False, f"末尾静音起点 {end:.2f}s 不在文件末 25%（总长 {total:.2f}s），跳过"
    if dry_run:
        return True, f"尾部静音起点 {end:.2f}s，将裁剪至 {end + SIL_AFTER:.2f}s"
    cut = end + SIL_AFTER
    tmp = path.with_suffix(".tail.wav")
    cmd = [FF, "-y", "-i", str(path), "-t", f"{cut:.3f}", "-c:a", "pcm_s16le",
           str(tmp)]
    rc = subprocess.run(cmd, capture_output=True, text=True,
                        errors="replace").returncode
    if rc != 0 or not tmp.exists() or tmp.stat().st_size < 8 * 1024:
        tmp.unlink(missing_ok=True)
        return False, f"ffmpeg 失败 rc={rc}"
    path.unlink()
    tmp.rename(path)
    return True, f"已裁剪至 {cut:.2f}s"


def main() -> None:
    p = argparse.ArgumentParser(description="切除 VoxCPM 开头回声 + 收尾静音")
    p.add_argument("--dir", required=True, help="wav 目录")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    files = sorted(Path(args.dir).glob("*.wav"))
    if not files:
        print(f"未找到 wav：{args.dir}")
        sys.exit(1)

    ok = 0
    for f in files:
        r1, note1 = trim_lead(f, args.dry_run)
        r2, note2 = trim_tail(f, args.dry_run)
        flag = "OK" if (r1 and r2) else "SKIP"
        print(f"[{flag}] {f.name}: {note1} | {note2}")
        ok += 1 if (r1 and r2) else 0
    print(f"完成：{ok}/{len(files)}")


if __name__ == "__main__":
    main()
