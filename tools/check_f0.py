#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
归星物语语音 F0 音高自检工具（任务卡 §三 强制项）。

用法：
  python tools/check_f0.py public/audio/voice/linche/station_04.wav
  python tools/check_f0.py public/audio/voice --role male   # 男声判定 [70,180]
  python tools/check_f0.py public/audio/voice --role female # 女声判定 [170,320]

流程：ffmpeg 转 16kHz mono wav → stdlib wave 读取 → 分帧归一化自相关估计 F0 → 输出中位 F0。
纯 stdlib（仅依赖外部 ffmpeg），不依赖 numpy。

判定区间（任务卡 §三）：
  男声（林澈/村长/爷爷/HR）：中位 F0 ∈ [70, 180] Hz，>180 判定漂移
  女声（夏雅/神秘少女）：中位 F0 ∈ [170, 320] Hz，<170 判定漂移
"""

from __future__ import annotations

import argparse
import math
import os
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

# ========================= 常量 =========================
DEFAULT_FFMPEG = r"E:\BINGdown\VoxCPM\src\ffmpeg\bin\ffmpeg.exe"
SAMPLE_RATE = 16000
FRAME_LEN = 512          # 32ms @16k
FRAME_STEP = 256         # 16ms 步进
F0_MIN = 60.0            # 60 Hz
F0_MAX = 400.0           # 400 Hz
MAX_DURATION_S = 30.0    # 只分析前 30s，控制耗时

MALE_RANGE = (70.0, 180.0)
FEMALE_RANGE = (170.0, 320.0)


def err(msg: str) -> None:
    print(f"❌ {msg}", file=sys.stderr)


def warn(msg: str) -> None:
    print(f"⚠️  {msg}")


def load_audio_wav(path: Path, ffmpeg: str) -> bytes | None:
    """ffmpeg 转 16k mono s16le wav，返回 wav 字节（含 44 字节头）。失败返回 None。"""
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    try:
        cmd = [ffmpeg, "-y", "-i", str(path),
               "-ar", str(SAMPLE_RATE), "-ac", "1", "-acodec", "pcm_s16le",
               str(tmp.name)]
        proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
        if proc.returncode != 0:
            err(f"ffmpeg 转换失败（{path.name}）：{proc.stderr[-400:]}")
            return None
        data = Path(tmp.name).read_bytes()
        if len(data) < 44:
            err(f"转换产物过小（{path.name}）：{len(data)} bytes")
            return None
        return data
    finally:
        try:
            Path(tmp.name).unlink(missing_ok=True)
        except Exception:
            pass


def read_samples(wav_bytes: bytes) -> tuple[int, list[int]]:
    """从 wav 字节读 (采样率, int16 采样列表)。"""
    with wave.open(__import__("io").BytesIO(wav_bytes), "rb") as w:
        sr = w.getframerate()
        n = w.getnframes()
        raw = w.readframes(n)
    samples = []
    for i in range(0, len(raw) - 1, 2):
        s = int.from_bytes(raw[i:i + 2], "little", signed=True)
        samples.append(s)
    return sr, samples


def frame_f0(samples: list[int], start: int, length: int) -> float | None:
    """单帧归一化自相关求 F0。无声/清音返回 None。"""
    frame = samples[start:start + length]
    n = len(frame)
    if n < 32:
        return None
    energy = sum(x * x for x in frame)
    if energy < 1e6:  # 静音阈值
        return None

    lag_min = int(SAMPLE_RATE / F0_MAX)
    lag_max = int(SAMPLE_RATE / F0_MIN)
    if lag_max >= n:
        lag_max = n - 1

    best_lag = -1
    best_norm = 0.0
    # 为控制耗时，先粗扫再细扫
    coarse = max(1, (lag_max - lag_min) // 90)
    for lag in range(lag_min, lag_max, coarse):
        ac = sum(frame[i] * frame[i + lag] for i in range(n - lag))
        norm = ac / (energy + 1e-6)
        if norm > best_norm:
            best_norm = norm
            best_lag = lag
    if best_lag <= 0:
        return None
    fine_low = max(lag_min, best_lag - coarse)
    fine_high = min(lag_max, best_lag + coarse)
    for lag in range(fine_low, fine_high + 1):
        ac = sum(frame[i] * frame[i + lag] for i in range(n - lag))
        norm = ac / (energy + 1e-6)
        if norm > best_norm:
            best_norm = norm
            best_lag = lag
    if best_norm < 0.25:  # 非周期性（清音）
        return None
    return SAMPLE_RATE / best_lag


def median(values: list[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    m = len(s) // 2
    if len(s) % 2 == 1:
        return s[m]
    return (s[m - 1] + s[m]) / 2.0


def compute_median_f0(path: Path, ffmpeg: str) -> float | None:
    """计算中位 F0。失败返回 None。"""
    wav = load_audio_wav(path, ffmpeg)
    if wav is None:
        return None
    sr, samples = read_samples(wav)
    if sr != SAMPLE_RATE:
        warn(f"采样率不是 16k（{path.name}，{sr}Hz），结果可能不准")
    # 截断到前 MAX_DURATION_S
    max_samples = min(len(samples), int(SAMPLE_RATE * MAX_DURATION_S))
    samples = samples[:max_samples]

    f0s: list[float] = []
    start = 0
    while start + FRAME_LEN <= len(samples):
        f = frame_f0(samples, start, FRAME_LEN)
        if f is not None:
            f0s.append(f)
        start += FRAME_STEP
    if not f0s:
        warn(f"未检测到有声段（{path.name}）")
        return None
    return median(f0s)


def classify(f0: float, role: str) -> tuple[bool, str]:
    """返回 (是否达标, 判定说明)。"""
    if role == "female":
        lo, hi = FEMALE_RANGE
        ok = lo <= f0 <= hi
        drift = "漂移" if (f0 < lo or f0 > hi) else "达标"
        return ok, f"女声 [{lo:.0f},{hi:.0f}]Hz → 中位F0={f0:.1f}Hz（{drift}）"
    lo, hi = MALE_RANGE
    ok = lo <= f0 <= hi
    drift = "漂移" if (f0 < lo or f0 > hi) else "达标"
    return ok, f"男声 [{lo:.0f},{hi:.0f}]Hz → 中位F0={f0:.1f}Hz（{drift}）"


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="语音 F0 音高自检（ffmpeg + 自相关）")
    p.add_argument("target", help="音频文件或目录")
    p.add_argument("--role", choices=["male", "female"], default="male",
                   help="判定角色性别（male=男[70,180]，female=女[170,320]）")
    p.add_argument("--ffmpeg", default=DEFAULT_FFMPEG, help="ffmpeg 路径")
    p.add_argument("--summary-only", action="store_true",
                   help="目录模式下只输出漂移清单与统计")
    args = p.parse_args(argv)

    target = Path(args.target)
    if not target.exists():
        err(f"路径不存在：{target}")
        sys.exit(1)

    files: list[Path] = []
    if target.is_file():
        files = [target]
    else:
        for ext in ("*.wav", "*.mp3"):
            files.extend(sorted(target.glob(ext)))

    if not files:
        err(f"未找到音频文件：{target}")
        sys.exit(2)

    results: list[tuple[Path, float | None, bool, str]] = []
    for f in files:
        f0 = compute_median_f0(f, args.ffmpeg)
        if f0 is None:
            results.append((f, None, False, "未检测到 F0"))
            continue
        ok, desc = classify(f0, args.role)
        results.append((f, f0, ok, desc))

    print()
    print("════════ F0 自检结果 ════════")
    passed = 0
    for path, f0, ok, desc in results:
        mark = "✅" if ok else "❌"
        f0s = f"{f0:.1f}Hz" if f0 else "—"
        if args.summary_only and ok:
            continue
        print(f"{mark} {path.name}: {f0s}  {desc}")
        if ok:
            passed += 1
    print("──────────────────────────────")
    bad = [r for r in results if not r[2]]
    print(f"总计 {len(results)} 个文件，达标 {len(results) - len(bad)}，漂移/异常 {len(bad)}")
    if bad:
        print("漂移/异常清单：")
        for path, f0, ok, desc in bad:
            print(f"  ❌ {path}")
    sys.exit(0 if not bad else 3)


if __name__ == "__main__":
    main()
