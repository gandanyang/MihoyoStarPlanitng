#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P0 资产瘦身：voice_normalized wav → ogg（q5，Web Audio 可解码），保留 wav 源到 art_source。

用法：
  python tools/convert_voice_ogg.py            # 转换全部 wav 为 ogg，wav 移到 art_source
  python tools/convert_voice_ogg.py --keep     # 转换后保留 wav（默认移动）
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "public" / "audio" / "voice_normalized"
RAW_DIR = ROOT / "art_source" / "audio" / "voice_normalized_src"
FFMPEG = "ffmpeg"


def convert(keep: bool) -> list[tuple[str, int, int]]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    results: list[tuple[str, int, int]] = []
    for wav in sorted(SRC_DIR.rglob("*.wav")):
        ogg = wav.with_suffix(".ogg")
        if ogg.exists():
            continue
        subprocess.run(
            [FFMPEG, "-y", "-i", str(wav), "-c:a", "libvorbis", "-q:a", "5", str(ogg)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        before = wav.stat().st_size
        after = ogg.stat().st_size
        if not keep:
            rel = wav.relative_to(SRC_DIR)
            dest_dir = RAW_DIR / rel.parent
            dest_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(wav), str(dest_dir / wav.name))
        results.append((str(rel), before, after))
    return results


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="转换后保留 wav（默认移动到 art_source）")
    args = ap.parse_args()

    results = convert(args.keep)
    if not results:
        print("无 wav 需要转换")
        return
    total_before = sum(b for _, b, _ in results)
    total_after = sum(a for _, _, a in results)
    print(f"转换 {len(results)} 条语音: {total_before/1024/1024:.1f}MB → {total_after/1024/1024:.1f}MB")
    for name, b, a in results[:10]:
        print(f"  {name}: {b/1024:.0f}KB → {a/1024:.0f}KB")
    if len(results) > 10:
        print(f"  ... 其余 {len(results) - 10} 条")


if __name__ == "__main__":
    main()
