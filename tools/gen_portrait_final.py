# -*- coding: utf-8 -*-
"""
立绘后处理：去白底 → 透明 PNG → 512×768（供 StoryDialogue 对话头像使用）

输入（制作人选型，2026-08-02）：
  public/assets/portraits/src/linchen_s777001_cfg2.png  →  linchen.png
  public/assets/portraits/src/xiya.png                  →  xiya.png

说明（v0.4.3 修订）：立绘保留原背景，以圆角卡片形式展示——去背会损伤发丝/肩部边缘，且背景本身有艺术价值。
本脚本只做：缩放至 512×768（RGBA，供 UI object-fit: cover 裁切）。
运行：python tools/gen_portrait_final.py
"""

import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "public", "assets", "portraits", "src")
OUT_DIR = os.path.join(ROOT, "public", "assets", "portraits")

TARGET = (512, 768)

JOBS = [
    ("linchen_s777001_cfg2.png", "linchen.png"),
    ("xiya.png", "xiya.png"),
    ("elder_s202608021.png", "elder.png"),
]


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for src_name, out_name in JOBS:
        src_path = os.path.join(SRC_DIR, src_name)
        out_path = os.path.join(OUT_DIR, out_name)
        if not os.path.exists(src_path):
            print(f"[skip] 缺少输入: {src_path}")
            continue
        img = Image.open(src_path).convert("RGBA")
        img = img.resize(TARGET, Image.LANCZOS)
        img.save(out_path, "PNG")
        print(f"[OK] {src_name} → {out_name} ({img.size[0]}x{img.size[1]} RGBA)")


if __name__ == "__main__":
    main()
