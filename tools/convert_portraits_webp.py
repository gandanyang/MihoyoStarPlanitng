#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P0 资产瘦身：portraits PNG → webp（quality 85），保留源 PNG 到 art_source/portraits_raw。

用法：
  python tools/convert_portraits_webp.py            # 转换 public/assets/portraits 下全部 PNG
  python tools/convert_portraits_webp.py --keep     # 转换后保留源（默认移动）
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "public" / "assets" / "portraits"
RAW_DIR = ROOT / "art_source" / "portraits_raw"


def convert(keep: bool) -> list[tuple[str, int, int]]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    results: list[tuple[str, int, int]] = []
    for png in sorted(SRC_DIR.glob("*.png")):
        webp = png.with_suffix(".webp")
        img = Image.open(png).convert("RGBA")
        img.save(webp, "WEBP", quality=85, method=6)
        before = png.stat().st_size
        after = webp.stat().st_size
        if not keep:
            dest = RAW_DIR / png.name
            shutil.move(str(png), str(dest))
        results.append((png.stem, before, after))
    return results


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="转换后保留源 PNG（默认移动到 art_source/portraits_raw）")
    args = ap.parse_args()

    results = convert(args.keep)
    if not results:
        print("无 PNG 需要转换")
        return
    total_before = sum(b for _, b, _ in results)
    total_after = sum(a for _, _, a in results)
    print(f"转换 {len(results)} 张立绘: {total_before/1024/1024:.1f}MB → {total_after/1024/1024:.1f}MB")
    for name, b, a in results:
        print(f"  {name}: {b/1024:.0f}KB → {a/1024:.0f}KB")


if __name__ == "__main__":
    main()
